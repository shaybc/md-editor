# XSLT Runner

## Summary
Add a first-class XSLT Runner for XML-family workflows. v1 will support browser/runtime-native XSLT 1.0 transforms using local XML and XSLT text, with a tool tab for repeated use and source-menu actions for active XML/XSLT files. No third-party product names, trademarks, or links will be added.

## Expected files to change:
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/js/editor/context-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/context-menu.js)
- [desktop-app/resources/js/tabs/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/index.js)
- [desktop-app/resources/js/tabs/view-manager.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/view-manager.js)
- [desktop-app/resources/js/tools/xslt/xslt-runner.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/xslt/xslt-runner.js)
- [desktop-app/resources/js/tools/xslt/xslt-tool.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/xslt/xslt-tool.js)
- [desktop-app/resources/styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [desktop-app/tests/xslt-runner.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/xslt-runner.test.js)
- [desktop-app/tests/tab-persistence.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/tab-persistence.test.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Key Changes
- Add an `xsltRunner` module that exposes:
  - `transform({ xmlText, xsltText, parameters })`
  - `serializeResult(resultDocument)`
  - `_test` helpers for parser/result formatting tests
- Add an `XSLT Runner` tool tab with:
  - XML input textarea, XSLT textarea, result textarea, status line, Paste/Clear/Copy actions.
  - Syntax coloring via the existing `toolSyntaxTextarea` helper using XML highlighting for XML, XSLT, and XML/HTML output.
  - Optional parameter rows as name/value pairs passed to the transform with `setParameter(null, name, value)`.
  - Automatic rerun on XML, XSLT, or parameter changes after both XML and XSLT inputs are non-empty.
- Add actions:
  - Tools menu item: `XSLT Runner`.
  - `Edit -> XML -> Run XSLT` and source submenu item for `.xsl` / `.xslt` files.
  - When opened from an active `.xsl` / `.xslt` file, prefill the XSLT area from the active editor.
  - When opened from an active `.xml`, `.svg`, or `pom.xml`, prefill the XML area from the active editor.
- Add tab integration:
  - New tab type `xslt-runner-tool`.
  - Register with `tabs/index.js`, `tabs/view-manager.js`, session persistence, tool tab icon, and non-editor safeguards so reopened tabs restore as the tool, not as empty editors.

## Behavior Details
- XSLT support is v1/native XSLT 1.0 only.
- Empty XML or XSLT shows a compact status prompt and leaves output empty.
- Invalid XML, invalid XSLT, unsupported runtime, or transform failure shows an error status and leaves the previous invalid output cleared.
- Result serialization uses `XMLSerializer`; if the transform returns an HTML document, serialize the document element/body consistently as displayable text.
- No file writes are performed by the tool; users can copy output or paste it into a new tab manually unless a later plan adds explicit “Open result in tab”.

## Test Plan
- Unit tests:
  - Valid XML + valid XSLT returns transformed output.
  - Invalid XML reports an XML parse error.
  - Invalid XSLT reports a stylesheet parse/transform error.
  - Parameters are passed to the transform API.
  - Missing `XSLTProcessor` returns a clear unsupported-runtime error.
- Integration/static tests:
  - `XSLT Runner` script is loaded before `script.js`.
  - Tools menu and XML source menu expose the runner actions.
  - `xslt-runner-tool` serializes/restores as a preview tool.
  - Tab view manager mounts and destroys the XSLT runner tab.
- Manual smoke tests:
  - Open an `.xslt` file and run the tool with pasted XML.
  - Open an `.xml` file and run the tool with pasted XSLT.
  - Confirm XML validation, XML Tree/Grid, schema autocomplete, and XPath Search still work.

## Assumptions
- v1 does not add XSLT 2.0/3.0 or external Java-based processing.
- v1 does not fetch remote includes/imports; transforms should be self-contained or use browser-supported local behavior only.
- Parameters are plain string values.
- Output is text-only in the tool, not a rendered browser preview.
