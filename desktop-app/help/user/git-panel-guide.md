---
tags: []
---
# Git Panel Guide

The Git panel works with the opened folder when that folder is inside a Git repository. It is meant for documentation work where editing, reviewing, comparing, and committing happen in the same workspace.

## Main Areas

| Area | Use |
| --- | --- |
| Repository summary | See current branch, tracking branch, ahead/behind state, and repository status. |
| Remote actions | Fetch, pull, push, or reset to the tracked remote branch when available. |
| Changed files | Stage, unstage, discard, compare, or inspect changed files. |
| Stash mode | Save selected work, view stash entries, compare stashed files, pop one stash, or drop selected stashes. |
| Branch menu | Switch branches, create/rename/delete branches, push branches, and inspect branch activity. |
| Tag menu | Create, delete, copy, and inspect tags. |
| AI summary | Ask AI Companion to summarize local changes and suggest commit text when AI Companion is configured. |

## Status And Diffs

The panel separates unstaged and staged changes in push mode. Click a changed file path to open a compare view. Conflict rows open conflict-oriented compare views when MD-Editor can detect the conflicted file state.

Discard is destructive. MD-Editor groups tracked, untracked, and conflicted files differently so it can issue the right Git operation, but the result still changes files on disk.

## Branches And Tags

The branch switcher is compact for small branch lists and opens a fuller branch dialog when the repository has more branch data. Branch actions are blocked when unsaved or uncommitted work would make the switch unsafe.

Branch activity reads recent activity for the selected branch so you can understand what changed before switching or deleting.

## Stash Mode

Stash mode focuses on temporary work.

- Create a stash from selected files.
- Include untracked selected files in the stash.
- Compare files inside a stash against the working tree.
- Pop exactly one selected stash.
- Drop one or more selected stashes.

If popping a stash would overwrite local changes, MD-Editor blocks the pop and explains what must be committed, stashed, or discarded first. If a stash pop creates conflicts, the Git panel keeps the conflict visible and points you to resolution.

## AI Git Summary

When AI Companion is enabled, the Git panel can collect a bounded digest of staged, unstaged, and unpushed changes. The assistant uses that digest to create a human-readable change summary and optional commit-message suggestion.

The AI summary does not commit for you. Review the generated text, copy it, or insert it into the commit message field before committing.

Related pages:

- [Tools](05-tools.md)
- [AI Companion Git Summary And Integrations](08-ai-companion/05-git-summary-and-integrations.md)

Previous: [5. Tools](05-tools.md)
Next: [API Client](api-client.md)
