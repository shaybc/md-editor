---
tags: []
---
# MD-Editor

<div align="center">
  <img src="desktop-app/resources/assets/icon.jpg" alt="MD-Editor Logo" width="140" />

  <p><strong>MD-Editor is a local Markdown workspace.</strong></p>
  <p>Convert code to Markdown, edit rich technical documents, and explore code dependencies as graphs.</p>

  <p>
    <a href="desktop-app/help/user/index.md" target="_blank" rel="noopener noreferrer">User Guide</a> |
    <a href="desktop-app/help/developer/index.md" target="_blank" rel="noopener noreferrer">Developer Guide</a> |
    <a href="desktop-app/help/user/release-notes.md" target="_blank" rel="noopener noreferrer">Release Notes</a>
  </p>

  <p>
    <img src="desktop-app/resources/assets/badges/license.svg" alt="License: Apache 2.0" />
    <img src="desktop-app/resources/assets/badges/release.svg" alt="Release: v10.1" />
    <img src="desktop-app/resources/assets/badges/tests.svg" alt="Tests: 28 passing" />
    <img src="desktop-app/resources/assets/badges/app.svg" alt="App: desktop" />
    <img src="desktop-app/resources/assets/badges/code-maps.svg" alt="Code maps: JS TS PY Java C#" />
  </p>
</div>

MD-Editor is a local-first Markdown workspace for writing, previewing, organizing, and exporting technical documents.
It runs as a Neutralino-powered desktop app backed by the checked-in resources under `desktop-app/resources`.
The project includes multi-tab editing, folder import, graph visualization, Markdown export workflows, and a code-to-Markdown converter that can turn source trees into navigable dependency maps.

---

## Table of Contents

