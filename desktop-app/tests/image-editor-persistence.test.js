const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadPersistence(overrides = {}) {
  const context = { window: {}, console, Uint8Array };
  context.window.window = context.window;
  vm.createContext(context);
  vm.runInContext(
    fs.readFileSync(path.resolve(__dirname, "../resources/js/tabs/persistence.js"), "utf8"),
    context
  );
  const app = { registerModule() {} };
  const deps = {
    normalizeEditorContent: String,
    getFileName(value) { return String(value || "").split(/[\\/]/).pop(); },
    getProfileDataFilePath(relative) { return `C:\\profile\\${String(relative).replace(/\//g, "\\")}`; },
    createTab() { return {}; },
    ...overrides
  };
  return context.window.registerMarkdownViewerTabPersistence(app, deps);
}

test("dirty image editor profile payload writes a binary layered-project draft", async () => {
  const binaryWrites = new Map();
  const persistence = loadPersistence({
    imageEditor: {
      async getDraftBinary() { return new Uint8Array([137, 80, 78, 71]); }
    },
    Neutralino: {
      filesystem: {
        async createDirectory() {},
        async writeBinaryFile(filePath, bytes) {
          binaryWrites.set(filePath, Array.from(new Uint8Array(bytes)));
        }
      }
    }
  });
  const tab = {
    id: "tab_image",
    type: "image-editor",
    title: "photo.png \u2014 Image Editor",
    sourceFileName: "photo.png",
    sourceFilePath: "C:/vault/photo.png",
    imageEditorDirty: true,
    imageEditorSource: { mimeType: "image/png", width: 20, height: 10 }
  };

  const payload = await persistence.createProfilePayload([tab], tab.id);
  const descriptor = payload.tabs[0];

  assert.equal(descriptor.type, "image-editor");
  assert.equal(descriptor.dirty, true);
  assert.equal(descriptor.draft.kind, "image-editor");
  assert.ok(descriptor.draft.path.endsWith("\\drafts\\image-editor\\tab_image.mdimage"));
  assert.deepEqual(binaryWrites.get(descriptor.draft.path), [137, 80, 78, 71]);
  assert.equal(descriptor.draftBinary, undefined);
});

test("dirty image editor restores from its binary draft", async () => {
  let restoredOptions = null;
  const persistence = loadPersistence({
    createImageEditorTab(source, title, options) {
      restoredOptions = { source, title, options };
      return { id: "restored", type: "image-editor", title, imageEditorSource: source };
    },
    Neutralino: {
      filesystem: {
        async readBinaryFile() { return new Uint8Array([1, 2, 3, 4]).buffer; }
      }
    }
  });
  const descriptor = {
    schemaVersion: persistence.SESSION_VERSION,
    id: "tab_image",
    type: "image-editor",
    title: "photo.png \u2014 Image Editor",
    sourceFileName: "photo.png",
    sourceFilePath: "C:/vault/photo.png",
    imageEditorSource: { mimeType: "image/png", width: 20, height: 10 },
    dirty: true,
    draft: { kind: "image-editor", path: "C:/profile/drafts/image-editor/tab_image.png" }
  };

  const restored = await persistence.restoreTabsFromPayload({
    version: persistence.SESSION_VERSION,
    activeTabId: descriptor.id,
    tabs: [descriptor]
  });

  assert.equal(restored.tabs[0].type, "image-editor");
  assert.equal(restoredOptions.options.dirty, true);
  assert.deepEqual(Array.from(restoredOptions.options.draftBytes), [1, 2, 3, 4]);
});
