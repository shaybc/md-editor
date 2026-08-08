---
id: record-change
name: Record a Change
description: Prepare and record an intentional source-control change without including unrelated work.
usage: Use when the user asks to commit the current scoped changes.
aliases: [commit-change]
triggers: [commit requested changes, record repository changes]
argumentHint: "[message guidance]"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, read_file, git_status, git_diff, git_stage, git_commit]
requiredTools: [git_status, git_diff, git_stage, git_commit]
---
Inspect repository status and the relevant diff before staging. Separate requested work from unrelated existing changes and never discard work to make the tree look clean. Stage only files belonging to the requested outcome, choose a concise commit message that describes that outcome, and create the commit. Read repository status again after the revision is created. Report the committed scope and call out anything deliberately left unstaged.
