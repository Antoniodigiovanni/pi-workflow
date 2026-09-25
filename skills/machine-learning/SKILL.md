---
name: machine-learning
description: Engineer reliable ML training and inference for an already defined modeling task; excludes hypothesis and experiment design.
---

# Machine learning engineering

Preserve the modeling question, metrics, splits, and experiment specification supplied by the user or research workflow. If implementation constraints require changing them, report the tradeoff before changing the scientific design.

- Establish train, validation, and test boundaries before fitting preprocessors or selecting models. Check leakage through time, groups, labels, and shared entities; use stratified evaluation when appropriate to the target and data.
- Maintain a simple baseline. Record seed, data/feature versions, code/config, environment, metrics, and artifact version so training is reproducible to the practical degree possible.
- Keep feature pipelines explicit and test missing-feature behavior and input/output contracts. Validate serialization and loadability of the exact promoted artifact.
- Check train/serve parity for preprocessing and postprocessing. Validate inference on representative, missing, and malformed inputs.
- Define retraining triggers and monitoring for data quality and drift where deployment warrants it. Keep deployment decisions distinct from offline evaluation results.
- Test deterministic pipeline logic and end-to-end inference with small synthetic data and cheap model configurations; do not run full training merely to verify engineering behavior.