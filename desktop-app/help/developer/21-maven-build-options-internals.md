---
tags:
  - maven
  - java
  - internals
---
# Maven Build Options Internals

The Maven Build Options system separates option definitions, invocation state, DOM rendering, and command execution.

## Modules

- `resources/js/project/maven-build-options/catalog.js` registers providers, validates descriptors, and produces deterministic option ordering.
- `resources/js/project/maven-build-options/session.js` owns values, requirements, conflicts, persistence patches, advanced-argument state, warnings, and Maven arguments for one dialog invocation.
- `resources/js/project/maven-build-options/panel.js` renders grouped controls, the advanced-arguments field, and routes help through the application notification service.
- `resources/js/project/maven-build-options/index.js` registers the built-in test descriptors, enriches provider context with static plugin inspection, and exposes the composed API.
- `resources/js/project/maven-build-options/advanced-arguments.js` tokenizes and validates invocation-only Maven CLI arguments before they can enter the command preview.
- `resources/js/project/maven-build-options/compiler-warning-provider.js` contributes invocation-only Maven Compiler Plugin warning controls without adding dialog-specific logic.
- `resources/js/project/maven-build-options/maven-plugin-inspector.js` reads local POM files and reports supported Maven plugin declarations without running Maven.
- `resources/js/project/maven-build-options/plugin-aware-provider.js` turns detected plugins into invocation-only skip options.

`java-rebuild-dialog.js` coordinates a session and command preview. It does not define Maven option semantics. `java-project-provider.js` persists the session's project patch and executes the resolved arguments.

## Provider contract

Register a provider through:

```js
mavenBuildOptions.registerProvider({
  id: "provider-id",
  async getOptions(context) {
    return [];
  }
});
```

Opening the dialog supplies the detected project root, POM, Maven runner, and `pluginSummary` as context. Providers must inspect only the supplied context and must not run Maven, write files, or retain stale project state.

A descriptor supplies a stable ID, ordered group, label, persistence, relationships, reserved Maven argument keys, and a pure `getArguments(value, values)` function. Boolean options are the only supported input type in the foundation release.

## Session lifecycle

1. The catalog resolves all providers for the current project.
2. Project-persistent values are loaded through descriptor `storagePath` values.
3. Invocation-only values start from their defaults.
4. The panel updates the session; requirements are enabled and dependents are disabled as needed.
5. The session resolves a deterministic argument list and persistence patch.
6. Valid advanced arguments are appended after catalog arguments.
7. The dialog uses that list for its preview.
8. On confirmation, the provider saves only the persistence patch and executes the same arguments.

The current test descriptors map to the existing `maven.compileTests` and `maven.runTests` fields, so no Java build-path schema migration is required. The forced-update descriptor and plugin skip descriptors have invocation persistence and can never enter the saved patch. Plugins found only through `pluginManagement` or profiles remain enabled, but their descriptors carry uncertainty badges and warnings because the skip flag is harmless when Maven does not execute that plugin.

## Command compatibility

`mavenBuildCommand.buildCommand()` accepts `optionArguments`. If that array is absent, the legacy `compileTests`, `runTests`, and `skipRat` inputs remain supported for existing callers and tests.

Argument order is application goals, test policy, remaining catalog groups, dependency/update flags, then validated advanced arguments. Advanced arguments use descriptor `reservedArguments` to prevent conflicting sources of truth.

## Extension rules

- Plugin detection belongs in a provider, not the dialog.
- Help must use the application notification service, never native dialogs.
- Audit bypasses must remain invocation-only and visibly labeled.
- Option semantics must remain pure and independently testable.
- The preview and executed command must originate from the same resolved argument array.
