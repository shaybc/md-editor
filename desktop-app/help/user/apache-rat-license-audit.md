---
tags:
  - maven
  - licenses
  - apache-rat
---
# Resolve Apache RAT Findings

When Maven reports **Files with unapproved licenses**, open the problem's Quick Fix and choose **Resolve RAT finding...**. The action is shown with `local` provenance because MD-Editor is routing a recognized Maven/RAT diagnostic to its own guided manager; it is not a JDT code action or a Maven-supplied automatic edit.

The same Quick Fix menu can also offer **Rebuild once with Apache RAT skipped...**. That opens the Maven rebuild dialog with `-Drat.skip=true` selected for this rebuild only. It is useful for temporary troubleshooting, but it bypasses the audit and does not resolve or approve the reported file.

You can also open the reactive workflow from **Project > License > Resolve RAT finding...**. Use [Configure RAT policy...](apache-rat-policy-manager.md) when you want to establish or review the project-wide policy before a particular failure occurs.

Apache RAT scans project files for license evidence. A file reported as "unapproved" is not automatically illegal or incorrectly licensed. It means the project's current RAT policy did not recognize acceptable evidence for that file.

## Start with investigation

The Finding page identifies the nearest Maven module, reported path, file type, governing configuration, and conventional `target/rat.txt` report when available.

For binary snapshots and fixtures, **Inspect reported file** shows metadata and a bounded hexadecimal/ASCII signature. You can open the file with the operating system's default application or explicitly calculate SHA-256. Unknown binaries are not opened as source text automatically.

**Investigate provenance** reports conservative evidence such as generated-looking paths and Git status. Evidence is not a legal ownership conclusion.

## Understand each resolution

- **Add the project license header** is for supported text owned or licensable by the project. It requires explicit authorization.
- **Exclude this exact file** stops RAT inspecting one path. It does not approve or determine the file's license.
- **Exclude matching generated files** adds a reviewed pattern. Broad all-project patterns are rejected.
- **Recognize and approve this license family** adds matcher evidence and records a project-policy decision. It is not a legal compatibility opinion.
- **Record third-party license and provenance** updates existing documentation. Documentation alone does not clear RAT.
- **Skip RAT for one invocation** adds `-Drat.skip=true`. It bypasses that audit run; it does not fix the finding. The Maven project rebuild dialog offers the same temporary bypass as **Skip Apache RAT for this rebuild**; it affects only that displayed rebuild command and is not saved in project configuration.
- **Configure skip or disable execution** is an advanced persistent bypass, never a recommended remediation.

Every option has an information button explaining what was encountered, what the action changes, how it affects the build, and what the developer must decide. Official Apache RAT links open only when selected; the core explanations are bundled for offline use.

## Preview and verify

Configuration and documentation actions show target, warnings, and before/after content. Approved changes open as unsaved editor tabs. Save the affected files before verification. RAT checks are explicit, use the detected Maven wrapper, and do not automatically compile, package, install, or save unrelated files.

Parent configuration may affect inherited modules. `pluginManagement` alone does not prove that RAT executes. Profile-controlled or unclear inheritance is shown as ambiguous until effective configuration is inspected.

Official references:

- [Apache RAT overview](https://creadur.apache.org/rat/)
- [Maven plugin](https://creadur.apache.org/rat/apache-rat-plugin/)
- [Apache RAT Maven plugin on Maven Central](https://central.sonatype.com/artifact/org.apache.rat/apache-rat-plugin)
- [Maven options](https://creadur.apache.org/rat/apache-rat-plugin/mvn_options.html)
