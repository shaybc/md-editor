# Desktop App

This page covers the **Neutralinojs desktop application** for **MD-Editor**.

---

## Table of Contents

- [Overview](#overview)
- [Architecture](#architecture)
- [Prerequisites](#prerequisites)
- [Development Setup](#development-setup)
- [Running In Development Mode](#running-in-development-mode)
- [Building The Desktop App](#building-the-desktop-app)
- [Build Output](#build-output)
- [Building With Docker](#building-with-docker)
- [Vendored Assets And Offline Use](#vendored-assets-and-offline-use)
- [Neutralino Configuration](#neutralino-configuration)
- [Release Status](#release-status)
- [Platform Notes](#platform-notes)
- [Troubleshooting](#troubleshooting)

---

## Overview

The desktop app wraps the same HTML, CSS, JavaScript, graph workflows, editor, preview, export tools, and code-to-Markdown converter used by the web app inside a native [Neutralinojs](https://neutralino.js.org/) window.

It provides:

- Native desktop window behavior.
- Native file and folder dialogs.
- Local filesystem access through the Neutralino allowlist.
- Shared web UI resources prepared from `web-app/`.
- Desktop-ready vendored third-party assets.
- Embedded and portable build modes.

---

## Architecture

```text
desktop-app/
├── package.json              # npm scripts for setup, dev, and builds
├── neutralino.config.json    # Neutralino runtime, window, API, and CLI config
├── setup-binaries.js         # Downloads Neutralino platform binaries into bin/
├── download-vendor.js        # Downloads desktop vendor assets listed in vendor-assets.json
├── vendor-assets.json        # CDN asset manifest for desktop vendoring
├── prepare.js                # Copies shared web resources into resources/
├── Dockerfile                # Containerized desktop build
├── docker-compose.yml        # Exports Docker build artifacts into output/
└── resources/
    ├── index.html            # Generated from web-app/index.html with desktop injections
    ├── styles.css            # Copied from web-app
    ├── script.js             # Copied from web-app
    ├── js/
    │   ├── main.js           # Neutralino lifecycle and desktop integrations
    │   └── neutralino.js     # Neutralino client library
    ├── assets/               # Copied web assets
    ├── vendor/               # Downloaded third-party desktop assets
    └── code_converter/       # Desktop copy of the code-to-Markdown converter
```

`prepare.js` keeps the desktop resources in sync with `web-app/`, so the web and desktop versions share one core implementation.

---

## Prerequisites

- Node.js current LTS recommended.
- npm.
- Internet access for first setup, unless required binaries and vendor assets are already cached.
- Docker, only if you want to use the containerized desktop build.

---

## Development Setup

Clone this repository:

```bash
git clone https://github.com/shaybc/md-editor.git
cd md-editor/desktop-app
```

Run setup:

```bash
npm run setup
```

The setup flow:

1. Downloads Neutralino platform binaries with `setup-binaries.js`.
2. Downloads desktop vendor assets with `download-vendor.js`.
3. Runs `prepare.js` through the `postsetup` script.
4. Copies shared web resources into `desktop-app/resources/`.

Neutralino binaries are cached in `desktop-app/bin/` and are refreshed when `cli.binaryVersion` changes in `neutralino.config.json`.

---

## Running In Development Mode

```bash
cd desktop-app
npm run dev
```

`npm run dev` automatically runs setup first through `predev`.

To enable the browser inspector for desktop debugging, set this field in `desktop-app/neutralino.config.json`:

```json
"enableInspector": true
```

---

## Building The Desktop App

### Embedded Build

Build embedded executables:

```bash
cd desktop-app
npm run build
```

This runs setup first through `prebuild` and then uses the local Neutralino runner:

```bash
node run-neutralino.js build --embed-resources
```

### Portable Build

Build a resource-separated release package:

```bash
npm run build:portable
```

### Build Both Formats

```bash
npm run build:all
```

---

## Build Output

Neutralino writes build artifacts under `desktop-app/dist/`.

Typical outputs use the configured binary prefix:

```text
dist/
├── md-editor-win_x64.exe
├── md-editor-linux_x64
├── md-editor-linux_arm64
├── md-editor-mac_*
└── ...
```

Exact file names can vary by Neutralino version, platform, and build mode. Portable builds include separate packaged resources instead of embedding everything into a single binary.

---

## Building With Docker

The desktop Docker build uses `desktop-app/Dockerfile` with the repository root as build context.

```bash
cd desktop-app
docker compose up --build
```

The compose file builds the desktop app and copies artifacts from the container into:

```text
desktop-app/output/
```

The current compose service is:

```yaml
services:
  desktop-build:
    build:
      context: ..
      dockerfile: desktop-app/Dockerfile
    container_name: md-editor-desktop-build
    volumes:
      - ./output:/export
```

The Docker build runs `npm run build:all`, so it may need network access to download Neutralino binaries and vendor assets.

---

## Vendored Assets And Offline Use

The desktop app has a vendoring flow for third-party browser assets:

- `vendor-assets.json` lists external CSS, JavaScript, fonts, MathJax, Mermaid, D3, Bootstrap, JoyPixels, export libraries, and other browser assets.
- `download-vendor.js` downloads those assets into the desktop resources.
- `prepare.js` rewrites the prepared desktop HTML so the Neutralino app can load local resources.

For fully offline desktop use:

1. Run `npm run setup` while online to download binaries and vendor assets.
2. Confirm the required files exist under `desktop-app/resources/vendor/`.
3. Rebuild with `npm run build` or `npm run build:portable`.
4. Avoid workflows that intentionally require network access, such as public GitHub import.

---

## Neutralino Configuration

The desktop runtime is configured in `desktop-app/neutralino.config.json`.

Important current values:

| Field | Value | Purpose |
|-------|-------|---------|
| `defaultMode` | `window` | Runs as a native window. |
| `documentRoot` | `/resources/` | Serves prepared desktop resources. |
| `url` | `/` | Entry URL inside the Neutralino server. |
| `enableNativeAPI` | `true` | Enables allowed native APIs. |
| `tokenSecurity` | `one-time` | Uses one-time native API token security. |
| `modes.window.title` | `MD-Editor` | Desktop window title. |
| `modes.window.width` / `height` | `800` / `500` | Initial window size. |
| `modes.window.minWidth` / `minHeight` | `400` / `200` | Minimum window size. |
| `modes.window.icon` | `/resources/assets/icon.ico` | Desktop icon. |
| `modes.window.enableInspector` | `false` | Set to `true` for debugging. |
| `cli.binaryName` | `md-editor` | Output binary prefix. |
| `cli.binaryVersion` | `6.5.0` | Neutralino binary runtime version. |
| `cli.clientVersion` | `6.5.0` | Neutralino client version. |

Allowed native APIs include app, selected filesystem methods, selected OS methods, clipboard text writing, and debug logging. See [Configuration](Configuration#desktop-app---neutralinoconfigjson) for the current allowlist.

---

## Release Status

This checkout does not currently include a `.github/workflows/desktop-build.yml` workflow, so automated desktop releases are not configured here by default.

If GitHub Releases exist for this repository, they are available at:

[https://github.com/shaybc/md-editor/releases](https://github.com/shaybc/md-editor/releases)

If no release is published yet, build from source with the commands above.

Expected asset names use the `md-editor` prefix, for example:

| Asset | Description |
|-------|-------------|
| `md-editor-win_x64.exe` | Windows x64 executable. |
| `md-editor-linux_x64.tar.gz` | Linux x64 archive. |
| `md-editor-linux_arm64.tar.gz` | Linux ARM64 archive. |
| `md-editor-mac_*.tar.gz` | macOS archive. |
| `md-editor-release.zip` | Portable bundle, if produced. |

If release automation is added later, update this page to match the actual workflow triggers, artifacts, checksums, and publishing target.

---

## Platform Notes

### Windows

- Run the `.exe` directly.
- Windows Defender SmartScreen may warn about unsigned binaries. Choose **More info** and **Run anyway** only if you trust the build source.
- Microsoft Edge WebView2 may be required by the platform runtime.

### Linux

Mark the binary as executable:

```bash
chmod +x md-editor-linux_x64
./md-editor-linux_x64
```

### macOS

macOS may block unsigned binaries:

```bash
xattr -d com.apple.quarantine md-editor-mac_universal
chmod +x md-editor-mac_universal
./md-editor-mac_universal
```

You can also right-click the binary in Finder, choose **Open**, and confirm the security prompt.

---

## Troubleshooting

### Setup fails while downloading binaries or vendor assets

Check network access and rerun:

```bash
cd desktop-app
npm run setup
```

### Desktop resources look stale

Run setup or prepare again after changing `web-app/` files:

```bash
cd desktop-app
npm run setup
```

or:

```bash
node prepare.js
```

### The app opens but native file actions fail

Check `nativeAllowList` in `neutralino.config.json`. Native file and OS actions only work when the matching Neutralino API is allowed.
