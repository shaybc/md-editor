# XPath Builder Improvements Plan

## Summary
Improve the existing XPath Search tool by adding an interactive XPath Builder panel. The user should be able to paste XML, browse a parsed XML node tree, click an element/attribute/text node, and automatically generate a usable XPath expression into the current XPath input. Existing manual XPath evaluation remains unchanged.

## Expected files to change:
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/tools/xpath/xpath-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/xpath/xpath-builder.js)
- [desktop-app/resources/js/tools/xpath/xpath-tool.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/xpath/xpath-tool.js)
- [desktop-app/resources/styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [desktop-app/tests/xpath-builder.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/xpath-builder.test.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Key Changes
- Add `xpath-builder.js` with a small public API:
  - `parseXmlToXPathTree(xmlText)`
  - `buildXPathForNode(tree, nodeId, options)`
  - `getXPathNodeOptions(node)`
- Generate robust XPath expressions:
  - Elements use absolute paths by default, for example `/root/items/item[1]/name`.
  - Same-name siblings get 1-based predicates.
  - Attributes generate paths like `/root/item[1]/@id`.
  - Text nodes generate paths like `/root/item[1]/name/text()`.
  - Namespaced nodes default to `local-name()` based paths when prefix binding is not guaranteed.
- Update `xpath-tool.js` layout:
  - Keep XML editor on the left.
  - Keep XPath input, result, and cheat sheet on the right.
  - Add a compact `Builder` section between XPath input and result.
  - Builder shows parsed XML as a collapsible tree with node type, name, short value preview, and a generated XPath preview.
  - Clicking a node writes its generated XPath into the XPath input and immediately evaluates it.
- Add builder controls:
  - `Absolute path` default mode.
  - `Use local-name()` toggle for namespace-safe expressions.
  - `Copy XPath` button for the selected node.
  - Clear XML still clears builder state.
- Add styling consistent with the existing XPath/JSONPath tools:
  - Full tab width.
  - No floating cards.
  - Builder tree scrolls independently.
  - Narrow panes stack XML, XPath, builder, result, and cheat sheet cleanly.
- Keep existing behavior unchanged:
  - Manual XPath input and evaluation.
  - Existing result formatting.
  - Existing cheat sheet.
  - Existing XPath tool tab type and persistence behavior.

## Test Plan
- Add `xpath-builder.test.js` covering:
  - Simple absolute element path generation.
  - Same-name sibling indexing.
  - Attribute XPath generation.
  - Text node XPath generation.
  - Namespace-safe `local-name()` path generation.
  - Invalid or empty XML returns diagnostics instead of throwing.
- Update smoke tests to confirm:
  - `xpath-builder.js` is loaded before `xpath-tool.js`.
  - XPath Search still registers normally.
  - Builder CSS selectors exist.
- Run:
  - `node --check desktop-app/resources/js/tools/xpath/xpath-builder.js`
  - `node --check desktop-app/resources/js/tools/xpath/xpath-tool.js`
  - `node --test desktop-app/tests/xpath-evaluator.test.js`
  - `node --test desktop-app/tests/xpath-builder.test.js`
  - `node --test desktop-app/tests/migration-smoke.test.js`

## Assumptions
- “XPath builder improvements” means improving the existing XPath Search tool, not creating a separate new tool.
- V1 is a builder/evaluator helper, not a full schema-aware XPath IDE.
- XPath 1.0 browser-native evaluation remains the execution engine.
- No XPath editing is written back into source XML.