- [What It Does](#what-it-does)
- [Screenshots](#screenshots)
  - [Split Editor And Live Preview](#split-editor-and-live-preview)
  - [Folder Workspace And Rich Markdown](#folder-workspace-and-rich-markdown)
  - [Graph View And File Actions](#graph-view-and-file-actions)
  - [Navigation Menu And Graph Selection](#navigation-menu-and-graph-selection)
  - [Settings](#settings)
  - [Convert Code To MD](#convert-code-to-md)
- [Key Features](#key-features)
- [Repository Layout](#repository-layout)
- [Run The Desktop App](#run-the-desktop-app)
- [Convert Code To Markdown](#convert-code-to-markdown)
- [Development](#development)
- [Privacy Model](#privacy-model)
- [Project Origin](#project-origin)
- [License](#license)

---

## What It Does

- Write Markdown in a split editor with live GitHub-style preview.
- Render tables, code blocks, GitHub alerts, Mermaid diagrams, LaTeX math, emoji, and YAML frontmatter.
- Work across multiple tabs with session restore, rename, duplicate, close, and reset actions.
- Open individual text files or folders of Markdown documents.
- Explore folder relationships in Graph View, including Markdown links, tags, and generated dependency maps.
- Export documents as Markdown, HTML, or PDF.
- Share compressed documents through URLs.
- Convert source code folders into Markdown files with dependency links and optional member documentation.

## Screenshots

### Split Editor And Live Preview

Write Markdown on the left and review the rendered document on the right without leaving the workspace. The preview supports syntax-highlighted code blocks, LaTeX math, Mermaid diagrams, and task lists.

![Split editor and live preview](desktop-app/resources/assets/screenshots/screenshot-1.png)

### Folder Workspace And Rich Markdown

Open a folder to browse local Markdown files, switch between multiple tabs, and keep documents organized in a tree. The same preview renderer handles tables, inline formatting, keyboard tags, GitHub-style alerts, and helpful links.

![Folder workspace and rich Markdown preview](desktop-app/resources/assets/screenshots/screenshot-2.png)

### Graph View And File Actions

Graph View turns linked Markdown folders and generated code maps into an interactive relationship map. It helps you explore code structure visually, see dependency relationships that are hard to spot in a file tree, and export connected parts of the codebase for deeper analysis, follow-up work, or refactoring.

![Graph view and file actions](desktop-app/resources/assets/screenshots/screenshot-3.png)

### Navigation Menu And Graph Selection

The main menu keeps workspace actions close at hand, including GitHub import, local file and folder open, recent items, graph saving, folder-to-graph export, and code conversion. Selected graph nodes are highlighted with connected relationships so larger dependency maps stay readable.

![Navigation menu and selected graph nodes](desktop-app/resources/assets/screenshots/screenshot-4.png)

### Settings

Settings let you shape MD-Editor around the way you work. You can make graph exploration denser or calmer, adjust visual emphasis, control how much history the app remembers, and choose which high-impact actions should ask for confirmation.

![Settings dialog](desktop-app/resources/assets/screenshots/screenshot-5.png)

### Convert Code To MD

The converter generates one Markdown file per source file and records local dependencies, metadata, signatures, return values, exceptions, and package/module names when requested.
After conversion, generated Markdown files can be opened in the same folder tree and previewed like any other document. This lets source-code documentation become part of the same tabbed writing, reviewing, and graph exploration flow.

Supported converter languages: JavaScript, TypeScript, Python, Java, and C#.

![Convert Code to MD dialog](desktop-app/resources/assets/screenshots/screenshot-6.png)

## Key Features

| Area | Highlights |
| --- | --- |
| Editing | Multi-tab Markdown editing, formatting toolbar, find/replace, syntax-aware editor overlay |
| Preview | GitHub-flavored Markdown, frontmatter table, Mermaid, MathJax, syntax highlighting, alerts |
| Files | Local file open, folder import, drag and drop, recent files and folders |
| Graphs | Folder graph view, tags, filters, node controls, saved graph documents |
| Export | Markdown, standalone HTML, PDF, folder-to-graph archive |
| Code maps | Dependency Markdown generation for JS/TS, Python, Java, and C# |
| Desktop | Neutralino app with native file dialogs, desktop profile storage, and app lifecycle hooks |

## Repository Layout

```text
.
|-- desktop-app/          # Neutralino desktop app, resources, tests, and bundled assets
|   `-- converters/       # Source converter projects used by the desktop app
|       |-- code_converter/  # JavaScript/TypeScript/Python/C# code-to-Markdown converter
|       `-- java_converter/  # Java source analyzer and converter
|-- .tools/               # Build and release helper scripts
|-- desktop-app/help/     # User and developer guides
|-- README.md             # Project overview
|-- LICENSE               # Apache 2.0 license
|-- run.bat     # Desktop launch helper
```

## Run The Desktop App

```bash
cd desktop-app
npm run prod
```

The desktop command starts the checked-in Neutralino resources from `desktop-app/resources`.

## Convert Code To Markdown

The converter is available from the app UI and can also be run directly:

```bash
node desktop-app/converters/code_converter/dependency-md-generator.js <source-root> <destination-root> --include-methods --include-signatures
```

Useful switches:

```text
--include-methods
--include-accessors
--include-signatures
--include-return-codes
--include-exceptions
--include-package
```

Open the generated destination folder in MD-Editor to inspect the files as Markdown or graph them as a dependency map.

## Development

Install dependencies for the desktop app:

```bash
cd desktop-app
npm install
```

Run the Node test suite:

```bash
npm test
```

Run JavaScript syntax checks:

```bash
npm run check:js
```

Run Playwright tests:

```bash
npm run test:e2e
```

## Privacy Model

MD-Editor is designed around local processing. Markdown rendering, tab state, graph state, and exports are handled by the desktop app using local files and the bundled resources in `desktop-app/resources`.

## Project Origin

This project started as a fork of [ThisIs-Developer/MD-Editor](https://github.com/ThisIs-Developer/Markdown-Viewer).

## License

This project is licensed under the Apache License 2.0. See [LICENSE](LICENSE) for details.
