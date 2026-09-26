import type { ColumnProfile, TableLineage, TableProfile, TableSummary, UnityCatalogTag } from "./types.ts";

function cell(value: unknown): string {
	if (value === undefined || value === null || value === "") return "—";
	return String(value).replace(/\|/g, "\\|").replace(/[\r\n]+/g, " ");
}

function profileByColumn(profile?: TableProfile): Map<string, ColumnProfile> {
	return new Map((profile?.columns ?? []).map(column => [column.name, column]));
}

export function renderDatasetDocumentation(input: {
	table: TableSummary;
	tags: UnityCatalogTag[];
	lineage: TableLineage;
	profile?: TableProfile;
}): string {
	const profiles = profileByColumn(input.profile);
	const tableTags = input.tags.filter(tag => tag.objectType === "table");
	const lines = [
		`# Dataset: ${cell(input.table.fullName)}`,
		"",
		"> Generated from read-only Unity Catalog metadata. Complete purpose, source, quality, transformation, leakage, and release sections with repository evidence before relying on this document.",
		"",
		"## Identity and purpose",
		"",
		`- Purpose: TODO`,
		`- Source table: \`${cell(input.table.fullName)}\``,
		`- Owner: ${cell(input.table.owner)}`,
		`- Type / format: ${cell(input.table.tableType)} / ${cell(input.table.dataSourceFormat)}`,
		`- Catalog comment: ${cell(input.table.comment)}`,
		`- Data version or snapshot: TODO`,
		`- Temporal coverage: TODO`,
		"",
		"## Classification and constraints",
		"",
		`- Table tags: ${tableTags.length ? tableTags.map(tag => `${cell(tag.key)}=${cell(tag.value)}`).join(", ") : "No visible table tags"}`,
		`- Publication/release constraints: TODO; consult project disclosure policy and data owner`,
		"",
		"## Schema",
		"",
		"| Column | Type | Nullable | Comment | Tags | Null proportion | Cardinality | Range |",
		"|---|---|---:|---|---|---:|---:|---|",
	];
	for (const column of input.table.columns ?? []) {
		const tags = input.tags.filter(tag => tag.objectType === "column" && tag.columnName === column.name);
		const profile = profiles.get(column.name);
		lines.push(`| ${cell(column.name)} | ${cell(column.type)} | ${cell(column.nullable)} | ${cell(column.comment)} | ${cell(tags.map(tag => `${tag.key}=${tag.value}`).join(", "))} | ${cell(profile?.nullProportion)} | ${cell(profile?.cardinality)} | ${cell(profile && (profile.minimum !== undefined || profile.maximum !== undefined) ? `${profile.minimum ?? "—"} … ${profile.maximum ?? "—"}` : undefined)} |`);
	}
	lines.push(
		"",
		"## Lineage",
		"",
		`- Upstream tables in project scope: ${input.lineage.upstreamTables.length ? input.lineage.upstreamTables.map(value => `\`${cell(value)}\``).join(", ") : "None visible"}`,
		`- Downstream tables in project scope: ${input.lineage.downstreamTables.length ? input.lineage.downstreamTables.map(value => `\`${cell(value)}\``).join(", ") : "None visible"}`,
		`- Lineage entries omitted outside scope: ${input.lineage.omittedOutsideScope}`,
		`- Coverage: ${input.lineage.coverage}`,
		"",
		"## Quality, transformations, and reproducibility",
		"",
		"- Known quality issues and exclusions: TODO",
		"- Missingness assessment: TODO",
		"- Transformations and filtering: TODO",
		"- Labels or targets: TODO",
		"- Leakage risks: TODO",
		"- Downstream outputs: TODO",
		"- Reproduction procedure and required permissions: TODO",
	);
	if (input.profile?.cohort.suppressed) lines.push("", `Aggregate profile suppressed because the dataset was below the configured minimum cohort size of ${input.profile.cohort.minimumSize}.`);
	if (input.profile?.duplicateRows !== undefined) lines.push("", `Duplicate tuples across selected columns (${input.profile.duplicateColumns?.map(cell).join(", ")}): ${cell(input.profile.duplicateRows)}. This is not a count of full-row duplicates unless all columns were selected.`);
	return lines.join("\n");
}
