# Deployment strategy

First discover where and how the project actually runs: bare metal, VM, Docker, Kubernetes, managed cloud, Databricks, or serverless. Preserve the established release mechanism and avoid introducing containers just because they are common elsewhere.

For any target, establish reproducible versions and configuration, external secret handling, resource needs, networking, persistent state, backup implications, startup and restart behavior, health checks, rollout and rollback, and a way to validate the deployed result. Make data or schema migrations compatible with the rollout order. Distinguish local tests from staging and production evidence.

On bare metal or VMs, check process supervision such as systemd, service user permissions, restart limits, logs, ports, and host-managed dependencies. For containers, check image construction, signal handling, volumes, and resource limits. For Kubernetes, check probes, rollout strategy, permissions, and persistent services. For managed cloud/serverless, check deployment revisions, limits, identity, and cold-start or event retry behavior. For Databricks, check Jobs/Workflows, compute type, runtime, workspace/catalog permissions, and controlled schemas.

Before a destructive or expensive operation, inspect its exact targets and consequences. The normal handoff states the commands run, validation observed, rollback path, and remaining live checks.
