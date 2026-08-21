# Milestone 4 Plan: Spring Boot and Docker Run Presets

## Summary
Add Spring Boot and Docker Compose run presets through the existing Run Configuration system. Presets should create normal saved configurations, build commands through the existing command builder, preview in the current dialog, and execute through the existing terminal/run output path without changing Java Application, Maven, or Gradle compatibility.

## Key Changes
- Extend Run configuration data to support a `docker-compose` type with:
  - `dockerCompose.command`: one of `up`, `down`, `logs`
  - `dockerCompose.filePath`: optional compose file path
  - `dockerCompose.services`: optional whitespace-separated service names
  - `dockerCompose.detached`: applies only to `up`
  - `dockerCompose.followLogs`: applies only to `logs`
- Add preset draft options:
  - Maven Spring Boot: saved as `type: "maven"` with `maven.commandLine: "spring-boot:run"`
  - Gradle Spring Boot: saved as `type: "gradle"` with `gradle.tasks: "bootRun"`
  - Docker Compose Up: saved as `type: "docker-compose"` with `command: "up"`
  - Docker Compose Down: saved as `type: "docker-compose"` with `command: "down"`
  - Docker Compose Logs: saved as `type: "docker-compose"` with `command: "logs"` and `followLogs: true`
- Update the Run Configuration dialog/editor to show these preset choices and render Docker Compose fields using existing dialog classes and controls.
- Update command building so Docker Compose produces:
  - `docker compose up`
  - `docker compose up -d`
  - `docker compose down`
  - `docker compose logs -f serviceName`
  - include `-f <composeFile>` before the compose command when a file path is provided.
- Update launch resolution so Docker Compose does not require Java runtime, Maven detection, Gradle detection, classpath resolution, or build-before-run preparation.
- Keep persisted config compatibility: existing Java/Maven/Gradle config JSON must continue to normalize and run unchanged.

## Expected files to change:
- [desktop-app/resources/js/project/run/run-configuration-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-store.js)
- [desktop-app/resources/js/project/run/run-configuration-dialog.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-dialog.js)
- [desktop-app/resources/js/project/run/run-configuration-editor.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-editor.js)
- [desktop-app/resources/js/project/run/run-command-builder.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-command-builder.js)
- [desktop-app/resources/js/project/run/run-configuration-validation.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-configuration-validation.js)
- [desktop-app/resources/js/project/run/run-launcher.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/project/run/run-launcher.js)
- [desktop-app/tests/run-configuration.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/run-configuration.test.js)

## Test Plan
- Unit tests:
  - Spring Boot Maven preset creates a Maven config with `spring-boot:run`.
  - Spring Boot Gradle preset creates a Gradle config with `bootRun`.
  - Docker Compose presets normalize to `type: "docker-compose"` with expected command defaults.
  - Docker Compose validation rejects unknown commands.
  - Command builder emits expected Docker Compose commands with compose file, services, detached, and follow-log options.
  - Existing Java, Maven, and Gradle command tests still pass.
- Syntax checks:
  - Run `node --check` on each changed run module.
- Focused test command:
  - `node --test desktop-app\tests\run-configuration.test.js`

## Assumptions and Defaults
- Docker Compose uses the user’s installed `docker compose`; no Docker installer or tool detection is added.
- Maven and Gradle Spring Boot support is preset-based only; no Spring project auto-detection is required.
- Docker Compose configs default to the project root as working directory unless the user sets `workingDirectory`.
- Docker Compose `buildBeforeRun` is always false.
- Existing saved Run configuration format remains backward compatible.
- No changes are made to Kubernetes YAML IntelliSense, snippets, outline behavior, or project `kubectl` commands in this milestone.
