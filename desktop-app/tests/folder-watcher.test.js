const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const vm = require("node:vm");

function loadFolderWatcher() {
  const source = fs.readFileSync(path.resolve(__dirname, "../resources/js/platform/folder-watcher.js"), "utf8");
  const context = {
    console,
    setTimeout,
    clearTimeout,
    Date,
    Set,
    window: {
      confirm: () => true,
      setTimeout,
      clearTimeout
    }
  };
  context.window.window = context.window;
  vm.runInNewContext(source, context, { filename: "folder-watcher.js" });
  return context.window;
}

function createApp() {
  return {
    modules: {},
    registerModule(name, api) {
      this.modules[name] = api;
    }
  };
}

test("folder watcher starts one Neutralino watcher and removes it on stop", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  const Neutralino = {
    filesystem: {
      createWatcher: async (folderPath) => {
        calls.push(["createWatcher", folderPath]);
        return 42;
      },
      removeWatcher: async (id) => calls.push(["removeWatcher", id])
    },
    events: {
      on: async (eventName) => calls.push(["on", eventName]),
      off: async (eventName) => calls.push(["off", eventName])
    }
  };
  const app = createApp();
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    isFolderOpen: true,
    Neutralino,
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true
  });

  assert.equal(await watcher.start("C:/Vault"), true);
  assert.equal(watcher._test.getActiveWatcherId(), 42);
  await watcher.stop();

  assert.deepEqual(calls, [
    ["on", "watchFile"],
    ["createWatcher", "C:/Vault"],
    ["removeWatcher", 42],
    ["off", "watchFile"]
  ]);
});

test("folder watcher creates parent-folder watchers for open tabs outside the active folder", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  let nextWatcherId = 10;
  const tabs = [{
    id: 1,
    type: "markdown",
    content: "old",
    savedContent: "old",
    sourceFilePath: "D:/Notes/Open.md"
  }];
  const Neutralino = {
    filesystem: {
      createWatcher: async (folderPath) => {
        calls.push(["createWatcher", folderPath]);
        nextWatcherId += 1;
        return nextWatcherId;
      },
      removeWatcher: async (id) => calls.push(["removeWatcher", id])
    },
    events: {
      on: async (eventName) => calls.push(["on", eventName]),
      off: async (eventName) => calls.push(["off", eventName])
    }
  };
  const app = createApp();
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "",
    activeTabId: 1,
    isFolderOpen: false,
    tabs,
    Neutralino,
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true
  });

  assert.equal(await watcher.syncOpenTabWatchers(), true);
  assert.equal(watcher._test.getTabWatcherCount(), 1);
  assert.deepEqual(calls, [
    ["on", "watchFile"],
    ["createWatcher", "D:/Notes"]
  ]);

  tabs.length = 0;
  assert.equal(await watcher.syncOpenTabWatchers(), true);
  assert.deepEqual(calls, [
    ["on", "watchFile"],
    ["createWatcher", "D:/Notes"],
    ["removeWatcher", 11],
    ["off", "watchFile"]
  ]);
});

test("folder watcher dispatches exact add, delete, move, and modify updates", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  const app = createApp();
  app.modules.sidebarContextTree = {
    createFilesystemTreeNode: async (fullPath, options) => {
      calls.push(["createNode", fullPath, options.scanDirectory === true]);
      return { kind: options.scanDirectory ? "directory" : "file", fullPath, name: path.basename(fullPath) };
    },
    upsertCreatedPathInFolderTree: (node) => {
      calls.push(["upsert", node.fullPath]);
      return true;
    },
    removeDeletedPathFromFolderTree: (deletedPath, options) => {
      calls.push(["remove", deletedPath, options.kind]);
      return options.kind === "file";
    },
    updateRenamedPathInFolderTree: async (details) => {
      calls.push(["rename", details.oldPath, details.newPath, details.kind]);
      return true;
    },
    updateTabsAfterSidebarFileRename: (...args) => calls.push(["renameTabFile", args[1], args[2]]),
    updateModifiedPathInFolderTree: async (modifiedPath) => {
      calls.push(["modify", modifiedPath]);
      return true;
    }
  };
  const Neutralino = {
    filesystem: {
      getStats: async (fullPath) => {
        if (fullPath.endsWith("/Gone.md")) throw new Error("Path does not exist");
        return { isDirectory: fullPath.endsWith("/Folder"), size: 10, modifiedAt: 20 };
      }
    }
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: true,
    tabs: [],
    Neutralino,
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getFileName: (value) => value.split(/[\\/]/).pop(),
    renderLinkAutocomplete: () => calls.push(["links"]),
    refreshFolderTagCounts: async () => calls.push(["tags"]),
    refreshOpenFolderGraphTabsFromFolderFiles: async () => calls.push(["graphs"])
  });

  await watcher._test.processBatch([
    { action: "add", dir: "C:/Vault", filename: "New.md" },
    { action: "delete", dir: "C:/Vault", filename: "Gone.md" },
    { action: "moved", dir: "C:/Vault", oldFilename: "Old.md", filename: "Renamed.md" },
    { action: "modified", dir: "C:/Vault", filename: "Renamed.md" }
  ]);

  assert.deepEqual(calls, [
    ["createNode", "C:/Vault/New.md", false],
    ["upsert", "C:/Vault/New.md"],
    ["remove", "C:/Vault/Gone.md", "file"],
    ["remove", "C:/Vault/Gone.md", "folder"],
    ["rename", "C:/Vault/Old.md", "C:/Vault/Renamed.md", "file"],
    ["renameTabFile", "C:/Vault/Old.md", "C:/Vault/Renamed.md"],
    ["modify", "C:/Vault/Renamed.md"],
    ["links"],
    ["tags"],
    ["graphs"]
  ]);
});

