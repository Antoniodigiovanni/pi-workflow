# Testing strategy

Pick the lowest-cost test that can meaningfully falsify the intended behavior. Test boundaries explicitly and keep local checks fast enough to run during implementation.

| Layer | Use | Typical evidence |
| --- | --- | --- |
| Unit | Deterministic logic and transformations | Small synthetic fixtures, isolated side effects |
| Integration | Contract with a real dependency | Database, filesystem, cloud, Databricks, queue, registry, API, or serving stack |
| End-to-end | Critical flow across components | A few representative user or job journeys |
| Regression | Previously observed failure | The old failure fails before the fix and passes after it |
| Property/invariant | Broad constraints | Balances, monotonicity, schema, conservation, ranking, round trips |
| Performance | Material capacity or resource risk | Latency, throughput, memory, Spark shuffles, GPU use, batch size |

Use unit tests for business rules and pure transformations. In PySpark, a local `local[2]` session and small DataFrames normally suffice for transformation behavior. Test schema when contractual, and compare unordered results without assuming row order. Keep credentials and network access out of ordinary unit tests.

Integration tests prove actual boundary semantics and should use dedicated test resources. They may run in CI or a remote environment when local substitutes cannot represent permissions, Delta behavior, Databricks Runtime, storage, or serving infrastructure. State which boundary remained untested locally.

Select end-to-end tests for high-value flows; do not use a large, costly flow to replace narrower tests. Separate performance measurements from correctness assertions unless a quantitative limit is itself the contract. For bug fixes, add a regression test when feasible and proportionate. Do not write tests merely to increase line coverage.
