# Plan: Helm/Kubernetes Command Dialogs and Rich Result Summaries

## Summary
Replace the standalone `Server Dry Run (Skip Schema Validation)` menu item with a proper command customization flow. All Helm and Kubernetes commands will run through a UI-first workflow: configure options before execution where relevant, execute through the existing terminal system, then show a modal summary with status, command details, parsed findings, logs/output drill-down, manifest/resource links, and relevant help links.

## Key Changes
- Remove `Project > Kubernetes > Server Dry Run (Skip Schema Validation)` and the `kubernetes-server-dry-run-no-validate` command ID.
- Add a reusable command options dialog for Kubernetes dry-run workflows:
  - Mode: client dry run or server dry run.
  - Schema validation: enabled by default, optional skip validation.
  - Context/namespace display from current Kubernetes settings.
  - Manifest source display: saved file, temporary rendered YAML, or Helm-rendered output.
  - Final command preview before running.
- Add a reusable command result modal for all Helm/Kubernetes commands:
  - Header: success/failure, tool, command name, exit code, duration, context, namespace, chart/manifest path.
  - Tabs: Summary, Output, Diagnostics, Resources, Graph, Help.
  - Output tab shows stdout/stderr with copy/open-terminal actions.
  - Diagnostics tab parses common failures: missing tool, non-Kubernetes server, OpenAPI validation failure, missing manifest path, Helm template/lint errors.
  - Resources tab links to active manifest files, rendered YAML tabs, chart root, `Chart.yaml`, `values.yaml`, and source template paths when known.
  - Graph tab renders a simple local object relationship graph from rendered/applied YAML: Namespace -> workload -> ReplicaSet/Pod template -> Service/ConfigMap/Secret references where detectable.
  - Help tab links to relevant official pages based on command/failure type, such as kubectl dry-run, kind, minikube, Helm template, Helm lint, and Kubernetes local environments.
- Update command execution flow:
  - Kubernetes dry-run menu entries open the options dialog first.
  - Helm render + dry-run commands open the same dry-run options dialog after rendering, using rendered YAML as input.
  - All Helm/Kubernetes command executions return a structured command result object instead of only `true/false`.
  - Alerts remain only for blocking UI/runtime failures; command failures go to the result modal.

## Expected Files To Change
- [desktop-app/resources/js/project/kubernetes-project-commands.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/kubernetes-project-commands.js)
- [desktop-app/resources/js/project/helm-project-commands.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/helm-project-commands.js)
- [desktop-app/resources/js/project/project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
- [desktop-app/resources/js/ui/application-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ui/application-menu.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- New module: `desktop-app/resources/js/project/kubernetes-command-options-dialog.js`
- New module: `desktop-app/resources/js/project/project-command-result-modal.js`
- New module: `desktop-app/resources/js/project/kubernetes-command-result-parser.js`
- New module: `desktop-app/resources/js/project/kubernetes-manifest-graph.js`
- New styles: `desktop-app/resources/css/project/command-result-modal.css`
- Tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Public Interfaces
- Replace boolean-only command execution with structured results:
  - `execute(commandName, context, options)` returns `{ ok, tool, commandName, command, exitCode, stdout, stderr, output, startedAt, durationMs, contextSummary, sourceRefs, diagnostics, resources }`.
- Add `kubernetesCommandOptionsDialog.open(initialOptions)`:
  - Returns selected options or `null` on cancel.
  - Supports `{ dryRunMode, validateSchema, contextName, namespaceName, manifestSource }`.
- Add `projectCommandResultModal.open(result)`:
  - Displays structured results for Helm and Kubernetes commands.
- Add `kubernetesCommandResultParser.parse(result)`:
  - Produces normalized diagnostics and suggested actions.
- Add `kubernetesManifestGraph.buildFromYaml(yamlText)`:
  - Produces lightweight nodes/edges for modal graph rendering.

## Test Plan
- Kubernetes command tests:
  - Client dry run builds `kubectl apply --dry-run=client -f ...`.
  - Server dry run with validation builds `kubectl apply --dry-run=server -f ...`.
  - Server dry run with schema validation disabled builds `kubectl apply --dry-run=server --validate=false -f ...`.
  - Unsaved rendered YAML still uses a temporary manifest file and cleans it up.
  - Raw Helm templates remain blocked from direct Kubernetes apply/delete/diff/dry-run.
- Dialog tests:
  - Dry-run commands open the customization dialog before execution.
  - Canceling the options dialog does not run a command.
  - Selected options are passed into command building.
  - Result modal opens after success and failure.
- Parser tests:
  - Missing `kubectl` and missing `helm` produce install/configuration diagnostics.
  - Non-Kubernetes HTTP server/OpenAPI errors produce “wrong server/context” diagnostics.
  - Helm lint/template errors are grouped as Helm diagnostics.
  - Missing manifest path produces saved-file/temp-render guidance.
- UI/menu smoke tests:
  - `Server Dry Run (Skip Schema Validation)` is removed.
  - `Client Dry Run` and `Server Dry Run` remain.
  - Project menu command IDs still route through `project-command-menu`.
  - New dialog/result scripts load before command modules that depend on them.
- Existing focused tests:
  - Kubernetes command tests.
  - Helm command tests.
  - Kubernetes/Helm script order smoke tests.

## Assumptions And Defaults
- The result summary surface is a modal dialog, per user preference.
- The first implementation covers all current Helm and Kubernetes commands, per user preference.
- Schema validation remains enabled by default.
- Skipping schema validation is available only inside the dry-run customization dialog, not as a separate menu item.
- Mutating commands, especially apply/delete, keep existing confirmation requirements and also show a result modal after execution.
- Help links use official Kubernetes/Helm documentation where possible.
- The graph is local and manifest-derived; it does not require live cluster access.
