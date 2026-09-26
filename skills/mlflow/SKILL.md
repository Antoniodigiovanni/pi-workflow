---
name: mlflow
description: Configure MLflow tracking and inspect approved experiments, runs, metrics, and artifacts while preserving the scientific experiment specification.
---

# MLflow workflow

Use MLflow for machine-readable run history when a project needs it. For a research project, pi-research-scientist owns the hypothesis, metrics, splits, statistical plan, interpretation, and human-readable experiment record. Keep those decisions in the research repository; MLflow run IDs and artifacts should link back to that record.

Before connecting, set `MLFLOW_TRACKING_URI` to an approved tracking origin and configure `workflow.yaml` with exact allowed experiment IDs. For internal projects, approve the current model in `data_policy.approved_models` before reading service data. Treat parameters, tags, artifact names, and artifact content as potentially confidential. Approve metadata keys and artifact paths explicitly. Use the read-only tools for inspection; do not assume that a run comparison proves statistical significance or reproducibility.

When implementing tracking, log run identity, code and configuration revision, data snapshot, split identity, seed, model version, metrics, environment, and artifacts. Do not log secrets or raw restricted data. Validate that logged metrics correspond to the research specification and that failed or excluded runs remain visible. Follow `docs/configuration/mlflow.md` for connection and tool limits.
