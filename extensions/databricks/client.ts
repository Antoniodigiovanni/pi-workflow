import { requestJson } from "../../src/http.ts";
import { assertAggregateAllowed, assertMetadataAllowed, assertTableAllowed, type WorkflowPolicy } from "../../src/policy.ts";
import { resolveDatabricksAuth } from "./auth.ts";
import { assertGeneratedSelect, lineageQuery, profileQuery, rowCountQuery, tagQuery } from "./sql.ts";
import { normalizeCatalog, normalizeLineage, normalizeSchema, normalizeSqlResult, normalizeTable } from "./normalize.ts";
import type { CatalogSummary, ColumnSummary, SchemaSummary, SqlResult, TableLineage, TableSummary } from "./types.ts";

function record(value: unknown, location: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Databricks returned malformed ${location}`);
	return value as Record<string, unknown>;
}

function apiHost(host: URL): URL {
	if (host.username || host.password || host.search || host.hash || host.pathname !== "/") throw new Error("Databricks host must be an origin without credentials");
	if (host.protocol === "https:") return host;
	if (host.protocol === "http:" && ["127.0.0.1", "localhost", "[::1]"].includes(host.hostname)) return host;
	throw new Error("Databricks host must use HTTPS");
}

export class DatabricksClient {
	readonly host: URL;
	readonly #token: string;

	constructor(host: URL, token: string) {
		this.host = apiHost(new URL(host));
		if (token.length < 8 || token.length > 100_000) throw new Error("Databricks access token is malformed");
		this.#token = token;
	}

	async #request(path: string, options: { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal } = {}): Promise<unknown> {
		if (!path.startsWith("/api/") || path.includes("..")) throw new Error("Unsupported Databricks API path");
		const url = new URL(path, this.host);
		return requestJson(url, {
			method: options.method ?? "GET",
			headers: { Authorization: `Bearer ${this.#token}`, "Content-Type": "application/json" },
			body: options.body === undefined ? undefined : JSON.stringify(options.body),
			signal: options.signal,
			maxBytes: 4_000_000,
			timeoutMs: 55_000,
		});
	}

	async listCatalogs(policy: WorkflowPolicy, limit = 100, signal?: AbortSignal): Promise<CatalogSummary[]> {
		assertMetadataAllowed(policy);
		const output: CatalogSummary[] = [];
		let pageToken: string | undefined;
		for (let page = 0; page < 100 && output.length < limit; page += 1) {
			const query = new URLSearchParams({ max_results: String(Math.min(100, limit - output.length)), include_browse: "true" });
			if (pageToken) query.set("page_token", pageToken);
			const response = record(await this.#request(`/api/2.1/unity-catalog/catalogs?${query}`, { signal }), "catalog list");
			if (!Array.isArray(response.catalogs)) throw new Error("Databricks returned malformed catalog list");
			for (const value of response.catalogs) {
				const catalog = normalizeCatalog(value);
				if (policy.databricks.allowed_catalogs.includes(catalog.name)) output.push(catalog);
				if (output.length >= limit) break;
			}
			pageToken = typeof response.next_page_token === "string" && response.next_page_token ? response.next_page_token : undefined;
			if (!pageToken) break;
		}
		return output;
	}

	async listSchemas(policy: WorkflowPolicy, catalog: string, limit = 100, signal?: AbortSignal): Promise<SchemaSummary[]> {
		assertMetadataAllowed(policy);
		if (!policy.databricks.allowed_catalogs.includes(catalog)) throw new Error("Catalog is outside the project allowlist");
		const output: SchemaSummary[] = [];
		let pageToken: string | undefined;
		for (let page = 0; page < 100 && output.length < limit; page += 1) {
			const query = new URLSearchParams({ catalog_name: catalog, max_results: String(Math.min(100, limit - output.length)), include_browse: "true" });
			if (pageToken) query.set("page_token", pageToken);
			const response = record(await this.#request(`/api/2.1/unity-catalog/schemas?${query}`, { signal }), "schema list");
			if (!Array.isArray(response.schemas)) throw new Error("Databricks returned malformed schema list");
			for (const value of response.schemas) {
				const schema = normalizeSchema(value);
				if (policy.databricks.allowed_schemas.includes(schema.fullName)) output.push(schema);
				if (output.length >= limit) break;
			}
			pageToken = typeof response.next_page_token === "string" && response.next_page_token ? response.next_page_token : undefined;
			if (!pageToken) break;
		}
		return output;
	}

	async listTables(policy: WorkflowPolicy, catalog: string, schema: string, limit = 100, signal?: AbortSignal): Promise<TableSummary[]> {
		assertMetadataAllowed(policy);
		if (!policy.databricks.allowed_catalogs.includes(catalog) || !policy.databricks.allowed_schemas.includes(`${catalog}.${schema}`)) throw new Error("Schema is outside the project allowlist");
		const output: TableSummary[] = [];
		let pageToken: string | undefined;
		for (let page = 0; page < 100 && output.length < limit; page += 1) {
			const query = new URLSearchParams({ catalog_name: catalog, schema_name: schema, max_results: String(Math.min(100, limit - output.length)), include_browse: "true", omit_columns: "true", omit_properties: "true" });
			if (pageToken) query.set("page_token", pageToken);
			const response = record(await this.#request(`/api/2.1/unity-catalog/tables?${query}`, { signal }), "table list");
			if (!Array.isArray(response.tables)) throw new Error("Databricks returned malformed table list");
			for (const value of response.tables) {
				const table = normalizeTable(value);
				try { assertTableAllowed(policy, table.fullName); } catch { continue; }
				output.push(table);
				if (output.length >= limit) break;
			}
			pageToken = typeof response.next_page_token === "string" && response.next_page_token ? response.next_page_token : undefined;
			if (!pageToken) break;
		}
		return output;
	}

	async getTable(policy: WorkflowPolicy, table: string, signal?: AbortSignal): Promise<TableSummary> {
		assertTableAllowed(policy, table);
		const metadata = normalizeTable(await this.#request(`/api/2.1/unity-catalog/tables/${encodeURIComponent(table)}?include_browse=true`, { signal }));
		if (metadata.fullName !== table) throw new Error("Databricks returned metadata for an unexpected table");
		return metadata;
	}

	async getLineage(policy: WorkflowPolicy, table: string, signal?: AbortSignal): Promise<TableLineage> {
		assertTableAllowed(policy, table);
		if (!policy.databricks.warehouse) throw new Error("databricks.warehouse and SELECT on system.access.table_lineage are required for lineage");
		const response = await this.#executeGeneratedSelect(policy.databricks.warehouse, lineageQuery(table), signal);
		return normalizeLineage(response, table, candidate => {
			try { assertTableAllowed(policy, candidate); return true; } catch { return false; }
		});
	}

	async #executeGeneratedSelect(warehouseId: string, statement: string, signal?: AbortSignal): Promise<SqlResult> {
		if (!warehouseId || !/^[A-Za-z0-9_-]{1,255}$/.test(warehouseId)) throw new Error("A valid Databricks SQL warehouse ID is required");
		assertGeneratedSelect(statement);
		const response = await this.#request("/api/2.0/sql/statements", {
			method: "POST",
			signal,
			body: {
				warehouse_id: warehouseId,
				statement,
				wait_timeout: "50s",
				on_wait_timeout: "CANCEL",
				disposition: "INLINE",
				format: "JSON_ARRAY",
				row_limit: 1000,
				byte_limit: 1_000_000,
			},
		});
		return normalizeSqlResult(response);
	}

	async getTableTags(policy: WorkflowPolicy, table: string, signal?: AbortSignal): Promise<SqlResult> {
		assertTableAllowed(policy, table);
		if (!policy.databricks.warehouse) throw new Error("databricks.warehouse is required to retrieve Unity Catalog tags");
		return this.#executeGeneratedSelect(policy.databricks.warehouse, tagQuery(table), signal);
	}

	async getApprovedRowCount(policy: WorkflowPolicy, table: string, columns: string[], signal?: AbortSignal): Promise<SqlResult> {
		assertAggregateAllowed(policy, table, columns);
		if (!policy.databricks.warehouse) throw new Error("databricks.warehouse is required for aggregate profiling");
		return this.#executeGeneratedSelect(policy.databricks.warehouse, rowCountQuery(table), signal);
	}

	async getApprovedProfile(policy: WorkflowPolicy, table: string, columns: ColumnSummary[], signal?: AbortSignal): Promise<SqlResult> {
		assertAggregateAllowed(policy, table, columns.map(column => column.name));
		if (!policy.databricks.warehouse) throw new Error("databricks.warehouse is required for aggregate profiling");
		return this.#executeGeneratedSelect(policy.databricks.warehouse, profileQuery(table, columns), signal);
	}
}

export async function createDatabricksClient(environment: NodeJS.ProcessEnv = process.env): Promise<DatabricksClient> {
	const auth = await resolveDatabricksAuth(environment);
	return new DatabricksClient(auth.host, auth.token);
}
