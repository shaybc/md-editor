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
test("creating a tag from the tag dialog shows the new tag", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["stale-known"] }));
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield {
          kind: "file",
          name: "untagged.md",
          getFile: async () => new File(["# Untagged"], "untagged.md", { type: "text/markdown" }),
          createWritable: async () => ({ write: async () => {}, close: async () => {} })
        };
      }
    });
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await expect(page.locator("#tag-management-list .tag-management-list-empty")).toBeVisible();
  await page.locator("#create-tag-button").evaluate((button) => button.click());
  await expect(page.locator("#app-notification-modal")).toBeVisible();
  await page.locator("#app-notification-modal .rename-modal-input").fill("Fresh Tag");
  await page.locator('#app-notification-actions [data-notification-button-id="create"]').click();

  await expect(page.locator("#tag-management-search")).toHaveValue("");
  await expect(page.locator("#tag-management-list .tag-management-list-item")).toHaveText(["#fresh tag0"]);

  await page.locator(".folder-tree-file", { hasText: "untagged.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await expect(page.locator(".sidebar-file-context-menu:not(.hidden) .tags-context-menu-item")).toHaveText(["#fresh tag"]);
});

test("desktop graph context menu can update file tags", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.__moves = [];
    window.alert = (message) => window.__alerts.push(String(message));
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => {
          if (path === "C:/vault/alpha.md") return "---\ntags: [defined]\n---\n# Alpha";
          if (path === "C:/vault/archive/alpha.md") return "---\ntags: [archive]\n---\n# Archived Alpha";
          return "---\ntags: [other]\n---\n# Beta";
        },
        writeFile: async (path, content) => {
          window.__writes.push({ path, content });
        },
        move: async (oldPath, newPath) => {
          window.__moves.push({ oldPath, newPath });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };
    const graphTab = {
      id: "desktop_graph_e2e",
      title: "Desktop Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Desktop Graph E2E",
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
        folderName: "Desktop Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: ["other"] },
          { id: "archive/alpha.md", label: "alpha.md", fullPath: "C:/vault/archive/alpha.md", type: "file", status: "current", tags: ["archive"] },
          { id: "tag:archive", label: "#archive", type: "tag", status: "current", tag: "archive" },
          { id: "tag:defined", label: "#defined", type: "tag", status: "current", tag: "defined" },
          { id: "tag:other", label: "#other", type: "tag", status: "current", tag: "other" }
        ],
        links: [
          { source: "alpha.md", target: "tag:defined", type: "tag", status: "current" },
          { source: "beta.md", target: "tag:other", type: "tag", status: "current" },
          { source: "archive/alpha.md", target: "tag:archive", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha", status: "current", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "---\ntags: [other]\n---\n# Beta", fullPath: "C:/vault/beta.md", status: "current", tags: ["other"] },
          { id: "archive/alpha.md", path: "archive/alpha.md", name: "alpha.md", content: "---\ntags: [archive]\n---\n# Archived Alpha", fullPath: "C:/vault/archive/alpha.md", status: "current", tags: ["archive"] }
        ]
      }
    };
    const unrelatedGraphTab = {
      ...graphTab,
      id: "unrelated_graph_e2e",
      title: "Unrelated Graph E2E",
      folderName: "Unrelated Graph E2E",
      graphScopeKey: "root-folder:c:/other-vault",
      graphSnapshot: {
        version: 1,
        folderName: "Unrelated Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current", tags: ["unrelated"] },
          { id: "tag:unrelated", label: "#unrelated", type: "tag", status: "current", tag: "unrelated" }
        ],
        links: [
          { source: "alpha.md", target: "tag:unrelated", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [unrelated]\n---\n# Other Alpha", status: "current", tags: ["unrelated"] }
        ]
      }
    };
    const openMarkdownTab = {
      id: "alpha_markdown_tab",
      title: "Alpha",
      content: "---\ntags: [defined]\n---\n# Alpha",
      savedContent: "---\ntags: [defined]\n---\n# Alpha",
      scrollPos: 0,
      viewMode: "split",
      createdAt: Date.now(),
      isTemporary: false,
      type: "markdown",
      sourceFileName: "alpha.md",
      sourceFilePath: "C:/vault/alpha.md"
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["ghost"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab, unrelatedGraphTab, openMarkdownTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node")).toHaveCount(6);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  const tagItems = page.locator(".graph-tab-render .tags-context-menu-item");
  await expect(tagItems).toHaveText(["#archive", "#defined", "#other"]);
  await expect(page.locator(".graph-tab-render .tags-graph-context-submenu > .graph-context-menu-item")).toContainText("Tag graph");
  await expect(page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item")).toHaveText([
    "Tag Local Graph",
    "Tag full Local Graph",
    "Tag full Network"
  ]);
  await expect(page.locator(".graph-tab-render .tags-context-submenu-panel > .graph-context-menu-item", { hasText: "New tag ..." })).toHaveCount(1);
  await page.locator(".graph-context-menu-submenu.tags-context-submenu").hover();
  await tagItems.filter({ hasText: "#other" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__writes[0].content)).toContain("other");
  await expect.poll(() => page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((entry) => entry.id === "alpha_markdown_tab");
    return {
      content: tab.content,
      savedContent: tab.savedContent,
      unsaved: tab.content !== tab.savedContent
    };
  })).toEqual({
    content: "---\ntags: [defined, other]\n---\n# Alpha",
    savedContent: "---\ntags: [defined, other]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "Alpha" })).not.toHaveClass(/unsaved/);
  await expect(page.locator(".graph-link-tag")).toHaveCount(4);
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs"));
    const graphTab = tabs.find((tab) => tab.id === "desktop_graph_e2e");
    const unrelatedGraphTab = tabs.find((tab) => tab.id === "unrelated_graph_e2e");
    const archiveFile = graphTab.graphSnapshot.files.find((file) => {
      const path = String(file.fullPath || file.path || "");
      return path.endsWith("archive/alpha.md") || path.endsWith("archive\\alpha.md");
    });
    return {
      archive: archiveFile?.tags || [],
      unrelated: unrelatedGraphTab.graphSnapshot.files[0]?.tags || []
    };
  })).toEqual({ archive: ["archive"], unrelated: ["unrelated"] });

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await expect(page.locator(".graph-tab-render .tags-context-menu-item", { hasText: "#other" })).toHaveAttribute("aria-checked", "true");
  await page.locator(".graph-tab-render .tags-context-submenu-panel .graph-context-menu-item", { hasText: "New tag ..." }).evaluate((button) => button.click());
  await expect(page.locator("#app-notification-modal")).toBeVisible();
  await page.locator("#app-notification-modal .rename-modal-input").fill("Fresh Graph");
  await page.locator('#app-notification-actions [data-notification-button-id="create"]').click();

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((entry) => entry.id === "alpha_markdown_tab");
    return {
      content: tab.content,
      savedContent: tab.savedContent,
      unsaved: tab.content !== tab.savedContent
    };
  })).toEqual({
    content: "---\ntags: [defined, other, fresh graph]\n---\n# Alpha",
    savedContent: "---\ntags: [defined, other, fresh graph]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator(".graph-link-tag")).toHaveCount(5);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .tags-context-menu-item", { hasText: "#defined" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(3);
  await expect.poll(() => page.evaluate(() => {
    const tab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((entry) => entry.id === "alpha_markdown_tab");
    return {
      content: tab.content,
      savedContent: tab.savedContent,
      unsaved: tab.content !== tab.savedContent
    };
  })).toEqual({
    content: "---\ntags: [other, fresh graph]\n---\n# Alpha",
    savedContent: "---\ntags: [other, fresh graph]\n---\n# Alpha",
    unsaved: false
  });
  await expect(page.locator(".graph-link-tag")).toHaveCount(4);
  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await expect(page.locator(".graph-tab-render .tags-context-menu-item")).toHaveText(["#archive", "#fresh graph", "#other"]);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).click();
  await page.locator("#rename-modal-input").fill("renamed.md");
  await page.locator("#rename-modal-confirm").click();

  await expect.poll(() => page.evaluate(() => window.__moves)).toEqual([
    { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/renamed.md" }
  ]);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});

test("graph tags submenu can tag the full local graph", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/alpha.md", "# Alpha\n\n[[beta]]"],
      ["C:/vault/beta.md", "# Beta\n\n[[gamma]]"],
      ["C:/vault/gamma.md", "# Gamma"]
    ]);
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          files.set(path, String(content));
          window.__writes.push({ path, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };
    const openMarkdownTab = {
      id: "open_beta_tab_e2e",
      title: "beta.md",
      content: "# Beta\n\n[[gamma]]",
      savedContent: "# Beta\n\n[[gamma]]",
      sourceFileName: "beta.md",
      sourceFilePath: "C:/vault/beta.md",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false
    };
    const graphTab = {
      id: "full_local_tag_graph_e2e",
      title: "Full Local Tag Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Full Local Tag Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [{ id: "hidden-full-group", query: "tag:full", color: "#7c3aed", enabled: false, hidden: true }],
        searchQuery: "",
        showArrows: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Full Local Tag Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "gamma.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha\n\n[[beta]]", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", fullPath: "C:/vault/beta.md", content: "# Beta\n\n[[gamma]]", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", fullPath: "C:/vault/gamma.md", content: "# Gamma", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["full"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([openMarkdownTab, graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(3);

  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  await expect(page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item")).toHaveText([
    "Tag Local Graph",
    "Tag full Local Graph",
    "Tag full Network"
  ]);
  await page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item", { hasText: "Tag full Local Graph" }).evaluate((button) => button.click());
  await expect(page.locator(".graph-tag-picker-title")).toHaveText("Tag full Local Graph");
  await page.locator(".graph-tag-picker-item", { hasText: "#full" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path))).toEqual([
    "C:/vault/alpha.md",
    "C:/vault/beta.md",
    "C:/vault/gamma.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.id === "full_local_tag_graph_e2e");
    return graphTab.graphSnapshot.files.map((file) => ({ id: file.id, tags: file.tags }));
  })).toEqual([
    { id: "alpha", tags: ["full"] },
    { id: "beta", tags: ["full"] },
    { id: "gamma", tags: ["full"] }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const betaTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.id === "open_beta_tab_e2e");
    return betaTab && {
      content: betaTab.content,
      savedContent: betaTab.savedContent,
      graphSyncedTags: betaTab.graphSyncedTags
    };
  })).toEqual({
    content: "---\ntags: [full]\n---\n# Beta\n\n[[gamma]]",
    savedContent: "---\ntags: [full]\n---\n# Beta\n\n[[gamma]]",
    graphSyncedTags: ["full"]
  });
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.id === "full_local_tag_graph_e2e");
    return (graphTab.graphViewConfig.groups || []).map((group) => ({
      id: group.id,
      query: group.query,
      enabled: group.enabled,
      hidden: group.hidden === true,
      hasColor: Boolean(group.color)
    }));
  })).toEqual([
    { id: "hidden-full-group", query: "tag:full", enabled: true, hidden: false, hasColor: true }
  ]);
});

