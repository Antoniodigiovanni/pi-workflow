# Contract with pi-research-scientist

The two repositories can coexist without depending on each other.

`pi-research-scientist` decides what scientific question or experiment should exist: hypotheses, experiment design, baselines, metrics, ablations, evidence standards, and interpretation. `pi-workflow` decides how the resulting software is structured, implemented, tested for correctness, deployed, and operated.

| Research layer | Engineering layer |
| --- | --- |
| Formulate the hypothesis | Implement the agreed experiment safely |
| Define baseline, metrics, splits, and ablations | Structure code, data contracts, and reproducible configuration |
| Determine whether evidence supports a claim | Add correctness tests and local validation |
| Specify scientific evaluation | Build Databricks execution, package models, serve inference, and observe operations |

When implementing a research experiment, preserve its specification. A software constraint that changes the experiment, such as unavailable data, an incompatible split, or infeasible compute, must be reported back for a research decision. Do not silently substitute a metric, alter a cohort, or drop an ablation. Conversely, research instructions should not duplicate generic engineering tests, deployment practice, or API reliability rules.

Pi can load both systems' skills and project instructions. Keep names and descriptions specific to their ownership. If the research repository supplies a global `AGENTS.md`, Pi still has one global `~/.pi/agent/AGENTS.md` path (or `${PI_CODING_AGENT_DIR}/AGENTS.md` when configured). Merge the engineering standard into that file manually and resolve any contradictory instructions. Project context and focused skills remain another way to keep the systems separate.
