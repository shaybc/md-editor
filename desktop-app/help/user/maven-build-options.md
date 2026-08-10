---
tags:
  - maven
  - java
  - build
---
# Maven Build Options

Global Maven execution is configured under **Settings > Maven**. The selected wrapper/system/custom executable, optional settings.xml, offline default, and local repository are applied to Maven discovery, builds, conversion, Javadoc, RAT, run configurations, and dependency recovery.

The **Work offline** build option is initialized from the global Maven setting and can be changed for the current invocation. Advanced Maven Arguments cannot override offline mode, the settings file, or the local repository; configure those values in Settings so every Maven workflow uses the same source.

MD-Editor shows Maven Build Options when a Java project uses Maven and you choose **Project > Rebuild Project**. These controls change the rebuild command shown in the dialog; they do not edit `pom.xml`.

## Tests

- **Compile tests** includes test-source compilation. Disabling it adds `-Dmaven.test.skip=true`, so Maven neither compiles nor runs tests.
- **Run tests** executes tests during `package`. Disabling it while compilation remains enabled adds `-DskipTests`.

Running tests requires compiling them. MD-Editor therefore enables **Compile tests** when you enable **Run tests**, and disables **Run tests** if you turn compilation off. These two choices are remembered for the project.

## Dependency resolution

- **Force Maven dependency updates (-U)** adds Maven's `-U` flag for this rebuild only. Use it when Maven says a failed lookup was cached, when a repository may have recovered, or when snapshot/plugin metadata should be checked again. It does not edit `pom.xml`, fix wrong coordinates, or make unavailable artifacts exist.

## Compiler warnings

- **Do not show Java compiler warnings during this rebuild** adds `-Dmaven.compiler.showWarnings=false` for this rebuild only.
- **Suppress deprecation warnings (-Xlint:-deprecation)** adds a temporary javac lint suppression for deprecation warnings.
- **Suppress unchecked warnings (-Xlint:-unchecked)** adds a temporary javac lint suppression for unchecked conversion and raw-type warnings.

These controls are disabled by default and reset after the rebuild dialog closes. They hide or reduce warning output; they do not fix the source code or change project compiler policy.

## Detected plugin bypasses

When static POM inspection finds supported Maven plugins, MD-Editor shows one-run bypass options for that project, such as **Skip Apache RAT for this rebuild**, **Skip Checkstyle for this rebuild**, **Skip SpotBugs for this rebuild**, **Skip PMD for this rebuild**, **Skip JaCoCo for this rebuild**, or **Skip OWASP Dependency Check for this rebuild**.

These options add the matching Maven property to the current command only, for example `-Drat.skip=true` or `-Dcheckstyle.skip=true`. A Quick Fix may open this dialog with a bypass already selected when the selected problem proves the plugin is involved, such as an Apache RAT finding. They are bypasses, not fixes:

- They do not edit `pom.xml`.
- They do not change project policy.
- They do not resolve the underlying plugin finding.
- They reset the next time the rebuild dialog opens.

If a plugin is found only in `pluginManagement` or inside a Maven profile, MD-Editor still allows the skip option but marks it as uncertain. The command flag is useful if Maven does execute that plugin; if Maven does not execute it, the property has no effect. Use [Apache RAT License Audit](apache-rat-license-audit.md) when you need to investigate and resolve a RAT finding.

Use **Inspect effective Maven configuration...** when plugin activation is unclear. Maven's effective POM shows the project model after parent POMs, `pluginManagement`, active profiles, inheritance, and Maven settings are combined. The rebuild dialog minimizes while the read-only terminal command runs, then restores and refreshes plugin certainty for the current rebuild dialog session. The terminal remains open with the full output. This inspection does not build, package, save, or edit files; the adjacent info button explains what the inspection means.

## Spotless format fixes

When a Problems entry comes from Spotless, Quick Fix may offer **Run Spotless apply for this module...**. This runs `mvn spotless:apply` with the detected Maven runner and nearest module `pom.xml`. Spotless can rewrite more than the clicked file, so review the Git diff before committing. This action does not change Maven Build Options and does not run until you choose it from Quick Fix.

## Advanced Maven arguments

Use **Advanced Maven arguments** for temporary Maven CLI options that should apply only to the current rebuild, such as `-Pdev`, `-pl module-a -am`, `-T 2C`, `-o`, or `-Dname=value`. Use **Force Maven dependency updates (-U)** instead of typing `-U` here.

MD-Editor validates this field before enabling **Build**:

- Maven goals and lifecycle phases are rejected because the rebuild remains `clean package`.
- Shell operators and command separators are rejected.
- Arguments already controlled by Build Options, such as `skipTests` or detected plugin skip flags, are rejected to avoid conflicting sources of truth.
- Quoted values are kept as a single command argument.

Advanced arguments are not saved. They reset when the rebuild dialog closes.
## Command preview

The read-only command field shows the exact command MD-Editor will send to the terminal. Review it before selecting **Build**. Changing a Build Option updates the preview immediately.

Build Options keep the rebuild goals fixed as `clean package`; advanced arguments can add validated Maven CLI options but cannot replace those goals.

## Persistence and safety

Every option declares its own persistence:

- Project choices, currently the test policy, are saved in MD-Editor's Java build-path configuration.
- Invocation choices, including audit bypasses and forced dependency updates, apply once and are not saved.

Opening the dialog does not run Maven or modify project files. Maven starts only after you select **Build**.
