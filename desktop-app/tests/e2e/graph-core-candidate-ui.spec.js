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
test("saved graph remains interactive and filters only graph snapshot tags", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.addInitScript(() => {
    const graphTab = {
      id: "graph_e2e",
      title: "Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Graph E2E",
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
        folderName: "Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/vault/alpha.md", type: "file", status: "current", tags: ["defined"] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/vault/beta.md", type: "file", status: "current", tags: [] },
          { id: "delta.md", label: "delta.md", fullPath: "C:/vault/delta.md", type: "file", status: "current", tags: [] },
          { id: "epsilon.md", label: "epsilon.md", fullPath: "C:/vault/epsilon.md", type: "file", status: "current", tags: [] },
          { id: "gamma.md", label: "gamma.md", fullPath: "C:/vault/gamma.md", type: "file", status: "current", tags: [] },
          { id: "tag:defined", label: "#defined", type: "tag", status: "current", tag: "defined" }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "beta.md", target: "delta.md", type: "link", status: "current" },
          { source: "gamma.md", target: "alpha.md", type: "link", status: "current" },
          { source: "epsilon.md", target: "gamma.md", type: "link", status: "current" },
          { source: "alpha.md", target: "tag:defined", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "---\ntags: [defined]\n---\n# Alpha\n\n[[beta]]", fullPath: "C:/vault/alpha.md", status: "current", tags: ["defined"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "---\nsource_file: C:\\src\\Beta.java\n---\n# Beta\n\n[[delta]]", fullPath: "C:/vault/beta.md", status: "current", tags: [] },
          { id: "delta.md", path: "delta.md", name: "delta.md", content: "---\nsource_file: C:\\src\\nested\\Delta.java\n---\n# Delta", fullPath: "C:/vault/delta.md", status: "current", tags: [] },
          { id: "epsilon.md", path: "epsilon.md", name: "epsilon.md", content: "---\nsource_file: C:\\src\\Epsilon.java\n---\n# Epsilon\n\n[[gamma]]", fullPath: "C:/vault/epsilon.md", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "---\nsource_file: C:\\src\\Gamma.java\n---\n# Gamma\n\n[[alpha]]", fullPath: "C:/vault/gamma.md", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ knownTags: ["ghost", "archive"], graphMagneticEnabled: true, contextMenuTooltipDelayMs: 0 }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");

  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(6);

  const tagOptions = await page.locator("#graph-selected-tag-filter option").allTextContents();
  expect(tagOptions).toEqual(["All files", "#defined"]);
  await expect(page.locator("#tag-management-list .tag-management-list-item")).toHaveText(["#defined1"]);

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });

  const graphMenu = page.locator(".graph-tab-render .graph-context-menu:not(.hidden)");
  await expect(graphMenu).toBeVisible();
  await expect(graphMenu).toContainText("Open in a new tab");
  await expect(graphMenu.getByRole("button", { name: "Turn magnetic forces off" })).toBeHidden();
  await expect(graphMenu.getByRole("button", { name: "Open all" })).toBeHidden();
  await expect(graphMenu.getByRole("button", { name: "Remove Leaf Nodes" })).toHaveCount(0);
  await expect(graphMenu.getByRole("button", { name: "Center Graph" })).toBeHidden();
  await expect(graphMenu.locator(".tags-context-menu-item")).toHaveText(["#defined"]);
  await expect(graphMenu.evaluate((menu) => Array.from(menu.children).map((child) => child.textContent.trim()))).resolves.not.toContain("Share");
  await graphMenu.locator(".graph-context-menu-submenu", { hasText: "Export" }).evaluate((submenu) => submenu.querySelector("button")?.focus());
  await expect(graphMenu.locator(".graph-context-menu-submenu", { hasText: "Export" }).locator(".graph-context-menu-submenu-panel .graph-context-menu-item")).toHaveText([
    "Share",
    "Export as Markdown",
    "Export as HTML",
    "Export as PDF",
    "Export original node"
  ]);
  await expect.poll(() => graphMenu.evaluate(async (menu) => {
    const getMenuButton = (label) => Array.from(menu.querySelectorAll(".graph-context-menu-item"))
      .find((button) => button.querySelector(".graph-context-menu-item-label")?.textContent?.trim() === label);
    const openInNewTabItem = getMenuButton("Open in a new tab");
    const renameItem = getMenuButton("Rename");
    const copyItem = getMenuButton("Copy");
    openInNewTabItem.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const openVisibleAfterEnter = openInNewTabItem.classList.contains("tooltip-visible");
    renameItem.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const openHiddenAfterRenameEnter = !openInNewTabItem.classList.contains("tooltip-visible");
    const renameVisibleAfterEnter = renameItem.classList.contains("tooltip-visible");
    copyItem.dispatchEvent(new PointerEvent("pointerover", { bubbles: true }));
    await new Promise((resolve) => setTimeout(resolve, 0));
    const renameHiddenAfterSubmenuEnter = !renameItem.classList.contains("tooltip-visible");
    const copySubmenuHasNoTooltip = !copyItem.classList.contains("graph-context-menu-tooltip")
      && !copyItem.classList.contains("tooltip-visible")
      && !copyItem.dataset.tooltip;
    return {
      openVisibleAfterEnter,
      openHiddenAfterRenameEnter,
      renameVisibleAfterEnter,
      renameHiddenAfterSubmenuEnter,
      copySubmenuHasNoTooltip
    };
  })).toEqual({
    openVisibleAfterEnter: true,
    openHiddenAfterRenameEnter: true,
    renameVisibleAfterEnter: true,
    renameHiddenAfterSubmenuEnter: true,
    copySubmenuHasNoTooltip: true
  });

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  const mapMenu = page.locator(".graph-tab-render .graph-context-menu:not(.hidden)");
  await expect(mapMenu).toContainText("Turn magnetic forces off");
  await expect(mapMenu).not.toContainText("Remove Leaf Nodes");
  await expect(mapMenu.getByRole("button", { name: "Center Graph" })).toBeVisible();
  await expect(mapMenu.getByRole("button", { name: "Open in a new tab" })).toBeHidden();

  await mapMenu.getByText("Turn magnetic forces off").click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState")).graphMagneticEnabled)).toBe(false);

  await page.locator(".graph-tab-render").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  await expect(page.locator(".graph-tab-render .graph-context-menu:not(.hidden)")).toContainText("Turn magnetic forces on");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await expect.poll(() => page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).locator(".graph-context-menu-submenu-panel").evaluate((panel) => {
    return Array.from(panel.children).map((child) => {
      if (child.classList.contains("graph-context-menu-separator")) return "separator";
      return child.textContent.trim();
    });
  })).toEqual([
    "Copy path",
    "Copy content",
    "Copy frontmatter",
    "Copy tags",
    "separator",
    "Copy dependencies",
    "Copy full dependencies",
    "Copy backlinks",
    "Copy full network"
  ]);
  await page.locator(".graph-context-menu-item", { hasText: "Copy path" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("C:/vault/alpha.md");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy content" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toContain("# Alpha");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy frontmatter" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe("---\ntags: [defined]\n---");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy tags" }).dispatchEvent("click");
  await expect.poll(async () => page.evaluate(() => navigator.clipboard.readText())).toBe("defined");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy full dependencies" }).dispatchEvent("click");
  const copyOptionsModal = page.locator("#graph-copy-options-modal");
  await expect(copyOptionsModal).toBeVisible();
  await expect(page.locator("#graph-copy-option-file-name")).toBeChecked();
  await expect(page.locator("#graph-copy-option-extension")).toBeChecked();
  await expect(page.locator("#graph-copy-option-full-path")).toBeChecked();
  await expect(page.locator("#graph-copy-option-source-file")).not.toBeChecked();
  await page.locator("#graph-copy-option-file-name").uncheck();
  await page.locator("#graph-copy-option-extension").uncheck();
  await page.locator("#graph-copy-option-full-path").uncheck();
  await expect(page.locator("#graph-copy-options-ok")).toBeDisabled();
  await page.locator("#graph-copy-option-file-name").check();
  await page.locator("#graph-copy-option-extension").check();
  await page.locator("#graph-copy-option-full-path").check();
  await page.locator("#graph-copy-options-ok").click();
  await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe("C:/vault/alpha.md\nC:/vault/beta.md\nC:/vault/delta.md");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Copy" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Copy full network" }).dispatchEvent("click");
  await expect(copyOptionsModal).toBeVisible();
  await page.locator("#graph-copy-option-full-path").uncheck();
  await page.locator("#graph-copy-option-source-file").check();
  await page.locator("#graph-copy-options-ok").click();
  await expect.poll(async () => page.evaluate(async () => (await navigator.clipboard.readText()).replace(/\r\n/g, "\n"))).toBe("alpha.md\nGamma.java\nEpsilon.java\nBeta.java\nDelta.java");

  await page.locator(".graph-node").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Show graph" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Show full network" }).dispatchEvent("click");
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Full Network: alpha.md");
  const activeGraph = page.locator(".graph-tab-render:not(.hidden)");
  await expect(activeGraph.locator(".graph-node-file")).toHaveCount(5);
  await expect(activeGraph.locator(".graph-node-tag")).toHaveCount(0);
});

