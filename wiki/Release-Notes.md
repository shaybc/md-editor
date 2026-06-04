# Release Notes

This page summarizes the tagged MD-Editor releases and the major user-facing features included in each version. It is based on the repository release tags and commit history.

## Current Main

Changes available on `main` after `v6.4`:

- Added node search in Graph View.
- Improved saved graph details links.
- Reorganized settings and added graph node color configuration.
- Rewrote the project README with current product positioning and app screenshots.
- Added C# support to the Convert Code to MD workflow, including dependency detection, metadata, method signatures, properties, return values, exceptions, and regression coverage.

## v6.4 - May 21, 2026

- Refined graph hover behavior for smoother interaction.
- Improved graph and app menu behavior.
- Polished large graph interaction details after the v6.x performance work.

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

- Tags use the historical names `ver1.0`, `v2`, and `v3.0` through `v6.4`.
- The desktop app has its own build and packaging flow, but shares the same core web application features.
- Features listed under each version are grouped by outcome rather than every individual commit.
