# OpenAPI Code Generation Integration Plan

## Summary

Add local/offline **Generate Code From OpenAPI** support for OpenAPI YAML/JSON files.

Use **Swagger Codegen CLI v3** as the v1 generator backend, bundled with MD-Editor during setup/packaging. Runtime generation stays fully local: the app invokes the bundled JAR with the local Java runtime and never calls an online service.

## Expected files to change:

- [desktop-app/resources/js/tools/openapi/openapi-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/openapi/openapi-editor.js)
- [desktop-app/resources/js/tools/openapi/codegen.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/tools/openapi/codegen.js)
- [desktop-app/resources/bridges/openapi-codegen/openapi-codegen-bridge.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/openapi-codegen/openapi-codegen-bridge.cjs)
- [desktop-app/resources/js/sidebar/context-tree.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/sidebar/context-tree.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/vendor-assets.json](C:/GitHub/shaybc/md-editor/desktop-app/vendor-assets.json)
- [desktop-app/download-vendor.js](C:/GitHub/shaybc/md-editor/desktop-app/download-vendor.js)
- [desktop-app/package.json](C:/GitHub/shaybc/md-editor/desktop-app/package.json)
- [desktop-app/resources/vendor-licenses/swagger-codegen/](C:/GitHub/shaybc/md-editor/desktop-app/resources/vendor-licenses/swagger-codegen/)
- [desktop-app/tests/openapi-tool.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/openapi-tool.test.js)
- [desktop-app/tests/openapi-codegen-bridge.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/openapi-codegen-bridge.test.js)
- [desktop-app/help/user/openapi-editor.md](C:/GitHub/shaybc/md-editor/desktop-app/help/user/openapi-editor.md)
- [desktop-app/help/developer/openapi-editor-internals.md](C:/GitHub/shaybc/md-editor/desktop-app/help/developer/openapi-editor-internals.md)

## Key Changes

- Add a new OpenAPI editor toolbar button: `Generate Code`.
- Add file context menu support:
  - `OpenAPI / Swagger > Generate Code...`
  - Only enabled for detected OpenAPI YAML/JSON files.
- Add a code generation dialog using the existing styled dialog system:
  - Generator dropdown, for example Java client, Spring server, TypeScript fetch, JavaScript, CSharp, Python, Go.
  - Output folder picker.
  - Package/module name fields where relevant.
  - Advanced key/value options mapped to Swagger Codegen `--additional-properties`.
  - Generation always runs into a staging folder first.
- Add a preview/apply flow:
  - Run generation into a temp staging directory.
  - Show generated file tree, file counts, overwrite/new indicators, and stdout/stderr log.
  - `Apply` copies staged files into the chosen output folder.
  - Existing files require confirmation before overwrite.
- Use current in-memory OpenAPI text:
  - If the user has unsaved YAML edits, generate from the editor content, not stale disk content.
  - Validate before generation.
  - If invalid, publish OpenAPI Problems and do not invoke codegen.

## Generator Backend

- Bundle `swagger-codegen-cli` as `resources/vendor/swagger-codegen/swagger-codegen-cli.jar`.
- Add vendor metadata, checksum, and license provenance.
- Use package managers during setup/build only; runtime generation does not download anything.
- Add an OpenAPI codegen bridge that invokes Java with argument arrays, not shell strings.
- Resolve Java from the app’s configured/bundled Java runtime first, then `java` from `PATH`.
- If Java or the JAR is missing, show a styled local error with the exact missing dependency.

Bridge request shape:

```js
{
  specText,
  specFileName,
  workspaceRoot,
  outputFolder,
  generatorName,
  additionalProperties,
  templateDir
}
```

Bridge response shape:

```js
{
  ok,
  stagingFolder,
  files,
  stdout,
  stderr,
  exitCode
}
```

## Safety And UX Rules

- Generation must never write directly into the project before preview.
- Output paths must stay inside the selected output folder.
- No arbitrary CLI command field.
- Advanced options are parsed as structured key/value pairs.
- Do not modify project build files like `pom.xml`, `package.json`, `.csproj`, or Gradle files in v1.
- Preserve existing OpenAPI editing, validation, preview, endpoint generation, and API Client behavior.

## Test Plan

- Unit tests:
  - Valid OpenAPI editor content produces a codegen request from in-memory YAML.
  - Invalid OpenAPI prevents codegen and publishes Problems.
  - Generator options serialize to safe CLI args.
  - Output path validation rejects unsafe paths.
  - File manifest classifies new and overwritten files.
- Bridge tests:
  - Builds the expected `java -jar swagger-codegen-cli.jar generate ...` argument list.
  - Handles missing Java, missing JAR, nonzero exit code, and stderr.
  - Uses staging output before apply.
- Integration tests:
  - Toolbar `Generate Code` opens the dialog.
  - Context menu `Generate Code...` opens the same workflow for OpenAPI files.
  - Preview dialog shows generated files and logs.
  - Apply copies files and refreshes the tree without collapsing expanded folders.
- Manual checks:
  - Disable network and generate a Java client from `openapi.yaml`.
  - Generate a Spring server into a new folder.
  - Try invalid YAML and confirm no files are generated.
  - Try overwrite and confirm the confirmation dialog appears.

## Assumptions

- v1 uses Swagger Codegen CLI v3.
- Runtime must be local/offline.
- Package managers may be used during setup/build because enterprise offline PCs can provide internal mirrors/caches.
- Generated source goes only into a user-selected output folder.
- Custom templates are optional later; v1 uses Swagger Codegen’s built-in templates plus advanced properties.
