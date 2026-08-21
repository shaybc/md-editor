# Kubernetes Topology Graph and Reopenable Command Results

## Summary
Add a KubeForge-inspired Kubernetes topology visualization to MD-Editor by expanding the existing Helm/Kubernetes command result modal’s `Graph` tab into a real object-relationship view. Also persist each Helm/Kubernetes command result on the bottom-panel terminal tab that ran it, so after the modal is closed the user can reopen the same result summary by clicking an icon button on that lower-panel tab/view.

## Key Changes
- Expand Kubernetes topology extraction in `kubernetes-manifest-graph.js`:
  - Parse multi-document YAML from manifests, Helm rendered output, dry-run output, and preview output.
  - Detect relationships: Namespace containment, Service selector -> workload/pod-template labels, Ingress -> Service, workload -> ConfigMap/Secret via env/envFrom/volumes, workload -> PVC, workload -> ServiceAccount, RoleBinding/ClusterRoleBinding -> ServiceAccount/Role/ClusterRole.
  - Return graph nodes with `{ id, kind, name, namespace, label, fileRef }` and edges with `{ from, to, label, reason }`.
  - Keep the graph local and manifest-derived; live cluster topology is not part of this v1.

- Replace the current text-only graph rendering in `project-command-result-modal.js`:
  - Render a compact visual topology canvas/SVG inside the existing `Graph` tab.
  - Include node pills/cards by Kubernetes kind, directional connectors, empty-state text, and a simple details panel when a node/edge is clicked.
  - Keep the existing modal tabs: Summary, Output, Diagnostics, Resources, Graph, Help.
  - Do not mix this with the Markdown document graph; Kubernetes topology remains a command-result feature.

- Persist and reopen command results from the lower panel:
  - Add a small icon-only “Show result summary” button to the terminal command view that ran a Helm/Kubernetes action.
  - The button appears after the command finishes and a structured result exists.
  - Clicking it reopens `projectCommandResultModal.open(result)` with the same structured result, including the Graph tab data.
  - If the terminal tab is closed, the result is no longer shown in the lower panel for v1; no global command history is added yet.
  - Use MD-Editor’s existing icon/button styling patterns; no browser-native dialogs.

- Wire command executions:
  - Helm and Kubernetes command modules continue returning structured results.
  - `project-command-menu.js` opens the modal immediately after command completion and also attaches the result to the terminal tab/session.
  - `desktop-terminal.js` exposes a minimal API to attach/reopen command result metadata for command tabs.
  - The button should be icon-only, placed in the terminal command header or a compact terminal action strip, with tooltip/title `Show result summary`.

## Expected files to change:
- [desktop-app/resources/js/project/kubernetes-manifest-graph.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/kubernetes-manifest-graph.js)
- [desktop-app/resources/js/project/project-command-result-modal.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-result-modal.js)
- [desktop-app/resources/js/project/project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
- [desktop-app/resources/js/terminal/desktop-terminal.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/terminal/desktop-terminal.js)
- [desktop-app/resources/css/project/command-result-modal.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/css/project/command-result-modal.css)
- Tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Public APIs / Interfaces
- Extend `kubernetesManifestGraph.buildFromYaml(yamlText, options?)` to return richer topology data:
  - `{ nodes, edges, warnings }`
  - Nodes include Kubernetes identity fields.
  - Edges include relationship labels and reasons.
- Extend terminal command API with one small result attachment surface:
  - `desktopTerminal.attachCommandResult(tabId, result)`
  - It stores the result on the existing command session and renders/updates the lower-panel “Show result summary” icon.
- Extend structured command results, where needed, with:
  - `terminalTabId`
  - `manifestContent` or `renderedYaml`
  - optional prebuilt `graph`

## Test Plan
- Graph extraction tests:
  - Deployment -> Service through matching selectors.
  - Ingress -> Service backend.
  - Deployment -> ConfigMap/Secret from env/envFrom/volumes.
  - Deployment -> PVC from volumes.
  - RoleBinding -> ServiceAccount and Role/ClusterRole.
  - Multi-document YAML produces stable nodes and edges.
  - Unknown or partial YAML does not throw and returns warnings/empty graph.

- Modal tests:
  - Graph tab renders visual nodes and edges when graph data exists.
  - Graph tab shows a useful empty state when no Kubernetes resources are found.
  - Clicking a graph node/edge shows relationship details.
  - Existing Summary, Output, Diagnostics, Resources, and Help tabs still render.

- Reopen result tests:
  - Helm/Kubernetes command completion attaches a result to the terminal tab.
  - The lower-panel icon reopens the same result modal after it was closed.
  - Failed commands also get a reopenable result summary.
  - Non-Helm/Kubernetes terminal commands do not show the result-summary icon.
  - Closing the terminal tab removes the reopen entry for v1.

## Assumptions and Defaults
- V1 topology is based on YAML/rendered output only, not live cluster queries.
- The command result modal remains the primary result surface.
- The lower-panel terminal tab is the return path after closing the modal.
- Results are session-scoped and in-memory only for v1.
- No mutating Kubernetes behavior changes are included.
- The implementation stays scoped to Helm/Kubernetes command results and does not alter the Markdown graph.
