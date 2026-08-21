# Plan: Kubernetes/Helm missing Features

## Summary
Implement the missing Kubernetes/Helm features as safe-first milestones on top of the existing YAML, Helm, Kubernetes project-command, terminal, and tab systems. Plan tools for authoring, validation, Helm rendering, chart dependencies, kubeconfig awareness, and a read-only cluster explorer.

## Key Changes

### 1. Kubernetes Schema and CRD Validation
- Extend YAML LSP configuration with Kubernetes schema associations for manifest-like YAML files while preserving Docker Compose schema handling.
- Add CRD schema discovery from kubeconfig/current context via `kubectl get crd -o json`, cache schemas per context, and allow disabling CRD completion/validation.
- Add diagnostics for missing/invalid Kubernetes fields through YAML LSP where schemas are available; fall back gracefully when `kubectl` or cluster access is unavailable.

### 2. Explain, Hover, and Authoring Help
- Add `kubectl explain` support for the current YAML key path, selected text, or manifest `kind`.
- Surface explain output in a styled hover/side preview, not only terminal output.
- Add Helm/Sprig/Go-template function hover docs and completion metadata for common functions such as `include`, `tpl`, `toYaml`, `nindent`, `default`, `required`, `quote`, `printf`, and Sprig helpers.
- Keep Helm YAML as YAML; do not introduce a separate editor language.

### 3. Helm Rendering and Chart Dependency Workflows
- Upgrade existing Helm commands into a richer chart workflow:
  - lint chart
  - render full chart
  - render active template
  - dry-run rendered output with `kubectl apply --dry-run=server -f -`
  - show chart dependencies
  - insert dependency fragment into `Chart.yaml`
  - run `helm dependency update`
  - package chart
- Rendered YAML opens in an unsaved YAML/Kubernetes editor tab, never writes to the workspace automatically.
- Helm template errors remain in terminal output and trigger app-wide notifications.

### 4. Safe Kubernetes Manifest Commands
- Add server-side validation/diff commands:
  - `kubectl apply --dry-run=server -f <file>`
  - `kubectl diff -f <file>`
- Keep existing apply/delete commands, but ensure they require app-wide confirmations and clearly show current context/namespace.
- Prevent raw Helm templates from using direct `kubectl apply/delete`; require rendered output for Kubernetes validation.

### 5. Kubeconfig, Namespace, and Read-Only Cluster Explorer
- Add settings/status support for:
  - `kubectl` path
  - `helm` path
  - kubeconfig path
  - current context
  - current namespace
- Add commands to switch kubeconfig/context/namespace using existing app dialog patterns.
- Add a read-only cluster explorer for contexts, namespaces, workloads, services, pods, nodes, events, and Helm releases.
- Add read-only actions first: refresh, copy name, describe, show logs, follow logs, show events, and port-forward preview command generation. Mutating explorer actions stay out of this plan.

## Expected files to change:
- [desktop-app/resources/js/lsp/server-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/server-registry.js)
- [desktop-app/resources/js/project/kubernetes-project-commands.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/kubernetes-project-commands.js)
- [desktop-app/resources/js/project/helm-project-commands.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/helm-project-commands.js)
- [desktop-app/resources/js/project/helm-chart-context.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/helm-chart-context.js)
- [desktop-app/resources/js/project/project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
- [desktop-app/resources/js/editor/codemirror-bundle-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-bundle-source.js)
- [desktop-app/resources/js/editor/codemirror-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-editor.js)
- [desktop-app/resources/js/ui/application-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ui/application-menu.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- New modules under [desktop-app/resources/js/project](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project) for kubeconfig/context, CRD schemas, cluster explorer, and Helm function docs.
- New or updated tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests).

## Public APIs / Interfaces
- Extend `kubernetesProjectCommands` with command IDs:
  - `kubernetes-server-dry-run`
  - `kubernetes-diff`
  - `kubernetes-explain-field`
  - `kubernetes-show-events`
  - `kubernetes-logs`
  - `kubernetes-follow-logs`
- Extend `helmProjectCommands` with command IDs:
  - `helm-show-dependencies`
  - `helm-insert-dependency`
  - `helm-package-chart`
  - `helm-render-server-dry-run`
- Add `kubernetesContext` module:
  - `getKubectlPath()`
  - `getHelmPath()`
  - `getKubeconfigPath()`
  - `getCurrentContext()`
  - `getCurrentNamespace()`
  - `setCurrentContext(contextName)`
  - `setCurrentNamespace(namespaceName)`
- Add `kubernetesClusterExplorer` module:
  - `refresh()`
  - `listContexts()`
  - `listNamespaces()`
  - `listWorkloads(namespace)`
  - `listPods(namespace)`
  - `describeResource(resourceRef)`
  - `getLogs(podRef, options)`
  - `getEvents(namespace)`
- Add `helmAuthoringDocs` module:
  - `getFunctionCompletionItems()`
  - `getFunctionHover(functionName)`
  - `getTemplateHover(context)`

## Test Plan
- YAML/LSP tests:
  - Kubernetes schema applies only to detected manifests.
  - Docker Compose schema remains unchanged.
  - CRD schema cache loads from mocked `kubectl get crd -o json`.
  - Missing `kubectl` or inaccessible cluster does not break YAML editing.
- Kubernetes command tests:
  - server dry-run and diff build exact commands.
  - explain derives the correct target from selected text, YAML path, or `kind`.
  - apply/delete still require confirmation and include current context/namespace in confirmation text.
  - raw Helm templates are rejected for direct apply/delete.
- Helm tests:
  - function completions and hover docs are returned for Helm/Sprig/Go-template helpers.
  - render full chart and active template open unsaved rendered YAML tabs.
  - server dry-run uses rendered output.
  - dependency show/insert/update/package commands build correct Helm commands.
- Context/explorer tests:
  - contexts/namespaces parse from mocked `kubectl config` output.
  - explorer parses pods, services, deployments, nodes, Helm releases, logs, and events from mocked command output.
  - unavailable tools show styled notifications and do not throw.
- Smoke tests:
  - scripts load in the correct order from `index.html`.
  - Project menu exposes Kubernetes and Helm commands.
  - Settings/status UI exposes kubectl, helm, kubeconfig, context, and namespace.
  - Existing snippet, Java, Maven, Gradle, YAML, Docker Compose, and autocomplete tests continue passing.

## Assumptions and Defaults
- Use user-installed `kubectl` and `helm`; do not bundle or auto-install them.
- Default to safe-first behavior: read-only, explain, render, diff, and dry-run are primary; mutating actions require explicit confirmations.
- Default Kubernetes validation command is server-side dry-run when a cluster is available, client-side dry-run only as fallback.
- Rendered Helm output is unsaved by default.
- Cluster explorer is read-only in this plan.
- Existing dirty worktree changes must be preserved and not reverted.
