import { tableParts } from "../../src/policy.ts";
import type { CatalogSummary, ColumnSummary, SchemaSummary, SqlResult, TableLineage, TableSummary } from "./types.ts";

function record(value: unknown, location: string): Record<string, unknown> {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`Databricks returned malformed ${location}`);
	return value as Record<string, unknown>;
}

function optionalString(value: unknown): string | undefined {
	return typeof value === "string" && value.length <= 100_000 ? value : undefined;
}

function requiredString(value: unknown, location: string): string {
	const parsed = optionalString(value);
	if (!parsed) throw new Error(`Databricks returned malformed ${location}`);
	return parsed;
}

function optionalBoolean(value: unknown): boolean | undefined {
	return typeof value === "boolean" ? value : undefined;
}

function safeProperties(value: unknown): Record<string, string> | undefined {
	if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
	const output: Record<string, string> = Object.create(null);
	for (const [key, entry] of Object.entries(value)) {
		if (/secret|token|password|credential|private.?key/i.test(key)) {
			output[key] = "[redacted]";
		} else if (["delta.minReaderVersion", "delta.minWriterVersion", "delta.columnMapping.mode"].includes(key) && typeof entry === "string" && entry.length <= 2000) {
			output[key] = entry;
		}
	}
	return output;
}

export function normalizeCatalog(value: unknown): CatalogSummary {
	const item = record(value, "catalog metadata");
	return {
		name: requiredString(item.name, "catalog name"),
		comment: optionalString(item.comment),
		owner: optionalString(item.owner),
		type: optionalString(item.catalog_type),
		browseOnly: optionalBoolean(item.browse_only),
	};
}

export function normalizeSchema(value: unknown): SchemaSummary {
	const item = record(value, "schema metadata");
	const catalogName = requiredString(item.catalog_name, "schema catalog name");
	const name = requiredString(item.name, "schema name");
	return {
		name,
		fullName: optionalString(item.full_name) ?? `${catalogName}.${name}`,
		catalogName,
		comment: optionalString(item.comment),
		owner: optionalString(item.owner),
		browseOnly: optionalBoolean(item.browse_only),
	};
}

function normalizeColumn(value: unknown): ColumnSummary {
	const item = record(value, "column metadata");
	return {
		name: requiredString(item.name, "column name"),
		type: optionalString(item.type_text) ?? requiredString(item.type_name, "column type"),
		typeName: optionalString(item.type_name),
		position: typeof item.position === "number" && Number.isInteger(item.position) ? item.position : undefined,
		nullable: optionalBoolean(item.nullable),
		comment: optionalString(item.comment),
	};
}

export function normalizeTable(value: unknown): TableSummary {
	const item = record(value, "table metadata");
	const fullName = optionalString(item.full_name);
	let derived: [string, string, string] | undefined;
	if (fullName) {
		try { derived = tableParts(fullName); } catch { throw new Error("Databricks returned malformed table full name"); }
	}
	const catalogName = optionalString(item.catalog_name) ?? derived?.[0];
	const schemaName = optionalString(item.schema_name) ?? derived?.[1];
	const name = optionalString(item.name) ?? derived?.[2];
	if (!catalogName || !schemaName || !name) throw new Error("Databricks returned incomplete table identity");
	const columns = Array.isArray(item.columns) ? item.columns.slice(0, 1000).map(normalizeColumn) : undefined;
	return {
		name,
		fullName: fullName ?? `${catalogName}.${schemaName}.${name}`,
		catalogName,
		schemaName,
		tableType: optionalString(item.table_type),
		dataSourceFormat: optionalString(item.data_source_format),
		comment: optionalString(item.comment),
		owner: optionalString(item.owner),
		browseOnly: optionalBoolean(item.browse_only),
		columns,
		properties: safeProperties(item.properties),
	};
}

export function normalizeSqlResult(value: unknown): SqlResult {
	const response = record(value, "SQL response");
	const status = record(response.status, "SQL status");
	if (status.state !== "SUCCEEDED") throw new Error("Databricks SQL statement did not succeed; check warehouse availability and query permissions");
	const manifest = record(response.manifest, "SQL manifest");
	if (manifest.truncated === true) throw new Error("Databricks SQL result was truncated and has been discarded");
	const schema = record(manifest.schema, "SQL result schema");
	if (!Array.isArray(schema.columns) || schema.columns.length > 500) throw new Error("Databricks returned malformed SQL result columns");
	const columns = schema.columns.map((column, index) => {
		const item = record(column, "SQL result column");
		return optionalString(item.name) ?? `column_${index}`;
	});
	const result = record(response.result, "SQL result");
	if (result.next_chunk_index !== undefined || result.next_chunk_internal_link !== undefined || result.external_links !== undefined) {
		throw new Error("Databricks returned an unexpected multi-part result; reduce the request scope");
	}
	if (!Array.isArray(result.data_array) || result.data_array.length > 1000) throw new Error("Databricks returned malformed SQL rows");
	const rows = result.data_array.map((row) => {
		if (!Array.isArray(row) || row.length !== columns.length) throw new Error("Databricks returned a malformed SQL row");
		const output: Record<string, string | null> = Object.create(null);
		for (let index = 0; index < columns.length; index += 1) {
			const cell = row[index];
			if (cell !== null && typeof cell !== "string") throw new Error("Databricks returned an unsupported SQL value");
			output[columns[index]!] = cell;
		}
		return output;
	});
	return { columns, rows };
}

export function normalizeLineage(
	value: SqlResult,
	table: string,
	isAllowed: (qualifiedTable: string) => boolean,
): TableLineage {
	let omittedOutsideScope = 0;
	if (!value.columns.includes("direction") || !value.columns.includes("table_name")) throw new Error("Databricks returned malformed lineage columns");
	for (const row of value.rows) if (!["upstream", "downstream"].includes(row.direction ?? "") || !row.table_name) throw new Error("Databricks returned malformed lineage rows");
	const normalizeDirection = (direction: string): string[] => {
		const names = new Set<string>();
		for (const row of value.rows.filter(row => row.direction === direction)) {
			const name = row.table_name!;
			try { tableParts(name); } catch { continue; }
			if (isAllowed(name)) names.add(name);
			else omittedOutsideScope += 1;
		}
		return [...names].sort();
	};
	return {
		table,
		upstreamTables: normalizeDirection("upstream"),
		downstreamTables: normalizeDirection("downstream"),
		omittedOutsideScope,
		coverage: "Visible system.access.table_lineage events within its retention window; incomplete capture and permissions can omit dependencies.",
	};
}
