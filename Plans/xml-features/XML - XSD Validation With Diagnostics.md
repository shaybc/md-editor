# XML/XSD Validation With Diagnostics

## Summary
Add first-class XML validation that reports actionable diagnostics for `.xml`, `.xsd`, `.xsl`, `.xslt`, `.svg`, and `pom.xml` files. Use the existing XML language-server integration for schema-aware validation, add a lightweight well-formedness fallback, and surface results through the existing editor diagnostics and Problems panel. Do not include any third-party product names, trademarks, or links in code, UI text, docs, comments, or tests.

## Key Changes
- Add a generic XML validation module that:
  - Runs DOM-based well-formedness checks for all XML-family files.
  - Uses the configured XML language server when available for XSD/DTD/schema-aware diagnostics.
  - Resolves schemas from `xsi:schemaLocation`, `xsi:noNamespaceSchemaLocation`, local relative paths, and manually selected `.xsd` files.
- Add editor actions:
  - `Source -> Validate XML` for XML-family files.
  - `Source -> Validate XSD` for `.xsd` files.
  - `Edit -> XML -> Validate XML/XSD` matching the active file type.
- Integrate diagnostics with existing UI:
  - Publish validation results into the existing Problems panel using a dedicated owner such as `xml-validation`.
  - Show inline editor diagnostics when the active CodeMirror editor is available.
  - Clear stale XML validation diagnostics when the file changes, closes, or is revalidated.
- Add a compact result notification:
  - Success: no validation issues found.
  - Warning/error: count and prompt to open Problems.
  - Missing schema: warning with the unresolved schema path/URI.

## Interfaces
- New service API, registered on `app.modules.xmlValidation`:
  - `validateActiveEditor(options)`
  - `validateText({ text, filePath, languageId, schemaPath })`
  - `clearDiagnosticsForPath(filePath)`
- Diagnostic shape must match the Problems panel contract:
  - `severity`, `message`, `filePath`, `line`, `column`, `source`
  - `source` should be `xml`
- Manual schema selection is optional for v1:
  - If implemented, store only per-session association unless existing app preferences already provide a natural place for file-level settings.

## Test Plan
- Unit test XML well-formedness:
  - Valid XML returns no diagnostics.
  - Mismatched tags return an error with line/column.
  - Empty input returns no diagnostics or a clear “nothing to validate” result, not a crash.
- Unit test schema resolution:
  - Relative `xsi:noNamespaceSchemaLocation`.
  - Multiple namespace/schema pairs in `xsi:schemaLocation`.
  - Missing local schema reports a warning.
- Integration test Problems panel mapping:
  - Validation diagnostics appear under the XML source.
  - Revalidation replaces stale diagnostics.
  - Fixing XML clears previous diagnostics.
- Manual smoke tests:
  - Open invalid XML and run `Validate XML`.
  - Open XML with local XSD and confirm schema violations appear.
  - Open `.xsd` and run `Validate XSD`.
  - Confirm no regression to existing XML formatting, schema generation, stub generation, and XPath Search.

## Assumptions
- Reuse the existing XML language-server setup rather than bundling a second validator.
- Fallback validation only checks XML well-formedness when the language server or schema cannot be used.
- No auto-fix feature in v1; diagnostics only.
- No external product names, trademarks, or reference links are added anywhere in plan-derived code, UI, comments, docs, tests, or fixtures.
