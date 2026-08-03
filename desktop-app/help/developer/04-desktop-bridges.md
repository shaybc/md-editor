---
tags: []
---
﻿# 4. Desktop Bridges

Desktop bridges isolate native subprocess work from the renderer. Use a bridge when work may stream output, run for a long time, require Node libraries, or need cancellation.

For the wider runtime model, including how built-in `Neutralino.*` APIs differ from custom Node bridges, see [8. Runtime Bridge Model](08-runtime-bridge-model.md).

## 4.1. Bridge Pattern

Recommended bridge shape:

1. Renderer launches a Node bridge with `Neutralino.os.spawnProcess(command, options)`.
2. Renderer listens for `Neutralino.events.on("spawnedProcess", handler)`.
3. Renderer sends newline-delimited JSON through `Neutralino.os.updateSpawnedProcess(processId, "stdIn", jsonLine)`.
4. Bridge captures subprocess output internally.
5. Bridge returns compact JSON messages to stdout.
6. Renderer matches responses by request/session id.
7. Renderer sends cancel/close messages when the user closes a tab, folder, panel, or app.

Business reason: this prevents heavy stdout streams or slow native processes from freezing the UI and gives the app a controlled cancellation path.

## 4.2. AI Companion Bridge

| File | Role |
| --- | --- |
| `resources/js/ai-companion/neutralino-ai-bridge.js` | Renderer-side bridge session management. |
| `resources/ai-companion/**` | Provider adapters, modes, tools, approval policy, and shared AI runtime pieces. |
| `resources/js/ai-companion/panel.js` | Chat/agent/autocomplete panel UI and request orchestration. |

Key functions and concepts:

- `registerMarkdownViewerAiCompanionPanel()` registers the panel.
- `Neutralino.os.spawnProcess()` starts bridge sessions.
- `Neutralino.os.updateSpawnedProcess()` sends bridge input.
- `spawnedProcess` events carry stdout/stderr/exit messages.
- Approval cards and tool activity render through `activity-renderer.js`. For the harness, conversation history, and token accounting internals, see [9. AI Companion Internals](09-ai-companion-internals.md) and [AI Companion Agent Loop And Harness Internals](22-ai-companion-agent-loop-and-harnes-internals.md).

## 4.3. Git Bridge

![Git panel with branch, fetch, pull, status, and changed files](../img/git.png)

| File | Role |
| --- | --- |
| `resources/js/git/workspace-git.js` | Git panel UI, command selection, status rendering, branch/tag/stash/diff behavior. |
| `resources/bridges/git-bridge/git-bridge.cjs` | Node bridge using Git/simple-git style operations and JSON responses. |

Key workflows:

- Status and branch reads should stay read-only until the user triggers a mutation.
- Mutating actions such as stage, commit, discard, pull, merge, or rebase must be explicit and confirmation-aware.
- Conflict compare flows connect Git data to `resources/js/files/compare.js`.

## 4.4. Terminal Bridge

![Terminal panel opened inside the desktop app](../img/open-terminal-panel.png)

| File | Role |
| --- | --- |
| `resources/js/terminal/desktop-terminal.js` | Renderer terminal sessions, xterm binding, bridge input/output routing. |
| `resources/bridges/terminal-bridge/terminal-bridge.cjs` | Node PTY bridge for CMD, PowerShell, Git Bash, and other shells. |

Important functions in `desktop-terminal.js` include session start/stop handlers, spawned-process event routing, and terminal input forwarding.

## 4.5. API Client Bridge

| File | Role |
| --- | --- |
| `resources/js/tools/api-client/api-client.js` | API Client tabs, request editor, response preview, environment UI. |
| `resources/js/tools/api-client/storage.js` | Saved requests, environments, history, cookies, profile persistence. |
| `resources/bridges/api-client-bridge/api-client-bridge.cjs` | Desktop-side request execution when native process behavior is needed. |

Functions to inspect:

- `openApiClient()` opens or focuses the API Client.
- `mountApiClientTab(tab, root)` renders an API request tab.
- `refreshFromStorage(options)` reloads saved request trees after external/agent changes.

## 4.6. Bridge Safety Checklist

Before adding or changing a bridge:

- Define a small JSON protocol.
- Include request ids for matching responses.
- Capture heavy stdout/stderr inside the bridge.
- Return one compact result message per request when possible.
- Add cancellation and close behavior.
- Kill child processes on close.
- Validate paths and commands before execution.
- Add parser/protocol Node tests.
- Add a Playwright test if the bridge changes visible UI behavior.

Previous: [3. Modules](03-modules.md)  
Next: [5. Files, Folders, And Graph](05-files-folders-and-graph.md)
