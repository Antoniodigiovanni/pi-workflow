---
description: Investigate an operational failure and contain its recurrence
argument-hint: "<incident, run, or symptom>"
---
Investigate failure: $@

Establish timeline, affected scope, symptoms, and available logs/metrics without mutating production state. Identify the failing layer and competing explanations; verify the most likely cause with evidence. Separate immediate containment from permanent correction. If implementation is requested, add a regression or integration test where feasible, make a scoped fix, and validate it. Report impact, root cause confidence, checks, and remaining operational actions.
