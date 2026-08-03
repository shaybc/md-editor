const path = require("node:path");

const { test, expect } = require("./desktop-fixture");
const {
  activeEditorValue,
  openActionMenu,
  openApp,
  openDesktopFolder,
  selectSettingsTab,
} = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("desktop startup recents and tabs UI", () => {
  test("close all clears open tabs after confirmation", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "one.md": "# One",
      "two.md": "# Two",
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);

      await page.locator(".folder-tree-file[data-path='one.md']").click();
      await page.locator(".folder-tree-file[data-path='two.md']").click();
      await expect(page.locator("#tab-list .tab-item")).toHaveCount(2);
      await expect(page.locator("#tab-reset-btn")).toBeEnabled();

      await page.locator("#tab-reset-btn").click();
      await page.locator("#reset-modal-confirm").click();
      await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
      await expect(page.locator("#tab-reset-btn")).toBeDisabled();
      await expect.poll(() => activeEditorValue(page)).toBe("");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("recent file and folder menu entries can be removed", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "recent.md": "# Recent" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file[data-path='recent.md']").click();

      await openActionMenu(page);
      await expect(page.locator(".recent-files-menu .recent-menu-item")).toContainText("recent.md");
      await expect(page.locator(".recent-folders-menu .recent-menu-item")).toContainText(path.basename(folderPath));

      await page.locator(".recent-files-menu .recent-menu-item", { hasText: "recent.md" }).locator(".recent-menu-remove").evaluate((button) => button.click());
      await expect(page.locator(".recent-files-menu .recent-menu-item", { hasText: "recent.md" })).toHaveCount(0);

      await page.locator(".recent-folders-menu .recent-menu-item", { hasText: path.basename(folderPath) }).locator(".recent-menu-remove").evaluate((button) => button.click());
      await expect(page.locator(".recent-folders-menu .recent-menu-item", { hasText: path.basename(folderPath) })).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("startup behavior setting can be changed through the settings UI", async ({ page }) => {
    await openApp(page);

    await selectSettingsTab(page, "interface");
    await page.locator("#settings-startup-behavior").selectOption("empty");
    await expect(page.locator("#settings-startup-behavior")).toHaveValue("empty");
  });
});







