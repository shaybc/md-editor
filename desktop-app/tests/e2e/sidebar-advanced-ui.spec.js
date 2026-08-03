const { test, expect } = require("./desktop-fixture");
const path = require("node:path");
const { activeEditorValue, mockNeutralinoDialogs, openApp, openDesktopFolder } = require("../helpers/desktop-ui");
const { createLazyWorkspace, createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("desktop advanced sidebar UI", () => {
  test("sidebar file context menu exposes desktop reveal actions", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "note.md": "# Note" });

    try {
      await openApp(page);
      await page.evaluate(() => { window.__openedPaths = []; window.Neutralino.os.open = async (targetPath) => window.__openedPaths.push(targetPath); });
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file[data-path='note.md']").click({ button: "right" });
      await expect(page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal" }).first()).toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("tab context menu reveals a file inside a lazy project tree", async ({ page }) => {
    const folderPath = await createLazyWorkspace(40);

    try {
      await openApp(page, { localStorage: { markdownViewerFolderTreeLazyThreshold: "5" } });
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file[data-path='item-000.md']").click();
      await expect.poll(() => activeEditorValue(page)).toContain("Item 0");
      await page.locator("#tab-list .tab-item.active").click({ button: "right" });
      await page.locator(".tab-context-menu:not(.hidden) [data-action='reveal-in-tree-view']").click();
      await expect(page.locator(".folder-tree-file.auto-selected")).toHaveAttribute("data-path", "item-000.md");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("folder context menu opens converter with clicked folder as source", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ app: { "index.js": "export const app = true;" } });

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", codeConverterDestinationRoot: "C:/docs/project-md" }) } });
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-label", { hasText: "app" }).click({ button: "right" });
      await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Convert Code to MD" }).click();
      await expect(page.locator("#code-converter-modal")).toBeVisible();
      await expect(page.locator("#code-converter-source-root")).toHaveValue(path.join(folderPath, "app").replace(/\\/g, "/"));
      await expect(page.locator("#code-converter-destination-root")).toHaveValue("C:/docs/project-md");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("open folder starts collapsed", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ docs: { "guide.md": "# Guide" } });

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }) } });
      await openDesktopFolder(page, folderPath);
      await expect.poll(() => page.evaluate(() => document.querySelector("#folder-tree-root details[data-path='docs']")?.open)).toBe(false);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
});