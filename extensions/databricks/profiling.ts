import { assertAggregateAllowed, assertNonSensitive, assertTableAllowed, type WorkflowPolicy } from "../../src/policy.ts";
import { DatabricksClient } from "./client.ts";
import type { TableProfile, UnityCatalogTag } from "./types.ts";

export async function getTableTags(
	client: DatabricksClient,
	policy: WorkflowPolicy,
	table: string,
	signal?: AbortSignal,
): Promise<UnityCatalogTag[]> {
	assertTableAllowed(policy, table);
	const result = await client.getTableTags(policy, table, signal);
	return result.rows.map(row => {
		if ((row.object_type !== "table" && row.object_type !== "column") || !row.tag_name || row.tag_value === null) {
			throw new Error("Databricks returned malformed Unity Catalog tag metadata");
		}
		return {
			objectType: row.object_type,
			columnName: row.column_name ?? undefined,
			key: row.tag_name,
			value: row.tag_value,
		};
	});
}

function requiredCell(row: Record<string, string | null>, name: string): string {
	const value = row[name];
	if (typeof value !== "string") throw new Error("Databricks returned an incomplete aggregate profile");
	return value;
}

export async function profileTable(
	client: DatabricksClient,
	policy: WorkflowPolicy,
	table: string,
	columnNames: string[],
	signal?: AbortSignal,
): Promise<TableProfile> {
	assertAggregateAllowed(policy, table, columnNames);
	if (!columnNames.length || columnNames.length > 20) throw new Error("Choose between 1 and 20 approved columns to profile");
	if (!policy.databricks.warehouse) throw new Error("databricks.warehouse is required for aggregate profiling");
	const metadata = await client.getTable(policy, table, signal);
	const available = new Map((metadata.columns ?? []).map(column => [column.name, column]));
	const columns = columnNames.map(name => {
		const column = available.get(name);
		if (!column) throw new Error("A requested profile column is absent from Unity Catalog metadata");
		return column;
	});

	// Classification retrieval must succeed before any value-derived aggregate runs.
	const tags = await getTableTags(client, policy, table, signal);
	if (tags.length === 0) throw new Error("No visible Unity Catalog classification tags; profiling fails closed because missing tags do not establish safety");
	const relevantTags = tags
		.filter(tag => tag.objectType === "table" || (tag.columnName !== undefined && columnNames.includes(tag.columnName)))
		.map(tag => ({ key: tag.key, value: tag.value }));
	assertNonSensitive(policy, relevantTags);
	// An unrelated tag (owner, retention, or another column) is not classification.
	const publicClassification = (tag: UnityCatalogTag) => tag.key.toLowerCase() === "classification" && tag.value.toLowerCase() === "public";
	if (!tags.some(tag => tag.objectType === "table" && publicClassification(tag)) &&
		!columnNames.every(name => tags.some(tag => tag.objectType === "column" && tag.columnName === name && publicClassification(tag)))) {
		throw new Error("Profiling requires classification=public on the table or every requested column; use an approved sanitized view");
	}

	const count = await client.getApprovedRowCount(policy, table, columnNames, signal);
	if (count.rows.length !== 1) throw new Error("Databricks returned an invalid row-count aggregate");
	const rowCountText = requiredCell(count.rows[0]!, "row_count");
	const rowCount = Number(rowCountText);
	if (!Number.isSafeInteger(rowCount) || rowCount < 0) throw new Error("Databricks returned an invalid row count");
	if (rowCount < policy.databricks.minimum_cohort_size) {
		return { table, cohort: { suppressed: true, minimumSize: policy.databricks.minimum_cohort_size }, columns: [] };
	}

	const result = await client.getApprovedProfile(policy, table, columns, signal);
	if (result.rows.length !== 1) throw new Error("Databricks returned an invalid aggregate profile");
	const row = result.rows[0]!;
	// Recheck the count from the same statement as the values: the table may change
	// between statements. Never release an aggregate for a newly small cohort.
	const profileCountText = requiredCell(row, "row_count");
	const profileCount = Number(profileCountText);
	if (!Number.isSafeInteger(profileCount) || profileCount < 0) throw new Error("Databricks returned an invalid profile row count");
	if (profileCount < policy.databricks.minimum_cohort_size) {
		return { table, cohort: { suppressed: true, minimumSize: policy.databricks.minimum_cohort_size }, columns: [] };
	}
	return {
		table,
		cohort: { suppressed: false, minimumSize: policy.databricks.minimum_cohort_size, rowCount: profileCountText },
		duplicateRows: requiredCell(row, "duplicate_rows"),
		duplicateColumns: columnNames,
		columns: columns.map((column, index) => {
			const nullCount = requiredCell(row, `c${index}_null_count`);
			const missing = Number(nullCount);
			if (!Number.isSafeInteger(missing) || missing < 0 || missing > profileCount) throw new Error("Databricks returned an invalid null count");
			// Sparse columns can expose an individual's value through MIN/AVG, even
			// when the table as a whole is large enough. Suppress the whole column.
			if (profileCount - missing < policy.databricks.minimum_cohort_size) return { name: column.name, type: column.type, suppressed: true };
			return {
				name: column.name,
				type: column.type,
				nullCount,
				nullProportion: Number((missing / profileCount).toFixed(6)),
				cardinality: requiredCell(row, `c${index}_cardinality`),
				minimum: row[`c${index}_minimum`],
				maximum: row[`c${index}_maximum`],
				mean: row[`c${index}_mean`],
				standardDeviation: row[`c${index}_standard_deviation`],
				q25: row[`c${index}_q25`],
				median: row[`c${index}_median`],
				q75: row[`c${index}_q75`],
			};
		}),
	};
}
