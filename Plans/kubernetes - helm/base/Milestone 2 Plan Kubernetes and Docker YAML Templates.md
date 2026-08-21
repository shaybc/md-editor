# Milestone 2 Plan: Kubernetes and Docker YAML Templates

## Summary
Add YAML as a first-class editable snippet language and ship built-in templates for Kubernetes manifests, Spring Boot Kubernetes deployment, and Docker Compose microservice presets. Implement this through the existing snippet registry and CodeMirror snippet completion path, without creating a new editor type or changing unrelated language-server behavior.

## Key Changes
- Add `yaml` to the snippet language list exposed by the snippet settings UI.
- Add a `YAML_SNIPPETS` builtin collection with these IDs:
  - `kubernetes-deployment`
  - `kubernetes-service`
  - `kubernetes-ingress`
  - `kubernetes-configmap`
  - `kubernetes-secret`
  - `kubernetes-namespace`
  - `kubernetes-serviceaccount`
  - `kubernetes-job`
  - `kubernetes-cronjob`
  - `kubernetes-hpa`
  - `spring-boot-kubernetes-deployment`
  - `docker-compose-spring-boot`
  - `docker-compose-spring-postgres`
  - `docker-compose-spring-redis`
- Use existing snippet object shape only: `{ id, label, detail, type, template, enabled }`.
- Use CodeMirror-compatible placeholder names such as `${appName}`, `${image}`, `${port}`, `${database}`.
- Enable YAML snippet completions in the existing CodeMirror snippet completion allowlist.
- Keep all snippets user-editable, overrideable, resettable, disableable, and custom-snippet compatible through the current preferences model.

## Expected files to change:
- [desktop-app/resources/js/editor/snippets.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/snippets.js)
- [desktop-app/resources/js/editor/codemirror-bundle-source.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/editor/codemirror-bundle-source.js)
- [desktop-app/tests/snippets.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/snippets.test.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Test Plan
- Unit tests:
  - `getSupportedLanguages()` includes `yaml` in the expected order.
  - `getDefaultSnippets("yaml")` includes Kubernetes, Spring Boot, and Docker Compose templates.
  - Every YAML builtin has a non-empty template.
  - YAML builtin snippets can be overridden and reset.
  - YAML custom snippets can be added and returned by `getCompletionSnippets("yaml")`.
  - Disabled YAML snippets are omitted from completion results.
- Smoke tests:
  - Snippet settings still expose the snippet language selector and template editor.
  - Registry source includes the YAML language entry and representative YAML snippet IDs.
  - CodeMirror source allows YAML in `getSnippetCompletionSource`.
- Run:
  - `node --test desktop-app\tests\snippets.test.js`
  - `node --test desktop-app\tests\migration-smoke.test.js`

## Assumptions and Defaults
- Templates are static/offline and require no network access.
- YAML snippets apply to all YAML files; Kubernetes-specific filtering is not added in this milestone.
- Docker Compose snippets are YAML snippets, not a separate snippet language.
- Existing JavaScript, TypeScript, Java, Python, and C# snippet behavior must remain unchanged.
- No changes are made to Kubernetes schema detection, run configurations, project commands, or YAML outline behavior in this milestone.
