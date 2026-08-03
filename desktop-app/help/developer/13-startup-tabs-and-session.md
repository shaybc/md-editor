---
tags: []
---
# 13. Startup, Tabs, And Session Restore

Startup restores preferences, tabs, and the last folder in a controlled order so the first visible workspace matches the user's settings.

## Startup Sequence

| Step | Owner | Purpose |
| --- | --- | --- |
| Native launch | `desktop-app/run-neutralino.js` | Launches Neutralino, validates resources, exposes auth data, and records startup diagnostics when enabled. |
| Neutralino ready | `resources/js/main.js` | Initializes Neutralino and window lifecycle hooks. |
| Renderer bootstrap | `resources/js/script.js` | Registers modules, hydrates preferences, restores tabs, and starts folder restoration. |
| Preference hydration | `hydrateGlobalStateFromProfile()` | Reads desktop profile preferences into local state before tab startup where possible. |
| Tab hydration | `hydrateTabsSessionFromProfile()` | Reads the typed tab-session profile payload and seeds tab storage. |
| Tab initialization | `initTabs()` in `resources/js/tabs/index.js` | Restores last tabs, opens welcome, or opens an untitled tab based on startup behavior. |
| Folder restore | `restoreLastFolderOnStartupIfNeeded()` | Reopens the last folder when preferences allow it. |

## Startup Behavior Modes

The `startupBehavior` preference controls the first tab set:

| Value | Behavior |
| --- | --- |
| `last-tabs` | Restore the saved tab session when a valid session exists. |
| `welcome` | Open the Welcome/Help starting page. |
| `untitled` | Open a clean untitled Markdown tab. |

The folder restore preference is separate from tab restore. A user may restore tabs without reopening the last folder, or reopen the folder while starting from a clean tab.

## Tab Session Payload

Tab sessions are written to the desktop profile from `resources/js/tabs/persistence.js` and flushed through `resources/js/tabs/profile-write-gate.js`.

The payload stores lightweight tab descriptors and writes large dirty drafts separately. This keeps profile startup quick and avoids storing full source-backed file content inside every descriptor.

Important concepts:

- Source-backed Markdown tabs reopen from disk when possible.
- Dirty unsaved content is stored as a draft payload.
- Graph tabs store graph view state, graph source metadata, and draft graph content when needed.
- Old or invalid session payloads are ignored.
- Profile writes can be paused during operations that should not persist transient state.

## Tab Lifecycle

`resources/js/tabs/index.js` owns tab creation, activation, rendering, reordering, duplication, close, dirty state, and active tab persistence. `resources/js/tabs/view-manager.js` owns the DOM surfaces for specialized tab types such as graph, API Client, compare, preview, and editor tabs.

Temporary tabs are previews that can be replaced by later navigation. Permanent tabs are expected to remain until the user closes them.

## Shutdown And Flush

`flushCurrentTabSession()` writes the current tab state on pagehide, beforeunload, and Neutralino window close. Desktop shutdown also stops terminal and language-server processes before exit.

Previous: [12. Settings Preference Map](12-settings-preference-map.md)  
Next: [14. Markdown Preview And HTML Internals](14-markdown-preview-and-html.md)
