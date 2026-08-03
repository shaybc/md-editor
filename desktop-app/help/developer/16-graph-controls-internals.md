---
tags: []
---
# 16. Graph Controls Internals

Graph View uses a serializable snapshot plus per-tab view configuration. The renderer, toolbar, and persistence modules cooperate rather than keeping graph state only in the DOM.

## Main Files

| File | Responsibility |
| --- | --- |
| `resources/js/graph/extraction.js` | Extracts Markdown links, wiki links, tags, source metadata, and unresolved dependencies. |
| `resources/js/graph/persistence.js` | Normalizes graph documents, view config, saved graph state, and snapshot persistence. |
| `resources/js/graph/renderer.js` | D3 rendering, node/canvas menus, quick actions, clusters, graph exports, and visible graph updates. |
| `resources/js/graph/toolbar.js` | Search, tag, group, display, and force controls. |
| `resources/js/graph/health.js` | Graph health report tabs and recovery actions. |
| `resources/js/graph/maven-recovery.js` | Maven recovery batch/context helpers. |

## Filter Panel

Graph filter state lives in the active graph tab's `graphViewConfig`.

| Section | State/Behavior |
| --- | --- |
| Search files | Supports file/path/tag/text/line/link-count style queries. |
| Tags | Shows tag nodes and narrows to files linked to a selected tag. |
| Groups | Stores named node sets, colors, hidden state, and query-based membership. |
| Display | Controls arrows, external dependencies, missing dependencies, orphan nodes, labels, text fade, node size, and link thickness. |
| Forces | Updates D3 force values such as center, repel, link, link distance, and group pull. |

Display and force changes should update the graph config and re-render through existing graph toolbar/renderer helpers.

## Quick Actions

Quick actions are generated in the graph renderer:

- Health report opens or focuses a graph health tab.
- Group most referenced ranks files by incoming/outgoing reference shape and writes a group into graph view config.
- Group all ungrouped creates a group for visible nodes not already represented by a group.
- Remove leaf nodes adds qualifying visible nodes to hidden-node config.

These actions change the graph view, not the Markdown files, unless the user explicitly saves a graph document.

## Clusters

Collapsed clusters are stored in `collapsedClusters`. Supported cluster styles include direct outgoing, full outgoing tree, and detected community clusters. Expanding a cluster removes the matching collapsed cluster entry and restores member nodes to the view.

Large graphs can auto-collapse when the active graph exceeds configured thresholds. Keep this path separate from manual collapse state so users can still reset or expand clusters predictably.

## Context Menus

Node context menus depend on node type. File nodes can open, reveal, tag, graph, collapse, remove, copy, and export. Cluster nodes add expand-related actions. Canvas context actions operate on the whole visible graph: open all, center graph, export original nodes, and toggle magnetic forces.

## Health Reports

Health report tabs are graph-family tabs with a different `graphViewKind`. They can open referenced Markdown files, resolve original source files, group missing dependencies, and start Maven recovery when recovery context exists.

Previous: [15. Folder Tree And Context Menus](15-folder-tree-context-menus.md)  
Next: [17. Git Integration Internals](17-git-integration-internals.md)
