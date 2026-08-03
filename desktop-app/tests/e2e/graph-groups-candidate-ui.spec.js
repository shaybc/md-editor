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
test("graph group order can be rearranged and changes point priority", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "group_order_graph_e2e",
      title: "Group Order Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Group Order Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "first_group", query: "tag:shared", color: "#ff0000", enabled: true },
          { id: "second_group", query: "file:alpha", color: "#0000ff", enabled: true }
        ],
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
        folderName: "Group Order Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["shared"] }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [shared]\n---\n# Alpha", status: "current", tags: ["shared"] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();

  const getAlphaGroupId = () => page.evaluate(() => {
    const alpha = Array.from(document.querySelectorAll(".graph-node"))
      .find((node) => node.__data__?.id === "alpha.md");
    return alpha?.__data__?.groupId || "";
  });

  await expect.poll(getAlphaGroupId).toBe("first_group");

  await page.locator("#graph-filter-panel-toggle").click();
  await page.locator(".graph-collapsible-section", { hasText: "Groups" }).locator("summary").click();
  await expect(page.locator(".graph-group-row")).toHaveCount(2);
  await expect(page.locator(".graph-group-row").nth(0).locator(".graph-group-drag-handle")).toBeVisible();
  await expect(page.locator(".graph-group-row").nth(0).locator(".graph-group-drag-handle")).toHaveAttribute("draggable", "true");

  await page.evaluate(() => {
    const rows = Array.from(document.querySelectorAll(".graph-group-row"));
    const handle = rows[0]?.querySelector(".graph-group-drag-handle");
    const dataTransfer = new DataTransfer();
    handle?.dispatchEvent(new DragEvent("dragstart", { bubbles: true, cancelable: true, dataTransfer }));
    rows[1]?.dispatchEvent(new DragEvent("dragover", { bubbles: true, cancelable: true, dataTransfer }));
    rows[1]?.dispatchEvent(new DragEvent("drop", { bubbles: true, cancelable: true, dataTransfer }));
    handle?.dispatchEvent(new DragEvent("dragend", { bubbles: true, cancelable: true, dataTransfer }));
  });

  await expect(page.locator(".graph-group-row").nth(0).locator(".graph-group-query-input")).toHaveValue("file:alpha");
  await expect(page.locator(".graph-group-row").nth(1).locator(".graph-group-query-input")).toHaveValue("tag:shared");
  await expect.poll(getAlphaGroupId).toBe("second_group");
  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs[0]?.graphViewConfig?.groups?.map((group) => group.id);
  })).toEqual(["second_group", "first_group"]);
});