test("local graph warning uses the focused graph node count", async ({ page }) => {
  await page.addInitScript(() => {
    window.__graphConfirmMessages = [];
    window.confirm = (message) => {
      window.__graphConfirmMessages.push(String(message));
      return false;
    };

    const nodes = Array.from({ length: 12 }, (_, index) => {
      const number = index + 1;
      return {
        id: `node-${number}.md`,
        label: `node-${number}.md`,
        type: "file",
        status: "current",
        fullPath: `C:/vault/node-${number}.md`
      };
    });
    const links = [
      { source: "node-1.md", target: "node-2.md", type: "link", status: "current" },
      { source: "node-1.md", target: "node-3.md", type: "link", status: "current" },
      { source: "node-4.md", target: "node-5.md", type: "link", status: "current" },
      { source: "node-6.md", target: "node-7.md", type: "link", status: "current" }
    ];
    const graphTab = {
      id: "local_warning_graph_e2e",
      title: "Large Source Graph",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Large Source Graph",
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
        folderName: "Large Source Graph",
        createdAt: Date.now(),
        nodes,
        links,
        files: nodes.map((node) => ({
          id: node.id,
          path: node.id,
          name: node.id,
          content: `# ${node.label}`,
          fullPath: node.fullPath,
          status: "current",
          tags: []
        }))
      }
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      graphRenderWarningThreshold: 5,
      confirmOpenManyGraphNodes: true,
      contextMenuTooltipDelayMs: 0
    }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await expect(page.locator(".graph-node-file")).toHaveCount(12);

  const seedNode = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "node-1.md" }) }).first();
  await seedNode.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-context-menu-submenu", { hasText: "Show graph" }).hover();
  await page.locator(".graph-context-menu-item", { hasText: "Show local graph" }).dispatchEvent("click");

  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Local Graph: node-1.md");
  await expect(page.locator(".graph-tab-render:not(.hidden)").locator(".graph-node-file")).toHaveCount(3);
  await expect.poll(() => page.evaluate(() => window.__graphConfirmMessages)).toEqual([]);
});

