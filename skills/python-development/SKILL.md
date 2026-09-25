---
name: python-development
description: Implement and maintain Python packages, applications, and scripts using a project's existing tooling and packaging conventions.
---

# Python development

- Identify the supported Python version, environment and package manager, source layout, type checking, formatting, linting, and test commands before editing.
- Keep reusable behavior in importable modules. Use scripts, CLIs, and notebooks as entry points with explicit arguments and configuration.
- Make state, IO, time, and randomness injectable where testing or reproducibility matters. Keep pure logic independent of external services when practical.
- Use types at public boundaries where the project supports them; preserve clear exception semantics and avoid swallowing failures.
- Add dependencies only for a demonstrated need and update the project's lockfile through its own tooling. Validate in its expected environment.
