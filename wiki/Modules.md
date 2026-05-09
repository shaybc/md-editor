# Project Modules

This document describes the major modules in **Markdown Viewer**. Because the app is intentionally lightweight, most browser behavior is implemented in one main JavaScript file and organized by logical module rather than by a bundler or framework directory structure.

---

## Table of Contents

- [Module Map](#module-map)
- [Web Application Modules](#web-application-modules)
- [Desktop Application Modules](#desktop-application-modules)
- [Documentation and Support Modules](#documentation-and-support-modules)
- [Logical Modules in `web-app/script.js`](#logical-modules-in-web-appscriptjs)
- [Detailed Runtime Module Reference](#detailed-runtime-module-reference)
- [Data Modules and Storage Keys](#data-modules-and-storage-keys)
- [External Library Modules](#external-library-modules)

---

## Module Map

| Module | Main Files | Responsibility |
|--------|------------|----------------|
| Web app shell | `web-app/index.html` | Loads dependencies and declares the UI structure. |
| Web styling | `web-app/styles.css` | Provides the complete visual system, layouts, themes, responsive rules, and component styles. |
| Web application logic | `web-app/script.js` | Implements Markdown rendering, tabs, editor behavior, imports, exports, folder browsing, graph view, persistence, and event handling. |
| Web assets | `web-app/assets/` | Stores app icons, screenshots, and documentation images. |
| Web container | `web-app/Dockerfile`, `web-app/docker-compose.yml` | Builds and runs the static app with Nginx. |
| Desktop wrapper | `desktop-app/neutralino.config.json`, `desktop-app/resources/js/main.js` | Runs the shared web app in Neutralinojs and adds native desktop integration. |
| Desktop build tools | `desktop-app/package.json`, `desktop-app/prepare.js`, `desktop-app/setup-binaries.js` | Defines npm scripts, copies shared resources, injects Neutralino scripts, and manages platform binaries. |
| Wiki documentation | `wiki/*.md` | User, deployment, configuration, architecture, and contributor documentation. |
| Startup helpers | `start_web.bat`, `start_desktop.bat` | Windows convenience scripts for launching the web or desktop app. |

---

## Web Application Modules

### 1. App Shell Module

**File:** `web-app/index.html`

Responsibilities:

- Defines the document metadata, social preview tags, favicon, and title.
- Loads CSS libraries and the project stylesheet.
- Loads JavaScript libraries in the order required by the application.
- Declares the header, action menus, tab bar, sidebar, editor, preview pane, graph view controls, modals, context menus, mobile menu, and dropzone elements.
- Includes `script.js`, which activates the UI after the DOM is loaded.

### 2. Styling Module

**File:** `web-app/styles.css`

Responsibilities:

- Defines CSS variables for light/dark themes.
- Styles the application header, editor workspace, Markdown preview, tab bar, sidebar, folder tree, graph view, modals, dropdowns, and context menus.
- Provides responsive behavior for desktop, tablet, and mobile layouts.
- Supports visual states such as active tabs, unsaved changes, selected folder entries, graph filters, and drag/drop highlights.

### 3. Application Runtime Module

**File:** `web-app/script.js`

Responsibilities:

- Initializes the app after `DOMContentLoaded`.
- Configures Marked.js, highlight.js, Mermaid, MathJax, DOMPurify, and export helpers.
- Manages global preferences, tabs, editor state, view modes, saved files, recent files/folders, and graph documents.
- Connects UI controls to behavior through event listeners.
- Coordinates Markdown rendering, file operations, folder import, GitHub import, graph visualization, exports, share URLs, and keyboard shortcuts.

For a deeper breakdown of the modules and logic parts inside this file, see [Application Runtime Module](Application-Runtime-Module).

### 4. Asset Module

**Path:** `web-app/assets/`

Responsibilities:

- Stores app icons used by the browser and desktop builds.
- Stores screenshots and visual assets used in the README and wiki.
- Provides image files copied into desktop resources during the Neutralino prepare step.

### 5. Web Container Module

**Files:** `web-app/Dockerfile`, `web-app/docker-compose.yml`

Responsibilities:

- Packages the static web app in an Nginx Alpine image.
- Serves `index.html` and static assets.
- Provides fallback routing and cache headers.
- Exposes a local Compose service on port `8080` by default.

---

## Desktop Application Modules

### 1. Neutralino Configuration Module

**File:** `desktop-app/neutralino.config.json`

Responsibilities:

- Defines the desktop application ID, version, document root, default mode, server/native API behavior, token security, logging, and native allow list.
- Configures the app window, browser mode, and CLI settings.
- Pins the Neutralino binary and client versions used by desktop build tooling.

### 2. Desktop Lifecycle Module

**File:** `desktop-app/resources/js/main.js`

Responsibilities:

- Initializes Neutralinojs.
- Adds a desktop-only exit button to the action menu.
- Handles tray menu interactions and window-close events.
- Confirms unsaved changes before exiting.
- Opens an initial Markdown or text file passed as a command-line argument.
- Records the initial file in recent-file history where possible.

### 3. Desktop Resource Preparation Module

**File:** `desktop-app/prepare.js`

Responsibilities:

- Copies shared files from `web-app/` into `desktop-app/resources/`.
- Copies assets while preserving desktop-specific icon handling.
- Rewrites web paths for Neutralino's `/resources/` document root.
- Injects Neutralino client scripts and desktop lifecycle scripts into the generated desktop HTML.

### 4. Desktop Binary Setup Module

**File:** `desktop-app/setup-binaries.js`

Responsibilities:

- Checks whether required Neutralinojs binaries are present.
- Compares the installed binary marker with the version pinned in `neutralino.config.json`.
- Downloads binaries with the Neutralino CLI when missing or outdated.
- Performs a Windows WebView2 runtime check before desktop startup.

### 5. Desktop Package Script Module

**File:** `desktop-app/package.json`

Responsibilities:

- Defines npm scripts for setup, development, embedded builds, portable builds, and combined builds.
- Uses the pinned Neutralino CLI version for repeatable desktop commands.
- Runs setup and preparation automatically before development and build commands.

---

## Documentation and Support Modules

### Wiki Module

**Path:** `wiki/`

Responsibilities:

- Documents installation, usage, features, configuration, deployment, desktop builds, contributing, FAQ, architecture, and module organization.
- Mirrors the user-facing documentation that can be published to a GitHub wiki.

### Startup Script Module

**Files:** `start_web.bat`, `start_desktop.bat`

Responsibilities:

- Provides simple Windows startup commands for local web and desktop use.
- Pulls the latest repository changes before launching in the current helper scripts.

---

## Logical Modules in `web-app/script.js`

The main JavaScript file is organized into functional areas. The following list explains the major logical modules and their responsibilities.

| Logical Module | Responsibility |
|----------------|----------------|
| Boot and shared state | Initializes render timers, scroll synchronization flags, view mode, folder-tree state, selected tags, and DOM references. |
| Autocomplete | Suggests Markdown links, wiki links, tags, and frontmatter tags while editing. |
| Editor context menu | Provides formatting conversions such as headings, bold/italic, links, code, blockquotes, lists, task lists, and Markdown tables. |
| Editor line/status UI | Maintains line numbers, current-line highlight, selection highlights, cursor position, line/column status, and selection counts. |
| Recent items | Reads, writes, normalizes, hydrates, and renders recent files/folders using local storage, IndexedDB handles, and desktop profile files. |
| Preferences and layout | Stores and applies theme, sidebar visibility, sidebar width, dropzone layout, graph preferences, and default preference reset behavior. |
| Tag management | Extracts, normalizes, creates, deletes, counts, and syncs tags across folder files, open tabs, and graph snapshots. |
| Folder tree | Opens folders, builds tree nodes, filters/sorts entries, renders file/folder buttons, toggles unsupported files, and keeps the selected file aligned with the active tab. |
| Markdown rendering | Configures Marked.js, converts Markdown to sanitized HTML, highlights code, renders Mermaid diagrams, enhances alerts/frontmatter/headings, and triggers MathJax. |
| Tab management | Creates, switches, renames, duplicates, closes, reorders, persists, and restores Markdown and graph tabs. |
| Unsaved-change tracking | Compares current content with saved source content and blocks destructive actions when needed. |
| Save operations | Saves Markdown tabs or graph tabs back to source files when possible, or opens save dialogs/downloads when needed. |
| Sidebar context menus | Provides file/folder actions such as open, reveal, rename, copy path/content, share, export, tag changes, create, and delete. |
| Rename/link maintenance | Updates open tabs, folder entries, graph snapshots, and Markdown links when files or folders are renamed. |
| GitHub import | Parses GitHub URLs, reads repository trees, lets users select Markdown files, and imports selected files as tabs. |
| View and pane controls | Switches editor/split/preview modes, toggles synchronized scrolling, resizes panes, toggles sidebar/dropzone, and supports mobile menus. |
| Graph data extraction | Extracts Markdown links, wiki links, YAML frontmatter tags, inline tags, and node labels from Markdown content. |
| Graph persistence | Serializes/deserializes graph documents, detects stale graph snapshots, compares graph differences, and saves graph layouts/configuration. |
| Graph rendering | Uses D3 to render graph nodes, links, tag nodes, filters, groups, hidden points, magnetic layout controls, and graph context menus. |
| Export | Exports Markdown, standalone HTML, PDF, graph JSON, Mermaid SVG, Mermaid PNG, and copied image/HTML content. |
| Sharing | Compresses Markdown into URL hashes and decodes shared documents from hashes. |
| Drag and drop | Handles dropped Markdown files, text files, graph files, and folders where browser APIs allow it. |
| Keyboard shortcuts | Implements save/export, copy, tab, sync-scroll, indentation, and modal/menu keyboard interactions. |
| Mermaid tools | Adds diagram toolbars, zoom modal, pan/zoom controls, SVG export, PNG export, and copy-to-clipboard actions. |

---

## Detailed Runtime Module Reference

The full, dedicated reference for the Application Runtime Module is available at [Application Runtime Module](Application-Runtime-Module). It explains the execution model, dependency integration, state model, module inventory, core workflows, browser/desktop compatibility branches, cross-cutting concerns, and change guidelines for `web-app/script.js`.

---

## Data Modules and Storage Keys

The app uses local data structures and browser storage instead of a server database.

| Data Area | Example Keys / Documents | Purpose |
|-----------|--------------------------|---------|
| Global state | `markdownViewerGlobalState` | Theme, layout, graph, and preference state. |
| Recent files | `markdownViewerRecentFiles` | Recently opened files. |
| Recent folders | `markdownViewerRecentFolders` | Recently opened folders. |
| Recent handles | `markdownViewerRecentHandles` IndexedDB database | Stores browser File System Access API handles where supported. |
| Desktop profile | `.mdviewer/recent-items.json`, `.mdviewer/preferences.json` | Desktop-friendly persistence when Neutralino profile paths are available. |
| Tab state | Saved tab array and active tab ID | Restores open Markdown and graph tabs. |
| Graph documents | `.mdviewer-graph.json`, `.mdgraph.json`, `.json` | Portable saved graph views and exported graph archives. |

---

## External Library Modules

These libraries are loaded by the web shell and consumed by `script.js`.

| Library | Used For |
|---------|----------|
| Bootstrap | Layout helpers and dropdown behavior. |
| Bootstrap Icons | Toolbar, menu, folder, file, and graph icons. |
| GitHub Markdown CSS | GitHub-style Markdown preview defaults. |
| Marked.js | Markdown parsing. |
| highlight.js | Code syntax highlighting. |
| DOMPurify | Rendered HTML sanitization. |
| MathJax | LaTeX math rendering. |
| Mermaid | Diagram rendering. |
| JoyPixels / emoji-toolkit | Emoji shortcode rendering and emoji styles. |
| js-yaml | YAML frontmatter parsing. |
| D3.js | Graph visualization and interactions. |
| FileSaver.js | Downloading generated files. |
| html2pdf.js, jsPDF, html2canvas, pdfmake | PDF and image-based export workflows. |
| pako | Compression and decompression for share URLs. |
