# OpenAPI / Swagger Editor Integration Plan

## Summary

Add an **OpenAPI Editor** as a first-class MD-Editor IDE tool: opening an OpenAPI YAML/JSON file automatically loads an OpenAPI-aware editor tab with source editing, API documentation preview, endpoint navigation, and “test in API Client” actions.

Use free/open-source building blocks where they fit:
- Use **Swagger UI** for documentation preview and interactive operation rendering; it is Apache 2.0 and supports OpenAPI 2.0, 3.0, 3.1, and 3.2 in current releases.
- Use **Swagger Editor** as reference/integration candidate for OpenAPI-specific editor behavior, but do not embed it wholesale in v1 because it brings React/Monaco duplication into a CodeMirror-based app.
- Use **@apidevtools/swagger-parser** or equivalent parser/validator for validation, bundling, and `$ref` resolution, with local-file resolution constrained to the opened workspace.

## Key Changes

- Add a new tab type: `openapi-editor`.
- The tab layout should have three main regions:
  - left: OpenAPI explorer tree with `info`, `servers`, `paths`, operations, schemas, security, tags.
  - center: existing CodeMirror YAML/JSON editor.
  - right/bottom: Swagger UI preview plus selected-operation details.
- Add toolbar actions:
  - `Preview`
  - `Validate`
  - `Open in API Client`
  - `Generate From Endpoints`
  - `Update From Endpoints`
  - `Save`
- Reuse the existing API Client for execution instead of implementing a second request engine.
- Add a native OpenAPI request builder that converts an OpenAPI operation into an API Client request:
  - method, URL, path params, query params, headers, request body, examples, and selected server/base URL.
  - selected OpenAPI `servers[]` should map to API Client environment/base URL choices.
- Add an endpoint scanner/generator bridge:
  - scope options: whole workspace, selected folder, selected file, selected endpoint, or selected microservice root.
  - v1 detectors: Java Spring MVC annotations and JAX-RS annotations.
  - detector API remains pluggable for later JavaScript/TypeScript, Python, .NET, etc.
  - generated changes must open a preview dialog before writing the OpenAPI file.

## OpenAPI File Detection

When opening a `.yaml`, `.yml`, or `.json` file:

- Parse the file content.
- Auto-open as `openapi-editor` only if the parsed root object matches:
  - OpenAPI 3.x: has string root field `openapi`, plus object `info`, plus object `paths`.
  - Swagger 2.0: has string root field `swagger: "2.0"`, plus object `info`, plus object `paths`.
- Do not auto-open partial `$ref` files, schema-only YAML, Kubernetes YAML, Compose YAML, config YAML, or generic JSON.
- If filename strongly suggests OpenAPI, such as `openapi.yaml`, `swagger.json`, or `api-docs.yaml`, but the content does not pass detection, open as normal YAML/JSON and show a non-blocking action: `Open as OpenAPI`.
- Store the user’s manual choice per file path so a user can force a file to always open as normal YAML/JSON or always as OpenAPI.

## Implementation Changes

- Add an `openapi` tool module under the tools area with:
  - parser/detector
  - explorer tree builder
  - Swagger UI preview host
  - operation-to-API-Client mapper
  - endpoint generation/update workflow
- Extend tab lifecycle:
  - creation, activation, destroy, persistence, save/dirty handling for `openapi-editor`.
- Extend file open flow:
  - detect OpenAPI after text read and before generic YAML/JSON editor routing.
- Extend YAML/JSON LSP configuration:
  - apply OpenAPI schema association only for detected OpenAPI tabs/files.
  - keep ordinary YAML/JSON behavior unchanged.
- Add endpoint generation:
  - scan selected source scope.
  - infer paths, methods, params, request body, response type names, tags, and operation IDs.
  - create a new OpenAPI document if none exists.
  - update existing `paths` entries while preserving manual descriptions, examples, security, tags, and custom `x-*` fields.
  - show diff/preview before applying edits.

## Expected files to change:

- [desktop-app/resources/js/files/open.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/files/open.js)
- [desktop-app/resources/js/tabs/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/index.js)
- [desktop-app/resources/js/tabs/view-manager.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/view-manager.js)
- [desktop-app/resources/js/tabs/persistence.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tabs/persistence.js)
- [desktop-app/resources/js/lsp/server-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/server-registry.js)
- [desktop-app/resources/js/tools/openapi/](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/openapi/)
- [desktop-app/resources/bridges/openapi/](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/openapi/)
- [desktop-app/package.json](C:/GitHub/shaybc/md-editor/desktop-app/package.json)
- [desktop-app/help/user/](C:/GitHub/shaybc/md-editor/desktop-app/help/user/)
- [desktop-app/help/developer/](C:/GitHub/shaybc/md-editor/desktop-app/help/developer/)

## Test Plan

- Unit tests:
  - OpenAPI detection accepts valid Swagger 2.0 and OpenAPI 3.x YAML/JSON.
  - detection rejects Kubernetes, Docker Compose, package JSON, schema-only files, and malformed YAML.
  - operation-to-request mapping creates correct API Client request data.
  - endpoint scanner extracts Spring/JAX-RS method/path/parameter basics.
  - OpenAPI merge preserves descriptions, examples, `x-*`, and existing components.
- Integration tests:
  - opening `openapi.yaml` loads `openapi-editor`.
  - opening ordinary YAML still loads the normal editor.
  - editing the source updates validation/preview.
  - “Open in API Client” opens a prefilled request tab.
  - generating from a Java controller previews changes before writing.
- E2E tests:
  - open sample project, generate OpenAPI from controller, save, reopen, preview, test one endpoint against selected server.
  - verify session restore keeps OpenAPI editor tabs intact.

## Assumptions

- v1 uses Swagger UI for preview/testing surface and MD-Editor’s CodeMirror for editing; full embedded Swagger Editor is deferred unless a later UX pass proves it is worth the React/Monaco cost.
- v1 endpoint generation is Java-first: Spring MVC and JAX-RS. The scanner API is intentionally pluggable for other languages.
- Security audit/scan features are out of scope for v1; validation/linting is local only.
- `$ref` resolution is workspace-limited by default to avoid accidental local-file exposure.
