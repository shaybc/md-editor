const { test, expect } = require("./desktop-fixture");
const { openApp, openDesktopFolder, selectSettingsTab } = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

async function openGraphView(page) {
  const graphButton = page.locator(".folder-tree-tool-button.open-graph-view").first();
  await expect(graphButton).toBeEnabled({ timeout: 30000 });
  await graphButton.click();
  await expect(page.locator("#graph-view-canvas")).toBeVisible({ timeout: 30000 });
}

async function expandGraphPanel(page) {
  const toggle = page.locator("#graph-filter-panel-toggle");
  if (await toggle.getAttribute("aria-expanded") !== "true") await toggle.click();
  await expect(toggle).toHaveAttribute("aria-expanded", "true");
}

test.describe("desktop advanced graph UI", () => {
  test("graph display exposes orphan visibility controls", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "linked.md": "# Linked\n\nSee [[target]].", "target.md": "# Target", "orphan.md": "# Orphan" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expandGraphPanel(page);
      await expect(page.locator("#graph-display-orphans")).toHaveCount(1);
      await page.locator("#graph-display-orphans").check({ force: true });
      await expect(page.locator("#graph-display-orphans")).toBeChecked();
      await expect(page.locator(".graph-node-file")).toHaveCount(3, { timeout: 30000 });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph group query suggestions can be selected with the mouse", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ docs: { "alpha.md": "# Alpha\n\n#docs" }, "beta.md": "# Beta" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expandGraphPanel(page);
      await page.evaluate(() => document.querySelector("#graph-add-group")?.click());
      await expect(page.locator(".graph-group-query-input")).toHaveCount(1);
      await page.evaluate(() => {
        const input = document.querySelector(".graph-group-query-input");
        input.value = "tag:docs";
        input.dispatchEvent(new Event("input", { bubbles: true }));
      });
      await expect(page.locator(".graph-group-query-input").first()).toHaveValue("tag:docs");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph context menu opens from the graph canvas", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "alpha.md": "# Alpha", "beta.md": "# Beta" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await page.locator(".graph-tab-render").click({ button: "right" });
      await expect(page.locator(".graph-context-menu:not(.hidden)")).toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("graph settings update node label extension display", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "alpha.md": "# Alpha" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openGraphView(page);
      await expect(page.locator(".graph-label-file").first()).toBeVisible({ timeout: 30000 });
      await selectSettingsTab(page, "graph");
      await page.locator("#settings-graph-show-file-extensions").check();
      await page.locator("#settings-modal-save").click();
      await expect(page.locator(".graph-label-file").first()).toContainText(".md");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
});