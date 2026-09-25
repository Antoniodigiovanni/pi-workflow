# Engineering standard

Apply this standard to software work in any project. Read the project's own `AGENTS.md` and follow its concrete commands, versions, architecture, and safety constraints. If instructions conflict, surface the conflict rather than silently choosing a risky interpretation.

## Before changing code

- Inspect the relevant architecture, nearby code, tests, dependencies, and configuration. Find existing abstractions before adding new ones; do not assume a repository layout.
- Follow the project's established package manager, environment, formatting, linting, type checking, testing, CI, deployment, logging, and configuration conventions. Change them only for a clear task-related reason.
- Make the smallest coherent change. Avoid unrelated refactors, dependency churn, speculative frameworks, and rewrites. Small enabling refactors are appropriate when needed for correctness, testability, maintainability, or clear boundaries.
- Prefer explicit inputs and outputs. Separate domain logic from infrastructure, transformations from IO, training from orchestration, model definition from serving transport, data access from domain logic, and configuration from implementation where useful.
- Make code aesthetically clear: use names, structure, and formatting that make its purpose easy to see. Favor simple, cohesive code that is pleasant to read and change. Respect project style and avoid cosmetic churn unrelated to the task.
- Do not perform destructive, irreversible, production, or externally visible actions unless explicitly requested.

## Validate the change

- Treat validation as part of implementation. Add or update tests for changed deterministic behavior; preserve a bug as a regression test when practical.
- Run a focused test subset while working, then the project's expected local checks before completion. Report checks that could not run. Never claim success without evidence.
- Before adding a dependency, check existing capabilities and assess maintenance, runtime size, and compatibility. Avoid unrelated upgrades.
- For production systems, assess relevant failure modes: idempotency, retries, concurrency, resource use, observability, configuration, data integrity, security, compatibility, migrations, deployment, and rollback. Apply these in proportion to the change.

## Learn from failures

When a mistake or repeated correction reveals a reusable lesson, capture its context and root cause. Put concrete failures into regression tests first; choose project code/tests, project `AGENTS.md`, this global standard, a domain skill, a prompt, or tooling according to scope. Propose high-impact global behavior changes for review; low-risk documentation and example improvements may be made directly. Do not accumulate vague rules. See `docs/continuous-improvement.md` in the `pi-workflow` repository when available.

## Git workflow

- Unless instructed otherwise, make changes on a dedicated branch. Do not commit directly to the default branch.
- Work until the change is ready for review: implementation complete, relevant tests passing, and documentation updated where needed.
- Stop at PR-ready state. Do not merge, rebase onto the default branch, force-push, or deploy without explicit instruction.

## Completion

Briefly report what changed and why, files and tests changed, validation commands and results, external or production checks still needed, and material risks or follow-ups.
