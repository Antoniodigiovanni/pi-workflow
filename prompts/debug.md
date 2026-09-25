---
description: Reproduce and fix a bug at its root cause
argument-hint: "<failure or symptom>"
---
Debug: $@

Reproduce the failure where possible and identify the failing layer. Inspect evidence before changing code; avoid speculative fixes. Add a regression test when feasible, fix the root cause with a scoped change, and run focused and expected local checks. Report the cause, evidence, fix, validation, and any uncertainty.
