const { test, expect } = require("./desktop-fixture");
const { activeEditorValue, openActionMenu, openApp, openDesktopFolder } = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

async function openSearchSidebar(page) {
  await page.locator(".sidebar-view-option[data-sidebar-view='search']").first().click();
  await expect(page.locator("#workspace-search-panel")).toBeVisible();
}

test.describe("desktop workspace search UI", () => {
  test("workspace search finds folder files and opens a result", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "alpha.md": "# Alpha\nneedle text", "beta.md": "# Beta" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openSearchSidebar(page);
      await page.locator("#workspace-search-query").fill("needle");
      await page.locator("#workspace-search-run").click();
      await expect(page.locator(".workspace-search-result", { hasText: "alpha.md" })).toBeVisible({ timeout: 30000 });
      await page.locator(".workspace-search-result", { hasText: "alpha.md" }).first().click();
      await expect.poll(() => activeEditorValue(page)).toContain("needle text");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("workspace search previews replace and keeps apply disabled before confirmation", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "replace.md": "# Replace\nold token" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await openSearchSidebar(page);
      await page.locator("#workspace-search-query").fill("old token");
      await page.locator("#workspace-search-replace").fill("new token");
      await page.locator("#workspace-search-preview-replace").click();
      await expect(page.locator("#workspace-search-results")).toContainText("replace.md", { timeout: 30000 });
      await expect(page.locator("#workspace-search-apply-replace")).toBeEnabled();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("folder context menu opens workspace search scoped to that folder", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ docs: { "match.md": "# Match\nfolder needle" }, other: { "skip.md": "# Skip\nfolder needle" } });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      const docsFolder = page.locator(".folder-tree-label", { hasText: "docs" });
      await docsFolder.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 160 });
      await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Find in Folder ..." }).evaluate((button) => button.click());
      await expect(page.locator("#workspace-search-panel")).toBeVisible();
      await expect(page.locator("#workspace-search-include")).toHaveValue("./docs/**");
      await page.locator("#workspace-search-query").fill("folder needle");
      await page.locator("#workspace-search-run").click();
      await expect(page.locator(".workspace-search-result", { hasText: "docs/match.md" })).toBeVisible({ timeout: 30000 });
      await expect(page.locator(".workspace-search-result", { hasText: "other/docs/skip.md" })).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("open file by name preserves search and opens the selected file", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ docs: { "target-note.md": "# Target Note" }, "other.md": "# Other" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await page.evaluate(() => document.querySelector(".open-file-by-name-dialog")?.click());
      await expect(page.locator("#open-file-by-name-modal")).toBeVisible();
      await page.locator("#open-file-by-name-input").fill("target");
      await expect(page.locator(".open-file-by-name-result", { hasText: "target-note.md" })).toBeVisible();
      await page.locator(".open-file-by-name-result", { hasText: "target-note.md" }).click();
      await expect.poll(() => activeEditorValue(page)).toContain("Target Note");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("find in files searches a selected folder and opens a matched result", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ docs: { "match.md": "# Match\nfolder needle" }, other: { "skip.md": "# Skip\nfolder needle" } });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await page.evaluate(() => document.querySelector(".open-find-in-files-dialog")?.click());
      await expect(page.locator("#find-in-files-modal")).toBeVisible();
      await page.locator("#find-in-files-folder").fill(require("node:path").join(folderPath, "docs"));
      await page.locator("#find-in-files-query").fill("folder needle");
      await page.locator("#find-in-files-run").click();
      await expect(page.locator("#bottom-panel-search-results", { hasText: "match.md" })).toBeVisible({ timeout: 30000 });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
});