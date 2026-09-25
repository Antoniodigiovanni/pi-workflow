---
name: code-review
description: Review a patch or pull request for actionable correctness, regression, test, reliability, security, and operations findings.
---

# Code review

Read the diff, relevant surrounding code, tests, and project conventions. Prioritize concrete findings by impact and likelihood; cite file and line. State the failure scenario and why existing checks would miss it. Avoid speculative style complaints.

Check behavior and compatibility, boundary assumptions, error handling, data integrity, concurrency, performance where material, security, and deployment effects. Identify missing tests only when they guard a meaningful risk. If no actionable findings remain, say so and note the validation scope.
