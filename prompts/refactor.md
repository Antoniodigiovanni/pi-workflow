---
description: Refactor while preserving observable behavior
argument-hint: "<target and goal>"
---
Refactor: $@

Inspect callers, contracts, tests, and project conventions. State the behavior that must remain stable and choose a bounded change. Avoid bundling unrelated rewrites. Add characterization tests where behavior is under-specified, implement the refactor, and run focused and expected local validation. Inspect the diff for accidental behavior or dependency changes.
