const { expect, test } = require("./desktop-fixture");
const {
  stubBrowserLibraries,
  openApp,
  clickEditorFormatButton,
  selectSettingsTab,
} = require("../helpers/candidate-app-helpers");

test.beforeEach(async ({ page }) => {
  page.errors = [];
  await stubBrowserLibraries(page);
  page.on("pageerror", (error) => page.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});
test("tree file context menu opens a full local graph for that file", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["alpha.md", "# Alpha\n\n[[beta]]"],
      ["beta.md", "# Beta\n\n[[gamma]]"],
      ["gamma.md", "# Gamma"],
      ["delta.md", "# Delta\n\n[[alpha]]"],
      ["isolated.md", "# Isolated"]
    ]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async (text) => { window.__clipboard = String(text || ""); } }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  const alphaFile = page.locator(".folder-tree-file", { hasText: "alpha.md" });
  await expect(alphaFile).toBeVisible();
  await alphaFile.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });

  const treeMenu = page.locator(".sidebar-file-context-menu:not(.hidden)");
  await expect(treeMenu.locator(".graph-context-menu-item", { hasText: "Show full graph" })).toHaveCount(0);
  const showGraphSubmenu = treeMenu.locator(".sidebar-file-graph-submenu");
  await expect(showGraphSubmenu.locator("> .graph-context-menu-item", { hasText: "Show graph" })).toBeVisible();
  await expect(showGraphSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Show local graph",
    "Show full local graph",
    "Show full network"
  ]);
  await showGraphSubmenu.locator(".graph-context-menu-item", { hasText: "Show full local graph" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    const graphTab = tabs.find((tab) => tab.type === "graph" && tab.title === "Full Local Graph: alpha.md");
    return {
      mode: graphTab?.graphViewConfig?.mode,
      focusNodeId: graphTab?.graphViewConfig?.focusNodeId,
      snapshotNodeIds: (graphTab?.graphSnapshot?.nodes || []).map((node) => node.id).sort()
    };
  })).toEqual({
    mode: "full-local",
    focusNodeId: "alpha",
    snapshotNodeIds: ["alpha", "beta", "delta", "gamma", "isolated"]
  });
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("tree file graph reports when no sidebar file is selected", async ({ page }) => {
  const consoleMessages = [];
  page.on("console", (message) => {
    consoleMessages.push(`${message.type()}: ${message.text()}`);
  });
  await page.addInitScript(() => {
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
  });
  await openApp(page);

  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openSidebarFileFullGraphView(null));

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([
    "Unable to open a graph because no sidebar file is selected."
  ]);
  await expect.poll(() => consoleMessages.some((message) => message.includes("[Sidebar file graph]"))).toBe(true);
});

