---
tags: []
---
# Folder Toolbar And Context Menus

This page expands the folder tree controls and right-click menus used while a folder is open.

## Folder Toolbar

The folder toolbar sits above the lazy-loaded tree and changes the visible workspace without changing files on disk.

| Control | What It Does |
| --- | --- |
| Expand/collapse all | Opens or closes currently loaded tree folders. Lazy folders load children when expanded. |
| Auto-select file | Keeps the tree selection aligned with the active source-backed tab. |
| Sort | Orders the tree by name, modified time, or created time when metadata exists. |
| Filter | Narrows visible tree rows by file or folder name. |
| Tags | Filters Markdown files by known tags and opens tag management actions. |
| Unsupported files | Shows text-like files that are normally hidden from the documentation-focused tree. |

Auto-select is useful when you move through tabs and want the sidebar to follow. Turn it off when you are browsing one part of a large folder while editing another.

Unsupported files stay hidden by default so generated, binary, dependency, and cache files do not crowd the tree. Enable them only when you need to open a non-Markdown text file from the folder.

## File Context Menu

Right-click a file in the tree to work with that file directly.

Common actions include:

- Open the file in a tab.
- Open the file in the default system app.
- Reveal the file in Explorer.
- Open or reveal the original source file for generated Markdown when source-root metadata exists.
- Show local, full-local, or network graph views.
- Rename, delete, copy path/name/content/frontmatter/tags, or export the file.
- Add, remove, create, or delete tags.

Original source actions depend on `source_file` frontmatter and the opened folder's `.md-editor/_md_editor_project.json` metadata. If the source root is missing, set it from the folder/header source-root action.

## Folder Context Menu

Right-click a folder in the tree to work with a subtree.

Common actions include:

- Reveal the folder in Explorer.
- Reveal the original source folder when generated-doc metadata exists.
- Set original source root.
- Rename or delete the folder.
- Copy the folder path.
- Convert Code to MD from that folder.
- Create a new file or folder.
- Show Graph View for that folder.
- Export folder content to a graph document.
- Export original source nodes when source-root metadata exists.
- Update Project for generated Maven recovery workflows.
- Refresh the folder tree.
- Add or remove tags for Markdown files under the folder.

## Practical Tips

Use folder filtering before bulk expand/collapse in very large projects. Use tags as temporary review lanes such as `todo`, `api`, `review`, or `generated`. Keep destructive confirmation prompts enabled for delete, reset, and large graph actions.

Related pages:

- [Files, Folders, And Tabs](02-files-folders-tabs.md)
- [Detailed Graph View Controls](graph-view-controls.md)
- [Maven Dependency Recovery And Update Project](maven-dependency-recovery.md)

Previous: [2. Files, Folders, And Tabs](02-files-folders-tabs.md)
Next: [3. Editing And Preview](03-editing-and-preview.md)
