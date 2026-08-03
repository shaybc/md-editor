const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

const archiveViewerSource = fs.readFileSync(
  path.resolve(__dirname, "..", "resources", "js", "files", "archive-viewer.js"),
  "utf8"
);

function createElement(tagName) {
  return {
    tagName: String(tagName || "").toUpperCase(),
    children: [],
    className: "",
    textContent: "",
    append(...children) {
      this.children.push(...children);
    },
    appendChild(child) {
      this.children.push(child);
      return child;
    }
  };
}

function createApp() {
  return {
    services: {},
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
}

function loadArchiveViewer(overrides = {}) {
  const revokedUrls = [];
  const context = {
    window: {},
    console,
    Blob,
    URL: {
      createObjectURL() {
        return "blob:archive-entry";
      },
      revokeObjectURL(value) {
        revokedUrls.push(value);
      }
    },
    document: { createElement }
  };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(archiveViewerSource, context, { filename: "files/archive-viewer.js" });
  const viewer = context.window.registerMarkdownViewerArchiveViewer(createApp(), {
    getFileName(value) {
      return String(value || "").split(/[\\/]/).pop() || "";
    },
    getFileExtension(value) {
      const match = String(value || "").toLowerCase().match(/\.([^.]+)$/);
      return match ? match[1] : "";
    },
    isKnownTextFilePath(value) {
      return /\.(txt|md|xml|json|properties)$/i.test(value || "");
    },
    filePreview: {
      createPreviewBlobUrl: async () => ({
        data: new Uint8Array([80, 75]),
        url: "blob:archive",
        mimeType: "application/zip",
        size: 2
      }),
      getPreviewMimeType: () => "application/octet-stream",
      canEmbedPreviewMimeType: () => false
    },
    JSZip: {
      async loadAsync() {
        return { files: {} };
      }
    },
    saveAs() {},
    ...overrides
  });
  return { viewer, revokedUrls };
}

function entry(name, options = {}) {
  return {
    name,
    unsafeOriginalName: options.unsafeOriginalName,
    dir: options.dir === true,
    date: new Date("2026-01-01T00:00:00Z"),
    _data: { uncompressedSize: options.size || 0 },
    async: options.async || (async () => "")
  };
}

test("recognizes the requested ZIP-family extensions case-insensitively", () => {
  const { viewer } = loadArchiveViewer();

  for (const name of ["library.jar", "bundle.ZIP", "application.War", "server.EAR"]) {
    assert.equal(viewer.isArchiveSource(name), true, name);
  }
  for (const name of ["classes.class", "package.apk", "document.docx", "archive.tar.gz"]) {
    assert.equal(viewer.isArchiveSource(name), false, name);
  }
});

test("builds a directory-first archive hierarchy and retains unsafe names as display-only paths", () => {
  const { viewer } = loadArchiveViewer();
  const tree = viewer._test.buildArchiveTree([
    entry("README.txt"),
    entry("META-INF/", { dir: true }),
    entry("META-INF/MANIFEST.MF", { size: 42 }),
    entry("com/example/App.class", { size: 128 }),
    entry("safe/escape.txt", { unsafeOriginalName: "../escape.txt", size: 7 })
  ]);

  assert.deepEqual(
    Array.from(tree.children, (node) => `${node.kind}:${node.name}`),
    ["directory:..", "directory:com", "directory:META-INF", "file:README.txt"]
  );
  const metaInf = tree.children.find((node) => node.name === "META-INF");
  assert.equal(metaInf.children[0].path, "META-INF/MANIFEST.MF");
  assert.equal(viewer._test.countTreeFiles(tree), 4);
});

test("filters by full entry path while preserving matching parent folders", () => {
  const { viewer } = loadArchiveViewer();
  const tree = viewer._test.buildArchiveTree([
    entry("com/example/App.class"),
    entry("com/example/App.java"),
    entry("docs/guide.md")
  ]);

  const filtered = viewer._test.filterArchiveTree(tree, "example/app.java");

  assert.equal(filtered.children.length, 1);
  assert.equal(filtered.children[0].name, "com");
  assert.equal(viewer._test.countTreeFiles(filtered), 1);
  assert.equal(viewer._test.filterArchiveTree(tree, ""), tree);
});

test("classifies common archive text entries and creates safe leaf download names", () => {
  const { viewer } = loadArchiveViewer();

  assert.equal(viewer._test.isTextArchiveEntry("META-INF/MANIFEST.MF"), true);
  assert.equal(viewer._test.isTextArchiveEntry("docs/README"), true);
  assert.equal(viewer._test.isTextArchiveEntry("config/app.properties"), true);
  assert.equal(viewer._test.isTextArchiveEntry("com/example/App.class"), false);
  assert.equal(viewer._test.getSafeDownloadName("../../outside/secret.txt"), "secret.txt");
  assert.equal(viewer._test.getSafeDownloadName("../.."), "archive-entry");
});

test("reports JSZip entry sizes and exposes the approved limits", () => {
  const { viewer } = loadArchiveViewer();

  assert.equal(viewer._test.getArchiveEntrySize(entry("large.bin", { size: 9000 })), 9000);
  assert.equal(viewer.MAX_ARCHIVE_BYTES, 256 * 1024 * 1024);
  assert.equal(viewer.MAX_INLINE_ENTRY_BYTES, 8 * 1024 * 1024);
});

test("rejects oversized archives before reading their bytes", async () => {
  let reads = 0;
  const { viewer } = loadArchiveViewer({
    filePreview: {
      async createPreviewBlobUrl() {
        reads += 1;
        throw new Error("must not read");
      }
    }
  });
  const stage = createElement("div");

  await viewer.mountArchivePreview({
    tabId: "oversized",
    stage,
    source: { name: "huge.jar", size: viewer.MAX_ARCHIVE_BYTES + 1 }
  });

  assert.equal(reads, 0);
  assert.equal(stage.children[0].children[0].textContent, "Unable to open archive");
  assert.match(stage.children[0].children[1].textContent, /larger than 256\.0 MB/);
});

test("renders a non-destructive error for malformed or encrypted archives", async () => {
  const { viewer } = loadArchiveViewer({
    filePreview: {
      async createPreviewBlobUrl() {
        return {
          data: new Uint8Array([0, 1, 2]),
          url: "blob:broken-archive",
          mimeType: "application/zip",
          size: 3
        };
      }
    },
    JSZip: {
      async loadAsync() {
        throw new Error("Encrypted zip is not supported");
      }
    }
  });
  const stage = createElement("div");

  await viewer.mountArchivePreview({
    tabId: "broken",
    stage,
    source: { name: "broken.zip", size: 3 }
  });

  assert.equal(stage.children[0].children[0].textContent, "Unable to open archive");
  assert.match(stage.children[0].children[1].textContent, /malformed, encrypted, or unreadable/);
});

test("previews text entries safely through textContent", async () => {
  const { viewer } = loadArchiveViewer();
  const archiveEntry = entry("META-INF/MANIFEST.MF", {
    size: 30,
    async: async (type) => {
      assert.equal(type, "string");
      return "<script>not executable</script>";
    }
  });
  const view = {
    entryName: createElement("strong"),
    entryMeta: createElement("span"),
    downloadButton: { hidden: true },
    entryStage: createElement("div"),
    selectedEntry: null,
    entryObjectUrl: null
  };

  await viewer._test.renderSelectedEntry(view, archiveEntry);

  assert.equal(view.entryStage.children[0].tagName, "PRE");
  assert.equal(view.entryStage.children[0].textContent, "<script>not executable</script>");
  assert.equal(view.downloadButton.hidden, false);
});

test("reuses the shared blob preview for supported media entries", async () => {
  let mountedOptions = null;
  const { viewer } = loadArchiveViewer({
    filePreview: {
      getPreviewMimeType() {
        return "image/png";
      },
      canEmbedPreviewMimeType() {
        return true;
      },
      mountBlobPreview(_stage, options) {
        mountedOptions = options;
        return {};
      }
    }
  });
  const archiveEntry = entry("images/logo.png", {
    size: 4,
    async: async (type) => {
      assert.equal(type, "blob");
      return new Blob([new Uint8Array([1, 2, 3, 4])], { type: "image/png" });
    }
  });
  const view = {
    entryName: createElement("strong"),
    entryMeta: createElement("span"),
    downloadButton: { hidden: true },
    entryStage: createElement("div"),
    selectedEntry: null,
    entryObjectUrl: null
  };

  await viewer._test.renderSelectedEntry(view, archiveEntry);

  assert.equal(mountedOptions.mimeType, "image/png");
  assert.equal(mountedOptions.title, "images/logo.png");
  assert.equal(view.entryObjectUrl, "blob:archive-entry");
});

test("keeps oversized entries download-only and saves selected entries by leaf name", async () => {
  let decompressions = 0;
  let saved = null;
  const { viewer } = loadArchiveViewer({
    saveAs(blob, name) {
      saved = { blob, name };
    }
  });
  const archiveEntry = entry("../../payload.bin", {
    size: viewer.MAX_INLINE_ENTRY_BYTES + 1,
    async: async () => {
      decompressions += 1;
      return new Blob(["payload"]);
    }
  });
  const view = {
    entryName: createElement("strong"),
    entryMeta: createElement("span"),
    downloadButton: { hidden: true, disabled: false, textContent: "Download Entry" },
    entryStage: createElement("div"),
    selectedEntry: null,
    entryObjectUrl: null
  };

  await viewer._test.renderSelectedEntry(view, archiveEntry);
  assert.equal(decompressions, 0);
  assert.match(view.entryStage.children[0].children[1].textContent, /download-only/);

  await viewer._test.downloadSelectedEntry(view);
  assert.equal(decompressions, 1);
  assert.equal(saved.name, "payload.bin");
  assert.equal(view.downloadButton.textContent, "Download Entry");
});

test("releases entry object URLs without performing filesystem writes", () => {
  const { viewer, revokedUrls } = loadArchiveViewer();
  const view = { entryObjectUrl: "blob:selected-entry" };

  viewer._test.releaseEntryPreviewUrl(view);

  assert.deepEqual(revokedUrls, ["blob:selected-entry"]);
  assert.equal(view.entryObjectUrl, null);
});
