# `web-app/script.js` Migration Checklist

This internal refactor note tracks the planned migration from the monolithic
`web-app/script.js` file into smaller JavaScript modules under `web-app/js/`.

The table is seeded from `wiki/Script-Functions.md`, which documents named
functions in source order and groups them by logical module. Source locations
below are the line clusters reported by that wiki reference for each logical
module. Update this checklist after every migration task so that `Moved?`,
`Verified?`, and `Removed from old script?` reflect the current state of the
codebase.

| Wiki logical module | Source location in `web-app/script.js` | Target file | Moved? | Verified? | Removed from old script? |
|---------------------|----------------------------------------|-------------|--------|-----------|--------------------------|
| Autocomplete | Lines 78-563, 841 | `web-app/js/autocomplete.js` | No | Not yet | No |
| Boot and DOM references | Lines 619, 882-947 | `web-app/js/boot/dom-references.js` | No | Not yet | No |
| Desktop compatibility bridges | Lines 1089-1243, 3322, 12771-12782 | `web-app/js/platform/desktop-bridges.js` | No | Not yet | No |
| Drag and drop import | Lines 7055-7198, 9399, 14739-14787 | `web-app/js/import/drag-drop.js` | No | Not yet | No |
| Editor context menu | Lines 577-826 | `web-app/js/editor/context-menu.js` | No | Not yet | No |
| Editor line/status UI | Lines 890-1040, 5734-5777 | `web-app/js/editor/line-status.js` | No | Not yet | No |
| Export logic | Lines 7539-7548, 12766-12866, 14014-14957 | `web-app/js/export.js` | No | Not yet | No |
| Folder tree | Lines 870-1059, 1623-1769, 2036-2067, 2498-2857, 6584-6915, 9032-9340 | `web-app/js/folder-tree.js` | No | Not yet | No |
| GitHub import | Lines 9710-9981 | `web-app/js/import/github.js` | No | Not yet | No |
| Graph extraction | Lines 347, 2114-2387, 3919-4201, 4645-4940, 6038-6121, 10926-10948, 11453-11506, 12179-12185, 12514, 12796-12941 | `web-app/js/graph/extraction.js` | No | Not yet | No |
| Graph persistence and comparison | Lines 4067-4991, 6000-6077, 6922-6940, 11351-11502 | `web-app/js/graph/persistence.js` | No | Not yet | No |
| Graph rendering and interaction | Lines 2136-2141, 3803-4478, 4809-5225, 5977, 6856-6864, 10941-12398, 12742-13054, 13400-13731, 13982-14369 | `web-app/js/graph/rendering.js` | No | Not yet | No |
| Keyboard shortcuts | Lines 6282, 7695-7809 | `web-app/js/keyboard-shortcuts.js` | No | Not yet | No |
| Markdown renderer configuration | Lines 2896-3358 | `web-app/js/markdown/renderer-config.js` | No | Not yet | No |
| Markdown rendering | Lines 99-342, 2040-2288, 2976-3670, 5590, 6464-6817, 7113-7470, 7842-7968, 8650, 9546-9810, 10100, 10976-11156, 12184, 12744-12910, 14645-14655 | `web-app/js/markdown/rendering.js` | No | Not yet | No |
| Mermaid tools | Line 15137 | `web-app/js/markdown/mermaid.js` | No | Not yet | No |
| Modal and menu lifecycle | Lines 1764, 6566-6576, 6953-6993, 7322, 7614-7789, 8614-8618, 11726, 12537-12553, 13058-13064, 13772-13799, 14630, 14984-15003 | `web-app/js/ui/modal-menu.js` | No | Not yet | No |
| Recent files and folders | Lines 1093-1568 | `web-app/js/recent-files-folders.js` | No | Not yet | No |
| Rename and link maintenance | Lines 3192-3582, 3955-4149, 4471, 6260, 7636-8142, 10994, 12180-12520, 12861, 13436-13504 | `web-app/js/rename-link-maintenance.js` | No | Not yet | No |
| Save logic | Lines 5115, 5712, 7419, 11207-11347, 12811 | `web-app/js/save.js` | No | Not yet | No |
| Scroll synchronization | Lines 3183, 10242, 11759 | `web-app/js/scroll-sync.js` | No | Not yet | No |
| Share URL logic | Lines 14678-14712 | `web-app/js/share-url.js` | No | Not yet | No |
| Sidebar file/folder operations | Lines 1920, 5858, 6682-7107, 7391-8313, 8629-9538, 10365-10492 | `web-app/js/sidebar/file-folder-operations.js` | No | Not yet | No |
| Tab management | Lines 2248, 2527, 5078-6411, 6715-6738, 7820, 8174, 9290, 9568-9692 | `web-app/js/tabs.js` | No | Not yet | No |
| Tag management | Lines 158, 2005-2798, 7338-7498, 8941, 11009-11135, 12182-12183 | `web-app/js/tags.js` | No | Not yet | No |
| Theme and global preferences | Lines 1893-1994, 2887 | `web-app/js/theme-preferences.js` | No | Not yet | No |
| Unsaved-change tracking | Lines 4842, 5610 | `web-app/js/unsaved-changes.js` | No | Not yet | No |
| View mode and layout controls | Lines 4207-4256, 4963-5095, 5808-5890, 9542-9794, 10158-10603, 11410-11418 | `web-app/js/view-layout.js` | No | Not yet | No |