test("folder context menu graphs and exports an unexpanded lazy desktop folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      startupBehavior: "untitled"
    }));
    window.__alerts = [];
    window.__execCommands = [];
    window.__readDirectories = [];
    window.__graphSaveDialogs = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/framework-docs/src/main/java/org/example/ApplicationConfiguration.java.md", "# ApplicationConfiguration\n\n[[Helper]]"],
      ["C:/vault/framework-docs/src/main/java/org/example/Helper.md", "# Helper"]
    ]);
    const directories = new Map([
      ["C:/vault", [{ entry: "framework-docs", type: "DIRECTORY" }]],
      ["C:/vault/framework-docs", [{ entry: "src", type: "DIRECTORY" }]],
      ["C:/vault/framework-docs/src", [{ entry: "main", type: "DIRECTORY" }]],
      ["C:/vault/framework-docs/src/main", [{ entry: "java", type: "DIRECTORY" }]],
      ["C:/vault/framework-docs/src/main/java", [{ entry: "org", type: "DIRECTORY" }]],
      ["C:/vault/framework-docs/src/main/java/org", [{ entry: "example", type: "DIRECTORY" }]],
      ["C:/vault/framework-docs/src/main/java/org/example", [
        { entry: "ApplicationConfiguration.java.md", type: "FILE" },
        { entry: "Helper.md", type: "FILE" }
      ]]
    ]);
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async (title, options) => {
          window.__graphSaveDialogs.push({ title, options });
          return "C:/vault/framework-docs/framework-docs.mdviewer-graph.json";
        },
        open: async () => {},
        execCommand: async (command) => {
          window.__execCommands.push(String(command));
        }
      },
      filesystem: {
        readDirectory: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          window.__readDirectories.push(normalized);
          return directories.get(normalized) || [];
        },
        getStats: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          if (normalized === "C:/vault/.md-editor/_md_editor_project.json") return { isFile: true };
          if (directories.has(normalized)) return { isDirectory: true, modifiedAt: 1, createdAt: 1 };
          if (files.has(normalized)) {
            return { isFile: true, size: files.get(normalized).length, modifiedAt: 1, createdAt: 1 };
          }
          return { modifiedAt: 1, createdAt: 1 };
        },
        readFile: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          if (files.has(normalized)) return files.get(normalized);
          throw new Error("Unexpected read path: " + normalized);
        },
        writeFile: async (path, content) => {
          files.set(String(path).replace(/\\/g, "/"), String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs && !!document.querySelector("#import-from-folder"));

  await page.locator("#import-from-folder").click();
  const lazyFolder = page.locator(".folder-tree-label", { hasText: "framework-docs" });
  await expect(lazyFolder).toBeVisible();
  await expect(page.locator(".folder-tree-file", { hasText: "ApplicationConfiguration.java.md" })).toHaveCount(0);

  await lazyFolder.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  const folderMenu = page.locator(".sidebar-folder-context-menu:not(.hidden)");
  await expect(folderMenu).toBeVisible();
  await folderMenu.locator(".graph-context-menu-item", { hasText: "Show graph view" }).evaluate((button) => button.click());

  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect(page.locator(".folder-tree-file", { hasText: "ApplicationConfiguration.java.md" })).toHaveCount(0);

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal in TreeView" }).evaluate((button) => button.click());
  const revealedTreeFile = page.locator(".folder-tree-file", { hasText: "ApplicationConfiguration.java.md" });
  await expect(revealedTreeFile).toHaveClass(/auto-selected/);
  await expect(revealedTreeFile).toHaveAttribute("aria-current", "page");

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal in file explorer" }).evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__execCommands)).toContain(
    'explorer.exe /select,"C:\\vault\\framework-docs\\src\\main\\java\\org\\example\\ApplicationConfiguration.java.md"'
  );

  await lazyFolder.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await folderMenu.locator(".graph-context-menu-item", { hasText: "Export Folder to Graph" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs[0]?.title)).toBe("Export Folder to Graph");
  await expect.poll(() => page.evaluate(() => {
    const exported = window.Neutralino.filesystem.readFile("C:/vault/framework-docs/framework-docs.mdviewer-graph.json");
    return Promise.resolve(exported).then((content) => String(content || ""));
  })).toContain("ApplicationConfiguration.java.md");
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("keeps open folder graph views in sync with saved and deleted files", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([["alpha.md", "# Alpha"]]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async () => "C:/vault/beta.md",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
        },
        remove: async (path) => {
          files.delete(getName(path));
        }
      },
      clipboard: { writeText: async () => {} }
    };
    window.confirm = () => true;
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect(page.locator(".graph-label-file")).toContainText("alpha");

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal in TreeView" }).click();
  const revealedTreeFile = page.locator(".folder-tree-file", { hasText: "alpha.md" });
  await expect(revealedTreeFile).toHaveClass(/auto-selected/);
  await expect(revealedTreeFile).toHaveAttribute("aria-current", "page");
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("folder-tree-file"))).toBe(true);

  await page.locator(".tab-new-btn").click();
  await page.locator(".view-mode-btn[data-mode='split']").click();
  await page.locator("#markdown-editor").fill("# Beta");
  await page.keyboard.press("Control+S");
  await expect(page.locator("#tab-list .tab-item", { hasText: "beta" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { has: page.locator(".bi-diagram-3") }).click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await expect(page.locator(".graph-label-file", { hasText: "beta" })).toHaveCount(1);

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Delete file" }).evaluate((button) => button.click());

  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect(page.locator(".graph-label-file", { hasText: "beta" })).toHaveCount(1);
  await expect(page.locator(".graph-label-file", { hasText: "alpha" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("saves a new graph view through the desktop save dialog", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__graphSaveDialogs = [];
    const files = new Map([["alpha.md", "# Alpha"]]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async (title, options) => {
          window.__graphSaveDialogs.push({ title, options });
          return title === "Export Folder to Graph"
            ? "C:/vault/backup.mdviewer-graph.json"
            : "C:/vault/graph.mdviewer-graph.json";
        },
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);

  await page.locator(".save-current-file-button").first().click();

  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs[0].title)).toBe("Save Graph View");
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/graph.mdviewer-graph.json")))
    .toContain('"documentType": "graph-view"');
  await expect(page.locator(".folder-tree-file", { hasText: "graph.mdviewer-graph.json" })).toBeVisible();

  await page.locator(".export-folder-to-graph").first().click();
  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__graphSaveDialogs[1].title)).toBe("Export Folder to Graph");
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/backup.mdviewer-graph.json")))
    .toContain('"documentType": "graph-export"');
  await expect(page.locator(".folder-tree-file", { hasText: "backup.mdviewer-graph.json" })).toBeVisible();
});

