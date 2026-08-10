# Redesign `compile_project` to Invoke IDE Rebuild

## Summary

Replace the AI Companion’s separate compiler implementation with the existing IDE **Rebuild Project with Last Options** action.

`compile_project` will accept no model-controlled arguments. It will use the active workspace and saved IDE configuration. If configuration or prior rebuild choices are missing, it will open the normal Build Path and Rebuild dialogs and wait for the user.

## Implementation Changes

- Expose `compile_project` with a closed, argument-free schema and instructions explaining that it invokes the IDE rebuild flow.
- Route the tool through the existing app-action bridge instead of directly launching Maven, Gradle, or `javac` from the AI backend.
- Invoke `rebuild-project-last-options` for configured projects:
  - Maven uses saved test choices and last build-option arguments.
  - Gradle uses its saved rebuild configuration.
  - Standard Java uses its saved `javac` profile.
- Add an AI-only `configureIfMissing` path:
  - Open Java Build Path when no build system is configured.
  - Continue into the normal rebuild dialog after configuration.
  - Open the rebuild dialog when Standard Java lacks a saved `javac` profile.
  - Return unsuccessful if the user cancels either dialog.
- Make the project-command action propagate the provider’s actual success boolean to the bridge.
- Return the existing compile result shape with `success`, duration, and a summary identifying the IDE rebuild. A false result means the rebuild was cancelled or failed; detailed compiler output remains in Problems and Java Rebuild output.
- Preserve execution audit records around the bridged IDE action.
- Remove the compile-only backend descriptor, `buildMode` validation, and direct Maven/Gradle/plain-Java launching that become obsolete.
- Update denied-command suggestions such as `mvn compile` to suggest argument-free `compile_project`.
- Leave `run_tests`, dependency management, manual IDE rebuild commands, and unrelated execution behavior unchanged.
- AI-triggered rebuilds will honor saved IDE settings, including online/offline behavior, rather than overriding them from the AI network policy.

## Interfaces

- Public AI tool remains `compile_project`.
- Input schema:

```json
{
  "type": "object",
  "properties": {},
  "additionalProperties": false
}
```

- Internal app action remains `structured_compile_project`; its renderer implementation invokes the IDE command with fixed internal behavior rather than accepting compiler arguments.
- If the renderer/app-action bridge is unavailable, return a clear tool error without falling back to a separate compiler.

## Test Plan

- Verify the advertised tool has no arguments and clearly describes IDE rebuild behavior.
- Verify an AI tool call dispatches `structured_compile_project` and never invokes the backend compiler broker.
- Verify configured Maven, Gradle, and Standard Java projects rebuild with saved options without opening a dialog.
- Verify missing build-system configuration opens Build Path, then the rebuild dialog, and continues after confirmation.
- Verify a missing Standard Java rebuild profile opens the rebuild dialog.
- Verify cancellation returns an unsuccessful tool result and launches no build.
- Verify successful and failed rebuild booleans propagate through the project command, renderer bridge, and AI result.
- Verify bridge errors and unavailable project providers produce clear failures.
- Verify compile audit entries record allowed, successful, failed, and bridge-error outcomes.
- Verify `run_tests` and other structured execution tools retain their current behavior.

## Expected files to change:

- [application-tool-adapter.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/application-tool-adapter.js)
- [structured-execution-tools.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/tools/structured-execution-tools.js)
- [tool-scope-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/core/tool-scope-registry.js)
- [command-suggestion.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/security/command-suggestion.js)
- [structured-execution-actions.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/structured-execution-actions.js)
- [project-command-menu.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/project-command-menu.js)
- [java-project-provider.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-project-provider.js)
- [ai-execution-security.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/ai-execution-security.test.js)
- [java-project-provider.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-project-provider.test.js)
- A focused structured-execution renderer test under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests)

## Assumptions

- Current IDE support remains Maven, Gradle, and Standard Java (`javac`); Ant support is not added.
- Future project providers become available automatically when they implement the same IDE rebuild contract.
- Configured projects rebuild immediately with saved options; user interaction occurs only when required configuration is missing.
- No additional AI approval dialog is added because this tool delegates to the existing IDE action and preserves its behavior.