test("folder watcher preserves a path that still exists after a transient delete event", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  const app = createApp();
  app.modules.sidebarContextTree = {
    removeDeletedPathFromFolderTree: (deletedPath, options) => {
      calls.push(["remove", deletedPath, options.kind]);
      return true;
    },
    updateModifiedPathInFolderTree: async (modifiedPath) => {
      calls.push(["modify", modifiedPath]);
      return true;
    }
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    isFolderOpen: true,
    tabs: [],
    Neutralino: {
      filesystem: {
        getStats: async () => ({ isDirectory: true })
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true
  });

  await watcher._test.processBatch([
    { action: "delete", dir: "C:/Vault/project", filename: "src" }
  ]);

  assert.deepEqual(calls, [["modify", "C:/Vault/project/src"]]);
});

test("folder watcher skips graph refresh for non-graph file changes", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  const app = createApp();
  app.modules.sidebarContextTree = {
    createFilesystemTreeNode: async (fullPath, options) => {
      calls.push(["createNode", fullPath, options.scanDirectory === true]);
      return { kind: options.scanDirectory ? "directory" : "file", fullPath, name: path.basename(fullPath) };
    },
    upsertCreatedPathInFolderTree: (node) => {
      calls.push(["upsert", node.fullPath]);
      return true;
    },
    removeDeletedPathFromFolderTree: (deletedPath, options) => {
      calls.push(["remove", deletedPath, options.kind]);
      return options.kind === "file";
    },
    updateRenamedPathInFolderTree: async (details) => {
      calls.push(["rename", details.oldPath, details.newPath, details.kind]);
      return true;
    },
    updateModifiedPathInFolderTree: async (modifiedPath) => {
      calls.push(["modify", modifiedPath]);
      return true;
    }
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: true,
    tabs: [],
    Neutralino: {
      filesystem: {
        getStats: async (fullPath) => {
          if (fullPath.endsWith("md-editor-debug.log.2")) throw new Error("Path does not exist");
          return { isDirectory: false };
        }
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getFileName: (value) => value.split(/[\\/]/).pop(),
    renderLinkAutocomplete: () => calls.push(["links"]),
    refreshFolderTagCounts: async () => calls.push(["tags"]),
    refreshOpenFolderGraphTabsFromFolderFiles: async () => calls.push(["graphs"])
  });

  await watcher._test.processBatch([
    { action: "modified", dir: "C:/Vault/desktop-app/logs", filename: "md-editor-debug.log" },
    { action: "modified", dir: "C:/Vault/desktop-app", filename: "logs" },
    { action: "add", dir: "C:/Vault/desktop-app/logs", filename: "md-editor-debug.log.1" },
    { action: "delete", dir: "C:/Vault/desktop-app/logs", filename: "md-editor-debug.log.2" },
    { action: "moved", dir: "C:/Vault/desktop-app/logs", oldFilename: "md-editor-debug.log", filename: "md-editor-debug.log.1" }
  ]);

  assert.deepEqual(calls, [
    ["modify", "C:/Vault/desktop-app/logs/md-editor-debug.log"],
    ["modify", "C:/Vault/desktop-app/logs"],
    ["createNode", "C:/Vault/desktop-app/logs/md-editor-debug.log.1", false],
    ["upsert", "C:/Vault/desktop-app/logs/md-editor-debug.log.1"],
    ["remove", "C:/Vault/desktop-app/logs/md-editor-debug.log.2", "file"],
    ["remove", "C:/Vault/desktop-app/logs/md-editor-debug.log.2", "folder"],
    ["rename", "C:/Vault/desktop-app/logs/md-editor-debug.log", "C:/Vault/desktop-app/logs/md-editor-debug.log.1", "file"],
    ["links"],
    ["tags"]
  ]);
});

