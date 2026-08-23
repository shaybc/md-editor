# OpenAPI Validate + Swagger UI Preview Plan

## Summary
Update the OpenAPI toolbar semantics so `Validate` becomes the explicit “refresh + validate + report diagnostics” action, while `Preview` opens a real Swagger UI documentation view for the current OpenAPI document.

Swagger UI should be integrated via `swagger-ui-dist`, which is Apache-2.0 licensed and provides browser-ready assets. Add `scarfSettings.enabled=false` because the current npm package documents install-time analytics via Scarf. Sources: [Swagger UI GitHub](https://github.com/swagger-api/swagger-ui), [swagger-ui-dist npm](https://www.npmjs.com/package/swagger-ui-dist).

## Expected files to change:
- [desktop-app/resources/js/tools/openapi/openapi-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/openapi/openapi-editor.js)
- [desktop-app/resources/js/tools/openapi/detector.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/openapi/detector.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/package.json](C:/GitHub/shaybc/md-editor/desktop-app/package.json)
- [desktop-app/package-lock.json](C:/GitHub/shaybc/md-editor/desktop-app/package-lock.json)
- [desktop-app/download-vendor.js](C:/GitHub/shaybc/md-editor/desktop-app/download-vendor.js)
- [desktop-app/resources/vendor-licenses/](C:/GitHub/shaybc/md-editor/desktop-app/resources/vendor-licenses/)
- [desktop-app/tests/openapi-tool.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/openapi-tool.test.js)
- [desktop-app/help/user/openapi-editor.md](C:/GitHub/shaybc/md-editor/desktop-app/help/user/openapi-editor.md)
- [desktop-app/help/developer/openapi-editor-internals.md](C:/GitHub/shaybc/md-editor/desktop-app/help/developer/openapi-editor-internals.md)

## Key Changes
- Change `Validate` behavior:
  - Parse the current OpenAPI source.
  - Refresh explorer, local preview cards, selected operation details, and validation issue list.
  - Run current structural validation.
  - Show explicit OpenAPI status text:
    - `Validation complete: no issues found.`
    - `Validation complete: 1 issue found.`
    - `Validation failed: unable to parse document.`
  - Publish OpenAPI diagnostics to the existing Problems panel using `setDiagnosticCollection(owner, diagnostics, { persistent: false, revealErrors: true })`.
  - Clear the OpenAPI Problems collection when validation passes with no diagnostics.
- Keep `Preview` reserved for Swagger UI:
  - Parse current source first.
  - If invalid, show panel status and publish parse/validation problems; do not open Swagger UI.
  - If valid, open a Swagger UI view for the current in-memory document.
  - Preserve selected operation; if possible, deep-link/focus the selected operation in Swagger UI after render.
- Add OpenAPI Problems integration:
  - Use owner key `openapi:<normalized-file-path-or-tab-id>`.
  - Diagnostic shape: `{ severity, message, filePath, line, column, source: "openapi" }`.
  - For validation rules without exact source location, use best-effort line/column from a YAML/JSON path finder; otherwise fallback to line `1`, column `1`.
  - Use a lazy `getProblemsPanel()` dependency in `script.js` because the Problems panel is registered later than the OpenAPI editor.
- Add Swagger UI assets:
  - Add `swagger-ui-dist` to `desktop-app/package.json`.
  - Add `scarfSettings: { "enabled": false }`.
  - Extend vendor setup to copy the required Swagger UI dist assets into `resources/vendor/swagger-ui/`.
  - Load Swagger UI CSS/JS from `resources/index.html`.
  - Add license/notice provenance under `resources/vendor-licenses/`.

## Implementation Details
- In `openapi-editor.js`, split toolbar actions into:
  - `validateOpenApiDocument(view, { revealProblems: true })`
  - `refreshOpenApiPanels(view, documentModel)`
  - `openSwaggerUiPreview(view)`
- `Validate` calls `validateOpenApiDocument`, which always refreshes panels before publishing status/problems.
- `Preview` calls `validateOpenApiDocument`; if status is ok, render Swagger UI into a dedicated right-side preview host or modal-like document pane inside the OpenAPI editor.
- Configure Swagger UI with an in-memory `spec` object, not a URL, so local unsaved edits are previewed.
- Disable external request execution inside Swagger UI for v1 if practical; execution remains through MD-Editor’s API Client.
- Keep the current local operation cards/details as the editor’s lightweight overview; Swagger UI is opened by the `Preview` button and can replace/focus the preview area.
- Do not change OpenAPI file detection, endpoint scanner behavior, API Client request mapping, or tab persistence except where needed to pass new Problems/Swagger dependencies.

## Test Plan
- Unit tests:
  - `Validate` returns refreshed document state and diagnostics for valid, invalid, and malformed OpenAPI.
  - OpenAPI diagnostics map to Problems panel shape with severity, message, filePath, line, column, and source.
  - Passing validation clears the OpenAPI Problems collection.
  - Failing validation publishes the OpenAPI Problems collection with `revealErrors: true`.
- Integration-style JS tests:
  - Clicking `Validate` refreshes explorer/preview/status and calls Problems panel APIs.
  - Clicking `Preview` with invalid source does not invoke Swagger UI and reports problems.
  - Clicking `Preview` with valid source invokes Swagger UI with the parsed in-memory spec.
- Manual/E2E checks:
  - Open valid `openapi.yaml`, edit title/path, click `Validate`; panels update and status confirms success.
  - Break YAML syntax, click `Validate`; Problems panel shows OpenAPI error.
  - Fix syntax, click `Validate`; Problems panel clears OpenAPI errors.
  - Click `Preview`; Swagger UI renders the current document.
  - Select an operation, click `Preview`; Swagger UI opens with the same document and selected operation context where supported.

## Assumptions
- `Validate` is the only action responsible for publishing OpenAPI diagnostics to Problems; live typing may keep the inline status updated but should not spam/reveal Problems.
- Swagger UI preview uses `swagger-ui-dist` browser assets copied into `resources/vendor/swagger-ui/`, not CDN loading.
- Swagger UI “Try it out” execution is not the primary execution path in v1; API Client remains the official request runner.
- Validation remains local structural validation unless a full OpenAPI validator is added in a later task.
