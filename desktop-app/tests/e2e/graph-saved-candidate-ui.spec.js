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
test("opens a folder-scoped saved graph without comparing it to the full project", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__readDirectoryCalls = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([
      ["alpha.md", "# Alpha"],
      ["beta.md", "# Beta"]
    ]);
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      graphScopeKey: "sidebar-folder:c:/vault/notes",
      folderName: "notes",
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
        folderName: "notes",
        createdAt: Date.now(),
        nodes: [
          { id: "notes/alpha.md", label: "alpha.md", fullPath: "notes/alpha.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "notes/alpha.md", path: "notes/alpha.md", name: "alpha.md", fullPath: "notes/alpha.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/notes.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          window.__readDirectoryCalls.push(path);
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/notes.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  const initialReadCalls = await page.evaluate(() => window.__readDirectoryCalls.slice());

  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).toHaveClass(/hidden/);
  await expect(page.locator("#tab-list .tab-item", { hasText: "notes" })).toHaveCount(1);
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when an opened saved graph view is stale against the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["beta.md", "# Beta"]]);
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
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", fullPath: "alpha.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/saved.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/saved.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when a stale saved graph is opened before the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["current.md", "# Current"]]);
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
          { id: "old.md", label: "old.md", fullPath: "old.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "old.md", path: "old.md", name: "old.md", content: "# Old", fullPath: "old.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/saved.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/saved.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-file").first().click();
  await expect(page.locator("#graph-stale-modal")).toHaveClass(/hidden/);

  await page.locator("#import-from-folder").click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when an opened saved graph export is stale against the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["current.md", "# Current"]]);
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-export",
      graphScopeKey: "root-folder:c:/vault",
      folderName: "Saved Export",
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
        folderName: "Saved Export",
        createdAt: Date.now(),
        nodes: [
          { id: "old.md", label: "old.md", fullPath: "old.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "old.md", path: "old.md", name: "old.md", content: "# Old", fullPath: "old.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/export.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/export.mdviewer-graph.json") return JSON.stringify(savedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("prompts when an opened legacy saved graph is stale against the current folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const currentFiles = new Map([["current.md", "# Current"]]);
    const legacySavedGraph = {
      folderName: "Legacy Graph",
      graphScopeKey: "root-folder:c:/vault",
      graphViewConfig: {
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
      graphSnapshot: {
        version: 1,
        folderName: "Legacy Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "old.md", label: "old.md", fullPath: "old.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "old.md", path: "old.md", name: "old.md", content: "# Old", fullPath: "old.md", status: "current", tags: [] }
        ]
      }
    };
    const getName = (path) => String(path || "").split(/[\\/]/).pop();
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/legacy.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") {
            return Array.from(currentFiles.keys()).map((entry) => ({ entry, type: "FILE" }));
          }
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/legacy.mdviewer-graph.json") return JSON.stringify(legacySavedGraph);
          const name = getName(path);
          if (currentFiles.has(name)) return currentFiles.get(name);
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();

  await expect(page.locator("#graph-stale-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-stale-update")).toBeVisible();
  await expect(page.locator("#graph-stale-keep")).toBeVisible();
  await expect(page.locator("#graph-stale-compare")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});
