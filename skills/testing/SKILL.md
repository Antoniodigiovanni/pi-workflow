---
name: testing
description: Design or improve software tests around behavior, boundaries, regressions, invariants, and performance risk.
---

# Testing

Choose the cheapest layer that proves the behavior. See `docs/testing-strategy.md` in pi-workflow for the full strategy.

- Unit tests: fast, deterministic, isolated, with small synthetic fixtures; cover domain logic and transformations without infrastructure when possible.
- Integration tests: exercise real boundaries such as databases, filesystems, storage, cloud services, Databricks, registries, queues, external APIs, or serving infrastructure. Isolate credentials and mutable test resources.
- End-to-end tests: use selectively for critical flows, rather than as a substitute for narrower tests.
- Regression tests: reproduce a fixed bug when feasible. Test observable behavior, not only the implementation shape.
- Property/invariant tests: use when examples under-specify constraints such as balances, monotonicity, schema, conservation, ranking, or serialization round trips.
- Performance tests: measure latency, throughput, memory, shuffles, GPU usage, batch size, or capacity when those are material. Keep benchmark thresholds separate from ordinary correctness checks unless the contract explicitly includes one.

Run focused checks during development and the repository's expected local suite at completion; report missing external validation.
