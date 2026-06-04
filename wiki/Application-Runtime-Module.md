# Application Runtime Architecture

This document explains how the **MD-Editor** browser runtime starts, how the split modules connect, and what a new developer needs to know before changing runtime behavior.

The app is a static browser application. It does not use a bundler or ES module imports. Instead, `web-app/index.html` loads vendor libraries and local classic scripts in a fixed order. Each local module exposes a `window.registerMarkdownViewer...` registration function, and `web-app/script.js` composes those modules into the running app.

---

## Table of Contents

- [Runtime Role](#runtime-role)
- [Load Order](#load-order)
- [App Context](#app-context)
- [Composition Layer](#composition-layer)
- [Module Registration Pattern](#module-registration-pattern)
- [Runtime State](#runtime-state)
- [Registered Module Areas](#registered-module-areas)
- [Core Workflows](#core-workflows)
- [Browser and Desktop Compatibility](#browser-and-desktop-compatibility)
- [Storage and Persistence](#storage-and-persistence)
- [Security and Sanitization](#security-and-sanitization)
- [Performance Notes](#performance-notes)
- [External Dependencies](#external-dependencies)
- [Developer Change Guide](#developer-change-guide)
- [Related References](#related-references)

---

## Runtime Role

The runtime turns the static shell in `web-app/index.html` into an interactive Markdown workspace.

It coordinates:

- Markdown editing, live preview, syntax highlighting, Mermaid diagrams, MathJax math, frontmatter, emoji, alerts, and link handling.
- Tabs for Markdown documents and saved graph documents.
- File open/save flows in browsers and in the Neutralino desktop wrapper.
- Folder browsing, folder tree actions, tag management, and recent files/folders.
- Graph extraction, graph rendering, graph persistence, and graph exports.
- Markdown, HTML, PDF, graph JSON, Mermaid SVG/PNG, clipboard, and share URL export paths.
- User preferences for theme, layout, sidebar, dropzone, graph behavior, and render behavior.
- Browser/desktop compatibility branches without requiring a backend service.

`web-app/script.js` is no longer the only home for app behavior. It is the startup and composition layer, with many feature owners now living under `web-app/js/`.

---

## Load Order

`web-app/index.html` controls runtime load order. This matters because the app uses global registration functions.

1. Vendor libraries load first, including Markdown parsing, sanitization, diagrams, math, exports, compression, YAML parsing, graph rendering, Bootstrap, and icons/CSS.
2. `web-app/js/core/context.js` defines `window.createMarkdownViewerApp`.
3. `web-app/js/app.js` creates or reuses `window.markdownViewerApp` and records basic boot metadata after `DOMContentLoaded`.
4. Focused modules under `web-app/js/` load and attach registration functions to `window`.
5. `web-app/script.js` loads last, waits for `DOMContentLoaded`, collects DOM references, creates shared state, registers modules, and binds UI events.

Because `script.js` runs last, it can call every `window.registerMarkdownViewer...` function exposed by earlier local scripts.

---

## App Context

### `web-app/js/core/context.js`

Creates the shared application object:

```js
{
  constants: {},
  dom: {},
  state: {},
  actions: {},
  services: {},
  modules: {},
  registerModule(name, moduleApi) { ... }
}
```

### `web-app/js/app.js`

Creates `window.markdownViewerApp` if it does not already exist. It also records `app.bootedAt` and `app.documentReadyState` once the DOM is ready.

### Context Containers

| Container | Purpose |
|-----------|---------|
| `app.constants` | Shared constant values and storage keys. |
| `app.dom` | Shared DOM references that modules need. |
| `app.state` | Shared mutable state that modules need to read/write. |
| `app.actions` | User-level commands exposed for reuse by menus, keyboard shortcuts, desktop code, and other modules. |
| `app.services` | Cross-cutting service APIs such as clipboard, preferences, tabs, graph persistence, and folder picking. |
| `app.modules` | Registered module APIs by name for diagnostics and controlled cross-module access. |

New code should prefer explicit dependency objects passed during registration. Use `app.services` or `app.actions` when a capability must be reused across independent UI entry points.

---

## Composition Layer

### `web-app/script.js`

`script.js` is responsible for startup and orchestration:

- Waits for `DOMContentLoaded`.
- Creates or reuses `window.markdownViewerApp`.
- Collects DOM references from `index.html`.
- Initializes runtime variables for rendering, scrolling, folder state, tab state, graph state, editor modal state, and compatibility branches.
- Calls module registration functions in dependency order.
- Stores returned module APIs in local constants where legacy runtime functions still need them.
- Bridges older inline functions with newer modules while migration continues.
- Binds toolbar, menu, modal, editor, sidebar, graph, export, drag/drop, and keyboard events.
- Runs startup restore flows for preferences, recent items, tabs, shared URL hashes, and initial desktop files.

Think of `script.js` as the runtime conductor. Feature logic that can stand alone should live in a focused module under `web-app/js/`.

---

## Module Registration Pattern

Most module files follow this shape:

```js
(function (window) {
  "use strict";

  function registerMarkdownViewerExample(app, deps) {
    function doWork() {
      // use app, deps, and local helpers
    }

    const api = { doWork };
    app.registerModule("example", api);
    return api;
  }

  window.registerMarkdownViewerExample = registerMarkdownViewerExample;
})(window);
```

Current conventions:

- Registration functions are named with the historical `MarkdownViewer` prefix even though the app is now MD-Editor.
- Modules receive `app` plus a dependency object from `script.js`.
- Dependency objects often use getters so modules always read the current runtime value.
- Modules return a small API.
- Some modules also publish shared capabilities through `app.services` or `app.actions`.
- Not every module owns DOM binding directly. Many expose APIs that `script.js` binds to existing controls.

When moving code out of `script.js`, follow the local notes in `web-app/js/MIGRATION.md`.

---

## Runtime State

The app is local-first and event-driven. User actions update in-memory state, then the affected UI and persistence layers are refreshed.

| State Area | What It Tracks | Main Owners |
|------------|----------------|-------------|
| Editor | Current text, selection, line numbers, status text, syntax overlay, autocomplete, editor modals. | `script.js`, `editor/*.js`, `markdown/render.js` |
| Preview | Render debounce state, sanitized HTML, post-render Mermaid/MathJax/frontmatter/link enhancements, reading stats. | `script.js`, `markdown/*.js` |
| View layout | Editor/split/preview modes, sidebar state, dropzone state, pane sizes, mobile menu, sync scroll. | `ui/*.js`, `scroll-sync.js`, `script.js` |
| Tabs | Markdown tabs, graph tabs, active tab, source metadata, dirty state, untitled counters. | `tabs/*.js`, `unsaved-changes.js`, `graph/persistence.js` |
| Files/folders | Active folder, folder tree nodes, Markdown file entries, unsupported entries, sort/filter/tag filters. | `files/*.js`, `platform/folder-picker.js`, `sidebar/*.js` |
| Recent items | Recent files/folders, browser handles, desktop paths, profile sync. | `recent/*.js` |
| Tags | YAML tags, inline tags, known tags, selected filters, tag writes to files/tabs. | `tags/index.js`, `graph/extraction.js` |
| Graphs | Extracted nodes/links/tags, graph tabs, saved layouts, filters, groups, hidden nodes, stale comparisons. | `graph/*.js` |
| Exports | Current rendered output, graph export data, PDF/page-break state, Mermaid export state, clipboard output. | `script.js`, `export/page-breaks.js`, `clipboard.js`, `markdown/mermaid-tools.js` |

State that must survive reloads is stored in browser storage, IndexedDB, desktop profile files, or saved graph files. Temporary UI state stays in memory.

---

## Registered Module Areas

The current split modules are grouped by feature area.

| Area | Files | Runtime Responsibility |
|------|-------|------------------------|
| App context | `js/core/context.js`, `js/app.js` | Shared app object and boot metadata. |
| File platform | `js/platform/folder-picker.js`, `js/files/types.js`, `js/files/open.js`, `js/files/save.js` | File classification, browser/desktop open flows, folder picking, and save paths. |
| Preferences/layout | `js/ui/theme-preferences.js`, `js/ui/layout-preferences.js`, `js/ui/view-layout.js`, `js/ui/mobile-menu.js` | Theme, settings persistence, view modes, pane layout, and mobile controls. |
| Recent state | `js/recent/index.js`, `js/recent/actions.js` | Recent files/folders, handles, profile files, and recent item commands. |
| Editor | `js/editor/line-status.js`, `js/editor/status-line.js`, `js/editor/context-menu.js`, `js/editor/autocomplete.js`, `js/editor/syntax-highlight.js` | Editor overlays, status, formatting actions, autocomplete, and syntax highlighting. |
| Markdown | `js/markdown/frontmatter.js`, `js/markdown/renderer-config.js`, `js/markdown/links.js`, `js/markdown/mermaid-tools.js`, `js/markdown/render.js` | Render configuration, sanitized preview, links, frontmatter, diagrams, and post-render tools. |
| Graph | `js/graph/extraction.js`, `js/graph/persistence.js`, `js/graph/documents.js`, `js/graph/toolbar.js`, `js/graph/renderer.js` | Graph extraction, graph tabs/documents, persistence, toolbar state, and D3 rendering. |
| Tabs/tags | `js/tabs/counter.js`, `js/tabs/index.js`, `js/tags/index.js` | Tab lifecycle, tab counters, tag extraction, tag edits, and tag filters. |
| Sidebar | `js/sidebar/folder-toolbar.js`, `js/sidebar/context-tree.js` | Folder toolbar, folder tree rendering, and file/folder context actions. |
| Import | `js/import/dropped-items.js`, `js/import/drag-drop.js`, `js/import/github.js` | Dropped files/folders/text/graph data and GitHub Markdown import. |
| Utilities | `js/clipboard.js`, `js/scroll-sync.js`, `js/unsaved-changes.js`, `js/share-url.js`, `js/keyboard-shortcuts.js` | Clipboard, synchronized scrolling, dirty-state protection, compressed share URLs, and app shortcuts. |
| Export helpers | `js/export/page-breaks.js` | PDF page-break UI/state used by export workflows. |

`script.js` still contains runtime functions for modal lifecycles, export commands, desktop bridge helpers, code converter dialog wiring, and compatibility glue that has not been moved into focused modules yet.

---

## Core Workflows

### Editing and Rendering

1. The editor receives input.
2. The active Markdown tab content is updated.
3. Unsaved-change logic compares the active content with its saved source.
4. Rendering is debounced.
5. Markdown is parsed with Marked.js and sanitized with DOMPurify.
6. Preview enhancers run for frontmatter, links, heading anchors, task lists, alerts, emoji, Mermaid, MathJax, and code highlighting.
7. Editor overlays, line/status UI, tab indicators, statistics, and save controls refresh.

### Opening Files

1. A file enters through the file picker, drag/drop, recent item, GitHub import, sidebar selection, shared URL, or desktop startup argument.
2. File type detection determines whether it is Markdown/text or a graph document.
3. Markdown/text files open as Markdown tabs.
4. `.mdviewer-graph.json`, `.mdgraph.json`, and compatible JSON graph files open as graph tabs.
5. Source metadata is attached so save behavior knows whether direct write-back is possible.

### Opening Folders

1. Folder selection is routed through File System Access APIs, drag/drop entries, fallback folder input, or Neutralino filesystem APIs.
2. Supported files are scanned into a nested tree model.
3. Folder toolbar and sidebar modules render the tree.
4. Folder files feed link autocomplete, tag lists, graph extraction, context actions, and auto-selection behavior.

### Saving

1. Save commands ask the tabs/dirty-state logic for the active tab and source metadata.
2. If a writable file handle or desktop path exists, the app writes directly.
3. If direct save is unavailable, the runtime uses a browser or desktop save dialog when possible.
4. If no direct save path exists, the app downloads a generated file.
5. Source metadata, dirty state, recent items, and tab UI are updated after success.

### Graph View

1. Graph extraction reads Markdown files from the open folder or saved graph archive.
2. It normalizes Markdown links, wiki links, headings, frontmatter tags, and inline tags.
3. Graph documents store nodes, links, tags, included content, layout, and configuration.
4. D3 renders the graph with zoom, drag, filters, grouping, hidden nodes, selected nodes, and context menus.
5. Persistence compares saved graphs to current folder state and can export graph archives for later work or refactoring.

### Exporting and Sharing

1. Export actions select raw Markdown, rendered preview HTML, active graph data, or selected Mermaid diagram data.
2. The runtime generates Markdown, standalone HTML, PDF, graph JSON, Mermaid SVG/PNG, copied HTML/image data, or a compressed share URL.
3. Results are saved through native/browser dialogs, downloaded with FileSaver, or written to the clipboard.

### Desktop Startup and Exit

1. The Neutralino wrapper loads the same web resources as the browser app.
2. `desktop-app/resources/js/main.js` initializes Neutralino and adds desktop-specific lifecycle behavior.
3. Startup file paths can be passed into the shared runtime.
4. Exit and window-close flows call the shared unsaved-change guard before closing.

---

## Browser and Desktop Compatibility

The same app code runs in normal browsers and in the Neutralino desktop wrapper. Runtime code uses feature detection before calling platform APIs.

| Capability | Browser Runtime | Desktop Runtime |
|------------|-----------------|-----------------|
| Open files | File input, File System Access API, drag/drop. | Neutralino filesystem and OS dialogs. |
| Save files | File System Access API, save picker, generated downloads. | Neutralino filesystem and OS dialogs. |
| Open folders | Directory picker, folder input fallback, drag/drop entries. | Neutralino directory reads and folder dialogs. |
| Recent items | localStorage plus IndexedDB handles where supported. | localStorage plus optional `.mdviewer` profile files and filesystem paths. |
| Reveal/open externally | Limited browser support for links/downloads. | Neutralino OS commands for reveal/open operations. |
| Clipboard | Browser Clipboard API with fallback copy behavior. | Browser Clipboard API plus desktop-capable fallback paths where allowed. |
| Startup file | URL hash/shared content or manual file open. | Command-line/OS file handoff through desktop wrapper. |

Desktop-specific APIs must always be guarded with checks such as `typeof Neutralino !== "undefined"` and capability checks for the API being called.

---

## Storage and Persistence

The app stores state locally and does not require a server database.

| Storage | Keys / Files | Purpose |
|---------|--------------|---------|
| localStorage | `markdownViewerGlobalState` | Theme, layout, sidebar, dropzone, graph, and render preferences. |
| localStorage | `markdownViewerTabs`, `markdownViewerActiveTab` | Restored Markdown/graph tab state and active tab ID. |
| localStorage | `markdownViewerUntitledCounter` | Stable untitled document numbering. |
| localStorage | `markdownViewerRecentFiles`, `markdownViewerRecentFolders` | Recent item menus. |
| IndexedDB | `markdownViewerRecentHandles` | Browser File System Access handles for recent files/folders. |
| Desktop profile | `.mdviewer/recent-items.json`, `.mdviewer/preferences.json` | Desktop-friendly recent/preference sync when profile paths are available. |
| Graph files | `.mdviewer-graph.json`, `.mdgraph.json`, `.json` | Saved graph layouts, graph snapshots, and portable graph archives. |
| URL hash | Compressed pako payload | Share URL content loaded without a backend. |

When changing persistence shape, update both save and restore paths. Tabs, recent items, and graph documents often need migration-friendly defaults because users may already have older saved data.

---

## Security and Sanitization

Important runtime security rules:

- Markdown-derived HTML must be sanitized before insertion into preview DOM.
- Link handling distinguishes internal Markdown links, wiki links, same-origin Markdown URLs, local filesystem paths, and external web links.
- Mermaid rendering is performed through controlled post-render flows.
- Share URLs compress local content into the hash; they do not upload data.
- Desktop filesystem and OS access is constrained by Neutralino configuration and guarded runtime checks.
- GitHub import reads public repository content selected by the user; imported content is opened as local tabs.

Do not bypass the existing render/sanitize/link helpers when adding Markdown-facing features.

---

## Performance Notes

The runtime avoids unnecessary expensive work:

- Markdown rendering is debounced after editor input.
- Scroll synchronization uses short guard windows to avoid scroll feedback loops.
- Graph generation and folder scans are separated from normal typing paths.
- Graph layout and hidden/grouped node state can be persisted so manual graph work is not lost.
- Editor syntax highlighting and line overlays update from editor events rather than full app refreshes where possible.
- Large exports render from current content/preview data instead of forcing unrelated state rebuilds.

When adding a feature that runs on every keystroke, scroll, mousemove, graph tick, or folder scan, keep the hot path small.

---

## External Dependencies

The runtime depends on globals loaded by `index.html`.

| Dependency | Runtime Use |
|------------|-------------|
| `marked` | Markdown parsing and custom renderer behavior. |
| `hljs` | Preview code syntax highlighting. |
| `DOMPurify` | HTML sanitization before preview insertion. |
| `MathJax` | Inline and block math rendering. |
| `mermaid` | Mermaid diagram rendering and diagram export support. |
| `joypixels` | Emoji shortcode rendering. |
| `jsyaml` | YAML frontmatter parsing and tag extraction. |
| `d3` | Graph visualization, force layout, zooming, dragging, and selection. |
| `saveAs` | FileSaver download fallback for generated files. |
| `html2pdf`, `jsPDF`, `html2canvas`, `pdfMake` | PDF and image-based export paths. |
| `pako` | Share URL compression/decompression. |
| `Neutralino` | Desktop filesystem, dialogs, OS commands, and lifecycle integration when running in the desktop wrapper. |

The desktop build vendors these dependencies into `desktop-app/resources/vendor/` so the Neutralino app can run with local assets.

---

## Developer Change Guide

Use these rules of thumb when changing runtime behavior:

1. Add new feature logic to a focused `web-app/js/` module when it can be isolated.
2. Keep `script.js` responsible for composition, DOM event wiring, and compatibility glue.
3. Pass dependencies explicitly from `script.js`; avoid hidden reads from unrelated module internals.
4. Publish reusable cross-module capabilities through `app.services` or `app.actions`.
5. Update dirty-state checks before destructive actions such as close, replace, delete, rename, reset, or exit.
6. Keep browser and desktop behavior together for file/folder/OS operations.
7. Sanitize rendered Markdown before DOM insertion.
8. Update save and restore paths together for tabs, preferences, recent items, and graph documents.
9. Keep graph snapshots synchronized when file paths, tags, document content, or folder state changes.
10. Test the affected workflow through the browser UI when changing editor, folder, graph, export, or desktop-adjacent behavior.

For a function-level inventory of what remains in `web-app/script.js`, see [Script Function Reference](Script-Functions).

---

## Related References

- [Project Modules](Modules)
- [Script Function Reference](Script-Functions)
- [Configuration](Configuration)
- [Desktop App](Desktop-App)
- [Docker Deployment](Docker-Deployment)