test("graph tags submenu can tag the full network", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/alpha.md", "# Alpha\n\n[[beta]]"],
      ["C:/vault/beta.md", "# Beta\n\n[[gamma]]"],
      ["C:/vault/gamma.md", "# Gamma"],
      ["C:/vault/delta.md", "# Delta"]
    ]);
    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          files.set(path, String(content));
          window.__writes.push({ path, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };
    const graphTab = {
      id: "full_network_tag_graph_e2e",
      title: "Full Network Tag Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Full Network Tag Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true
      },
      graphSnapshot: {
        version: 1,
        folderName: "Full Network Tag Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] },
          { id: "delta.md", label: "delta.md", fullPath: "C:/vault/delta.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "gamma.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", fullPath: "C:/vault/alpha.md", content: "# Alpha\n\n[[beta]]", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", fullPath: "C:/vault/beta.md", content: "# Beta\n\n[[gamma]]", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", fullPath: "C:/vault/gamma.md", content: "# Gamma", status: "current", tags: [] },
          { id: "delta.md", path: "delta.md", name: "delta.md", fullPath: "C:/vault/delta.md", content: "# Delta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["network"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(4);

  const betaNode = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "beta.md" }) }).first();
  await betaNode.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  await page.locator(".graph-tab-render .tags-graph-context-submenu-panel > .graph-context-menu-item", { hasText: "Tag full Network" }).evaluate((button) => button.click());
  await expect(page.locator(".graph-tag-picker-title")).toHaveText("Tag full Network");
  await page.locator(".graph-tag-picker-item", { hasText: "#network" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path))).toEqual([
    "C:/vault/alpha.md",
    "C:/vault/beta.md",
    "C:/vault/gamma.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    return graphTab.graphSnapshot.files.map((file) => ({ id: file.id, tags: file.tags }));
  })).toEqual([
    { id: "alpha", tags: ["network"] },
    { id: "beta", tags: ["network"] },
    { id: "gamma", tags: ["network"] },
    { id: "delta", tags: [] }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0];
    return (graphTab.graphViewConfig.groups || []).map((group) => ({
      query: group.query,
      enabled: group.enabled,
      hidden: group.hidden === true,
      hasColor: Boolean(group.color)
    }));
  })).toEqual([
    { query: "tag:network", enabled: true, hidden: false, hasColor: true }
  ]);
});

