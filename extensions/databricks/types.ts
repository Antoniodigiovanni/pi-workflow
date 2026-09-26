export interface CatalogSummary {
	name: string;
	comment?: string;
	owner?: string;
	type?: string;
	browseOnly?: boolean;
}

export interface SchemaSummary {
	name: string;
	fullName: string;
	catalogName: string;
	comment?: string;
	owner?: string;
	browseOnly?: boolean;
}

export interface ColumnSummary {
	name: string;
	type: string;
	typeName?: string;
	position?: number;
	nullable?: boolean;
	comment?: string;
}

export interface TableSummary {
	name: string;
	fullName: string;
	catalogName: string;
	schemaName: string;
	tableType?: string;
	dataSourceFormat?: string;
	comment?: string;
	owner?: string;
	browseOnly?: boolean;
	columns?: ColumnSummary[];
	properties?: Record<string, string>;
}

export interface UnityCatalogTag {
	objectType: "table" | "column";
	columnName?: string;
	key: string;
	value: string;
}

export interface TableLineage {
	table: string;
	upstreamTables: string[];
	downstreamTables: string[];
	omittedOutsideScope: number;
	coverage: string;
}

export interface SqlResult {
	columns: string[];
	rows: Array<Record<string, string | null>>;
}

export interface ColumnProfile {
	name: string;
	type: string;
	suppressed?: boolean;
	nullCount?: string;
	nullProportion?: number;
	cardinality?: string;
	minimum?: string | null;
	maximum?: string | null;
	mean?: string | null;
	standardDeviation?: string | null;
	q25?: string | null;
	median?: string | null;
	q75?: string | null;
}

export interface TableProfile {
	table: string;
	cohort: { suppressed: boolean; minimumSize: number; rowCount?: string };
	duplicateRows?: string;
	duplicateColumns?: string[];
	columns: ColumnProfile[];
}
