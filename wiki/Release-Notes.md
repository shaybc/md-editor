# Release Notes

This page summarizes the tagged MD-Editor releases and the major user-facing features included in each version. It is based on the repository release tags and commit history.

## Current Main

Changes available on `main` after `v6.8`:

- No unreleased changes are currently documented.

## v6.8 - June 8, 2026

- Fixed original source actions for converted Markdown nodes whose YAML frontmatter appears after the document title.
- Updated About dialog and app metadata for the v6.8 release.

## v6.7 - June 8, 2026

- Fixed local graph opening so large-graph warnings use the focused graph node count instead of the source graph size.
- Added original source export actions for graph maps, graph nodes, sidebar folders, and sidebar files.
- Added sidebar actions to open original source files and reveal original source folders from converted Markdown nodes.
- Improved original export completion dialogs with an `Open Folder` action and corrected modal alignment/button styling.
- Improved desktop startup sizing by using a larger default window, persisting resized dimensions, and centering restored windows.
- Updated About dialog and app metadata for the v6.7 release.

## v6.5 - June 4, 2026

- Added C# support to the Convert Code to MD workflow, including dependency detection, metadata, method signatures, properties, return values, exceptions, and regression coverage.
- Added node search in Graph View.
- Improved saved graph details links.
- Reorganized settings and added graph node color configuration.
- Refined graph hover behavior for smoother interaction.
- Improved graph and app menu behavior.
- Polished large graph interaction details after the v6.x performance work.
- Rewrote the project README with current product positioning, updated screenshots, current feature descriptions, and refreshed project links.
- Added six current README screenshots under `web-app/assets/screenshots/` and removed older unused README/image assets.
- Updated the app version metadata to `6.5.0` for `md-editor` and `md-editor-desktop`, including package lock files and the release badge.
- Renamed remaining `markdown-viewer` project naming references to `md-editor`, while preserving the original project URL in the README Project Origin section.
- Reworked wiki documentation across features, usage, installation, Docker deployment, desktop app, configuration, FAQ, modules, runtime architecture, technology architecture, script function reference, and wiki home navigation.
- Removed the stale `Development-Journey` wiki page and references to it.
- Updated `wiki/Home.md` so every current wiki page is linked from a relevant section.
- Added an offline-friendly desktop launch path that avoids `npx` network waits when cached Neutralino binaries are already available.
- Added `desktop-app/undeploy_desktop.bat` and wired `start_desktop.bat` to clean generated desktop deployment resources before launching.
- Preserved cached Neutralino binaries and vendored desktop assets during undeploy so enterprise/offline desktop machines can launch without downloading dependencies.
- Updated desktop resource preparation so `icon.jpg` is redeployed from `web-app/assets/` with the rest of the prepared desktop assets.
- Updated the Windows desktop launcher so `git pull` is optional through `start_desktop.bat --pull` instead of running before every offline launch.

## v6.3 - May 21, 2026

- Tuned hover performance for large graphs.
- Reduced interaction cost when moving across dense graph maps.
- Improved responsiveness for graph inspection workflows.

## v6.2 - May 21, 2026

- Improved collapsed graph rendering.
- Refined large graph presentation when communities or clusters are collapsed.
- Made graph views easier to read after automatic or manual collapse behavior.

## v6.1 - May 20, 2026

- Improved large graph loading performance.
- Reworked graph snapshot loading after testing progressive loading behavior.
- Kept heavy graph loading more responsive for larger folders and generated maps.

## v6.0 - May 20, 2026

- Added a Most Referenced graph quick action.
- Made it easier to identify the most connected or important files in a graph.
- Expanded graph analysis workflows beyond simple file relationship browsing.

## v5.0 - May 19, 2026

- Improved graph and tree context menus.
- Added richer graph context actions, including path and network copy workflows.
- Added converter frontmatter and additional extraction options.
- Improved sidebar full-graph diagnostics.

## v4.0 - May 19, 2026

- Added graph and settings enhancements.
- Optimized graph snapshots.
- Improved cluster expansion behavior inside graph tabs.
- Expanded graph configuration and display controls.

## v3.0 - May 19, 2026

- Bundled desktop vendor assets.
- Improved desktop app reliability by reducing dependency on live CDN loading.
- Optimized graph loading behavior.
- Strengthened the desktop build as a local app experience.

## v2 - May 19, 2026

- Added the dependency Markdown generator.
- Introduced Convert Code to MD as a way to turn source folders into Markdown dependency maps.
- Added broad graph, tag, saved graph, and folder workflow improvements leading up to code map generation.
- Refactored the web app into classic modules for maintainability.
- Added editor formatting tools, Mermaid syntax warnings, graph group controls, frontmatter rendering, folder graph loading states, and large graph auto-collapse behavior.

## ver1.0 - May 9, 2026

- Initial MD-Editor release line.
- Added graph document persistence and saved graph workflows.
- Added folder graph export, lightweight graph serialization, stale graph detection, comparison helpers, and saved graph update modes.
- Added layout preference persistence and restore defaults.
- Added tab context menu improvements.
- Added architecture, module, runtime, and script function documentation.
- Established the project as a local Markdown workspace with graph-oriented documentation workflows.

## Notes

- Tags use the historical names `ver1.0`, `v2`, and `v3.0` through `v6.8`.
- The desktop app has its own build and packaging flow, but shares the same core web application features.
- Features listed under each version are grouped by outcome rather than every individual commit.
