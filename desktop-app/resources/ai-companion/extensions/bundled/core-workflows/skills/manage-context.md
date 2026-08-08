---
id: manage-context
name: Manage Active Context
description: Release stale tool observations during long runs while retaining artifact-backed access.
---

# Manage Active Context

Use this workflow only when a tool-heavy run has accumulated observations that no longer help the next decision. Ordinary conversation and short tasks do not need context management.

1. Call `context_observation_list` to inspect stable observation IDs, tools, age, size estimates, previews, and release eligibility.
2. Keep recent results, active errors, denied or cancelled actions, unknown outcomes, approval state, current work state, final-result evidence, and anything you may still cite or inspect.
3. Select only completed historical observations whose detailed bodies are no longer useful. Release them with one `context_release` call containing no more than twenty IDs and a short reason.
4. Check each returned outcome. A protected or unknown ID is not released; do not repeatedly request it unchanged.
5. If discarded detail becomes relevant later, retrieve the retained artifact with `artifact_read` using bounded offsets and lengths.

Releasing an observation is optional housekeeping. It does not prove task completion, replace verification, authorize actions, or alter user messages, assistant decisions, rules, plans, work items, or files. Each delegated worker manages only its own observation ledger.