test("graph group hide button removes and restores matching points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "group_hide_graph_e2e",
      title: "Group Hide Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Group Hide Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "shared_group", query: "tag:shared", color: "#ff0000", enabled: true, hidden: false }
        ],
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
        folderName: "Group Hide Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["shared"] },
          { id: "beta.md", label: "beta.md", fullPath: "beta.md", type: "file", status: "current", tags: [] }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [shared]\n---\n# Alpha", status: "current", tags: ["shared"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(2);
  await expect(page.locator(".graph-link")).toHaveCount(1);

  await page.locator("#graph-filter-panel-toggle").click();
  await page.locator(".graph-collapsible-section", { hasText: "Groups" }).locator("summary").click();
  const hideButton = page.locator(".graph-group-row").first().locator(".graph-group-hide-button");
  const switchLabel = page.locator(".graph-group-row").first().locator(".graph-group-switch-label");
  await expect(hideButton).toHaveAttribute("aria-pressed", "false");
  await expect(hideButton.locator("i")).toHaveClass(/bi-eye-slash/);

  await switchLabel.click();
  await expect.poll(() => page.evaluate(() => {
    const alpha = Array.from(document.querySelectorAll(".graph-node"))
      .find((node) => node.__data__?.id === "alpha.md");
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { enabled: tabs[0]?.graphViewConfig?.groups?.[0]?.enabled, groupId: alpha?.__data__?.groupId || "" };
  })).toEqual({ enabled: false, groupId: "" });
  await switchLabel.click();
  await expect.poll(() => page.evaluate(() => {
    const alpha = Array.from(document.querySelectorAll(".graph-node"))
      .find((node) => node.__data__?.id === "alpha.md");
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { enabled: tabs[0]?.graphViewConfig?.groups?.[0]?.enabled, groupId: alpha?.__data__?.groupId || "" };
  })).toEqual({ enabled: true, groupId: "shared_group" });

  await hideButton.click();
  await expect(hideButton).toHaveAttribute("aria-pressed", "true");
  await expect(hideButton.locator("i")).toHaveClass(/bi-eye/);
  await expect(page.locator(".graph-node")).toHaveCount(1);
  await expect(page.locator(".graph-link")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => {
    const nodeIds = Array.from(document.querySelectorAll(".graph-node")).map((node) => node.__data__?.id).sort();
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return { nodeIds, hidden: tabs[0]?.graphViewConfig?.groups?.[0]?.hidden, hiddenNodeIds: tabs[0]?.graphViewConfig?.hiddenNodeIds };
  })).toEqual({ nodeIds: ["beta.md"], hidden: true, hiddenNodeIds: [] });

  await hideButton.click();
  await expect(hideButton).toHaveAttribute("aria-pressed", "false");
  await expect(page.locator(".graph-node")).toHaveCount(2);
  await expect(page.locator(".graph-link")).toHaveCount(1);
});

