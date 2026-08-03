---
tags: []
---
# 7. Build And Release

This chapter covers the desktop app commands and the files they touch.

## 7.1. Setup

```bash
cd desktop-app
npm run setup
```

Setup runs:

- `setup-binaries.js` to download/cache Neutralino runtime binaries under `desktop-app/bin`.
- `download-vendor.js` to refresh local vendor assets used by the desktop resources.

Business reason: after setup, the app can run from local desktop resources without requiring users to assemble the runtime manually.

## 7.2. Run

```bash
cd desktop-app
npm run prod
```

This runs `node run-neutralino.js run`.

Implementation landmarks:

- `getNeutralinoRuntimeBinary()` chooses the platform binary.
- `getNeutralinoRuntimeRunArgs()` builds the run arguments.
- `runNeutralinoRuntime()` starts the app.
- `startDesktopAuthInfoServer()` and related functions pass auth info to the WebView.

## 7.3. Build

```bash
cd desktop-app
npm run build
npm run build:portable
npm run build:all
```

Build outputs go to the repository-level `dist` folder.

Build-related files:

| File | Role |
| --- | --- |
| `neutralino.config.json` | Neutralino build/runtime configuration. |
| `run-neutralino.js` | Wraps Neutralino CLI/runtime behavior. |
| `package-java-converter.js` | Packages Java converter artifacts after build. |
| `vendor-assets.json` | Declares vendored browser assets. |
| `setup-binaries.js` | Downloads Neutralino binaries. |
| `download-vendor.js` | Downloads vendored assets. |

## 7.4. Release Notes And Docs

User-facing changes should update [../user/release-notes.md](../user/release-notes.md) when they affect workflows, visible behavior, setup, data storage, or important limitations.

Developer-facing changes should update this guide when they add a new module, bridge, data flow, or testing pattern.

## 7.5. Build Checks

Before release or handoff, run the most relevant subset:

```bash
cd desktop-app
npm run check:js
npm test
npm run test:e2e
```

When the worktree has unrelated missing files, run targeted checks for the files you touched and clearly report any unrelated suite failures.

Previous: [6. Testing](06-testing.md)  
Next: [8. Runtime Bridge Model](08-runtime-bridge-model.md)