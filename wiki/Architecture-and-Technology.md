# Architecture and Technology

This document explains how **Markdown Viewer** is structured, how data moves through the application, and which technologies power the web and desktop experiences.

---

## Table of Contents

- [Architecture Overview](#architecture-overview)
- [Repository Layout](#repository-layout)
- [Runtime Architecture](#runtime-architecture)
- [Rendering Pipeline](#rendering-pipeline)
- [State and Persistence](#state-and-persistence)
- [File, Folder, and Graph Workflows](#file-folder-and-graph-workflows)
- [Web Deployment](#web-deployment)
- [Desktop Deployment](#desktop-deployment)
- [Technology Stack](#technology-stack)
- [Security and Privacy Model](#security-and-privacy-model)
- [Development Workflow](#development-workflow)

---

## Architecture Overview

Markdown Viewer is a static, client-side Markdown workspace. The core application is delivered as HTML, CSS, and JavaScript from `web-app/`, and the desktop application reuses the same browser assets inside a Neutralinojs shell.

At a high level, the architecture has four layers:

1. **Presentation layer** — `web-app/index.html` defines the application shell, toolbars, modals, sidebar, editor, preview area, graph view controls, and CDN dependency loading.
2. **Styling layer** — `web-app/styles.css` provides the responsive layout, theme variables, editor/preview styling, sidebar, tab bar, graph view, context menus, and mobile behavior.
3. **Application layer** — `web-app/script.js` contains the client-side logic for rendering Markdown, managing tabs, importing/exporting files, folder browsing, graph visualization, persistence, and interaction handlers.
4. **Packaging layer** — Docker serves the web app with Nginx, while Neutralinojs packages the same app as a desktop application with native filesystem and OS integrations.

The browser version does not require a backend API. It only makes external requests when users load CDN libraries, import public GitHub content, or run a deployment that uses remote container images.

---

## Repository Layout

| Path | Purpose |
|------|---------|
| `README.md` | Project overview, feature list, quick start, and links. |
| `web-app/` | Static web application source. This is the canonical UI and application logic. |
| `web-app/index.html` | Application shell and CDN dependency declarations. |
| `web-app/script.js` | Main client-side application module. |
| `web-app/styles.css` | Full application styling and responsive behavior. |
| `web-app/assets/` | Images, icons, screenshots, and visual assets. |
| `web-app/Dockerfile` | Nginx-based container image for serving the static web app. |
| `web-app/docker-compose.yml` | Local Docker Compose service for the web app. |
| `desktop-app/` | Neutralinojs desktop wrapper and build tooling. |
| `desktop-app/prepare.js` | Copies shared web assets into Neutralino resources and generates the desktop `index.html`. |
| `desktop-app/setup-binaries.js` | Downloads and caches version-pinned Neutralinojs binaries. |
| `desktop-app/neutralino.config.json` | Desktop app runtime, window, permissions, and build configuration. |
| `desktop-app/resources/js/main.js` | Desktop-only Neutralino lifecycle, tray, window-close, and startup file handling. |
| `wiki/` | Project documentation pages. |
| `start_web.bat` / `start_desktop.bat` | Convenience scripts for local Windows startup. |

---

## Runtime Architecture

### Web Runtime

The web runtime starts when the browser loads `web-app/index.html`. The page loads third-party libraries first, then runs `web-app/script.js` after the DOM is available. The script initializes application state, reads saved preferences, configures Markdown rendering, wires UI events, restores tabs, and renders the active document.

The web app can be served by any static file server because routing, state, rendering, import/export, and graph operations are handled in the browser.

### Desktop Runtime

The desktop runtime is a Neutralinojs application. It does not maintain a separate implementation of the editor. Instead, `desktop-app/prepare.js` copies the shared web files into `desktop-app/resources/` and injects Neutralino-specific scripts into the generated desktop HTML.

At runtime, `desktop-app/resources/js/main.js` initializes Neutralino, adds a desktop exit action, configures tray behavior, intercepts window-close events so unsaved changes can be confirmed, and opens text files passed through command-line arguments.

### Shared-Core Design

The most important architectural decision is that the browser and desktop editions share the same core web implementation. This keeps rendering, tabs, graph behavior, themes, imports, exports, and editor behavior consistent across platforms. Desktop-only code is limited to platform integration: filesystem dialogs, app lifecycle, tray menus, and startup file loading.

---

## Rendering Pipeline

The Markdown rendering pipeline is fully client-side:

1. **Input** — The user edits Markdown in the text editor, opens files, drops files/folders, imports from GitHub, loads a share URL, or opens a saved graph document.
2. **Debounced render** — Editor changes trigger a short render delay to keep typing responsive.
3. **Markdown parsing** — Marked.js parses GitHub-flavored Markdown with a custom renderer.
4. **Code handling** — Code fences are syntax-highlighted with highlight.js. Mermaid code fences are converted into Mermaid diagram containers instead of normal code blocks.
5. **Post-processing** — Rendered HTML is enhanced for GitHub-style alerts, heading links, task lists, frontmatter metadata, Mermaid controls, emoji, and other UI affordances.
6. **Sanitization** — Rendered HTML is sanitized with DOMPurify before it is placed in the preview.
7. **Special rendering** — MathJax typesets LaTeX expressions and Mermaid renders diagrams after the preview updates.
8. **Preview output** — The preview pane displays the sanitized and enhanced document, while export actions reuse the rendered document where appropriate.

This pipeline allows the app to support advanced Markdown features without sending document content to a server.

---

## State and Persistence

Markdown Viewer stores user state locally. There is no centralized project database.

| State | Storage / Source | Notes |
|-------|------------------|-------|
| Tabs and active tab | Browser storage | Restores multi-document sessions. |
| Global preferences | Browser storage and desktop profile files when available | Includes theme, sidebar layout, graph settings, and view preferences. |
| Recent files/folders | Browser storage, IndexedDB handles, and Neutralino profile files | Desktop and supported browser APIs can retain handles or paths for easier reopening. |
| Editor content | Active tab state | Tracks unsaved changes against source-backed files. |
| Folder tree state | In-memory plus saved preferences | Built from native directory handles, drag/drop entries, file lists, or Neutralino filesystem reads. |
| Graph state | Tab state and optional graph JSON documents | Stores snapshots, layout, filters, groups, hidden nodes, and related metadata. |

In the browser, support for directory and file handles depends on the user's browser APIs. In the desktop app, Neutralinojs provides native filesystem and OS access based on the configured allow list.

---

## File, Folder, and Graph Workflows

### File Workflow

Markdown files can enter the app through drag-and-drop, local pickers, folder browsing, GitHub import, recent items, share URLs, or desktop command-line arguments. Source-backed tabs keep metadata such as file handles, paths, names, and modified content so save actions can write back when the platform allows it.

### Folder Workflow

Folder features build an in-memory tree of Markdown and supported text files. The sidebar can filter, sort, auto-select the active tab, show unsupported file types, create files/folders, rename entries, delete entries, and update related open tabs or graph references.

### Graph Workflow

The graph view extracts Markdown links, wiki links, tags, and YAML frontmatter tags from the current folder or saved graph archive. It then creates graph nodes and edges that can be filtered, grouped, rearranged, saved, exported, and reopened. Graph archives can include Markdown file contents for portable viewing.

---

## Web Deployment

The web app is deployable as static files. The Docker image uses `nginx:alpine`, copies the contents of `web-app/` into Nginx's HTML directory, configures SPA-style fallback routing, adds long-term cache headers for static assets, and sends basic security headers.

Common deployment options include:

- Any static hosting provider.
- A local static server such as `python3 -m http.server`.
- Docker with `web-app/Dockerfile`.
- Docker Compose with `web-app/docker-compose.yml`.

---

## Desktop Deployment

The desktop app is built with Neutralinojs and npm scripts in `desktop-app/package.json`.

The desktop build flow is:

1. `npm run setup` runs `setup-binaries.js`.
2. `setup-binaries.js` checks the version pinned in `neutralino.config.json` and downloads Neutralino binaries only when needed.
3. npm's `postsetup` hook runs `prepare.js`.
4. `prepare.js` copies `web-app/script.js`, `web-app/styles.css`, and `web-app/assets/` into `desktop-app/resources/`.
5. `prepare.js` rewrites paths and injects Neutralino scripts into `resources/index.html`.
6. Neutralino's CLI runs or builds the app from the generated resources.

Build modes include development run, embedded-resource build, portable release build, and combined build.

---

## Technology Stack

| Area | Technology | Role |
|------|------------|------|
| Markup and app shell | HTML5 | Defines the single-page application structure. |
| Styling | CSS3, Bootstrap, Bootstrap Icons, GitHub Markdown CSS | Layout, components, icons, Markdown preview styling, and responsive behavior. |
| Application logic | Vanilla JavaScript | Main client-side runtime and feature implementation. |
| Markdown parsing | Marked.js | Converts Markdown text to HTML. |
| Syntax highlighting | highlight.js | Highlights code blocks. |
| HTML sanitization | DOMPurify | Sanitizes rendered preview HTML. |
| Math rendering | MathJax | Renders inline and block LaTeX. |
| Diagrams | Mermaid | Renders diagrams from Mermaid code fences. |
| Emoji | JoyPixels / emoji-toolkit | Converts shortcode emoji and supports emoji styling. |
| YAML parsing | js-yaml | Parses YAML frontmatter metadata and tags. |
| Graph visualization | D3.js | Renders and interacts with graph view nodes and links. |
| Export | FileSaver.js, html2pdf.js, jsPDF, html2canvas, pdfmake | Saves Markdown, standalone HTML, PDF, and image outputs. |
| Share links | pako | Compresses and decompresses share URL content. |
| Web packaging | Docker, Nginx Alpine | Serves the static app in a production container. |
| Desktop runtime | Neutralinojs | Packages the web app as a native desktop application. |
| Desktop tooling | Node.js, npm scripts | Prepares resources, downloads binaries, and runs builds. |

---

## Security and Privacy Model

Markdown Viewer is designed around local-first processing:

- Markdown content is rendered in the user's browser or desktop WebView.
- DOMPurify sanitizes rendered HTML before preview insertion.
- Share links encode document content into the URL instead of uploading it.
- GitHub import only contacts public GitHub endpoints for user-requested imports.
- The desktop runtime restricts native calls through Neutralinojs configuration.
- No server-side database, account system, analytics pipeline, or document upload service is required by the app.

When deploying in environments that require zero third-party requests, replace CDN dependencies with local assets and serve them with the app.

---

## Development Workflow

Typical development tasks:

```bash
# Run the web app from the repository root
python3 -m http.server 8080 --directory web-app

# Prepare and run the desktop app
cd desktop-app
npm run dev

# Build the web container
cd web-app
docker compose up --build

# Build desktop artifacts
cd desktop-app
npm run build
```

When changing shared behavior, edit the canonical files in `web-app/`. Then rerun the desktop prepare/build workflow so generated desktop resources include the latest web changes.