test("graph link metric groups color ranked points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "links_group_graph_e2e",
      title: "Links Group Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Links Group Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "incoming_group", query: "links:max-in", color: "#ffff00", enabled: true, hidden: false }
        ],
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
        folderName: "Links Group Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "hub.md", label: "hub.md", type: "file", status: "current" },
          { id: "mid.md", label: "mid.md", type: "file", status: "current" },
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current" },
          { id: "beta.md", label: "beta.md", type: "file", status: "current" },
          { id: "gamma.md", label: "gamma.md", type: "file", status: "current" },
          { id: "lonely.md", label: "lonely.md", type: "file", status: "current" }
        ],
        links: [
          { source: "mid.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "hub.md", type: "link", status: "current" },
          { source: "beta.md", target: "hub.md", type: "link", status: "current" },
          { source: "gamma.md", target: "hub.md", type: "link", status: "current" },
          { source: "lonely.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "mid.md", type: "link", status: "current" },
          { source: "gamma.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "hub.md", path: "hub.md", name: "hub.md", content: "# Hub", status: "current" },
          { id: "mid.md", path: "mid.md", name: "mid.md", content: "# Mid", status: "current" },
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current" },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "# Gamma", status: "current" },
          { id: "lonely.md", path: "lonely.md", name: "lonely.md", content: "# Lonely", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(6);
  await expect.poll(() => page.evaluate(() => {
    return Array.from(document.querySelectorAll(".graph-node-file"))
      .filter((node) => node.__data__?.groupId === "incoming_group")
      .map((node) => node.__data__.id)
      .sort();
  })).toEqual(["alpha.md", "beta.md", "gamma.md", "hub.md", "mid.md"]);
});

test("graph hidden link metric groups remove ranked points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "links_hidden_group_graph_e2e",
      title: "Links Hidden Group Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Links Hidden Group Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [
          { id: "low_incoming_group", query: "links:min-in", color: "#ff00ff", enabled: true, hidden: true }
        ],
        searchQuery: "",
        showArrows: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkDistance: 170
      },
      graphSnapshot: {
        version: 1,
        folderName: "Links Hidden Group Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "hub.md", label: "hub.md", type: "file", status: "current" },
          { id: "mid.md", label: "mid.md", type: "file", status: "current" },
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current" },
          { id: "beta.md", label: "beta.md", type: "file", status: "current" },
          { id: "gamma.md", label: "gamma.md", type: "file", status: "current" },
          { id: "lonely.md", label: "lonely.md", type: "file", status: "current" }
        ],
        links: [
          { source: "mid.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "hub.md", type: "link", status: "current" },
          { source: "beta.md", target: "hub.md", type: "link", status: "current" },
          { source: "gamma.md", target: "hub.md", type: "link", status: "current" },
          { source: "lonely.md", target: "hub.md", type: "link", status: "current" },
          { source: "alpha.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "mid.md", type: "link", status: "current" },
          { source: "gamma.md", target: "mid.md", type: "link", status: "current" },
          { source: "beta.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "alpha.md", type: "link", status: "current" },
          { source: "gamma.md", target: "beta.md", type: "link", status: "current" }
        ],
        files: [
          { id: "hub.md", path: "hub.md", name: "hub.md", content: "# Hub", status: "current" },
          { id: "mid.md", path: "mid.md", name: "mid.md", content: "# Mid", status: "current" },
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current" },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "# Gamma", status: "current" },
          { id: "lonely.md", path: "lonely.md", name: "lonely.md", content: "# Lonely", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    return Array.from(document.querySelectorAll(".graph-node-file")).map((node) => node.__data__?.id);
  })).toEqual(["hub.md"]);
});

test("graph quick action groups most referenced files by percentile", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));

    const files = new Map();
    const nodes = [];
    const snapshotFiles = [];
    for (let index = 1; index <= 20; index += 1) {
      const id = `file-${index}.md`;
      const fullPath = `C:/vault/${id}`;
      const content = `# File ${index}`;
      files.set(fullPath, content);
      nodes.push({ id, label: id, fullPath, type: "file", status: "current", tags: [] });
      snapshotFiles.push({ id, path: id, name: id, fullPath, content, status: "current", tags: [] });
    }

    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          await new Promise((resolve) => setTimeout(resolve, 120));
          files.set(path, content);
          window.__writes.push({ path, content });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };

    const graphTab = {
      id: "most_referenced_graph_e2e",
      title: "Most Referenced Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Most Referenced Graph E2E",
      graphScopeKey: "root-folder:c:/vault",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Most Referenced Graph E2E",
        createdAt: Date.now(),
        nodes,
        links: [
          { source: "file-3.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-4.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-5.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-6.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-7.md", target: "file-1.md", type: "link", status: "current" },
          { source: "file-8.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-9.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-10.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-11.md", target: "file-2.md", type: "link", status: "current" },
          { source: "file-12.md", target: "file-3.md", type: "link", status: "current" }
        ],
        files: snapshotFiles
      }
    };

    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      knownTags: ["infra"],
      graphMostReferencedPercent: 10,
      graphMagneticEnabled: true
    }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(20);
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Group most referenced" }).click();
  await expect(page.locator("#app-notification-modal")).toBeVisible();
  await page.locator("#app-notification-modal .rename-modal-input").fill("infra");
  await page.locator('#app-notification-actions [data-notification-button-id="create"]').click();
  await expect(page.locator(".graph-quick-action-status")).toBeVisible();
  await expect(page.locator(".graph-quick-action-status")).toHaveText(/Detecting most referenced|Tagging|Creating hidden group|Refreshing graph/);

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path).sort())).toEqual([
    "C:/vault/file-1.md",
    "C:/vault/file-2.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((tab) => tab.id === "most_referenced_graph_e2e");
    return {
      tagged: graphTab.graphSnapshot.files
        .filter((file) => (file.tags || []).includes("infra"))
        .map((file) => file.id)
        .sort(),
      groups: graphTab.graphViewConfig.groups.map((group) => ({
        query: group.query,
        enabled: group.enabled,
        hidden: group.hidden,
        hasColor: /^#[0-9a-f]{6}$/i.test(group.color || "")
      }))
    };
  })).toEqual({
    tagged: ["file-1", "file-2"],
    groups: [{ query: "tag:infra", enabled: true, hidden: true, hasColor: true }]
  });
  await expect(page.locator(".graph-node-file")).toHaveCount(18);
  await expect(page.locator(".graph-quick-action-status")).toBeHidden();
});

