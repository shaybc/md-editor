---
tags: []
---
# 18. Workspace Tools Internals

This page maps the main non-editor tools to their implementation areas.

## File Compare

Main file: `resources/js/files/compare.js`.

File Compare creates a specialized tab with two inputs and result/merge surfaces. Git conflict workflows reuse this module through compare descriptors created by Git helpers.

Important responsibilities:

- Mount compare tabs through tab/view-manager surfaces.
- Preserve source labels and file paths.
- Parse conflict markers when a Git conflict descriptor is present.
- Save conflict-resolution output back to the working file when the user confirms.

## Sort Lines

Main file: `resources/js/editor/commands.js`.

Sort Lines works on the active editor selection or document content. Options include comparison mode, duplicate removal, and line-ending preservation. Keep editor operations routed through editor command helpers so CodeMirror and legacy editor state remain synchronized.

## Code To Markdown Converter

Main owner: `resources/js/script.js`, with converter assets under `desktop-app/converters/`.

The dialog gathers source root, destination root, language, and feature switches. Java conversion can invoke the packaged Java converter JAR and can pass Gradle/JDK/Maven recovery-related options based on settings.

Important helper areas:

- Converter path and JAR lookup.
- Destination/source folder dialogs.
- Progress, cancellation, and console output.
- Gradle launcher settings.
- Source-root metadata written into generated output.
- Graph health and Update Project follow-up flows.

## Line Counter

Line Counter scans the opened folder with exclusions for dependency, generated, log, build, and binary-like paths. It opens a Markdown report tab and can save that report as HTML.

Keep scan work responsive: avoid blocking the renderer with needless full-tree work when folder metadata is already available.

## Terminal

Terminal uses a desktop bridge and PTY process so shell sessions stay outside the renderer.

Main files:

| File | Responsibility |
| --- | --- |
| `resources/js/terminal/desktop-terminal.js` | Terminal UI, profile choice, tab/session behavior. |
| `resources/bridges/terminal-bridge/terminal-bridge.cjs` | PTY process bridge and stdio JSON protocol. |

Terminal startup should use the opened folder as the working directory when possible.

## API Client

Main files live under `resources/js/tools/api-client/`.

Key areas:

- `api-client.js`: request tab, send/cancel, response rendering, snippets, settings integration.
- `sidebar.js`: saved requests, history, environment sidebar, import/export actions.
- `storage.js`: profile-backed collections, history, environments, and cookies.
- `agent-tools.js`: AI Companion API Client tools.

Previous: [17. Git Integration Internals](17-git-integration-internals.md)  
Back to: [Developer Guide](index.md)
