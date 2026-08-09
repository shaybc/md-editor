# Stage 7.11 Plan: Dedicated Extensions Settings and Authoring

## Summary

Move Extensions out of the general AI Companion page into a dedicated **Settings → AI → Extensions** tab immediately below Hooks.

The tab will support discovering, viewing, creating, editing, validating, duplicating, renaming, exporting, enabling, trusting, and safely deleting extension bundles. Bundled extensions remain read-only; profile and workspace extensions are editable.

## 1. Dedicated Extensions tab

- Add an **Extensions** navigation item below Hooks.
- Move the existing discovery, enablement, and trust controls from AI Companion into the new panel.
- Show a structured table with:
  - Name and ID.
  - Version.
  - Scope: bundled, profile, or workspace.
  - Skill, agent, hook, and external-server counts.
  - Enabled and trust status.
  - Validation status.
  - Available actions.
- Add toolbar actions:
  - Refresh.
  - Create extension.
  - Restore deleted extension.
- Display invalid bundles as diagnostic rows instead of silently excluding them.

## 2. Extension editor

Use a wide modal with fixed header and footer and a scrolling body.

Provide sections for:

- **General**
  - ID, display name, version, description, and scope.
  - ID is editable through an explicit Rename action after creation.
- **Skills**
  - Structured metadata fields, invocation rules, modes, paths, tools, model route, optional hooks, and Markdown instructions.
- **Agents**
  - Modes, capabilities, tool allow/deny lists, permissions, isolation, model route, and Markdown instructions.
- **Hooks**
  - Reuse the existing lifecycle automation form and action-chain editor.
- **External servers**
  - Transport, URL or command, arguments, working directory, headers, and environment references.
- **Advanced source**
  - Show generated manifest and contribution source files.
  - Allow raw editing only through an explicit advanced mode.
  - Structured fields reload after valid raw-source edits.

Every field receives a detailed `i` explanation using the viewport-safe tooltip system.

## 3. Canonical bundle layout

New extensions use a deterministic layout:

```text
<extension-id>/
  extension.json
  skills/<skill-id>.md
  agents/<agent-id>.md
  hooks/<hook-id>.json
  external-servers/<server-id>.json
```

Existing extensions retain their current contribution paths unless a contribution is explicitly renamed.

The editor operates on one structured draft containing the manifest, contribution metadata, instruction bodies, paths, and original digest.

## 4. Validation

Reuse the existing authoritative validators:

- Manifest normalization.
- Skill definition policy.
- Agent definition policy.
- Lifecycle automation policy.
- External-server configuration policy.
- Bundle path and symlink protections.

Add whole-bundle validation for:

- Duplicate bundle and contribution IDs.
- Missing or unreferenced files.
- Unsafe paths and symlink escapes.
- Invalid internal agent, skill, tool, or delegated-run references.
- Unsupported modes, permissions, routes, or action types.
- Secret-like values that should use environment references.

Saving is blocked until errors are resolved. Warnings remain visible but do not block valid saves.

## 5. Safe extension repository

Add a dedicated `ExtensionAuthoringRepository` rather than writing files from UI code.

- Accept only canonical scope and extension IDs—never arbitrary bundle paths.
- Stage every create or update in a temporary sibling directory.
- Validate the staged bundle through normal discovery.
- Replace the existing bundle atomically with rollback protection.
- Serialize writes per profile/workspace extension root.
- Require the original digest when updating to prevent overwriting external changes.
- Keep autonomous runs on their current extension snapshot; edits affect subsequent runs.

New profile and workspace extensions are created disabled.

Workspace changes invalidate the previous trust digest and require explicit re-trust.

## 6. Extension operations

- **View:** available for every scope.
- **Edit:** profile and workspace extensions only.
- **Rename:** transactionally update manifest ID, directory name, state references, and contribution paths.
- **Duplicate:** copy any extension into profile or workspace scope under a new ID; the copy starts disabled.
- **Export:** copy the complete validated bundle to a user-selected directory.
- **Delete:** move editable bundles to a scope-local recovery directory instead of permanently deleting them.
- **Restore:** restore a deleted bundle when its ID is still available.
- **Enable/disable:** preserve the existing state mechanism.
- **Trust:** preserve digest-based workspace trust.
- **Repair:** editable invalid bundles open in a restricted manifest/source repair editor.

## 7. Bridge interfaces

Retain:

- `extensionsList`
- `extensionConfigure`

Add:

- `extensionRead({ scope, id })`
- `extensionValidate({ draft })`
- `extensionSave({ operation, scope, id, expectedDigest, draft })`
- `extensionRename({ scope, id, newId, expectedDigest })`
- `extensionDuplicate({ sourceScope, id, targetScope, newId })`
- `extensionExport({ scope, id, destination })`
- `extensionTrash({ scope, id, expectedDigest })`
- `extensionRestore({ scope, recoveryId })`

Results return authoritative manifest metadata, digest, trust state, contribution summaries, warnings, and validation errors. Secret values and raw instruction bodies are excluded from list responses.

## 8. UX behavior

- Refresh the table whenever the tab opens and after every operation.
- Warn before trust-invalidating workspace edits.
- Require typed extension ID confirmation before deletion.
- Show unsaved-change confirmation before closing the editor.
- Preserve a draft if validation fails.
- Clearly label bundled extensions as read-only.
- Keep the existing Hooks tab for profile-level lifecycle automation; extension-owned hooks are edited inside their extension.

## Acceptance criteria

- Bundled extensions appear automatically and cannot be modified or deleted.
- A profile or workspace extension can be created entirely through structured forms.
- Every contribution type can be created, edited, renamed, and removed.
- Saved bundles are immediately discoverable and become available to new autonomous runs after enablement and trust.
- Invalid source cannot partially overwrite a working bundle.
- External file changes produce a digest conflict instead of silent data loss.
- Workspace edits revoke stale trust.
- Duplicate, export, recoverable deletion, and restoration preserve complete multi-file bundles.
- Existing manually created bundles remain readable without migration.
- The general AI Companion settings page no longer contains the Extensions subsection.

## Expected files to change:

- [index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [styles.css](C:/GitHub/shaybc/md-editor/desktop-app/resources/styles.css)
- [script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [extension-settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/extension-settings.js)
- [neutralino-ai-bridge.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/neutralino-ai-bridge.js)
- [AI Companion bridge](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs)
- [extension-service.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-service.js)
- [bundle-discovery.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/bundle-discovery.js)
- [manifest-schema.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/manifest-schema.js)
- [extension-state-store.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/extension-state-store.js)
- New backend modules under [extension authoring](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/orchestration/autonomous/extensions/authoring)
- New UI modules under [extension settings components](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/extensions)
- A reusable lifecycle form extracted from [lifecycle-settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/lifecycle-settings.js)