import { loopbackUrl, requestJson, requestText, workspaceUrl } from "../../src/http.ts";
import type { WorkflowPolicy } from "../../src/policy.ts";
import { resolveDatabricksAuth } from "../databricks/auth.ts";
import { normalizeArtifact, normalizeExperiment, normalizeRun, responseArray, responseRecord, responseToken } from "./normalize.ts";
import { artifactVisible, assertArtifactAllowed, assertArtifactListPathAllowed, assertExperimentAllowed, assertMlflowMetadataAllowed, assertTextArtifact, normalizeArtifactPath } from "./policy.ts";
import type { MlflowArtifact, MlflowExperiment, MlflowPage, MlflowRun } from "./types.ts";

const SAFE_ID = /^[A-Za-z0-9][A-Za-z0-9._-]{0,499}$/;
const MAX_ARTIFACT_BYTES = 1_000_000;

function id(value: string, field: string): string {
	if (!SAFE_ID.test(value)) throw new Error(`${field} is malformed`);
	return value;
}

function trackingOrigin(value: string): URL {
	let candidate: URL;
	try { candidate = new URL(value); } catch { throw new Error("MLFLOW_TRACKING_URI is invalid"); }
	if (candidate.pathname !== "/") throw new Error("MLFLOW_TRACKING_URI must be an origin without a path");
	if (candidate.protocol === "http:") return loopbackUrl(value);
	const validated = workspaceUrl(value);
	return validated;
}

