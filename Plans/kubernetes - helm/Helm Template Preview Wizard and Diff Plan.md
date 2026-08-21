# Helm Template Preview Wizard and Diff Plan

## Summary
Add a JetBrains-style Helm template preview workflow to MD-Editor. The feature will open a dedicated render wizard, let users choose full-chart or active-template rendering, add multiple values files and comma-separated `--set` overrides, run `helm template`, then open a read-only compare tab with the original template/source on the left and rendered YAML on the right.

## Key Changes
- Add a `Render Helm Template` wizard for Helm commands:
  - Mode selector: `Active template` and `Full chart`.
  - Values files list with Add/Remove controls; Add uses the existing desktop file picker with multi-selection and YAML filters.
  - Additional values input for comma-separated `key=value` pairs, passed as one `--set` argument.
  - Read-only command preview that updates as mode/files/overrides change.
  - Uses existing app modal/button patterns and the UI/UX dialog guidance.

- Extend Helm command behavior:
  - Add command IDs `helm-preview-template` and `helm-preview-chart`.
  - Build `helm template <release> <chartRoot>` with repeated `--values <path>` args.
  - For active-template mode, include `--show-only <templateRelativePath>`.
  - Include `--set <commaSeparatedValues>` when provided.
  - Preserve current `helm-template-chart` and `helm-template-active-file` commands unless we explicitly route their menu labels through the new wizard.

- Open rendered output in the existing compare viewer:
  - Reuse `tabsModule.openFileCompareInTab`.
  - Compare descriptor is read-only.
  - Left side:
    - Active-template mode: active template file content.
    - Full-chart mode: `Chart.yaml` or a generated chart summary source labeled as the chart source.
  - Right side: rendered Helm YAML from stdout.
  - Title format: `Helm preview: <chart or template name>`.

- Wire UI entrypoints:
  - Add Project > Helm menu entries for `Preview Active Template...` and `Preview Chart...`.
  - Existing render commands can remain as quick render-to-tab commands.
  - Optional gutter icon for Helm template files should call `helm-preview-template`; if there is no established gutter-action extension point for project commands, defer gutter UI and keep menu/context-menu entrypoints for v1.

## Public APIs / Interfaces
- Add `helmTemplatePreviewDialog.open(initialOptions)` returning:
  - `{ mode, valuesFiles, setValues, chartRoot, templateRelativePath }` or `null`.
- Extend `helmProjectCommands`:
  - `buildHelmCommand(commandName, context)` supports `valuesFiles`, `setValues`, and active-template `--show-only`.
  - `execute("helm-preview-template" | "helm-preview-chart", context)` opens the wizard, runs Helm, and opens a read-only compare tab.
- Add dependency wiring from `script.js`:
  - `templatePreviewDialog`
  - `openFileCompareInTab`
  - file picker/read-file dependencies needed by the wizard and compare source loading.

## Test Plan
- Helm command tests:
  - Builds full chart preview command without values.
  - Builds active template command with `--show-only`.
  - Repeats `--values` for multiple selected files.
  - Adds exactly one `--set` argument for comma-separated inline values.
  - Quotes paths and values safely.
  - Canceling the wizard does not run Helm.

- Preview workflow tests:
  - Successful render opens a read-only `file-compare` tab.
  - Active-template preview compares original template content to rendered YAML.
  - Full-chart preview compares chart source/summary to rendered YAML.
  - Helm failure returns structured result and opens the result modal instead of a compare tab.
  - Missing Helm executable produces the existing missing-tool diagnostic.

- UI/script smoke tests:
  - New dialog script and CSS load before Helm command registration.
  - Project > Helm exposes preview commands.
  - Existing Helm render, lint, dependency, Kubernetes dry-run tests still pass.

## Assumptions
- V1 implements both full-chart and active-template preview entrypoints.
- V1 supports multiple values files and comma-separated `--set` overrides.
- `--set-string`, `--set-file`, and `--set-json` are out of scope for v1.
- The preview output is read-only and does not write rendered YAML to the workspace.
- The existing compare tab is the canonical diff viewer; no new diff renderer should be built.
