# Continuous improvement

Keep lessons as evidence-backed proposals, not a growing list of vague commands. A useful lesson names the context, observed failure or repeated correction, root cause, and a narrower rule or test that would have prevented it.

## Capture

Store private or cross-project notes in `${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}/lessons/` using [the template](lesson-template.md). This directory is a convention, not a Pi feature: Pi does not automatically load or act on these files. Keep project-sensitive lessons in the relevant repository instead, and do not put secrets in either location.

After a concrete implementation bug, add a regression test when practical. Record whether one was added and why not if omitted. Capture only failures with a plausible reusable lesson or a recurring preference; isolated trivia need not become policy.

## Route

| Destination | Use when |
| --- | --- |
| Project code/test | The behavior itself was wrong; a regression test can guard it |
| Project `AGENTS.md` | The rule depends on this repository's commands, data, architecture, or deployment |
| Global `AGENTS.md` | The lesson applies broadly across software projects |
| Domain skill | The lesson affects a specific technology or engineering domain |
| Reusable prompt | The failure is in a repeatable task workflow or handoff |
| Extension/tool behavior | Reliable capture, state, or execution is genuinely needed |

Prefer the narrowest effective layer. Avoid repeating the same rule in several places. Every durable rule should tie to a failure mode, recurring preference, or useful engineering principle.

## Review

Use `/review-lessons` periodically. Group repeated causes, confirm tests, and propose precise changes. Low-risk clarifications to docs or examples may be applied directly. Propose high-impact changes to global instructions, skill behavior, prompts, or executable tooling for review before applying them. Record the decision and remove or archive addressed lessons so the queue remains useful.

No autonomous mutation of global rules or extension-based learning loop is implemented. That choice keeps behavior stable and reviewable while experience accumulates.
