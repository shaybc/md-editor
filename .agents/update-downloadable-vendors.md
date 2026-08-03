# Update Downloadable Vendors Agent

## Purpose

Discover, validate, and pin the latest stable releases of MD-Editor's downloadable
JARs and tools, then rebuild and verify the Kotlin ABI JAR.

This workflow upgrades vendor versions. It is distinct from
[`restore-pinned-vendor-packages.md`](restore-pinned-vendor-packages.md), which only
restores versions already pinned in the repository.

## Supported vendor scope

The update covers:

- Neutralino runtime and client library.
- Eclipse Temurin 21 tooling JDK for Windows x64.
- JetBrains Kotlin compiler and Kotlin LSP for Windows x64.
- Eclipse JDT LS.
- Eclipse LemMinX and its Maven extension.

Do not update browser CSS/JavaScript assets, npm dependencies, Maven project
dependencies, or unrelated downloadable resources as part of this workflow.

## Prerequisites

Before making changes, confirm that:

- The current directory is the repository root containing `desktop-app`, `agents`,
  and `tools`.
- The worktree status is known and unrelated user changes can be preserved.
- PowerShell, Node.js, npm, Maven, `tar`, and a Java 21+ JDK are available.
- Network access to the official GitHub, JetBrains, Adoptium, and Eclipse release
  endpoints is available.

## Discovery and candidate validation

From the repository root, first generate a metadata-only report:

```powershell
.\.tools\discover-latest-vendor-releases.ps1 -ReportPath .\vendor-release-report.json
```

Review every reported current/latest comparison. Stable releases only are eligible;
do not select drafts, prereleases, release candidates, beta builds, snapshots, or
nightlies.

Then download and validate the candidates:

```powershell
.\.tools\discover-latest-vendor-releases.ps1 `
  -DownloadAndValidate `
  -ReportPath .\vendor-release-report.json
```

Continue only when every downloaded candidate reports `Validation: passed`.
The validation report must provide the calculated SHA-256 for every downloaded
artifact. Treat missing archive entries, checksum mismatches, malformed release
metadata, or unavailable official endpoints as blocking failures.

The report is temporary workflow output. Do not commit it.

## Minimal pin updates

Update only fields whose stable version changed:

- `desktop-app/kotlin-language-tools.json`: Kotlin LSP/compiler versions, archive
  names, official URLs, and validated SHA-256 values.
- `desktop-app/tooling-jdk.json`: Temurin version, archive name, official URL,
  SHA-256, and archive root.
- `desktop-app/neutralino.config.json`: `cli.binaryVersion` and
  `cli.clientVersion`.
- `desktop-app/resources/js/lsp/server-registry.js`: the Eclipse JDT LS
  `supportedVersion`.

LemMinX and its Maven extension are resolved dynamically by the application. Verify
their latest artifacts, but do not introduce a new pin or change their runtime
resolution behavior.

Preserve existing JSON formatting and source style. Do not reformat whole files.
Do not change application versions or unrelated dependency declarations.

## Materialization and cache invalidation

Before restoring the new pins, resolve and verify the exact paths that belong to the
superseded Kotlin versions. Remove only:

- `desktop-app/vendor/kotlin-lsp`
- `desktop-app/vendor/kotlin-compiler`
- Superseded Kotlin archives under `desktop-app/vendor/.downloads`

Do not remove the entire vendor directory, unrelated downloads, the user profile, or
any broad cache location.

Run:

```bat
npm --prefix desktop-app run setup
```

Confirm that setup materialized the versions declared by the updated manifests and
that the required Kotlin LSP, compiler, ABI plugin, tooling JDK, and Neutralino files
exist.

## Kotlin ABI rebuild

Build against the candidate Eclipse JDT LS release, not an older profile install.
Download and extract the validated JDT LS archive into an isolated temporary
directory, confirm its `plugins` directory contains
`org.eclipse.jdt.ls.core_*.jar`, and run:

```powershell
$env:MDEDITOR_JDTLS_PLUGINS = "<temporary-jdt-ls>\plugins"
npm --prefix desktop-app run build:kotlin-jdt-extension
```

Restore the previous environment value afterward and delete only the isolated
temporary JDT LS directory.

The build succeeds only when:

- The command exits with code `0`.
- `desktop-app/resources/language-server-extensions/mdeditor-kotlin-abi.jar`
  exists and has a non-zero length.
- The JAR can be listed with `jar tf`.

## License and regression validation

Review the upstream license and release notes for every changed vendor. Update
existing LICENSE/NOTICE surfaces only when the new release changes required
attribution or bundled license content. Do not make speculative license edits.

Run the smallest relevant existing validation:

```bat
npm --prefix desktop-app run check:js
npm --prefix desktop-app test
```

Also run `git diff --check` and inspect the final diff. Do not run unrelated E2E suites
unless a changed vendor or existing project instruction specifically requires them.

## Completion report

Report:

- Current-to-new version changes and official release URLs.
- Candidate SHA-256 values and archive validation results.
- Files changed and why each was necessary.
- Cache/install paths removed.
- Setup, ABI build, JAR inspection, license review, and test results.
- Any vendor intentionally left unchanged.

Confirm that no unrelated code, configuration, vendor assets, or user changes were
modified.

## Guardrails

- Never infer a version from an unofficial mirror or search snippet.
- Never update a pin before the candidate artifact passes validation.
- Never weaken or omit checksum validation.
- Never delete broad vendor, cache, profile, repository, or home directories.
- Never commit generated downloads or the temporary discovery report.
- Stop and report the exact blocker when official release metadata is ambiguous or
  incompatible with the expected archive layout.