test("graph node context menu adds point scopes to other graph tabs", async ({ page }) => {
  await page.addInitScript(() => {
    const baseConfig = {
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
      linkThickness: 1,
      centerForce: 1,
      repelForce: 650,
      linkForce: 0.4,
      linkDistance: 170
    };
    const sourceNodes = [
      { id: "alpha.md", label: "alpha.md", fullPath: "C:/source/alpha.md", type: "file", status: "current", tags: [] },
      { id: "beta.md", label: "beta.md", fullPath: "C:/source/beta.md", type: "file", status: "current", tags: [] },
      { id: "gamma.md", label: "gamma.md", fullPath: "C:/source/gamma.md", type: "file", status: "current", tags: [] },
      { id: "delta.md", label: "delta.md", fullPath: "C:/source/delta.md", type: "file", status: "current", tags: [] },
      { id: "epsilon.md", label: "epsilon.md", fullPath: "C:/source/epsilon.md", type: "file", status: "current", tags: [] }
    ];
    const sourceLinks = [
      { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
      { source: "alpha.md", target: "gamma.md", type: "link", status: "current" },
      { source: "beta.md", target: "delta.md", type: "link", status: "current" },
      { source: "epsilon.md", target: "alpha.md", type: "link", status: "current" }
    ];
    const sourceFiles = sourceNodes.map((node) => ({
      id: node.id,
      path: node.id,
      name: node.id,
      content: `# ${node.label}`,
      fullPath: node.fullPath,
      status: "current",
      tags: []
    }));
    const createTargetTab = (id, title, nodes = [], links = [], extraConfig = {}) => ({
      id,
      title,
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: title,
      graphViewConfig: { ...baseConfig, ...extraConfig },
      graphSnapshot: {
        version: 1,
        folderName: title,
        createdAt: Date.now(),
        nodes,
        links,
        files: nodes.map((node) => ({
          id: node.id,
          path: node.id,
          name: node.id,
          content: `# ${node.label}`,
          fullPath: node.fullPath,
          status: "current",
          tags: []
        }))
      }
    });
    const sourceTab = createTargetTab("add_scope_source", "Source Graph", sourceNodes, sourceLinks);
    const pointTarget = createTargetTab("add_scope_point", "Point Target", [
      { id: "beta.md", label: "beta.md", fullPath: "C:/source/beta.md", type: "file", status: "current", tags: [] }
    ]);
    const localTarget = createTargetTab("add_scope_local", "Focused Target", [
      { id: "seed.md", label: "seed.md", fullPath: "C:/target/seed.md", type: "file", status: "current", tags: [] },
      ...sourceNodes
    ], sourceLinks, { mode: "local", focusNodeId: "seed.md" });
    const fullLocalTarget = createTargetTab("add_scope_full_local", "Full Local Target");
    const fullNetworkTarget = createTargetTab("add_scope_full_network", "Full Network Target");
    sourceTab.graphSnapshot.files = sourceFiles;
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ contextMenuTooltipDelayMs: 0 }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([sourceTab, pointTarget, localTarget, fullLocalTarget, fullNetworkTarget]));
    localStorage.setItem("markdownViewerActiveTab", sourceTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  const addAlphaScopeToTarget = async (targetText, actionText) => {
    await page.locator("#tab-list .tab-item", { hasText: "Source Graph" }).click();
    const alphaNode = page.locator(".graph-node-file").filter({ has: page.locator("title", { hasText: "alpha.md" }) }).first();
    await alphaNode.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 220,
      clientY: 220
    });
    const addSubmenu = page.locator(".graph-tab-render:not(.hidden) .graph-context-menu-submenu", { hasText: "Add to Tab" });
    await addSubmenu.hover();
    await addSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: actionText }).evaluate((button) => button.click());
    const chooser = page.locator(".graph-add-to-tab-modal");
    await expect(chooser).toBeVisible();
    const targetRow = chooser.locator(".graph-add-to-tab-row", { hasText: targetText });
    await expect(targetRow).toHaveAttribute("title", targetText);
    await targetRow.click();
    await chooser.locator(".reset-modal-confirm", { hasText: "OK" }).click();
    await expect(page.locator("#tab-list .tab-item.active")).toContainText(targetText);
  };

  await addAlphaScopeToTarget("Point Target", "Add point to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_point");
    return {
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort(),
      links: target.graphSnapshot.links.map((link) => `${link.source}->${link.target}`).sort()
    };
  })).toEqual({
    nodes: ["alpha.md", "beta.md"],
    links: ["alpha.md->beta.md"]
  });

  await addAlphaScopeToTarget("Focused Target", "Add local graph to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_local");
    return {
      mode: target.graphViewConfig.mode,
      allowedNodeIds: target.graphViewConfig.allowedNodeIds.slice().sort(),
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort()
    };
  })).toEqual({
    mode: "custom",
    allowedNodeIds: ["alpha.md", "beta.md", "gamma.md", "seed.md"],
    nodes: ["alpha.md", "beta.md", "delta.md", "epsilon.md", "gamma.md", "seed.md"]
  });

  await addAlphaScopeToTarget("Full Local Target", "Add full local graph to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_full_local");
    return target.graphSnapshot.nodes.map((node) => node.id).sort();
  })).toEqual(["alpha.md", "beta.md", "delta.md", "gamma.md"]);

  await addAlphaScopeToTarget("Full Network Target", "Add full network to Tab ...");
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "add_scope_full_network");
    return {
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort(),
      links: target.graphSnapshot.links.map((link) => `${link.source}->${link.target}`).sort()
    };
  })).toEqual({
    nodes: ["alpha.md", "beta.md", "delta.md", "epsilon.md", "gamma.md"],
    links: ["alpha.md->beta.md", "alpha.md->gamma.md", "beta.md->delta.md", "epsilon.md->alpha.md"]
  });
});

