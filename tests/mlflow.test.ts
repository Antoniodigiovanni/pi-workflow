import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import test from "node:test";
import { MlflowClient } from "../extensions/mlflow/client.ts";
import { parsePolicy } from "../src/policy.ts";

const policySource = `project:
  type: internal
mlflow:
  enabled: true
  allowed_experiments: [exp-1]
  allowed_metadata_keys: [model, fixture]
  allow_artifacts: true
  allowed_artifact_paths: [reports/summary.json]
`;

function json(res: ServerResponse, body: unknown, status = 200): void {
	const source = JSON.stringify(body);
	res.writeHead(status, { "content-type": "application/json", "content-length": Buffer.byteLength(source) });
	res.end(source);
}

async function body(req: IncomingMessage): Promise<Record<string, unknown>> {
	const chunks: Buffer[] = [];
	for await (const chunk of req) chunks.push(Buffer.from(chunk));
	return JSON.parse(Buffer.concat(chunks).toString("utf8")) as Record<string, unknown>;
}

async function server(handler: (req: IncomingMessage, res: ServerResponse) => Promise<void> | void): Promise<{ root: URL; close: () => Promise<void> }> {
	const instance = createServer((req, res) => void Promise.resolve(handler(req, res)).catch(() => json(res, {}, 500)));
	instance.listen(0, "127.0.0.1");
	await once(instance, "listening");
	const address = instance.address();
	if (!address || typeof address === "string") throw new Error("Mock server did not bind");
	return { root: new URL(`http://127.0.0.1:${address.port}/`), close: async () => { instance.close(); await once(instance, "close"); } };
}

function experiment(id = "exp-1"): unknown {
	return { experiment_id: id, name: "Synthetic experiment", lifecycle_stage: "active", tags: [{ key: "fixture", value: "synthetic" }] };
}

function run(id: string, experimentId = "exp-1", metric = 0.5): unknown {
	return {
		info: { run_id: id, experiment_id: experimentId, run_name: `Synthetic ${id}`, status: "FINISHED", artifact_uri: "dbfs:/not-followed" },
		data: { metrics: [{ key: "loss", value: metric, timestamp: 1, step: 1 }], params: [{ key: "model", value: "baseline" }], tags: [{ key: "fixture", value: "synthetic" }] },
	};
}

test("MLflow reads only allowlisted experiments and runs with fixed search structure", async () => {
	const seen: string[] = [];
	const mock = await server(async (req, res) => {
		seen.push(`${req.method} ${req.url}`);
		assert.equal(req.headers.authorization, "Bearer test-token");
		if (req.url?.startsWith("/api/2.0/mlflow/experiments/get?")) return json(res, { experiment: experiment() });
		if (req.url === "/api/2.0/mlflow/runs/search") {
			const request = await body(req);
			assert.deepEqual(request.experiment_ids, ["exp-1"]);
			assert.equal(request.filter, undefined);
			assert.deepEqual(request.order_by, ["attributes.start_time DESC"]);
			return json(res, { runs: [run("run-a")], next_page_token: "next" });
		}
		return json(res, { run: run(req.url?.includes("run-b") ? "run-b" : "run-a", "exp-1", req.url?.includes("run-b") ? 0.4 : 0.5) });
	});
	try {
		const client = new MlflowClient(mock.root, { token: "test-token" });
		const policy = parsePolicy(policySource);
		assert.equal((await client.listAllowedExperiments(policy))[0]?.experimentId, "exp-1");
		assert.equal((await client.searchAllowedExperiments(policy, "synthetic"))[0]?.experimentId, "exp-1");
		assert.deepEqual(await client.searchAllowedExperiments(policy, "absent"), []);
		const page = await client.searchRuns(policy, "exp-1", 20);
		assert.equal(page.items[0]?.info.runId, "run-a");
		assert.equal(page.nextPageToken, "next");
		const comparison = await client.compareRuns(policy, "exp-1", ["run-a", "run-b"]);
		assert.deepEqual(comparison.metricKeys, ["loss"]);
		assert.deepEqual(comparison.parameterKeys, ["model"]);
		const before = seen.length;
		await assert.rejects(client.searchRuns(policy, "exp-secret"), /outside the exact project allowlist/);
		assert.equal(seen.length, before);
	} finally { await mock.close(); }
});

test("MLflow rejects a returned run from another experiment", async () => {
	const mock = await server((_req, res) => json(res, { run: run("run-a", "exp-secret") }));
	try {
		await assert.rejects(new MlflowClient(mock.root).getRun(parsePolicy(policySource), "exp-1", "run-a"), /outside the requested experiment/);
	} finally { await mock.close(); }
});

