---
name: pyspark-development
description: Implement and unit test PySpark DataFrame transformations locally, reserving Databricks tests for real platform boundaries.
---

# PySpark development

Decision rule: if behavior can be verified with a small synthetic Spark DataFrame, test it locally in `local[2]`. Use Databricks/databricks-connect only when the behavior depends on the platform itself, such as Unity Catalog, Delta semantics, Jobs, permissions, Databricks Runtime, model registry, or remote storage.

- Prefer DataFrame-to-DataFrame functions with explicit parameters and return values. Keep reads, writes, configuration, platform integration, and orchestration outside transformation logic.
- Prefer built-in Spark SQL/DataFrame expressions over Python UDFs. Python UDFs limit Spark optimization and introduce serialization overhead; use them only when Spark-native expressions are not a reasonable solution.
- Use a session-scoped `SparkSession` fixture with `local[2]`, not a new session per test. Local unit tests must require no network access, credentials, catalogs, or remote services.
- Test against a real local Spark session rather than mocking DataFrame or Spark internals when practical.
- Prefer native PySpark DataFrame/schema assertion utilities when supported by the target Spark version; otherwise use `chispa` or an equivalent library. Avoid manual `.collect()` comparison loops. Never rely on incidental row order unless ordering is contractual.
- Cover nulls, duplicates, ties, empty inputs, edge dates, missing categories, unexpected values, and boundary conditions according to the transformation's risk.
- Make record selection deterministic whenever the business logic requires it. Operations such as `first`, deduplication, and window ranking must have an explicit and deterministic tie-breaking rule. Do not use `dropDuplicates` when the identity of the retained row matters.
- Forbid `.collect()`, `.toPandas()`, `.toLocalIterator()`, and other driver-side materialization inside production transformations unless the input is explicitly bounded and the choice is justified. They are acceptable in small test assertions.
- Treat shuffles, skew, repartitioning, broadcast joins, caching, repeated actions, and wide transformations as scale concerns requiring justification. Unit tests establish correctness; performance-sensitive behavior should also be evaluated at representative scale.
- Reserve remote integration tests for genuine platform boundaries. Use isolated, dedicated test resources and avoid dependencies on production state.
- Keep standalone `pyspark` and `databricks-connect` in separate environments when their Spark or dependency requirements conflict. Align each environment with its target runtime.
- Detect the active runtime through explicit configuration or environment metadata when needed, but choose the test strategy based primarily on the behavior being tested rather than simply on which runtime happens to be installed.