test("desktop tree context menu can update file tags", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.__clipboard = "";
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["alpha.md", "---\ntags: [defined]\n---\n# Alpha"],
      ["beta.md", "---\ntags: [other]\n---\n# Beta"]
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
        },
        writeFile: async (path, content) => {
          files.set(getName(path), String(content));
          window.__writes.push({ path, content: String(content) });
        }
      },
      clipboard: { writeText: async (text) => { window.__clipboard = String(text || ""); } }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await page.locator("#import-from-folder").click();

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });

  const treeMenu = page.locator(".sidebar-file-context-menu:not(.hidden)");
  await expect(treeMenu.evaluate((menu) => Array.from(menu.children).map((child) => child.textContent.trim()))).resolves.not.toContain("Share");
  const treeExportSubmenu = treeMenu.locator(".graph-context-menu-submenu", { hasText: "Export" });
  await treeExportSubmenu.evaluate((submenu) => submenu.querySelector("button")?.focus());
  await expect(treeExportSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Share",
    "Export as Markdown",
    "Export as HTML",
    "Export as PDF",
    "Export original node"
  ]);
  const treeCopySubmenu = treeMenu.locator(".graph-context-menu-submenu", { hasText: "Copy" });
  await treeCopySubmenu.evaluate((submenu) => submenu.querySelector("button")?.focus());
  await expect(treeCopySubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Copy path",
    "Copy content",
    "Copy frontmatter",
    "Copy tags"
  ]);
  await treeMenu.locator(".graph-context-menu-item", { hasText: "Copy frontmatter" }).dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => window.__clipboard.replace(/\r\n/g, "\n"))).toBe("---\ntags: [defined]\n---");

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await treeCopySubmenu.evaluate((submenu) => submenu.querySelector("button")?.focus());
  await treeMenu.locator(".graph-context-menu-item", { hasText: "Copy tags" }).dispatchEvent("click");
  await expect.poll(() => page.evaluate(() => window.__clipboard)).toBe("defined");

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await expect(treeMenu.locator(".tags-context-menu-item")).toHaveText(["#defined", "#other"]);
  await expect(treeMenu.locator(".tags-context-submenu-panel .graph-context-menu-item")).toHaveText([
    "#defined",
    "#other",
    "New tag ..."
  ]);
  await treeMenu.locator(".tags-context-menu-item", { hasText: "#other" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);
  await expect.poll(() => page.evaluate(() => window.__writes[0].content)).toContain("defined, other");

  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await treeMenu.locator(".tags-context-submenu-panel .graph-context-menu-item", { hasText: "New tag ..." }).evaluate((button) => button.click());
  await expect(page.locator("#app-notification-modal")).toBeVisible();
  await page.locator("#app-notification-modal .rename-modal-input").fill("Fresh Tree");
  await page.locator('#app-notification-actions [data-notification-button-id="create"]').click();
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__writes[1].content)).toContain("defined, other, fresh tree");

  await page.locator(".open-graph-view").first().click();
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.type === "graph");
    return graphTab?.graphSnapshot?.files?.find((file) => file.path === "alpha.md")?.tags || [];
  })).toEqual(["defined", "other", "fresh tree"]);
  await expect(page.locator("#graph-selected-tag-filter option")).toHaveText(["All files", "#defined", "#fresh tree", "#other"]);
  await page.locator("#graph-show-tags").evaluate((button) => button.click());
  await expect(page.locator(".graph-node-tag")).toHaveCount(3);
  await expect(page.locator(".graph-label-tag", { hasText: "#other" })).toHaveCount(1);
  await expect(page.locator(".graph-label-tag", { hasText: "#fresh tree" })).toHaveCount(1);
  await expect(page.locator(".graph-link-tag")).toHaveCount(4);
});

