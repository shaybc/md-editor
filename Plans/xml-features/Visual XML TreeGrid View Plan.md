# Visual XML Tree/Grid View Plan

## Summary
Add a visual XML inspection view for XML-family files that lets developers browse an XML document as a collapsible tree and inspect/edit node details in a grid-like property panel. This should be an editor-side tool/view, not a replacement for the text editor. It should work for `.xml`, `.xsl`, `.xslt`, `.svg`, and `pom.xml`; `.xsd` can be supported for tree inspection but schema-specific editing is out of scope for v1.

## Expected files to change:
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/editor/context-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/context-menu.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/js/tabs/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/index.js)
- [desktop-app/resources/css/styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/css/styles.css)
- [desktop-app/resources/js/editor/xml-tree-grid-view.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/xml-tree-grid-view.js)
- [desktop-app/tests/xml-tree-grid-view.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/xml-tree-grid-view.test.js)

## Key Changes

### 1. Add XML Tree/Grid Module
Create `app.modules.xmlTreeGridView`.

Public API:
- `openForActiveEditor()`
- `renderFromText({ text, filePath })`
- `parseXmlToTree(text)`
- `selectNode(nodeId)`
- `clear()`

Responsibilities:
- Parse XML with `DOMParser`.
- Build a normalized tree model:
  - element nodes
  - attributes
  - text nodes
  - comments
  - CDATA
  - processing instructions
- Preserve source order.
- Track stable generated node ids for UI selection.
- Return parse diagnostics for malformed XML instead of crashing.

### 2. UI Layout
Add a visual view with two main panes:

- Left pane: collapsible XML tree
  - Element names as primary labels.
  - Attribute count badge.
  - Text preview for short text nodes.
  - Expand/collapse controls.
  - Current selection highlight.

- Right pane: node grid/details
  - Node type
  - Name
  - Namespace URI
  - Prefix
  - Local name
  - Attributes table
  - Text content preview
  - Child count
  - XPath-like location path

For v1, default to read-only inspection. Editing XML through the grid can be a later feature because round-tripping XML while preserving formatting/comments is higher risk.

### 3. Entry Points
Add actions:
- `Source -> XML Tree/Grid View` for XML-family files.
- `Edit -> XML -> XML Tree/Grid View`.

Behavior:
- Uses active editor text.
- Opens a new tool-style tab, similar to existing DevToys/tool tabs.
- If XML is invalid, show a styled inline error in the tree/grid view.
- If active file is unsupported, show app-styled notification.

### 4. Tab Integration
Add a dedicated tab type, for example:
- `type: "xml-tree-grid"`
- title: `XML Tree/Grid`
- source path metadata attached for context

The tab should:
- Restore correctly if left open during the session where possible.
- Not be treated as an empty text editor.
- Re-render from current active editor content when opened.
- Avoid persisting parsed XML content unless existing tool-tab persistence already supports it safely.

### 5. Styling
Add restrained dark-theme styling matching current tool UIs:
- no nested cards
- stable split layout
- compact tree rows
- grid rows with aligned labels/values
- scrollable panes
- responsive fallback: stack tree above details on narrow widths

### 6. Optional v1 Nice-To-Haves
Only include if low-risk:
- Copy node XPath-like path.
- Copy selected node XML.
- Expand all / collapse all buttons.
- Search/filter tree by element or attribute name.

Avoid in v1:
- Editing and writing changes back to XML.
- Schema-driven grid validation.
- Drag/drop node restructuring.
- Auto-formatting XML from this view.

## Test Plan

Unit tests:
- Parses simple XML into a root element tree.
- Preserves nested element order.
- Captures attributes on elements.
- Handles text, comments, CDATA, and processing instructions.
- Invalid XML returns a diagnostic result, not an exception.
- Builds a stable XPath-like path for selected nodes.

Integration-style tests:
- Source action appears for XML-family files.
- Source action does not appear for unrelated file types.
- Opening a tree/grid tab does not create an empty editor tab.
- Reopening/restoring tool tabs preserves the correct tab type.

Manual smoke tests:
- Open a valid XML file and run `XML Tree/Grid View`.
- Expand/collapse nested nodes.
- Select an element and confirm attributes/details render.
- Try invalid XML and confirm a clear parse error appears.
- Confirm existing XML validation, formatting, schema generation, stub generation, XPath Search, and autocomplete still work.

## Assumptions
- v1 is read-only.
- Parsing uses browser-native XML parsing only.
- The visual view is an inspection tool, not a source editor replacement.
- No third-party product names, trademarks, or links are added to code, UI, comments, docs, tests, or fixtures.