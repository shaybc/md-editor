# Build MD-Editor Neutralino Executable Agent

## Purpose

Generate the MD-Editor Windows executable from the current repository checkout by using the existing Neutralino build script.

## Prerequisites

Before running the workflow, confirm that:

- The current directory is the repository root containing `desktop-app` and `tools`.
- Node.js and npm are installed and available on `PATH`.
- Network access is available if the pinned Neutralino CLI or setup dependencies are not already installed.
- Microsoft Edge WebView2 Runtime is installed when the desktop setup requires it.

## Procedure

From the repository root, run:

```bat
.\.tools\build-neutralino-exe.bat
```

The script performs these steps:

1. Validates the repository layout and the availability of Node.js and npm.
2. Installs the pinned Neutralino CLI locally when it is missing.
3. Runs the desktop application's existing `npm run build` workflow.
4. Prints every generated `.exe` path found under `desktop-app\dist`.

Do not replace the script with manually assembled setup or build commands. If the command fails, report the failing step and its error output.

## Verification

The workflow succeeds only when:

- The script exits with code `0`.
- The output contains `[success] Build complete. Executable output:`.
- At least one generated `.exe` file exists under `desktop-app\dist`.

Report the command that was run, whether it succeeded, and the absolute path of each generated MD-Editor executable.

## Guardrails

- Do not modify source code or build configuration to make the build pass unless the user explicitly requests a fix.
- Do not change pinned dependency or Neutralino versions.
- Do not delete existing build output, caches, or dependencies.
- Do not commit or publish the generated executable unless the user explicitly requests it.
