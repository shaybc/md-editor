---
tags:
  - maven
  - licenses
  - apache-rat
  - project-policy
---
# Apache RAT Policy Manager

Use **Project > License > Configure RAT policy...** to create or review the license-audit policy for an opened Maven project. This is the proactive companion to **Resolve RAT finding...**, which starts from a specific build finding.

Apache RAT is a release-audit utility. It scans files for recognized license evidence and reports anything that does not match the policy configured by the project. A useful RAT policy answers four technical questions:

1. When does the Maven audit run?
2. Which modules and files are covered?
3. Which license evidence can RAT recognize?
4. Which recognized license families does project policy accept?

MD-Editor helps encode and verify those decisions. It does not decide who owns a file or whether two licenses are legally compatible.

## Guided setup

The guided wizard is the default and builds a conservative baseline:

1. **Current policy** performs static POM inspection. It reports active plugin declarations, `pluginManagement`, profiles, inheritance confidence, the detected RAT version, and available offline validation. Opening this page runs no Maven command and writes nothing.
2. **Project license** records the reviewed license for project-owned work. It does not grant rights over third-party content. When Apache-2.0 is selected and no `LICENSE` exists, the wizard can open an unsaved full-license draft from the bundled copy.
3. **Enforcement** selects the governing POM, RAT version, configuration placement, and whether `apache-rat:check` runs during Maven `verify`.
4. **Coverage** shows modules known to execute or inherit the policy. It also accepts reviewed exclusions. Every exclusion means “do not inspect”; it never means “this license is approved.”
5. **Review** summarizes the policy and requires confirmation that it reflects a human project decision.

The recommended baseline binds RAT to `verify`, retains RAT defaults, adds no bypass, and introduces only reviewed exceptions.

## Advanced mode

Choose **Advanced** in the dialog header to expose:

- External `rat-config.xml` placement.
- External exclusion-file placement.
- Custom license families and exact matcher evidence.
- Explicit approved-family configuration.
- Static parent/module coverage details.
- A collapsed **Advanced — bypasses license audit** section.

The bypass section can configure `skip` or deactivate a discovered `check` execution without removing the complete plugin. Both require explicit acknowledgement and are never recommended. They stop the audit from blocking the selected scope; they do not solve a licensing issue.

For profile-controlled or unclear inheritance, static analysis can only say that effective Maven configuration needs confirmation. Do not choose a broad parent scope merely to reduce duplication.

## Preview, save, undo, and verify

The manager never silently changes project files. It first builds one preview containing every affected file and before/after content. Approved changes open as unsaved editor buffers and use the current dirty buffer as their baseline.

Possible outputs include:

- A narrow `pom.xml` plugin or configuration edit.
- A new `rat-config.xml` draft for custom families and matchers.
- A new `.rat-excludes` draft.
- Reviewed source headers when the project is authorized to add them.
- An explicit `LICENSE` draft.
- An optional third-party inventory draft.

Use **Undo RAT policy changes** to restore the grouped editor transaction. Verification is unavailable until you explicitly choose **Save affected files and run RAT** and confirm the save. RAT runs through the existing terminal with the detected Maven wrapper; compile, package, and install goals are not started automatically.

## Offline references

MD-Editor bundles:

- Version-pinned validation subsets for RAT 0.17 and 0.18.
- Authored `rat-config.xml`, exclusion, header, and third-party inventory templates.
- The Apache License 2.0 text already used by MD-Editor.
- Concise help and an asset-provenance manifest.

The bundled schemas are deliberately labeled **MD-Editor validation subsets**, not official generated RAT schemas. For another RAT version, the manager performs structural validation and explains the limitation. MD-Editor does not bundle the RAT executable, RAT’s mutable default license database, or a complete SPDX data set.

Reference assets are updated only by an explicit release-maintainer process with a pinned URL and SHA-256 checksum. The application never downloads policy material merely because the wizard opened.

## RAT, legal documents, and REUSE

`LICENSE`, `NOTICE`, a third-party inventory, source headers, RAT matchers, and RAT exclusions serve different purposes. Adding a filename to documentation does not approve it in RAT. Adding a matcher does not determine legal compatibility. Excluding a binary does not establish its provenance.

The first policy-manager release is Maven/RAT focused. It can help draft third-party documentation but does not generate a complete [REUSE](https://reuse.software/) policy or SPDX inventory.

Official references:

- [Apache RAT overview](https://creadur.apache.org/rat/)
- [Apache RAT Maven plugin](https://creadur.apache.org/rat/apache-rat-plugin/)
- [Apache RAT Maven plugin on Maven Central](https://central.sonatype.com/artifact/org.apache.rat/apache-rat-plugin)
- [Custom license matchers and approved families](https://creadur.apache.org/rat/apache-rat-plugin/examples/custom-license.html)
- [How RAT license definitions work](https://creadur.apache.org/rat/license_def.html)

See also: [Apache RAT policy baseline](apache-rat-policy-baseline.md) and [Resolve Apache RAT findings](apache-rat-license-audit.md).
