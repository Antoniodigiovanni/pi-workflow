---
name: observability
description: Add operational signals for services, jobs, pipelines, training, and model serving without excessive or sensitive logging.
---

# Observability

- Start with a concrete operator question or failure mode. Use the existing logging and telemetry stack.
- Emit structured logs with run/request identifiers, stage, outcome, and useful error context. Never log secrets, credentials, or sensitive payloads.
- Measure rates, errors, duration, and resource use where material. Add traces when cross-service causality is hard to reconstruct.
- For jobs and pipelines, surface run status, input/output counts, freshness, quality failures, retries, and checkpoint state. For training, surface objective and resource metrics; for serving, latency distribution, throughput, failures, and model version.
- Ensure signals are actionable and alertable with meaningful thresholds and ownership. Avoid high-cardinality labels and noisy success logs.