test("graph quick action groups most referenced files from snapshot without source folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));

    const graphViewConfig = {
      showTags: false,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      searchQuery: "",
      showArrows: true,
      showOrphans: true,
      showLabels: true,
      textFadeThreshold: 0.35,
      nodeSize: 0.8,
      linkThickness: 1,
      centerForce: 1,
      repelForce: 650,
      linkForce: 0.4,
      linkDistance: 170,
      groupForce: 0.18
    };
    const graphSnapshot = {
      version: 1,
      folderName: "Snapshot Only Most Referenced Graph",
      createdAt: Date.now(),
      nodes: [
        { id: "hub.md", label: "hub.md", type: "file", status: "current", tags: [] },
        { id: "alpha.md", label: "alpha.md", type: "file", status: "current", tags: [] },
        { id: "beta.md", label: "beta.md", type: "file", status: "current", tags: [] }
      ],
      links: [
        { source: "alpha.md", target: "hub.md", type: "link", status: "current" },
        { source: "beta.md", target: "hub.md", type: "link", status: "current" }
      ],
      files: [
        { id: "hub.md", path: "hub.md", name: "hub.md", content: "# Hub", status: "current", tags: [] },
        { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: [] },
        { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
      ]
    };
    const graphTab = {
      id: "snapshot_only_most_referenced_graph_e2e",
      title: "Snapshot Only Most Referenced Graph",
      schemaVersion: 2,
      type: "graph",
      folderName: "Snapshot Only Most Referenced Graph",
      createdAt: Date.now(),
      isTemporary: false,
      viewMode: "preview",
      scrollPos: 0,
      viewState: { graphViewConfig },
      dirty: true,
      draftDocument: {
        schemaVersion: 1,
        documentType: "graph-view",
        folderName: "Snapshot Only Most Referenced Graph",
        snapshot: graphSnapshot,
        viewConfig: graphViewConfig
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      knownTags: ["infra"],
      graphMostReferencedPercent: 10,
      graphMagneticEnabled: true
    }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify({
      version: 2,
      activeTabId: graphTab.id,
      tabs: [graphTab]
    }));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(3);
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Group most referenced" }).click();
  await expect(page.locator("#app-notification-modal")).toBeVisible();
  await page.locator("#app-notification-modal .rename-modal-input").fill("infra");
  await page.locator('#app-notification-actions [data-notification-button-id="create"]').click();

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const payload = JSON.parse(localStorage.getItem("markdownViewerTabs") || "{}");
    const graphDescriptor = payload.tabs?.find((tab) => tab.id === "snapshot_only_most_referenced_graph_e2e");
    const graphDocument = graphDescriptor?.draftDocument;
    const viewConfig = graphDescriptor?.viewState?.graphViewConfig || graphDocument?.viewConfig || {};
    return {
      groups: (viewConfig.groups || []).map((group) => ({
        query: group.query,
        enabled: group.enabled,
        hidden: group.hidden
      }))
    };
  })).toEqual({
    groups: [{ query: "tag:infra", enabled: true, hidden: true }]
  });
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
});

