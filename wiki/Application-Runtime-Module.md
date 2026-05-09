# Application Runtime Module (`web-app/script.js`)

This document describes the modules and logic parts implemented inside the **Application Runtime Module**, whose source file is `web-app/script.js`.

`script.js` is the main client-side controller for Markdown Viewer. It is not split into ES modules or bundled framework components; instead, it runs after `DOMContentLoaded`, keeps the application state in closure-scoped variables, and coordinates UI controls, Markdown rendering, persistence, file operations, graph features, exports, and desktop/browser compatibility logic.

---

## Table of Contents

- [Runtime Role](#runtime-role)
- [Execution Model](#execution-model)
- [Dependency Integration](#dependency-integration)
- [State Model](#state-model)
- [Logical Module Inventory](#logical-module-inventory)
- [Core Workflows](#core-workflows)
- [Browser and Desktop Compatibility Logic](#browser-and-desktop-compatibility-logic)
- [Cross-Cutting Concerns](#cross-cutting-concerns)
- [Guidance for Future Changes](#guidance-for-future-changes)

---

## Runtime Role

The Application Runtime Module is responsible for turning the static app shell from `index.html` into an interactive Markdown workspace.

It owns these high-level responsibilities:

- Reading DOM elements and binding event listeners.
- Managing tabs, the active document, and graph tabs.
- Rendering Markdown into sanitized preview HTML.
- Enhancing rendered content with syntax highlighting, Mermaid diagrams, MathJax math, alerts, frontmatter tables, heading anchors, emoji, and diagram controls.
- Managing editor-specific behavior such as line numbers, selection highlights, autocomplete, context-menu formatting, indentation, and status text.
- Opening files, folders, GitHub repository content, dropped documents, and saved graph archives.
- Saving or exporting Markdown, HTML, PDF, graph JSON, Mermaid SVG/PNG, and share URLs.
- Persisting preferences, recent items, tab state, layout state, and graph state locally.
- Bridging browser APIs and Neutralinojs desktop APIs where their capabilities differ.

---

## Execution Model

`script.js` uses a single runtime entry point:

1. The browser loads third-party libraries and `script.js` from `index.html`.
2. `script.js` waits for `DOMContentLoaded` before reading DOM elements.
3. Closure-scoped variables are initialized for rendering, scrolling, sidebar layout, folder data, tabs, graph state, and persistence.
4. Library integrations are configured, especially Mermaid and Marked.js.
5. Previously saved preferences and tab state are restored.
6. Event listeners are attached to toolbar buttons, editor events, sidebar controls, tab controls, graph controls, modals, document-level clicks, keyboard shortcuts, and drag/drop handlers.
7. The active tab is rendered, and subsequent user actions update state and re-render the affected UI.

The module primarily follows an event-driven model: user input changes state, state updates trigger rendering or persistence, and platform-specific operations are routed through browser APIs or Neutralino APIs.

---

## Dependency Integration

The runtime depends on globals loaded by `index.html`.

| Dependency | Runtime Use |
|------------|-------------|
| `marked` | Parses Markdown into HTML and allows a custom renderer for code blocks and Mermaid fences. |
| `hljs` | Highlights fenced code blocks after the language is normalized. |
| `DOMPurify` | Sanitizes rendered preview HTML before it is inserted into the DOM. |
| `MathJax` | Typesets inline and block math after preview updates. |
| `mermaid` | Initializes diagram rendering and renders Mermaid code fences. |
| `joypixels` | Converts emoji shortcodes and styles rendered emoji. |
| `jsyaml` | Parses YAML frontmatter and extracts frontmatter tags/metadata. |
| `d3` | Renders and interacts with graph view nodes, edges, force layout, zooming, and selection. |
| `saveAs` / FileSaver.js | Downloads generated Markdown, HTML, JSON, SVG, PNG, and fallback exports. |
| `html2pdf`, `jsPDF`, `html2canvas`, `pdfMake` | Support PDF and canvas/image export paths. |
| `pako` | Compresses and decompresses Markdown content for share URLs. |
| `Neutralino` | Used only when running in the desktop wrapper for native filesystem and OS operations. |

The runtime contains feature detection around APIs such as File System Access, drag/drop entries, Clipboard, and Neutralino so the same source file can run in browser and desktop environments.

---

## State Model

The runtime uses a local-first state model. The most important state groups are:

| State Group | What It Tracks | Persistence |
|-------------|----------------|-------------|
| Render state | Debounce timers, current render pass, Mermaid initialization, and preview refresh state. | In memory. |
| Editor state | Current editor content, selection, line numbers, selection highlights, cursor status, and editor context-menu history. | Active tab plus in-memory UI state. |
| View state | Split/editor/preview mode, pane widths, sidebar visibility, dropzone visibility, mobile menu state, and synchronized scrolling. | Browser storage/global preferences. |
| Tab state | Markdown tabs, graph tabs, active tab ID, tab titles, source metadata, temporary tabs, dirty state, and saved graph metadata. | Browser storage. |
| Recent item state | Recent files/folders, file handles, folder handles, labels, paths, and desktop profile entries. | localStorage, IndexedDB, and optional desktop profile files. |
| Folder state | Open folder name/path/handle, folder tree nodes, Markdown files, unsupported files, sort mode, filter text, selected tags, and auto-select mode. | In memory plus preferences where useful. |
| Tag state | Known tags, extracted tags, tag counts, selected tag filters, and tag updates propagated to tabs and graph snapshots. | Browser storage and file content. |
| Graph state | Graph snapshots, graph tabs, layouts, zoom transform, hidden nodes, groups, filters, stale graph comparisons, and saved graph documents. | Tab state and graph JSON files. |
| Export/share state | Temporary rendered content, export options, generated filenames, compressed share data, copy status, and Mermaid image conversion. | Mostly in memory, with generated downloads or clipboard output. |

---

## Logical Module Inventory

The table below describes the major logic parts inside `web-app/script.js`.

| Logic Part | Main Responsibility | Typical Inputs | Typical Outputs / Side Effects |
|------------|---------------------|----------------|--------------------------------|
| Boot and DOM references | Capture all important DOM nodes and initialize base runtime variables. | `DOMContentLoaded`, existing HTML elements. | Closure-scoped references and default state values. |
| Theme and global preferences | Load, apply, save, and reset user preferences. | System color-scheme, saved global state, UI toggles. | `data-theme`, layout CSS variables, global state writes. |
| Markdown renderer configuration | Configure Mermaid and Marked.js custom rendering behavior. | Library globals, current theme. | Renderer functions, Mermaid initialization, Markdown parser options. |
| Preview rendering | Convert Markdown to sanitized HTML and enhance the preview. | Active Markdown text. | Updated preview DOM, MathJax typesetting, Mermaid diagrams, statistics. |
| Editor enhancements | Maintain line numbers, current-line highlight, selection highlights, caret status, indentation, and editor keyboard interactions. | Editor input, selection, scroll, keyboard events. | Updated editor overlays/status text and modified editor content. |
| Link and tag autocomplete | Suggest folder-relative links, wiki links, Markdown tags, and frontmatter tags. | Cursor position, active folder files, known tags, graph snapshots. | Autocomplete menu and inserted replacement text. |
| Editor context menu formatting | Convert selected text into Markdown structures. | Selection range and selected command. | Replaced editor text plus undo/redo history for conversions. |
| Tab management | Create, switch, rename, duplicate, close, reorder, persist, and restore tabs. | Tab actions, imported content, files, graph snapshots. | Updated tab arrays, active tab, local storage, tab UI. |
| Unsaved-change tracking | Detect dirty Markdown and graph tabs and protect destructive actions. | Current content, source content, graph document content. | Dirty indicators and confirmation prompts. |
| Save logic | Save active/current tabs to their source or through a save dialog/download fallback. | Active tab, source metadata, platform capabilities. | Updated files, graph documents, source metadata, dirty state. |
| Recent files and folders | Normalize, persist, hydrate, and render recent files/folders. | File handles, folder handles, paths, labels, desktop profile data. | Recent menus, localStorage/IndexedDB/profile writes. |
| Folder opening and tree building | Open local folders, read supported files, build nested tree data, and render sidebar entries. | Directory handles, drag/drop entries, Neutralino paths, file lists. | Folder tree DOM, folder file arrays, active folder metadata. |
| Folder tree filtering/sorting | Filter, tag-filter, sort, expand/collapse, and highlight folder tree entries. | Filter text, selected tags, sort mode, unsupported-file toggle. | Rerendered sidebar tree and toolbar state. |
| Sidebar file/folder operations | Provide open, reveal, rename, create, delete, copy, share, export, tag, and graph actions from context menus. | Sidebar node metadata and selected menu action. | Filesystem writes/deletes/renames, tab updates, graph updates, clipboard writes. |
| Rename and link maintenance | Keep internal references valid after file/folder renames. | Old/new paths and node indexes. | Updated open tabs, folder entries, Markdown links, graph snapshots, graph layouts. |
| GitHub import | Parse GitHub URLs, list repository Markdown files, select files, and import content. | Repository URL and selected paths. | New Markdown tabs populated with fetched public content. |
| Drag and drop import | Accept dropped files or folders and route them to document/folder import logic. | DataTransfer items, files, handles, entries. | New tabs, folder tree, imported graph documents, hidden dropzone. |
| View mode and layout controls | Switch editor-only/split/preview modes and resize editor, preview, sidebar, and dropzone panes. | Toolbar clicks, pointer/touch/keyboard resize events, mobile menu actions. | CSS layout changes and persisted layout preferences. |
| Scroll synchronization | Keep editor and preview scrolling together when enabled. | Editor/preview scroll events. | Scroll position updates and sync-toggle UI state. |
| Markdown metadata and tags | Extract frontmatter, inline tags, YAML tags, and update known tag counts. | Markdown content and folder files. | Tag lists, tag counts, frontmatter metadata display, file content updates. |
| Graph extraction | Convert folder Markdown files into graph-ready nodes, links, tags, and labels. | Folder Markdown content, wiki links, Markdown links, tags. | Graph snapshot objects and graph tab data. |
| Graph persistence and comparison | Serialize/deserialize graph documents, save graph layouts, and compare saved graphs to current folder state. | Graph tab state, saved graph JSON, current folder snapshot. | Graph JSON documents, stale graph banners/modals, comparison details. |
| Graph rendering and interaction | Render graph nodes/links, zoom, drag, filter, group, hide, highlight, and context-menu actions. | Graph snapshot, graph config, D3 events, filter controls. | Interactive SVG graph, graph toolbar state, persisted layout/config changes. |
| Export logic | Export Markdown, standalone HTML, PDF, graph JSON, Mermaid SVG/PNG, and copied rendered HTML/images. | Active content, rendered preview, graph data, selected diagram. | Downloaded files, clipboard data, save dialogs. |
| Share URL logic | Encode Markdown into compressed URL hashes and decode shared documents on load. | Markdown text or URL hash. | Clipboard share URL or restored document content. |
| Keyboard shortcuts | Handle app-level shortcuts for save/export, copy, tabs, sync scroll, indentation, and modal behavior. | `keydown` events and current focus. | Invoked actions or modified editor content. |
| Modal and menu lifecycle | Open, close, position, and reset modals, dropdown-style panels, context menus, graph detail dialogs, and mobile panels. | Button clicks, outside clicks, escape key, blur events. | Visible/hidden UI overlays and reset local UI state. |
| Desktop compatibility bridges | Detect Neutralino runtime and route operations through native dialogs/filesystem where available. | `NL_VERSION`, `Neutralino`, file paths, command-line-loaded files. | Native save/open/reveal operations and desktop profile persistence. |

---

## Core Workflows

### 1. Editing and Preview Rendering

1. The editor receives input.
2. The active Markdown tab is updated and marked dirty if its content differs from the saved source.
3. Rendering is debounced to avoid expensive work on every keystroke.
4. The runtime converts Markdown to HTML with Marked.js and the custom renderer.
5. DOMPurify sanitizes the generated HTML.
6. The preview is updated.
7. Post-render enhancers run: alerts, headings, frontmatter, task lists, emoji, Mermaid, MathJax, and diagram toolbars.
8. Statistics, tab indicators, and save controls are refreshed.

### 2. Opening a File

1. A file enters through picker, drag/drop, recent item, GitHub import, sidebar selection, or desktop startup arguments.
2. The runtime determines whether the file is Markdown, graph JSON, or another supported text file.
3. Markdown/text files become Markdown tabs.
4. Saved graph files become graph tabs.
5. Source metadata is stored so save actions know whether direct write-back is possible.
6. The active tab changes and the preview/graph view renders.

### 3. Opening a Folder

1. The runtime opens a folder using File System Access API, drag/drop entries, a fallback file list, or Neutralino filesystem APIs.
2. It scans supported files and builds a nested tree model.
3. Folder toolbar controls are enabled.
4. The folder tree is rendered into the sidebar.
5. Markdown files become available for link autocomplete, tag management, graph generation, and auto-selection.

### 4. Saving Content

1. The save command identifies the active tab and whether it is Markdown or graph data.
2. If the tab has a writable source, the runtime writes back directly.
3. If direct write-back is unavailable, the runtime opens a platform save dialog where supported.
4. If no native/browser save dialog is available, the runtime downloads a generated file.
5. Source metadata and dirty indicators are updated after a successful save.

### 5. Building and Using Graph View

1. The runtime reads Markdown files from the open folder or graph archive.
2. It extracts normalized links, wiki links, inline tags, and frontmatter tags.
3. It creates a graph snapshot containing files, tag relations, and link relations.
4. A graph tab stores the snapshot plus layout/configuration state.
5. D3 renders the graph and manages interactions such as zoom, drag, filters, groups, hidden nodes, context menus, and layout persistence.
6. Graph views can be saved as layout-only graph documents or exported as portable graph archives with included Markdown content.

### 6. Exporting and Sharing

1. Export actions select the correct content source: raw Markdown, rendered preview, active graph document, or selected Mermaid diagram.
2. The runtime generates the target format, including standalone HTML, PDF, JSON, SVG, PNG, Markdown, or compressed share URL.
3. The result is written through a save dialog, downloaded through FileSaver, or copied to the clipboard.

---

## Browser and Desktop Compatibility Logic

`script.js` deliberately contains compatibility branches because the same source powers both the browser and Neutralino desktop builds.

| Capability | Browser Path | Desktop Path |
|------------|--------------|--------------|
| Open/save file | File System Access API, file inputs, drag/drop, downloads. | Neutralino filesystem and OS dialogs. |
| Open folder | Directory picker, drag/drop entries, or file-list fallback. | Neutralino directory reads. |
| Recent items | localStorage and IndexedDB handles. | localStorage plus optional profile files and filesystem paths. |
| Reveal/open in OS | Limited browser support. | Neutralino OS commands. |
| Clipboard | Browser Clipboard API with fallbacks. | Browser Clipboard API and Neutralino allow-listed clipboard support where available. |
| Startup file | Not applicable in normal browser use. | Desktop wrapper can pass command-line file paths into the shared runtime. |

The runtime checks feature availability before using APIs instead of assuming one platform.

---

## Cross-Cutting Concerns

### Security

- Rendered HTML is sanitized before it is inserted into the preview.
- Mermaid is initialized in a controlled rendering flow.
- Native desktop capabilities are constrained by Neutralino configuration.
- Share URLs encode content locally instead of uploading it.

### Persistence

- Browser storage is used for preferences, tabs, recent items, and layout state.
- IndexedDB is used where persistent file/folder handles are supported.
- Desktop profile files are used when running under Neutralino and a profile path is available.

### Performance

- Markdown rendering is debounced.
- Scroll synchronization is throttled with short timers.
- Expensive graph and folder operations are separated from normal typing paths.
- Graph layout state can be captured and reused to avoid losing manual positioning.

### Accessibility and Responsiveness

- The runtime updates ARIA states for toggles, selected folder files, menus, and autocomplete where applicable.
- Desktop and mobile controls are both wired to shared actions.
- Keyboard shortcuts and Escape/outside-click handlers close menus and dialogs consistently.

---

## Guidance for Future Changes

When adding new logic to `web-app/script.js`, prefer these conventions:

1. **Reuse existing state owners.** Add tab fields to tab creation/serialization helpers instead of storing detached state.
2. **Keep browser and desktop paths together.** If a feature touches files or OS behavior, add both browser and Neutralino handling or explicitly document unsupported platforms.
3. **Sanitize before preview insertion.** Any rendered Markdown-derived HTML should pass through the existing sanitization flow.
4. **Update persistence intentionally.** If a feature changes tabs, preferences, graph configuration, or source metadata, update the matching save/load helper.
5. **Protect unsaved work.** Add dirty-state checks before destructive operations such as closing, replacing content, deleting files, or exiting.
6. **Prefer shared actions for duplicate UI controls.** Desktop, mobile, toolbar, sidebar, and context-menu controls should call the same underlying function where possible.
7. **Keep graph updates synchronized.** File rename, tag edits, and content writes should update open graph snapshots and graph tabs when those files are represented there.
8. **Test Markdown, folder, and graph paths separately.** A change that is safe for a single Markdown tab can still affect folder navigation, saved graph archives, or desktop save behavior.