test("tree folder context menu tags markdown files in that folder tree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const files = new Map([
      ["C:/vault/docs/alpha.md", "---\ntags: [project]\n---\n# Alpha"],
      ["C:/vault/docs/nested/beta.md", "# Beta"],
      ["C:/vault/root.md", "# Root"]
    ]);
    const directoryEntries = new Map([
      ["C:/vault", [{ entry: "docs", type: "DIRECTORY" }, { entry: "root.md", type: "FILE" }]],
      ["C:/vault/docs", [{ entry: "alpha.md", type: "FILE" }, { entry: "nested", type: "DIRECTORY" }]],
      ["C:/vault/docs/nested", [{ entry: "beta.md", type: "FILE" }]]
    ]);
    const normalizePath = (path) => String(path || "").replace(/\\/g, "/");
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => directoryEntries.get(normalizePath(path)) || [],
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const normalizedPath = normalizePath(path);
          if (files.has(normalizedPath)) return files.get(normalizedPath);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          const normalizedPath = normalizePath(path);
          files.set(normalizedPath, String(content));
          window.__writes.push({ path: normalizedPath, content: String(content) });
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(3);
  const docsFolder = page.locator(".folder-tree-label", { hasText: "docs" });
  await expect(docsFolder).toBeVisible();
  await expect.poll(() => page.locator("#tag-management-list .tag-management-list-item", { hasText: "#project" }).count()).toBe(1);

  await docsFolder.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });

  const folderMenu = page.locator(".sidebar-folder-context-menu:not(.hidden)");
  await expect(folderMenu).toBeVisible();
  await expect(folderMenu.locator(".tags-context-submenu")).toBeVisible();
  await expect(folderMenu.locator(".tags-context-submenu-panel .graph-context-menu-item")).toHaveText([
    "#project",
    "New tag ..."
  ]);
  await expect(folderMenu.locator(".graph-context-menu-item", { hasText: "Tag Local Graph" })).toHaveCount(0);

  await folderMenu.locator(".tags-context-menu-item", { hasText: "#project" }).evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes)).toEqual([
    { path: "C:/vault/docs/nested/beta.md", content: "---\ntags: [project]\n---\n# Beta" }
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")
      .find((tab) => tab.type === "graph");
    return (graphTab?.graphViewConfig?.groups || []).map((group) => ({
      query: group.query,
      enabled: group.enabled,
      hidden: group.hidden === true,
      hasColor: Boolean(group.color)
    }));
  })).toEqual([
    { query: "tag:project", enabled: true, hidden: false, hasColor: true }
  ]);
  await expect.poll(() => page.evaluate(async () => ({
    alpha: await Neutralino.filesystem.readFile("C:/vault/docs/alpha.md"),
    beta: await Neutralino.filesystem.readFile("C:/vault/docs/nested/beta.md"),
    root: await Neutralino.filesystem.readFile("C:/vault/root.md")
  }))).toEqual({
    alpha: "---\ntags: [project]\n---\n# Alpha",
    beta: "---\ntags: [project]\n---\n# Beta",
    root: "# Root"
  });
});

