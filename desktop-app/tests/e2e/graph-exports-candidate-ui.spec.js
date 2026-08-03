const EXPECTED_COMPILE_BAT = [
  "@echo off",
  "",
  "REM check if folder bin exist in the root folder of the project",
  "IF exist bin (",
  "    rmdir /S /Q bin",
  ")",
  "",
  "REM create the compile destination folder bin",
  "mkdir bin",
  "",
  "",
  "REM find all java source files and list them into sources.txt",
  "dir /S /B *.java > sources.txt",
  "",
  "",
  "REM compile all the source java files found in the sources.txt file and use the lib\\*.jar as classpath",
  "REM and redirect the stdout and stderr into a file: compile.log (overwrite it)",
  "javac -d bin -cp \"lib\\*\" @sources.txt > compile.log 2>&1"
].join("\r\n");

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
test("graph quick action menu exports original source files for visible nodes", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__createdDirectories = [];
    window.__writes = [];
    window.__openedFolders = [];
    window.__releaseOriginalExportRead = null;
    window.__holdOriginalExportRead = true;
    window.alert = (message) => window.__alerts.push(String(message));
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      debugEnabled: true,
      debugWriteToFile: true,
      debugLevel: "debug",
      debugLogPath: "C:/temp/sub_project/md-editor-export-debug.log"
    }));
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/src/util/a.java.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/a.java\"\n---\n# A";
          if (path === "C:/vault/src/util/b.js.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/b.js\"\n---\n# B";
          if (path === "C:/workspace/my_project/src/util/a.java") {
            const content = "package demo;\n\nimport missing.QCInputMessageMixIn;\nimport java.util.List;\n\nclass A { List<String> values; }";
            if (!window.__holdOriginalExportRead) return content;
            window.__holdOriginalExportRead = false;
            return new Promise((resolve) => {
              window.__releaseOriginalExportRead = () => resolve(content);
            });
          }
          if (path === "C:/workspace/my_project/src/util/b.js") return "import missing.QCInputMessageMixIn;\nexport const b = {};";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async (path) => {
          window.__createdDirectories.push(path);
        },
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
    const graphTab = {
      id: "export_original_nodes_graph_e2e",
      title: "Export Original Nodes Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Export Original Nodes Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Export Original Nodes Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "src/util/a.java", label: "a.java", type: "file", status: "current", fullPath: "C:/vault/src/util/a.java.md" },
          { id: "src/util/b.js", label: "b.js", type: "file", status: "current", fullPath: "C:/vault/src/util/b.js.md" }
        ],
        links: [],
        files: [
          { id: "src/util/a.java", path: "src/util/a.java.md", name: "a.java.md", fullPath: "C:/vault/src/util/a.java.md", status: "current" },
          { id: "src/util/b.js", path: "src/util/b.js.md", name: "b.js.md", fullPath: "C:/vault/src/util/b.js.md", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await expect(page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Export original nodes" })).toHaveCount(0);
  await page.locator(".graph-tab-render").click();
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Export original nodes" }).click();
  await page.locator(".reset-modal-overlay", { hasText: "Export Originals" }).getByRole("button", { name: "OK" }).click();

  await expect(page.locator(".graph-quick-action-status")).toBeVisible();
  await expect(page.locator(".graph-quick-action-status")).toContainText("Exporting original files 1 / 2");
  await expect(page.locator("#status-tip")).toHaveClass(/status-progress-loop/);
  await expect(page.locator("#status-tip")).toContainText("Exporting original files 1 / 2");
  await page.evaluate(() => window.__releaseOriginalExportRead());

  await expect.poll(() => page.evaluate(() => window.__writes.filter((write) => !write.path.endsWith("md-editor-export-debug.log")))).toEqual([
    { path: "C:/temp/sub_project/my_project/src/util/a.java", content: "package demo;\n\nimport java.util.List;\n\nclass A { List<String> values; }" },
    { path: "C:/temp/sub_project/my_project/src/util/b.js", content: "import missing.QCInputMessageMixIn;\nexport const b = {};" },
    { path: "C:/temp/sub_project/compile.bat", content: EXPECTED_COMPILE_BAT }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const logWrite = window.__writes.find((write) => write.path === "C:/temp/sub_project/md-editor-export-debug.log");
    return logWrite?.content || "";
  })).toContain("Original graph export completed");
  await expect.poll(() => page.evaluate(() => window.__createdDirectories)).toEqual([
    "C:/temp/sub_project/my_project",
    "C:/temp/sub_project/my_project/src",
    "C:/temp/sub_project/my_project/src/util"
  ]);
  await expect(page.locator(".graph-quick-action-status")).toBeHidden();
  await expect(page.locator("#status-tip")).not.toHaveClass(/status-progress-loop/);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 2 original files." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
  await expect(completeModal).toBeHidden();
});

test("graph node export submenu exports only that original source file", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__writes = [];
    window.__openedFolders = [];
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/src/util/a.java.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/a.java\"\n---\n# A";
          if (path === "C:/vault/src/util/b.js.md") return "---\nsource_file: \"C:/workspace/my_project/src/util/b.js\"\n---\n# B";
          if (path === "C:/workspace/my_project/src/util/a.java") return "package demo;\n\nimport missing.QCInputMessageMixIn;\nimport java.util.List;\n\nclass A { List<String> values; }";
          if (path === "C:/workspace/my_project/src/util/b.js") return "import missing.QCInputMessageMixIn;\nexport const b = {};";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async () => {},
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
    const graphTab = {
      id: "export_original_node_graph_e2e",
      title: "Export Original Node Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Export Original Node Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Export Original Node Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "src/util/a.java", label: "a.java", type: "file", status: "current", fullPath: "C:/vault/src/util/a.java.md" },
          { id: "src/util/b.js", label: "b.js", type: "file", status: "current", fullPath: "C:/vault/src/util/b.js.md" }
        ],
        links: [],
        files: [
          { id: "src/util/a.java", path: "src/util/a.java.md", name: "a.java.md", fullPath: "C:/vault/src/util/a.java.md", status: "current" },
          { id: "src/util/b.js", path: "src/util/b.js.md", name: "b.js.md", fullPath: "C:/vault/src/util/b.js.md", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);

  const nodeA = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "a.java" }) }).first();
  await nodeA.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Export" }).hover();
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-submenu", { hasText: "Export" })
    .locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Export original node" })
    .evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/src/util/a.java", content: "package demo;\n\nimport java.util.List;\n\nclass A { List<String> values; }" },
    { path: "C:/temp/sub_project/compile.bat", content: EXPECTED_COMPILE_BAT }
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 1 original file." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
});

