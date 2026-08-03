---
tags: []
---
# 8. Runtime Bridge Model

MD-Editor is a desktop app with a browser-style renderer, a Neutralino native runtime, and selected Node bridge processes. These layers are easy to confuse because they all run locally, but they have different capabilities and communicate through different channels.

This page explains the working model for choosing the right layer when implementing a feature.

## 8.1. Runtime Pieces

| Piece | Runs As | Main Role | Communication Channel |
| --- | --- | --- | --- |
| Renderer UI | JavaScript inside the Neutralino WebView | Renders tabs, editor, panels, settings, graph, API Client UI, and AI Companion UI. | Calls browser APIs, app modules, and `Neutralino.*` APIs. |
| Neutralino runtime | Native desktop process started by `run-neutralino.js` | Owns native desktop capabilities exposed by the allow list. | Persistent Neutralino client channel, implemented by `resources/js/neutralino.js`. |
| Node bridges | Child Node processes launched by the renderer through Neutralino | Run Node-only or long-running desktop work outside the renderer. | `spawnProcess` startup plus newline-delimited JSON over stdin/stdout. |

The renderer is not a general Node runtime. It can execute browser JavaScript and use the Neutralino APIs that are allowed by `neutralino.config.json`, but it cannot directly `require()` the CommonJS modules under `resources/ai-companion` or use Node-only APIs such as Node TLS agents.

## 8.2. Built-In Neutralino API Flow

Most file and app operations use the built-in Neutralino bridge, not a custom Node bridge.

Example renderer call:

```js
const content = await Neutralino.filesystem.readFile(path);
await Neutralino.filesystem.writeFile(path, nextContent);
await Neutralino.filesystem.remove(path);
```

Runtime flow:

```text
Renderer JavaScript in WebView
  Neutralino.filesystem.readFile(path)
        |
        v
Neutralino JavaScript client sends a method request
        |
        v
Already-running Neutralino native runtime
        |
        v
Native filesystem operation
        |
        v
Response returns to the renderer
```

Important properties:

- No new command is started for each file operation.
- No command-line payload is built for each file operation.
- No stdin/stdout protocol is used for these built-in calls.
- The operation goes through the already-running Neutralino runtime.

Use this path for normal desktop operations that Neutralino already exposes, such as file reads, file writes, directory reads, dialogs, storage, clipboard, and window events.

## 8.3. Node Bridge Flow

Use a Node bridge when the renderer needs work that is not just a built-in Neutralino API call.

Common reasons:

- The feature needs Node modules or CommonJS code loaded with `require()`.
- The feature needs Node HTTP, TLS, filesystem, process, or stream behavior that Neutralino does not expose directly.
- The operation is long-running and should stream progress.
- The operation needs cancellation, process cleanup, or compact structured events.
- The feature must isolate heavy work from the renderer thread.

Runtime flow:

```text
Renderer JavaScript in WebView
  Neutralino.os.spawnProcess("node bridge.cjs --request-file ...")
        |
        v
Neutralino native runtime starts a child Node process
        |
        v
Node bridge loads desktop-side modules
        |
        v
Renderer sends JSON lines through stdIn
        |
        v
Node bridge sends JSON events through stdout
        |
        v
Renderer matches events by request id
```

Unlike built-in Neutralino API calls, a custom bridge is a real child process. It has a startup command because the renderer must ask Neutralino to launch it.

## 8.4. AI Companion Bridge

AI Companion has both renderer-side UI and Node-side runtime code.

| File | Responsibility |
| --- | --- |
| `resources/js/ai-companion/panel.js` | Visible panel, composer, chat history UI, activity rendering, approvals. |
| `resources/js/ai-companion/neutralino-ai-bridge.js` | Renderer-side bridge session management. |
| `resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs` | Node process entry point and JSON protocol handler. |
| `resources/ai-companion/**` | Provider adapters, modes, workspace tools, approval policy, TLS certificate helpers. |

