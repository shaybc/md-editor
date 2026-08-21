# Milestone 6 Plan: Helm Chart Authoring and Safe Kubernetes Rendering

## Summary
Add Helm-aware authoring support on top of the existing YAML, Kubernetes, Project command, terminal, and tab systems. The core workflow is: detect Helm charts, lint/render charts with the user’s installed `helm`, open rendered YAML in a new unsaved YAML editor tab, and only run Kubernetes dry-run against rendered output. Do not apply/delete raw Helm templates with `kubectl`.

## Key Changes
- Add a focused Helm command module under `desktop-app/resources/js/project/` exposing:
  - `canExecute(commandName, context)`
  - `execute(commandName, context)`
  - `buildHelmCommand(commandName, context)`
  - `findChartRoot(context)`
  - `isHelmChart(context)`
- Support command IDs:
  - `helm-lint-chart`: `helm lint <chartRoot>`
  - `helm-template-chart`: `helm template <releaseName> <chartRoot>`
  - `helm-template-active-file`: `helm template <releaseName> <chartRoot> --show-only <templateRelativePath>`
  - `helm-dependency-update`: `helm dependency update <chartRoot>`
  - `helm-render-kubernetes-dry-run`: render chart, open rendered YAML tab, then run `kubectl apply --dry-run=client -f -` using rendered output through the terminal path if supported; otherwise show a clear app notification.
- Detect Helm charts by walking up from the active file/folder until `Chart.yaml` is found.
- Treat files under `templates/*.yaml`, `templates/*.yml`, `_helpers.tpl`, `values.yaml`, and `Chart.yaml` as Helm chart context.
- Add a **Project > Helm** submenu with disabled-by-default command buttons.
- Register the Helm command module from `script.js`, passing active folder, active file, active editor content, terminal, app-wide alert/confirm, file read/directory helpers, and `tabsModule.newTab`.
- Load `helm-project-commands.js` in `index.html` before `project-command-menu.js`.
- Update `project-command-menu.js` so `helm-*` commands dispatch like `kubernetes-*` commands and do not require Java/Maven/Gradle providers.

## Editor Support
- Add lightweight Helm template awareness without creating a new editor type:
  - Helm YAML still uses CodeMirror `yaml`.
  - `_helpers.tpl` and `templates/*.yaml` remain editable text/YAML files.
- Add Helm completions in the existing CodeMirror completion path:
  - `.Values.*` completions from parsed `values.yaml`.
  - `include "chart.templateName" .` completions from `define` blocks in `_helpers.tpl`.
- Add a small Helm helper module for parsing:
  - values paths from `values.yaml`
  - named templates from `_helpers.tpl`
  - template-relative paths for `--show-only`
- Do not suppress all YAML diagnostics globally. Instead, for Helm template files, add a clear notification/diagnostic hint that full Kubernetes validation requires rendering.

## Rendered Output Behavior
- `helm-template-chart` and `helm-template-active-file` capture terminal output.
- On success, open a new unsaved editor tab titled:
  - `helm-template.yaml`
  - or `<template-name>.rendered.yaml`
- The tab content is the rendered YAML, opened in editor mode and resolved as YAML/Kubernetes by existing language registry behavior.
- On nonzero exit, keep output in the terminal tab and show app-wide alert: `helm exited with code <code>.`
- Do not write rendered YAML to the workspace unless the user later saves the unsaved tab manually.

## Expected files to change:
- [desktop-app/resources/js/project/helm-project-commands.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/helm-project-commands.js)
- [desktop-app/resources/js/project/helm-chart-context.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/helm-chart-context.js)
- [desktop-app/resources/js/project/project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
- [desktop-app/resources/js/ui/application-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ui/application-menu.js)
- [desktop-app/resources/js/editor/codemirror-bundle-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-bundle-source.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/tests/helm-project-commands.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/helm-project-commands.test.js)
- [desktop-app/tests/helm-chart-context.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/helm-chart-context.test.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Test Plan
- Unit tests:
  - Finds chart root from `Chart.yaml`, `values.yaml`, `templates/deployment.yaml`, and `_helpers.tpl`.
  - Does not enable Helm commands outside a chart.
  - Builds expected `helm lint`, `helm template`, `helm template --show-only`, and `helm dependency update` commands.
  - Uses a default release name derived from chart folder name, sanitized to Helm-safe lowercase.
  - Opens rendered YAML in a new unsaved tab on successful template commands.
  - Reports app notifications on nonzero Helm exits.
  - Extracts `.Values.*` completion paths from nested `values.yaml`.
  - Extracts named templates from `_helpers.tpl`.
- Smoke tests:
  - `index.html` loads Helm command scripts before `project-command-menu.js`.
  - Project menu exposes all Helm command IDs.
  - `project-command-menu.js` dispatches `helm-*` commands without project providers.
  - CodeMirror source includes Helm completion hook for YAML/Helm files.
- Syntax checks:
  - `node --check` on all changed JS modules.
- Focused tests:
  - `node --test desktop-app\tests\helm-project-commands.test.js`
  - `node --test desktop-app\tests\helm-chart-context.test.js`
  - `node --test desktop-app\tests\migration-smoke.test.js`

## Assumptions and Defaults
- Use the user’s installed `helm`; do not bundle, install, or auto-detect Helm in this milestone.
- Helm commands require a workspace folder and a discoverable `Chart.yaml`.
- Default release name is the chart folder name normalized to lowercase alphanumeric hyphen form.
- Rendered YAML opens in a new unsaved editor tab by default.
- `kubectl apply/delete` remains disabled for raw Helm templates; Kubernetes dry-run should use rendered output.
- No changes are made to existing Kubernetes snippets, YAML schema association, Docker Compose behavior, Java/Maven/Gradle providers, or saved Run configurations.
