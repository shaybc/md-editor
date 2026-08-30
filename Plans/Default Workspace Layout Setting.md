# Default Workspace Layout Setting

## Summary
Add an Interface setting that controls which workspace layout MD-Editor opens on launch: Develop, Debug, AI, or Last used. Default remains Develop to preserve current behavior. This will not change Editor/Split/Preview view mode behavior.

## Expected files to change:
- [desktop-app/resources/index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html)
- [desktop-app/resources/js/script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js)
- [desktop-app/tests/migration-smoke.test.js](C:/GitHub/shaybc/md-editor/desktop-app/tests/migration-smoke.test.js)

## Key Changes
- Add a new select field under Settings > Interface, near the existing layout/interface controls:
  - `settings-default-workspace-layout`
  - Options:
    - `developer`: Develop Layout
    - `debug`: Debug Layout
    - `ai`: AI Layout
    - `last-used`: Last used layout
- Add global state keys:
  - `defaultWorkspaceLayout: "developer"` in `DEFAULT_GLOBAL_STATE`
  - `lastWorkspaceLayout: "developer"` tracked when the user switches layouts
- Add normalization helper logic in `script.js`:
  - Accept only `developer`, `debug`, `ai`, `last-used` for the setting.
  - Accept only `developer`, `debug`, `ai` for the saved last-used layout.
  - Fall back to `developer` for invalid or missing values.
- Update settings hydration and save:
  - `showSettingsDialog()` sets the select to the saved default workspace layout.
  - Settings save persists `defaultWorkspaceLayout`.
- Update layout switching:
  - Manual selection of Develop/Debug/AI stores `lastWorkspaceLayout`.
  - Startup resolves `defaultWorkspaceLayout`:
    - `developer` opens Develop.
    - `debug` opens Debug through the existing Java debug perspective path.
    - `ai` opens AI through the existing AI sidebar path.
    - `last-used` opens the saved `lastWorkspaceLayout`, defaulting to Develop if missing/invalid.
- Keep existing layout behavior intact:
  - Debug still uses `javaDebugPanel.openPerspective()`.
  - AI still uses `workspaceSearch.setSidebarView("ai-companion")`.
  - Develop still closes AI workspace and debug perspective using existing calls.
  - Editor/Split/Preview `viewMode` remains untouched.

## Test Plan
- Update migration smoke coverage to assert:
  - Interface settings contains `settings-default-workspace-layout`.
  - The select exposes Develop, Debug, AI, and Last used options.
  - `DEFAULT_GLOBAL_STATE` includes `defaultWorkspaceLayout: "developer"` and `lastWorkspaceLayout: "developer"`.
  - Settings save includes `defaultWorkspaceLayout`.
  - Startup layout resolution references `defaultWorkspaceLayout` and `lastWorkspaceLayout`.
- Run:
  - `node --test desktop-app/tests/migration-smoke.test.js`
  - `node --check desktop-app/resources/js/script.js`

## Assumptions
- “View and layout” means the workspace layout selector only, not Editor/Split/Preview view mode.
- Default remains Develop so existing users see no behavior change until they choose another default.
- No new files are needed; the smallest scoped change is to extend the existing settings markup, global state, layout selector handling, and smoke tests.
- Unrelated settings, dialogs, menu layout, sidebar layout, tab style, AI settings, debug settings, and editor view-mode persistence must not be refactored or changed.
