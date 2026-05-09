# `web-app/script.js` Classic Script Migration

This app is being migrated from one large classic script into smaller classic
scripts. Keep `script.js` behavior-compatible while moving one feature area at
a time into `web-app/js/`.

## Current Boot Shape

- `js/core/context.js` creates `window.createMarkdownViewerApp()`.
- `js/app.js` creates `window.markdownViewerApp`.
- `script.js` still owns the main `DOMContentLoaded` flow and bridges its local
  DOM references, constants, and selected state into `window.markdownViewerApp`.
- New classic scripts expose one `window.registerMarkdownViewer...` function.
  `script.js` calls that function with the specific dependencies the module
  needs.
- Shared services live under `window.markdownViewerApp.services`, for example
  `app.services.preferences`.

## Migration Order

| Area | Target | Status |
|------|--------|--------|
| Share URL logic | `js/share-url.js` | Moved |
| Theme and global preferences | `js/ui/theme-preferences.js` | Partial: preference storage and theme toggle moved |
| Folder picker platform helpers | `js/platform/folder-picker.js` | Moved |
| Clipboard copy helpers | `js/clipboard.js` | Moved |
| Scroll synchronization | `js/scroll-sync.js` | Moved |
| Unsaved-change tracking | `js/unsaved-changes.js` | Moved |
| Recent files and folders | `js/recent/index.js` | Partial: storage, profile sync, handle cache, and menu rendering moved |
| Keyboard shortcuts | `js/keyboard-shortcuts.js` | Moved |
| Editor context menu | `js/editor/context-menu.js` | Moved |
| Editor line/status UI | `js/editor/line-status.js`, `js/editor/status-line.js` | Moved |
| Autocomplete | `js/editor/autocomplete.js` | Moved |
| Editor syntax highlighting | `js/editor/syntax-highlight.js` | Moved |
| Markdown renderer configuration | `js/markdown/renderer-config.js` | Moved |
| Markdown link helpers | `js/markdown/links.js` | Moved |
| Markdown rendering | `js/markdown/rendering.js` | Pending |
| Mermaid tools | `js/markdown/mermaid-tools.js` | Moved |
| Tabs | `js/tabs/index.js` | Pending |
| Folder tree | `js/sidebar/folder-tree.js` | Pending |
| Sidebar file/folder operations | `js/sidebar/file-folder-operations.js` | Pending |
| Graph extraction | `js/graph/extraction.js` | Moved |
| Graph persistence and comparison | `js/graph/persistence.js` | Pending |
| Graph rendering and interaction | `js/graph/renderer.js` | Moved |
| Import: drag and drop | `js/import/drag-drop.js` | Partial: dropzone event wiring and active drag state moved |
| Import: GitHub | `js/import/github.js` | Moved |
| Export page-break helpers | `js/export/page-breaks.js` | Moved |
| Export logic | `js/export/index.js` | Pending |
| Save logic | `js/save/index.js` | Pending |
| View mode and layout controls | `js/ui/view-layout.js` | Moved |
| Mobile menu controls | `js/ui/mobile-menu.js` | Moved |
| Modal and menu lifecycle | `js/ui/modal-menu.js` | Pending |
| Tags | `js/tags/index.js` | Pending |
| Rename and link maintenance | `js/rename-link-maintenance.js` | Pending |
