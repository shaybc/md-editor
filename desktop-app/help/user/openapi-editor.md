# OpenAPI Editor

MD-Editor opens valid OpenAPI and Swagger files in the OpenAPI Editor automatically when you open a `.yaml`, `.yml`, or `.json` file whose root document contains `openapi` or `swagger: "2.0"`, plus `info` and `paths`.

The OpenAPI Editor includes:

- an explorer for `info`, `servers`, `paths`, operations, schemas, security, and tags
- a source editor for the OpenAPI YAML or JSON
- a lightweight operation overview grouped by path
- selected-operation details
- Swagger UI documentation preview from the **Preview** button
- validation feedback in the OpenAPI panel and Problems panel
- an action to open the selected operation in the API Client
- local code generation from the current OpenAPI document

Click **Validate** to re-read the current source, refresh the OpenAPI panels, and publish OpenAPI diagnostics to the Problems panel. Click **Preview** to render the current in-memory document in Swagger UI.

Use **Generate From Endpoints** or **Update From Endpoints** while a Java controller/resource file is active to scan Spring MVC and JAX-RS annotations and preview the OpenAPI changes before applying them.


## Generate Code

Click **Generate Code** in an OpenAPI editor tab, or right-click a detected OpenAPI YAML/JSON file and choose **OpenAPI / Swagger > Generate Code...**. MD-Editor validates the current document first, then runs the bundled Swagger Codegen CLI locally into a staging folder. Review the generated file list and log, then click **Apply** to copy the staged files into the selected output folder.

Unsaved OpenAPI editor changes are used for generation. Existing output files are shown as overwrite candidates before anything is copied.