test("graph add to tab explains and remembers conflicting point choices", async ({ page }) => {
  await page.addInitScript(() => {
    const graphViewConfig = {
      showTags: false,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      collapsedClusters: [],
      searchQuery: "",
      showArrows: true,
      showOrphans: true,
      showLabels: true
    };
    const sourceTab = {
      id: "conflict_source",
      title: "Conflict Source",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Conflict Source",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Conflict Source",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/source/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/source/beta.md", type: "file", status: "current", tags: [] }
        ],
        links: [{ source: "alpha.md", target: "beta.md", type: "link", status: "current" }],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Source Alpha", fullPath: "C:/source/alpha.md", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Source Beta", fullPath: "C:/source/beta.md", status: "current", tags: [] }
        ]
      }
    };
    const targetTab = {
      id: "conflict_target",
      title: "Conflict Target",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Conflict Target",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Conflict Target",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "C:/target/alpha.md", type: "file", status: "current", tags: [] },
          { id: "beta.md", label: "beta.md", fullPath: "C:/target/beta.md", type: "file", status: "current", tags: [] }
        ],
        links: [],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Target Alpha", fullPath: "C:/target/alpha.md", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Target Beta", fullPath: "C:/target/beta.md", status: "current", tags: [] }
        ]
      }
    };
    const createGraphDescriptor = (tab) => ({
      schemaVersion: 2,
      id: tab.id,
      type: "graph",
      title: tab.title,
      createdAt: tab.createdAt,
      isTemporary: false,
      viewMode: "preview",
      scrollPos: 0,
      folderName: tab.folderName,
      graphViewKind: "graph",
      viewState: { graphViewConfig: tab.graphViewConfig },
      dirty: true,
      draftDocument: {
        schemaVersion: 1,
        documentType: "graph-view",
        folderName: tab.folderName,
        snapshot: tab.graphSnapshot,
        viewConfig: tab.graphViewConfig
      }
    });
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "last-tabs" }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify({
      version: 2,
      updatedAt: Date.now(),
      activeTabId: sourceTab.id,
      tabs: [createGraphDescriptor(sourceTab), createGraphDescriptor(targetTab)]
    }));
    localStorage.setItem("markdownViewerActiveTab", sourceTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();

  const openConflictImport = async () => {
    await page.locator("#tab-list .tab-item", { hasText: "Conflict Source" }).click();
    const alphaNode = page.locator(".graph-tab-render:not(.hidden) .graph-node-file").filter({ has: page.locator("title", { hasText: "alpha.md" }) }).first();
    await alphaNode.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 220,
      clientY: 220
    });
    const addSubmenu = page.locator(".graph-tab-render:not(.hidden) .graph-context-menu-submenu", { hasText: "Add to Tab" });
    await addSubmenu.hover();
    await addSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Add full local graph to Tab ..." }).evaluate((button) => button.click());
    const chooser = page.locator(".graph-add-to-tab-modal");
    await expect(chooser).toBeVisible();
    const targetRow = chooser.locator(".graph-add-to-tab-row", { hasText: "Conflict Target" });
    await expect(targetRow).toHaveAttribute("title", "Conflict Target");
    await targetRow.click();
    await chooser.locator(".reset-modal-confirm", { hasText: "OK" }).click();
    const confirmation = page.locator("#app-notification-modal");
    await expect(confirmation).toBeVisible();
    return confirmation;
  };

  let confirmation = await openConflictImport();
  await expect(confirmation.locator("#app-notification-title")).toHaveText("Point Already Exists");
  await expect(confirmation.locator("#app-notification-message")).toContainText("Keep Both adds the imported point");
  await expect(confirmation.locator("#app-notification-message")).toContainText("Use Existing connects the imported edges");
  await expect(confirmation.locator('[data-notification-button-id="confirm"]')).toHaveText("Keep Both");
  await expect(confirmation.locator('[data-notification-button-id="cancel"]')).toHaveText("Use Existing");
  await expect(confirmation.locator(".settings-switch-title")).toHaveText("Remember My Selection");
  await expect(confirmation.locator(".settings-switch-input")).not.toBeChecked();
  await confirmation.locator(".settings-switch-input").check();
  await confirmation.locator('[data-notification-button-id="cancel"]').click();

  await expect.poll(() => page.evaluate(() => {
    const target = window.markdownViewerApp.modules.graphPersistence.getActiveGraphTab();
    return {
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort(),
      links: target.graphSnapshot.links.map((link) => `${link.source}->${link.target}`).sort()
    };
  })).toEqual({
    nodes: ["alpha.md", "beta.md"],
    links: ["alpha.md->beta.md"]
  });
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Conflict Target");
  await page.locator(".graph-tab-render:not(.hidden)").evaluate((render) => {
    render.dataset.graphStateMarker = "preserved";
  });
  await page.locator("#tab-list .tab-item", { hasText: "Conflict Source" }).click();
  await page.locator("#tab-list .tab-item", { hasText: "Conflict Target" }).click();
  await expect(page.locator('.graph-tab-render:not(.hidden)[data-graph-state-marker="preserved"]')).toBeVisible();

  confirmation = await openConflictImport();
  await expect(confirmation.locator(".settings-switch-input")).not.toBeChecked();
  await confirmation.locator(".settings-switch-input").check();
  await confirmation.locator('[data-notification-button-id="confirm"]').click();

  await expect.poll(() => page.evaluate(() => {
    const target = window.markdownViewerApp.modules.graphPersistence.getActiveGraphTab();
    return {
      nodes: target.graphSnapshot.nodes.map((node) => node.id).sort(),
      links: target.graphSnapshot.links.map((link) => `${link.source}->${link.target}`).sort()
    };
  })).toEqual({
    nodes: ["alpha.md", "alpha.md@@conflict-source", "beta.md", "beta.md@@conflict-source"],
    links: ["alpha.md->beta.md", "alpha.md@@conflict-source->beta.md@@conflict-source"]
  });

  confirmation = await openConflictImport();
  await expect(confirmation.locator("#app-notification-message")).toContainText('point named "alpha"');
  await confirmation.locator('[data-notification-button-id="cancel"]').click();
  await expect(confirmation).toBeVisible();
  await expect(confirmation.locator("#app-notification-message")).toContainText('point named "beta"');
  await confirmation.locator('[data-notification-button-id="cancel"]').click();
  await expect.poll(() => page.evaluate(() => {
    const target = window.markdownViewerApp.modules.graphPersistence.getActiveGraphTab();
    return {
      nodeCount: target.graphSnapshot.nodes.length,
      linkCount: target.graphSnapshot.links.length
    };
  })).toEqual({ nodeCount: 4, linkCount: 2 });
});

