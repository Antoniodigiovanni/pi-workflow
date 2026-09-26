import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { parseDocument } from 'yaml';

export interface WorkflowPolicy {
  project: { type: 'public' | 'internal' };
  data_policy: {
    allow_schema_metadata: boolean; allow_aggregates: boolean;
    approved_models: string[];
  };
  databricks: {
    enabled: boolean; allowed_catalogs: string[]; allowed_schemas: string[];
    warehouse: string; row_access: boolean;
    approved_tables: Record<string, string[]>; minimum_cohort_size: number;
    sensitive_tags: string[];
  };
  mlflow: { enabled: boolean; allowed_experiments: string[]; allowed_metadata_keys: string[]; allow_artifacts: boolean; allowed_artifact_paths: string[] };
}

function object(value: unknown, location: string, keys: string[]): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error(`${location} must be a mapping`);
  for (const key of Object.keys(value)) if (!keys.includes(key)) throw new Error(`Unknown policy field in ${location}`);
  return value as Record<string, unknown>;
}
function string(value: unknown, location: string, fallback?: string): string {
  if (value === undefined && fallback !== undefined) return fallback;
  if (typeof value !== 'string' || value.length > 10000) throw new Error(`${location} must be a string`);
  return value;
}
function bool(value: unknown, location: string, fallback: boolean): boolean {
  if (value === undefined) return fallback;
  if (typeof value !== 'boolean') throw new Error(`${location} must be a boolean`);
  return value;
}
function strings(value: unknown, location: string): string[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > 1000 || value.some(v => typeof v !== 'string' || !v || v.length > 500)) {
    throw new Error(`${location} must be a bounded list of nonempty strings`);
  }
  return value;
}
function integer(value: unknown, location: string, fallback: number, min: number, max: number): number {
  if (value === undefined) return fallback;
  if (!Number.isInteger(value) || Number(value) < min || Number(value) > max) throw new Error(`${location} is outside its integer range`);
  return Number(value);
}

export function parsePolicy(source: string): WorkflowPolicy {
  if (source.length > 100000) throw new Error('workflow.yaml is too large');
  const doc = parseDocument(source, { uniqueKeys: true });
  if (doc.errors.length) throw new Error('workflow.yaml is invalid YAML (check duplicate keys and syntax)');
  let raw: unknown;
  try { raw = doc.toJS({ maxAliasCount: 0 }); } catch { throw new Error('YAML aliases are not supported in workflow.yaml'); }
  const root = object(raw, 'workflow.yaml', ['project', 'data_policy', 'databricks', 'mlflow']);
  const p = object(root.project, 'project', ['type']);
  if (p.type !== 'public' && p.type !== 'internal') throw new Error('project.type must explicitly be public or internal');
  const internal = p.type === 'internal';
  const d = object(root.data_policy ?? {}, 'data_policy', ['allow_schema_metadata', 'allow_aggregates', 'approved_models']);
  const db = object(root.databricks ?? {}, 'databricks', ['enabled', 'allowed_catalogs', 'allowed_schemas', 'warehouse', 'row_access', 'approved_tables', 'minimum_cohort_size', 'sensitive_tags']);
  const m = object(root.mlflow ?? {}, 'mlflow', ['enabled', 'allowed_experiments', 'allowed_metadata_keys', 'allow_artifacts', 'allowed_artifact_paths']);
  const approved: Record<string, string[]> = Object.create(null);
  if (db.approved_tables !== undefined) {
    if (!db.approved_tables || typeof db.approved_tables !== 'object' || Array.isArray(db.approved_tables)) throw new Error('approved_tables must map qualified tables to columns');
    for (const [name, columns] of Object.entries(db.approved_tables)) {
      tableParts(name);
      approved[name] = strings(columns, 'approved_tables columns');
      approved[name].forEach(identifier);
    }
  }
  const result: WorkflowPolicy = {
    project: { type: p.type },
    data_policy: {
      allow_schema_metadata: bool(d.allow_schema_metadata, 'allow_schema_metadata', true),
      allow_aggregates: bool(d.allow_aggregates, 'allow_aggregates', true),
      approved_models: strings(d.approved_models, 'approved_models'),
    },
    databricks: {
      enabled: bool(db.enabled, 'databricks.enabled', false), allowed_catalogs: strings(db.allowed_catalogs, 'allowed_catalogs'),
      allowed_schemas: strings(db.allowed_schemas, 'allowed_schemas'), warehouse: string(db.warehouse, 'warehouse', ''),
      row_access: bool(db.row_access, 'row_access', false), approved_tables: approved,
      minimum_cohort_size: integer(db.minimum_cohort_size, 'minimum_cohort_size', internal ? 10 : 1, 1, 1000000),
      sensitive_tags: db.sensitive_tags === undefined ? ['pii', 'sensitive', 'confidential', 'restricted', 'personal'] : strings(db.sensitive_tags, 'sensitive_tags'),
    },
    mlflow: { enabled: bool(m.enabled, 'mlflow.enabled', false), allowed_experiments: strings(m.allowed_experiments, 'allowed_experiments'), allowed_metadata_keys: strings(m.allowed_metadata_keys, 'allowed_metadata_keys'), allow_artifacts: bool(m.allow_artifacts, 'allow_artifacts', false), allowed_artifact_paths: strings(m.allowed_artifact_paths, 'allowed_artifact_paths') },
  };
  result.databricks.allowed_catalogs.forEach(identifier);
  for (const schema of result.databricks.allowed_schemas) {
    if (schema.split('.').length !== 2) throw new Error('allowed_schemas entries must be catalog.schema');
    schema.split('.').forEach(identifier);
  }
  return result;
}

