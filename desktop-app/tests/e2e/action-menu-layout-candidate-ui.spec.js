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

async function selectEditorSettingsTab(page) {
  const editorTab = page.locator('.settings-tab-button[data-settings-tab="editor"]');
  if (!(await editorTab.isVisible())) {
    await page.locator('.settings-tab-group-toggle[data-settings-tab-group-toggle="editor"]').click();
  }
  await selectSettingsTab(page, "editor");
}

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});
test("desktop Tools sort dialog sorts current text editor tab lines", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await expect(page.locator("#markdown-editor")).toBeEditable();
  await page.evaluate(() => {
    const commands = window.markdownViewerApp.services.activeEditorCommands;
    commands.setActiveEditorValue("bravo\nalpha\nbravo");
    commands.dispatchActiveEditorInput();
  });

  await page.locator("#desktopActionMenu").click();
  const toolsSubmenu = page.locator(".tools-menu-submenu");
  await toolsSubmenu.locator("> .dropdown-toggle").hover();
  const sortButton = toolsSubmenu.locator("> .action-submenu > .open-editor-sort-dialog");
  await expect(sortButton).toBeEnabled();
  await sortButton.click();

  const sortModal = page.locator("#editor-sort-modal");
  await expect(sortModal).toBeVisible();
  await expect(sortModal.locator("legend")).toHaveText(["Sort Group 1", "Sort Group 2", "Sort Group 3"]);
  await sortModal.locator("#editor-sort-apply").click();
  await expect(sortModal).toBeHidden();
  await expect.poll(() => page.evaluate(() => (
    window.markdownViewerApp.services.activeEditorCommands.getActiveEditorValue()
  ))).toBe("alpha\nbravo");

  await page.evaluate(() => {
    window.markdownViewerApp.services.tabs.openFilePreviewInTab(
      { name: "diagram.png", path: "C:/vault/diagram.png" },
      "diagram.png",
      { temporary: false }
    );
  });
  await page.locator("#desktopActionMenu").click();
  await toolsSubmenu.locator("> .dropdown-toggle").hover();
  await expect(sortButton).toBeDisabled();
  await expect(sortButton).toHaveAttribute("aria-disabled", "true");
});

