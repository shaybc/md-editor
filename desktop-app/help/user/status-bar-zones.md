---
tags: []
---
# Status Bar Zones

The status bar is the thin strip at the bottom of the app window. It can be shown or hidden from Interface settings or the status bar toggle.

![Status bar indicators](../img/status-bar-zoomed.png)

## Left Zone

The left zone shows opened-folder counts:

- Total files.
- Total folders.

For large desktop folders, MD-Editor can use precomputed lazy scan counts instead of walking the entire folder tree just to update the status bar.

## Center Zone

The center zone changes with the active tab and focus state.

It can show:

- Reading time.
- Word count.
- Character count.
- Editor engine indicator such as `CM`, `Text`, `Graph`, `Health`, `Viewer`, or `None`.
- Cursor line, cursor column, position, and selection size while the editor is focused.
- Link target previews while hovering links in preview.
- Context tips when no more specific status is active.

## Right Zone

The right zone is graph-focused and appears when a graph tab is active.

It can show:

- Graph zoom percentage.
- Selected node count.
- Visible node count.
- Visible edge count.
- Cluster count.
- Collapsed node count.
- App zoom when the app is not at 100%.

## Implementation Notes

Current desktop modules:

| Area | File |
| --- | --- |
| Status-line logic | `desktop-app/resources/js/editor/status-line.js` |
| Footer markup and element ids | `desktop-app/resources/index.html` |
| Folder count updates | `desktop-app/resources/js/script.js` |
| Graph render status inputs | `desktop-app/resources/js/graph/renderer.js` |

Previous: [1. Essentials](01-essentials.md)  
Next: [3. Editing And Preview](03-editing-and-preview.md)
