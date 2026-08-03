---
tags: []
---
# 11. LSP Integration Internals

Language Server Protocol support is desktop-only because it launches local language-server processes and communicates over stdio.

## 11.1. Components

| Component | Current Path | Responsibility |
| --- | --- | --- |
| Server registry | `desktop-app/resources/js/lsp/server-registry.js` | Server recipes, language mapping, install status, launch descriptors. |
| Installer | `desktop-app/resources/js/lsp/vsix-installer.js` | Download/install/remove language-server packages and bundled artifacts. |
| Neutralino bridge | `desktop-app/resources/js/lsp/neutralino-lsp-bridge.js` | Spawn processes and route JSON-RPC between CodeMirror and servers. |
| CodeMirror bundle | `desktop-app/resources/js/vendor/codemirror.bundle.js` | CodeMirror editor and LSP client integration. |
| Shutdown helper | `desktop-app/resources/js/desktop-lsp-shutdown.js` | Cleanup support for desktop sessions. |
| Launcher | `desktop-app/run-neutralino.js` | Desktop process supervision and child cleanup. |

## 11.2. Supported Server Families

| Server ID | Languages |
| --- | --- |
| `typescript` | JavaScript and TypeScript. |
| `java` | Java through Eclipse JDT LS. |
| `python` | Python through Pyright. |
| `html` | HTML. |
| `css` | CSS and SCSS. |
| `json` | JSON. |
| `xml` | XML and Maven/POM files through LemMinX. |
| `yaml` | YAML. |
| `bash` | Shell scripts. |
| `dockerfile` | Dockerfile and compose-related roots. |
| `windows-scripting` | PowerShell, batch, CMD, and registry files. |

Some servers are bundled or can use bundled artifacts. Others are installed into the desktop profile under language-server folders.

## 11.3. Session Flow

1. An editor opens a file with a supported language id.
2. The registry resolves the matching server and workspace root.
3. The bridge reuses an existing `serverId:workspaceRoot` session or starts one.
4. CodeMirror sends initialize and document events through the bridge.
5. The server returns completions, hover, diagnostics, and definition data.
6. Shutdown code cleans up running server processes when the app closes.

## 11.4. Maven/POM Support

Maven files use the XML server family with LemMinX Maven support when installed or bundled. The installer can locate bundled LemMinX Maven artifacts or download/install the extension package when network access is available.

## 11.5. Debugging

Enable the LSP debug category in Settings when diagnosing startup, install, or JSON-RPC routing issues. Useful evidence includes server id, workspace root, install source, launch descriptor, stdout/stderr events, and dropped malformed output.

## 11.6. Java Quick Fix Pipeline

Java Quick Fix uses standard LSP diagnostics, code actions, action resolution, and workspace edits:

1. `neutralino-lsp-bridge.js` publishes decoded server messages to feature subscribers without replacing CodeMirror's transport subscribers.
2. `quick-fix/diagnostic-store.js` retains raw JDT diagnostic fields and updates transient named Problems collections.
3. `quick-fix/java-provider.js` matches one live diagnostic and requests `textDocument/codeAction` with `only: ["quickfix"]`.
4. Lazy actions are resolved through `codeAction/resolve` only when selected.
5. `quick-fix/workspace-edit.js` validates and normalizes `changes` and `documentChanges` into modify/create/rename/delete preview operations.
6. `quick-fix/dialog.js` requires the affected-file preview before Apply.
7. `quick-fix/controller.js` coordinates transactional apply, grouped undo, JDT verification, optional rebuild, and the separate AI handoff.

The shared `lsp/request-client.js` owns JSON-RPC request ids, response correlation, timeout cleanup, and protocol errors. Java Organize Imports uses this client but retains its existing active-file and import-block restrictions.

Workspace edit safety rules:

- Accept only local `file:` URIs inside the active workspace.
- Use current open-buffer content as the edit baseline.
- Reject stale document versions and overlapping edits.
- Honor create/rename/delete overwrite and ignore options.
- Roll back earlier operations if a later operation fails.
- Keep source modifications unsaved in tabs.
- Never execute opaque command-only actions. The recognized JDT `java.apply.workspaceEdit` command is accepted only when its complete workspace edit is available for preview.

The Problems panel keeps persistent build diagnostics in its existing project collection and transient JDT diagnostics in URI-scoped collections. Matching records are deduplicated by normalized file, location, and message; the JDT record wins while retaining build-source metadata. Transient collections are never written to `.md-editor/problems.json`.

AI is not a source of synthetic code actions. When enabled, the Quick Fix AI entry starts the existing Agent workflow with the raw diagnostic, source content, selected range, workspace root, related diagnostics, and the Companion's existing build context. All edits continue through existing approvals.

Previous: [10. Project Metadata And Recovery](10-project-metadata-and-recovery.md)  
Next: [12. Settings Preference Map](12-settings-preference-map.md)
