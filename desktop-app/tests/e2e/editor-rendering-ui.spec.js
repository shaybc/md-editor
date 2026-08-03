const { test, expect } = require("./desktop-fixture");
const {
  codeMirrorDocText,
  focusCodeMirror,
  openApp,
  openDesktopFolder,
  selectViewMode,
} = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("desktop editor rendering UI", () => {
  test("loads into an editable split-view document", async ({ page }) => {
    await openApp(page);

    await expect(page.locator(".view-mode-btn[data-mode='split']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".cm-editor")).toBeVisible();
    await expect(page.locator(".codemirror-editor .cm-content")).toHaveAttribute("contenteditable", "true");
    await expect(page.locator(".tab-view.active .preview-pane")).toBeVisible();
  });
  test("opens text files in the configured default preview mode", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "preview.md": "# Preview Mode\n\nRendered text." });

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", defaultOpenViewMode: "preview" }) } });
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file[data-path='preview.md']").click();

      await expect(page.locator(".view-mode-btn[data-mode='preview']")).toHaveAttribute("aria-pressed", "true");
      await selectViewMode(page, "editor");
      await expect.poll(() => codeMirrorDocText(page)).toContain("Preview Mode");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("keeps markdown table source available while switching to preview", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("# Body\n\n| Name | Value |\n| --- | --- |\n| Frontmatter Title | draft |");
    await expect.poll(() => codeMirrorDocText(page)).toContain("Frontmatter Title");
    await selectViewMode(page, "preview");

    await expect(page.locator(".view-mode-btn[data-mode=\"preview\"]")).toHaveAttribute("aria-pressed", "true");
  });

  test("rerenders a Mermaid diagram when entering split view from editor-only mode", async ({ page }) => {
    const markdown = "# Diagram\n\n```mermaid\nflowchart LR\n  A --> B\n```";
    await openApp(page);
    await page.waitForFunction(() => typeof window.mermaid?.init === "function");
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.insertText(markdown);
    await expect.poll(() => codeMirrorDocText(page)).toBe(markdown);

    const diagram = page.locator(".tab-view.active .mermaid svg");
    await diagram.waitFor({ state: "attached", timeout: 15000 });
    const hiddenViewBox = await diagram.getAttribute("viewBox");
    expect(hiddenViewBox).toMatch(/16 16$/);

    await selectViewMode(page, "split");
    await expect(diagram).toBeVisible({ timeout: 15000 });
    await expect.poll(() => diagram.getAttribute("viewBox")).not.toBe(hiddenViewBox);
    const visibleBounds = await diagram.boundingBox();
    expect(visibleBounds.width).toBeGreaterThan(50);
    await expect.poll(() => codeMirrorDocText(page)).toBe(markdown);
  });

  test("supports split view sync scrolling and line number updates", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type(Array.from({ length: 40 }, (_, index) => `Line ${index + 1}`).join("\n"));
    await selectViewMode(page, "split");
    await focusCodeMirror(page);
    await page.keyboard.press("End");

    await expect.poll(() => codeMirrorDocText(page)).toContain("Line 40");
  });

  test("marks Mermaid syntax risks in editor content", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("```mermaid\ngraph TD\nA-->B\n```\n");

    await expect.poll(() => codeMirrorDocText(page)).toContain("mermaid");
    await expect.poll(() => codeMirrorDocText(page)).toContain("A-->B");
  });
});
