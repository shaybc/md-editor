const { test, expect } = require("./desktop-fixture");
const { activeEditorValue, openApp, openDesktopFolder } = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("desktop advanced startup and tabs UI", () => {
  test("new file from empty workspace shows the editor immediately", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.markdownViewerApp.modules.tabs.newTab("", "Untitled"));
    await expect(page.locator("#tab-list .tab-item.active")).toBeVisible();
  });

  test("closing the last tab leaves the workspace empty", async ({ page }) => {
    await openApp(page);
    await page.locator("#tab-list .tab-item .tab-close-btn").first().click();
    await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  });

  test("folder and graph open in a new tab focuses existing file tabs", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "one.md": "# One", "two.md": "# Two" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file[data-path='one.md']").click();
      await page.locator(".folder-tree-file[data-path='two.md']").click();
      await page.locator(".folder-tree-file[data-path='one.md']").click();
      await expect(page.locator("#tab-list .tab-item", { hasText: "one" })).toHaveCount(1);
      await expect.poll(() => activeEditorValue(page)).toContain("# One");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("startup behavior waits for profile preference hydration", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  });
});