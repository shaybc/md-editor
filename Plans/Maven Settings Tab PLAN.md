# Maven Settings Tab

## Summary

Add a top-level **Maven** settings tab immediately above **Gradle**, using a `bi-stack` icon. It will control every Maven process launched by MD-Editor:

1. **Maven execution mode**
   - Automatic — nearest project wrapper, then system Maven.
   - Maven wrapper only.
   - System Maven.
   - Custom executable, with a file picker.
2. **User settings file** — optional `settings.xml`, with browse and clear actions.
3. **Offline work** — default offline state for Maven operations.
4. **Local repository** — optional Maven repository folder, with browse and clear actions.

Persist these as global settings:

- `mavenExecutionMode: "auto"`
- `mavenExecutablePath: ""`
- `mavenSettingsFilePath: ""`
- `mavenOffline: false`
- `mavenLocalRepositoryPath: ""`

Existing users receive these defaults without a migration. Import/export automatically includes them through the existing global-settings system.

## Command Behavior

| Setting | Maven command impact |
|---|---|
| Execution mode | Selects the executable used for every app-launched Maven process. Automatic searches upward for `mvnw.cmd`/`mvnw` within the open project, then falls back to `mvn.cmd`/`mvn`. Wrapper-only produces an actionable error when unavailable. |
| User settings file | Adds `--settings "<path>"` before Maven goals. Maven handles mirrors, proxies, credentials, profiles, and repositories from that file. MD-Editor stores only the path and never reads or copies its credentials. |
| Offline work | Adds `--offline` by default. Operations offering an explicit per-run choice can override the saved default in either direction. |
| Local repository | Adds `"-Dmaven.repo.local=<path>"`, affecting dependency/plugin reads and downloads. |

Create a small canonical Maven runtime module responsible for configuration normalization, wrapper discovery, runner selection, common arguments, quoting, and actionable configuration errors. Existing command builders will consume it instead of independently choosing Maven.

Apply the settings to:

- Maven compile, clean, rebuild, package, tests, Spotless, effective-POM and arbitrary-goal commands.
- Java run build-before-launch and runtime classpath calculation.
- Maven source/build-path discovery and reactor analysis.
- Javadoc Maven commands.
- RAT Maven commands.
- Java code conversion dependency/classpath discovery.
- Maven dependency graph/runtime-tree operations.
- Generated Maven recovery scripts.
- Kotlin Maven model discovery, while preserving its deliberately isolated Kotlin model repository.

### Override rules

- Maven Build Options gains an invocation-only **Work offline** checkbox initialized from the global default. Checking or clearing it overrides the default for that invocation.
- Remove `-o`, `--offline`, `-s`, `--settings`, and `-Dmaven.repo.local` from permitted Advanced Maven Arguments so configuration has one unambiguous source.
- The Java converter’s existing **Resolve Maven dependencies** checkbox is the per-conversion override: checked permits online resolution; unchecked runs Maven offline. Its initial value is derived from the global offline default.
- Commands without a per-operation override use the global offline value directly.

### Maven recovery

Resolve and snapshot the current Maven configuration when generating the recovery batch file:

- Embed the resolved executable, including an absolute wrapper or custom executable path.
- Embed `--settings`, `--offline`, and `-Dmaven.repo.local` in both dependency-tree and copy-dependencies calls.
- Quote all paths safely for Windows batch execution.
- Existing recovery scripts remain unchanged if settings later change.
- Block generation with an actionable message if the selected wrapper/custom executable or configured paths are unavailable.

## Interfaces and Implementation

- Add `registerMarkdownViewerMavenRuntimeSettings` with:
  - `getConfiguration()`
  - `resolveRunner({ projectRoot, pomPath, platform })`
  - `getInvocationArguments({ offlineOverride })`
  - `buildInvocation({ projectRoot, pomPath, goals, offlineOverride })`
- Extend internal bridge requests with normalized Maven configuration rather than having each bridge infer Maven independently.
- Add Java converter CLI support for the resolved Maven executable, settings file, and local repository. Represent these with a dedicated `MavenDiscoveryOptions` record; derive its offline value from the existing dependency-resolution option.
- Pass Maven execution/settings/offline configuration into Kotlin model discovery. Do not pass the configured local repository override into Kotlin’s effective-POM/classpath export because its isolated cache is intentional.
- Validate selected files/folders when saving and again before execution to catch imported or subsequently removed paths. System Maven and project wrappers are validated when a project operation resolves them.
- Add the Maven settings to the AI settings-tool registry under the `maven` category.
- Keep implementation modular: `script.js` handles settings-screen wiring and persistence, while Maven resolution and command semantics remain in the new runtime module.

## Test Plan

