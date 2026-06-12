# Architecture and Technology

This page explains how **MD-Editor** is structured, how the main pieces communicate, and which technologies power the web, desktop, graph, export, and test workflows.

MD-Editor is a local-first Markdown workspace. The canonical application is the static web app in `web-app/`; the desktop app packages the same web UI in a Neutralinojs shell and adds native filesystem/window integration.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Repository Layout](#repository-layout)
- [Web Runtime Architecture](#web-runtime-architecture)
- [Desktop Runtime Architecture](#desktop-runtime-architecture)
- [Module System](#module-system)
- [Rendering Pipeline](#rendering-pipeline)
- [File, Folder, and Graph Workflows](#file-folder-and-graph-workflows)
- [State and Persistence](#state-and-persistence)
- [Code Converter Architecture](#code-converter-architecture)
- [Deployment Architecture](#deployment-architecture)
- [Testing and Quality Gates](#testing-and-quality-gates)
- [Technology Stack](#technology-stack)
- [Security and Privacy Model](#security-and-privacy-model)
- [Developer Workflow](#developer-workflow)
- [Related References](#related-references)

---

## Architecture Overview

The app has five main layers:

| Layer | Main Files | Purpose |
|-------|------------|---------|
| Presentation | `web-app/index.html` | Defines the single-page UI shell, menus, editor, preview, sidebar, graph view, dialogs, and script load order. |
| Styling | `web-app/styles.css` | Provides themes, responsive layout, editor/preview styling, graph styling, tabs, sidebars, modals, context menus, and mobile behavior. |
| Runtime composition | `web-app/script.js` | Boots the app, gathers DOM references, registers modules, binds UI events, and bridges browser/desktop compatibility paths. |
| Feature modules | `web-app/js/**/*.js` | Own focused behavior for files, folders, tabs, Markdown rendering, editor tools, graph view, imports, exports, preferences, and utilities. |
| Packaging | `web-app/Dockerfile`, `desktop-app/*` | Serves the web app with Nginx or packages it as a Neutralino desktop application. |

There is no required backend API or database. Markdown content is parsed, rendered, graphed, exported, and saved locally in the browser or desktop WebView.

External network usage is limited to cases such as CDN-loaded browser dependencies in the web app, user-requested GitHub imports, dependency downloads during desktop setup, or pulling/building container images.

---

## Repository Layout

| Path | Purpose |
|------|---------|
| `README.md` | Project overview, screenshots, quick start, and feature summary. |
| `web-app/` | Canonical static web application. |
| `web-app/index.html` | UI shell, vendor dependency declarations, and local script load order. |
| `web-app/styles.css` | Full app styling and responsive behavior. |
| `web-app/script.js` | Runtime composition layer and remaining legacy/glue logic. |
| `web-app/js/` | Split classic-script feature modules. |
| `web-app/assets/` | Icons, badges, screenshots, README/wiki images, and visual assets. |
| `web-app/tests/` | Node tests and Playwright end-to-end tests. |
| `web-app/package.json` | Web test scripts and Playwright dependency. |
| `web-app/Dockerfile`, `web-app/docker-compose.yml` | Nginx-based static web deployment. |
| `code_converter/dependency-md-generator.js` | Code-to-Markdown dependency map generator. |
| `desktop-app/` | Neutralino desktop wrapper, build scripts, vendored assets, and generated resources. |
| `desktop-app/resources/` | Prepared desktop resources copied from the web app and vendor assets. |
| `desktop-app/resources/js/main.js` | Desktop-only Neutralino lifecycle code. |
| `desktop-app/neutralino.config.json` | Desktop runtime, native permissions, window settings, and pinned Neutralino versions. |
| `desktop-app/vendor-assets.json` | Vendor asset download manifest for desktop offline resources. |
| `wiki/` | Project documentation. |
| `start_web.bat`, `start_desktop.bat` | Windows convenience launch scripts. |

---

## Web Runtime Architecture

The web app is a static single-page application:

1. `index.html` loads CSS and vendor JavaScript libraries.
2. `js/core/context.js` defines the shared app object factory.
3. `js/app.js` creates `window.markdownViewerApp`.
4. Focused modules under `web-app/js/` attach registration functions to `window`.
5. `script.js` loads last, waits for `DOMContentLoaded`, collects DOM references, creates shared runtime state, registers modules, and binds UI events.

The app uses plain browser APIs and vanilla JavaScript. It intentionally avoids a frontend framework and build step, so the same files can be opened by a static server, copied into the desktop resources, or served by Nginx.

The deeper runtime guide is [Application Runtime Architecture](Application-Runtime-Module).

---

## Desktop Runtime Architecture

The desktop app uses Neutralinojs. It does not reimplement the editor; it packages the shared web app.

Desktop build flow:

1. `desktop-app/setup-binaries.js` checks the Neutralino binary/client versions pinned in `neutralino.config.json`.
2. `desktop-app/download-vendor.js` downloads browser libraries listed in `vendor-assets.json` into local desktop resources.
3. `desktop-app/prepare.js` copies the web app into `desktop-app/resources/`, rewrites resource paths, preserves desktop icons, copies the code converter, and injects Neutralino scripts.
4. Neutralino runs or builds from `desktop-app/resources/`.

At runtime, `desktop-app/resources/js/main.js` initializes Neutralino, adds desktop-only exit behavior, handles tray/window lifecycle, checks unsaved changes before closing, and passes startup file paths into the shared web runtime.

Desktop-native capabilities are constrained by `nativeAllowList` in `neutralino.config.json`. The app currently allows app lifecycle calls, OS dialogs/commands, selected filesystem read/write/move/remove operations, debug logging, and clipboard text writes.

---

## Module System

MD-Editor uses classic scripts, not bundled ES modules.

Each feature module follows this pattern:

```js
window.registerMarkdownViewerSomeFeature = function registerMarkdownViewerSomeFeature(app, deps) {
  const api = { /* feature methods */ };
  app.registerModule("someFeature", api);
  return api;
};
```

Key points:

- The historical `registerMarkdownViewer...` prefix remains in code for compatibility.
- `web-app/script.js` controls module registration order.
- Modules receive `app` and an explicit dependency object.
- Reusable APIs are published through `app.modules`, `app.services`, or `app.actions`.
- Feature areas include editor, Markdown rendering, graph, files/folders, imports, tabs, tags, recent items, layout/preferences, clipboard, share URLs, scroll sync, shortcuts, and unsaved-change tracking.

For the full module inventory, see [Project Modules](Modules).

---

## Rendering Pipeline

Markdown rendering is fully client-side:

1. Content enters through typing, file open, folder/sidebar selection, drag/drop, GitHub import, share URL, or desktop startup file.
2. Editor input updates the active tab and dirty state.
3. Rendering is debounced to keep typing responsive.
4. Marked.js parses Markdown with custom renderer behavior.
5. DOMPurify sanitizes generated HTML before preview insertion.
6. Post-render enhancements apply heading anchors, link annotations, GitHub-style alerts, task list behavior, frontmatter display, emoji, syntax highlighting, Mermaid toolbars, and image/link handling.
7. MathJax typesets math and Mermaid renders diagrams after the preview DOM is updated.
8. Reading stats, status lines, tab indicators, and export-ready content are refreshed.

Export actions reuse raw Markdown, sanitized preview HTML, graph state, or selected Mermaid diagrams depending on the selected output type.

---

## File, Folder, and Graph Workflows

### File Workflow

Files can enter through picker dialogs, drag/drop, recent items, sidebar selection, GitHub import, share URLs, or desktop command-line startup.

Supported text files open as Markdown/text tabs. Saved graph files such as `.mdviewer-graph.json`, `.mdgraph.json`, and compatible JSON documents open as graph tabs. Source metadata tracks file handles or desktop paths so saves can write back when possible.

### Folder Workflow

Folder support is built around a local tree model:

- Browser folder picker, folder input fallback, drag/drop entries, or Neutralino filesystem reads provide file lists.
- The sidebar renders supported Markdown/text files and can show unsupported files when enabled.
- Folder tools support filtering, sorting, auto-select, refresh, create, rename, delete, tag changes, copy/reveal actions, and graph/export actions.
- Open folder files feed link autocomplete, tag lists, graph extraction, and dependency/code exploration workflows.

### Graph Workflow

The graph system extracts Markdown links, wiki links, headings, YAML frontmatter tags, and inline tags from folder files or saved graph archives.

Graph documents store nodes, links, tag relationships, included content, layout, filters, groups, hidden nodes, and configuration. The D3 renderer provides interactive exploration, and graph exports can preserve connected code/document areas for later analysis or refactoring.

---

## State and Persistence

MD-Editor is local-first. Runtime state is kept in memory and persisted only where useful.

| Data Area | Storage | Purpose |
|-----------|---------|---------|
| Global preferences | `localStorage` key `markdownViewerGlobalState` and optional desktop profile files | Theme, layout, sidebar, dropzone, graph, and render settings. |
| Tabs | `localStorage` keys `markdownViewerTabs`, `markdownViewerActiveTab`, `markdownViewerUntitledCounter` | Restores multi-tab sessions and untitled numbering. |
| Recent items | `localStorage` keys `markdownViewerRecentFiles`, `markdownViewerRecentFolders` | Recent file/folder menus. |
| Browser handles | IndexedDB database `markdownViewerRecentHandles` | Stores File System Access handles where supported. |
| Desktop profile | `.mdviewer/recent-items.json`, `.mdviewer/preferences.json` | Desktop-friendly recent/preference persistence. |
| Graph documents | `.mdviewer-graph.json`, `.mdgraph.json`, `.json` | Portable saved graph views and graph archives. |
| Share URLs | URL hash compressed with pako | Local content sharing without a backend upload. |

When adding persisted data, update save, restore, reset, and migration/default paths together.

---

## Code Converter Architecture

The code converter is a Node.js script at `code_converter/dependency-md-generator.js`.

It scans a source folder and produces Markdown dependency maps that can be opened in MD-Editor. Those generated Markdown files can then be previewed, linked, graphed, exported, or used as a starting point for refactoring notes.

The desktop app copies this script to `desktop-app/resources/code_converter/dependency-md-generator.js` during preparation so the desktop UI can run the converter through the Neutralino integration.

---

## Deployment Architecture

### Static Web

The web app can be served by any static file server. There is no server-side rendering or API requirement.

Common local option:

```bash
cd web-app
python -m http.server 9500 --bind 127.0.0.1 --directory .
```

### Docker Web

`web-app/Dockerfile` uses `nginx:alpine`, copies the static app into `/usr/share/nginx/html/`, configures fallback routing to `index.html`, adds long-lived cache headers for static assets, and sets basic security headers.

`web-app/docker-compose.yml` builds the image locally and maps `8080:80`.

### Desktop

`desktop-app/package.json` provides:

| Script | Purpose |
|--------|---------|
| `npm run setup` | Check Neutralino binaries and download vendored browser assets. |
| `npm run dev` | Prepare resources and run the Neutralino app. |
| `npm run build` | Build an embedded-resource desktop package. |
| `npm run build:portable` | Build a portable release package. |
| `npm run build:all` | Run both desktop build modes. |

---

## Testing and Quality Gates

The web app owns the current test entry points.

| Command | Location | Purpose |
|---------|----------|---------|
| `npm run check:js` | `web-app/` | Runs `node --check` over every split module and `script.js`. |
| `npm test` | `web-app/` | Runs Node tests in `web-app/tests/*.test.js`. |
| `npm run test:e2e` | `web-app/` | Runs Playwright tests from `web-app/tests/e2e/`. |
| `npm run test:all` | `web-app/` | Runs syntax checks, Node tests, and Playwright tests. |

Playwright is configured in `web-app/playwright.config.js`. It starts a local static server at `http://127.0.0.1:9500` with `python -m http.server 9500 --bind 127.0.0.1 --directory .`.

---

## Technology Stack

| Area | Technology | Role |
|------|------------|------|
| App shell | HTML5 | Single-page structure and script loading. |
| Styling | CSS3 | App layout, themes, responsive behavior, and component styling. |
| UI helpers | Bootstrap, Bootstrap Icons, GitHub Markdown CSS | Dropdown/modal behavior, icons, and Markdown preview defaults. |
| Runtime language | Vanilla JavaScript | Browser runtime, module registration, app workflows, and desktop-shared logic. |
| Markdown parsing | Marked.js | Markdown-to-HTML conversion. |
| Sanitization | DOMPurify | Cleans rendered HTML before preview insertion. |
| Code highlighting | highlight.js | Syntax highlighting for rendered code blocks. |
| Math | MathJax | LaTeX math rendering. |
| Diagrams | Mermaid | Diagram rendering and SVG/PNG export support. |
| Emoji | JoyPixels / emoji-toolkit | Emoji shortcode rendering and emoji styling. |
| YAML | js-yaml | Frontmatter parsing and tag extraction. |
| Graphs | D3.js | Interactive graph layout, zoom, drag, selection, and rendering. |
| Export | FileSaver.js, html2pdf.js, jsPDF, html2canvas, pdfmake | Downloads, PDF generation, image/canvas export paths. |
| Compression | pako | Share URL compression and decompression. |
| Web packaging | Docker, Nginx Alpine | Static web container. |
| Desktop runtime | Neutralinojs | Native desktop shell and filesystem/OS integration. |
| Desktop tooling | Node.js, npm scripts, Neutralino CLI | Vendor downloads, resource preparation, and desktop builds. |
| Testing | Node test runner, Playwright | Unit/smoke checks and browser end-to-end tests. |

---

## Security and Privacy Model

MD-Editor is designed around local processing:

- Markdown content is rendered in the browser or desktop WebView.
- Rendered Markdown HTML is sanitized with DOMPurify before it reaches the preview.
- Share links encode content in the URL hash instead of uploading it.
- GitHub import contacts GitHub only when the user requests an import from a repository URL.
- Desktop native access is constrained by Neutralino's allow list and guarded by runtime feature checks.
- There is no required account system, analytics pipeline, document upload service, or app database.

For offline or restricted deployments, use vendored/local dependencies instead of CDN URLs and serve all assets with the app.

---

## Developer Workflow

Typical local commands:

```bash
# Web syntax checks and tests
cd web-app
npm run check:js
npm test
npm run test:e2e

# Local static web server
python -m http.server 9500 --bind 127.0.0.1 --directory .

# Web Docker container
docker compose up --build

# Desktop app
cd ../desktop-app
npm run dev
npm run build
```

Development guidelines:

- Treat `web-app/` as the canonical source for shared web/desktop behavior.
- Put new isolated behavior in a focused `web-app/js/` module when possible.
- Keep `script.js` focused on composition, event wiring, startup, and compatibility glue.
- Rerun desktop setup/prepare/build after changing shared web files that must appear in `desktop-app/resources/`.
- Update docs and tests when changing runtime architecture, storage shape, graph behavior, file workflows, or settings.

---

## Related References

- [Project Modules](Modules)
- [Application Runtime Architecture](Application-Runtime-Module)
- [Script Function Reference](Script-Functions)
- [Configuration](Configuration)
- [Desktop App](Desktop-App)
- [Docker Deployment](Docker-Deployment)
- [Contributing](Contributing)