test("sidebar folder context menu exports original source files for that subtree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__createdDirectories = [];
    window.__writes = [];
    window.__openedFolders = [];
    const folderSelections = ["C:/vault", "C:/temp/sub_project"];
    const directoryEntries = {
      "C:/vault": [
        { entry: "client", type: "DIRECTORY" }
      ],
      "C:/vault/client": [
        { entry: "api", type: "DIRECTORY" },
        { entry: "editor", type: "DIRECTORY" }
      ],
      "C:/vault/client/api": [
        { entry: "aboutApi.js.md", type: "FILE" },
        { entry: "apiClient.js.md", type: "FILE" }
      ],
      "C:/vault/client/editor": [
        { entry: "editor.js.md", type: "FILE" }
      ]
    };
    window.Neutralino = {
      filesystem: {
        readDirectory: async (path) => directoryEntries[path] || [],
        readFile: async (path) => {
          if (path === "C:/vault/client/api/aboutApi.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/aboutApi.js\"\n---\n# About API";
          if (path === "C:/vault/client/api/apiClient.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/apiClient.js\"\n---\n# API Client";
          if (path === "C:/vault/client/editor/editor.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/editor/editor.js\"\n---\n# Editor";
          if (path === "C:/workspace/my_project/client/api/aboutApi.js") return "export const aboutApi = {};";
          if (path === "C:/workspace/my_project/client/api/apiClient.js") return "export const apiClient = {};";
          if (path === "C:/workspace/my_project/client/editor/editor.js") return "export const editor = {};";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async (path) => {
          window.__createdDirectories.push(path);
        },
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift() || "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
  });

  await page.goto("/");
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree());
  await expect(page.locator(".folder-tree-label", { hasText: "api" })).toBeVisible();
  await expect(page.locator(".folder-tree-file", { hasText: "editor.js.md" })).toBeVisible();

  await page.locator(".folder-tree-label", { hasText: "api" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 220
  });
  await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Export original nodes" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/client/api/aboutApi.js", content: "export const aboutApi = {};" },
    { path: "C:/temp/sub_project/my_project/client/api/apiClient.js", content: "export const apiClient = {};" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__createdDirectories)).toEqual([
    "C:/temp/sub_project/my_project",
    "C:/temp/sub_project/my_project/client",
    "C:/temp/sub_project/my_project/client/api"
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 2 original files." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
});

test("sidebar file context menu exports original source file for that node", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__createdDirectories = [];
    window.__writes = [];
    window.__openedFolders = [];
    const folderSelections = ["C:/vault", "C:/temp/sub_project"];
    const directoryEntries = {
      "C:/vault": [
        { entry: "client", type: "DIRECTORY" }
      ],
      "C:/vault/client": [
        { entry: "api", type: "DIRECTORY" }
      ],
      "C:/vault/client/api": [
        { entry: "aboutApi.js.md", type: "FILE" },
        { entry: "apiClient.js.md", type: "FILE" }
      ]
    };
    window.Neutralino = {
      filesystem: {
        readDirectory: async (path) => directoryEntries[path] || [],
        readFile: async (path) => {
          if (path === "C:/vault/client/api/aboutApi.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/aboutApi.js\"\n---\n# About API";
          if (path === "C:/vault/client/api/apiClient.js.md") return "---\nsource_file: \"C:/workspace/my_project/client/api/apiClient.js\"\n---\n# API Client";
          if (path === "C:/workspace/my_project/client/api/aboutApi.js") return "export const aboutApi = {};";
          if (path === "C:/workspace/my_project/client/api/apiClient.js") return "export const apiClient = {};";
          throw new Error(`Unexpected read: ${path}`);
        },
        createDirectory: async (path) => {
          window.__createdDirectories.push(path);
        },
        getStats: async (path) => {
          if (path === "C:/temp" || path === "C:/temp/sub_project") return { type: "DIRECTORY" };
          throw new Error(`Missing path: ${path}`);
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        }
      },
      os: {
        showFolderDialog: async () => folderSelections.shift() || "C:/temp/sub_project",
        open: async (path) => {
          window.__openedFolders.push(path);
        }
      }
    };
  });

  await page.goto("/");
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree());
  await expect(page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" })).toBeVisible();

  await page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 150,
    clientY: 160
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-submenu", { hasText: "Export" })
    .locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Export original node" })
    .evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/temp/sub_project/my_project/client/api/aboutApi.js", content: "export const aboutApi = {};" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__createdDirectories)).toEqual([
    "C:/temp/sub_project/my_project",
    "C:/temp/sub_project/my_project/client",
    "C:/temp/sub_project/my_project/client/api"
  ]);
  const completeModal = page.locator(".reset-modal-overlay", { hasText: "Exported 1 original file." });
  await expect(completeModal).toBeVisible();
  await completeModal.getByRole("button", { name: "Open Folder" }).click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/temp/sub_project"]);
});

