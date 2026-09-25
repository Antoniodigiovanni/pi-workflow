---
name: production-readiness
description: Assess and close production gaps for a concrete application, pipeline, training system, or serving workload.
---

# Production readiness

Determine the system type, users, deployment target, operational owner, and critical failure modes. Assess only applicable areas and rank gaps by consequence. When asked to productionize, implement the highest-value in-scope improvements and validate them; do not add infrastructure by default.

Consider correctness and test evidence, configuration and secrets, observability, failure recovery, deployment and rollback, performance and scalability, data integrity, compatibility and migrations, ownership, and runbook needs. For data or ML workloads, include data/model versions and reproducibility; for online serving, include capacity, readiness, and latency; for scheduled jobs, include reruns and missed-run recovery. Separate local evidence from checks that require staging or production access.