test("folder watcher auto refreshes clean open editor tabs on external modification", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  const app = createApp();
  app.modules.sidebarContextTree = {
    updateModifiedPathInFolderTree: async () => true
  };
  const tab = {
    id: 1,
    type: "markdown",
    content: "old",
    savedContent: "old",
    sourceFilePath: "C:/Vault/Open.md"
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: true,
    tabs: [tab],
    Neutralino: {
      filesystem: {
        getStats: async () => ({ isDirectory: false }),
        readFile: async () => "new"
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getExternalFileChangeBehavior: () => "auto-refresh",
    normalizeEditorContent: (value) => String(value || ""),
    getFileName: (value) => value.split(/[\\/]/).pop(),
    setActiveEditorContent: (content) => calls.push(["editor", content]),
    saveTabsToStorage: () => calls.push(["saveTabs"]),
    renderTabBar: () => calls.push(["tabs"]),
    updateSaveCurrentFileButtons: () => calls.push(["saveButtons"])
  });

  await watcher._test.processBatch([
    { action: "modified", dir: "C:/Vault", filename: "Open.md" }
  ]);

  assert.equal(tab.content, "new");
  assert.equal(tab.savedContent, "new");
  assert.deepEqual(calls, [
    ["editor", "new"],
    ["saveTabs"],
    ["tabs"],
    ["saveButtons"]
  ]);
});

