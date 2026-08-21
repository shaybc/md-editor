# Milestone 3 Plan: Kubernetes-Aware File Experience

## Summary
Add lightweight Kubernetes awareness on top of existing YAML handling. Kubernetes manifests should still resolve to the `yaml` CodeMirror language and YAML formatter, but the registry can expose optional metadata for labels/icons where callers choose to display it. Improve YAML outline output only enough to make common Kubernetes manifests easier to scan.

## Key Changes
- Add Kubernetes manifest detection helper in the language registry:
  - path hints: `k8s/`, `kubernetes/`, `manifests/`, and common manifest filenames like `deployment.yaml`, `service.yaml`, `ingress.yaml`.
  - content hints: top-level `apiVersion` and `kind`.
- Keep `resolveLanguageForPath(...)` returning the existing YAML language object for `.yaml` / `.yml`.
- Add optional classification metadata without creating a new language:
  - `variantId: "kubernetes"`
  - `variantLabel: "Kubernetes"`
  - optional Kubernetes icon/color only if existing consumers already read such metadata safely.
- Update YAML outline extraction to make Kubernetes manifests more useful:
  - keep the current mapping-key outline behavior for ordinary YAML.
  - when top-level Kubernetes fields are present, include clearer nodes for `kind`, `metadata.name`, and major `spec` sections where already available from the parsed YAML tree.
- Do not create a `.k8s` extension or a separate Kubernetes CodeMirror language.

## Expected files to change:
- [desktop-app/resources/js/languages/registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/languages/registry.js)
- [desktop-app/resources/js/outline/languages/yaml.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/outline/languages/yaml.js)
- [desktop-app/tests/language-registry.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/language-registry.test.js)
- [desktop-app/tests/outline-syntax-tree.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/outline-syntax-tree.test.js)

## Test Plan
- Registry tests:
  - ordinary YAML still resolves as `id: "yaml"` and `codeMirrorLanguage: "yaml"`.
  - Docker Compose YAML still resolves as YAML and is not relabeled as Kubernetes.
  - `C:/Project/k8s/deployment.yaml` receives Kubernetes classification metadata.
  - YAML content with top-level `apiVersion` and `kind` receives Kubernetes classification metadata.
  - ordinary YAML without Kubernetes markers receives no Kubernetes classification metadata.
- Outline tests:
  - existing YAML outline behavior remains intact.
  - Kubernetes manifest outline includes useful entries for `kind`, `metadata.name`, and `spec`.
  - malformed or partial YAML does not throw and falls back to current outline behavior.

## Assumptions and Defaults
- Kubernetes awareness is metadata layered on YAML, not a new language.
- UI label/icon changes are only added where the existing registry consumers can use them without broader UI rewrites.
- No changes to YAML LSP schema association, snippets, run configurations, or project commands in this milestone.
- Existing Docker Compose, generic YAML, formatter, and file-opening behavior must remain unchanged.