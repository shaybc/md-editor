**Gutter Plan**

The gutter should become compact, reach compact gutter while keeping all current features, but **line numbers and folding stay as their own columns**. The key change is reducing padding and merging only the marker-related lanes. Preserve all existing capabilities while changing only the presentation and interaction model, not removing bookmarks, breakpoints, folding, line numbers, or debug indicators.

1. Keep three logical gutter zones:
   - Compact marker column for breakpoints, bookmarks, execution markers, warnings, tasks.
   - Existing-width line number column.
   - Existing-width folding column.

2. Move the columns closer together:
   - Reduce left/right padding between marker, line number, folding, and editor text.
   - Remove the extra empty spacer column before the editor text.

3. Merge marker features into one marker lane:
   - Breakpoints, bookmarks, current execution line, diagnostics, and tasks share the same compact marker area.
   - Multiple markers on the same line are stacked/overlaid as small icons.

4. Preserve line numbers as a separate column:
   - Do not shrink or merge the line-number column into the marker column.
   - Keep number alignment stable.

5. Preserve folding as a separate column:
   - Do not merge folding into line numbers or markers.
   - Keep fold affordances in their own narrow column, just closer to the line numbers.

6. Improve gutter interactions:
   - Double-click marker/line-number area toggles a breakpoint.
   - Right-click anywhere in the gutter opens one unified gutter context menu.

7. Add Eclipse-style gutter context menu actions:
   - Toggle breakpoint.
   - Edit breakpoint properties.
   - Conditional breakpoint.
   - Hit count breakpoint.
   - Logpoint/tracepoint.
   - Enable/disable/remove breakpoint.
   - Add/remove bookmark.
   - Fold/collapse/expand/collapse all/expand all.
   - Go to marker/source action when relevant.

8. Add multi-marker hover:
   - Hovering a line with multiple markers shows a compact tooltip listing all markers on that line.

9. Preserve current capabilities:
   - No loss of breakpoints, bookmarks, folding, line numbers, debug execution markers, or context-menu actions.
   - This is a layout and interaction refinement, not a feature removal.

**Expected files to change:**
- [codemirror-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-editor.js)
- [codemirror-bundle-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-bundle-source.js)
- [codemirror.bundle.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/vendor/codemirror.bundle.js)
- [context-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/context-menu.js)
- [java-debug-editor-actions.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/debug/java-debug-editor-actions.js)
- [java-debug-breakpoint-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/debug/java-debug-breakpoint-store.js)
- [styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [java-debugger-ui.spec.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/e2e/java-debugger-ui.spec.js)