- Verify the Maven tab appears immediately above Gradle and all controls load, save, import, export, browse, clear, and reset correctly.
- Test all execution modes on Windows and non-Windows, wrapper search boundaries, paths containing spaces, missing wrappers, and missing custom executables.
- Verify common arguments are applied exactly once and before goals across compile, clean, rebuild, Javadoc, RAT, runtime classpath, reactor discovery, and graph commands.
- Verify global offline defaults and explicit online/offline overrides.
- Verify conflicting advanced arguments are rejected.
- Verify recovery scripts snapshot the selected configuration and quote Windows paths correctly.
- Verify converter CLI propagation and local repository discovery.
- Verify Java and Node bridges receive and honor Maven configuration.
- Verify Kotlin honors executable/settings/offline while retaining its isolated repository.
- Run the focused JavaScript test suites and the Java converter Maven tests, followed by the desktop test suite.

## Expected files to change:

### Settings and shared command configuration

- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/js/project/maven-runtime-settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/maven-runtime-settings.js) — new
- [desktop-app/resources/js/project/maven-project-detection.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/maven-project-detection.js)
- [desktop-app/resources/js/project/maven-build-command.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/maven-build-command.js)
- [desktop-app/resources/js/project/maven-build-options/index.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/maven-build-options/index.js)
- [desktop-app/resources/js/project/maven-build-options/advanced-arguments.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/maven-build-options/advanced-arguments.js)

### Maven consumers

- [desktop-app/resources/js/project/java-project-provider.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-project-provider.js)
- [desktop-app/resources/js/project/run/run-command-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-command-builder.js)
- [desktop-app/resources/js/project/run/run-build-before-launch.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-build-before-launch.js)
- [desktop-app/resources/js/project/run/java-runtime-classpath.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/java-runtime-classpath.js)
- [desktop-app/resources/js/project/javadoc/command.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/javadoc/command.js)
- [desktop-app/resources/js/rat/project-context.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/rat/project-context.js)
- [desktop-app/resources/js/rat/command-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/rat/command-builder.js)
- [desktop-app/resources/js/graph/maven-recovery.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/graph/maven-recovery.js)
- [desktop-app/resources/js/project/java-analysis-scope/maven-module-inventory.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-analysis-scope/maven-module-inventory.js)

### Bridges and converter

- [desktop-app/resources/bridges/lsp-proxy-common/maven-invocation.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/lsp-proxy-common/maven-invocation.cjs) — new shared bridge helper
- [desktop-app/resources/bridges/java-project-detection-bridge/java-project-detection-bridge.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/java-project-detection-bridge/java-project-detection-bridge.cjs)
- [desktop-app/resources/js/lsp/server-registry.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/server-registry.js)
- [desktop-app/resources/bridges/kotlin-adapter-bridge/kotlin-adapter-bridge.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/kotlin-adapter-bridge/kotlin-adapter-bridge.cjs)
- [desktop-app/resources/bridges/kotlin-adapter-bridge/maven-model-exporter.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/kotlin-adapter-bridge/maven-model-exporter.cjs)
- [desktop-app/converters/java_converter/src/main/java/com/mdeditor/javaconverter/Main.java](C:/GitHub/shaybc/md-editor/desktop-app/converters/java_converter/src/main/java/com/mdeditor/javaconverter/Main.java)
- [desktop-app/converters/java_converter/src/main/java/com/mdeditor/javaconverter/MavenDiscoveryOptions.java](C:/GitHub/shaybc/md-editor/desktop-app/converters/java_converter/src/main/java/com/mdeditor/javaconverter/MavenDiscoveryOptions.java) — new
- [desktop-app/converters/java_converter/src/main/java/com/mdeditor/javaconverter/ProjectScanner.java](C:/GitHub/shaybc/md-editor/desktop-app/converters/java_converter/src/main/java/com/mdeditor/javaconverter/ProjectScanner.java)

### Tests and documentation

- Add or update focused tests under [desktop-app/tests](C:/GitHub/shaybc/md-editor/desktop-app/tests), particularly Maven runtime, detection, commands, build options, recovery, RAT, Javadoc, runtime classpath, bridge, Kotlin, and run-configuration tests.
- Update Java converter coverage in [JavaConverterIntegrationTest.java](C:/GitHub/shaybc/md-editor/desktop-app/converters/java_converter/src/test/java/com/mdeditor/javaconverter/JavaConverterIntegrationTest.java).
- Update [help/user/maven-build-options.md](C:/GitHub/shaybc/md-editor/desktop-app/resources/help/user/maven-build-options.md) to explain global Maven settings and per-run overrides.

## Assumptions

- “Every Maven command” means commands executed by MD-Editor. Literal Maven examples written into generated project README files remain unchanged.
- Automatic mode searches for a wrapper only within the active project/workspace boundary.
- Configured settings and repository paths must already exist; MD-Editor does not create repositories or edit `settings.xml`.
- No unrelated Gradle, Java, converter, recovery, or settings behavior will be refactored or changed.
