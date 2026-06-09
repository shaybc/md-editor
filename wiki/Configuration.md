# Configuration

This page documents configuration files, persisted preferences, settings-screen options, and runtime UI options in **MD-Editor**.

---

## Table of Contents

- [Configuration Model](#configuration-model)
- [Settings Screen](#settings-screen)
- [Graph View Runtime Options](#graph-view-runtime-options)
- [Workspace And UI Preferences](#workspace-and-ui-preferences)
- [Local Storage And Profile Data](#local-storage-and-profile-data)
- [Web Application Files](#web-application-files)
- [Docker And Nginx](#docker-and-nginx)
- [Docker Compose](#docker-compose)
- [Desktop App - neutralino.config.json](#desktop-app---neutralinoconfigjson)
- [Desktop App - package.json Scripts](#desktop-app---packagejson-scripts)
- [Network And Offline Configuration](#network-and-offline-configuration)

---

## Configuration Model

MD-Editor is a static, local-first application. There is no backend configuration file for the web app.

Configuration comes from four places:

- Source files in `web-app/`, `desktop-app/`, and `code_converter/`.
- User preferences saved in browser `localStorage`.
- Browser storage APIs, such as Cache Storage and IndexedDB, for caches and recent file handles.
- Neutralino profile files when running the desktop app.

Most user-facing preferences are changed from the app UI and saved automatically.

---

## Settings Screen

Open **Settings** from the main action menu or mobile menu.

### Graph View

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Auto-clustering threshold | `1000` | `0` to `100000` | Node count threshold used by large-graph auto-clustering behavior. |
| Render warning threshold | `1500` | `0` to `100000` | Node count that can trigger a warning before opening very large graph selections. |
| Most referenced group size (%) | `10` | `1` to `100` | Percentage used when grouping highly referenced graph nodes. |
| Auto-collapse clusters | `false` | On/off | Collapse clusters above the configured threshold. |
| Dim other nodes | `false` | On/off | Fade unrelated nodes during graph hover. |
| Show connected labels | `true` | On/off | Reveal labels for hovered and connected graph nodes. |
| Highlight connected lines | `true` | On/off | Highlight connected hover links. |
| Show file extensions | `false` | On/off | Include file extensions in graph labels. |
| Default node color | `#58a6ff` | Color | Base color for graph nodes. |
| Find highlight color | `#ffff00` | Color | Highlight color used by graph find. |

### Recent Items

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Maximum recent files | `10` | `0` to `100` | Number of recent files kept in the action menu. |
| Maximum recent folders | `10` | `0` to `100` | Number of recent folders kept in the action menu. |

### Interface

| Setting | Default | Range | Description |
|---------|---------|-------|-------------|
| Menu tooltip delay (ms) | `3000` | `0` to `10000` | Delay before context menu tooltips appear. |

### Confirmations

| Setting | Default | Description |
|---------|---------|-------------|
| Opening many graph nodes | `true` | Ask before opening a very large graph selection. |
| Deleting files or folders | `true` | Ask before removing content from disk. |
| Resetting state | `true` | Ask before clearing preferences, cache, or history. |

### Reset Actions

| Action | Effect |
|--------|--------|
| Clear cache | Clears graph render cache and browser Cache Storage where available. It does not remove open documents, preferences, or recent history. |
| Clear preferences | Resets saved view, theme, layout, graph, folder, sync, and tag preferences. Open documents and recent items are preserved. |
| Clear recent history | Removes recent file and folder lists. |
| Reset all | Clears cache, preferences, and recent history. |

---

## Graph View Runtime Options

Graph View has per-view controls in the filter panel. These are separate from the global Settings dialog.

### Filters

| Control | Description |
|---------|-------------|
| Search files | Filters graph nodes by file name or path. |
| Show tags / Hide tags | Shows or hides tag nodes and tag links. |
| Selected tag | Chooses a tag to focus on. |
| Only files with selected tag | Limits the graph to files carrying the selected tag. |

### Groups

Graph groups color matching files. Query prefixes include:

```text
path:
file:
tag:
links:
text:
line:
```

Use **Add group** to create a new graph group rule.

### Display

| Control | Range | Description |
|---------|-------|-------------|
| Arrows | On/off | Shows direction arrows on graph links. |
| Orphans | On/off | Shows isolated graph nodes. |
| Labels | On/off | Shows graph node labels. |
| Text fade threshold | `0` to `1` | Controls when labels fade based on zoom and node importance. |
| Node size | `0.4` to `1.8` | Scales graph node sizes. |
| Link thickness | `0.5` to `4` | Scales graph edge thickness. |

### Forces

| Control | Range | Description |
|---------|-------|-------------|
| Center force | `0` to `2` | Pulls the graph toward the center. |
| Repel force | `0` to `1200` | Controls spacing between nodes. |
| Link force | `0` to `1` | Controls how strongly linked nodes pull together. |
| Link distance | `40` to `320` | Sets preferred distance between linked nodes. |
| Group force | `0` to `1` | Controls grouping force strength. |
| Reset to defaults | - | Resets graph filters, display, and force settings. |

Graph layout state and per-graph view preferences are saved with tabs and graph documents where applicable.

---

## Workspace And UI Preferences

The app also persists workflow preferences outside the Settings screen.

| Preference | Default | Where it is controlled |
|------------|---------|------------------------|
| Theme | System preference, then saved `light` or `dark` | Main/mobile theme toggle |
| View mode | `split` | Editor/Split/Preview buttons |
| Sync scrolling | `true` | Sync Scroll button |
| Editor width | `50%` | Split-pane resizer |
| Sidebar visibility | `true` | Sidebar toggle |
| Sidebar width | App default | Sidebar width resizer |
| Sidebar dropzone visibility | `true` | Dropzone/sidebar controls |
| Sidebar dropzone height | App default | Dropzone height resizer |
| Folder sort mode | `name-asc` | Folder tree sort menu |
| Auto select file | `true` | Folder tree toolbar |
| Show unsupported folder files | `false` | Folder tree toolbar |
| Graph magnetic forces | `true` | Graph quick actions |

Folder sort modes:

| Mode | Description |
|------|-------------|
| `name-asc` | File name A to Z. |
| `name-desc` | File name Z to A. |
| `modified-desc` | Modified time, newest first. |
| `modified-asc` | Modified time, oldest first. |
| `created-desc` | Created time, newest first. |
| `created-asc` | Created time, oldest first. |

---

## Local Storage And Profile Data

### Browser localStorage

| Key | Type | Description |
|-----|------|-------------|
| `markdownViewerGlobalState` | Object | Main preference object for settings, theme, layout, graph, folder, sync, and view state. |
| `markdownViewerTabs` | Array | Persisted open tabs, including Markdown tabs and graph tabs. |
| `markdownViewerActiveTab` | String | Identifier of the active tab restored on reload. |
| `markdownViewerUntitledCounter` | Number | Counter used for generated untitled document names. |
| `markdownViewerRecentFiles` | Array | Recent file list. |
| `markdownViewerRecentFolders` | Array | Recent folder list. |

The main preference object can contain these fields:

```json
{
  "autoSelectFileEnabled": true,
  "editorWidthPercent": 50,
  "folderSortMode": "name-asc",
  "confirmDeleteFiles": true,
  "confirmOpenManyGraphNodes": true,
  "confirmResetState": true,
  "contextMenuTooltipDelayMs": 3000,
  "graphAutoClusterLargeMapsEnabled": false,
  "graphAutoClusterThreshold": 1000,
  "graphLargeMapHoverDimOtherNodes": false,
  "graphLargeMapHoverShowConnectedLabels": true,
  "graphLargeMapHoverHighlightConnectedLines": true,
  "graphRenderWarningThreshold": 1500,
  "graphMostReferencedPercent": 10,
  "graphShowFileExtensions": false,
  "graphNodeDefaultColor": "#58a6ff",
  "graphFindHighlightColor": "#ffff00",
  "graphMagneticEnabled": true,
  "graphViewPreferences": {},
  "maxRecentFiles": 10,
  "maxRecentFolders": 10,
  "showUnsupportedFolderFiles": false,
  "sidebarDropzoneVisible": true,
  "sidebarVisible": true,
  "syncScrollingEnabled": true,
  "theme": "light",
  "viewMode": "split"
}
```

Additional tab, graph, and document state is also stored locally by the app modules.

### Browser IndexedDB

The recent-items module uses an IndexedDB database named `markdownViewerRecentHandles` to cache browser file-system handles when supported.

### Desktop Profile Data

In the Neutralino desktop runtime, recent items and preferences are mirrored through profile files:

| File | Purpose |
|------|---------|
| `.mdviewer/recent-items.json` | Recent file and folder data. |
| `.mdviewer/preferences.json` | Global preferences. |

Exact profile location is controlled by the Neutralino runtime and operating system profile path.

---

## Web Application Files

The web app lives in `web-app/`.

| File | Purpose |
|------|---------|
| `index.html` | HTML shell, modals, toolbar, settings screen, CDN references, and graph UI controls. |
| `script.js` | Main app controller and startup glue. |
| `styles.css` | Application styling and theme variables. |
| `js/` | Modular app behavior for files, graph, markdown rendering, tabs, sidebar, import, export, recent items, and UI preferences. |
| `assets/` | Icons, badges, screenshots, and app images. |
| `Dockerfile` | Nginx-based static container build. |
| `docker-compose.yml` | Local Docker Compose setup. |

Library versions are defined by the `<script>` and `<link>` tags in `web-app/index.html`. To pin or upgrade a browser library, update the matching tag and test rendering, export, graph, and desktop flows.

---

## Docker And Nginx

`web-app/Dockerfile` builds a static Nginx image from the local `web-app/` directory.

| Setting | Value | Description |
|---------|-------|-------------|
| Base image | `nginx:alpine` | Static file server. |
| Listen port | `80` | HTTP port inside the container. |
| Document root | `/usr/share/nginx/html` | Static file directory. |
| SPA routing | `try_files $uri $uri/ /index.html` | Fallback to `index.html`. |
| Static asset cache | `1 year` | `Cache-Control: public, immutable`. |
| X-Frame-Options | `SAMEORIGIN` | Prevents most cross-site embedding. |
| X-Content-Type-Options | `nosniff` | Prevents MIME sniffing. |
| X-XSS-Protection | `1; mode=block` | Legacy browser XSS protection header. |
| Referrer-Policy | `strict-origin-when-cross-origin` | Limits referrer data. |

To customize Nginx behavior, edit `web-app/Dockerfile` and rebuild the image.

---

## Docker Compose

The current `web-app/docker-compose.yml` builds locally:

```yaml
version: '3.8'

services:
  md-editor:
    build:
      context: .
      dockerfile: Dockerfile
    ports:
      - "8080:80"
    container_name: md-editor
    restart: unless-stopped
    environment:
      - NGINX_HOST=localhost
      - NGINX_PORT=80
```

Configurable fields:

| Field | Default | Description |
|-------|---------|-------------|
| `build.context` | `.` | Build context, relative to `web-app/`. |
| `build.dockerfile` | `Dockerfile` | Dockerfile used for the static image. |
| `ports` | `8080:80` | Host-to-container port mapping. |
| `container_name` | `md-editor` | Container name. |
| `restart` | `unless-stopped` | Container restart policy. |
| `environment` | `NGINX_HOST`, `NGINX_PORT` | Present in compose, but not templated by the current Dockerfile. |

The compose file does not reference a published GHCR image by default.

---

## Desktop App - neutralino.config.json

Desktop runtime configuration is in `desktop-app/neutralino.config.json`.

```jsonc
{
  "$schema": "https://raw.githubusercontent.com/neutralinojs/neutralinojs/main/schemas/neutralino.config.schema.json",
  "applicationId": "js.neutralino.sample",
  "version": "7.2.0",
  "defaultMode": "window",
  "port": 0,
  "documentRoot": "/resources/",
  "url": "/",
  "enableServer": true,
  "enableNativeAPI": true,
  "tokenSecurity": "one-time",
  "logging": {
    "enabled": true,
    "writeToLogFile": true
  },
  "nativeAllowList": [
    "app.*",
    "os.*",
    "filesystem.readFile",
    "filesystem.readBinaryFile",
    "filesystem.writeFile",
    "filesystem.readDirectory",
    "filesystem.getStats",
    "filesystem.createDirectory",
    "debug.log",
    "filesystem.remove",
    "filesystem.move",
    "clipboard.writeText",
    "os.execCommand"
  ],
  "modes": {
    "window": {
      "title": "MD-Editor",
      "width": 800,
      "height": 500,
      "minWidth": 400,
      "minHeight": 200,
      "center": true,
      "icon": "/resources/assets/icon.ico",
      "enableInspector": false,
      "resizable": true,
      "exitProcessOnClose": true
    }
  },
  "cli": {
    "binaryName": "md-editor",
    "resourcesPath": "/resources/",
    "extensionsPath": "/extensions/",
    "clientLibrary": "/resources/js/neutralino.js",
    "binaryVersion": "6.5.0",
    "clientVersion": "6.5.0"
  }
}
```

Key fields:

| Field | Description |
|-------|-------------|
| `applicationId` | Desktop application identifier. |
| `documentRoot` | Root path for packaged resources. |
| `enableNativeAPI` | Enables Neutralino native APIs used by the desktop app. |
| `nativeAllowList` | Limits which native APIs are callable. |
| `modes.window` | Window title, size, icon, inspector, and close behavior. |
| `modes.browser`, `modes.cloud`, `modes.chrome` | Alternative Neutralino modes with their own native API restrictions. |
| `cli.binaryName` | Prefix for generated desktop binaries. |
| `cli.binaryVersion` | Neutralino binary runtime version downloaded by setup. |
| `cli.clientVersion` | Neutralino client library version. |

---

## Desktop App - package.json Scripts

Desktop scripts are defined in `desktop-app/package.json`.

| Script | Command | Description |
|--------|---------|-------------|
| `setup` | `node setup-binaries.js && node download-vendor.js` | Downloads Neutralino platform binaries and vendored desktop assets. |
| `postsetup` | `node prepare.js` | Copies shared web resources into desktop resources after setup. |
| `predev` | `npm run setup` | Runs setup before development launch. |
| `dev` | `npx -y @neutralinojs/neu@11.7.0 run` | Starts the desktop app with Neutralino. |
| `prebuild` | `npm run setup` | Runs setup before building. |
| `build` | `npx -y @neutralinojs/neu@11.7.0 build --embed-resources` | Builds embedded desktop binaries. |
| `build:portable` | `npx -y @neutralinojs/neu@11.7.0 build --release` | Builds portable resource-separated output. |
| `build:all` | `npm run build && npm run build:portable` | Builds both formats. |

---

## Network And Offline Configuration

MD-Editor is local-first, but some optional flows use network resources:

- CDN libraries are referenced from `web-app/index.html`.
- GitHub import uses public GitHub APIs and raw file URLs.
- Desktop setup downloads Neutralino binaries and vendored assets on first setup.

For offline or isolated deployments:

- Replace CDN references in `web-app/index.html` with local assets.
- Run `node prepare.js` in `desktop-app/` after changing shared web resources.
- Avoid GitHub import or provide an internal equivalent workflow.
- Rebuild Docker images after changing web assets or Nginx configuration.

This checkout does not include `.github/workflows` automation, so Docker publishing and desktop release automation are not configured here by default.