test("graph add to tab skips same source relative path conflicts", async ({ page }) => {
  await page.addInitScript(() => {
    window.__graphConfirmMessages = [];
    window.confirm = (message) => {
      window.__graphConfirmMessages.push(String(message));
      return true;
    };
    const graphViewConfig = {
      showTags: false,
      hiddenTagIds: [],
      hiddenNodeIds: [],
      selectedTagIds: [],
      groups: [],
      collapsedClusters: [],
      searchQuery: "",
      showArrows: true,
      showOrphans: true,
      showLabels: true
    };
    const sourceTab = {
      id: "same_source_import",
      title: "Same Source Import",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Same Source Import",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Same Source Import",
        createdAt: Date.now(),
        nodes: [{ id: "docs/alpha.md", label: "alpha.md", fullPath: "C:/vault/docs/alpha.md", type: "file", status: "current", tags: [] }],
        links: [],
        files: [{ id: "docs/alpha.md", path: "docs/alpha.md", name: "alpha.md", content: "# Source Alpha", fullPath: "C:/vault/docs/alpha.md", status: "current", tags: [] }]
      }
    };
    const targetTab = {
      id: "same_source_target",
      title: "Same Source Target",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Same Source Target",
      graphViewConfig,
      graphSnapshot: {
        version: 1,
        folderName: "Same Source Target",
        createdAt: Date.now(),
        nodes: [{ id: "docs/alpha.md", label: "alpha.md", fullPath: "C:/vault/docs/alpha.md", type: "file", status: "current", tags: ["existing"] }],
        links: [],
        files: [{ id: "docs/alpha.md", path: "docs/alpha.md", name: "alpha.md", content: "# Target Alpha", fullPath: "C:/vault/docs/alpha.md", status: "current", tags: ["existing"] }]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([sourceTab, targetTab]));
    localStorage.setItem("markdownViewerActiveTab", sourceTab.id);
  });

  await page.goto("/");
  await expect(page.locator(".graph-tab-render")).toBeVisible();
  await page.locator(".graph-node-file").first().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  const addSubmenu = page.locator(".graph-tab-render:not(.hidden) .graph-context-menu-submenu", { hasText: "Add to Tab" });
  await addSubmenu.hover();
  await addSubmenu.locator(".graph-context-menu-submenu-panel .graph-context-menu-item", { hasText: "Add point to Tab ..." }).evaluate((button) => button.click());
  const chooser = page.locator(".graph-add-to-tab-modal");
  await expect(chooser).toBeVisible();
  await chooser.locator(".graph-add-to-tab-row", { hasText: "Same Source Target" }).click();
  await chooser.locator(".reset-modal-confirm", { hasText: "OK" }).click();

  await expect.poll(() => page.evaluate(() => window.__graphConfirmMessages)).toEqual([]);
  await expect.poll(() => page.evaluate(() => {
    const target = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").find((tab) => tab.id === "same_source_target");
    return target.graphSnapshot.nodes.map((node) => node.id);
  })).toEqual(["docs/alpha.md"]);
});