export async function loadPolicy(cwd: string): Promise<WorkflowPolicy> {
  let source: string;
  try { source = await readFile(resolve(cwd, 'workflow.yaml'), 'utf8'); }
  catch { throw new Error('Cannot read workflow.yaml in the project working directory; initialize or cd to the project root'); }
  return parsePolicy(source);
}

// Enforce at each tool invocation, before creating a client or reading private data.
// This does not control future processing of content already in Pi session history.
export async function loadToolPolicy(ctx: { cwd: string; model?: { provider: string; id: string } }): Promise<WorkflowPolicy> {
  const policy = await loadPolicy(ctx.cwd);
  const models = policy.data_policy.approved_models;
  const model = ctx.model ? `${ctx.model.provider}/${ctx.model.id}` : undefined;
  if ((policy.project.type === 'internal' || models.length > 0) && (!model || !models.includes(model))) {
    throw new Error('The current model is not explicitly approved in data_policy.approved_models');
  }
  return policy;
}

export function identifier(value: string): string {
  if (!/^[A-Za-z_][A-Za-z0-9_]{0,254}$/.test(value)) throw new Error('Unsupported identifier; use simple letters, digits and underscores');
  return value;
}
export function tableParts(table: string): [string, string, string] {
  const parts = table.split('.');
  if (parts.length !== 3) throw new Error('Use a fully qualified catalog.schema.table');
  parts.forEach(identifier);
  return parts as [string, string, string];
}
export function assertMetadataAllowed(policy: WorkflowPolicy): void {
  if (!policy.databricks.enabled || !policy.data_policy.allow_schema_metadata) throw new Error('Databricks metadata access is disabled by project policy');
}
export function assertTableAllowed(policy: WorkflowPolicy, table: string): void {
  assertMetadataAllowed(policy);
  const [catalog, schema] = tableParts(table);
  if (!policy.databricks.allowed_catalogs.includes(catalog) || !policy.databricks.allowed_schemas.includes(`${catalog}.${schema}`)) throw new Error('Table is outside project catalog/schema allowlists');
}
export function assertAggregateAllowed(policy: WorkflowPolicy, table: string, columns: string[]): void {
  assertTableAllowed(policy, table);
  if (!policy.data_policy.allow_aggregates) throw new Error('Aggregate access is disabled');
  const approved = policy.databricks.approved_tables[table];
  if (!approved || columns.some(c => !approved.includes(identifier(c)))) throw new Error('Profile requires an explicitly approved table and columns in workflow.yaml');
}
export function assertNonSensitive(policy: WorkflowPolicy, tags: { key: string; value: string }[]): void {
  const blocked = tags.some(tag => policy.databricks.sensitive_tags.some(t => `${tag.key} ${tag.value}`.toLowerCase().includes(t.toLowerCase())));
  if (blocked) throw new Error('Sensitive classification blocks value profiling and preview; use an approved sanitized view');
}
