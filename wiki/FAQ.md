# FAQ

Frequently asked questions about **MD-Editor**.

---

## General

### What is MD-Editor?

MD-Editor is a local-first Markdown workspace for writing, previewing, organizing, graphing, and exporting technical documents. It runs as a static web app and as a Neutralino-powered desktop app.

### Is it free to use?

Yes. MD-Editor is free and open-source under the [Apache 2.0 License](../LICENSE).

### Do I need to create an account?

No. The app does not require sign-up, registration, or login.

### Does MD-Editor send my content to a server?

No for normal editing, previewing, graphing, exporting, and local file workflows. Markdown rendering, tab state, graph state, and exports happen in the browser or desktop app.

Some optional features can make network requests:

- Public GitHub import uses GitHub APIs and raw file URLs.
- The web build loads libraries from public CDNs unless you replace them with local assets.
- Desktop setup downloads Neutralino binaries and vendored assets the first time setup runs.

### Do you collect analytics or telemetry?

No. The app does not include analytics scripts, advertising pixels, cookies, or tracking beacons.

### What data is stored locally?

MD-Editor stores tab state, preferences, graph state, recent files/folders, and related workspace state locally. Browser builds use `localStorage`, IndexedDB for recent file handles where supported, and browser cache storage. The desktop app also mirrors recent items and preferences through Neutralino profile files.

See [Configuration](Configuration) for the current storage keys and settings.

### How do I clear my local data?

Use **Settings** inside the app to clear cache, preferences, recent history, or all stored app state. You can also use your browser's site data controls for the MD-Editor origin.

### Which browsers are supported?

Use a current version of Chrome, Edge, Firefox, or Safari. Folder workflows work best in Chromium-based browsers because File System Access support varies by browser.

---

## Features

### Does it support GitHub Flavored Markdown (GFM)?

Yes. MD-Editor supports GitHub Flavored Markdown features such as tables, task lists, strikethrough, autolinks, and fenced code blocks.

### Does it support frontmatter?

Yes. YAML frontmatter is parsed and rendered as document metadata. Tags in frontmatter can also be used by graph and folder workflows.

### Can I render mathematical equations?

Yes. MD-Editor supports LaTeX math via MathJax:

- Inline math: `$E = mc^2$`
- Block/display math: `$$\int_0^\infty e^{-x} dx = 1$$`

