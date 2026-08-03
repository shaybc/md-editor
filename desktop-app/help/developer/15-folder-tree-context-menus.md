---
tags: []
---
# 15. Folder Tree And Context Menus

The folder tree combines loaded filesystem entries, lazy children, toolbar state, tag metadata, and context-menu actions.

## Main Files

| File | Responsibility |
| --- | --- |
| `resources/js/sidebar/folder-toolbar.js` | Filtering, sorting, expand/collapse, auto-select, unsupported-file visibility, and toolbar state. |
| `resources/js/sidebar/context-tree.js` | Tree row rendering, file/folder context menus, tag actions, graph actions, original-source actions, and tree reconciliation. |
| `resources/js/platform/folder-watcher.js` | Desktop filesystem watcher events and open-tab reload prompts. |
| `resources/js/tags/index.js` | Known tag collection, file/folder tag updates, and graph snapshot tag synchronization. |

## Toolbar State

Folder toolbar controls should flow through folder-toolbar helpers rather than direct DOM changes. The important persisted preferences are:

| Preference | Meaning |
| --- | --- |
| `autoSelectFileEnabled` | Whether the tree follows the active tab. |
| `showUnsupportedFolderFiles` | Whether unsupported file types appear in the tree. |
| Folder sort settings | Active sort mode for the tree. |
| Folder filter text | Current text filter for visible tree rows. |

`renderFilteredFolderTree()` is the main render refresh after filter, sort, tag, and unsupported-file changes.

## File Context Menu

File context menu actions operate on one tree node. They include open, default-app open, reveal, original-source open/reveal, graph focus, rename, tag management, copy actions, export, and delete.

Original-source actions require source-root metadata and a `source_file` frontmatter value. Generated-doc flows should use existing source-root helpers instead of resolving paths ad hoc.

## Folder Context Menu

Folder context menu actions operate on a subtree. They include reveal, original-folder reveal, set original source root, rename, copy path, Convert Code to MD, create file/folder, graph view, graph export, original-source export, Update Project, refresh, tag management, and delete.

Update Project is tied to generated project metadata and Maven recovery context. It should remain unavailable or no-op when the current folder is not a generated project with recovery data.

## Watcher Interaction

The folder watcher updates tree state after filesystem changes and can prompt to reload open tabs. Git and bulk operations may suppress watcher work briefly so the tree does not fight in-progress changes.

Previous: [14. Markdown Preview And HTML Internals](14-markdown-preview-and-html.md)  
Next: [16. Graph Controls Internals](16-graph-controls-internals.md)
