---
tags: []
---
﻿# 6. Testing

The desktop test suite lives under `desktop-app/tests`. Use tests to protect both implementation details and user workflows.

## 6.1. Test Types

| Type | Command | When To Use |
| --- | --- | --- |
| Syntax checks | `npm run check:js` | After editing runtime JS, Playwright specs, helpers, or launcher files. |
| Node tests | `npm test` | Pure helpers, parsers, protocol logic, source invariants, storage, converters, bridge behavior. |
| Single Node test | `node --test tests/<file>.test.js` | Fast validation while editing one feature. |
| Playwright tests | `npm run test:e2e` | Visible desktop workflows and interactions. |
| Single Playwright spec | `npx playwright test <spec-name>` | Focused UI validation. |

## 6.2. Existing Test Landmarks

| Area | Example Files |
| --- | --- |
| Migration/source invariants | `tests/migration-smoke.test.js` |
| Tabs/session | `tests/e2e/startup-tabs-advanced.spec.js`, `tests/e2e/tab-reorder.spec.js` |
| Folder/sidebar | `tests/e2e/sidebar-desktop-ui.spec.js`, `tests/e2e/sidebar-advanced-ui.spec.js` |
| Graph | `tests/graph-extraction.test.js`, `tests/graph-health.test.js`, `tests/e2e/graph-ui.spec.js` |
| Code converter | `tests/code-converter-csharp.test.js`, `tests/e2e/code-converter-ui.spec.js` |
| API Client | `tests/api-client-tool.test.js`, API Client storage/render tests |
| AI Companion | `tests/ai-*.test.js`, `tests/ai-companion-*.test.js` |
| Help docs | `tests/help-docs.test.js` |

## 6.3. What To Test By Change Type

| Change Type | Recommended Tests |
| --- | --- |
| Pure parser/helper | Node test with direct inputs and outputs. |
| Renderer module registration | Source invariant or migration-smoke test. |
| File open/save behavior | Node tests for helper logic plus Playwright for user path. |
| Folder tree performance | Unit/source test for lazy behavior plus targeted Playwright if visible. |
| Bridge protocol | Node tests for protocol parsing, cancellation, and errors. |
| Graph extraction | Node tests using small Markdown samples. |
| Graph rendering UI | Playwright test with a temp workspace. |
| Help documentation | `node --test tests/help-docs.test.js`. |

## 6.4. Help Documentation Test

![Settings debug panel used when validating desktop behavior](../img/settings-debug.png)

`tests/help-docs.test.js` checks that:

- local Markdown links inside `desktop-app/help` resolve;
- screenshot paths exist;
- stale source-of-truth instructions do not reappear in the new guide.

If you add a new Help page, link it from the index or another page and run:

```bash
node --test tests/help-docs.test.js
```

## 6.5. Playwright Desktop Pattern

Desktop E2E tests use helpers under `tests/helpers` and fixtures under `tests/e2e`.

Important helpers:

- `openApp(page)` starts or prepares the app page.
- `openActionMenu(page)` opens the desktop action menu.
- `openDesktopFolder(page, path)` opens a temp workspace folder.
- `createTempWorkspace()` and `createWorkspaceTree()` build test folders.
- `removeTempWorkspace()` cleans up.

Prefer temp workspaces over real user paths. Tests should not depend on `Downloads`, profile state, or existing local repositories.

Previous: [5. Files, Folders, And Graph](05-files-folders-and-graph.md)  
Next: [7. Build And Release](07-build-and-release.md)
