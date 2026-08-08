---
id: refine-change
name: Refine a Change
description: Simplify or restructure a selected implementation while preserving its observable behavior.
usage: Use for focused simplification, cleanup, or refactoring requests.
aliases: [simplify-change, refactor-change]
triggers: [simplify implementation, refactor selected code]
argumentHint: "[target or constraint]"
allowedModes: [agent]
allowedTools: [skill_invoke, capability_search, list_files, glob_files, search_text, read_file, apply_edit, write_file, run_command, worker_launch, worker_list, worker_wait]
---
Identify the exact behavior and boundaries that must remain stable. Read the owning implementation and its focused tests before editing. Prefer the smallest structural improvement that removes real complexity, duplication, or confusing control flow. Do not broaden the public API or mix unrelated cleanup into the change. Run proportionate verification and explain both the improvement and the preserved behavior.