test("folder watcher app confirm names the changed file and refreshes inactive mounted tabs", async () => {
  const window = loadFolderWatcher();
  const prompts = [];
  const calls = [];
  window.confirm = (message) => {
    prompts.push(message);
    return true;
  };
  const app = createApp();
  app.modules.sidebarContextTree = {
    updateModifiedPathInFolderTree: async () => true
  };
  const tab = {
    id: 2,
    type: "markdown",
    content: "old",
    savedContent: "old",
    sourceFilePath: "C:/Vault/Notes/Changed.md",
    openedSource: {
      path: "C:/Vault/Notes/Changed.md",
      name: "Changed.md",
      kind: "markdown"
    }
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: true,
    tabs: [tab],
    Neutralino: {
      filesystem: {
        getStats: async () => ({ isDirectory: false }),
        readFile: async () => "new from disk"
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getExternalFileChangeBehavior: () => "prompt",
    normalizeEditorContent: (value) => String(value || ""),
    getFileName: (value) => value.split(/[\\/]/).pop(),
    destroyTabView: (tabId) => calls.push(["destroyTabView", tabId]),
    saveTabsToStorage: () => calls.push(["saveTabs"]),
    renderTabBar: () => calls.push(["tabs"]),
    updateSaveCurrentFileButtons: () => calls.push(["saveButtons"])
  });

  await watcher._test.processBatch([
    { action: "modified", dir: "C:/Vault/Notes", filename: "Changed.md" }
  ]);

  assert.equal(prompts.length, 1);
  assert.match(prompts[0], /Changed\.md/);
  assert.match(prompts[0], /C:\/Vault\/Notes\/Changed\.md/);
  assert.equal(tab.content, "new from disk");
  assert.equal(tab.savedContent, "new from disk");
  assert.equal(tab.openedSource.path, "C:/Vault/Notes/Changed.md");
  assert.deepEqual(calls, [
    ["destroyTabView", 2],
    ["saveTabs"],
    ["tabs"],
    ["saveButtons"]
  ]);
});

test("folder watcher throttles prompt-mode external change warnings per file", async () => {
  const window = loadFolderWatcher();
  const prompts = [];
  let now = 1000;
  const originalDateNow = Date.now;
  Date.now = () => now;
  window.confirm = (message) => {
    prompts.push(message);
    return false;
  };
  const app = createApp();
  app.modules.sidebarContextTree = {
    updateModifiedPathInFolderTree: async () => true
  };
  const tab = {
    id: 1,
    type: "markdown",
    content: "old",
    savedContent: "old",
    sourceFilePath: "C:/Vault/Notes/Changed.md"
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: true,
    tabs: [tab],
    Neutralino: {
      filesystem: {
        getStats: async () => ({ isDirectory: false }),
        readFile: async () => "new from disk"
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getExternalFileChangeBehavior: () => "prompt",
    normalizeEditorContent: (value) => String(value || ""),
    getFileName: (value) => value.split(/[\\/]/).pop()
  });

  try {
    await watcher._test.processBatch([
      { action: "modified", dir: "C:/Vault/Notes", filename: "Changed.md" }
    ]);
    now += 4999;
    await watcher._test.processBatch([
      { action: "modified", dir: "C:/Vault/Notes", filename: "Changed.md" }
    ]);
    now += 1;
    await watcher._test.processBatch([
      { action: "modified", dir: "C:/Vault/Notes", filename: "Changed.md" }
    ]);

    assert.equal(prompts.length, 2);
    assert.match(prompts[0], /Changed\.md/);
    assert.match(prompts[1], /Changed\.md/);
    assert.equal(tab.content, "old");
    assert.equal(tab.savedContent, "old");
  } finally {
    Date.now = originalDateNow;
  }
});

test("folder watcher refreshes an open tab outside the active folder without a folder tree", async () => {
  const window = loadFolderWatcher();
  const calls = [];
  const app = createApp();
  app.modules.sidebarContextTree = {
    updateModifiedPathInFolderTree: async () => {
      calls.push(["tree"]);
      return true;
    }
  };
  const tab = {
    id: 1,
    type: "markdown",
    content: "old",
    savedContent: "old",
    sourceFilePath: "D:/Notes/Open.md"
  };
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: true,
    tabs: [tab],
    Neutralino: {
      filesystem: {
        readFile: async () => "new",
        getStats: async () => ({ isDirectory: false })
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getExternalFileChangeBehavior: () => "auto-refresh",
    normalizeEditorContent: (value) => String(value || ""),
    getFileName: (value) => value.split(/[\\/]/).pop(),
    setActiveEditorContent: (content) => calls.push(["editor", content])
  });

  await watcher._test.processBatch([
    { action: "modified", dir: "D:/Notes", filename: "Open.md", _watchScope: { type: "tabs", path: "D:/Notes" } }
  ]);

  assert.equal(tab.content, "new");
  assert.deepEqual(calls, [["editor", "new"]]);
});

test("folder watcher reload all refreshes all pending changed open tabs", async () => {
  const window = loadFolderWatcher();
  const prompts = [];
  const calls = [];
  const app = createApp();
  app.services = {
    notify: {
      show: async (options) => {
        prompts.push(options);
        return "reload-all";
      }
    }
  };
  const tabs = [
    {
      id: 1,
      type: "markdown",
      content: "old one",
      savedContent: "old one",
      sourceFilePath: "C:/Vault/One.md"
    },
    {
      id: 2,
      type: "markdown",
      content: "dirty two",
      savedContent: "old two",
      sourceFilePath: "C:/Vault/Two.md"
    }
  ];
  const watcher = window.registerMarkdownViewerFolderWatcher(app, {
    activeFolderPath: "C:/Vault",
    activeTabId: 1,
    isFolderOpen: false,
    tabs,
    Neutralino: {
      filesystem: {
        readFile: async (filePath) => filePath.endsWith("One.md") ? "new one" : "new two"
      }
    },
    NL_VERSION: "5.6.0",
    isNeutralinoRuntime: () => true,
    getExternalFileChangeBehavior: () => "prompt",
    normalizeEditorContent: (value) => String(value || ""),
    getFileName: (value) => value.split(/[\\/]/).pop(),
    setActiveEditorContent: (content) => calls.push(["editor", content]),
    destroyTabView: (tabId) => calls.push(["destroyTabView", tabId]),
    saveTabsToStorage: () => calls.push(["saveTabs"]),
    renderTabBar: () => calls.push(["tabs"]),
    updateSaveCurrentFileButtons: () => calls.push(["saveButtons"])
  });

  await watcher._test.processBatch([
    { action: "modified", dir: "C:/Vault", filename: "One.md", _watchScope: { type: "tabs", path: "C:/Vault" } },
    { action: "modified", dir: "C:/Vault", filename: "Two.md", _watchScope: { type: "tabs", path: "C:/Vault" } }
  ]);

  assert.equal(prompts.length, 1);
  assert.deepEqual(Array.from(prompts[0].buttons, (button) => button.id), ["cancel", "reload", "reload-all"]);
  assert.match(prompts[0].message, /Reload All will reload 2 changed open files\./);
  assert.match(prompts[0].message, /Reload All will discard unsaved edits in changed open files\./);
  assert.equal(tabs[0].content, "new one");
  assert.equal(tabs[0].savedContent, "new one");
  assert.equal(tabs[1].content, "new two");
  assert.equal(tabs[1].savedContent, "new two");
  assert.deepEqual(calls, [
    ["editor", "new one"],
    ["destroyTabView", 2],
    ["saveTabs"],
    ["tabs"],
    ["saveButtons"]
  ]);
});
