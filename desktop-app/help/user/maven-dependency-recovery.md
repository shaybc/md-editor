---
tags: []
---
# Maven Dependency Recovery And Update Project

Maven dependency recovery helps generated Java Markdown projects connect unresolved package references to external JAR dependency nodes.

This workflow is only useful for Java projects generated with dependency metadata. It is desktop-only because it reads and writes local project files and may run a recovery batch file.

## When To Use It

Use this workflow when a generated Java documentation graph shows:

- Missing dependency nodes.
- Unresolved Java packages.
- External JAR references that were not available during conversion.
- A graph health report with Maven recovery options.

## Workflow

1. Convert a Java source project to Markdown with package/dependency options enabled.
2. Open the generated Markdown folder in MD-Editor.
3. Set or confirm the original source root if MD-Editor asks for it.
4. Open Graph View.
5. Open a graph health report.
6. Use Maven recovery actions from the health report when available.
7. Run the generated recovery batch if the report creates one.
8. Use <kbd>Update Project</kbd> from the generated project folder workflow to apply recovered dependencies.

## What Update Project Does

Update Project applies a pending recovery context to the generated Markdown project.

It can:

- Create external dependency Markdown stubs for resolved JARs.
- Add external dependency links to affected generated Markdown files.
- Remove resolved entries from `## Unresolved Dependencies`.
- Mark recovery status as applied, partial, blocked, or no-op.
- Open a summary showing JARs expected, found, missing, Markdown files updated, links added, and unresolved packages still unmapped.

## Project Metadata

The generated project uses `.md-editor/_md_editor_project.json` to remember the original source root. Recovery context files live under `.md-editor/recovery/`.

For developer internals, see [Project Metadata And Recovery](../developer/10-project-metadata-and-recovery.md).

## Troubleshooting

| Symptom | What To Check |
| --- | --- |
| Update Project is unavailable | Confirm a folder is open in the desktop app. |
| No pending recovery context | Run the graph health Maven recovery step first. |
| Recovery is blocked | Run the generated batch or verify the expected JARs exist under the source root. |
| Original source links do not open | Set the original source root from the header source-root button. |
| Graph still looks stale | Refresh the folder or reopen the graph after Update Project completes. |

Previous: [Detailed Graph View Controls](graph-view-controls.md)  
Next: [5. Tools](05-tools.md)
