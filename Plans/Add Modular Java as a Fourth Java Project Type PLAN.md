# Add Modular Java as a Fourth Java Project Type

## Summary

Add `Modular Java (JPMS)` alongside Maven, Gradle, and Standard Java for existing projects.

Version 1 will support:

- Module discovery and validation.
- Build, Rebuild, Clean, and `javac` Problems.
- Saved-options `compile_project`.
- Modular Java Application launch.
- External module-path and legacy classpath dependencies.

Version 1 will explicitly disable multi-module JDT, current-file/folder compilation, Javadoc, test execution, and New Project generation. Existing Maven, Gradle, and Standard Java behavior remains unchanged.

Before production edits, use the approved diagnostic-sandbox workflow to create a temporary four-module project, prove the exact `javac` and `java` commands twice, and delete the temporary directory.

## Configuration and Build Path

- Add build-system value `modular`, displayed as `Modular Java (JPMS)`.
- Upgrade `java-build-path.json` schema 10 → 11.
- Add:
  - `modulePathFolders`
  - `modulePathJarFiles`
  - `modulePathOrder`
  - `modularProfile: { outputPath }`
- Continue using `sourceFolders` as module source roots and existing classpath fields for unnamed-module dependencies.
- Add `Scan Modules`, recursively locating `module-info.java` while excluding metadata, vendor, cache, and build-output directories.
- Validate that every source root:
  - Is inside the opened project.
  - Exists and directly contains `module-info.java`.
  - Declares one valid `module` or `open module`.
  - Has a module name unique within the project.
- Present separate Module Path and Classpath sections.
- Save and synchronize configuration immediately so Project commands update without restarting.
- A missing `modularProfile` means the next operation is an initial Build; later operations use saved options.

## Modular Build Implementation

- Add a descriptor model responsible only for scanning, parsing module names and `requires`, validating roots, and associating source files/main classes with modules.
- Add a separate command builder responsible only for quoting and producing deterministic modular commands.
- Compile all configured modules together:

```text
javac
  -d <output>
  --module-source-path <module>=<source-root> ...
  --module <sorted-module-list>
  --module-path <named-and-automatic-modules>
  --class-path <legacy-dependencies>
```

- Add `--add-reads <module>=ALL-UNNAMED` when classpath libraries are configured.
- Output classes under `<output>/<module-name>/...`, defaulting to `classes`.
- Rebuild removes existing `.class` files below the configured output before compilation without deleting unrelated files.
- Clean removes modular class output, diagnostics, rebuild output, and stale build state; “Build after clean” performs a full modular build.
- Publish parsed `javac` diagnostics and a modular build summary.
- Do not use Standard Java’s incremental class-ownership analysis because targeted modular compilation is excluded.

## Commands and Current `compile_project` Contract

- Add Modular Java dispatch to `rebuildProject` and `cleanProject`.
- Support the current AI execution path without modifying AI tooling:

```text
compile_project
→ structured_compile_project
→ rebuild-project-last-options
→ rebuildProject
→ Modular Java rebuild
```

- Honor `useLastOptions: true` and `configureIfMissing: true`:
  - Reuse `modularProfile` when present.
  - Open the modular Build dialog when no profile exists.
- Keep the provider’s direct `compileProject` method consistent by routing Modular Java to a full rebuild.
- Return explicit unsupported errors for Modular Java test execution and test-source requests.
- Disable Compile Current File/Folder and Generate Documentation capabilities.
- Do not change `project-command-menu.js`, structured AI execution tools, or their public contracts.

## Analysis Boundary

- Classify Modular Java separately instead of falling back to Standard Java.
- Mark it as analysis unavailable in the workspace model.
- Disable the Build Path analysis controls and show a clear multi-module JDT-unavailable message.
- On Save or project-type switch, synchronize the workspace and stop any previous JDT session.
- Prevent JDT activation for modular source files without publishing a false failure.
- Modular builds publish `javac` Problems but do not request JDT reanalysis.
- Leave JDT proxy, server-registry, and multi-session routing unchanged; full modular JDT is a separate feature.

## Modular Run Support

- Upgrade Run configuration version 1 → 2.
- Add `java.jpmsModuleName`, migrating existing configurations with an empty value.
- Preserve `java.modulePath`, which currently identifies Maven/Gradle subprojects.
- Show a module selector for Modular Java and associate discovered main classes with their owning module.
- Automatically populate the module when creating a Run configuration from a Java source file.
- Resolve:
  - Module path from compiled output plus configured module-path entries.
  - Classpath from configured legacy entries or `classpathOverride`.
