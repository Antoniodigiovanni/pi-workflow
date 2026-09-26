import { identifier, tableParts } from "../../src/policy.ts";
import type { ColumnSummary } from "./types.ts";

export function assertGeneratedSelect(statement: string): void {
	if (statement.length > 100_000 || /;|--|\/\*/.test(statement)) throw new Error("Generated Databricks SQL failed read-only validation");
	const withoutLiterals = statement
		.replace(/'(?:''|[^'])*'/g, "''")
		.replace(/`(?:``|[^`])*`/g, "``")
		.toUpperCase();
	if (!/^\s*SELECT\b/.test(withoutLiterals)) throw new Error("Only generated SELECT statements are allowed");
	if (/\b(ALTER|CREATE|DELETE|DROP|GRANT|INSERT|MERGE|OPTIMIZE|REPAIR|REPLACE|REVOKE|TRUNCATE|UPDATE|COPY|CALL|EXECUTE|VACUUM)\b/.test(withoutLiterals)) {
		throw new Error("Generated Databricks SQL contains a forbidden operation");
	}
}

function quoted(value: string): string {
	return `\`${identifier(value)}\``;
}

export function qualifiedTable(value: string): string {
	return tableParts(value).map(quoted).join(".");
}

export function tagQuery(table: string): string {
	const [catalog, schema, name] = tableParts(table);
	return [
		"SELECT 'table' AS object_type, CAST(NULL AS STRING) AS column_name, tag_name, tag_value",
		`FROM ${quoted(catalog)}.information_schema.table_tags`,
		`WHERE schema_name = '${schema}' AND table_name = '${name}'`,
		"UNION ALL",
		"SELECT 'column' AS object_type, column_name, tag_name, tag_value",
		`FROM ${quoted(catalog)}.information_schema.column_tags`,
		`WHERE schema_name = '${schema}' AND table_name = '${name}'`,
	].join("\n");
}

export function rowCountQuery(table: string): string {
	return `SELECT COUNT(*) AS row_count FROM ${qualifiedTable(table)}`;
}

export function lineageQuery(table: string): string {
	tableParts(table);
	return `SELECT DISTINCT 'upstream' AS direction, source_table_full_name AS table_name
FROM system.access.table_lineage
WHERE target_table_full_name = '${table}' AND source_table_full_name IS NOT NULL
UNION
SELECT DISTINCT 'downstream' AS direction, target_table_full_name AS table_name
FROM system.access.table_lineage
WHERE source_table_full_name = '${table}' AND target_table_full_name IS NOT NULL`;
}

const NUMERIC_TYPES = new Set(["BYTE", "SHORT", "INT", "INTEGER", "LONG", "BIGINT", "FLOAT", "DOUBLE", "DECIMAL"]);
const TEMPORAL_TYPES = new Set(["DATE", "TIMESTAMP", "TIMESTAMP_NTZ"]);

export function profileQuery(table: string, columns: ColumnSummary[]): string {
	if (!columns.length) throw new Error("Choose at least one approved column to profile");
	const selections = ["COUNT(*) AS row_count"];
	for (const [index, column] of columns.entries()) {
		const name = quoted(column.name);
		selections.push(`COUNT_IF(${name} IS NULL) AS c${index}_null_count`);
		selections.push(`COUNT(DISTINCT ${name}) AS c${index}_cardinality`);
		const type = (column.typeName ?? column.type.split("(")[0] ?? "").toUpperCase();
		if (NUMERIC_TYPES.has(type)) {
			selections.push(`MIN(${name}) AS c${index}_minimum`, `MAX(${name}) AS c${index}_maximum`);
			selections.push(`AVG(${name}) AS c${index}_mean`, `STDDEV_SAMP(${name}) AS c${index}_standard_deviation`);
			selections.push(`PERCENTILE_APPROX(${name}, 0.25) AS c${index}_q25`, `PERCENTILE_APPROX(${name}, 0.5) AS c${index}_median`, `PERCENTILE_APPROX(${name}, 0.75) AS c${index}_q75`);
		} else if (TEMPORAL_TYPES.has(type)) {
			selections.push(`MIN(${name}) AS c${index}_minimum`, `MAX(${name}) AS c${index}_maximum`);
		}
	}
	selections.push(`COUNT(*) - COUNT(DISTINCT STRUCT(${columns.map(column => quoted(column.name)).join(", ")})) AS duplicate_rows`);
	return `SELECT\n  ${selections.join(",\n  ")}\nFROM ${qualifiedTable(table)}`;
}
