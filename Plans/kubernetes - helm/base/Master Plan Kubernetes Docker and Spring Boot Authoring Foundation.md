# Master Plan: Kubernetes, Docker, and Spring Boot Authoring Foundation

## Summary
Build this as a staged capability on top of MD-Editor’s existing YAML editor, YAML language server, Dockerfile language server, snippets, Java project model, Maven/Gradle tooling, and Run configuration system.

The foundation should deliver Kubernetes-aware YAML authoring first: schema-backed IntelliSense, diagnostics, and templates. The first milestones then expand into Docker Compose/Spring Boot presets and safe project commands, without changing unrelated Java, Maven, Gradle, or editor behavior.

## Foundation
- Treat Kubernetes as a YAML specialization, not a new editor type.
- Preserve current `.yaml` / `.yml`, Docker Compose, Dockerfile, Java, Maven, and Gradle behavior.
- Reuse existing app-wide dialog, notification, snippet, language-server, and run configuration patterns.
- Add behavior in small modules where possible; avoid large rewrites of `script.js`, `index.html`, or existing Java tooling.
- Keep offline/local usability in mind: templates should work without network access; schema-backed IntelliSense can use bundled or configured schema references.

## Milestone 1: Kubernetes YAML IntelliSense
- Extend YAML language-server configuration to associate Kubernetes schemas with Kubernetes manifest files.
- Detect Kubernetes manifests by filename and content:
  - Filename hints: `deployment.yaml`, `service.yaml`, `ingress.yaml`, `k8s/*.yaml`, `kubernetes/*.yaml`, `manifests/*.yaml`.
  - Content hints: `apiVersion`, `kind`, `metadata`, `spec`.
- Keep Docker Compose schema association for `docker-compose.yml`, `docker-compose.yaml`, `compose.yml`, and `compose.yaml`.
- Surface YAML LSP diagnostics, hover, completion, and formatting through the existing CodeMirror/LSP path.
- Expected files to change:
  - [desktop-app/resources/js/lsp/server-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/server-registry.js)
  - [desktop-app/tests/lsp-modules.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/lsp-modules.test.js)

## Milestone 2: Kubernetes Templates and Snippets
- Add `yaml` to the editable snippet language list.
- Add built-in Kubernetes snippets for:
  - Deployment
  - Service
  - Ingress
  - ConfigMap
  - Secret
  - Namespace
  - ServiceAccount
  - Job
  - CronJob
  - HorizontalPodAutoscaler
  - Spring Boot Deployment with probes and resource limits
- Add Docker-oriented YAML snippets:
  - Docker Compose Spring Boot app
  - Docker Compose app + PostgreSQL
  - Docker Compose app + Redis
- Ensure snippets remain user-editable via the current snippet settings panel.
- Expected files to change:
  - [desktop-app/resources/js/editor/snippets.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/snippets.js)
  - [desktop-app/tests/snippets.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/snippets.test.js)
  - [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Milestone 3: Kubernetes-Aware File Experience
- Optionally classify Kubernetes YAML files as Kubernetes manifests while still using the `yaml` CodeMirror language.
- Show Kubernetes-specific labels/icons only where the existing language registry already supports this cleanly.
- Do not create a separate `.k8s` file type unless needed later.
- Add outline support improvements only if the current YAML outline is insufficient for common Kubernetes objects.
- Expected files to change:
  - [desktop-app/resources/js/languages/registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/languages/registry.js)
  - [desktop-app/resources/js/outline/languages/yaml.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/outline/languages/yaml.js)
  - [desktop-app/tests/language-registry.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/language-registry.test.js)
  - [desktop-app/tests/outline-syntax-tree.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/outline-syntax-tree.test.js)

## Milestone 4: Spring Boot and Docker Run Presets
- Add run configuration presets rather than replacing existing run configuration types.
- Provide quick presets for:
  - Maven Spring Boot: `spring-boot:run`
  - Gradle Spring Boot: `bootRun`
  - Docker Compose up
  - Docker Compose down
  - Docker Compose logs
- Reuse existing terminal execution and Run output behavior.
- Keep Java Application, Maven, and Gradle configurations compatible with existing saved config data.
- Expected files to change:
  - [desktop-app/resources/js/project/run/run-configuration-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-store.js)
  - [desktop-app/resources/js/project/run/run-configuration-dialog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-dialog.js)
  - [desktop-app/resources/js/project/run/run-configuration-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-editor.js)
  - [desktop-app/resources/js/project/run/run-command-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-command-builder.js)
  - [desktop-app/resources/js/project/run/run-configuration-validation.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-validation.js)

## Milestone 5: Kubernetes Project Commands
- Add safe project commands after the editor/template foundation is stable:
  - Kubernetes dry run
  - Apply active manifest
  - Delete active manifest
  - Explain selected resource or field
- Commands should require a workspace folder and an active Kubernetes YAML file.
- Use the app-wide styled confirmation/notification service for destructive or cluster-affecting actions.
- Do not bundle or install `kubectl` in this milestone; use the user’s existing `kubectl` if available.
- Expected files to change:
  - [desktop-app/resources/js/project/project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
  - New focused module under [desktop-app/resources/js/project](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project)
  - Relevant tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Test Plan
- Unit tests:
  - YAML LSP config associates Kubernetes schemas correctly.
  - Docker Compose schema association remains unchanged.
  - YAML snippets are exposed, editable, overrideable, resettable, and usable as completions.
  - Kubernetes file detection does not misclassify ordinary YAML when no Kubernetes markers exist.
  - Run presets build the expected Maven, Gradle, and Docker Compose commands.

- Smoke tests:
  - Settings still expose YAML and Dockerfile language-server controls.
  - Snippet settings include YAML.
  - Existing Java, Maven, Gradle, and Dockerfile tests continue passing.

- Manual acceptance:
  - Open a Kubernetes manifest and get field completions/diagnostics.
  - Insert a Deployment template from completion.
  - Open Docker Compose YAML and still get Compose-specific schema help.
  - Create and preview Spring Boot Maven/Gradle run presets.
  - Run Docker Compose preset through existing terminal output.

## Assumptions and Defaults
- Default implementation uses existing YAML language-server support.
- Kubernetes schemas are associated through YAML LSP configuration.
- Templates are implemented through the existing snippet registry first.
- Advanced cluster commands are delayed until after authoring support is stable.
- `kubectl`, Docker, Maven, and Gradle are external tools; this plan does not add installers.
- Unrelated dirty worktree changes must be preserved and not reverted.
- Existing public APIs and saved run configurations remain backward compatible.
