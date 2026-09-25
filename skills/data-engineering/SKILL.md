---
name: data-engineering
description: Build and validate batch, incremental, and streaming data pipelines and their data contracts and recovery behavior.
---

# Data engineering

Identify source contracts, output contracts, update cadence, and the intended replay model before changing a pipeline. Distinguish four concerns: transformation correctness, orchestration correctness, data quality, and infrastructure reliability; test each at the appropriate boundary.

- Define keys, schema, nullability, expected volume, and evolution policy. Make contract violations visible rather than silently dropping data.
- For incremental and streaming work, reason about idempotency, deduplication keys, event time versus processing time, watermarks, late arrivals, checkpoints, and retry behavior.
- Design backfills and reruns with bounded input ranges and explicit output effects. Inspect impact, cost, and mutable targets before destructive or expensive operations.
- Check partitioning and data layout against actual query and write patterns. Monitor skew and avoid uncontrolled small files or shuffles.
- Track lineage and reproducibility: source snapshots or versions, code/config versions, run identifiers, and quality results where supported.
- Test transformations with small fixtures; separately verify storage, scheduler, and recovery behavior with integration tests.
