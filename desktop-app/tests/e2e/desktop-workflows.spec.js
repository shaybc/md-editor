const { test, expect, launchDesktopApp } = require("./desktop-fixture");
const {
  createTempWorkspace,
  readWorkspaceFile,
  removeTempWorkspace,
  removeWorkspacePath,
  renameWorkspacePath,
  writeWorkspaceFile,
} = require("../helpers/temp-workspace");
const { isProcessRunning } = require("../helpers/desktop-app");

async function openApp(page, state = {}) {
  await page.addInitScript((startupState) => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled", ...startupState }));
  }, state);
  await page.goto("/");
  await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.sidebarContextTree?.openFolderTree === "function");
}

async function openDesktopFolder(page, folderPath) {
  await page.evaluate((targetPath) => {
    Neutralino.os.showFolderDialog = async () => targetPath;
  }, folderPath);
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree({ preventDefault() {} }));
  await expect(page.locator("#folder-tree-root > .folder-tree-list")).toBeVisible({ timeout: 30000 });
}

async function dispatchFolderWatcherEvent(page, detail) {
  await page.evaluate((eventDetail) => {
    const watcher = window.markdownViewerApp.modules.folderWatcher;
    const watcherId = watcher?._test?.getActiveWatcherId?.();
    window.dispatchEvent(new CustomEvent("watchFile", {
      detail: { id: watcherId, ...eventDetail }
    }));
  }, detail);
}

function activeEditorValue(page) {
  return page.evaluate(() => window.markdownViewerApp.modules.activeEditorCommands.getActiveEditorValue());
}

async function setActiveEditorValue(page, content) {
  await page.evaluate((nextContent) => {
    const commands = window.markdownViewerApp.modules.activeEditorCommands;
    commands.setActiveEditorValue(nextContent);
    commands.dispatchActiveEditorInput();
  }, content);
}

test("lazy desktop folder stays usable for opening a visible file", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "visible.md": "# Visible\n\nThe lazy root still opens files.",
    "nested/deep.md": "# Deep"
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    const visibleFile = page.locator(".folder-tree-file", { hasText: "visible.md" });
    await expect(visibleFile).toBeVisible();
    await visibleFile.click();

    await expect.poll(() => activeEditorValue(page)).toContain("Visible");
    await expect.poll(() => activeEditorValue(page)).toContain("lazy root still opens files");
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("saves folder-backed edits to disk", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "save-me.md": "# Original"
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    await page.locator(".folder-tree-file", { hasText: "save-me.md" }).click();
    await expect.poll(() => activeEditorValue(page)).toContain("Original");
    await setActiveEditorValue(page, "# Saved\n\nWritten through the desktop save path.");
    await page.evaluate(() => window.markdownViewerApp.modules.tabs.saveCurrentFileIfChanged());

    await expect.poll(() => readWorkspaceFile(folderPath, "save-me.md")).toContain("Written through the desktop save path.");
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("writes recent desktop folder and file entries to the isolated profile", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "recent-note.md": "# Recent"
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);
    await page.locator(".folder-tree-file", { hasText: "recent-note.md" }).click();

    const profilePayload = await page.evaluate(async () => {
      const recentItems = window.markdownViewerApp.modules.recentItems;
      recentItems.scheduleGlobalProfileWrite();
      await new Promise((resolve) => setTimeout(resolve, 750));
      const profilePath = await recentItems.getProfileDataFilePath("recent-items.json");
      const raw = await Neutralino.filesystem.readFile(profilePath);
      return JSON.parse(raw);
    });

    expect(profilePayload.recentFolders.some((item) => item.path === folderPath)).toBe(true);
    expect(profilePayload.recentFiles.some((item) => item.path.endsWith("recent-note.md"))).toBe(true);
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("folder watcher events update created renamed and deleted files", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "existing.md": "# Existing"
  });
  const eventDir = folderPath.replace(/\\/g, "/");

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    await writeWorkspaceFile(folderPath, "created.md", "# Created");
    await dispatchFolderWatcherEvent(page, { action: "add", dir: eventDir, filename: "created.md" });
    await expect(page.locator(".folder-tree-file", { hasText: "created.md" })).toBeVisible();

    await renameWorkspacePath(folderPath, "created.md", "renamed.md");
    await dispatchFolderWatcherEvent(page, { action: "moved", dir: eventDir, oldFilename: "created.md", filename: "renamed.md" });
    await expect(page.locator(".folder-tree-file", { hasText: "renamed.md" })).toBeVisible();
    await expect(page.locator(".folder-tree-file", { hasText: "created.md" })).toHaveCount(0);

    await removeWorkspacePath(folderPath, "renamed.md");
    await dispatchFolderWatcherEvent(page, { action: "delete", dir: eventDir, filename: "renamed.md" });
    await expect(page.locator(".folder-tree-file", { hasText: "renamed.md" })).toHaveCount(0);
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("desktop launcher stops the Neutralino process on close", async () => {
  const app = await launchDesktopApp();
  const pid = app.process.pid;

  await app.close();

  await expect.poll(() => isProcessRunning(pid)).toBe(false);
});
