---
tags: []
---
# 10. Project Metadata And Recovery

This page covers opened folder/project metadata, source-root metadata, Maven dependency recovery, and Update Project internals.

## 10.1. Opened Folder Identity

When a folder is open, the header shows folder identity instead of only the app brand:

- Folder display name.
- Absolute folder path when available.
- Source-root button for generated projects.

The source-root button is desktop-only. It writes project metadata used by original-source links, graph health reports, and dependency recovery.

## 10.2. Project Metadata Folder

Generated-code documentation projects use a hidden `.md-editor/` folder.

| Path | Purpose |
| --- | --- |
| `.md-editor/_md_editor_project.json` | Source-root metadata for generated Markdown projects. |
| `.md-editor/recovery/` | Recovery context workspace. |
| `.md-editor/recovery/maven-recovery-context.json` | Pending Maven recovery context consumed by Update Project. |
| `.md-editor/missing_dependencies_report.json` | Dependency report written by conversion or health workflows when available. |

The folder tree and search flows skip `.md-editor/` so metadata files do not clutter user navigation.

## 10.3. Metadata Schema

```json
{
  "schemaVersion": 1,
  "type": "md-editor-generated-code-folder",
  "sourceRootPath": "C:/Projects/service/src",
  "sourcePathMode": "relative-to-source-root",
  "createdAt": "2024-01-01T00:00:00.000Z",
  "updatedAt": "2024-01-01T00:00:00.000Z"
}
```

`sourcePathMode` is currently `relative-to-source-root`. Generated Markdown source paths are resolved against `sourceRootPath`.

## 10.4. Current Source Files

| Area | Current Path |
| --- | --- |
| Source-root metadata | `desktop-app/resources/js/project/source-root.js` |
| Recovery updater | `desktop-app/resources/js/project/recovery-updater.js` |
| Graph Maven recovery | `desktop-app/resources/js/graph/maven-recovery.js` |
| Graph health report | `desktop-app/resources/js/graph/health.js` |
| Graph package summary | `desktop-app/resources/js/graph/package-summary.js` |

## 10.5. Update Project Flow

Update Project starts from a folder seed, finds the generated project root, reads the pending Maven recovery context, checks expected JAR paths, creates external dependency Markdown stubs, updates affected generated Markdown files, and writes a summary status.

Status outcomes:

| Status | Meaning |
| --- | --- |
| `applied` | Expected JARs were found and affected Markdown files were updated. |
| `partial` | Some dependencies were applied and some remain blocked. |
| `blocked` | Required JARs were not found. |
| `noop` | No pending context or nothing to apply. |

## 10.6. User Workflow

The user-facing recovery guide is [Maven Dependency Recovery And Update Project](../user/maven-dependency-recovery.md).

Previous: [9. AI Companion Internals](09-ai-companion-internals.md)  
Next: [11. LSP Integration Internals](11-lsp-integration-internals.md)
