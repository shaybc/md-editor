# Feature Brief — Run Menu & Run Configurations (Agent Prompt)

## Objective

Add a first-class **Run** capability to MD-Editor's desktop app: a top-level **Run** menu plus an
Eclipse/IntelliJ-style **Run Configuration** dialog that can launch (1) a Java class that has a `main`
method, (2) a Maven project/goals, and (3) a Gradle project/tasks. Named configurations are created,
edited, and persisted **per project** so they travel with the project.

Treat this document as the implementation prompt. Follow the `modular-code` conventions already used in
this repo (small single-responsibility files, `registerMarkdownViewer*` factories, `app.registerModule`,
JSDoc remarks). Reuse existing modules instead of duplicating their logic.

---

## Current State (what already exists — reuse it)

MD-Editor is a Neutralino desktop app. The frontend lives under `desktop-app/resources/js`. The relevant
building blocks already present:

- **Project detection & commands** — `resources/js/project/`:
  - `maven-project-detection.js`, `gradle-project-detection.js` detect a Maven/Gradle project and its
    `runner` (e.g. `mvn`/`mvnw`, `gradle`/`gradlew`).
  - `maven-build-command.js` (`buildCommand`, `buildCleanCommand`, `buildCompileCommand`,
    `buildEffectivePomCommand`) and `gradle-build-command.js` (`buildCommand`, `buildCleanCommand`)
    assemble shell command strings from options.
  - `java-project-provider.js` implements the capability provider (`supports`, `canCompileFile`,
    `canCompileTarget`, `canCleanProject`, `canRebuildProject`, `canGenerateDocumentation`, …) and runs
    commands through the terminal.
  - `java-project-runtime.js` + `java/jdk-registry.js` resolve and validate the **Project JDK** and a
    compatible launcher JDK, and build a Java environment. Reuse `requireForCommand` /
    `createJavaEnvironment` for launches.
  - `java-compiler.js` walks the source tree collecting `.java` files, runs `javac`, and reports
    diagnostics — reuse its filesystem/compile helpers for main-class discovery and the compile-before-run step.
  - `maven-build-options/` shows a rich options panel/session — mirror its structure for the run-config UI.
- **Command menu wiring** — `resources/js/project/project-command-menu.js` owns capability-gated menu
  buttons declared in `resources/index.html` via `data-project-command="..."`. Buttons are enabled/disabled
  by `updateAvailability()` against the active provider + context.
- **Execution** — `resources/js/terminal/desktop-terminal.js` exposes
  `runCommand(command, { cwd })`, which spawns a process, streams output into a read-only terminal tab, and
  supports stopping the newest running command. This is the execution primitive for every run type.
- **Tasks/output** — `resources/js/tasks/project-task-store.js` and `jdt-task-source.js` track project
  tasks; `java-rebuild-output.js` shows persisted build output. Run output should follow the same
  streamed-terminal + persisted-output pattern.
- **Per-project persistence** — the project's `.md-editor/` folder already stores
  `java-build-path.json`, `java-build-state.json`, `java-rebuild-output.json`, `problems.json`. Run
  configurations go here too (see Persistence).
- **Dialog reference** — the Javadoc modal in `resources/index.html`
  (`#project-documentation-modal`, driven from `project/javadoc/`) is the closest existing pattern for a
  multi-section modal with a live command preview, VM options, and scope selection. Model the run-config
  dialog on it for visual and code consistency.

The net effect: MD-Editor can already *build/compile/clean* Maven, Gradle, and plain Java. It **cannot**
launch a specific `main` class, run arbitrary Maven goals / Gradle tasks, or save named launch profiles.
This feature fills that gap.

---

## Scope

Deliver all three run types now (no phased cut). A sensible build order is Java Application → Maven →
Gradle, since Java Application exercises the most new plumbing (main-class discovery, classpath, launch).

### 1. Run menu

Add a top-level **Run** menu (dropdown in the desktop action menu bar in `resources/index.html`, styled
like the existing menus) with, at minimum:

- **Run…** — opens the Run Configuration dialog.
- **Run '<last/selected config>'** — re-runs the active configuration without opening the dialog.
- **Run Configurations…** — opens the dialog focused on the manage/list view.
- **Stop** — stops the currently running configuration (delegates to the terminal's stop-newest-command).
- A dynamic list of saved configurations for the current project (each entry runs that config).

Also add context affordances consistent with the app: a **Run** action from a Java file's context/editor
menu that offers "Run <ClassName>.main()" when the active file declares a `public static void main`.
Menu items are capability-gated through `project-command-menu.js` (new `data-project-command` values, e.g.
`run-configurations`, `run-active`, `run-stop`).

### 2. Run Configuration dialog (Eclipse/IntelliJ-style)

A modal with a **left list** of saved configurations grouped by type (Java Application, Maven, Gradle) and
a **right editor pane** for the selected configuration, plus toolbar actions: **New** (choose type),
**Duplicate**, **Delete**, **Run**, **Apply**, **Close**. Show a **live command-line preview** of what
will be executed (like the Javadoc modal's command preview), and inline validation (e.g. "Main class not
specified", "Gradle project required") mirroring the screenshots.

Shared fields across all types: **Name**, **Working directory** (default = project root, overridable),
**Environment variables** (name/value pairs), and where the config is saved (per-project — see Persistence).

Per-type fields:

- **Java Application**
  - **Project / module** (the detected project or source root context).
  - **Main class** — free text with a **Search…** picker that lists classes containing a `main` method,
    discovered by scanning source roots (reuse `java-compiler.js` traversal + a lightweight `main`-method
    check; optionally use JDT via existing bridges if already available).
  - **Program arguments**.
  - **VM arguments** (e.g. `-Xmx…`, system properties).
  - **JRE/JDK** — default to the configured **Project JDK** from `jdk-registry.js`; allow overriding to
    another registered JDK. Reject launch if no valid Project JDK (reuse `java-project-runtime.requireForCommand`).
  - Optional **classpath/dependencies** override; default classpath = compiled output + project/external
    dependencies already known to the build path (`java-build-path.json`).
- **Maven**
  - **Command line** / goals (e.g. `clean package`, `spring-boot:run`, `exec:java`).
  - **Profiles** (space-separated, `-P`/`-` prefixes).
  - **Working directory** (defaults to the module root); resolve `runner` (`mvn`/`mvnw`) via
    `maven-project-detection.js`. Reuse `maven-build-command.js` helpers for assembly where applicable and
    allow raw goal entry for anything not covered.
- **Gradle**
  - **Tasks and arguments** (e.g. `bootRun`, `run`, `test`).
  - **Gradle project** (root or subproject path); resolve `runner` (`gradle`/`gradlew`) via
    `gradle-project-detection.js`; apply the standard launcher options already used
    (`--console=plain`, `--no-daemon`, `--offline`, `--gradle-user-home`) from `gradle-build-command.js`.

The dialog should degrade gracefully: types whose tooling isn't detected for the current project are still
selectable but surface a clear validation message (matching how the screenshots show red field
highlighting / "not specified" banners).

### 3. Execution & output

- Compose the final command per type and execute via `desktop-terminal.runCommand(command, { cwd })`.
- **Java Application** runs `java` from the resolved Project JDK with assembled classpath, VM args, main
  class, then program args. Optionally auto-compile first (reuse `java-compiler.js`) when outputs are
  stale; make auto-compile a per-config toggle ("Build before run", default on).
- Stream output to a read-only terminal tab titled with the configuration name; support **Stop**; persist
  last output like `java-rebuild-output.js`.
- Report non-zero exit codes and process-start failures with the same messaging style as
  `java-project-provider.js` (e.g. "… failed with exit code N. See <config name> output.").

---

## Persistence

Store configurations **per project** in `.md-editor/run-configurations.json` (new file, same folder and
JSON-store pattern as `java-build-path.json`). Proposed shape:

```json
{
  "version": 1,
  "active": "run-config-id",
  "configurations": [
    {
      "id": "run-config-id",
      "type": "java-application | maven | gradle",
      "name": "Main",
      "workingDirectory": "",
      "environment": [{ "name": "KEY", "value": "VAL" }],
      "buildBeforeRun": true,
      "java": { "mainClass": "", "programArguments": "", "vmArguments": "", "jdkId": "", "classpathOverride": "" },
      "maven": { "commandLine": "clean package", "profiles": "", "runner": "" },
      "gradle": { "tasks": "bootRun", "projectPath": "", "runner": "", "offline": false }
    }
  ]
}
```

Only the sub-object matching `type` is required. Keep the store schema-versioned and forward-compatible.
Never write secrets; environment values are stored as entered (document this).

---

## Suggested file layout (new modules)

Follow existing naming. Suggested additions under `resources/js/project/run/`:

- `run-configuration-store.js` — load/save/validate `.md-editor/run-configurations.json`; CRUD + active-config.
- `run-command-builder.js` — assemble the command string per type (delegating to
  `maven-build-command.js` / `gradle-build-command.js` and a new Java-launch assembler).
- `java-main-class-finder.js` — discover `main`-bearing classes from source roots.
- `run-configuration-dialog.js` — the modal controller (list + editor pane + live preview + validation).
- `run-launcher.js` — resolve JDK/runner, optionally build, then `runCommand`; own stop + output.
- `run-command-menu.js` (or extend `project-command-menu.js`) — the Run menu wiring and capability gating.

Register each via `app.registerModule(...)` and wire into app startup where the other project modules are
registered. Add the Run menu markup + `data-project-command` buttons and the modal markup to
`resources/index.html`, styled with existing menu/modal CSS classes.

---

## Acceptance Criteria

1. A **Run** menu appears in the action menu bar with Run…, Run '<config>', Run Configurations…, Stop, and
   the per-project saved-config list; items enable/disable based on the active project/context.
2. The **Run Configuration dialog** creates, edits, duplicates, deletes, and runs configurations of all
   three types, shows a live command preview, and validates required fields (e.g. missing main class).
3. **Java Application**: selecting a class with `main` (via the Search picker or a Java editor's "Run
   <Class>.main()") launches it with the resolved Project JDK, honoring program args, VM args, working
   directory, and environment; output streams to a named terminal tab and can be stopped.
4. **Maven**: a config runs arbitrary goals (e.g. `clean package`, `spring-boot:run`) with the detected
   `mvn`/`mvnw` runner and profiles, from the correct working directory.
5. **Gradle**: a config runs arbitrary tasks (e.g. `bootRun`) with the detected `gradle`/`gradlew` runner
   and the standard launcher flags.
6. Configurations persist in `.md-editor/run-configurations.json`, survive app restart, and are scoped to
   the project.
7. Non-zero exit codes and launch failures are reported with clear, consistent messaging; no valid Project
   JDK produces the same guidance as existing Java commands.
8. New code follows `modular-code` conventions; existing build/detection/terminal modules are reused, not
   duplicated. Add tests consistent with the repo's Playwright/`tests` setup where practical.

---

## Non-Goals (this iteration)

- Full debugging (breakpoints, JDWP attach) — Run only, not Debug. (Structure config types so a future
  "Debug" variant can reuse them.)
- Remote/SSH or Docker run targets (the IntelliJ "Run on" dropdown) — local machine only.
- Shared/exported configurations across projects or a global run-config store.
- JUnit/test-runner configuration types, and non-JVM run types.

## Open Questions

- Should the Java classpath default be derived solely from `java-build-path.json`, or additionally resolved
  from Maven/Gradle dependency output when the project is Maven/Gradle-based?
- Should "Build before run" for Maven/Gradle configs be implicit in the goals/tasks (e.g. include
  `compile`) or a separate pre-launch step?
- Keyboard shortcuts (e.g. Shift+F10 to run, Ctrl+F2 to stop) — adopt IntelliJ-like bindings via the
  existing `keyboard-shortcuts.js`?
