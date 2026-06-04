# Project Modules

This document describes the current module layout of **MD-Editor**. The app is still a lightweight static web application, but the browser behavior is now split across focused classic-script modules under `web-app/js/` and coordinated by `web-app/script.js`.

The modules are not bundled ES modules. Each file exposes a `window.registerMarkdownViewer...` function, and `script.js` builds the shared app context, registers the modules in dependency order, and passes the dependencies each module needs.

---

## Table of Contents

- [Module Map](#module-map)
- [How the Web Modules Work Together](#how-the-web-modules-work-together)
- [Web App Shell](#web-app-shell)
- [Runtime Composition](#runtime-composition)
- [Core Context](#core-context)
- [Editor Modules](#editor-modules)
- [Markdown Modules](#markdown-modules)
- [Graph Modules](#graph-modules)
- [Files, Folders, and Imports](#files-folders-and-imports)
- [Tabs, Tags, and Recent State](#tabs-tags-and-recent-state)
- [UI, Layout, and Preferences](#ui-layout-and-preferences)
- [Export, Sharing, Clipboard, and Shortcuts](#export-sharing-clipboard-and-shortcuts)
- [Code Converter](#code-converter)
- [Desktop Modules](#desktop-modules)
- [Documentation and Support](#documentation-and-support)
- [Data and Storage](#data-and-storage)
- [External Libraries](#external-libraries)

---

## Module Map

| Area | Main Files | Responsibility |
|------|------------|----------------|
| Web shell | `web-app/index.html` | Declares the UI, loads vendor libraries, loads app scripts, and starts the browser experience. |
| Web styling | `web-app/styles.css` | Defines themes, responsive layout, editor/preview styling, graph styling, menus, dialogs, and state styles. |
| Runtime composition | `web-app/script.js` | Owns startup, DOM references, shared state wiring, compatibility glue, event binding, and module registration. |
| App context | `web-app/js/app.js`, `web-app/js/core/context.js` | Creates the shared app object, module registry, action/service containers, DOM helpers, and runtime context helpers. |
| Editor | `web-app/js/editor/*.js` | Autocomplete, context menu formatting, line numbers, cursor/selection status, and editor syntax highlighting. |
| Markdown rendering | `web-app/js/markdown/*.js` | Marked configuration, sanitized preview rendering, frontmatter, Markdown links, Mermaid tools, and renderer preferences. |
| Graph view | `web-app/js/graph/*.js` | Link/tag extraction, graph documents, graph persistence, graph toolbar state, and D3 rendering. |
| Files and folders | `web-app/js/files/*.js`, `web-app/js/platform/folder-picker.js`, `web-app/js/sidebar/*.js` | File type checks, open/save flows, folder picking, folder toolbar actions, and sidebar context actions. |
| Imports | `web-app/js/import/*.js` | Drag/drop handling, dropped item parsing, folder/file drops, and GitHub Markdown import. |
| Tabs and tags | `web-app/js/tabs/*.js`, `web-app/js/tags/index.js` | Markdown/graph tab lifecycle, tab counters, tag extraction, tag editing, and tag filters. |
| Recent state | `web-app/js/recent/*.js` | Recent files/folders, browser handles, desktop profile integration, and recent item actions. |
| UI preferences | `web-app/js/ui/*.js` | Theme, layout, sidebar/dropzone settings, view modes, pane behavior, and mobile menu handling. |
| Utility modules | `web-app/js/clipboard.js`, `web-app/js/scroll-sync.js`, `web-app/js/share-url.js`, `web-app/js/keyboard-shortcuts.js`, `web-app/js/unsaved-changes.js` | Clipboard helpers, synchronized scrolling, compressed share URLs, keyboard shortcuts, and unsaved-change tracking. |
| Export helpers | `web-app/js/export/page-breaks.js` | PDF page-break controls used by export workflows. |
| Code converter | `code_converter/dependency-md-generator.js` | Converts source folders into Markdown dependency maps for code exploration and graph workflows. |
| Web container | `web-app/Dockerfile`, `web-app/docker-compose.yml` | Serves the static web app through Nginx for containerized use. |
| Desktop wrapper | `desktop-app/*`, `desktop-app/resources/js/main.js` | Packages the same web app in Neutralinojs and adds desktop lifecycle/native integration. |

---

## How the Web Modules Work Together

1. `web-app/index.html` loads CSS, vendor libraries, `web-app/js/app.js`, all focused `web-app/js/**` modules, and then `web-app/script.js`.
2. `web-app/js/app.js` and `web-app/js/core/context.js` provide the shared app object used by the rest of the runtime.
3. Each focused module attaches one registration function to `window`, such as `window.registerMarkdownViewerTabs` or `window.registerMarkdownViewerGraphRenderer`.
4. `web-app/script.js` waits for the DOM, gathers element references, creates shared state, configures third-party libraries, and calls the module registration functions in the order required by their dependencies.
5. Modules return small APIs and may also publish capabilities through `app.modules`, `app.services`, or `app.actions`.
6. Runtime workflows then call those APIs through the shared context instead of each module reaching directly into every other file.

This keeps the app deployable as plain static files while still giving the codebase a modular structure.

---

## Web App Shell

### `web-app/index.html`

Defines the browser document and the main UI surface:

- Header actions, menus, tab bar, sidebar, editor, preview pane, graph view, modals, context menus, mobile controls, and drop zones.
- Vendor CSS and JavaScript dependencies in the order required by the app.
- Local scripts for the split modules and final runtime boot script.

### `web-app/styles.css`

Provides the visual system:

- Light/dark themes and user preference styling.
- Editor, preview, split view, sidebar, tabs, graph view, modals, context menus, and mobile layouts.
- Visual states for active tabs, unsaved files, selected folders, drag/drop, graph filters, and responsive pane behavior.

### `web-app/assets/`

Stores icons, badges, README/wiki images, and screenshots used by the app and documentation.

### `web-app/Dockerfile` and `web-app/docker-compose.yml`

Package and serve the static web app through Nginx. The container does not add a backend database or server-side Markdown processing.

---

## Runtime Composition

### `web-app/script.js`

`script.js` is the composition layer. It still contains important browser runtime logic, but its main role is now orchestration:

- Boots the app on `DOMContentLoaded`.
- Collects DOM references and builds shared runtime state.
- Configures Marked.js, highlight.js, Mermaid, MathJax, DOMPurify, export helpers, and browser/desktop compatibility branches.
- Registers every focused module in dependency order.
- Connects UI events to module APIs.
- Provides compatibility functions used by older call sites that have not been moved into focused modules yet.

For the current named functions that still live in this file, see [Script Function Reference](Script-Functions).

### `web-app/js/MIGRATION.md`

Documents the local migration pattern used when logic is moved out of `script.js`: create a focused classic script, expose one registration function, register it from `script.js`, and publish any reusable API through the app context.

---

## Core Context

| File | Responsibility |
|------|----------------|
| `web-app/js/app.js` | Creates the shared application object, module registry, action/service containers, and safe module registration helpers. |
| `web-app/js/core/context.js` | Builds the runtime context around DOM references, state containers, feature flags, environment checks, and helper functions passed into modules. |

The app context is the handoff point between modules. Focused modules receive only the dependencies they need, then return an API and optionally expose services/actions for other workflows.

---

## Editor Modules

| File | Responsibility |
|------|----------------|
| `web-app/js/editor/autocomplete.js` | Suggests Markdown links, wiki links, headings, tags, and frontmatter tags while editing. |
| `web-app/js/editor/context-menu.js` | Powers editor right-click formatting actions such as headings, bold, italic, links, code, blockquotes, lists, task lists, and tables. |
| `web-app/js/editor/line-status.js` | Maintains line numbers, current-line highlighting, and editor line state. |
| `web-app/js/editor/status-line.js` | Updates cursor position, line/column text, word/character counts, and selection status. |
| `web-app/js/editor/syntax-highlight.js` | Adds editor-side Markdown syntax highlighting overlays and keeps highlight state aligned with text changes and scrolling. |

These modules enhance the plain text editor without replacing it with a framework-specific editor component.

---

## Markdown Modules

| File | Responsibility |
|------|----------------|
| `web-app/js/markdown/renderer-config.js` | Configures Markdown renderer behavior and renderer-related preferences. |
| `web-app/js/markdown/render.js` | Converts Markdown into sanitized preview HTML and coordinates code highlighting, Mermaid, MathJax, alerts, frontmatter, headings, and post-render enhancements. |
| `web-app/js/markdown/frontmatter.js` | Parses and renders YAML frontmatter as structured preview metadata. |
| `web-app/js/markdown/links.js` | Handles Markdown links, wiki links, heading anchors, local file links, and link normalization used by preview and graph workflows. |
| `web-app/js/markdown/mermaid-tools.js` | Adds Mermaid diagram toolbars, zoom controls, SVG/PNG export, and copy actions. |

Markdown rendering is sanitized before display. Enhancements such as diagrams, math, and code highlighting run after the base Markdown conversion.

---

## Graph Modules

| File | Responsibility |
|------|----------------|
| `web-app/js/graph/extraction.js` | Extracts Markdown links, wiki links, headings, labels, YAML frontmatter tags, and inline tags from Markdown documents. |
| `web-app/js/graph/documents.js` | Creates, opens, saves, imports, exports, and validates graph document tabs. |
| `web-app/js/graph/persistence.js` | Serializes graph documents, stores graph layouts/configuration, detects stale snapshots, compares graph changes, and exposes graph persistence services. |
| `web-app/js/graph/toolbar.js` | Drives graph toolbar controls such as filters, grouping, tags, labels, layout options, and export actions. |
| `web-app/js/graph/renderer.js` | Renders interactive D3 graphs, including nodes, links, tag nodes, hidden points, magnetic layout behavior, context menus, and selection state. |

The graph system connects Markdown documents through links and tags. It supports code exploration, dependency visibility, saved graph documents, and exporting connected parts of a code map for follow-up work or refactoring.

---

## Files, Folders, and Imports

### File Modules

| File | Responsibility |
|------|----------------|
| `web-app/js/files/types.js` | Classifies supported Markdown, text, graph, and auxiliary file types. |
| `web-app/js/files/open.js` | Opens browser files, desktop files, graph files, dropped files, and folder entries into tabs. |
| `web-app/js/files/save.js` | Saves Markdown and graph tabs through browser file handles, desktop APIs, or download fallback flows. |

### Folder and Sidebar Modules

| File | Responsibility |
|------|----------------|
| `web-app/js/platform/folder-picker.js` | Wraps browser File System Access folder picking and desktop folder selection branches. |
| `web-app/js/sidebar/folder-toolbar.js` | Handles folder toolbar actions such as opening folders, refreshing, filtering, creating files/folders, and sidebar controls. |
| `web-app/js/sidebar/context-tree.js` | Renders the folder tree and powers file/folder context actions such as open, rename, delete, copy path/content, export, reveal, and tag actions. |

### Import Modules

| File | Responsibility |
|------|----------------|
| `web-app/js/import/drag-drop.js` | Coordinates drag/drop events for files, folders, text, and graph data. |
| `web-app/js/import/dropped-items.js` | Normalizes dropped files/folders into openable app items. |
| `web-app/js/import/github.js` | Imports Markdown files from GitHub repository URLs by reading repository trees and opening selected files as tabs. |

---

## Tabs, Tags, and Recent State

| File | Responsibility |
|------|----------------|
| `web-app/js/tabs/index.js` | Creates, switches, reorders, renames, duplicates, closes, persists, and restores Markdown and graph tabs. |
| `web-app/js/tabs/counter.js` | Maintains tab count/status information shown in the UI. |
| `web-app/js/tags/index.js` | Extracts, normalizes, creates, deletes, counts, filters, and syncs tags across folder files, open tabs, and graph snapshots. |
| `web-app/js/recent/index.js` | Stores, hydrates, renders, and normalizes recent files/folders using local storage, IndexedDB handles, and desktop profile files. |
| `web-app/js/recent/actions.js` | Implements user actions for recent items, including reopen, remove, clear, and related menu behavior. |

Tabs are the main unit of active work. Tags and recent state are shared across editor, sidebar, graph, and startup workflows.

---

## UI, Layout, and Preferences

| File | Responsibility |
|------|----------------|
| `web-app/js/ui/theme-preferences.js` | Applies light/dark theme settings, persists preference state, exposes preference services, and handles theme toggling. |
| `web-app/js/ui/layout-preferences.js` | Stores and restores layout options such as sidebar width, dropzone state, pane behavior, graph defaults, and reset behavior. |
| `web-app/js/ui/view-layout.js` | Switches editor, split, preview, and graph-oriented layouts and keeps panes sized correctly. |
| `web-app/js/ui/mobile-menu.js` | Handles the mobile action menu and mobile-specific menu state. |

These modules let users shape the app around their workflow while keeping the same content model underneath.

---

## Export, Sharing, Clipboard, and Shortcuts

| File | Responsibility |
|------|----------------|
| `web-app/js/export/page-breaks.js` | Adds visual page-break controls and page-break state used by PDF export. |
| `web-app/js/share-url.js` | Compresses Markdown into shareable URL hashes and loads documents from shared hashes. |
| `web-app/js/clipboard.js` | Centralizes text, HTML, image, and fallback clipboard behavior. |
| `web-app/js/scroll-sync.js` | Keeps editor and preview panes synchronized when sync scrolling is enabled. |
| `web-app/js/keyboard-shortcuts.js` | Handles save/export, tab switching, indentation, sync scrolling, menu/modal shortcuts, and editing shortcuts. |
| `web-app/js/unsaved-changes.js` | Tracks dirty state, updates tab indicators, and protects users before closing, replacing, or exiting with unsaved work. |

Export workflows also use helper functions in `script.js` and third-party libraries for HTML, PDF, image, Mermaid, graph JSON, and Markdown output.

---

## Code Converter

| File | Responsibility |
|------|----------------|
| `code_converter/dependency-md-generator.js` | Generates Markdown dependency maps from source folders so code relationships can be inspected, edited, graphed, and exported. |
| `desktop-app/resources/code_converter/dependency-md-generator.js` | Desktop resource copy used by the Neutralino app after `desktop-app/prepare.js` runs. |

The converter is especially useful with graph view: generated dependency Markdown can be opened like any other document, linked into graph documents, and exported for later analysis or refactoring work.

---

## Desktop Modules

| File | Responsibility |
|------|----------------|
| `desktop-app/neutralino.config.json` | Defines the Neutralino application ID, document root, window behavior, native API allow list, security token behavior, and pinned Neutralino versions. |
| `desktop-app/resources/js/main.js` | Initializes Neutralino, adds desktop-only exit behavior, handles tray/window events, checks unsaved changes before exit, and opens initial files passed from the OS. |
| `desktop-app/prepare.js` | Copies the shared web app into desktop resources, rewrites resource paths, preserves desktop icons, and injects Neutralino scripts. |
| `desktop-app/setup-binaries.js` | Checks Neutralino binaries, downloads missing/outdated binaries, and checks Windows WebView2 availability. |
| `desktop-app/download-vendor.js` | Downloads/pins vendored browser dependencies used by the offline desktop resources. |
| `desktop-app/vendor-assets.json` | Lists vendored CSS/JS assets and expected desktop resource paths. |
| `desktop-app/package.json` | Defines desktop setup, development, build, portable build, and vendor asset scripts. |
| `desktop-app/Dockerfile`, `desktop-app/docker-compose.yml` | Provide containerized desktop-build support for environments that build the Neutralino package in Docker. |

The desktop app shares the same browser UI and modules as the web app. Desktop-specific code is limited to packaging, native file/window lifecycle, local resource preparation, and vendor asset management.

---

## Documentation and Support

| Area | Files | Responsibility |
|------|-------|----------------|
| Wiki | `wiki/*.md` | Documents features, installation, configuration, usage, desktop builds, Docker deployment, architecture, modules, FAQ, and release notes. |
| Runtime reference | `wiki/Application-Runtime-Module.md` | Provides deeper detail for the `script.js` composition/runtime layer. |
| Script reference | `wiki/Script-Functions.md` | Lists and describes only the named functions currently present in `web-app/script.js`. |
| Startup helpers | `start_web.bat`, `start_desktop.bat` | Provide Windows convenience commands for launching the web and desktop app. |
| Tests | `web-app/tests/*.js`, `web-app/tests/e2e/app.spec.js` | Cover migration smoke checks, code converter behavior, and browser workflows through Playwright. |

---

## Data and Storage

The app stores user state locally. There is no required server database.

| Data Area | Example Keys / Documents | Purpose |
|-----------|--------------------------|---------|
| Global preferences | `markdownViewerGlobalState` | Theme, layout, graph, sidebar, dropzone, and rendering preference state. |
| Tabs | `markdownViewerTabs`, `markdownViewerActiveTab` | Restores open Markdown and graph tabs and the active tab across sessions. |
| Recent files | `markdownViewerRecentFiles` | Tracks recently opened files. |
| Recent folders | `markdownViewerRecentFolders` | Tracks recently opened folders. |
| Browser handles | `markdownViewerRecentHandles` IndexedDB database | Stores File System Access API handles where supported. |
| Desktop profile | `.mdviewer/recent-items.json`, `.mdviewer/preferences.json` | Desktop-friendly persistence when Neutralino profile paths are available. |
| Graph documents | `.mdviewer-graph.json`, `.mdgraph.json`, `.json` | Stores saved graph views, graph layouts, and exported graph archives. |
| Share URLs | URL hash payloads | Stores compressed Markdown content in the URL for sharing/importing without a backend. |

---

## External Libraries

These libraries are loaded by the web shell and used by the runtime/modules.

| Library | Used For |
|---------|----------|
| Bootstrap | Dropdowns, modals, and UI behavior helpers. |
| Bootstrap Icons | Toolbar, menu, folder, file, graph, and action icons. |
| GitHub Markdown CSS | GitHub-style Markdown preview defaults. |
| Marked.js | Markdown parsing. |
| highlight.js | Preview code syntax highlighting. |
| DOMPurify | Sanitizing rendered HTML. |
| MathJax | LaTeX math rendering. |
| Mermaid | Diagram rendering and diagram export support. |
| JoyPixels / emoji-toolkit | Emoji shortcode rendering and emoji styles. |
| js-yaml | YAML frontmatter parsing. |
| D3.js | Interactive graph visualization. |
| FileSaver.js | Downloading generated files. |
| html2pdf.js, jsPDF, html2canvas, pdfmake | PDF and image-based export workflows. |
| pako | Compression/decompression for share URL payloads. |
