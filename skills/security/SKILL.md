---
name: security
description: Address task-relevant software security risks around credentials, input, dependencies, data exposure, and privilege.
---

# Pragmatic security

Inspect material risks in the changed path; do not turn every task into a broad audit.

- Keep secrets out of source, tests, logs, artifacts, and client bundles. Separate development and production credentials and use least privilege.
- Validate untrusted inputs; protect queries and commands from injection, and constrain path handling to intended roots.
- Treat deserialization and artifact loading as trust boundaries, especially for model files and job payloads.
- Check dependency provenance and newly introduced risk in proportion to the change. Avoid silent version upgrades.
- Preserve authentication and authorization at service and data boundaries; flag accidental exposure of personal or proprietary data.
- Report material risk with a concrete exploit path or failure mode and a scoped mitigation.