test("updates a saved partial graph in the tree without resetting expanded folders", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    const files = new Map([
      ["C:/vault/alpha.md", "# Alpha"],
      ["C:/vault/notes/beta.md", "# Beta"]
    ]);
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async () => "C:/vault/notes/notes-graph.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return [
              { entry: "alpha.md", type: "FILE" },
              { entry: "notes", type: "DIRECTORY" }
            ];
          }
          if (path === "C:/vault/notes") {
            const entries = [{ entry: "beta.md", type: "FILE" }];
            if (files.has("C:/vault/notes/notes-graph.mdviewer-graph.json")) {
              entries.push({ entry: "notes-graph.mdviewer-graph.json", type: "FILE" });
            }
            return entries;
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (files.has(path)) return files.get(path);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(path, String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.evaluate(async () => {
    const notesNode = window.markdownViewerApp.state.currentFolderTreeNodes.find((node) => node.name === "notes");
    await window.markdownViewerApp.modules.sidebarContextTree.openSidebarFolderGraphView(notesNode);
  });
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await page.evaluate(() => {
    const details = Array.from(document.querySelectorAll("#folder-tree-root details"))
      .find((node) => node.dataset.path === "notes");
    if (details) details.open = false;
  });
  await expect.poll(() => page.evaluate(() => {
    const details = Array.from(document.querySelectorAll("#folder-tree-root details"))
      .find((node) => node.dataset.path === "notes");
    return details?.open;
  })).toBe(false);

  await page.locator(".save-current-file-button").first().click();

  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/notes/notes-graph.mdviewer-graph.json")))
    .toContain('"path": "notes/beta.md"');
  await expect(page.locator(".folder-tree-file", { hasText: "notes-graph.mdviewer-graph.json" })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const details = Array.from(document.querySelectorAll("#folder-tree-root details"))
      .find((node) => node.dataset.path === "notes");
    const treeNode = window.markdownViewerApp.state.currentFolderTreeNodes
      .find((node) => node.name === "notes");
    return {
      open: details?.open,
      savedChildCount: (treeNode?.children || []).filter((node) => node.name === "notes-graph.mdviewer-graph.json").length
    };
  })).toEqual({ open: false, savedChildCount: 1 });
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const tab = window.markdownViewerApp.modules.graphPersistence.getActiveGraphTab();
    return (tab?.graphSnapshot?.files || []).map((file) => file.path);
  })).toEqual(["notes/beta.md"]);
});

