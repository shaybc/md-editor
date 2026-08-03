---
tags: []
---
# 12. Settings Preference Map

Settings are stored in global preference state and, on desktop, synced through profile data. This page maps settings areas to the state and modules that own them.

## 12.1. Core Files

| Area | Current Path |
| --- | --- |
| Settings screen behavior | `desktop-app/resources/js/ui/settings-screen.js` |
| Portable import/export | `desktop-app/resources/js/ui/settings-transfer.js` |
| Layout/default restore | `desktop-app/resources/js/ui/layout-preferences.js` |
| Main preference state and bindings | `desktop-app/resources/js/script.js` |
| Theme preferences | `desktop-app/resources/js/ui/theme-preferences.js` |
| AI Companion settings | `desktop-app/resources/js/ai-companion/settings.js` |
| AI model registry UI | `desktop-app/resources/js/ai-companion/models-settings.js` |

## 12.2. Preference Areas

| Settings Area | Stored/Applied Through |
| --- | --- |
| Interface and startup | Startup behavior, folder restore, sidebar/status/dropzone visibility, editor font, default view mode. |
| Folder view | Lazy loading, unsupported-file visibility, folder sort/filter, default expansion behavior. |
| Editor | Font, indentation, snippets, document-word autocomplete, language autocomplete, LSP autocomplete. |
| Themes | Built-in/custom app themes and CSS token overrides. |
| Syntax colors | Per-language CodeMirror token colors. |
| Graph View | Limits, clustering, labels, colors, force defaults, display defaults. |
| Language servers | Autostart preferences, install metadata, server status, JDK/POM support. |
| JDKs and Gradle | Converter runtime paths, Gradle mode, offline mode, user home, metadata failure policy. |
| API Client | History limit, redirects, timeout, SSL, cookies, no-cache, response size, render mode, proxy, HTTP version. |
| AI Companion | Enable flags, providers, models, approvals, autocomplete, token/output settings, panel preferences. |
| Debug | Log enablement, file output, level, categories, size/rotation. |
| Confirmations | Delete, move or copy, reset, and many-graph-node confirmation toggles. |
| Maintenance | Cache reset, preference reset, recent history reset, draft clearing, full reset. |

## 12.3. Persistence Rules

- Desktop profile preferences are hydrated before tab startup where possible.
- Settings import replaces known preference values and refreshes related UI.
- Reset preferences restores preference defaults without clearing open documents or recent items.
- Reset all is broader and clears caches, preferences, recent history, drafts, and stored state.
- Feature modules should read settings through existing helpers rather than adding unrelated storage keys.

## 12.4. Developer Guidance

When adding a setting:

1. Reuse the existing settings screen structure.
2. Add a default in the same state area as related settings.
3. Normalize imported values defensively.
4. Refresh the affected UI after save/import/reset.
5. Add tests for persistence and visible behavior when the setting changes.

Previous: [11. LSP Integration Internals](11-lsp-integration-internals.md)  
Back to: [Developer Guide](index.md)
