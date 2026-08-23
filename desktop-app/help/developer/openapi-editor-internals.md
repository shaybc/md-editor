# OpenAPI Editor Internals

The OpenAPI Editor is implemented under `desktop-app/resources/js/tools/openapi/` as small browser-loadable modules with CommonJS exports for tests.

- `detector.js` parses YAML/JSON, only classifies full OpenAPI or Swagger root documents as OpenAPI, and maps validation issues into Problems-panel diagnostics.
- `explorer.js` builds the navigation tree used by the editor sidebar.
- `request-mapper.js` converts a selected OpenAPI operation into API Client request state.
- `endpoint-scanner.js` contains the v1 Java scanner for Spring MVC and JAX-RS annotations.
- `generator.js` creates or updates OpenAPI documents while preserving existing operation fields.
- `codegen.js` owns the Generate Code dialog, option serialization, staging preview, and apply workflow.
- `openapi-editor.js` mounts the tab UI, Validate workflow, Problems-panel publication, Swagger UI preview, API Client handoff, and endpoint-generation confirmation flow.

The file-open flow calls detection after text read and before generic YAML/JSON routing. OpenAPI tabs are serialized through tab persistence as file-backed text documents with their own tab type.


Swagger UI is loaded from `resources/vendor/swagger-ui/`, which is populated from the `swagger-ui-dist` npm package by `download-vendor.js`. The editor passes an in-memory `spec` object so unsaved OpenAPI edits can be previewed.
OpenAPI code generation uses `resources/bridges/openapi-codegen/openapi-codegen-bridge.cjs`. The bridge writes the in-memory spec text to a temp file, invokes `java -jar resources/vendor/swagger-codegen/swagger-codegen-cli.jar generate ...` with argument arrays, collects a generated-file manifest, and only copies staged files into the chosen output folder after confirmation.