test("center graph action restores nodes when saved pan is off screen", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "center_graph_e2e",
      title: "Center Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Center Graph E2E",
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
      graphLayout: {
        magneticEnabled: false,
        zoom: { x: -10000, y: -10000, k: 1 },
        nodes: {
          "alpha.md": { x: 120, y: 140 },
          "beta.md": { x: 280, y: 140 },
          "gamma.md": { x: 200, y: 300 }
        }
      },
      graphSnapshot: {
        version: 1,
        folderName: "Center Graph E2E",
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
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", fullPath: "C:/vault/alpha.md", status: "current", tags: [] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", fullPath: "C:/vault/beta.md", status: "current", tags: [] },
          { id: "gamma.md", path: "gamma.md", name: "gamma.md", content: "# Gamma", fullPath: "C:/vault/gamma.md", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });

  await page.goto("/");
  const graphRender = page.locator(".graph-tab-render");
  await expect(graphRender).toBeVisible();

  await graphRender.dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 260,
    clientY: 260
  });
  const mapMenu = page.locator(".graph-tab-render .graph-context-menu:not(.hidden)");
  await expect(mapMenu.getByRole("button", { name: "Center Graph" })).toBeVisible();
  await mapMenu.getByRole("button", { name: "Center Graph" }).click();

  await expect.poll(() => page.evaluate(() => {
    const render = document.querySelector(".graph-tab-render:not(.hidden)");
    if (!render) return false;
    const renderRect = render.getBoundingClientRect();
    const nodeRects = Array.from(render.querySelectorAll(".graph-node-file"))
      .map((node) => node.getBoundingClientRect());
    const nodesInView = nodeRects.filter((nodeRect) => (
      nodeRect.right >= renderRect.left
      && nodeRect.left <= renderRect.right
      && nodeRect.bottom >= renderRect.top
      && nodeRect.top <= renderRect.bottom
    )).length;
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    const zoom = tabs[0]?.graphLayout?.zoom;
    return nodeRects.length === 3
      && nodesInView >= 2
      && Number.isFinite(zoom?.x)
      && Number.isFinite(zoom?.y)
      && Math.abs(zoom.x + 10000) > 1000
      && Math.abs(zoom.y + 10000) > 1000;
  })).toBe(true);
});

