# Features

A detailed reference for the features supported by **MD-Editor**.

---

## Table of Contents

- [Editing Workspace](#editing-workspace)
- [Markdown Rendering](#markdown-rendering)
- [Syntax Highlighting](#syntax-highlighting)
- [LaTeX Mathematical Equations](#latex-mathematical-equations)
- [Mermaid Diagrams](#mermaid-diagrams)
- [Formatting Tools](#formatting-tools)
- [Tabs And Session Restore](#tabs-and-session-restore)
- [Files And Folder Workspaces](#files-and-folder-workspaces)
- [GitHub Import](#github-import)
- [Graph View](#graph-view)
- [Tags And Graph Groups](#tags-and-graph-groups)
- [Graph Documents And Archives](#graph-documents-and-archives)
- [Code To Markdown Converter](#code-to-markdown-converter)
- [Export And Sharing](#export-and-sharing)
- [View Modes And Layout](#view-modes-and-layout)
- [Search, Replace, And Navigation](#search-replace-and-navigation)
- [Settings And Preferences](#settings-and-preferences)
- [Recent Items](#recent-items)
- [Content Statistics](#content-statistics)
- [Desktop App](#desktop-app)
- [Responsive Design](#responsive-design)
- [Privacy And Security](#privacy-and-security)

---

## Editing Workspace

MD-Editor is a local-first Markdown workspace for writing, previewing, organizing, and exporting technical documents.

- Split editor and preview panes update as you type.
- Editor-only, split, and preview-only modes are available.
- A status line shows reading time, word count, character count, file count, folder count, tips, and zoom or graph state.
- Markdown rendering, tab state, graph state, and exports are handled locally in the browser or desktop app.

---

## Markdown Rendering

The preview supports GitHub-style Markdown output with technical-document features:

- GitHub Flavored Markdown tables, task lists, strikethrough, autolinks, and fenced code blocks.
- YAML frontmatter rendered as document metadata.
- GitHub-style Markdown alerts.
- Inline HTML where allowed by the sanitized renderer.
- Emoji shortcodes and standard Unicode emoji.
- Links, images, references, tables, keyboard tags, subscript, superscript, and other common Markdown/HTML authoring patterns.

Rendered HTML is sanitized with DOMPurify before it is inserted into the page.

---

## Syntax Highlighting

Code blocks are syntax-highlighted with highlight.js.

To enable language-aware highlighting, specify the language after the opening fence:

````markdown
```javascript
function renderMarkdown(markdown) {
  const html = marked.parse(markdown);
  return DOMPurify.sanitize(html);
}
```
````

Common languages include JavaScript, TypeScript, Python, Java, C#, HTML, CSS, JSON, YAML, Bash, SQL, XML, Markdown, and many others supported by highlight.js.

---

## LaTeX Mathematical Equations

Mathematical expressions are rendered with MathJax.

Inline math:

```markdown
Inline math: $E = mc^2$
```

Block math:

```markdown
$$
\sum_{i=1}^{n} i^2 = \frac{n(n+1)(2n+1)}{6}
$$
```

---

## Mermaid Diagrams

Mermaid diagrams are rendered from fenced code blocks tagged with `mermaid`.

Supported diagram families include flowcharts, sequence diagrams, class diagrams, state diagrams, entity-relationship diagrams, Gantt charts, pie charts, user journeys, git graphs, and mindmaps.

Rendered diagrams support an interactive zoom view and can be inspected without leaving the document.

---

## Formatting Tools

The editor toolbar provides quick insertion and editing tools for common Markdown structures:

- Undo, redo, and clear Markdown formatting.
- Bold, italic, strikethrough, blockquote, inline code, and fenced code.
- Title case, uppercase, and lowercase transforms.
- Headings `H1` through `H6`.
- Bulleted lists, numbered lists, task lists, and horizontal rules.
- Links, references, images, URLs, and tables.
- GitHub-style alerts.
- Symbols, HTML entities, and emoji shortcode insertion.
- Find and replace.

---

## Tabs And Session Restore

MD-Editor supports multi-document work rather than a single editor buffer.

- Create new documents in tabs.
- Open imported files in new tabs.
- Rename, duplicate, close, and reset tabs.
- Keep multiple Markdown files, generated documents, and graph views open at once.
- Restore tab state and editor content from local storage.
- Close all tabs or reset the workspace when you want a clean start.

---

## Files And Folder Workspaces

The app can work with individual files or full folders.

- Open local Markdown files.
- Open folders of Markdown documents and graph files.
- Drag and drop Markdown files or folders into the app.
- Browse files in a resizable folder tree.
- Expand or collapse folders.
- Auto-select the current file in the tree.
- Filter files and folders by text.
- Sort by file name, modified time, or created time.
- Show or hide unsupported file types.
- Open, reveal, rename, delete, tag, copy, share, and export files from context actions.
- Track file and folder counts in the status line.

Supported Markdown file extensions include `.md` and `.markdown`. Graph document files are also recognized by the workspace.

---

## GitHub Import

Public GitHub content can be imported directly into the workspace.

- Import from public repository URLs.
- Import from public folder URLs.
- Import from public Markdown file URLs.
- Discover multiple Markdown files from a repository or folder.
- Select one, many, or all discovered files for import.
- Open imported files as tabs for editing and previewing.

GitHub import uses public GitHub APIs and raw file URLs.

---

## Graph View

Graph View turns folders, Markdown links, tags, and generated dependency maps into an interactive relationship graph. It is designed for understanding document systems and exploring codebases generated through the code-to-Markdown workflow.

- Build relationship maps from open folders.
- Visualize dependency links, Markdown links, tags, and generated code-map relationships.
- Explore code structure visually when dependencies are difficult to understand from a file tree.
- Select nodes and inspect connected relationships.
- Use modifier-assisted hover behavior to explore incoming, outgoing, and tag-related links.
- Search graph files by name or path.
- Toggle arrows, orphan nodes, and labels.
- Adjust text fade threshold, node size, link thickness, and graph forces.
- Zoom, pan, drag nodes, and preserve graph layout.
- Open local graphs, full local graphs, full networks, or expanded cluster graphs in new tabs.
- Hide leaf points or individual points to reduce noise.
- Collapse nodes into clusters and expand clusters when needed.
- Use large-graph behavior and warnings to keep heavy maps manageable.

Graph View is especially useful for dependency visibility, refactoring preparation, and exporting connected areas of a codebase for focused follow-up work.

---

## Tags And Graph Groups

Tags help organize files and graph nodes across larger workspaces.

- Read tags from YAML frontmatter.
- Add or remove tags from files through graph and folder workflows.
- Search and manage known tags from the folder toolbar.
- Show or hide tag nodes in Graph View.
- Filter the graph by selected tag.
- Limit the graph to files with a selected tag.
- Group graph nodes by folder, tags, or highly referenced areas.
- Collapse, expand, and inspect grouped areas.

---

## Graph Documents And Archives

Graph views can be saved and moved between sessions.

- Save the current graph view.
- Export a folder to a portable graph archive.
- Include Markdown file contents when exporting a folder graph.
- Reopen saved graph documents as graph tabs.
- Detect when a saved graph is stale compared with the current folder.
- Review graph difference summaries and update graph data when source files change.
- Use lightweight saved graphs when file contents are not embedded.

This allows graph snapshots to become documentation artifacts that can be shared, reviewed, or revisited later.

---

## Code To Markdown Converter

The code converter generates Markdown documentation from source-code folders.

- Choose a source root folder and a destination Markdown root folder.
- Generate one Markdown file per source file.
- Record local dependencies such as imports and references.
- Include optional documentation details:
  - Methods and functions.
  - Setters and getters.
  - Full method and function signatures.
  - Return codes and return values.
  - Exceptions and thrown errors.
  - Package or module names.
- Open the generated Markdown folder in MD-Editor.
- Graph the generated documentation as a dependency map.

Supported converter languages: JavaScript, TypeScript, Python, Java, and C#.

Supported extensions include `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.py`, `.java`, and `.cs`.

The desktop app can also run installed converter extensions. Place a converter manifest at:

```text
<MD-Editor app folder>/extensions/code-converters/<converter-id>/converter.json
```

External converters are standalone executables. MD-Editor runs them as `command <manifest args> --root <source-folder> --vault <destination-folder> <selected flags>`.

The desktop app includes a Semantic Java Converter extension for compiler-aware local Java dependency links.

---

## Export And Sharing

MD-Editor can export current documents, graph-backed content, and folders in multiple ways.

- Export Markdown (`.md`) from the editor source.
- Export standalone HTML with rendered content.
- Export PDF from the rendered preview.
- Export a folder to a graph archive.
- Save graph views.
- Share compressed Markdown through the page URL.
- Copy rendered HTML to the clipboard for pasting into rich-text tools.
- Copy graph node paths, contents, frontmatter, tags, and connected subgraphs where graph context actions are available.

Share links encode content into the URL hash and do not upload the document to a server.

---

## View Modes And Layout

The workspace can be adjusted for different reading and editing tasks.

| Mode | Description |
|------|-------------|
| **Editor** | Full-width Markdown editor. |
| **Split** | Editor and preview side by side. |
| **Preview** | Full-width rendered preview. |

Additional layout features:

- Resizable editor and preview panes.
- Resizable sidebar and folder dropzone areas.
- Synchronized scrolling between editor and preview.
- Zoom controls for preview and graph workflows.
- Desktop and mobile menus with matching core actions.

---

## Search, Replace, And Navigation

The app includes focused navigation tools for documents, folders, and graphs.

- Find and replace inside the editor.
- Search graph nodes by file name or path.
- Filter folder tree contents.
- Navigate tabs with scroll controls when many documents are open.
- Reveal files in the folder tree from graph context.
- Open related graph scopes from a selected node.

---

## Settings And Preferences

Settings let users shape the app around their workflow.

- Tune graph density thresholds and large-graph warnings.
- Control auto-collapse behavior for clusters.
- Dim unrelated graph nodes during hover.
- Show connected labels and highlighted connected lines.
- Show or hide file extensions in graph labels.
- Choose graph node and find-highlight colors.
- Configure recent file and folder limits.
- Adjust menu tooltip delay.
- Choose which high-impact actions require confirmation.
- Clear cache, preferences, recent history, or reset all stored app state.

Preferences are stored locally and can be reset from the settings dialog.

---

## Recent Items

MD-Editor keeps recent files and folders close to the main action menu.

- Reopen recent files.
- Reopen recent folders.
- Remove individual recent items from the menu.
- Limit how many recent files and folders are retained.
- Clear recent history from settings.

In browsers that support file system handles, the app can reuse granted file or folder access when permissions are still available. In the desktop app, recent items are backed by the Neutralino profile flow.

---

## Content Statistics

The status line reports live document information:

- Estimated reading time.
- Word count.
- Character count.
- Open folder file count.
- Open folder directory count.
- Graph zoom, selected node count, total nodes, edge count, cluster count, and collapsed count when Graph View is active.

---

## Desktop App

The desktop app is powered by Neutralinojs and uses the same web UI and editor logic as the browser version.

- Native desktop window.
- Native file and folder dialogs.
- Desktop lifecycle integration.
- Shared editor, preview, graph, export, and code-converter workflows.
- Build outputs for Windows, Linux, and macOS.

---

## Responsive Design

The interface adapts across desktop and smaller screens.

- Desktop layouts prioritize the sidebar, tabs, toolbar, editor, preview, and graph controls.
- Mobile menus expose document tabs, view modes, file actions, settings, conversion, and graph actions.
- The app can switch between editor, split, and preview workflows depending on available space.

---

## Privacy And Security

MD-Editor is designed around local processing.

- Markdown rendering happens in the browser or desktop app.
- Tab state, preferences, recent items, and graph state are stored locally.
- Share links encode content into the URL hash instead of uploading it.
- GitHub import only accesses public GitHub content.
- Rendered HTML is sanitized before display.
- The web build references public CDN libraries from `index.html`.
- For isolated or offline use, serve vendored desktop resources or replace CDN references with local assets.
- The app does not include analytics, cookies, or tracking scripts.
