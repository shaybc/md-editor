# Milestone 5 Plan: Kubernetes Project Commands

## Summary
Add safe `kubectl` project commands for active Kubernetes YAML manifests. Commands must require an open workspace and active Kubernetes YAML file, run through the existing terminal output path, and use the app-wide confirmation/notification service for cluster-affecting actions.

## Key Changes
- Add a focused Kubernetes command module under `desktop-app/resources/js/project/` that exposes:
  - `canExecute(commandName, context)`
  - `execute(commandName, context)`
  - `buildKubectlCommand(commandName, context)`
  - `isKubernetesManifest(context)`
- Support four command IDs:
  - `kubernetes-dry-run`: `kubectl apply --dry-run=client -f <activeFile>`
  - `kubernetes-apply`: `kubectl apply -f <activeFile>`
  - `kubernetes-delete`: `kubectl delete -f <activeFile>`
  - `kubernetes-explain`: `kubectl explain <selectedResourceOrField>`
- Detect valid manifests only for `.yaml` / `.yml` files using existing Kubernetes path/content hints.
- Wire Project menu availability and dispatch so Kubernetes commands do not require a Java/Maven/Gradle provider.
- Add a Kubernetes submenu to the Project menu with disabled-by-default command buttons.
- Register the new module from `script.js`, passing active folder, active file, editor content, selected text, terminal, app-wide confirm, and app-wide alert dependencies.
- Load the new script in `index.html` before `project-command-menu.js`.

## Expected files to change:
- [desktop-app/resources/js/project/project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
- [desktop-app/resources/js/project/kubernetes-project-commands.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/kubernetes-project-commands.js)
- [desktop-app/resources/js/ui/application-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ui/application-menu.js)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/tests/kubernetes-project-commands.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/kubernetes-project-commands.test.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Test Plan
- Unit tests:
  - Kubernetes manifest detection accepts path hints and content markers.
  - Ordinary YAML does not enable Kubernetes commands.
  - Commands require a workspace folder and active manifest file.
  - Dry run builds `kubectl apply --dry-run=client -f <file>`.
  - Apply/delete build expected `kubectl` commands and request confirmation.
  - Delete uses destructive confirmation styling.
  - Explain uses selected text when valid, otherwise falls back to manifest `kind`, then `pod`.
  - Nonzero terminal exit returns `false` and reports an app notification.
- Smoke tests:
  - `index.html` loads `kubernetes-project-commands.js` before `project-command-menu.js`.
  - Project menu exposes all four Kubernetes command IDs.
- Commands to run:
  - `node --check desktop-app\resources\js\project\kubernetes-project-commands.js`
  - `node --check desktop-app\resources\js\project\project-command-menu.js`
  - `node --check desktop-app\resources\js\ui\application-menu.js`
  - `node --check desktop-app\resources\js\script.js`
  - `node --test desktop-app\tests\kubernetes-project-commands.test.js`
  - `node --test desktop-app\tests\migration-smoke.test.js`

## Assumptions and Defaults
- Use the user’s installed `kubectl`; do not bundle, install, or detect it ahead of execution.
- Apply and delete are cluster-affecting and must ask for confirmation.
- Dry run and explain do not require confirmation.
- All command output goes through the existing terminal/run-output behavior.
- No changes are made to YAML IntelliSense, snippets, outline behavior, or Run configuration presets.