See [Markdown Reference - Math](Markdown-Reference#math-latex) for examples.

### Can I render diagrams?

Yes. MD-Editor supports Mermaid diagrams using fenced code blocks with the `mermaid` language identifier. Supported diagram types include flowcharts, sequence diagrams, class diagrams, state diagrams, entity-relationship diagrams, Gantt charts, pie charts, user journeys, git graphs, and mindmaps.

See [Features - Mermaid Diagrams](Features#mermaid-diagrams) for details.

### Can I work with multiple documents?

Yes. MD-Editor supports tabs for multiple Markdown documents, generated documentation, and graph views. Tabs can be created, renamed, duplicated, closed, restored, and reset.

### Can I open a folder?

Yes. You can open a folder of Markdown documents, browse it in the folder tree, sort/filter files, manage tags, and open graph views for the folder or selected areas.

### What is Graph View?

Graph View turns folders, Markdown links, tags, and generated dependency maps into an interactive relationship graph. It helps reveal document links, code dependencies, highly connected areas, and useful refactoring boundaries.

### Can MD-Editor convert source code to Markdown?

Yes. The code-to-Markdown converter generates one Markdown file per source file and can include imports/references, methods and functions, accessors, signatures, return values, exceptions, and package/module names.

Supported languages: JavaScript, TypeScript, Python, Java, and C#.

### Can I customize the app?

Yes. The Settings screen lets you tune graph thresholds, large-graph behavior, colors, recent item limits, tooltip timing, and confirmation prompts. Graph View also has per-view filters, groups, display toggles, and force sliders.

### Can I export to PDF?

Yes. Export supports Markdown, standalone HTML, and PDF. PDF export is generated client-side. For complex documents, wide code blocks, or large diagrams, browser **Print -> Save as PDF** may produce better results.

### Can I share my document with someone?

Yes. The Share action compresses Markdown content and encodes it into the URL hash. The recipient can open the URL and load the content without a server upload.

Very large documents can produce very long URLs, which may not work in all browsers, chat tools, or email clients.

---

## Installation And Deployment

### How do I run MD-Editor locally?

Clone this repository and serve the web app:

```bash
git clone https://github.com/shaybc/md-editor.git
cd md-editor
python -m http.server 9500 --directory web-app
```

Then open:

```text
http://localhost:9500/
```

See [Installation](Installation) for all options.

### Can I run it with Docker?

Yes. This checkout builds the Docker image locally from `web-app/Dockerfile`:

```bash
cd web-app
docker compose up --build
```

Then open:

```text
http://localhost:8080/
```

See [Docker Deployment](Docker-Deployment) for Docker build, compose, and reverse proxy examples.

### Is there a published Docker image?

This checkout does not include Docker publishing automation by default, so the documentation uses local builds. You can publish your own image to a registry such as GHCR if needed.

### Can I run it without Docker?

Yes. The web app is static HTML/CSS/JavaScript. Serve the `web-app/` directory with Python, Node.js `serve`, VS Code Live Server, Nginx, Apache, Caddy, IIS, or another static server.

### Can I use it offline?

The app is local-first, but the web build references CDN libraries from `web-app/index.html`. For fully offline use, replace those CDN references with local assets. The desktop setup flow downloads vendored assets and Neutralino binaries during setup.

Avoid GitHub import in offline environments because it depends on public GitHub network access.

### Is there a desktop version?

Yes. The desktop app is built with Neutralinojs and shares the same core web UI.

Run it from source:

```bash
cd desktop-app
npm run dev
```

Build desktop binaries:

```bash
npm run build
```

If this repository has GitHub Releases available, pre-built binaries may be published at [https://github.com/shaybc/md-editor/releases](https://github.com/shaybc/md-editor/releases). If no release is available, build from source.

---

## Troubleshooting

### The preview is not updating in real time.

1. Make sure JavaScript is enabled.
2. Try a hard refresh with `Ctrl+Shift+R` or `Cmd+Shift+R`.
3. Check the browser console for errors.
4. If the problem is reproducible, open an issue at [https://github.com/shaybc/md-editor/issues](https://github.com/shaybc/md-editor/issues).

### Math equations are not rendering.

MathJax is loaded from a CDN in the web build. Check your network connection, or vendor MathJax locally for offline use. If MathJax is loaded but output is wrong, verify your LaTeX syntax.

### Mermaid diagrams are not rendering.

Check that:

1. The code block is tagged with `mermaid`.
2. The diagram syntax is valid.
3. Mermaid loaded successfully from the configured script source.
4. The browser console has no JavaScript errors.

### Folder open or file handles do not work in my browser.

File and folder APIs vary by browser. Chromium-based browsers usually provide the best support for folder handles and persisted file access. You can still use file picker, drag-and-drop, GitHub import, and static editing workflows in browsers with more limited file-system support.

### The PDF export looks different from the preview.

Client-side PDF export has limitations with complex layouts. For higher-fidelity output, use your browser's **Print -> Save as PDF** flow.

### The desktop app binary will not open on macOS.

macOS may block unsigned binaries. If you trust the binary, remove the quarantine flag:

```bash
xattr -d com.apple.quarantine md-editor-mac_universal
chmod +x md-editor-mac_universal
./md-editor-mac_universal
```

You can also right-click the file in Finder, choose **Open**, and confirm the prompt.

### The desktop app binary will not open on Linux.

Make sure the binary is executable:

```bash
chmod +x md-editor-linux_x64
./md-editor-linux_x64
```

### Desktop setup fails while downloading binaries or assets.

The desktop setup scripts need network access the first time they download Neutralino binaries and vendored assets. Run setup again after restoring network access:

```bash
cd desktop-app
npm run setup
```

---

## Contributing

### How can I contribute?

See [Contributing](Contributing) for the full guide. In summary:

1. Fork the repository.
2. Create a feature branch.
3. Make and test your changes.
4. Open a pull request against `main`.

### Where do I report bugs or request features?

Open an issue at [https://github.com/shaybc/md-editor/issues](https://github.com/shaybc/md-editor/issues) with a clear description and, for bugs, steps to reproduce.
