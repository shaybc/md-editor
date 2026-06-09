# Usage Guide

This page explains how to use the current **MD-Editor** app features after the web or desktop app is running.

---

## Table of Contents

- [Workspace Overview](#workspace-overview)
- [Create And Edit Documents](#create-and-edit-documents)
- [Use Markdown Rendering Features](#use-markdown-rendering-features)
- [Use Formatting Tools](#use-formatting-tools)
- [Work With Tabs](#work-with-tabs)
- [Open Files](#open-files)
- [Open Folder Workspaces](#open-folder-workspaces)
- [Use Recent Items](#use-recent-items)
- [Import From GitHub](#import-from-github)
- [Use Tags](#use-tags)
- [Use Graph View](#use-graph-view)
- [Save Graph Documents And Archives](#save-graph-documents-and-archives)
- [Use The Code To Markdown Converter](#use-the-code-to-markdown-converter)
- [Export And Share](#export-and-share)
- [Change View Modes And Layout](#change-view-modes-and-layout)
- [Search, Replace, And Navigate](#search-replace-and-navigate)
- [Use Settings](#use-settings)
- [Use The Desktop App](#use-the-desktop-app)
- [Use MD-Editor On Small Screens](#use-md-editor-on-small-screens)
- [Understand Local Data And Privacy](#understand-local-data-and-privacy)
- [Keyboard Shortcuts](#keyboard-shortcuts)

---

## Workspace Overview

MD-Editor is a local-first Markdown workspace. The main screen combines:

- A top action bar for file actions, imports, exports, view controls, settings, and app actions.
- A tab bar for open Markdown documents and graph documents.
- A folder sidebar for workspace files, tags, recent items, and folder actions.
- A Markdown editor pane.
- A live preview pane.
- A graph view for exploring links, tags, dependencies, and saved graph documents.
- A status line with document, folder, and graph information.

Most work happens locally in the browser or desktop app. There is no required server-side workspace.

---

## Create And Edit Documents

Use a new tab or an opened file to start editing Markdown.

1. Create a new document from the document actions.
2. Type Markdown in the editor.
3. Watch the preview update as you work.
4. Use the save action to write back to a source file when the platform supports it, or download/save a generated file when direct write-back is unavailable.

The editor supports plain Markdown editing plus editor tools for formatting, links, images, references, symbols, emoji, alerts, tables, and find/replace.

---

## Use Markdown Rendering Features

The preview renders GitHub-style Markdown and technical-document features:

- GitHub Flavored Markdown tables, task lists, strikethrough, autolinks, and fenced code blocks.
- Syntax-highlighted code blocks through highlight.js.
- YAML frontmatter rendered as document metadata.
- GitHub-style Markdown alerts.
- Inline and block LaTeX math through MathJax.
- Mermaid diagrams from fenced `mermaid` code blocks.
- Emoji shortcodes and Unicode emoji.
- Links, images, references, keyboard tags, subscript, superscript, and allowed inline HTML.

Rendered HTML is sanitized before display.

---

## Use Formatting Tools

Use the editor toolbar or editor context menu to insert and transform Markdown.

Available formatting workflows include:

- Undo, redo, and clear Markdown formatting.
- Bold, italic, strikethrough, blockquote, inline code, and fenced code.
- Title case, uppercase, and lowercase transforms.
- Headings `H1` through `H6`.
- Bulleted lists, numbered lists, task lists, and horizontal rules.
- Links, references, images, URLs, and tables.
- GitHub-style alerts.
- Symbols, HTML entities, and emoji shortcode insertion.
- Find and replace.

Autocomplete can suggest Markdown links, wiki links, headings, tags, and frontmatter tags when folder or document context is available.

---

## Work With Tabs

MD-Editor supports multi-document sessions.

You can:

- Create new Markdown tabs.
- Open files, GitHub imports, generated documents, and graph documents as tabs.
- Switch between Markdown tabs and graph tabs.
- Rename, duplicate, close, and reset tabs.
- Close all tabs or reset the workspace.
- Restore tab state and editor content from local storage after reloading.

Unsaved tabs are marked so you can see which documents still need attention.

---

## Open Files

You can open local documents in several ways:

- Use the file picker.
- Drag and drop supported files into the app.
- Select a file from an opened folder workspace.
- Reopen a recent file.
- Open a file passed to the desktop app by the operating system.

Supported text files open as editor tabs. Saved graph files open as graph tabs.

Common supported Markdown extensions include `.md` and `.markdown`. Graph document files include `.mdviewer-graph.json`, `.mdgraph.json`, and compatible graph JSON files.

---

## Open Folder Workspaces

Open a folder when you want MD-Editor to understand a group of files together.

Folder workspaces let you:

- Browse files in a resizable folder tree.
- Expand and collapse folders.
- Auto-select the current file in the tree.
- Filter files and folders by text.
- Sort by file name, modified time, or created time.
- Show or hide unsupported file types.
- Create files and folders where the platform supports writing.
- Rename or delete files and folders where the platform supports writing.
- Open, reveal, copy, share, export, tag, or graph files through context actions.
- Track file and folder counts in the status line.

Folder files also feed link autocomplete, tag management, Graph View, and code exploration workflows.

---

## Use Recent Items

The recent items menu keeps previously opened files and folders available.

You can:

- Reopen recent files.
- Reopen recent folders.
- Remove individual recent items.
- Limit how many recent files and folders are retained.
- Clear recent history from settings.

In browsers that support file system handles, MD-Editor can reuse granted file or folder access while permission remains available. In the desktop app, recent items can also use desktop profile data.

---

## Import From GitHub

Use GitHub import to pull public Markdown files into tabs.

1. Open the GitHub import action.
2. Paste a public GitHub repository, folder, or Markdown file URL.
3. Let MD-Editor discover Markdown files.
4. Select one, several, or all discovered files.
5. Import the selected files as tabs.

GitHub import uses public GitHub APIs and raw file URLs. Imported files become local editable tabs; they are not automatically committed or pushed back to GitHub.

---

## Use Tags

Tags help organize folder workspaces and graph views.

MD-Editor can:

- Read tags from YAML frontmatter.
- Read inline Markdown tags.
- Add or remove tags from files through folder and graph workflows.
- Search and manage known tags from the folder toolbar.
- Filter folder files and graph nodes by selected tags.
- Show or hide tag nodes in Graph View.

Tag changes that edit file content require a writable file/folder path or a platform save flow.

---

## Use Graph View

Graph View turns folder files, Markdown links, wiki links, tags, and generated dependency maps into an interactive relationship graph.

Use Graph View to:

- Build relationship maps from an opened folder.
- Explore links, tags, dependency maps, and generated code documentation.
- Search graph files by name or path.
- Select nodes and inspect connected relationships.
- Use hover behavior to focus incoming, outgoing, and tag-related links.
- Toggle arrows, orphan nodes, labels, tag nodes, and file extension display.
- Adjust node size, link thickness, text fade threshold, and layout forces.
- Zoom, pan, and drag nodes.
- Hide leaf points or individual points to reduce noise.
- Collapse nodes into clusters and expand clusters when needed.
- Open focused graph scopes, full local graphs, full networks, or expanded cluster graphs in new tabs.
- Preserve graph layout and configuration.

Graph View is useful for dependency visibility, code exploration, and preparing connected areas of a workspace for follow-up work or refactoring.

---

## Save Graph Documents And Archives

Graph views can become reusable documents.

You can:

- Save the current graph view.
- Export a folder graph as a portable graph archive.
- Include Markdown file contents in exported graph archives.
- Reopen saved graph documents as graph tabs.
- Detect when a saved graph is stale compared with the current folder.
- Review graph difference summaries.
- Update graph data when source files change.

Use lightweight saved graphs when you only need the layout and graph structure. Use graph archives when you want the graph to carry document contents with it.

---

## Use The Code To Markdown Converter

The code converter generates Markdown documentation from source-code folders.

Typical workflow:

1. Open the code converter.
2. Choose a source root folder.
3. Choose a destination Markdown root folder.
4. Select the documentation details you want included.
5. Run the converter.
6. Open the generated Markdown folder in MD-Editor.
7. Use Graph View to explore the generated dependency map.

The converter supports JavaScript, TypeScript, Python, Java, and C# source files.

Supported extensions include `.js`, `.jsx`, `.mjs`, `.cjs`, `.ts`, `.tsx`, `.py`, `.java`, and `.cs`.

In the desktop app, the converter dropdown also lists installed converter extensions from:

```text
<MD-Editor app folder>/extensions/code-converters/<converter-id>/converter.json
```

Extension manifests declare `supportedLanguages`, `command`, optional command-prefix `args`, and optional `supportedFlags`. MD-Editor always supplies `--root <source-folder>` and `--vault <destination-folder>` when it runs the selected converter.

The bundled Semantic Java Converter uses JavaParser Symbol Solver to create compiler-aware links between local Java source files.

---

## Export And Share

MD-Editor can export documents, rendered previews, graph views, and selected diagram content.

Available export/share workflows include:

- Export raw Markdown (`.md`).
- Export standalone HTML.
- Export PDF from the rendered preview.
- Save graph views.
- Export folders to graph archives.
- Copy rendered HTML to the clipboard.
- Copy Markdown to the clipboard where the action is available.
- Copy Mermaid diagrams or export them as SVG/PNG from Mermaid tools.
- Copy graph node paths, contents, frontmatter, tags, and connected graph data where graph context actions are available.
- Generate a compressed share URL for the current Markdown document.

Share URLs encode content in the URL hash and do not upload the document to a server. Very large documents can produce long URLs.

---

## Change View Modes And Layout

Use view controls to choose the workspace layout.

| Mode | Description |
|------|-------------|
| Editor | Full-width Markdown editor. |
| Split | Editor and preview side by side. |
| Preview | Full-width rendered preview. |

Additional layout controls include:

- Resizable editor and preview panes.
- Resizable sidebar.
- Resizable folder dropzone area.
- Synchronized editor/preview scrolling.
- Preview and graph zoom controls.
- Desktop and mobile menus that expose the same core actions.

---

## Search, Replace, And Navigate

MD-Editor includes navigation tools for documents, folders, tabs, and graphs.

You can:

- Find and replace text inside the editor.
- Filter the folder tree.
- Search graph nodes by file name or path.
- Navigate between many open tabs.
- Reveal folder files from graph context actions.
- Open related graph scopes from selected nodes.
- Follow Markdown links, wiki links, and heading anchors from the preview.

---

## Use Settings

Settings let you tune the workspace to your preferences.

You can adjust:

- Graph density thresholds and large-graph warnings.
- Auto-collapse behavior for graph clusters.
- Hover dimming and connected-line highlighting.
- Connected label visibility.
- File extension visibility in graph labels.
- Graph node color and find-highlight color.
- Recent file and folder limits.
- Menu tooltip delay.
- Which high-impact actions ask for confirmation.

Settings also include reset actions for cache, preferences, recent history, and all stored app state.

---

## Use The Desktop App

The desktop app uses the same editor, preview, graph, export, and converter workflows as the web app, plus Neutralino desktop integration.

Desktop-specific behavior includes:

- Native desktop window.
- Native file and folder dialogs.
- Desktop lifecycle and close handling.
- Startup file handoff from the operating system.
- Native filesystem paths where supported.
- Shared code converter workflows.

Unsaved-change checks run before destructive close or exit flows.

---

## Use MD-Editor On Small Screens

The interface adapts to smaller screens.

On mobile or narrow layouts:

- Use the mobile menu for file actions, view modes, settings, conversion, and graph actions.
- Switch between editor, split, and preview workflows depending on available space.
- Use tabs and folder navigation from the compact controls.

Large graph and folder workflows are easier on wider screens, but the same core actions remain available.

---

## Understand Local Data And Privacy

MD-Editor stores app data locally.

- Tab state, preferences, recent items, and graph state are stored in local browser or desktop storage.
- Browser file/folder handles may be stored in IndexedDB where supported.
- Desktop recent items and preferences can use local `.mdviewer` profile files.
- Share links encode Markdown content into the URL hash.
- GitHub import only accesses public GitHub content when you request an import.
- Rendered HTML is sanitized before display.
- The app does not require accounts, analytics, cookies, tracking scripts, or a document upload service.

Clear local app data from settings or from your browser/site storage controls.

---

## Keyboard Shortcuts

Common shortcuts include:

| Shortcut | Action |
|----------|--------|
| `Ctrl + S` / `Cmd + S` | Save the active document when possible. |
| `Tab` | Insert indentation inside the editor. |
| `Ctrl + Z` / `Cmd + Z` | Undo editor changes. |
| `Ctrl + Y` / `Cmd + Y` | Redo editor changes. |
| `Escape` | Close open menus, modals, or transient panels where supported. |

Some shortcuts depend on the current focus and active view.
