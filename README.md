# pi-workflow

A reusable software engineering workflow for [Pi](https://github.com/earendil-works/pi): one concise global standard, focused on-demand skills, and slash-command prompt templates. It applies to applications, data pipelines, PySpark and Databricks projects, ML and deep learning systems, batch and online inference, and deployments from bare metal to cloud. It also works for research code moving toward production.

`pi-workflow` governs implementation, validation, deployment, and operational reliability. It is independent of `pi-research-scientist`, which owns scientific questions and experiment design. Both can be loaded in one session; see [the integration contract](docs/integration-with-pi-research-scientist.md).

## Architecture

| Layer | Purpose | Loaded by Pi |
| --- | --- | --- |
| `AGENTS.md` | Universal engineering standard | Every session after you add it to Pi's global context |
| `skills/*/SKILL.md` | Domain decisions and boundaries | On demand or via `/skill:name` |
| `prompts/*.md` | Repeatable task workflows such as `/implement` | When invoked |
| Project `AGENTS.md` | Runtime, commands, deployment, protected data, and local conventions | In that repository |

There is no extension or automatic rule mutation. Pi's native files already cover the current needs. See [philosophy](docs/philosophy.md), [testing](docs/testing-strategy.md), and [deployment](docs/deployment-strategy.md).

## Set up

Clone or fork this repository, then run this from the checkout to add its skills and prompts to Pi:

```sh
pi install .
pi list
```

Pi treats this checkout as a local package and discovers `skills/` and `prompts/`. Keep the checkout at a stable path; edits to those files are available after Pi `/reload` or a new session. To stop using the package, run `pi remove .` from the checkout. See [Pi's package documentation](https://github.com/earendil-works/pi/blob/main/packages/coding-agent/docs/packages.md) for other sources and package management.

Pi packages do not install a global `AGENTS.md`. If you have no global file yet, copy this repository's `AGENTS.md` to `~/.pi/agent/AGENTS.md` (or to `${PI_CODING_AGENT_DIR}/AGENTS.md` when that variable is set). On macOS or Linux:

```sh
mkdir -p ~/.pi/agent
cp AGENTS.md ~/.pi/agent/AGENTS.md
```

In PowerShell:

```powershell
New-Item -ItemType Directory -Force "$HOME/.pi/agent" | Out-Null
Copy-Item AGENTS.md "$HOME/.pi/agent/AGENTS.md"
```

Run the copy commands only when the destination file does not already exist. If it does, open both files and merge the engineering standard into your existing global instructions, resolving any conflicts. Pi loads the global file alongside each project's `AGENTS.md`; it does not merge their meanings for you. Changes to this repository's `AGENTS.md` must be copied or merged again manually.

To remove the workflow, run `pi remove .` from the checkout and remove only the text you added to the global `AGENTS.md`. If you used an older version of this repository's installer, run its `uninstall.sh` or `uninstall.ps1` from that older checkout before switching to the package. Pi's package command does not manage files created by that installer.

## Use

Pi exposes prompt files as `/implement`, `/debug`, `/test`, `/review`, `/refactor`, `/productionize`, `/investigate-failure`, `/architecture-review`, and `/review-lessons`. It can discover relevant skills automatically, or you can call `/skill:pyspark-development`, for example. Skills are composable; load only those relevant to the task.

Examples:

- Python backend: use `/implement add a paginated orders endpoint`; the global standard, `backend-development`, `python-development`, and `testing` guide a change within the project's framework and test commands.
- PySpark/Databricks: use `/debug customer deduplication drops tied events`; `pyspark-development` calls for a small local DataFrame regression test, while `databricks-development` covers any required Unity Catalog or Delta integration checks.
- ML training: use `/implement the agreed training specification`; `machine-learning` covers split integrity, artifact versioning, and train/serve parity. The experiment's scientific specification stays intact.
- Model serving: use `/productionize online scoring service`; `model-serving`, `backend-development`, `observability`, and `infrastructure` guide contracts, readiness, capacity, and rollout according to the actual deployment target.

For a project-specific `AGENTS.md`, record only concrete local facts, for example:

```markdown
# Project conventions
- Python 3.12; use uv with uv.lock.
- Run `uv run pytest -q`, `uv run ruff check .`, and `uv run pyright`.
- Deploy to a systemd service on the staging VM; production release requires operator approval.
- Never write to the production analytics schema from tests.
```

Pi concatenates global and project context files. Project facts specialize the global standard; do not copy its generic rules into every repository. If a project instruction conflicts with a global rule, resolve it explicitly. Pi also supports project `.pi/skills/` and `.pi/prompts/` after the project is trusted.

## Customize and improve

Fork the repo to change the baseline. Add a narrowly scoped skill under `skills/<name>/SKILL.md` with `name` and `description` frontmatter, or add a top-level `prompts/<command>.md`. You can keep personal additions directly in your Pi config without changing the fork. See [continuous improvement](docs/continuous-improvement.md) and [the lesson template](docs/lesson-template.md) for learning from failures.

## Repository layout

```text
pi-workflow/
├── AGENTS.md                 global engineering standard
├── skills/                   15 on-demand domain skills
├── prompts/                  9 slash-command workflows
└── docs/                     rationale, testing, deployment, lessons, integration
```

No Pi extension is included yet. A future extension is appropriate only if a repeated need requires executable session state or a tool, such as capturing structured lessons or enforcing a deployment gate. Global behavior changes should be reviewed before implementation.
