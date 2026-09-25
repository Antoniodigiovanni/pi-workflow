# Design philosophy

Use Pi's least powerful useful primitive. The global `AGENTS.md` carries short rules that apply almost everywhere; skills carry domain-specific decisions; prompts give an explicit task workflow; project context provides local facts. Pi loads context files together and skills only when relevant, so each layer should avoid repeating the others.

Software engineering is the scope here: code structure, correctness, tests, configuration, release, and operations. Scientific hypotheses, experimental comparisons, and interpretation belong to the research workflow when it is present. The engineering workflow works independently when no research workflow is installed.

Good guidance changes a decision. A skill should say which boundary to test, what failure mode matters, or when platform integration is necessary. Avoid generic checklists detached from system type. Choose the smallest coherent change and use existing project tools.

Code aesthetics matter as a form of clarity. Clear naming, coherent structure, and readable formatting reduce the effort of understanding and changing code. Prefer that quality within the project's established style; do not turn a task into an unrelated restyling pass.

Project `AGENTS.md` should record versions, commands, deployment targets, protected locations, and architectural constraints. Pi concatenates it with the global file; there is no formal override syntax. Treat concrete local facts as the implementation context, and surface true conflicts for resolution.

Extensions can execute code and hold state, but this repository has no need for one today. Introduce one only for a recurring executable capability that cannot be expressed cleanly by instructions, prompts, project code, or a simple script. Do not centralize ordinary coding decisions in an always-on extension.
