# MD-Editor Wiki

Welcome to the **MD-Editor** wiki. This is the documentation hub for installing, using, configuring, deploying, and developing the app.

MD-Editor is a local-first Markdown workspace for writing, previewing, organizing, graphing, and exporting technical documents. It runs as a static web app and as a Neutralino-powered desktop app, with shared editor, preview, graph, export, and code-converter workflows.

---

## Table of Contents

- [Start Here](#start-here)
- [User Guides](#user-guides)
- [Setup And Deployment](#setup-and-deployment)
- [Architecture And Development](#architecture-and-development)
- [Reference](#reference)
- [Project And Release Information](#project-and-release-information)
- [Feature Highlights](#feature-highlights)
- [Privacy And Data Handling](#privacy-and-data-handling)
- [Technology Snapshot](#technology-snapshot)
- [Repository Links](#repository-links)

---

## Start Here

| Page | Use It For |
|------|------------|
| [Home](Home) | Return to this wiki index. |
| [Installation](Installation) | Run MD-Editor locally, with Docker, as a self-hosted static app, or as a desktop app. |
| [Usage Guide](Usage-Guide) | Learn the main workflows: editing, tabs, folders, graph view, tags, exports, settings, and desktop use. |
| [Features](Features) | Review the complete current feature list. |
| [FAQ](FAQ) | Find quick answers to common setup and usage questions. |

---

## User Guides

| Page | Use It For |
|------|------------|
| [Markdown Reference](Markdown-Reference) | See supported Markdown syntax, Mermaid, math, frontmatter, alerts, tables, links, and other authoring patterns. |
| [Configuration](Configuration) | Understand settings available in the UI and relevant app/build configuration files. |
| [Desktop App](Desktop-App) | Run, build, and understand the Neutralino desktop app. |

---

## Setup And Deployment

| Page | Use It For |
|------|------------|
| [Installation](Installation) | Choose the right installation path for web, Docker, desktop, or static hosting. |
| [Docker Deployment](Docker-Deployment) | Build and run the Nginx-based static web container with Docker or Docker Compose. |
| [Desktop App](Desktop-App) | Prepare desktop resources, run the desktop app, and build desktop artifacts. |

Quick local web start:

```bash
python -m http.server 9500 --directory web-app
```

Then open:

```text
http://localhost:9500/
```

Quick Docker Compose start:

```bash
cd web-app
docker compose up --build
```

Then open:

```text
http://localhost:8080/
```

Quick desktop start:

```bash
cd desktop-app
npm run dev
```

---

## Architecture And Development

| Page | Use It For |
|------|------------|
| [Architecture and Technology](Architecture-and-Technology) | Learn the app architecture, technology stack, deployment model, testing setup, and data flow. |
| [Project Modules](Modules) | See the current module map across `web-app/`, `web-app/js/`, `desktop-app/`, and support tooling. |
| [Application Runtime Architecture](Application-Runtime-Module) | Understand runtime startup, load order, app context, module registration, state, and browser/desktop compatibility. |
| [Script Function Reference](Script-Functions) | Review the named functions that still live in `web-app/script.js`. |
| [Contributing](Contributing) | Follow contribution, testing, and project workflow guidance. |

---

## Reference

| Page | Use It For |
|------|------------|
| [Markdown Reference](Markdown-Reference) | Authoring syntax and rendering examples. |
| [Configuration](Configuration) | Settings, preferences, storage keys, desktop config, Docker config, and development scripts. |
| [Script Function Reference](Script-Functions) | Function-level runtime reference for `web-app/script.js`. |
| [FAQ](FAQ) | Common troubleshooting and behavior notes. |

---

## Project And Release Information

| Page | Use It For |
|------|------------|
| [Release Notes](Release-Notes) | Track release history and notable changes. |
| [Contributing](Contributing) | Understand how to work on the project safely. |

---

## Feature Highlights

- Multi-tab Markdown editing with session restore.
- GitHub-style live preview with syntax highlighting, Mermaid diagrams, MathJax math, emoji, frontmatter, alerts, and tables.
- Local file open/save workflows, drag and drop, recent files, and recent folders.
- Folder workspaces with filtering, sorting, context actions, tag workflows, and status counts.
- GitHub import for public Markdown repositories, folders, and files.
- Graph View for Markdown links, wiki links, tags, generated dependency maps, graph documents, and graph archives.
- Code to Markdown conversion for JavaScript, TypeScript, Python, Java, and C# source folders.
- Exports for Markdown, standalone HTML, PDF, graph documents, graph archives, Mermaid SVG/PNG, clipboard content, and compressed share URLs.
- Settings for layout, graph behavior, colors, recent item limits, tooltip delay, confirmations, and reset actions.
- Shared web and desktop experience through the static web app and Neutralino desktop wrapper.

---

## Privacy And Data Handling

MD-Editor is designed around local processing:

- Markdown rendering, tab state, graph state, and exports run in the browser or desktop app.
- Tab state, preferences, recent items, and graph state are stored locally.
- Browser file/folder handles may be stored in IndexedDB when supported.
- Desktop recent items and preferences can use local `.mdviewer` profile files.
- Share links encode Markdown content into the URL hash instead of uploading it.
- GitHub import contacts public GitHub endpoints only when you request an import.
- The web build loads third-party libraries from public CDNs unless you replace them with local assets.
- The app does not require accounts, analytics, cookies, tracking scripts, or a backend document service.

---

## Technology Snapshot

| Area | Technology |
|------|------------|
| App shell | Static HTML, CSS, and vanilla JavaScript |
| Module style | Classic scripts with `window.registerMarkdownViewer...` registration functions |
| Markdown | Marked.js, GitHub Markdown CSS |
| Sanitization | DOMPurify |
| Code highlighting | highlight.js |
| Math | MathJax |
| Diagrams | Mermaid |
| Graphs | D3.js |
| YAML | js-yaml |
| Exports | FileSaver.js, html2pdf.js, jsPDF, html2canvas, pdfmake |
| Share URLs | pako |
| Web container | Docker and Nginx Alpine |
| Desktop | Neutralinojs |
| Tests | Node test runner and Playwright |

---

## Repository Links

- [GitHub Repository](https://github.com/shaybc/md-editor)
- [Releases](https://github.com/shaybc/md-editor/releases)
- [License](https://github.com/shaybc/md-editor/blob/main/LICENSE)
