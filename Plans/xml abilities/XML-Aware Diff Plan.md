# XML-Aware Diff Plan

## Summary
Add XML-aware comparison as an enhancement to the existing Compare Files workflow. The feature will parse and normalize XML before opening the existing compare tab, so formatting, indentation, quote style, and attribute ordering noise are reduced while structural/text differences remain visible. The existing plain text compare behavior remains unchanged.

## Expected Files To Change
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/files/compare.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/files/compare.js)
- [desktop-app/resources/js/editor/context-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/context-menu.js)
- [desktop-app/resources/js/tabs/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/index.js)
- [desktop-app/resources/js/tools/xml-aware-diff.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/xml-aware-diff.js)
- [desktop-app/resources/styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [desktop-app/tests/xml-aware-diff.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/xml-aware-diff.test.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Key Changes
- Add `xml-aware-diff.js` as a small reusable module:
  - `normalizeXmlForDiff(xmlText, options)`
  - `createXmlAwareCompareSources(leftSource, rightSource, options)`
  - `isXmlLikeSource(source)`
  - Register as `app.modules.xmlAwareDiff`.
- Normalization rules:
  - Parse with `DOMParser`; invalid XML returns a clear diagnostic and does not open a misleading diff.
  - Serialize deterministically with XML declaration preserved only when present.
  - Sort attributes by namespace URI/local name/name.
  - Remove insignificant whitespace-only text nodes between elements.
  - Pretty-print with stable 2-space indentation.
  - Preserve element order, comments, processing instructions, CDATA text content, namespaces, attributes, and meaningful text.
- Extend Compare Files:
  - Keep existing `openCompareFiles` unchanged for plain text compare.
  - Add `openXmlAwareCompareFiles(leftSource, rightSource)` that reads the same source shapes, normalizes both sides, and opens the existing `file-compare` tab with read-only normalized content.
  - Compare tab title format: `XML diff: left.xml <-> right.xml`.
  - Add a small status note in the compare tab when descriptor metadata says XML-aware normalization was applied.
- Add entry points:
  - Tools menu: add `XML-aware Compare...` near `Compare Files...`.
  - XML editor right-click `Source` submenu: add `XML-aware Compare...`; it compares the active XML file/text against a picked second XML file.
  - Edit -> XML submenu: add the same action for XML-family active tabs.
  - Existing generic `Compare Files...` and tab multi-select compare remain plain text unless the new XML-aware command is used.
- Keep behavior intentionally unchanged:
  - No schema-aware semantic diff.
  - No XML patch/apply operations.
  - No persistence for compare tabs, matching existing `file-compare` behavior.
  - No changes to normal file save behavior.

## Test Plan
- Unit tests for `xml-aware-diff.js`:
  - Equivalent XML with different indentation compares to identical normalized output.
  - Attribute order differences normalize away.
  - Element order differences remain visible.
  - Text value differences remain visible.
  - Comments, processing instructions, CDATA, namespaces, and XML declaration handling are preserved deterministically.
  - Invalid XML returns diagnostics instead of throwing uncaught errors.
- Compare integration tests:
  - `openXmlAwareCompareFiles` opens a read-only `file-compare` descriptor with normalized left/right content.
  - Non-XML or invalid XML shows an app-styled error and does not open a compare tab.
- Smoke tests:
  - `xml-aware-diff.js` is loaded before `compare.js`/main script usage.
  - Tools menu contains `XML-aware Compare...`.
  - XML Source and Edit -> XML menus contain `XML-aware Compare...`.
- Run:
  - `node --check desktop-app/resources/js/tools/xml-aware-diff.js`
  - `node --check desktop-app/resources/js/files/compare.js`
  - `node --check desktop-app/resources/js/editor/context-menu.js`
  - `node --test desktop-app/tests/xml-aware-diff.test.js`
  - `node --test desktop-app/tests/migration-smoke.test.js`

## Assumptions
- “XML-aware diff” means canonicalized structural text comparison, not a visual tree-diff editor.
- The existing Compare Files tab is the correct rendering surface.
- XML-aware compare output is read-only because normalized content may not match original file bytes.
- XML-family inputs include `.xml`, `.xsd`, `.xsl`, `.xslt`, `.svg`, and `pom.xml`.