test("graph context menu opens all visible file points", async ({ page }) => {
  await page.addInitScript(() => {
    const graphTab = {
      id: "open_all_graph_e2e",
      title: "Open All Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Open All Graph E2E",
      graphViewConfig: {
        showTags: true,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
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
        folderName: "Open All Graph E2E",
        createdAt: Date.now(),
        nodes: [
          { id: "alpha.md", label: "alpha.md", fullPath: "alpha.md", type: "file", status: "current", tags: ["doc"] },
          { id: "beta.md", label: "beta.md", fullPath: "beta.md", type: "file", status: "current", tags: [] },
          { id: "tag:doc", label: "#doc", type: "tag", status: "current", tag: "doc" }
        ],
        links: [
          { source: "alpha.md", target: "beta.md", type: "link", status: "current" },
          { source: "alpha.md", target: "tag:doc", type: "tag", status: "current" }
        ],
        files: [
          { id: "alpha.md", path: "alpha.md", name: "alpha.md", content: "# Alpha", status: "current", tags: ["doc"] },
          { id: "beta.md", path: "beta.md", name: "beta.md", content: "# Beta", status: "current", tags: [] }
        ]
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(3);

  await page.locator(".graph-tab-render").click({ button: "right", position: { x: 60, y: 60 } });
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open all" }).click();

  await expect.poll(() => page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    return tabs.map((tab) => ({ title: tab.title, type: tab.type || "file", content: tab.content }));
  })).toEqual([
    { title: "Open All Graph E2E", type: "graph", content: "" },
    { title: "alpha", type: "markdown", content: "# Alpha" },
    { title: "beta", type: "markdown", content: "# Beta" }
  ]);
});

test("graph open all asks before opening more than twenty visible file points", async ({ page }) => {
  await page.addInitScript(() => {
    window.__confirms = [];
    window.confirm = (message) => {
      window.__confirms.push(String(message));
      return false;
    };
    const nodes = [];
    const files = [];
    for (let index = 1; index <= 21; index += 1) {
      const id = `file-${index}.md`;
      nodes.push({ id, label: id, fullPath: id, type: "file", status: "current", tags: [] });
      files.push({ id, path: id, name: id, content: `# File ${index}`, status: "current", tags: [] });
    }
    const graphTab = {
      id: "open_all_warning_graph_e2e",
      title: "Open All Warning Graph E2E",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Open All Warning Graph E2E",
      graphViewConfig: {
        showTags: false,
        hiddenTagIds: [],
        hiddenNodeIds: [],
        selectedTagIds: [],
        groups: [],
        searchQuery: "",
        showArrows: true,
        showOrphans: true,
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
        folderName: "Open All Warning Graph E2E",
        createdAt: Date.now(),
        nodes,
        links: [],
        files
      }
    };
    localStorage.setItem("markdownViewerTabs", JSON.stringify([graphTab]));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
  });
  await page.goto("/");
  await expect(page.locator("#graph-view-canvas")).toBeVisible();
  await expect(page.locator(".graph-node")).toHaveCount(21);

  await page.locator(".graph-tab-render").click({ button: "right", position: { x: 60, y: 60 } });
  await page.locator(".graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open all" }).click();

  await expect.poll(() => page.evaluate(() => ({
    confirms: window.__confirms,
    tabCount: JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").length
  }))).toEqual({
    confirms: ["Open 21 files in editor tabs?\n\nThis might slow down your computer or crash the app."],
    tabCount: 1
  });
});

test("health report exports dependency groups to a selected desktop folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__folderDialogs = [];
    window.__folderSelections = ["C:/exports"];
    window.__readPaths = [];
    window.__writes = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      graphScopeKey: "root-folder:c:/vault",
      folderName: "Flink",
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
      snapshot: {
        version: 1,
        folderName: "Flink",
        createdAt: Date.now(),
        nodes: [
          {
            id: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java",
            label: "CommandLineOptions.java",
            fullPath: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md",
            type: "file",
            status: "current"
          },
          {
            id: "missing:org.apache.commons.cli.commandline",
            label: "CommandLine",
            type: "missing-dependency",
            status: "unresolved",
            qualifiedName: "org.apache.commons.cli.CommandLine",
            language: "java",
            missingKind: "class"
          }
        ],
        links: [
          {
            source: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java",
            target: "missing:org.apache.commons.cli.commandline",
            type: "missing-dependency",
            status: "unresolved"
          }
        ],
        files: [
          {
            id: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java",
            path: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md",
            name: "CommandLineOptions.java.md",
            fullPath: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md",
            status: "current",
            unresolvedDependencies: [
              {
                symbol: "org.apache.commons.cli.CommandLine",
                kind: "class",
                staticImport: false,
                wildcard: false,
                line: 42
              }
            ]
          }
        ]
      }
    };
    const graphTab = {
      id: "health_report_export_graph_e2e",
      title: "Flink",
      content: "",
      scrollPos: 0,
      viewMode: "preview",
      createdAt: Date.now(),
      isTemporary: false,
      type: "graph",
      folderName: "Flink",
      graphViewConfig: savedGraph.viewConfig,
      graphSnapshot: savedGraph.snapshot,
      graphDocument: savedGraph,
      graphScopeKey: savedGraph.graphScopeKey,
      sourceFileName: "flink.mdviewer-graph.json",
      sourceFilePath: "C:/vault/flink.mdviewer-graph.json",
      keepSavedGraphMode: true
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "last-tabs" }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify({
      version: 2,
      updatedAt: Date.now(),
      activeTabId: graphTab.id,
      tabs: [
        {
          schemaVersion: 2,
          id: graphTab.id,
          type: "graph",
          title: graphTab.title,
          createdAt: graphTab.createdAt,
          isTemporary: false,
          viewMode: "preview",
          scrollPos: 0,
          folderName: graphTab.folderName,
          graphViewKind: "graph",
          viewState: { graphViewConfig: graphTab.graphViewConfig },
          dirty: true,
          draftDocument: savedGraph
        }
      ]
    }));
    localStorage.setItem("markdownViewerActiveTab", graphTab.id);
    window.Neutralino = {
      os: {
        showFolderDialog: async (title, options) => {
          window.__folderDialogs.push({ title, options: options || null });
          return window.__folderSelections.shift() || "";
        },
        showOpenDialog: async () => "C:/vault/flink.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async () => [],
        getStats: async (path) => ({ type: "FILE", size: path.endsWith(".md") ? 18 : 0 }),
        readFile: async (path) => {
          window.__readPaths.push(path);
          if (path === "C:/vault/flink.mdviewer-graph.json") {
            return JSON.stringify(savedGraph);
          }
          if (path === "C:/vault/flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md") {
            return "# CommandLineOptions";
          }
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => window.__writes.push({ path, content: String(content) })
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs);
  await page.evaluate(() => {
    window.alert = (message) => window.__alerts.push(String(message));
    window.Neutralino.os.showFolderDialog = async (title, options) => {
      window.__folderDialogs.push({ title, options: options || null });
      return window.__folderSelections.shift() || "";
    };
    window.Neutralino.filesystem.writeFile = async (path, content) => {
      if (String(path).startsWith("C:/")) {
        window.__writes.push({ path, content: String(content) });
      }
    };
  });
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Show Health graph report" }).click();
  await expect(page.locator(".graph-health-report-render")).toHaveCount(1);

  await page.locator(".graph-health-save-button").click();
  await expect(page.locator(".graph-health-report-export-modal")).toBeVisible();
  await page.locator('[data-graph-health-report-format="csv"]').click();
  await expect.poll(() => page.evaluate(() => ({
    writes: window.__writes,
    folderDialog: window.__folderDialogs[0] || null,
    alerts: window.__alerts
  }))).toEqual({
    writes: [
      {
        path: "C:/exports/Flink-missing-dependency-groups.csv",
        content: expect.stringContaining("group,languages,missingSymbols,affectedFiles,references,symbols")
      }
    ],
    folderDialog: {
      title: "Select graph report destination folder",
      options: null
    },
    alerts: ["Graph report saved to:\nC:/exports/Flink-missing-dependency-groups.csv"]
  });

  await page.locator(".graph-health-save-button").click();
  await page.locator(".graph-health-report-export-cancel").click();
  await expect(page.locator(".graph-health-report-export-modal")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__folderDialogs.length)).toBe(1);

  await page.evaluate(() => {
    window.Neutralino.os.showFolderDialog = async (title, options) => {
      window.__folderDialogs.push({ title, options: options || null });
      return "";
    };
  });
  await page.locator(".graph-health-save-button").click();
  await page.locator('[data-graph-health-report-format="json"]').click();
  await expect.poll(() => page.evaluate(() => window.__folderDialogs.length)).toBe(2);
  await expect.poll(() => page.evaluate(() => window.__writes.length)).toBe(1);

  await page.evaluate(() => {
    window.Neutralino.os.showFolderDialog = async () => "C:/broken";
    window.Neutralino.filesystem.writeFile = async () => {
      throw new Error("disk full");
    };
  });
  await page.locator(".graph-health-save-button").click();
  await page.locator('[data-graph-health-report-format="markdown"]').click();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([
    "Graph report saved to:\nC:/exports/Flink-missing-dependency-groups.csv",
    "Failed to save graph report: disk full"
  ]);
  await expect(page.locator("#startup-crash-overlay")).toHaveCount(0);
});