test("sidebar file context menu opens original source in a separate tab after generated file is open", async ({ page }) => {
  await openApp(page);

  const existingTabTitle = await page.evaluate(() => {
    const tabsModule = window.markdownViewerApp.modules.tabs;
    tabsModule.openSidebarFileInPermanentTab("# About API", "aboutApi.js", {
      name: "aboutApi.js.md",
      path: "C:/vault/client/api/aboutApi.js.md"
    });
    return tabsModule.findTabForSourceFile({
      name: "aboutApi.js",
      path: "C:/workspace/my_project/client/api/aboutApi.js"
    })?.title || "";
  });

  expect(existingTabTitle).toBe("");
});

test("saved graph view details buttons open restored comparison details", async ({ page }) => {
  await page.addInitScript(() => {
    const savedGraphComparisonDetails = {
      sections: [
        { title: "New in current folder", items: ["current.md"] },
        { title: "Only in saved graph", items: ["saved-only.md"] },
        { title: "New connections", items: [] },
        { title: "Saved-only connections", items: ["saved-only.md -> alpha.md"] }
      ]
    };
    const graphTab = {
      id: "saved_details_graph_e2e",
      title: "Saved Details Graph",
      content: "",
      savedContent: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Saved Details Graph",
      keepSavedGraphMode: true,
      savedGraphComparisonDetails,
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        collapsedClusters: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1.2,
        centerForce: 0.7,
        repelForce: 240,
        linkForce: 0.6,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Saved Details Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current" }
        ],
        links: [],
        files: [
          { id: "alpha.md", name: "alpha.md", path: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".saved-graph-mode-details-button")).toBeVisible();

  await page.locator(".saved-graph-mode-details-button").click();
  await expect(page.locator("#graph-comparison-details-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-comparison-details-content")).toContainText("Only in saved graph");
  await expect(page.locator("#graph-comparison-details-content")).toContainText("saved-only.md");
  await page.locator("#graph-comparison-details-done").click();
  await expect(page.locator("#graph-comparison-details-modal")).toHaveClass(/hidden/);

  await page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    window.markdownViewerApp.modules.graphPersistence.showSavedGraphModeBanner(tab);
  });
  await expect(page.locator(".graph-update-banner-details-button")).toBeVisible();
  await page.locator(".graph-update-banner-details-button").click();
  await expect(page.locator("#graph-comparison-details-modal")).not.toHaveClass(/hidden/);
  await expect(page.locator("#graph-comparison-details-content")).toContainText("current.md");

  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    window.markdownViewerApp.modules.graphPersistence.saveTabsToStorage(tabs);
    return JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0]?.savedGraphComparisonDetails?.sections?.length || 0;
  })).toBe(4);
});
