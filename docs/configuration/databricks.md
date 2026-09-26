# Databricks and Unity Catalog

Set `databricks.enabled: true`, exact catalog and `catalog.schema` allowlists, and an
existing SQL warehouse ID in `workflow.yaml`. Use a dedicated low-privilege identity.
The client uses `DATABRICKS_TOKEN` first when present; otherwise it runs
`databricks auth token --host <origin>` for an existing OAuth U2M login.
This CLI command does not implement OAuth M2M or every unified-auth mechanism.
For service principals, obtain a short-lived OAuth token using your organization's
credential tooling and supply it as `DATABRICKS_TOKEN`; refresh it outside this package.
Tokens are never written to tool results or
remote-error messages.

Internal tools require an exact current `provider/model-id` in `approved_models`.
Metadata tools use fixed Unity Catalog endpoints and filter all returned
objects to project scope. Profiling has no user SQL parameter. It validates generated
identifiers, emits generated `SELECT` statements only, and requires an exact approved
table and columns. Visible tags are fetched first. Missing tags or a configured
sensitive token fail closed before row counts. Classification must be exactly
`classification=public` on the table or every requested column, in addition to
explicit table/column policy approval. Unrelated tags do not establish safety.
Small cohorts stop before column-value aggregates; the final statement's count is
rechecked and columns with too few non-null values are suppressed. Profiles omit
raw rows and categorical top values. Separate statements do not guarantee a single
snapshot or prevent concurrent tag changes; use immutable sanitized inputs.

Lineage now queries the documented `system.access.table_lineage` through the same
bounded Statement Execution client. It requires an enabled system schema, warehouse,
and explicit SELECT permission. Only scoped table names reach the model; paths,
users, jobs and notebook details are omitted. Current retention is a rolling year,
and capture/permissions are incomplete. Missing permission produces an error, not
proof of no dependencies. See the [official table reference](https://docs.databricks.com/aws/en/admin/system-tables/lineage).

Catalog/schema/table discovery is bounded (at most 100 pages per call). `uc_search`
inspects at most 200 tables per allowed schema; it is not exhaustive. Arbitrary table
properties are omitted except three Delta format/version properties; key-based
redaction alone cannot certify arbitrary metadata. Comments and owners still require
data-owner approval. No row preview exists, regardless of row-related policy flags.

An approved profile can still disclose information through extrema, repeated queries,
or combinations of aggregates. `minimum_cohort_size` is suppression, not differential
privacy. Prefer sanitized views and document owner/model approval separately from
database privileges.

Current official references inspected on 2026-09-17: [Unity Catalog API](https://docs.databricks.com/api/uc-catalogs/v1/catalog),
[Statement Execution](https://docs.databricks.com/api/statement-execution/v1/statement-execution),
and [Unity Catalog lineage](https://docs.databricks.com/aws/en/data-governance/unity-catalog/data-lineage).
Tests use synthetic localhost responses; no Databricks workspace has been live verified.