function downloadUrl(value: unknown): URL {
	if (typeof value !== "string" || value.length > 20_000) throw new Error("MLflow returned a malformed artifact download URL");
	let url: URL;
	try { url = new URL(value); } catch { throw new Error("MLflow returned a malformed artifact download URL"); }
	if (url.username || url.password || url.hash || (url.protocol !== "https:" && !(url.protocol === "http:" && ["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)))) {
		throw new Error("MLflow returned an unsupported artifact download URL");
	}
	return url;
}

function downloadHeaders(value: unknown): Record<string, string> {
	if (value === undefined || value === null) return {};
	const entries: Array<[string, unknown]> = Array.isArray(value)
		? value.map((entry): [string, unknown] => {
			const item = responseRecord(entry, "artifact download header");
			return [String(item.name ?? ""), item.value];
		})
		: Object.entries(responseRecord(value, "artifact download headers"));
	if (entries.length > 50) throw new Error("MLflow returned too many artifact download headers");
	const headers: Record<string, string> = {};
	for (const [name, raw] of entries) {
		if (!/^[A-Za-z0-9-]{1,100}$/.test(name) || typeof raw !== "string" || raw.length > 10_000) throw new Error("MLflow returned a malformed artifact download header");
		if (/^(authorization|cookie|host|proxy-authorization)$/i.test(name)) throw new Error("MLflow returned a forbidden artifact download header");
		headers[name] = raw;
	}
	return headers;
}

export interface MlflowClientOptions {
	token?: string;
	artifactDownloadMode?: "presigned";
	artifactAllowedOrigins?: string[];
}

export class MlflowClient {
	readonly base: URL;
	readonly artifactDownloadMode?: "presigned";
	readonly #token?: string;
	readonly #artifactAllowedOrigins: string[];

	constructor(base: string | URL, options: MlflowClientOptions = {}) {
		this.base = trackingOrigin(String(base));
		if (options.token !== undefined && (options.token.length < 8 || options.token.length > 100_000)) throw new Error("MLflow access token is malformed");
		this.#token = options.token;
		this.artifactDownloadMode = options.artifactDownloadMode;
		this.#artifactAllowedOrigins = (options.artifactAllowedOrigins ?? []).map(value => trackingOrigin(value).origin);
	}

	async #request(path: string, options: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
		if (!path.startsWith("/api/2.0/mlflow/") || path.includes("..")) throw new Error("Unsupported MLflow API path");
		const headers: Record<string, string> = { "Content-Type": "application/json" };
		if (this.#token) headers.Authorization = `Bearer ${this.#token}`;
		return requestJson(new URL(path, this.base), {
			method: options.method ?? "GET",
			headers,
			body: options.body === undefined ? undefined : JSON.stringify(options.body),
			signal: options.signal,
			maxBytes: 4_000_000,
			timeoutMs: 30_000,
		});
	}

	async getExperiment(policy: WorkflowPolicy, experimentId: string, signal?: AbortSignal): Promise<MlflowExperiment> {
		assertExperimentAllowed(policy, experimentId);
		const query = new URLSearchParams({ experiment_id: id(experimentId, "Experiment ID") });
		const response = responseRecord(await this.#request(`/api/2.0/mlflow/experiments/get?${query}`, { signal }), "experiment response");
		const experiment = normalizeExperiment(response.experiment, policy.mlflow.allowed_metadata_keys);
		if (experiment.experimentId !== experimentId) throw new Error("MLflow returned an unexpected experiment");
		return experiment;
	}

	async listAllowedExperiments(policy: WorkflowPolicy, signal?: AbortSignal): Promise<MlflowExperiment[]> {
		assertMlflowMetadataAllowed(policy);
		const experiments: MlflowExperiment[] = [];
		for (const experimentId of policy.mlflow.allowed_experiments.slice(0, 1_000)) {
			experiments.push(await this.getExperiment(policy, experimentId, signal));
		}
		return experiments;
	}

	async searchAllowedExperiments(policy: WorkflowPolicy, query = "", signal?: AbortSignal): Promise<MlflowExperiment[]> {
		if (query.length > 200) throw new Error("MLflow experiment query must be at most 200 characters");
		const experiments = await this.listAllowedExperiments(policy, signal);
		const needle = query.trim().toLocaleLowerCase();
		if (!needle) return experiments;
		return experiments.filter(experiment => `${experiment.name} ${experiment.tags.map(tag => `${tag.key} ${tag.value}`).join(" ")}`.toLocaleLowerCase().includes(needle));
	}

	async searchRuns(policy: WorkflowPolicy, experimentId: string, limit = 50, pageToken?: string, signal?: AbortSignal): Promise<MlflowPage<MlflowRun>> {
		assertExperimentAllowed(policy, experimentId);
		if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("MLflow run limit must be between 1 and 100");
		if (pageToken !== undefined && (!pageToken || pageToken.length > 10_000)) throw new Error("MLflow page token is malformed");
		const response = responseRecord(await this.#request("/api/2.0/mlflow/runs/search", {
			method: "POST",
			body: {
				experiment_ids: [id(experimentId, "Experiment ID")],
				run_view_type: "ACTIVE_ONLY",
				max_results: limit,
				order_by: ["attributes.start_time DESC"],
				...(pageToken ? { page_token: pageToken } : {}),
			},
			signal,
		}), "run search response");
		const items = responseArray(response.runs, "runs", 100).map(value => normalizeRun(value, policy.mlflow.allowed_metadata_keys, policy.data_policy.allow_aggregates));
		if (items.some(run => run.info.experimentId !== experimentId)) throw new Error("MLflow returned a run outside the requested experiment");
		return { items, nextPageToken: responseToken(response.next_page_token) };
	}

	async getRun(policy: WorkflowPolicy, experimentId: string, runId: string, signal?: AbortSignal): Promise<MlflowRun> {
		assertExperimentAllowed(policy, experimentId);
		const query = new URLSearchParams({ run_id: id(runId, "Run ID") });
		const response = responseRecord(await this.#request(`/api/2.0/mlflow/runs/get?${query}`, { signal }), "run response");
		const run = normalizeRun(response.run, policy.mlflow.allowed_metadata_keys, policy.data_policy.allow_aggregates);
		if (run.info.runId !== runId || run.info.experimentId !== experimentId) throw new Error("MLflow returned a run outside the requested experiment");
		return run;
	}

	async compareRuns(policy: WorkflowPolicy, experimentId: string, runIds: string[], signal?: AbortSignal): Promise<{ runs: MlflowRun[]; metricKeys: string[]; parameterKeys: string[] }> {
		assertExperimentAllowed(policy, experimentId);
		if (runIds.length < 2 || runIds.length > 20 || new Set(runIds).size !== runIds.length) throw new Error("Choose 2 to 20 distinct MLflow run IDs");
		const runs = await Promise.all(runIds.map(runId => this.getRun(policy, experimentId, runId, signal)));
		return {
			runs,
			metricKeys: [...new Set(runs.flatMap(run => run.data.metrics.map(metric => metric.key)))].sort(),
			parameterKeys: [...new Set(runs.flatMap(run => run.data.params.map(parameter => parameter.key)))].sort(),
		};
	}

	async listArtifacts(policy: WorkflowPolicy, experimentId: string, runId: string, path = "", pageToken?: string, signal?: AbortSignal): Promise<MlflowPage<MlflowArtifact> & { omittedOutsideAllowlist: number }> {
		assertExperimentAllowed(policy, experimentId);
		const scopedPath = assertArtifactListPathAllowed(policy, path);
		await this.getRun(policy, experimentId, runId, signal);
		const query = new URLSearchParams({ run_id: id(runId, "Run ID") });
		if (scopedPath) query.set("path", scopedPath);
		if (pageToken) query.set("page_token", pageToken);
		const response = responseRecord(await this.#request(`/api/2.0/mlflow/artifacts/list?${query}`, { signal }), "artifact list response");
		const all = responseArray(response.files, "artifacts", 1_000).map(normalizeArtifact);
		const items = all.filter(artifact => artifactVisible(policy, artifact.path, artifact.isDirectory));
		return { items, omittedOutsideAllowlist: all.length - items.length, nextPageToken: responseToken(response.next_page_token) };
	}

	async readArtifact(policy: WorkflowPolicy, experimentId: string, runId: string, path: string, signal?: AbortSignal): Promise<string> {
		assertExperimentAllowed(policy, experimentId);
		const approvedPath = assertArtifactAllowed(policy, path);
		assertTextArtifact(approvedPath);
		if (this.artifactDownloadMode !== "presigned") {
			throw new Error("Artifact content download is unavailable for this tracking server; enable presigned mode only for a server that documents the MLflow endpoint");
		}
		const parentPath = approvedPath.split("/").slice(0, -1).join("/");
		const listing = await this.listArtifacts(policy, experimentId, runId, parentPath, undefined, signal);
		const artifact = listing.items.find(item => item.path === approvedPath && !item.isDirectory);
		if (!artifact) throw new Error("Approved MLflow artifact was not found as a file");
		if (artifact.fileSize === undefined || artifact.fileSize > MAX_ARTIFACT_BYTES) throw new Error("MLflow artifact size is missing or exceeds the one-megabyte read limit");
		const response = responseRecord(await this.#request("/api/2.0/mlflow/artifacts/presigned-download-url", {
			method: "POST",
			body: { run_id: id(runId, "Run ID"), path: approvedPath, expiration: 300 },
			signal,
		}), "artifact download response");
		if (response.file_size !== undefined && (typeof response.file_size !== "number" || !Number.isSafeInteger(response.file_size) || response.file_size < 0 || response.file_size > MAX_ARTIFACT_BYTES)) {
			throw new Error("MLflow artifact download size exceeds the one-megabyte read limit");
		}
		const target = downloadUrl(response.presigned_url);
		if (!this.#artifactAllowedOrigins.includes(target.origin)) throw new Error("MLflow artifact download origin is not explicitly approved; configure MLFLOW_ARTIFACT_ALLOWED_ORIGINS");
		return requestText(target, { method: "GET", headers: downloadHeaders(response.headers), signal, maxBytes: MAX_ARTIFACT_BYTES, timeoutMs: 30_000 });
	}
}

export async function createMlflowClient(environment: NodeJS.ProcessEnv = process.env): Promise<MlflowClient> {
	const mode = environment.MLFLOW_ARTIFACT_DOWNLOAD_MODE;
	const artifactAllowedOrigins = environment.MLFLOW_ARTIFACT_ALLOWED_ORIGINS?.split(",").map(value => value.trim()).filter(Boolean);
	if (mode !== undefined && mode !== "presigned") throw new Error("MLFLOW_ARTIFACT_DOWNLOAD_MODE must be presigned when set");
	if (environment.MLFLOW_TRACKING_URI) {
		return new MlflowClient(environment.MLFLOW_TRACKING_URI, { token: environment.MLFLOW_TRACKING_TOKEN, artifactDownloadMode: mode, artifactAllowedOrigins });
	}
	const auth = await resolveDatabricksAuth(environment);
	return new MlflowClient(auth.host, { token: auth.token, artifactDownloadMode: mode, artifactAllowedOrigins });
}