- Launch using:

```text
java
  --module-path <output-and-external-modules>
  --class-path <legacy-dependencies>
  --module <module-name>/<main-class>
```

- Add required `--add-reads` options when the launched project uses the classpath.
- Build-before-run checks `<output>/<module>/<package>/<Class>.class`.
- Missing or stale output triggers the saved-options modular rebuild.

## Test Plan

- Prove the compiler and launcher commands in a disposable four-module sandbox before editing production code.
- Add unit coverage for:
  - Descriptor comments, `open module`, `requires static/transitive`, invalid and duplicate names.
  - Module scanning exclusions and deterministic ordering.
  - Schema migration, persistence, and immediate menu enablement.
  - Windows and Unix command quoting.
  - Module path, classpath, and `--add-reads`.
  - Initial Build, Rebuild, Clean, cancellation, and diagnostics.
  - `configureIfMissing` through the current `compile_project` bridge.
  - Unsupported targeted compilation, Javadoc, and tests.
  - Analysis-unavailable workspace state and no JDT activation.
  - Run configuration migration, module selection, modular launch, and build-before-run.
- Add a four-module fixture matching `client`, `entity`, `repository`, and `service`.
- Verify it builds without “too many module declarations found” and emits output under `classes/<module>`.
- Run focused Java/Run tests, JavaScript syntax checks, then the complete desktop unit suite.
- Confirm the worktree diff contains no unrelated changes.

## Expected files to change:

Production:

- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/resources/js/project/java-build-path.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-build-path.js)
- [desktop-app/resources/js/project/java-build-path-save-confirmation.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-build-path-save-confirmation.js)
- [desktop-app/resources/js/project/java-project-provider.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-project-provider.js)
- [desktop-app/resources/js/project/java-rebuild-dialog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-rebuild-dialog.js)
- [desktop-app/resources/js/project/java-clean-dialog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-clean-dialog.js)
- [desktop-app/resources/js/project/modular-java/module-model.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/modular-java/module-model.js) — new.
- [desktop-app/resources/js/project/modular-java/command.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/modular-java/command.js) — new.
- [desktop-app/resources/js/project/java-analysis-scope/inventory.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/java-analysis-scope/inventory.js)
- [desktop-app/resources/js/lsp/java-workspace-model.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/java-workspace-model.js)
- [desktop-app/resources/js/lsp/java-workspace-controller.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/lsp/java-workspace-controller.js)
- [desktop-app/resources/js/project/run/run-configuration-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-store.js)
- [desktop-app/resources/js/project/run/run-configuration-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-editor.js)
- [desktop-app/resources/js/project/run/run-configuration-dialog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-dialog.js)
- [desktop-app/resources/js/project/run/run-configuration-validation.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-validation.js)
- [desktop-app/resources/js/project/run/java-runtime-classpath.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/java-runtime-classpath.js)
- [desktop-app/resources/js/project/run/run-command-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-command-builder.js)
- [desktop-app/resources/js/project/run/run-build-before-launch.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-build-before-launch.js)
- [desktop-app/resources/js/project/run/run-launcher.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-launcher.js)

Tests:

- [desktop-app/tests/java-modular-model.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-modular-model.test.js) — new.
- [desktop-app/tests/java-modular-command.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-modular-command.test.js) — new.
- [desktop-app/tests/java-build-path.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-build-path.test.js)
- [desktop-app/tests/java-project-provider.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-project-provider.test.js)
- [desktop-app/tests/java-rebuild-dialog.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-rebuild-dialog.test.js)
- [desktop-app/tests/java-clean-dialog.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-clean-dialog.test.js)
- [desktop-app/tests/java-analysis-inventory.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-analysis-inventory.test.js)
- [desktop-app/tests/java-workspace-model-analysis-scope.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-workspace-model-analysis-scope.test.js)
- [desktop-app/tests/java-workspace-controller.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-workspace-controller.test.js)
- [desktop-app/tests/run-configuration.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/run-configuration.test.js)
- [desktop-app/tests/java-runtime-classpath.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/java-runtime-classpath.test.js)
- [desktop-app/tests/run-launcher.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/run-launcher.test.js)

## Assumptions and intentionally unchanged behavior

- Existing-project support only; New Project generation is deferred.
- All configured modules are built together.
- External module-path entries may be named or automatic modules.
- Legacy classpath access is enabled through `--add-reads`.
- Maven, Gradle, Standard Java, Javadoc, targeted compilation, tests, JDT proxy internals, AI structured-execution tools, and New Project templates remain unchanged.
