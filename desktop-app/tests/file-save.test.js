const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFileSaveModule() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/files/save.js"), "utf8");
  const context = {
    console,
    window: {}
  };
  context.window.window = context.window;
  vm.runInNewContext(source, context, { filename: "save.js" });
  return context.window;
}

function createDeps(overrides = {}) {
  const tabs = overrides.tabs || [];
  return {
    get activeTabId() { return overrides.activeTabId || tabs[0]?.id || null; },
    get activeFolderHandle() { return null; },
    get activeFolderPath() { return "C:/Vault"; },
    get markdownEditor() { return { value: overrides.editorValue || tabs[0]?.content || "" }; },
    activeEditorCommands: {
      getActiveEditorValue: () => overrides.editorValue || tabs[0]?.content || ""
    },
    get tabs() { return tabs; },
    normalizeEditorContent: (value) => String(value || ""),
    getMarkdownTitleFromFileName: (name) => String(name || "").replace(/\.[^.]+$/, "") || "Untitled",
    syncMarkdownTabTagsToFolderState: () => {},
    saveTabsToStorage: () => {},
    renderTabBar: () => {},
    updateSaveCurrentFileButtons: () => {},
    getSuggestedMarkdownFileName: () => "document.md",
    getSuggestedDocumentFileName: () => "document.md",
    getFileName: (value) => String(value || "").split(/[\\/]/).pop(),
    joinPath: (folder, name) => `${folder}/${name}`,
    isPathInsideFolder: (filePath, folderPath) => String(filePath || "").startsWith(String(folderPath || "")),
    invalidateWorkspaceDerivedState: async () => {},
    reloadOpenFolderTree: async () => true,
    isFirefoxBrowser: () => false,
    getActiveMarkdownTab: () => tabs[0] || null,
    saveAs: () => {},
    Neutralino: overrides.Neutralino,
    get NL_VERSION() { return overrides.NL_VERSION; },
    suppressFolderWatcher: overrides.suppressFolderWatcher || (() => {}),
    ...overrides
  };
}

test("desktop save suppresses folder watcher events around Neutralino writes", async () => {
  const window = loadFileSaveModule();
  const suppressions = [];
  const writes = [];
  let gitRefreshCount = 0;
  const tab = {
    id: "tab_1",
    type: "markdown",
    content: "updated",
    savedContent: "old",
    sourceFilePath: "C:/Vault/Doc.md"
  };
  const api = window.registerMarkdownViewerFileSave({}, createDeps({
    tabs: [tab],
    activeTabId: "tab_1",
    editorValue: "updated",
    NL_VERSION: "5.6.0",
    Neutralino: {
      filesystem: {
        writeFile: async (filePath, content) => {
          writes.push([filePath, content, suppressions.slice()]);
        }
      }
    },
    suppressFolderWatcher: (milliseconds) => suppressions.push(milliseconds),
    refreshWorkspaceGitStatus: () => {
      gitRefreshCount += 1;
    }
  }));

  assert.equal(await api.saveMarkdownTabToSource(tab), true);
  assert.deepEqual(writes, [["C:/Vault/Doc.md", "updated", [1000]]]);
  assert.deepEqual(suppressions, [1000, 500]);
  assert.equal(gitRefreshCount, 1);
  assert.equal(tab.savedContent, "updated");
});

test("generated HTML report tabs save as HTML without replacing tab content", async () => {
  const window = loadFileSaveModule();
  const writes = [];
  const tab = {
    id: "tab_report",
    type: "markdown",
    title: "Line Counter",
    content: "# Line Counter\n\n<table><tbody><tr><td>file.js</td></tr></tbody></table>",
    savedContent: "# Line Counter\n\n<table><tbody><tr><td>file.js</td></tr></tbody></table>",
    generatedHtmlSave: { suggestedName: "line-counter.html", title: "Line Counter" }
  };
  const api = window.registerMarkdownViewerFileSave({}, createDeps({
    tabs: [tab],
    activeTabId: "tab_report",
    editorValue: tab.content,
    NL_VERSION: "5.6.0",
    Neutralino: {
      os: {
        showSaveDialog: async () => "C:/Vault/line-counter-report"
      },
      filesystem: {
        writeFile: async (filePath, content) => {
          writes.push([filePath, content]);
        }
      }
    },
    buildMarkdownExportHtml: (markdown, title) => `<html><head><title>${title}</title></head><body>${markdown}</body></html>`
  }));

  assert.equal(await api.saveGeneratedHtmlTabWithSaveDialog(tab), true);
  assert.deepEqual(writes, [["C:/Vault/line-counter-report.html", `<html><head><title>Line Counter</title></head><body>${tab.content}</body></html>`]]);
  assert.equal(tab.content, "# Line Counter\n\n<table><tbody><tr><td>file.js</td></tr></tbody></table>");
  assert.equal(tab.sourceFilePath, undefined);
});