test("desktop action submenus stay inside the viewport in cramped windows", async ({ page }) => {
  await page.setViewportSize({ width: 900, height: 520 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await expect(page.locator("#desktopActionMenu")).toBeVisible();

  await page.locator("#desktopActionMenu").click();
  await page.locator(".view-menu-submenu > .dropdown-toggle").hover();
  await page.locator(".show-symbols-menu-submenu > .dropdown-toggle").hover();

  const symbolsMenu = page.locator(".show-symbols-menu-submenu > .action-submenu");
  await expect(symbolsMenu).toBeVisible();
  await expect.poll(() => symbolsMenu.evaluate((menu) => {
    const rect = menu.getBoundingClientRect();
    return {
      bottom: Math.round(rect.bottom),
      left: Math.round(rect.left),
      right: Math.round(rect.right),
      top: Math.round(rect.top),
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  })).toMatchObject({
    top: expect.any(Number),
    bottom: expect.any(Number),
    left: expect.any(Number),
    right: expect.any(Number)
  });
  const bounds = await symbolsMenu.evaluate((menu) => {
    const rect = menu.getBoundingClientRect();
    return {
      bottom: rect.bottom,
      left: rect.left,
      right: rect.right,
      top: rect.top,
      viewportHeight: window.innerHeight,
      viewportWidth: window.innerWidth
    };
  });
  expect(bounds.top).toBeGreaterThanOrEqual(0);
  expect(bounds.left).toBeGreaterThanOrEqual(0);
  expect(bounds.bottom).toBeLessThanOrEqual(bounds.viewportHeight);
  expect(bounds.right).toBeLessThanOrEqual(bounds.viewportWidth);
});

test("desktop action submenus align flush with their parent menu row", async ({ page }) => {
  await page.setViewportSize({ width: 1400, height: 900 });
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await expect(page.locator("#desktopActionMenu")).toBeVisible();

  await page.locator("#desktopActionMenu").click();
  await page.locator(".view-menu-submenu > .dropdown-toggle").hover();
  await page.locator(".show-symbols-menu-submenu > .dropdown-toggle").hover();

  const alignment = await page.evaluate(() => {
    const viewMenu = document.querySelector(".view-menu-submenu > .action-submenu");
    const showSymbolsButton = document.querySelector(".show-symbols-menu-submenu > .dropdown-toggle");
    const symbolsMenu = document.querySelector(".show-symbols-menu-submenu > .action-submenu");
    const viewRect = viewMenu.getBoundingClientRect();
    const buttonRect = showSymbolsButton.getBoundingClientRect();
    const symbolsRect = symbolsMenu.getBoundingClientRect();
    return {
      horizontalGap: symbolsRect.left - viewRect.right,
      verticalOffset: symbolsRect.top - buttonRect.top
    };
  });

  expect(Math.abs(alignment.horizontalGap)).toBeLessThanOrEqual(2);
  expect(Math.abs(alignment.verticalOffset)).toBeLessThanOrEqual(2);
});

test("settings menu updates graph auto-clustering threshold", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator("#desktopActionMenu")).toBeVisible();

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await expect(page.locator("#settings-modal")).toBeVisible();
  await expect(page.locator("#settings-search-input")).toBeFocused();
  await expect(page.locator(".settings-tab-button[data-settings-tab='interface']")).toHaveClass(/active/);
  await expect(page.locator(".settings-panel[data-settings-panel='interface']")).toBeVisible();
  await selectSettingsTab(page, "graph");
  await expect(page.locator(".settings-panel[data-settings-panel='graph']")).toBeVisible();
  await expect(page.locator("#settings-graph-auto-cluster-threshold")).toHaveValue("1000");
  await expect(page.locator("#settings-graph-render-warning-threshold")).toHaveValue("1500");
  await expect(page.locator("#settings-graph-most-referenced-percent")).toHaveValue("10");
  await expect(page.locator("#settings-graph-show-file-extensions")).not.toBeChecked();
  await expect(page.locator("#settings-graph-node-default-color")).toHaveValue("#58a6ff");
  await selectSettingsTab(page, "confirmations");
  await expect(page.locator("#settings-confirm-exit-application")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-open-many-graph-nodes")).toBeChecked();
  await expect(page.locator("#settings-confirm-delete-files")).toBeChecked();
  await expect(page.locator("#settings-confirm-delete-image-editor-layers")).toBeChecked();
  await expect(page.locator("#settings-confirm-move-files")).toBeChecked();
  await expect(page.locator("#settings-confirm-reset-state")).toBeChecked();
  await expect(page.locator("#settings-confirm-edited-prompt-attachment-removal")).not.toBeChecked();
  await selectSettingsTab(page, "interface");
  await expect(page.locator("#settings-context-menu-tooltip-delay")).toHaveValue("3000");
  await expect(page.locator("#settings-startup-behavior")).toHaveValue("last-tabs");
  await expect(page.locator("#settings-max-open-tabs")).toHaveValue("40");
  await expect(page.locator("#settings-max-open-tabs")).toHaveAttribute("min", "1");
  await expect(page.locator("#settings-max-open-tabs")).toHaveAttribute("max", "60");
  await expect(page.locator("#settings-max-recent-files")).toHaveValue("10");
  await expect(page.locator("#settings-max-recent-folders")).toHaveValue("10");
  await selectSettingsTab(page, "folder-view");
  await expect(page.locator("#settings-restore-last-folder-on-startup")).toBeChecked();
  await expect(page.locator("#settings-folder-tree-default-state")).toHaveCount(0);
  await expect(page.locator("#settings-folder-tree-lazy-threshold")).toHaveCount(0);
  await expect(page.locator("#settings-folder-tree-expand-limit-threshold")).toHaveValue("1000");
  await expect(page.locator("#settings-folder-tree-expand-limit-depth")).toHaveValue("5");
  await selectSettingsTab(page, "file-opening-modes");
  await expect(page.locator('[data-opening-mode-key="untitled"]')).toHaveValue("editor");
  await expect(page.locator('[data-opening-mode-key="extension:md"]')).toHaveValue("split");
  await selectEditorSettingsTab(page);
  await expect(page.locator("#settings-editor-font-family")).toHaveValue("mono");
  await expect(page.locator("#settings-editor-font-size")).toHaveValue("14");

  await selectSettingsTab(page, "graph");
  await page.locator("#settings-graph-auto-cluster-threshold").fill("1200");
  await page.locator("#settings-graph-render-warning-threshold").fill("1800");
  await page.locator("#settings-graph-most-referenced-percent").fill("25");
  await page.locator("#settings-graph-show-file-extensions").check();
  await page.locator("#settings-graph-node-default-color").fill("#ff66cc");
  await page.locator("#settings-graph-external-dependency-color").fill("#33cc88");
  await selectSettingsTab(page, "confirmations");
  await page.locator("#settings-confirm-exit-application").check();
  await page.locator("#settings-confirm-open-many-graph-nodes").uncheck();
  await page.locator("#settings-confirm-delete-files").uncheck();
  await page.locator("#settings-confirm-delete-image-editor-layers").uncheck();
  await page.locator("#settings-confirm-move-files").uncheck();
  await page.locator("#settings-confirm-reset-state").uncheck();
  await page.locator("#settings-confirm-edited-prompt-attachment-removal").check();
  await selectSettingsTab(page, "interface");
  await page.locator("#settings-max-open-tabs").fill("60");
  await page.locator("#settings-max-recent-files").fill("7");
  await page.locator("#settings-max-recent-folders").fill("5");
  await page.locator("#settings-context-menu-tooltip-delay").fill("900");
  await page.locator("#settings-startup-behavior").selectOption("untitled");
  await selectSettingsTab(page, "folder-view");
  await page.evaluate(() => {
    const input = document.getElementById("settings-restore-last-folder-on-startup");
    input.checked = false;
    input.dispatchEvent(new Event("input", { bubbles: true }));
    input.dispatchEvent(new Event("change", { bubbles: true }));
  });
  await page.locator("#settings-folder-tree-expand-limit-threshold").fill("4321");
  await page.locator("#settings-folder-tree-expand-limit-depth").fill("7");
  await selectSettingsTab(page, "file-opening-modes");
  await page.locator("#settings-file-opening-mode-set-all").selectOption("preview");
  await page.locator("#settings-file-opening-mode-apply-all").click();
  await selectEditorSettingsTab(page);
  await page.locator("#settings-editor-font-family").selectOption("serif");
  await page.locator("#settings-editor-font-size").fill("18");
  await selectSettingsTab(page, "debug");
  await page.locator("#settings-debug-enabled").check();
  await page.locator("#settings-debug-write-file").check();
  await page.locator("#settings-debug-level").selectOption("info");
  await page.locator("#settings-debug-log-path").fill("C:/temp/md-editor-debug.log");
  await page.locator("#settings-debug-max-log-size").fill("12");
  await page.locator("#settings-debug-max-log-files").fill("8");
  await page.locator("#settings-modal-save").click();
  await expect(page.locator("#settings-modal")).toBeHidden();
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    return {
      threshold: state.graphAutoClusterThreshold,
      renderWarningThreshold: state.graphRenderWarningThreshold,
      mostReferencedPercent: state.graphMostReferencedPercent,
      showFileExtensions: state.graphShowFileExtensions,
      nodeDefaultColor: state.graphNodeDefaultColor,
      externalDependencyColor: state.graphExternalDependencyColor,
      confirmExitApplication: state.confirmExitApplication,
      confirmOpenManyGraphNodes: state.confirmOpenManyGraphNodes,
      confirmDeleteFiles: state.confirmDeleteFiles,
      confirmDeleteImageEditorLayers: state.confirmDeleteImageEditorLayers,
      confirmMoveFiles: state.confirmMoveFiles,
      confirmResetState: state.confirmResetState,
      confirmEditedPromptAttachmentRemoval: state.confirmEditedPromptAttachmentRemoval,
      maxOpenTabs: state.maxOpenTabs,
      maxRecentFiles: state.maxRecentFiles,
      maxRecentFolders: state.maxRecentFolders,
      contextMenuTooltipDelayMs: state.contextMenuTooltipDelayMs,
      startupBehavior: state.startupBehavior,
      restoreLastFolderOnStartup: state.restoreLastFolderOnStartup,
      untitledOpenMode: state.fileOpeningModes?.modes?.untitled,
      markdownOpenMode: state.fileOpeningModes?.modes?.["extension:md"],
      hasFolderTreeDefaultExpanded: Object.prototype.hasOwnProperty.call(state, "folderTreeDefaultExpanded"),
      hasFolderTreeLazyThreshold: Object.prototype.hasOwnProperty.call(state, "folderTreeLazyThreshold"),
      folderTreeExpandLimitThreshold: state.folderTreeExpandLimitThreshold,
      folderTreeExpandLimitDepth: state.folderTreeExpandLimitDepth,
      editorFontFamily: state.editorFontFamily,
      editorFontSize: state.editorFontSize,
      debugEnabled: state.debugEnabled,
      debugWriteToFile: state.debugWriteToFile,
      debugLevel: state.debugLevel,
      debugLogPath: state.debugLogPath,
      debugMaxLogSizeMb: state.debugMaxLogSizeMb,
      debugMaxLogFiles: state.debugMaxLogFiles
    };
  })).toEqual({
    threshold: 1200,
    renderWarningThreshold: 1800,
    mostReferencedPercent: 25,
    showFileExtensions: true,
    nodeDefaultColor: "#ff66cc",
    externalDependencyColor: "#33cc88",
    confirmExitApplication: true,
    confirmOpenManyGraphNodes: false,
    confirmDeleteFiles: false,
    confirmDeleteImageEditorLayers: false,
    confirmMoveFiles: false,
    confirmResetState: false,
    confirmEditedPromptAttachmentRemoval: true,
    maxOpenTabs: 60,
    maxRecentFiles: 7,
    maxRecentFolders: 5,
    contextMenuTooltipDelayMs: 900,
    startupBehavior: "untitled",
    restoreLastFolderOnStartup: false,
    untitledOpenMode: "preview",
    markdownOpenMode: "preview",
    hasFolderTreeDefaultExpanded: false,
    hasFolderTreeLazyThreshold: false,
    folderTreeExpandLimitThreshold: 4321,
    folderTreeExpandLimitDepth: 7,
    editorFontFamily: "serif",
    editorFontSize: 18,
    debugEnabled: true,
    debugWriteToFile: true,
    debugLevel: "info",
    debugLogPath: "C:/temp/md-editor-debug.log",
    debugMaxLogSizeMb: 12,
    debugMaxLogFiles: 8
  });

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await expect(page.locator("#settings-graph-auto-cluster-threshold")).toHaveValue("1200");
  await expect(page.locator("#settings-graph-render-warning-threshold")).toHaveValue("1800");
  await expect(page.locator("#settings-graph-most-referenced-percent")).toHaveValue("25");
  await expect(page.locator("#settings-graph-show-file-extensions")).toBeChecked();
  await expect(page.locator("#settings-graph-node-default-color")).toHaveValue("#ff66cc");
  await expect(page.locator("#settings-graph-external-dependency-color")).toHaveValue("#33cc88");
  await selectSettingsTab(page, "confirmations");
  await expect(page.locator("#settings-confirm-exit-application")).toBeChecked();
  await expect(page.locator("#settings-confirm-open-many-graph-nodes")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-delete-files")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-delete-image-editor-layers")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-move-files")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-reset-state")).not.toBeChecked();
  await expect(page.locator("#settings-confirm-edited-prompt-attachment-removal")).toBeChecked();
  await selectSettingsTab(page, "folder-view");
  await expect(page.locator("#settings-folder-tree-lazy-threshold")).toHaveCount(0);
  await expect(page.locator("#settings-folder-tree-expand-limit-threshold")).toHaveValue("4321");
  await expect(page.locator("#settings-folder-tree-expand-limit-depth")).toHaveValue("7");
  await expect(page.locator("#settings-restore-last-folder-on-startup")).not.toBeChecked();
  await expect(page.locator("#settings-folder-tree-default-state")).toHaveCount(0);
  await selectSettingsTab(page, "interface");
  await expect(page.locator("#settings-context-menu-tooltip-delay")).toHaveValue("900");
  await expect(page.locator("#settings-startup-behavior")).toHaveValue("untitled");
  await expect(page.locator("#settings-max-open-tabs")).toHaveValue("60");
  await expect(page.locator("#settings-max-recent-files")).toHaveValue("7");
  await expect(page.locator("#settings-max-recent-folders")).toHaveValue("5");
  await selectSettingsTab(page, "file-opening-modes");
  await expect(page.locator('[data-opening-mode-key="untitled"]')).toHaveValue("preview");
  await expect(page.locator('[data-opening-mode-key="extension:md"]')).toHaveValue("preview");
  await selectEditorSettingsTab(page);
  await expect(page.locator("#settings-editor-font-family")).toHaveValue("serif");
  await expect(page.locator("#settings-editor-font-size")).toHaveValue("18");
  await expect.poll(() => page.evaluate(() => {
    const style = getComputedStyle(document.documentElement);
    return {
      fontFamily: style.getPropertyValue("--editor-font-family").trim(),
      fontSize: style.getPropertyValue("--editor-font-size").trim()
    };
  })).toEqual({ fontFamily: "Georgia, 'Times New Roman', serif", fontSize: "18px" });
  await selectSettingsTab(page, "debug");
  await expect(page.locator("#settings-debug-enabled")).toBeChecked();
  await expect(page.locator("#settings-debug-write-file")).toBeChecked();
  await expect(page.locator("#settings-debug-level")).toHaveValue("info");
  await expect(page.locator("#settings-debug-log-path")).toHaveValue("C:/temp/md-editor-debug.log");
  await expect(page.locator("#settings-debug-max-log-size")).toHaveValue("12");
  await expect(page.locator("#settings-debug-max-log-files")).toHaveValue("8");
});

