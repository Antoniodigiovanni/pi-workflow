---
name: infrastructure
description: Change deployment and runtime configuration for bare metal, VMs, containers, Kubernetes, cloud, Databricks, or serverless systems.
---

# Infrastructure and deployment

Identify the actual deployment model before proposing changes. Do not containerize a bare-metal or VM project merely for uniformity.

- Preserve the project's provisioning, CI/CD, and environment conventions. Make versions and dependencies reproducible; distinguish build-time from runtime configuration.
- Keep secrets out of source, images, logs, and command output. Use the target platform's secret and access controls.
- Check process supervision and restart behavior (including systemd on bare metal where appropriate), health checks, ports/networking, resource requirements, persistent storage, and backup implications.
- For Docker/Kubernetes, verify image provenance, signals, limits, probes, and stateful dependencies. For managed cloud, Databricks, and serverless, check platform-specific lifecycle, limits, and permissions.
- Plan rollout, rollback, migrations, and deployment validation. Inspect the exact target and impact before destructive or expensive commands; state what requires live verification.
