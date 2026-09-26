---
name: databricks-data-access
description: Inspect approved Unity Catalog metadata and bounded aggregate profiles with read-only credentials and explicit scope.
---

# Databricks data access

Use a dedicated low privilege read-only identity scoped to approved catalogs, schemas, tables, and an existing warehouse. Configure exact scopes in `workflow.yaml`; empty allowlists deny access. Repository policy is an additional guard, not a replacement for service authorization. Keep credentials outside Git and logs.

Inspect metadata and lineage before requesting aggregates. Aggregate profiles require an approved table and columns, visible non-sensitive classification tags, and minimum cohort suppression. Treat incomplete tags and lineage as uncertainty, not evidence of safety or completeness. Never infer permission to send service results to a model from permission to read the service. Follow `docs/configuration/databricks.md` for the tool surface and limits.
