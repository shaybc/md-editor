# `web-app/script.js` Function Reference

This page documents the named functions that currently remain in `web-app/script.js`.

`script.js` used to be the main monolithic implementation file. Most runtime logic has since moved into modules under `web-app/js/`. The current `script.js` is primarily a composition layer: it gathers DOM references, wires modules together, owns a few UI dialogs, and keeps some app-level bridge logic close to startup state.

This reference intentionally covers only functions still declared in `web-app/script.js`. Module functions implemented in `web-app/js/` are documented by their module pages and source files, not here.

---

## Table of Contents

- [Current Role](#current-role)
- [Current Function Summary](#current-function-summary)
- [Function List](#function-list)
- [Moved Out Of script.js](#moved-out-of-scriptjs)

---

## Current Role

Current `script.js` responsibilities:

- Register and connect modular services from `web-app/js/`.
- Manage editor toolbar dialogs that have not yet been moved into modules.
- Bridge settings-screen values to persisted global state.
- Own the code-to-Markdown converter dialog and Neutralino command launch.
- Provide folder tree glue for browser and Neutralino folder reads.
- Coordinate sidebar visibility and dropzone layout.
- Expose a few compatibility wrappers used by existing modules.

---

## Current Function Summary

| Area | Current functions |
|------|------------------:|
| Editor toolbar dialogs and helpers | 56 |
| Folder tree pane and unsupported-file toggle | 3 |
| Settings preference getters and tooltips | 15 |
| Markdown render compatibility wrapper | 1 |
| Graph preference defaults | 2 |
| Help, welcome, about, and app exit | 6 |
| Settings dialog actions | 8 |
| Code converter dialog | 9 |
| Folder loading, sorting, deletion cleanup | 24 |
| Neutralino folder loading | 2 |
| Sidebar/dropzone layout | 9 |
| **Total** | **135** |

---

## Function List

### Editor Toolbar Dialogs And Helpers

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 526 | `runNativeEditorHistoryCommand(command)` | Runs native undo/redo commands for editor toolbar history actions. |
| 534 | `undoEditorToolbarAction()` | Handles toolbar undo. |
| 538 | `redoEditorToolbarAction()` | Handles toolbar redo. |
| 542 | `stripMarkdownFormatting(text)` | Removes common Markdown formatting from selected text. |
| 566 | `openEditorClearMarkdownModal()` | Opens the clear-formatting dialog. |
| 580 | `closeEditorClearMarkdownModal()` | Closes the clear-formatting dialog. |
| 585 | `applyEditorClearMarkdownModal()` | Applies clear-formatting to the current selection. |
| 594 | `getEditorFindQuery()` | Reads the current find query. |
| 597 | `collectEditorFindMatches(query)` | Finds all editor matches for a query. |
| 608 | `updateEditorFindReplaceStatus()` | Updates find/replace match status text. |
| 620 | `selectEditorFindMatch(index)` | Selects and scrolls to a find match. |
| 634 | `refreshEditorFindMatches(options = {})` | Recomputes find matches and updates selection. |
| 654 | `openEditorFindReplaceModal()` | Opens find/replace. |
| 666 | `closeEditorFindReplaceModal()` | Closes find/replace. |
| 671 | `goToNextEditorFindMatch()` | Moves to the next match. |
| 675 | `goToPreviousEditorFindMatch()` | Moves to the previous match. |
| 679 | `replaceCurrentEditorFindMatch()` | Replaces the selected match. |
| 694 | `replaceAllEditorFindMatches()` | Replaces all matches. |
| 712 | `getSelectedEditorText()` | Returns current editor selection text. |
| 717 | `openEditorLinkModal()` | Opens the link insertion dialog. |
| 731 | `closeEditorLinkModal()` | Closes the link dialog. |
| 736 | `applyEditorLinkModal()` | Inserts or wraps a Markdown link. |
| 750 | `normalizeReferenceNumber(value)` | Normalizes reference-link numbers. |
| 755 | `getEditorReferenceDefinition(referenceNumber, url, title)` | Builds a Markdown reference definition. |
| 760 | `openEditorReferenceModal()` | Opens the reference-link dialog. |
| 775 | `closeEditorReferenceModal()` | Closes the reference-link dialog. |
| 780 | `applyEditorReferenceModal()` | Inserts a reference link and definition. |
| 805 | `getEditorImageSourceMode()` | Reads image source mode, file or URL. |
| 809 | `setEditorImageSourceMode(mode)` | Switches image source mode. |
| 815 | `updateEditorImageSourceFields()` | Shows the relevant image input fields. |
| 820 | `escapeMarkdownImageAltText(value)` | Escapes image alt text. |
| 823 | `escapeMarkdownImageTitle(value)` | Escapes image title text. |
| 826 | `getMarkdownImageText(target, altText)` | Builds Markdown image syntax. |
| 832 | `getRelativeImagePathForEditor(imagePath)` | Makes selected image paths relative where possible. |
| 844 | `openEditorImageModal()` | Opens the image insertion dialog. |
| 860 | `closeEditorImageModal()` | Closes the image dialog. |
| 865 | `browseEditorImageFile()` | Uses Neutralino file browsing for image selection when available. |
| 881 | `applyEditorImageModal()` | Inserts Markdown image syntax. |
| 896 | `setEditorAlertType(alertType)` | Chooses the active GitHub alert type. |
| 904 | `getMarkdownAlertBody(alertType, selectedText)` | Builds alert body content. |
| 913 | `getMarkdownAlertText(alertType, selectedText)` | Builds full Markdown alert text. |
| 916 | `openEditorAlertModal()` | Opens the alert insertion dialog. |
| 929 | `closeEditorAlertModal()` | Closes the alert dialog. |
| 934 | `applyEditorAlertModal()` | Inserts the selected alert block. |
| 943 | `getFilteredEditorSymbols()` | Filters symbols and HTML entities. |
| 950 | `setEditorSelectedSymbol(entity)` | Stores the selected symbol/entity. |
| 959 | `renderEditorSymbolList()` | Renders the symbol picker list. |
| 1006 | `openEditorSymbolModal()` | Opens the symbol picker. |
| 1020 | `closeEditorSymbolModal()` | Closes the symbol picker. |
| 1025 | `applyEditorSymbolModal()` | Inserts the selected symbol/entity. |
| 1033 | `getFilteredEditorEmojis()` | Filters emoji shortcode choices. |
| 1040 | `setEditorSelectedEmoji(shortcode)` | Stores the selected emoji shortcode. |
| 1049 | `renderEditorEmojiList()` | Renders the emoji picker list. |
| 1078 | `openEditorEmojiModal()` | Opens the emoji picker. |
| 1092 | `closeEditorEmojiModal()` | Closes the emoji picker. |
| 1097 | `applyEditorEmojiModal()` | Inserts the selected emoji shortcode. |

### Folder Pane And Unsupported File Toggle

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 1529 | `ensureFolderTreePane()` | Ensures the folder tree pane exists and creates it if needed. |
| 1750 | `getClosestUnsupportedFileToggleButton(target)` | Finds the nearest unsupported-file toggle button. |
| 1755 | `handleUnsupportedFileToggleClick(event)` | Toggles unsupported files in the folder tree. |

### Settings Preference Getters And Tooltips

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 2035 | `getGraphAutoClusterThreshold()` | Reads the graph auto-clustering threshold from global state. |
| 2041 | `isGraphAutoClusterLargeMapsEnabled()` | Reads whether large graph auto-clustering is enabled. |
| 2045 | `getGraphRenderWarningThreshold()` | Reads the large graph render warning threshold. |
| 2051 | `getGraphMostReferencedPercent()` | Reads the most-referenced group percentage. |
| 2057 | `getGraphShowFileExtensions()` | Reads graph label extension preference. |
| 2061 | `getGraphFindHighlightColor()` | Reads graph find highlight color. |
| 2069 | `getGraphNodeDefaultColor()` | Reads default graph node color. |
| 2077 | `getLargeMapHoverPreferences()` | Reads large-map hover dimming, label, and line preferences. |
| 2086 | `getContextMenuTooltipDelayMs()` | Reads menu tooltip delay. |
| 2092 | `shouldConfirmOpenManyGraphNodes()` | Reads confirmation preference for many graph nodes. |
| 2096 | `shouldConfirmDeleteFiles()` | Reads delete confirmation preference. |
| 2100 | `shouldConfirmResetState()` | Reads reset confirmation preference. |
| 2104 | `getMaxRecentFiles()` | Reads max recent file count. |
| 2110 | `getMaxRecentFolders()` | Reads max recent folder count. |
| 2116 | `initializeContextMenuTooltips()` | Attaches delayed tooltip behavior to context-menu items. |

### Markdown Render Compatibility Wrapper

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 2341 | `renderMarkdown(markdown)` | Delegates rendering to the registered Markdown render module while preserving the legacy function name used by other app code. |

### Graph Preference Defaults

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 2490 | `getGraphViewPreferenceDefaults()` | Builds the default graph view preference object. |
| 2501 | `saveGraphViewPreferenceDefaults(patch)` | Persists graph view preference defaults. |

### Help, Welcome, About, And Exit

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 2999 | `fetchHelpHomeMarkdown()` | Loads the wiki home Markdown for in-app help. |
| 3016 | `openHelpHome()` | Opens wiki help content in a tab. |
| 3026 | `openWelcomePage()` | Opens the welcome document. |
| 3030 | `showAboutDialog()` | Shows the About dialog. |
| 3035 | `hideAboutDialog()` | Hides the About dialog. |
| 3040 | `exitApplication()` | Exits through Neutralino when available, otherwise closes the window. |

### Settings Dialog Actions

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 3059 | `showSettingsDialog()` | Opens Settings and populates controls from global state. |
| 3115 | `hideSettingsDialog()` | Closes Settings when not saving. |
| 3121 | `setSettingsDialogSaving(isSaving)` | Toggles Settings busy/disabled state. |
| 3136 | `saveSettingsDialog()` | Validates and persists Settings values. |
| 3202 | `clearAppCacheFromSettings(options = {})` | Clears graph render cache and browser Cache Storage. |
| 3232 | `clearPreferencesFromSettings(options = {})` | Restores default preferences. |
| 3244 | `clearRecentHistoryFromSettings(options = {})` | Clears recent files/folders. |
| 3252 | `resetAllFromSettings()` | Clears cache, recent history, and preferences. |

### Code Converter Dialog

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 3261 | `setCodeConverterStatus(message)` | Updates converter status text. |
| 3265 | `setCodeConverterCompleteState(isComplete)` | Marks converter completion state. |
| 3271 | `showCodeConverterDialog()` | Opens the code-to-Markdown converter dialog. |
| 3279 | `hideCodeConverterDialog()` | Closes the converter dialog. |
| 3284 | `browseCodeConverterFolder(input, title)` | Opens a Neutralino folder picker for converter paths. |
| 3299 | `getCodeConverterScriptPath()` | Resolves the converter script path for browser/desktop runtime. |
| 3305 | `quoteCommandArg(value)` | Quotes command-line arguments for converter execution. |
| 3309 | `getCodeConverterSwitches()` | Builds converter CLI switches from dialog checkboxes. |
| 3322 | `runCodeConverter()` | Runs the converter through Neutralino `os.execCommand`. |

### Folder Loading, Sorting, And Delete Cleanup

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 3372 | `listMarkdownTree(dirHandle, parentPath = "")` | Reads a browser folder handle into folder-tree nodes. |
| 3398 | `collectMarkdownFilesFromTree(nodes, parentPath = "")` | Flattens folder-tree nodes into Markdown file entries. |
| 3433 | `getClosedFolderPlaceholder()` | Creates the closed-folder sidebar placeholder. |
| 3443 | `updateCloseFolderButtons()` | Syncs close-folder button enabled state. |
| 3451 | `closeFolderTree()` | Closes the current folder tree and clears folder state. |
| 3477 | `getFolderTreeStats(nodes)` | Counts files and folders in the tree. |
| 3492 | `updateFolderStatusLine()` | Updates folder file/folder counts in the status line. |
| 3498 | `renderFolderLoadingState(message = "Loading folder...")` | Renders folder loading UI. |
| 3515 | `renderFolderLoadingError(message = "Unable to load this folder.")` | Renders folder loading error UI. |
| 3525 | `renderFolderTree(nodes, options = {})` | Renders folder-tree nodes through the sidebar module. |
| 3567 | `reloadOpenFolderTree()` | Reloads the currently open folder. |
| 3590 | `refreshFolderFilesForGraphComparison()` | Refreshes folder files before graph stale comparison. |
| 3642 | `refreshOpenFolderTreeAfterFileDelete(filePath)` | Refreshes folder state after deleting a file. |
| 3657 | `isPathInsideFolder(filePath, folderPath)` | Checks whether a path is inside a folder path. |
| 3665 | `normalizeDeletedPathComparison(path)` | Normalizes paths for delete comparisons. |
| 3669 | `getDeletedPathCandidates(path)` | Builds candidate paths for deleted file/folder matching. |
| 3690 | `tabMatchesDeletedPath(tab, deletedPath, options = {})` | Checks whether a tab points to deleted content. |
| 3713 | `closeTabsForDeletedPath(deletedPath, options = {})` | Closes tabs affected by deleted content. |
| 3723 | `getValidFolderSortMode(mode)` | Normalizes folder sort mode. |
| 3729 | `getNodeTimestamp(node, field)` | Reads sortable timestamps from folder nodes. |
| 3735 | `compareFolderTreeNodes(a, b)` | Sort comparator for folder tree nodes. |
| 3752 | `sortFolderTreeNodes(nodes)` | Sorts folders and files recursively. |
| 3760 | `updateFolderMarkdownFileOrderFromTree()` | Updates Markdown file order from current tree order. |
| 3768 | `applyFolderSortMode(mode)` | Persists and applies a folder sort mode. |

### Neutralino Folder Loading

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 3777 | `listMarkdownTreeNeutralino(dirPath)` | Reads a folder through Neutralino filesystem APIs. |
| 3799 | `collectMarkdownFilesFromTreeNeutralino(nodes, parentPath = "")` | Flattens Neutralino folder nodes into Markdown file entries. |

### Sidebar And Dropzone Layout

| Line | Function | Current purpose |
|-----:|----------|-----------------|
| 4109 | `isSidebarDropzoneVisible()` | Returns current dropzone visibility. |
| 4113 | `updateDropzoneToggleButtons()` | Syncs dropzone toggle buttons. |
| 4131 | `hideSidebarDropzone(shouldPersist = true)` | Hides and optionally persists dropzone state. |
| 4154 | `showSidebarDropzone(shouldPersist = true)` | Shows and optionally persists dropzone state. |
| 4175 | `toggleSidebarDropzone()` | Toggles the sidebar dropzone. |
| 4183 | `isSidebarVisible()` | Returns current sidebar visibility. |
| 4187 | `updateSidebarToggleButtons()` | Syncs sidebar toggle buttons. |
| 4204 | `setSidebarVisible(isVisible, shouldPersist = true, shouldAnimate = shouldPersist)` | Applies sidebar visibility and layout state. |
| 4256 | `toggleSidebar()` | Toggles the sidebar. |

---

## Moved Out Of script.js

Large parts of the old `script.js` reference are no longer current because their implementation moved into modules. The main module directories are:

| Directory | Current responsibility |
|-----------|------------------------|
| `web-app/js/editor/` | Editor context menu, line/status UI, syntax highlight, autocomplete. |
| `web-app/js/markdown/` | Frontmatter, links, Mermaid tools, renderer config, render pipeline. |
| `web-app/js/graph/` | Graph extraction, persistence, documents, toolbar, renderer. |
| `web-app/js/sidebar/` | Folder toolbar and sidebar context tree. |
| `web-app/js/tabs/` | Tab creation, persistence, switching, reset, rename, close. |
| `web-app/js/files/` | File open/save helpers and file type detection. |
| `web-app/js/import/` | Drag/drop, dropped items, and GitHub import flows. |
| `web-app/js/export/` | Export page break helpers. |
| `web-app/js/recent/` | Recent files/folders, profile sync, handle cache, recent actions. |
| `web-app/js/ui/` | Theme, layout, view mode, mobile menu, and layout preferences. |
| `web-app/js/tags/` | Tag parsing, state, management, and graph/folder tag sync. |

When a function is not listed above, look for it in the corresponding `web-app/js/` module rather than in `web-app/script.js`.
