---
tags: []
---
# Search Workflow Details

MD-Editor has several search tools because each solves a different navigation problem.

## Search Tools At A Glance

| Tool | Shortcut | Scope | Best Use |
| --- | --- | --- | --- |
| Find | <kbd>Ctrl</kbd>+<kbd>F</kbd> | Active document | Jump between matches in the current tab. |
| Find / Replace | <kbd>Ctrl</kbd>+<kbd>H</kbd> | Active document | Replace repeated text in the current tab. |
| Find in Workspace | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd> | Opened folder | Search file content and metadata with include/exclude paths. |
| Open File by Name | <kbd>Ctrl</kbd>+<kbd>Shift</kbd>+<kbd>N</kbd> | Opened folder | Jump to a file without expanding the tree. |
| Find in Files | <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>F</kbd> | Opened folder | Search or replace across selected file masks. |
| Show / Hide Results | <kbd>F7</kbd> | Results panel | Keep Find in Files results available while editing. |

## Find And Replace

Find and Find / Replace search only the active document. Matching is plain text. Match case and preserve-case replacement options are available from the find bar.

Use document find when the question is local: a heading, function name, setting key, or repeated phrase in the file you are editing.

## Find In Workspace

Find in Workspace searches the opened folder and displays results in the sidebar panel. It supports:

- Content search.
- Include path patterns.
- Exclude path patterns.
- Case-sensitive matching.
- Replacement preview and apply flow.
- Metadata fallback for frontmatter and tags.

Use it when you want an answer such as "where does this concept appear in this workspace?"

## Open File By Name

Open File by Name builds a quick-open index from the opened folder and fuzzy-matches your query against file names and relative paths.

Use it for large projects where expanding folders manually would be slower than typing part of the file name.

## Find In Files

Find in Files searches matching file types and shows results in the bottom panel.

Useful options include:

- File masks such as `*.md;*.js;*.json`.
- Regular expression mode.
- Match case.
- Whole word.
- Include subfolders.
- Batch replacement with confirmation.

Use it for audits: old package names, deprecated API names, TODO markers, broken paths, repeated headings, or generated documentation cleanup.

## Results Panel

The Find in Files results panel can remain open while you edit. Use <kbd>F7</kbd> to show or hide it. Result rows open the matching file and position the editor near the match.

## Implementation Notes

Current desktop modules:

| Area | File |
| --- | --- |
| Workspace search | `desktop-app/resources/js/search/workspace-search.js` |
| Open file by name | `desktop-app/resources/js/search/open-file-by-name.js` |
| Find in files | `desktop-app/resources/js/search/find-in-files.js` |
| Keyboard shortcuts | `desktop-app/resources/js/keyboard-shortcuts.js` |

Previous: [Markdown Reference](markdown-reference.md)  
Next: [4. Graph View](04-graph-view.md)
