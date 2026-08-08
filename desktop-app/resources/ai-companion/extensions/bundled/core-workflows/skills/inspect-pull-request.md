---
id: inspect-pull-request
name: Inspect a Pull Request
description: Review a pull-request change set for concrete correctness, safety, and test gaps.
usage: Use when the user explicitly asks for pull-request review.
aliases: [review-pull-request]
triggers: [review pull request, inspect proposed changes]
argumentHint: "[pull request reference]"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, git_status, git_diff, read_file, search_text, run_command]
requiredTools: [git_diff]
---
Establish the intended change and inspect the complete diff before judging individual lines. Trace affected call paths and contracts, then look for reproducible correctness defects, security regressions, compatibility breaks, and missing tests. Verify each finding against surrounding code and avoid speculative style commentary. Report actionable findings in severity order with precise locations; if none are found, say so and describe remaining verification risk.
