const { test, expect } = require("./desktop-fixture");
const { openApp, openDesktopFolder, selectSettingsTab } = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

async function openGraphView(page) {
  const graphButton = page.locator(".folder-tree-tool-button.open-graph-view").first();
  await expect(graphButton).toBeEnabled({ timeout: 30000 });
  await graphButton.click();
  await expect(page.locator("#graph-view-canvas")).toBeVisible({ timeout: 30000 });
}

async function expandGraphToolbar(page) {
  const toggle = page.locator("#graph-filter-panel-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") {
    await toggle.click();
  }
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test.describe("desktop graph UI", () => {
  test("opens graph view, searches files, and shows node context menu", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "alpha.md": "# Alpha\n\nSee [[beta]].",
      "beta.md": "# Beta\n\n#tagged",
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expect(page.locator(".graph-node").first()).toBeVisible({ timeout: 30000 });
      await expandGraphToolbar(page);

      await page.locator("#graph-file-search-filter").fill("alpha");
      await expect(page.locator("#graph-file-search-filter")).toHaveValue("alpha");

      await page.locator(".graph-node").first().click({ button: "right" });
      await expect(page.locator(".graph-context-menu:not(.hidden)").first()).toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph grouping controls accept desktop resource queries", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      docs: {
        "grouped.md": "# Grouped\n\n#docs",
      },
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expandGraphToolbar(page);
      await page.evaluate(() => document.querySelector("#graph-add-group")?.click());
      await expect(page.locator(".graph-group-query-input")).toHaveCount(1);
      await page.evaluate(() => {
        const input = document.querySelector(".graph-group-query-input");
        if (!input) return;
        input.value = "tag:docs";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(page.locator(".graph-group-query-input").first()).toHaveValue("tag:docs");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph tabs hide markdown formatting toolbar", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "alpha.md": "# Alpha\n\nSee [[beta]].",
      "beta.md": "# Beta",
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expect(page.locator(".graph-tab-render")).toBeVisible({ timeout: 30000 });
      await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
      await expect(page.locator(".editor-formatting-toolbar")).not.toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph find highlights matching nodes without filtering the map", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "alpha.md": "# Alpha Node\n\nSee [[beta]].",
      "alpha-notes.md": "# Alpha Notes\n\nSee [[gamma]].",
      "beta.md": "# Beta Node",
      "gamma.md": "# Gamma Node",
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expect(page.locator(".graph-node-file")).toHaveCount(4, { timeout: 30000 });

      await page.locator(".graph-tab-render").click();
      await page.keyboard.press("Control+F");
      await expect(page.locator("#graph-find-dialog")).toBeVisible();

      await page.locator("#graph-find-input").fill("alpha");
      await page.locator("#graph-find-ok").click();
      await expect(page.locator(".graph-node-file")).toHaveCount(4);
      await expect(page.locator(".graph-node-found")).toHaveCount(2);

      await page.locator("#graph-find-dialog").dispatchEvent("click");
      await page.locator("#graph-find-input").fill("gamma");
      await page.locator("#graph-find-ok").click();
      await expect(page.locator(".graph-node-found")).toHaveCount(1);

      await page.locator("#graph-find-dialog").dispatchEvent("click");
      await page.locator("#graph-find-cancel").click();
      await expect(page.locator("#graph-find-dialog")).toBeHidden();
      await expect(page.locator(".graph-node-found")).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph settings can show file extensions in labels", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      notes: {
        "alpha.md": "# Alpha",
      },
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expect(page.locator(".graph-label-file").first()).toBeVisible({ timeout: 30000 });

      await page.locator("#desktopActionMenu").click();
      await page.locator(".open-settings-dialog").first().click();
      await selectSettingsTab(page, "graph");
      await page.locator("#settings-graph-show-file-extensions").check();
      await page.locator("#settings-modal-save").click();

      await expect(page.locator(".graph-label-file").first()).toContainText(".md");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

});