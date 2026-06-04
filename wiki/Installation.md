# Installation

This page describes the supported ways to install and run **MD-Editor** from this repository.

---

## Table of Contents

- [Option 1 - Run The Web App Locally](#option-1---run-the-web-app-locally)
- [Option 2 - Docker Compose](#option-2---docker-compose)
- [Option 3 - Docker Build](#option-3---docker-build)
- [Option 4 - Desktop Application](#option-4---desktop-application)
- [Option 5 - Self-Hosted Static Server](#option-5---self-hosted-static-server)
- [Network And Offline Notes](#network-and-offline-notes)
- [System Requirements](#system-requirements)

---

## Option 1 - Run The Web App Locally

MD-Editor is a static web app. You can run it from the repository root with any local static file server.

### 1. Clone the repository

```bash
git clone https://github.com/shaybc/md-editor.git
cd md-editor
```

### 2. Start a local server

Using Python:

```bash
python -m http.server 9500 --directory web-app
```

Then open:

```text
http://localhost:9500/
```

On Windows, you can also use the helper script from the repository root. It pulls the latest changes, opens the browser, and starts the local server:

```bat
start_web.bat
```

> Note: Opening `web-app/index.html` directly with `file://` can work for simple editing, but some browser APIs are restricted from local files. A local server is recommended.

---

## Option 2 - Docker Compose

Use Docker Compose when you want a repeatable local container setup.

### 1. Clone the repository

```bash
git clone https://github.com/shaybc/md-editor.git
cd md-editor/web-app
```

### 2. Build and start the container

```bash
docker compose up --build
```

The app starts on:

```text
http://localhost:8080/
```

### 3. Stop the container

```bash
docker compose down
```

The included `web-app/docker-compose.yml` builds the local Dockerfile:

```yaml
services:
  md-editor:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    container_name: md-editor
    restart: unless-stopped
```

Change the host port by editing the left side of `8080:80`, for example `3000:80`.

---

## Option 3 - Docker Build

You can build and run the web app image directly.

```bash
cd web-app
docker build -t md-editor:local .
docker run --rm -p 8080:80 --name md-editor md-editor:local
```

Then open:

```text
http://localhost:8080/
```

The Docker image serves the static files with Nginx. It does not run a backend application server.

---

## Option 4 - Desktop Application

MD-Editor also has a Neutralino-powered desktop app that uses the same core web UI.

### Run in development mode

```bash
cd desktop-app
npm run dev
```

The `dev` script runs setup first. Setup downloads Neutralino platform binaries, downloads vendored desktop assets, prepares the shared web resources, and then starts the desktop app.

On Windows, you can also use the helper script from the repository root. It starts the desktop dev command without a network check, which is useful for offline machines:

```bat
start_desktop.bat
```

To pull the latest repository changes before starting, run:

```bat
start_desktop.bat --pull
```

### Build desktop binaries

```bash
cd desktop-app
npm run build
```

Build a portable resource-separated package:

```bash
npm run build:portable
```

Build both formats:

```bash
npm run build:all
```

Build output is written under `desktop-app/dist/`. Platform binaries are cached in `desktop-app/bin/` and are refreshed when the configured Neutralino binary version changes.

### Pre-built binaries

If this repository has GitHub Releases available, download desktop binaries from:

[https://github.com/shaybc/md-editor/releases](https://github.com/shaybc/md-editor/releases)

Expected asset names use the `md-editor` prefix, such as:

| Platform | Example asset |
|----------|---------------|
| Windows x64 | `md-editor-win_x64.exe` |
| Linux x64 | `md-editor-linux_x64.tar.gz` |
| Linux ARM64 | `md-editor-linux_arm64.tar.gz` |
| macOS | `md-editor-mac_*.tar.gz` |
| Portable bundle | `md-editor-release.zip` |

If no release is published yet, build from source with the commands above.

---

## Option 5 - Self-Hosted Static Server

For production or internal use, serve the contents of `web-app/` from any static web server.

Examples:

```bash
python -m http.server 8080 --directory web-app
```

```bash
npx serve web-app -p 8080
```

You can also copy `web-app/` to an existing Nginx, Apache, Caddy, IIS, or static hosting setup.

For fully offline deployments, review the CDN references in `web-app/index.html` and replace them with local assets or use the desktop vendoring flow as a reference.

---

## Network And Offline Notes

MD-Editor is a static, local-first application:

- Markdown rendering, tab state, graph state, and exports run locally in the browser or desktop app.
- The web build references public CDN libraries from `web-app/index.html`.
- GitHub import uses public GitHub APIs and raw file URLs.
- Share links encode document content into the URL hash instead of uploading it.
- The Docker image serves static files with Nginx and does not add analytics or a backend service.
- The desktop setup scripts may need network access the first time they download Neutralino binaries and vendored assets.

For isolated environments, vendor the CDN assets locally and avoid GitHub import.

---

## System Requirements

### Web App

| Requirement | Minimum |
|-------------|---------|
| Browser | Current Chrome, Edge, Firefox, or Safari |
| RAM | 512 MB |

### Docker

| Requirement | Minimum |
|-------------|---------|
| Docker | 20.10+ |
| Docker Compose | Compose v2 recommended |
| RAM | 512 MB |

### Desktop App

| Requirement | Minimum |
|-------------|---------|
| OS | Windows 10+, Ubuntu 20.04+, or macOS 11+ |
| Architecture | x64 or ARM64 |
| Node.js | Current LTS recommended for running or building from source |
| RAM | 512 MB |
