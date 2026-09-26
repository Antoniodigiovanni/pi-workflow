import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { loadToolPolicy } from "../../src/policy.ts";
import { chunkText, toolResult } from "../../src/text.ts";
import { createMlflowClient, MlflowClient } from "./client.ts";
import { assertMlflowMetadataAllowed } from "./policy.ts";

async function context(ctx: ExtensionContext): Promise<{ client: MlflowClient; policy: Awaited<ReturnType<typeof loadToolPolicy>> }> {
	const policy = await loadToolPolicy(ctx);
	assertMlflowMetadataAllowed(policy);
	return { policy, client: await createMlflowClient() };
}

const experimentId = Type.String({ minLength: 1, maxLength: 500, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" });
const runId = Type.String({ minLength: 1, maxLength: 500, pattern: "^[A-Za-z0-9][A-Za-z0-9._-]*$" });

export default function mlflowExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "mlflow_search_experiments",
		label: "Search approved MLflow experiments",
		description: "Read only the experiments whose exact IDs are allowlisted in workflow.yaml, then filter their names and tags locally.",
		parameters: Type.Object({ query: Type.Optional(Type.String({ maxLength: 200, default: "" })) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult({ experiments: await state.client.searchAllowedExperiments(state.policy, parameters.query, signal) });
		},
	});

	pi.registerTool({
		name: "mlflow_search_runs",
		label: "Search approved MLflow runs",
		description: "Read a bounded page of active runs from one exactly allowlisted experiment. No user-provided MLflow filter is executed.",
		parameters: Type.Object({ experimentId, limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 100, default: 50 })), pageToken: Type.Optional(Type.String({ minLength: 1, maxLength: 10_000 })) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult(await state.client.searchRuns(state.policy, parameters.experimentId, parameters.limit, parameters.pageToken, signal));
		},
	});

	pi.registerTool({
		name: "mlflow_get_run",
		label: "Get approved MLflow run",
		description: "Read run metadata, parameters, latest metrics, and tags, verifying that the returned run belongs to the allowlisted experiment.",
		parameters: Type.Object({ experimentId, runId }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult(await state.client.getRun(state.policy, parameters.experimentId, parameters.runId, signal));
		},
	});

	pi.registerTool({
		name: "mlflow_compare_runs",
		label: "Compare approved MLflow runs",
		description: "Read and align metadata for 2 to 20 runs in one approved experiment. Interpret differences with the committed experiment records.",
		parameters: Type.Object({ experimentId, runIds: Type.Array(runId, { minItems: 2, maxItems: 20 }) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult(await state.client.compareRuns(state.policy, parameters.experimentId, parameters.runIds, signal));
		},
	});

	pi.registerTool({
		name: "mlflow_list_artifacts",
		label: "List approved MLflow artifacts",
		description: "List only artifact files or directories that lead to exact paths approved in workflow.yaml. Artifact access is off by default.",
		parameters: Type.Object({ experimentId, runId, path: Type.Optional(Type.String({ maxLength: 1_000, default: "" })), pageToken: Type.Optional(Type.String({ minLength: 1, maxLength: 10_000 })) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult(await state.client.listArtifacts(state.policy, parameters.experimentId, parameters.runId, parameters.path, parameters.pageToken, signal));
		},
	});

	pi.registerTool({
		name: "mlflow_read_artifact",
		label: "Read approved MLflow text artifact",
		description: "Read one exact approved text/JSON path up to one megabyte through a documented MLflow presigned-download endpoint. Direct artifact_uri access is forbidden.",
		parameters: Type.Object({
			experimentId,
			runId,
			path: Type.String({ minLength: 1, maxLength: 1_000 }),
			offset: Type.Optional(Type.Integer({ minimum: 0, maximum: 1_000_000, default: 0 })),
			limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 20_000, default: 8_000 })),
		}),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			const text = await state.client.readArtifact(state.policy, parameters.experimentId, parameters.runId, parameters.path, signal);
			return toolResult({ experimentId: parameters.experimentId, runId: parameters.runId, path: parameters.path, ...chunkText(text, parameters.offset, parameters.limit) });
		},
	});
}

export { createMlflowClient, MlflowClient } from "./client.ts";
