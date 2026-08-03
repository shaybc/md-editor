---
tags: []
---
# 12. Release Notes

This page records user-facing documentation and app-shape changes relevant to this help manual.

## v10.1 - July 30, 2026

- fixed folder view and some run bugs
- fixed lower panel tabs scrollbar behavior
- added Run menu
- Added a new **Run** application-menu category with loading placeholder. - Added Run Configuration UI/resources: modal styling, configuration dialog/editor, menu integration, launcher, output restore, validation, store, Java main-class finder, runtime classpath builder, and build-before-launch flow. - Added Maven/Gradle helpers for arbitrary run goals/tasks. - Java Build Path save flow now distinguishes initial `Build` vs later `Rebuild`, can synchronize analysis even when config is unchanged, and passes the saved configuration into the confirmation flow. - Folder/sidebar and script wiring now load run configuration/output state per opened project. - Tests were added for runtime classpath, run configuration storage/validation, editor actions, launcher behavior, and expanded Java Build Path behavior.
- Implemented dynamic notification modal stacking.
- Fixed “Save Graph Report” Export.
- improved maven dependency export
- Implemented transitive JAR dependency recovery and export.
- Updated About dialog and app metadata for the v10.1 release.

## v10.0 - July 24, 2026

- Promoted MD-Editor to the v10.0 major release after extensive Java, JDT, editor, folder, terminal, AI Companion, and API Client updates.
- Added and refined Java/JDT workflows including isolated proxy architecture, Gradle and Maven build support, persistent Problems diagnostics, cancellation, retry handling, source actions, formatting, Javadoc generation, and build-path improvements.
- Expanded editor and workspace tools with richer source context menus, outline support, large-file typing fast paths, line-delimiter conversion, parse-as tab submenu, bottom panel persistence/maximize, tab and sidebar multi-select, flat folder view, folder-scoped search, and drag/drop improvements.
- Improved AI Companion, API Client, terminal, graph export, certificate trust, theme, menu, settings, and help experiences with matching tests and documentation.
- Updated About dialog and app metadata for the v10.0 release.

## v9.0 - July 9, 2026

- Promoted MD-Editor to the v9.0 major release after the desktop-first repo and app layout move.
- Moved the app surface to `desktop-app`, with help docs, converters, bridge resources, tests, and runtime assets organized under the desktop app tree.
- Added Line Counter desktop resource work with menu/mobile entry points, configuration UI, progress feedback, generated reports, and save support.
- Updated desktop build/runtime behavior for temporary README/LICENSE resource bundling, graceful app shutdown, and generated-report save coverage.
- Updated converter paths and Java converter runtime expectations for the new desktop converter layout.

## Desktop Help Refresh

- Added a richer desktop user manual under `desktop-app/help/user`.
- Added a developer guide under `desktop-app/help/developer` with code landmarks and architecture notes.
- Updated the in-app Help menu to open the new user guide.
- Kept the old `desktop-app/resources/wiki` folder in place for review before deletion.

## Current App Shape

- MD-Editor runs as a Neutralino desktop app.
- Runtime UI and assets are checked in under `desktop-app/resources`.
- Desktop tests live under `desktop-app/tests`.
- Code conversion tools live under `desktop-app/converters`.
- Local state is stored in the desktop profile and, when relevant, folder-local `.md-editor` metadata.

Previous: [11. Desktop Setup And Troubleshooting](desktop-setup-and-troubleshooting.md)
Back to [Index](index.md)