test("saving new documents from tab and action buttons updates the tree without reloading it", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__readDirectoryCalls = [];
    window.__saveDialogPaths = ["C:/vault/from-tab.md", "C:/vault/from-menu.md"];
    const files = new Map([
      ["C:/vault/archive/gamma.md", "# Gamma"],
      ["C:/vault/notes/beta.md", "# Beta"]
    ]);
    const listEntries = (path) => {
      if (path === "C:/vault") return [
        { entry: "archive", type: "DIRECTORY" },
        { entry: "notes", type: "DIRECTORY" },
        ...Array.from(files.keys())
          .filter((filePath) => filePath.replace("C:/vault/", "").indexOf("/") < 0)
          .map((filePath) => ({ entry: filePath.split("/").pop(), type: "FILE" }))
      ];
      if (path === "C:/vault/archive") return files.has("C:/vault/archive/gamma.md") ? [{ entry: "gamma.md", type: "FILE" }] : [];
      if (path === "C:/vault/notes") return files.has("C:/vault/notes/beta.md") ? [{ entry: "beta.md", type: "FILE" }] : [];
      return [];
    };
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async () => window.__saveDialogPaths.shift(),
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          window.__readDirectoryCalls.push(path);
          return listEntries(path);
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (!files.has(path)) throw new Error("Unexpected read path: " + path);
          return files.get(path);
        },
        writeFile: async (path, content) => {
          files.set(path, String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.keyboard.press("Escape");
  const initialReadCalls = await page.evaluate(() => window.__readDirectoryCalls.slice());
  await page.evaluate(() => {
    const details = Array.from(document.querySelectorAll("#folder-tree-root details"))
      .find((node) => node.dataset.path === "archive");
    if (details) details.open = false;
  });

  await page.locator(".tab-new-btn").click({ force: true });
  await page.locator("#markdown-editor").fill("# From tab");
  await page.keyboard.press("Control+S");

  await expect(page.locator(".folder-tree-file", { hasText: "from-tab.md" })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);
  await expect.poll(() => page.evaluate(() => {
    const details = Array.from(document.querySelectorAll("#folder-tree-root details"))
      .find((node) => node.dataset.path === "archive");
    return {
      archiveOpen: details?.open,
      markdownFiles: window.markdownViewerApp.state.folderMarkdownFiles.map((entry) => entry.path)
    };
  })).toEqual({
    archiveOpen: false,
    markdownFiles: ["archive/gamma.md", "notes/beta.md", "from-tab.md"]
  });

  await page.locator("#desktopActionMenu").click();
  await page.locator(".action-menu .new-document-button").click();
  await page.locator("#markdown-editor").fill("# From menu");
  await page.keyboard.press("Control+S");

  await expect(page.locator(".folder-tree-file", { hasText: "from-menu.md" })).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);
  await expect.poll(() => page.evaluate(() => {
    const details = Array.from(document.querySelectorAll("#folder-tree-root details"))
      .find((node) => node.dataset.path === "archive");
    return {
      archiveOpen: details?.open,
      treeNames: window.markdownViewerApp.state.currentFolderTreeNodes.map((node) => node.name),
      markdownFiles: window.markdownViewerApp.state.folderMarkdownFiles.map((entry) => entry.path)
    };
  })).toEqual({
    archiveOpen: false,
    treeNames: ["archive", "notes", "from-menu.md", "from-tab.md"],
    markdownFiles: ["archive/gamma.md", "notes/beta.md", "from-tab.md", "from-menu.md"]
  });
});

test("stores root scope when saving an app-saved graph view", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["alpha.md", "---\ntags: [old]\n---\n# Alpha"],
      ["beta.md", "# Beta"]
    ]);
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.__mutateVault = () => {
      files.set("alpha.md", "---\ntags: [new]\n---\n# Alpha");
      files.delete("beta.md");
    };
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async () => "C:/vault/graph.mdviewer-graph.json",
        showOpenDialog: async () => "C:/vault/graph.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(files.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const name = getName(path);
          if (files.has(name)) return files.get(name);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);

  await page.locator(".save-current-file-button").first().click();
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/graph.mdviewer-graph.json")))
    .toContain('"documentType": "graph-view"');
  await expect.poll(() => page.evaluate(() => window.Neutralino.filesystem.readFile("C:/vault/graph.mdviewer-graph.json")))
    .toContain('"graphScopeKey": "root-folder:c:/vault"');

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("opens a saved graph view file from the desktop file picker", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      graphScopeKey: "root-folder:c:/vault",
      folderName: "Saved Graph",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      viewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170
      },
      snapshot: {
        version: 1,
        folderName: "Saved Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", fullPath: "alpha.md", status: "current", tags: [] }
        ]
      }
    };
    window.Neutralino = {
      os: {
        showOpenDialog: async () => "C:/vault/saved.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/saved.mdviewer-graph.json") return JSON.stringify(savedGraph);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#tab-list .tab-item", { hasText: "saved" })).toHaveCount(1);
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect(page.locator(".graph-quick-action-button")).toBeVisible();

  await page.locator("#tab-list .tab-item", { hasText: "Welcome" }).evaluate((tab) => tab.click());
  await expect(page.locator(".graph-quick-action")).toBeHidden();

  await page.locator("#tab-list .tab-item", { hasText: "saved" }).evaluate((tab) => tab.click());
  await expect(page.locator(".graph-quick-action-button")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});