test("settings menu limits remembered recent files and folders", async ({ page }) => {
  await page.addInitScript(() => {
    const now = Date.now();
    localStorage.setItem("markdownViewerRecentFiles", JSON.stringify([
      { name: "one.md", label: "one.md", path: "docs/one.md", updatedAt: now },
      { name: "two.md", label: "two.md", path: "docs/two.md", updatedAt: now - 1 },
      { name: "three.md", label: "three.md", path: "docs/three.md", updatedAt: now - 2 }
    ]));
    localStorage.setItem("markdownViewerRecentFolders", JSON.stringify([
      { name: "Vault One", label: "Vault One", path: "C:/vault-one", updatedAt: now },
      { name: "Vault Two", label: "Vault Two", path: "C:/vault-two", updatedAt: now - 1 },
      { name: "Vault Three", label: "Vault Three", path: "C:/vault-three", updatedAt: now - 2 }
    ]));
  });
  await openApp(page);
  await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(3);
  await expect(page.locator(".recent-folders-menu .recent-menu-item")).toHaveCount(3);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await selectSettingsTab(page, "interface");
  await page.locator("#settings-max-recent-files").fill("2");
  await page.locator("#settings-max-recent-folders").fill("1");
  await page.locator("#settings-modal-save").click();

  await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(2);
  await expect(page.locator(".recent-folders-menu .recent-menu-item")).toHaveCount(1);
  await expect.poll(() => page.evaluate(() => ({
    files: JSON.parse(localStorage.getItem("markdownViewerRecentFiles") || "[]").map((item) => item.name),
    folders: JSON.parse(localStorage.getItem("markdownViewerRecentFolders") || "[]").map((item) => item.name)
  }))).toEqual({
    files: ["one.md", "two.md"],
    folders: ["Vault One"]
  });
});

