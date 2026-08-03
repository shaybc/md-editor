const { test, expect } = require("./desktop-fixture");
const fs = require("node:fs");
const nodePath = require("node:path");
const { createTempWorkspace, removeTempWorkspace } = require("../helpers/temp-workspace");

async function openApp(page) {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
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

function activeEditorValue(page) {
  return page.evaluate(() => window.markdownViewerApp.modules.activeEditorCommands.getActiveEditorValue());
}

test("opens a real desktop folder file from the folder tree", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "desktop-note.md": "# Desktop Note\n\nOpened from a real folder tree."
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    const note = page.locator(".folder-tree-file", { hasText: "desktop-note.md" });
    await expect(note).toBeVisible();
    await note.click();

    await expect(page.locator("#tab-list .tab-item", { hasText: "desktop-note" })).toHaveCount(1);
    await expect.poll(() => activeEditorValue(page)).toContain("Desktop Note");
    await expect.poll(() => activeEditorValue(page)).toContain("real folder tree");
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("opens and saves an unfenced Mermaid file as a rendered diagram", async ({ page }) => {
  const initialSource = "flowchart LR\n  Start --> Finish";
  const updatedSource = "flowchart TD\n  Start --> Review\n  Review --> Finish";
  const folderPath = await createTempWorkspace({
    "workflow.mermaid": initialSource
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    const diagramFile = page.locator(".folder-tree-file[data-path='workflow.mermaid']");
    await expect(diagramFile).toBeVisible();
    await expect(diagramFile).not.toHaveClass(/folder-tree-unsupported-file/);
    await expect(diagramFile.locator("i")).toHaveClass(/bi-diagram-2/);
    await diagramFile.click();

    await expect(page.locator("#tab-list .tab-item.active")).toContainText("workflow");
    await expect.poll(() => activeEditorValue(page)).toBe(initialSource);
    await expect(page.locator(".tab-view.active .mermaid-container .mermaid svg")).toBeVisible({ timeout: 15000 });

    await page.evaluate((content) => {
      const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
      view.dispatch({
        changes: { from: 0, to: view.state.doc.length, insert: content }
      });
    }, updatedSource);
    const saveButton = page.locator(".save-current-file-button").first();
    await expect(saveButton).toBeEnabled();
    await saveButton.evaluate((button) => button.click());

    const filePath = nodePath.join(folderPath, "workflow.mermaid");
    await expect.poll(() => fs.readFileSync(filePath, "utf8")).toBe(updatedSource);
    await expect.poll(() => activeEditorValue(page)).toBe(updatedSource);
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("renders a pending Mermaid diagram when returning to an existing Markdown tab", async ({ page }) => {
  const firstMarkdown = "# First\n\n```mermaid\nflowchart LR\n  A --> B\n```";
  const secondMarkdown = "# Second\n\n```mermaid\nflowchart TD\n  C --> D\n```";
  const folderPath = await createTempWorkspace({
    "first.md": firstMarkdown,
    "second.md": secondMarkdown
  });
  let releaseMermaidLoad = function() {};
  const mermaidLoadGate = new Promise((resolve) => {
    releaseMermaidLoad = resolve;
  });

  try {
    await page.route("**/vendor/js/mermaid.min.js", async (route) => {
      await mermaidLoadGate;
      await route.continue();
    });
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    await page.locator(".folder-tree-file[data-path='first.md']").dblclick();
    await expect(page.locator("#tab-list .tab-item.active")).toContainText("first");
    await expect(page.locator(".tab-view.active .mermaid svg")).toHaveCount(0);

    await page.locator(".folder-tree-file[data-path='second.md']").click();
    await expect(page.locator("#tab-list .tab-item.active")).toContainText("second");
    releaseMermaidLoad();
    await expect(page.locator(".tab-view.active .mermaid svg")).toBeVisible({ timeout: 15000 });

    await page.locator("#tab-list .tab-item", { hasText: "first" }).click();
    await expect(page.locator(".tab-view.active .mermaid svg")).toBeVisible({ timeout: 15000 });
    await expect.poll(() => activeEditorValue(page)).toBe(firstMarkdown);
  } finally {
    releaseMermaidLoad();
    await removeTempWorkspace(folderPath);
  }
});

test("opens a folder-tree file explicitly in the built-in hex editor", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "hex-source.md": "# Hex source\n"
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    const file = page.locator(".folder-tree-file", { hasText: "hex-source.md" });
    await expect(file).toBeVisible();
    await file.click({ button: "right" });
    const action = page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", {
      hasText: "Open in Hex Editor"
    });
    await expect(action).toBeVisible();
    await action.click();

    await expect(page.locator(".hex-editor")).toBeVisible();
    await expect(page.locator(".hex-editor-title")).toContainText("hex-source.md");
    await expect(page.locator(".hex-editor-hex-byte[data-offset='0']")).toHaveText("23");
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("opens the exact duplicate filename selected in the desktop folder tree", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "README.md": "# Root Readme\n\nOpened from the root.",
    "nested/README.md": "# Nested Readme\n\nShould not open first."
  });

  try {
    await openApp(page);
    await openDesktopFolder(page, folderPath);

    const rootReadme = page.locator(".folder-tree-file[data-path='README.md']");
    await expect(rootReadme).toBeVisible();
    await rootReadme.click();

    await expect.poll(() => activeEditorValue(page)).toContain("Root Readme");
    await expect.poll(() => activeEditorValue(page)).not.toContain("Nested Readme");
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("keeps the sole MD-Editor brand visible on the right with or without an open folder", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "README.md": "# Header Folder"
  });

  try {
    await openApp(page);
    const brand = page.locator("#header-brand-right");
    const githubLink = page.locator(".app-header .github-link[title='View on GitHub']");

    await expect(page.locator(".app-header .header-brand")).toHaveCount(1);
    await expect(brand).toBeVisible();
    await expect(brand).toContainText("MD-Editor");
    await expect(githubLink).toHaveCount(1);
    await expect(githubLink).toBeVisible();
    await expect(githubLink).not.toHaveAttribute("tabindex", "-1");
    await expect(page.locator("#header-folder-identity, #header-folder-name, #header-folder-path, #header-source-root")).toHaveCount(0);

    await openDesktopFolder(page, folderPath);
    await expect(brand).toBeVisible();
    await expect(githubLink).toBeVisible();

    await page.setViewportSize({ width: 375, height: 720 });
    await expect(brand).toBeVisible();
    await expect(githubLink).toBeVisible();
  } finally {
    await removeTempWorkspace(folderPath);
  }
});

test("opens files from the folder tree without showing an error", async ({ page }) => {
  const folderPath = await createTempWorkspace({
    "folder-note.md": "# Folder Note\n\nOpened from tree."
  });

  try {
    await openApp(page);
    await page.evaluate(() => {
      window.__alertMessages = [];
      window.alert = (message) => {
        window.__alertMessages.push(String(message));
      };
    });
    await openDesktopFolder(page, folderPath);

    const note = page.locator(".folder-tree-file", { hasText: "folder-note.md" });
    await expect(note).toBeVisible();
    await note.click();

    await expect.poll(() => activeEditorValue(page)).toContain("Opened from tree");
    await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);

    await note.dblclick();
    await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);

    await note.click({ button: "right" });
    await expect(page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" })).toBeVisible();
    await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Open in a new tab" }).click();
    await expect(page.locator("#tab-list .tab-item", { hasText: "folder-note" })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__alertMessages)).toEqual([]);
  } finally {
    await removeTempWorkspace(folderPath);
  }
});