test("graph quick action groups all ungrouped files", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));

    const files = new Map([
      ["C:/vault/grouped.md", "---\ntags: [infra]\n---\n# Grouped"],
      ["C:/vault/rest-a.md", "# Rest A"],
      ["C:/vault/rest-b.md", "# Rest B"]
    ]);

    window.Neutralino = {
      filesystem: {
        readFile: async (path) => files.get(path) || "",
        writeFile: async (path, content) => {
          await new Promise((resolve) => setTimeout(resolve, 40));
          files.set(path, content);
          window.__writes.push({ path, content });
        }
      },
      clipboard: { writeText: async () => {} },
      os: { open: async () => {}, execCommand: async () => {} }
    };

    const nodes = [
      { id: "grouped.md", label: "grouped.md", fullPath: "C:/vault/grouped.md", type: "file", status: "current", tags: ["infra"] },
      { id: "rest-a.md", label: "rest-a.md", fullPath: "C:/vault/rest-a.md", type: "file", status: "current", tags: [] },
      { id: "rest-b.md", label: "rest-b.md", fullPath: "C:/vault/rest-b.md", type: "file", status: "current", tags: [] }
    ];
    const snapshotFiles = nodes.map((node) => ({
      id: node.id,
      path: node.id,
      name: node.id,
      fullPath: node.fullPath,
      content: files.get(node.fullPath),
      status: "current",
      tags: node.tags
    }));

    const graphTab = {
      id: "ungrouped_graph_e2e",
      title: "Ungrouped Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Ungrouped Graph E2E",
      graphScopeKey: "root-folder:c:/vault",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [{ id: "group-infra", query: "tag:infra", color: "#336699", enabled: true, hidden: false }],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Ungrouped Graph E2E",
        createdAt: Date.now(),
        nodes,
        links: [{ source: "rest-a.md", target: "rest-b.md", type: "link", status: "current" }],
        files: snapshotFiles
      }
    };

    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["infra"], graphMagneticEnabled: true }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-node-file")).toHaveCount(3);
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Group all UnGrouped" }).click();
  await expect(page.locator("#app-notification-modal")).toBeVisible();
  await expect(page.locator("#app-notification-modal .rename-modal-input")).toHaveValue("the_rest");
  await page.locator('#app-notification-actions [data-notification-button-id="create"]').click();
  await expect(page.locator(".graph-quick-action-status")).toBeVisible();
  await expect(page.locator(".graph-quick-action-status")).toHaveText(/Finding ungrouped files|Grouping|Creating group|Refreshing graph/);

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__writes.map((write) => write.path).sort())).toEqual([
    "C:/vault/rest-a.md",
    "C:/vault/rest-b.md"
  ]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((tab) => tab.id === "ungrouped_graph_e2e");
    return {
      tagged: graphTab.graphSnapshot.files
        .filter((file) => (file.tags || []).includes("the_rest"))
        .map((file) => file.id)
        .sort(),
      groupedStillInfra: graphTab.graphSnapshot.files.find((file) => file.fullPath === "C:/vault/grouped.md" || file.name === "grouped.md")?.tags || [],
      groups: graphTab.graphViewConfig.groups.map((group) => ({
        query: group.query,
        enabled: group.enabled,
        hidden: group.hidden,
        hasColor: /^#[0-9a-f]{6}$/i.test(group.color || "")
      }))
    };
  })).toEqual({
    tagged: ["rest-a", "rest-b"],
    groupedStillInfra: ["infra"],
    groups: [
      { query: "tag:infra", enabled: true, hidden: false, hasColor: true },
      { query: "tag:the_rest", enabled: true, hidden: false, hasColor: true }
    ]
  });
  await expect(page.locator(".graph-quick-action-status")).toBeHidden();
});

