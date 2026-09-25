---
name: model-serving
description: Build and validate batch inference and online model serving, including contracts, parity, capacity, and rollback.
---

# Model serving

First identify whether inference is batch, online, or both, and where features come from. Offline model quality does not prove production serving behavior.

- Define stable request/input and response/output contracts, including schema, missing features, invalid inputs, version identifiers, and failure behavior. Keep preprocessing and postprocessing aligned with training and batch paths.
- Pin and load an explicit model artifact version; validate startup, serialization, compatibility, and rollback to a previous version.
- For online systems, distinguish liveness from readiness, including model and dependency availability. Set deliberate timeouts, concurrency, batching, resource limits, and retry policies; prevent retry storms.
- For batch systems, define input snapshot, output identity, idempotent rerun behavior, partial-failure recovery, and reconciliation counts.
- Measure relevant latency, throughput, memory, and error rates with realistic input sizes. Log useful identifiers and versions without exposing sensitive payloads.
- Consider safe fallbacks, shadow traffic, or canaries when the deployment risk warrants them; validate live behavior and feature availability after release.
