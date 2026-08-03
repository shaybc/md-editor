---
tags: []
---
# 17. Git Integration Internals

Git integration has a renderer-side panel and a Node bridge. The renderer owns UI state and command intent; the bridge owns Node/simple-git execution when the desktop runtime needs it.

## Main Files

| File | Responsibility |
| --- | --- |
| `resources/js/git/workspace-git.js` | Git panel state, rendering, command construction, status parsing, compare descriptors, branch/tag/stash UI, and AI summary digest. |
| `resources/bridges/git-bridge/git-bridge.cjs` | Node bridge for allowed Git actions and JSON responses. |
| `resources/js/files/compare.js` | Compare views and structured conflict resolution surface. |
| `resources/js/ai-companion/*` and `resources/ai-companion/*` | AI Git summary and Git panel tools. |
| `tests/workspace-git.test.js` | Parser, rendering, command, branch, stash, and conflict helper coverage. |

## Execution Model

The panel supports a fixed set of actions such as status, fetch, pull, push, stage, unstage, commit, compare, branch operations, tag operations, stash operations, reset-to-remote, discard, and changes digest.

Desktop execution can use:

- Direct renderer Neutralino command execution for simple commands.
- The Git bridge for structured simple-git operations and compare/stash snapshots.

Requests and responses are kept structured so UI code can render status, compare descriptors, errors, and follow-up state without parsing terminal text everywhere.

## Status Parsing

Status parsing turns porcelain output into:

- Repository availability.
- Current branch and tracking branch.
- Ahead/behind divergence.
- Staged and unstaged file lists.
- Renames and original paths.
- Conflict markers.
- Dirty-state checks used before branch switch or stash pop.

## Stash And Conflict Flows

Stash create includes selected files and untracked files. Stash pop is limited to one selected stash and is blocked when dirty files would be overwritten. Stash drop sorts refs from highest to lowest index so multiple drops do not shift later refs before they are dropped.

Conflict files render as conflict rows and can open conflict compare descriptors. `resources/js/files/compare.js` parses conflict markers and offers current/stashed/both choices where possible.

## Branch And Tag UI

Branch lists normalize local and remote names, choose compact or full switcher mode, and expose branch action menus. Branch activity uses Git log data for the selected branch.

Tag actions list, create, delete, and copy tags using normalized tag names.

## AI Summary

The changes digest caps staged, unstaged, and unpushed patch text before sending it to AI Companion. This avoids oversized prompts while preserving representative file names and diffs.

Previous: [16. Graph Controls Internals](16-graph-controls-internals.md)  
Next: [18. Workspace Tools Internals](18-workspace-tools-internals.md)