test("clicking a tag in the tag dialog filters the folder tree", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.confirm = () => true;
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled", defaultOpenViewMode: "editor" }));
    const files = new Map([
      ["C:/vault/tagged.md", "---\ntags: [project]\n---\n# Tagged"],
      ["C:/vault/docs/nested-tagged.md", "---\ntags: [project]\n---\n# Nested Tagged"],
      ["C:/vault/untagged.md", "# Untagged"]
    ]);
    const directoryEntries = new Map([
      ["C:/vault", [{ entry: "docs", type: "DIRECTORY" }, { entry: "tagged.md", type: "FILE" }, { entry: "untagged.md", type: "FILE" }]],
      ["C:/vault/docs", [{ entry: "nested-tagged.md", type: "FILE" }]]
    ]);
    const normalizePath = (path) => String(path || "").replace(/\\/g, "/");
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => directoryEntries.get(normalizePath(path)) || [],
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          const normalizedPath = normalizePath(path);
          if (files.has(normalizedPath)) return files.get(normalizedPath);
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          files.set(normalizePath(path), String(content));
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  const taggedFile = page.locator(".folder-tree-file[data-path='tagged.md']");
  const nestedTaggedFile = page.locator(".folder-tree-file[data-path='docs/nested-tagged.md']");
  const untaggedFile = page.locator(".folder-tree-file[data-path='untagged.md']");
  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toBeVisible();

  const tagButton = page.locator("#tag-management-list .tag-management-list-item", { hasText: "#project" });
  await expect(tagButton).toBeVisible();
  await expect(tagButton).toHaveText("#project2");
  await tagButton.evaluate((button) => button.click());

  await expect(taggedFile).toBeVisible();
  await expect(nestedTaggedFile).toBeVisible();
  await expect(untaggedFile).toHaveCount(0);
  await expect(tagButton).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".tag-management-menu-button")).toHaveClass(/tag-filter-active/);
  await expect(page.locator(".tag-management-menu-button")).toHaveCSS("color", "rgb(3, 102, 214)");

  await page.locator("#clear-tag-filter-button").evaluate((button) => button.click());
  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toBeVisible();
  await expect(page.locator(".tag-management-menu-button")).not.toHaveClass(/tag-filter-active/);
  await expect(page.locator("#clear-tag-filter-button")).toBeDisabled();

  await tagButton.evaluate((button) => button.click());
  await expect(page.locator(".tag-management-menu-button")).toHaveClass(/tag-filter-active/);
  await expect(nestedTaggedFile).toBeVisible();
  await expect(untaggedFile).toHaveCount(0);

  await page.locator("#delete-tag-button").evaluate((button) => button.click());
  const deleteTagModal = page.locator("#app-notification-modal");
  await expect(deleteTagModal).toBeVisible();
  await expect(deleteTagModal.locator("select")).toHaveValue("project");
  await deleteTagModal.locator("select").selectOption("project");
  await deleteTagModal.locator('[data-notification-button-id="delete"]').click();
  await expect(taggedFile).toBeVisible();
  await expect(untaggedFile).toBeVisible();
  await expect(page.locator(".tag-management-menu-button")).not.toHaveClass(/tag-filter-active/);
  await expect(page.locator("#clear-tag-filter-button")).toBeDisabled();
  await expect(page.locator("#tag-management-list .tag-management-list-item", { hasText: "#project" })).toHaveCount(0);
});

test("hovering a graph tag point highlights directly tagged files", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerTabs", JSON.stringify([{
      id: "graph_hover_e2e",
      title: "Graph",
      content: "",
      savedContent: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Graph",
      graphViewConfig: { mode: "all", showTags: true },
      graphSnapshot: {
        folderName: "Graph",
        nodes: [
          { id: "alpha.md", label: "alpha.md", type: "file", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", type: "file", tags: [] },
          { id: "tag:defined", label: "#defined", tag: "defined", type: "tag" }
        ],
        links: [{ source: "alpha.md", target: "tag:defined", type: "tag" }],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", tags: [] }
        ]
      }
    }]));
    localStorage.setItem("markdownViewerActiveTab", "graph_hover_e2e");
  });
  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  await page.locator(".graph-node-tag").dispatchEvent("mouseenter", { bubbles: true, cancelable: true });
  await expect(page.locator(".graph-node-file").first()).not.toHaveClass(/dimmed/);
  await expect(page.locator(".graph-link-tag")).not.toHaveClass(/dimmed/);
});
