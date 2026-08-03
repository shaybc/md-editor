# Restore Pinned Vendor Packages Agent

## Purpose

Restore the desktop application's currently pinned vendor packages and rebuild the Kotlin ABI JAR by using the repository's existing setup script.

This workflow restores the versions already configured in the repository. It does not discover, select, or pin newer vendor versions.

## Prerequisites

Before running the workflow, confirm that:

- The current directory is the repository root containing `desktop-app` and `tools`.
- Node.js and npm are installed and available on `PATH`.
- Maven is installed and available on `PATH`.
- A Java 21 or newer JDK is available through `JAVA_HOME` or under the standard Windows Java installation directory.
- Eclipse JDT LS is installed under `%USERPROFILE%\.md-editor\language-servers\java\plugins`, or `MDEDITOR_JDTLS_PLUGINS` points to its `plugins` directory.

## Procedure

From the repository root, run:

```bat
.\.tools\setup-vendor-and-build-kotlin-abi.bat
```

The script performs these steps in order:

1. Runs `npm --prefix desktop-app run setup` to restore the currently pinned Neutralino binaries, tooling JDK, browser vendor assets, Kotlin language server, and Kotlin compiler.
2. Stops immediately if vendor setup fails.
3. Runs `npm --prefix desktop-app run build:kotlin-jdt-extension`.
4. Stops immediately if the Kotlin ABI build fails.

Do not manually repeat a failed step without first reporting the script's error output.

## Verification

The workflow succeeds only when:

- The script exits with code `0`.
- The final output contains `[success] Desktop vendor setup and Kotlin ABI JAR build completed.`
- `desktop-app\resources\language-server-extensions\mdeditor-kotlin-abi.jar` exists after the build.

Report the command that was run, whether it succeeded, and any missing prerequisite identified by the script.

## Guardrails

- Do not update vendor versions, URLs, archive names, or checksums.
- Do not delete vendor directories or download caches.
- Do not modify generated vendor files or the rebuilt JAR by hand.
- Do not change application code, build configuration, or unrelated files.