test("health report opens relative markdown files from the active desktop folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__readPaths = [];
    window.alert = (message) => window.__alerts.push(String(message));
    const savedGraph = {
      schemaVersion: 1,
      documentType: "graph-view",
      graphScopeKey: "root-folder:c:/vault",
      folderName: "Flink",
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
      snapshot: {
        version: 1,
        folderName: "Flink",
        createdAt: Date.now(),
        nodes: [
          {
            id: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java",
            label: "CommandLineOptions.java",
            fullPath: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md",
            type: "file",
            status: "current"
          },
          {
            id: "missing:org.apache.commons.cli.commandline",
            label: "CommandLine",
            type: "missing-dependency",
            status: "unresolved",
            qualifiedName: "org.apache.commons.cli.CommandLine",
            language: "java",
            missingKind: "class"
          }
        ],
        links: [
          {
            source: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java",
            target: "missing:org.apache.commons.cli.commandline",
            type: "missing-dependency",
            status: "unresolved"
          }
        ],
        files: [
          {
            id: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java",
            path: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md",
            name: "CommandLineOptions.java.md",
            fullPath: "flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md",
            status: "current",
            unresolvedDependencies: [
              {
                symbol: "org.apache.commons.cli.CommandLine",
                kind: "class",
                staticImport: false,
                wildcard: false,
                line: 42
              }
            ]
          }
        ]
      }
    };
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showOpenDialog: async () => "C:/vault/flink.mdviewer-graph.json",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async () => [],
        getStats: async (path) => ({ type: "FILE", size: path.endsWith(".md") ? 18 : 0 }),
        readFile: async (path) => {
          window.__readPaths.push(path);
          if (path === "C:/vault/flink.mdviewer-graph.json") {
            return JSON.stringify(savedGraph);
          }
          if (path === "C:/vault/flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md") {
            return "# CommandLineOptions";
          }
          throw new Error("Unexpected read path: " + path);
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await page.goto("/");
  await expect(page.locator("#import-from-folder")).toBeVisible();

  await page.locator("#import-from-folder").click();
  await page.locator("#import-from-file").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await page.locator(".graph-quick-action-button").click();
  await page.locator(".graph-quick-action-menu-item", { hasText: "Show Health graph report" }).click();
  await expect(page.locator(".graph-health-report-render")).toHaveCount(1);
  await page.evaluate(() => {
    document.querySelector(".graph-health-expand-button")?.click();
    document.querySelector(".graph-health-open-file")?.click();
  });

  await expect.poll(() => page.evaluate(() => window.__readPaths)).toContain(
    "C:/vault/flink-clients/src/main/java/org/apache/flink/client/cli/CommandLineOptions.java.md"
  );
  await expect(page.locator("#tab-list .tab-item", { hasText: "CommandLineOptions.java" })).toHaveCount(1);
  await expect(page.locator("#startup-crash-overlay")).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
});