test("graph quick action blocks most referenced grouping in saved graph mode", async ({ page }) => {
  await page.addInitScript(() => {
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const graphTab = {
      id: "saved_most_referenced_graph_e2e",
      title: "Saved Most Referenced Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Saved Most Referenced Graph E2E",
      keepSavedGraphMode: true,
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
        textFadeThreshold: 0.35,
        nodeSize: 0.8,
        linkThickness: 1,
        centerForce: 1,
        repelForce: 650,
        linkForce: 0.4,
        linkDistance: 170,
        groupForce: 0.18
      },
      graphSnapshot: {
        version: 1,
        folderName: "Saved Most Referenced Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", type: "file", status: "current", tags: [] }
        ],
        links: [{ source: "beta.md", target: "alpha.md", type: "link", status: "current" }],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Group most referenced" }).click();

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual(["Saved graph mode does not update saved tags or links."]);
  await expect.poll(() => page.evaluate(() => {
    const graphTab = JSON.parse(localStorage.getItem("markdownViewerTabs")).find((tab) => tab.id === "saved_most_referenced_graph_e2e");
    return {
      groups: graphTab.graphViewConfig.groups,
      tags: graphTab.graphSnapshot.files.map((file) => file.tags || [])
    };
  })).toEqual({ groups: [], tags: [[], []] });
});

test("graph quick action removes visible leaf nodes generation by generation", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_leaf_e2e",
      title: "Leaf Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Leaf Graph",
      graphViewConfig: {
        showTags: false,
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
        folderName: "Leaf Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "root.md", label: "root.md", type: "file", status: "current" },
          { id: "mid.md", label: "mid.md", type: "file", status: "current" },
          { id: "leaf.md", label: "leaf.md", type: "file", status: "current" }
        ],
        links: [
          { source: "root.md", target: "mid.md", type: "link", status: "current" },
          { source: "mid.md", target: "leaf.md", type: "link", status: "current" }
        ],
        files: [
          { id: "root.md", path: "root.md", name: "root.md", content: "[[mid]]", status: "current" },
          { id: "mid.md", path: "mid.md", name: "mid.md", content: "[[leaf]]", status: "current" },
          { id: "leaf.md", path: "leaf.md", name: "leaf.md", content: "# Leaf", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(3);

  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Remove Leaf Nodes" }).click();
  await expect(page.locator(".graph-node-file")).toHaveCount(2);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs"))[0].graphViewConfig.hiddenNodeIds.sort()))
    .toEqual(["leaf.md"]);

  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Remove Leaf Nodes" }).click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerTabs"))[0].graphViewConfig.hiddenNodeIds.sort()))
    .toEqual(["leaf.md", "mid.md"]);
});

test("graph context menu removes collapsed clusters with their child points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_cluster_remove_e2e",
      title: "Cluster Remove Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Cluster Remove Graph",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        collapsedClusters: [
          {
            id: "cluster_root",
            label: "root.md",
            mode: "direct-outgoing",
            seedNodeId: "root.md",
            memberNodeIds: ["root.md", "alpha.md", "beta.md"],
            createdAt: Date.now()
          }
        ],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
        showLabels: true,
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
        folderName: "Cluster Remove Graph",
        createdAt: Date.now(),
        nodes: [
          { id: "root.md", label: "root.md", type: "file", status: "current" },
          { id: "alpha.md", label: "alpha.md", type: "file", status: "current" },
          { id: "beta.md", label: "beta.md", type: "file", status: "current" },
          { id: "outside.md", label: "outside.md", type: "file", status: "current" }
        ],
        links: [
          { source: "root.md", target: "alpha.md", type: "link", status: "current" },
          { source: "root.md", target: "beta.md", type: "link", status: "current" },
          { source: "outside.md", target: "root.md", type: "link", status: "current" }
        ],
        files: [
          { id: "root.md", path: "root.md", name: "root.md", content: "[[alpha]]\n[[beta]]", status: "current" },
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current" },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current" },
          { id: "outside.md", path: "outside.md", name: "outside.md", content: "[[root]]", status: "current" }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-cluster")).toHaveCount(1);
  await expect(page.locator(".graph-node-file")).toHaveCount(1);

  await page.locator(".graph-node-cluster").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await page.locator(".graph-context-menu-item", { hasText: "Remove this point" }).click();

  await expect(page.locator(".graph-node-cluster")).toHaveCount(0);
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => {
    const config = JSON.parse(localStorage.getItem("markdownViewerTabs"))[0].graphViewConfig;
    return {
      hiddenNodeIds: config.hiddenNodeIds.sort(),
      collapsedClusters: config.collapsedClusters
    };
  })).toEqual({
    hiddenNodeIds: ["alpha.md", "beta.md", "root.md"],
    collapsedClusters: []
  });
});