test("MLflow artifact listing hides unapproved names and content read is path, type, and size gated", async () => {
	const mock = await server(async (req, res) => {
		if (req.url?.startsWith("/api/2.0/mlflow/runs/get?")) return json(res, { run: run("run-a") });
		if (req.url?.startsWith("/api/2.0/mlflow/artifacts/list?")) {
			assert.match(req.url, /path=reports/);
			return json(res, { files: [
				{ path: "reports/summary.json", is_dir: false, file_size: 32 },
				{ path: "reports/private.csv", is_dir: false, file_size: 20 },
			] });
		}
		if (req.url === "/api/2.0/mlflow/artifacts/presigned-download-url") {
			const request = await body(req);
			assert.deepEqual(request, { run_id: "run-a", path: "reports/summary.json", expiration: 300 });
			return json(res, { presigned_url: new URL("download?signature=synthetic", mock.root).toString(), headers: [{ name: "x-fixture", value: "synthetic" }], file_size: 32 });
		}
		if (req.url?.startsWith("/download?")) {
			assert.equal(req.headers.authorization, undefined);
			assert.equal(req.headers["x-fixture"], "synthetic");
			res.writeHead(200, { "content-type": "application/json" });
			res.end('{"metric":"synthetic"}');
			return;
		}
		json(res, {}, 404);
	});
	try {
		const client = new MlflowClient(mock.root, { artifactDownloadMode: "presigned", artifactAllowedOrigins: [mock.root.origin] });
		const policy = parsePolicy(policySource);
		const listing = await client.listArtifacts(policy, "exp-1", "run-a", "reports");
		assert.deepEqual(listing.items.map(item => item.path), ["reports/summary.json"]);
		assert.equal(listing.omittedOutsideAllowlist, 1);
		assert.equal(await client.readArtifact(policy, "exp-1", "run-a", "reports/summary.json"), '{"metric":"synthetic"}');
		await assert.rejects(client.readArtifact(policy, "exp-1", "run-a", "reports/private.csv"), /outside the exact project allowlist/);
		await assert.rejects(client.readArtifact(policy, "exp-1", "run-a", "reports\/summary.exe"), /outside the exact project allowlist|Only approved/);
	} finally { await mock.close(); }
});

test("MLflow artifact content stays disabled without policy and explicit server capability", async () => {
	const noArtifacts = parsePolicy(policySource.replace("allow_artifacts: true", "allow_artifacts: false"));
	const mock = await server((_req, res) => json(res, { run: run("run-a") }));
	try {
		const client = new MlflowClient(mock.root);
		await assert.rejects(client.listArtifacts(noArtifacts, "exp-1", "run-a"), /disabled by workflow.yaml/);
		await assert.rejects(client.readArtifact(parsePolicy(policySource), "exp-1", "run-a", "reports/summary.json"), /presigned mode/);
	} finally { await mock.close(); }
});

test("MLflow artifact downloads reject unapproved origins, credentials, oversized files and traversal", async () => {
	let mode = "origin";
	let downloads = 0;
	const mock = await server(async (req, res) => {
		if (req.url?.startsWith("/api/2.0/mlflow/runs/get?")) return json(res, {run:run("run-a")});
		if (req.url?.startsWith("/api/2.0/mlflow/artifacts/list?")) return json(res, {files:[{path:"reports/summary.json",is_dir:false,file_size: mode === "size" ? 1_000_001 : 32}]});
		if (req.url === "/api/2.0/mlflow/artifacts/presigned-download-url") {
			await body(req);
			return json(res, {presigned_url: mode === "origin" ? "http://127.0.0.1:1/private" : new URL("download",mock.root).href, headers: mode === "header" ? [{name:"Authorization",value:"secret"}] : []});
		}
		downloads++;
		if (mode === "redirect") { res.writeHead(302,{Location:"/other"}); res.end(); return; }
		res.end("x".repeat(1_000_001));
	});
	try {
		const policy = parsePolicy(policySource);
		const client = new MlflowClient(mock.root,{artifactDownloadMode:"presigned",artifactAllowedOrigins:[mock.root.origin]});
		for (const [scenario, pattern] of [["origin",/origin is not explicitly approved/],["header",/forbidden.*header/],["size",/size.*limit/]] as const) {
			mode = scenario;
			await assert.rejects(client.readArtifact(policy,"exp-1","run-a","reports/summary.json"),pattern);
		}
		assert.equal(downloads,0);
		for (const path of ["../reports/summary.json","reports/../summary.json","/reports/summary.json","reports//summary.json"]) await assert.rejects(client.readArtifact(policy,"exp-1","run-a",path),/path|traversal/);
		mode = "redirect";
		await assert.rejects(client.readArtifact(policy,"exp-1","run-a","reports/summary.json"),/failed/);
		assert.equal(downloads,1, "redirect target must not be contacted");
		mode = "body";
		await assert.rejects(client.readArtifact(policy,"exp-1","run-a","reports/summary.json"),/byte limit|bounds/);
	} finally { await mock.close(); }
});