test("maximum open tabs setting controls new tabs without closing existing tabs", async ({ page }) => {
  await page.goto("/");
  await page.evaluate(() => {
    window.__alerts = [];
    window.alert = (message) => window.__alerts.push(String(message));
    for (let index = 1; index <= 41; index += 1) {
      window.markdownViewerApp.modules.tabs.newTab(`# Tab ${index}`, `Tab ${index}`);
    }
  });

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(40);
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([
    "Maximum of 40 tabs reached. Please close an existing tab to open a new one."
  ]);

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await selectSettingsTab(page, "interface");
  await page.locator("#settings-max-open-tabs").fill("20");
  await page.locator("#settings-modal-save").click();
  await expect(page.locator("#settings-modal")).toBeHidden();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(40);

  await page.evaluate(() => window.markdownViewerApp.modules.tabs.newTab("# Blocked", "Blocked"));
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(40);
  await expect.poll(() => page.evaluate(() => window.__alerts.at(-1))).toBe(
    "Maximum of 20 tabs reached. Please close an existing tab to open a new one."
  );

  await page.locator("#desktopActionMenu").click();
  await page.locator(".open-settings-dialog").first().click();
  await selectSettingsTab(page, "interface");
  await page.locator("#settings-max-open-tabs").fill("61");
  await page.locator("#settings-modal-save").click();
  await expect(page.locator("#settings-modal")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__alerts.at(-1))).toBe(
    "Enter a maximum open tabs value between 1 and 60."
  );
  await expect.poll(() => page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    return state.maxOpenTabs;
  })).toBe(20);

  await page.locator("#settings-modal-cancel").click();
  await page.evaluate(() => window.markdownViewerApp.modules.tabs.closeAllTabs({
    promptForUnsaved: false,
    recordInHistory: false
  }));
  await page.evaluate(() => window.markdownViewerApp.modules.tabs.newTab("", "Untitled"));
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(1);
});
