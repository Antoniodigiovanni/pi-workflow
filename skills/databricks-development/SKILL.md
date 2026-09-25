---
name: databricks-development
description: Build Databricks packages and jobs with local transformation tests and targeted remote integration validation.
---

# Databricks development

- Identify the target Databricks Runtime, local Python and Spark versions, Databricks Connect compatibility, compute type (cluster or serverless), and deployment convention before editing configuration.
- Put reusable logic in normal Python modules/packages. Keep notebooks and Jobs/Workflows thin: parse configuration, invoke modules, and surface run outcomes. Do not spread Databricks-specific APIs through domain logic.
- Keep catalog, schema, table, path, and environment configuration separate from transformations. Do not rely on notebook globals or ambient workspace state.
- Test DataFrame behavior locally where possible. Use remote integration tests for Unity Catalog permissions, Delta table semantics, Jobs, Databricks Runtime behavior, remote storage, MLflow/model registry, and compute-specific behavior.
- Use dedicated dev/test catalogs or schemas and controlled fixtures. Never use production tables as mutable test targets. Make cleanup and rollback of test resources explicit.
- Check schema evolution, Delta writes/merges, checkpointing, retries, and idempotency against the actual workflow. Separate local development from remote execution evidence.
