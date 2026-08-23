# Schema-Aware XML Autocomplete

## Summary
Add schema-aware autocomplete for XML-family editors by using the existing CodeMirror language-server completion bridge and feeding it XML schema associations. Autocomplete should suggest valid elements, attributes, namespaces, and constrained values when an XML document is linked to an XSD through inline schema hints or a manual per-session association.

## Expected files to change:
- [desktop-app/resources/js/lsp/server-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/server-registry.js)
- [desktop-app/resources/js/editor/codemirror-bundle-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-bundle-source.js)
- [desktop-app/resources/js/editor/context-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/context-menu.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/tests/xml-schema-autocomplete.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/xml-schema-autocomplete.test.js)

## Key Changes
- Add an XML schema association service registered as `app.modules.xmlSchemaAutocomplete`.
  - Track per-session `{ filePath, schemaPath }` mappings only.
  - Read existing schema hints from `xsi:schemaLocation` and `xsi:noNamespaceSchemaLocation`.
  - Produce XML language-server settings using `xml.fileAssociations`, with local schema paths resolved relative to the XML file.
- Add user actions for schema association:
  - `Source -> Associate XML Schema...` for XML-family files except `.xsd`.
  - `Edit -> XML -> Associate XML Schema...`.
  - Use the existing app-styled dialog/open-file flow to select a local `.xsd`; do not persist associations to preferences in v1.
- Update XML language-server configuration flow:
  - Merge generated XML schema associations into the existing XML server workspace configuration.
  - Send `workspace/didChangeConfiguration` after association changes.
  - Keep existing validation, formatting, schema generation, stub generation, and XPath tools unchanged.
- Improve XML completion triggering only where needed:
  - Keep the current CodeMirror LSP completion source as the single completion engine.
  - Ensure XML completion requests trigger for explicit autocomplete and XML authoring characters such as `<`, `/`, space, `=`, `"`, `'`, and `:`.
  - Preserve snippet insertion and completion-item resolve behavior already used by the LSP bridge.
- UI feedback:
  - On successful association, show a compact notification: `XML schema associated. Autocomplete will use it for this session.`
  - On missing/unreadable schema, show a warning and do not register the association.

## Public Interfaces
- New module API:
  - `associateSchemaForActiveEditor()`
  - `setSchemaAssociation({ filePath, schemaPath })`
  - `clearSchemaAssociation(filePath)`
  - `getWorkspaceConfiguration()`
  - `getAssociations()`
- `getWorkspaceConfiguration()` returns an object mergeable into XML server settings, including `xml.fileAssociations`.

## Test Plan
- Unit tests:
  - Relative inline schema references resolve against the XML file path.
  - Manual `.xsd` association produces the expected `xml.fileAssociations` entry.
  - Missing schema selection is rejected with a warning result.
  - Clearing an association removes only that file’s mapping.
- Integration-style tests:
  - XML server workspace configuration includes generated associations.
  - Updating an association sends a configuration refresh through the existing LSP bridge.
  - XML completion trigger logic requests completions on XML authoring characters.
- Manual smoke tests:
  - Open XML with `xsi:noNamespaceSchemaLocation`, type inside a child element, confirm schema-derived suggestions.
  - Open XML without schema hints, associate a local XSD, confirm element/attribute suggestions.
  - Confirm `.xsd` files still show XSD validation/stub actions and do not show schema association.
  - Confirm existing XML validation, formatting, schema generation, stub generation, and XPath Search still work.

## Assumptions
- v1 uses only local `.xsd` files and inline schema references.
- Manual associations are session-only.
- The existing XML language-server integration remains the source of schema-aware completions; no parallel XML autocomplete engine is added.
- No third-party product names, trademarks, or links are added to code, UI, docs, tests, or fixtures.