AI Companion uses a Node bridge because provider adapters and workspace tooling need Node-side behavior. Examples include:

- Loading CommonJS runtime modules with `require()`.
- Running provider adapters that use Node-compatible HTTP/TLS behavior.
- Inspecting server certificates and trusting app-scoped certificate fingerprints.
- Handling AI provider request/response debugging.
- Running the workspace tool loop while keeping renderer UI events compact (for a detailed breakdown of the agent loop, modes, and tool activation, see [AI Companion Agent Loop And Harness Internals](22-ai-companion-agent-loop-and-harnes-internals.md)).

Startup flow:

```text
AI Companion panel asks for a chat/test/autocomplete request
        |
        v
neutralino-ai-bridge.js ensures a bridge session exists
        |
        v
Renderer writes startup settings to a temp JSON request file
        |
        v
Renderer launches:
  node ai-companion-bridge.cjs --request-file <temp-json>
        |
        v
ai-companion-bridge.cjs reads and deletes the temp file
        |
        v
Bridge sends a ready event
        |
        v
Renderer sends request JSON over stdIn
```

The startup request file keeps the Windows command line short. Earlier versions passed a base64 startup payload as a command argument. That works for small settings, but it can fail when AI settings contain enough data to make the command line too long.

After startup, regular AI requests do not use command-line arguments. They use the stdio JSON protocol:

```text
Renderer -> stdIn:
{"id":"5","action":"chat","workspaceRoot":"C:/workspace/project",...}

Bridge -> stdout:
{"id":"5","type":"start","action":"chat"}
{"id":"5","type":"tool","tool":"list_files","summary":"running"}
{"id":"5","type":"debug","message":"[ai-companion] Request sent",...}
{"id":"5","type":"done","result":{...}}
```

## 8.5. Why File Browser Does Not Use The AI Bridge

The file browser, folder tree, file viewer, and save workflows mostly need operations Neutralino already provides:

```js
Neutralino.filesystem.readDirectory(folderPath);
Neutralino.filesystem.readFile(filePath);
Neutralino.filesystem.writeFile(filePath, content);
Neutralino.filesystem.remove(filePath);
Neutralino.os.showOpenDialog(options);
```

Those features do not need to launch a custom Node process because the built-in Neutralino runtime already owns the required native operations.

AI Companion is different because it needs a Node runtime for provider adapters, TLS behavior, and the tool loop. The bridge is not there to read ordinary files for the UI; it is there to run desktop-side AI runtime code safely outside the renderer.

## 8.6. Choosing A Communication Path

Use this decision table before adding new desktop work:

| Need | Preferred Path |
| --- | --- |
| Read, write, delete, or list local files from UI code | `Neutralino.filesystem.*` |
| Show file/folder/save dialogs | `Neutralino.os.showOpenDialog()`, `showFolderDialog()`, `showSaveDialog()` |
| Store app profile values | Existing profile helpers or `Neutralino.storage.*` where already used |
| Run a short, bounded command and return one result | `Neutralino.os.execCommand()` if already allowed and safe |
| Stream process output or keep a session alive | Node bridge through `spawnProcess()` and stdio |
| Use Node modules, Node TLS, custom CA trust, or provider adapters | Node bridge |
| Perform long-running work with cancellation and structured progress | Node bridge |

## 8.7. Implementation Rules

- Guard every `Neutralino.*` call because tests and helper contexts may not provide every native API.
- Keep renderer messages compact. Large startup payloads should go through temp files, not command-line arguments.
- Keep bridge protocols line-oriented JSON with request ids.
- Let the bridge convert noisy process output into compact structured events.
- Delete temp request files after the bridge reads them.
- Keep the legacy base64 startup argument path only as compatibility fallback when a bridge already supports it.

Previous: [7. Build And Release](07-build-and-release.md)  
Next: [Contributing](contributing.md)