---
tags: []
---
# 11. Desktop Setup And Troubleshooting

MD-Editor is currently documented here as a Neutralino desktop app rooted in `desktop-app/`.

## Run From A Fresh Clone

From the repository root:

```powershell
cd desktop-app
npm install
npm run setup
npm run prod
```

What the commands do:

| Command | Purpose |
| --- | --- |
| `npm install` | Installs Node dependencies used by setup, bridges, language servers, Git, terminal, AI Companion, tests, and builds. |
| `npm run setup` | Downloads Neutralino runtime binaries and vendor browser assets when they are missing. |
| `npm run prod` | Starts the checked-in desktop resources with the cached Neutralino binary. |

The desktop app can sometimes start before `node_modules` exists because normal rendering uses files already under `desktop-app/resources` and the Neutralino binary under `desktop-app/bin`. Features backed by Node packages still need `npm install`.

## Build Outputs

Useful build commands:

| Command | Purpose |
| --- | --- |
| `npm run build` | Builds an embedded-resource desktop binary. |
| `npm run build:portable` | Builds a release/portable resource layout. |
| `npm run build:all` | Runs both build modes. |

Builds use `run-neutralino.js`, `neutralino.config.json`, and the resources under `desktop-app/resources`.

## Offline And Vendored Assets

Core UI scripts, Help files, CodeMirror bundle, images, and vendor browser assets live under `desktop-app/resources`. `npm run setup` refreshes binary/runtime assets that are not practical to edit by hand.

Provider-backed features still need their own external service access. Examples include AI model providers, Git remotes, API requests, and download/install actions for optional language servers.

## Common Problems

| Problem | What To Check |
| --- | --- |
| App starts but Git, terminal, AI, or search agent tools fail | Run `npm install` in `desktop-app`. These features use Node-backed dependencies. |
| Neutralino binary is missing | Run `npm run setup`. |
| Vendor browser files are missing | Run `npm run setup`. |
| Desktop resources look stale | Verify you are running from this checkout's `desktop-app` and not an older packaged copy. |
| Native filesystem actions fail | Confirm the app is running as the desktop app, not as a plain browser page. |
| Language-server install/status looks wrong | Open Settings -> Language Servers and check installed/bundled source and debug messages. |

Related pages:

- [Frequently Asked Questions](faq.md)
- [Settings And Data](06-settings-and-data.md)
- [Developer Build And Release](../developer/07-build-and-release.md)

Previous: [10. Frequently Asked Questions](faq.md)
Next: [12. Release Notes](release-notes.md)
