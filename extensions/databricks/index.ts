import type { ExtensionAPI, ExtensionContext } from "@earendil-works/pi-coding-agent";
import { Type } from "typebox";
import { toolResult } from "../../src/text.ts";
import { assertMetadataAllowed, loadToolPolicy, tableParts } from "../../src/policy.ts";
import { createDatabricksClient, DatabricksClient } from "./client.ts";
import { renderDatasetDocumentation } from "./documentation.ts";
import { getTableTags, profileTable } from "./profiling.ts";

async function context(ctx: ExtensionContext): Promise<{ client: DatabricksClient; policy: Awaited<ReturnType<typeof loadToolPolicy>> }> {
	const policy = await loadToolPolicy(ctx);
	assertMetadataAllowed(policy);
	return { client: await createDatabricksClient(), policy };
}

const limit = Type.Optional(Type.Integer({ minimum: 1, maximum: 200, default: 100 }));
const table = Type.String({ minLength: 5, maxLength: 767, description: "Fully qualified catalog.schema.table name." });

export default function databricksExtension(pi: ExtensionAPI): void {
	pi.registerTool({
		name: "uc_list_catalogs",
		label: "List allowed UC catalogs",
		description: "List read-only Unity Catalog metadata, filtered by workflow.yaml catalog scope.",
		parameters: Type.Object({ limit }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult({ catalogs: await state.client.listCatalogs(state.policy, parameters.limit ?? 100, signal) });
		},
	});

	pi.registerTool({
		name: "uc_list_schemas",
		label: "List allowed UC schemas",
		description: "List read-only Unity Catalog schema metadata inside an explicitly allowed catalog.",
		parameters: Type.Object({ catalog: Type.String({ minLength: 1, maxLength: 255 }), limit }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult({ schemas: await state.client.listSchemas(state.policy, parameters.catalog, parameters.limit ?? 100, signal) });
		},
	});

	pi.registerTool({
		name: "uc_list_tables",
		label: "List allowed UC tables",
		description: "List tables and views in an explicitly allowed Unity Catalog schema; columns and properties are omitted for bounded discovery.",
		parameters: Type.Object({ catalog: Type.String({ minLength: 1, maxLength: 255 }), schema: Type.String({ minLength: 1, maxLength: 255 }), limit }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult({ tables: await state.client.listTables(state.policy, parameters.catalog, parameters.schema, parameters.limit ?? 100, signal) });
		},
	});

	pi.registerTool({
		name: "uc_search",
		label: "Search allowed UC tables",
		description: "Search names and comments across the project's allowed Unity Catalog schemas using bounded metadata listing.",
		parameters: Type.Object({ query: Type.String({ minLength: 1, maxLength: 200 }), limit: Type.Optional(Type.Integer({ minimum: 1, maximum: 50, default: 20 })) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			const needle = parameters.query.toLocaleLowerCase();
			const matches = [];
			for (const scopedSchema of state.policy.databricks.allowed_schemas) {
				const [catalog, schema] = scopedSchema.split(".") as [string, string];
				const tables = await state.client.listTables(state.policy, catalog, schema, 200, signal);
				for (const candidate of tables) {
					if (`${candidate.fullName} ${candidate.comment ?? ""}`.toLocaleLowerCase().includes(needle)) matches.push(candidate);
					if (matches.length >= (parameters.limit ?? 20)) return toolResult({ tables: matches });
				}
			}
			return toolResult({ tables: matches });
		},
	});

	pi.registerTool({
		name: "uc_describe_table",
		label: "Describe allowed UC table",
		description: "Retrieve read-only table, owner, comment, column, and safely filtered property metadata for an allowed table.",
		parameters: Type.Object({ table }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult({ table: await state.client.getTable(state.policy, parameters.table, signal) });
		},
	});

	pi.registerTool({
		name: "uc_get_tags",
		label: "Get UC classification tags",
		description: "Retrieve table and column tags through read-only information_schema queries. Requires the configured SQL warehouse.",
		parameters: Type.Object({ table }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult({ table: parameters.table, tags: await getTableTags(state.client, state.policy, parameters.table, signal) });
		},
	});

	pi.registerTool({
		name: "uc_get_lineage",
		label: "Get scoped UC lineage",
		description: "Retrieve upstream and downstream table lineage, omitting names outside workflow.yaml scope and all workspace entity details.",
		parameters: Type.Object({ table }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult(await state.client.getLineage(state.policy, parameters.table, signal));
		},
	});

	pi.registerTool({
		name: "uc_profile_table",
		label: "Profile approved UC columns",
		description: "Compute bounded aggregate statistics in Databricks. The table and columns must be explicitly approved, visible classification tags must be non-sensitive, and small cohorts are suppressed. No raw rows or top values are returned.",
		parameters: Type.Object({ table, columns: Type.Array(Type.String({ minLength: 1, maxLength: 255 }), { minItems: 1, maxItems: 20 }) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			return toolResult(await profileTable(state.client, state.policy, parameters.table, parameters.columns, signal));
		},
	});

	pi.registerTool({
		name: "uc_document_dataset",
		label: "Draft dataset documentation",
		description: "Generate a human-readable Markdown dataset record from scoped Unity Catalog metadata, tags, lineage, and optionally approved aggregate profiling. Save and complete it under docs/data/.",
		parameters: Type.Object({ table, profileColumns: Type.Optional(Type.Array(Type.String({ minLength: 1, maxLength: 255 }), { minItems: 1, maxItems: 20 })) }),
		async execute(_id, parameters, signal, _update, ctx) {
			const state = await context(ctx);
			tableParts(parameters.table);
			const [metadata, tags, lineage] = await Promise.all([
				state.client.getTable(state.policy, parameters.table, signal),
				getTableTags(state.client, state.policy, parameters.table, signal),
				state.client.getLineage(state.policy, parameters.table, signal),
			]);
			const profile = parameters.profileColumns ? await profileTable(state.client, state.policy, parameters.table, parameters.profileColumns, signal) : undefined;
			return toolResult({ markdown: renderDatasetDocumentation({ table: metadata, tags, lineage, profile }) });
		},
	});
}

export { resolveDatabricksAuth } from "./auth.ts";
export { createDatabricksClient, DatabricksClient } from "./client.ts";
