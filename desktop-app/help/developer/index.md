---
tags: []
---
﻿# MD-Editor Developer Guide

This guide is for developers and AI agents working on the desktop app. It maps user-visible features to runtime files, registration modules, key functions, data flows, and tests so implementation work can start from the right part of the codebase.

## Contents

- [1. Architecture](01-architecture.md)
  - Runtime layers
  - App bootstrap
  - Module registration
  - Desktop API boundary
- [2. Runtime And Resources](02-runtime-and-resources.md)
  - Neutralino launcher
  - Resource loading
  - Help loading
  - Profile paths
- [3. Modules](03-modules.md)
  - Tabs
  - Files
  - Markdown
  - Sidebar
  - Search
  - Settings/UI
- [4. Desktop Bridges](04-desktop-bridges.md)
  - Spawned process pattern
  - AI bridge
  - Git bridge
  - Terminal bridge
  - API Client bridge
- [5. Files, Folders, And Graph](05-files-folders-and-graph.md)
  - Folder open flow
  - File open/save flow
  - Graph extraction and rendering
  - Source-root and generated-doc workflows
- [6. Testing](06-testing.md)
  - Node tests
  - Playwright tests
  - Source invariants
  - Recommended coverage by feature type
- [7. Build And Release](07-build-and-release.md)
  - Setup
  - Run
  - Build
  - Release assets
- [8. Runtime Bridge Model](08-runtime-bridge-model.md)
  - Renderer, Neutralino runtime, and Node bridges
  - Built-in Neutralino API flow
  - AI Companion bridge flow
  - Choosing a communication path
- [9. AI Companion Internals](09-ai-companion-internals.md)
  - Developer harness
  - Conversation history internals
  - Token accounting
  - [AI Companion Agent Loop And Harness Internals](22-ai-companion-agent-loop-and-harnes-internals.md)
- [10. Project Metadata And Recovery](10-project-metadata-and-recovery.md)
  - Opened folder/project metadata
  - Maven recovery and Update Project internals
- [11. LSP Integration Internals](11-lsp-integration-internals.md)
  - Server registry
  - Neutralino LSP bridge
  - Supported server families
- [12. Settings Preference Map](12-settings-preference-map.md)
  - Preference areas
  - Persistence rules
- [13. Startup, Tabs, And Session Restore](13-startup-tabs-and-session.md)
  - Startup sequence
  - Tab profile payloads
  - Restore behavior
- [14. Markdown Preview And HTML Internals](14-markdown-preview-and-html.md)
  - Markdown render pipeline
  - HTML iframe preview
  - Mermaid and MathJax post-processing
- [15. Folder Tree And Context Menus](15-folder-tree-context-menus.md)
  - Folder toolbar state
  - File and folder context menus
  - Watcher interaction
- [16. Graph Controls Internals](16-graph-controls-internals.md)
  - Filters, groups, and forces
  - Quick actions and clusters
  - Health reports
- [17. Git Integration Internals](17-git-integration-internals.md)
  - Git bridge and panel flow
  - Status, stash, branch, and conflict behavior
- [18. Workspace Tools Internals](18-workspace-tools-internals.md)
  - File Compare, Sort Lines, converter, Line Counter, terminal, and API Client
- [19. Apache RAT Manager Internals](19-apache-rat-manager-internals.md)
  - RAT findings, investigation, resolution actions, previews, and verification
- [20. Apache RAT Policy Manager Internals](20-apache-rat-policy-manager-internals.md)
  - Proactive Maven policy setup, offline references, coverage, and safe generation
- [21. Maven Build Options Internals](21-maven-build-options-internals.md)
  - Descriptor providers, invocation sessions, persistence, rendering, and command composition
- [Contributing](contributing.md)

## Fast Code Map

| Feature | Start Here | Key Functions |
| --- | --- | --- |
| App startup | `desktop-app/run-neutralino.js`, `resources/js/main.js`, `resources/js/script.js` | `runNeutralinoRuntime()`, `Neutralino.init()`, `startMarkdownViewer()` |
| Help pages | `resources/js/script.js`, `resources/js/markdown/links.js`, `desktop-app/help/` | `fetchBundledWikiMarkdown()`, `openHelpHome()`, `openBundledWikiLinkFromPreview()` |
| Folder opening | `resources/js/files/open.js`, `resources/js/script.js` | `openFolderTreeFromNeutralinoPath()`, `listMarkdownTreeNeutralino()` |
| File opening | `resources/js/files/open.js`, `resources/js/files/types.js` | `openDocumentSourceFile()`, `openMarkdownSourceFile()` |
| Saving | `resources/js/files/save.js` | `saveActiveTabToSource()`, `saveActiveFileTabAs()`, `saveMarkdownTabToSource()` |
| Tabs | `resources/js/tabs/index.js`, `resources/js/tabs/persistence.js`, `resources/js/tabs/view-manager.js` | `newTab()`, `switchTab()`, `createGraphTab()`, `restoreTabsFromPayload()` |
| Markdown preview | `resources/js/markdown/render.js`, `resources/js/script.js` | `renderMarkdownContent()`, `renderMarkdown()` |
| Graph View | `resources/js/graph/*`, `resources/js/tabs/index.js` | `createGraphSnapshot()`, `renderGraphView()`, `extractMarkdownLinks()` |
| Search | `resources/js/search/*`, [Search Workflow Details](../user/search-workflows.md) | `openWorkspaceSearchModal()`, `openFileByNameModal()` |
| Git panel | `resources/js/git/workspace-git.js`, `resources/bridges/git-bridge/git-bridge.cjs`, [Git Integration Internals](17-git-integration-internals.md) | Git status, branch, stash, compare, and commit helpers |
| Code converter | `resources/js/script.js`, `desktop-app/converters/`, [Project Metadata And Recovery](10-project-metadata-and-recovery.md) | `runCodeConverter()`, `getCodeConverterScriptPath()`, `getJavaConverterRootCandidates()` |
| API Client | `resources/js/tools/api-client/*` | `openApiClient()`, `mountApiClientTab()`, `refreshFromStorage()` |
| AI Companion | `resources/js/ai-companion/*`, `resources/ai-companion/*`, [AI Companion Internals](09-ai-companion-internals.md) | `registerMarkdownViewerAiCompanionPanel()`, bridge request handlers |
| RAT policy | `resources/js/rat-policy/*`, `resources/assets/rat-policy/*`, [RAT Policy Internals](20-apache-rat-policy-manager-internals.md) | `ratPolicyManager.open()`, `ratPolicyChangePlanner.plan()` |
| Maven Build Options | `resources/js/project/maven-build-options/*`, [Maven Build Options Internals](21-maven-build-options-internals.md) | `mavenBuildOptions.createSession()`, `mavenBuildOptions.registerProvider()` |

Next: [1. Architecture](01-architecture.md)  
User Guide: [MD-Editor User Guide](../user/index.md)
