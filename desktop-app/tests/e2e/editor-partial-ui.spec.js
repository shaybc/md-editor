const fs = require("node:fs");
const path = require("node:path");
const { test, expect } = require("./desktop-fixture");
const {
  activeEditorValue,
  focusCodeMirror,
  openApp,
  openDesktopFolder,
  selectSettingsTab,
  selectViewMode,
  setActiveEditorSelection,
  setActiveEditorValue,
} = require("../helpers/desktop-ui");
const { createTempWorkspace, readWorkspaceFile, removeTempWorkspace } = require("../helpers/temp-workspace");

async function clickEditorFormatButton(page, action) {
  await page.locator(`.editor-format-button[data-editor-format-action="${action}"]`).click();
}

test.describe("desktop editor exact migrated UI", () => {
  test("opens new documents in the configured default mode regardless of the current view mode", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", fileOpeningModes: { version: 1, modes: {} } }),
      },
    });

    await selectViewMode(page, "preview");
    await page.locator(".tab-new-btn").evaluate((button) => button.click());

    await expect(page.locator(".view-mode-btn[data-mode='editor']")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator(".tab-view.active .editor-pane")).toBeVisible();
    await expect(page.locator(".tab-view.active .preview-pane")).not.toBeVisible();
    await expect.poll(() => page.evaluate(() => (
      window.markdownViewerApp.modules.tabs.getActiveTab()?.viewMode
    ))).toBe("editor");
  });

  test("supports document keyboard shortcut for split-view sync scrolling", async ({ page }) => {
    await openApp(page);

    const syncButton = page.locator("#toggle-sync");
    const initialSyncText = await syncButton.innerText();
    await page.keyboard.press("Control+Shift+S");
    await expect(syncButton).not.toHaveText(initialSyncText);

    const toggledSyncText = await syncButton.innerText();
    await selectViewMode(page, "preview");
    await page.keyboard.press("Control+Shift+S");
    await expect(syncButton).toHaveText(toggledSyncText);
  });

  test("keeps editor line numbers in sync with typed content", async ({ page }) => {
    await openApp(page);

    await setActiveEditorValue(page, "First line\nSecond line\nThird line");

    const lineNumbers = page.locator("#editor-line-numbers .editor-line-number");
    await expect(lineNumbers).toHaveCount(3);
    await expect(lineNumbers.nth(0)).toHaveText("1");
    await expect(lineNumbers.nth(1)).toHaveText("2");
    await expect(lineNumbers.nth(2)).toHaveText("3");
  });

  test("aligns find relative to the editor with spacious app header spacing", async ({ page }) => {
    const folderPath = await createTempWorkspace({
      "styles.css": ".example { color: red; }",
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({ appHeaderSpacing: "spacious" }),
        },
      });
      await expect(page.locator("body")).toHaveClass(/app-header-spacious/);
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file", { hasText: "styles.css" }).click();
      await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
      await expect(page.locator(".tab-view.active .editor-pane")).toHaveCSS("padding-top", "0px");

      await page.locator(".open-editor-find-dialog").first().evaluate((button) => button.click());
      await expect(page.locator("#editor-find-replace-modal")).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const editorTop = document.querySelector(".tab-view.active .editor-pane")?.getBoundingClientRect().top;
        const findTop = document.querySelector(".editor-find-replace-modal-box")?.getBoundingClientRect().top;
        return Math.round(findTop - editorTop);
      })).toBe(12);

      await page.locator("#tab-list .tab-item", { hasText: "Untitled 1" }).click();
      await expect(page.locator(".content-container")).toHaveClass(/markdown-tab-active/);
      await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();
      await expect(page.locator(".tab-view.active .editor-pane")).toHaveCSS("padding-top", "0px");
      await expect(page.locator("#editor-find-replace-modal")).toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const editorTop = document.querySelector(".tab-view.active .editor-pane")?.getBoundingClientRect().top;
        const findTop = document.querySelector(".editor-find-replace-modal-box")?.getBoundingClientRect().top;
        return Math.round(findTop - editorTop);
      })).toBe(12);

      await page.locator("#tab-list .tab-item", { hasText: "styles.css" }).click();
      await expect(page.locator(".content-container")).not.toHaveClass(/markdown-tab-active/);
      await expect.poll(() => page.evaluate(() => {
        const editorTop = document.querySelector(".tab-view.active .editor-pane")?.getBoundingClientRect().top;
        const findTop = document.querySelector(".editor-find-replace-modal-box")?.getBoundingClientRect().top;
        return Math.round(findTop - editorTop);
      })).toBe(12);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("updates document statistics and focused editor position", async ({ page }) => {
    await openApp(page);

    const markdown = "Alpha beta\nGamma delta";
    await setActiveEditorValue(page, markdown);
    await setActiveEditorSelection(page, markdown.length);
    await page.keyboard.press("ArrowRight");

    await expect(page.locator("#word-count")).toHaveText("4");
    await expect(page.locator("#char-count")).toHaveText(String(markdown.length));
    await expect(page.locator("#reading-time")).toHaveText("1");
    await expect(page.locator("#editor-total-lines")).toHaveText("2");
    await expect(page.locator("#editor-cursor-line")).toHaveText("2");
    await expect(page.locator("#editor-cursor-column")).toHaveText("12");
    await expect(page.locator("#editor-position-label")).toHaveText("Pos");
    await expect(page.locator("#editor-position-value")).toHaveText(String(markdown.length + 1));
  });

  test("converts selected editor text from the formatting toolbar", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");

    await setActiveEditorValue(page, "Toolbar heading");
    await setActiveEditorSelection(page, 0, "Toolbar heading".length);
    await expect(page.locator(".editor-formatting-toolbar")).toBeVisible();
    await clickEditorFormatButton(page, "heading-1");
    await expect.poll(() => activeEditorValue(page)).toBe("# Toolbar heading");
    await clickEditorFormatButton(page, "undo");
    await expect.poll(() => activeEditorValue(page)).toBe("Toolbar heading");
    await clickEditorFormatButton(page, "redo");
    await expect.poll(() => activeEditorValue(page)).toBe("# Toolbar heading");

    await setActiveEditorValue(page, "**Bold** and [link](https://example.com)");
    await setActiveEditorSelection(page, 0, "**Bold** and [link](https://example.com)".length);
    await clickEditorFormatButton(page, "clear-formatting");
    await expect(page.locator("#editor-clear-markdown-modal")).toBeVisible();
    await page.locator("#editor-clear-markdown-apply").click();
    await expect.poll(() => activeEditorValue(page)).toBe("Bold and link");

    const cases = [
      ["small heading", "heading-6", "###### small heading"],
      ["removed", "strikethrough", "~~removed~~"],
      ["mIXed WORDS", "title-case", "Mixed Words"],
      ["make me loud", "uppercase", "MAKE ME LOUD"],
      ["MAKE ME QUIET", "lowercase", "make me quiet"],
    ];
    for (const [source, action, expected] of cases) {
      await setActiveEditorValue(page, source);
      await setActiveEditorSelection(page, 0, source.length);
      await clickEditorFormatButton(page, action);
      await expect.poll(() => activeEditorValue(page)).toBe(expected);
    }

    await setActiveEditorValue(page, "OpenAI docs");
    await setActiveEditorSelection(page, 0, "OpenAI docs".length);
    await clickEditorFormatButton(page, "link");
    await expect(page.locator("#editor-link-modal")).toBeVisible();
    await expect(page.locator("#editor-link-text")).toHaveValue("OpenAI docs");
    await page.locator("#editor-link-url").fill("https://openai.com");
    await page.locator("#editor-link-apply").click();
    await expect.poll(() => activeEditorValue(page)).toBe("[OpenAI docs](https://openai.com)");

    await setActiveEditorValue(page, "italic text");
    await setActiveEditorSelection(page, 0, "italic text".length);
    await clickEditorFormatButton(page, "reference");
    await expect(page.locator("#editor-reference-modal")).toBeVisible();
    await expect(page.locator("#editor-reference-number")).toHaveValue("[1]");
    await page.locator("#editor-reference-url").fill("https://example.com/ref");
    await page.locator("#editor-reference-title").fill("Reference title");
    await page.locator("#editor-reference-apply").click();
    await expect.poll(() => activeEditorValue(page)).toBe('italic text[1]\n\n[1]: https://example.com/ref "Reference title"');

    await setActiveEditorValue(page, "Architecture chart");
    await setActiveEditorSelection(page, 0, "Architecture chart".length);
    await clickEditorFormatButton(page, "image");
    await expect(page.locator("#editor-image-modal")).toBeVisible();
    await expect(page.locator("#editor-image-alt")).toHaveValue("Architecture chart");
    await page.locator("#editor-image-url").fill("https://example.com/chart.png");
    await page.locator("#editor-image-apply").click();
    await expect.poll(() => activeEditorValue(page)).toBe('![Architecture chart](https://example.com/chart.png "Architecture chart")');
  });

  test("saves folder-backed edits with Ctrl+S and the Save changes menu item", async ({ page }) => {
    const folderPath = await createTempWorkspace({ "folder-note.md": "# Folder Note\n\nOriginal" });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file", { hasText: "folder-note.md" }).click();
      await expect.poll(() => activeEditorValue(page)).toContain("Original");

      await setActiveEditorValue(page, "# Folder Note\n\nSaved by shortcut.");
      await focusCodeMirror(page);
      await page.keyboard.press("Control+S");
      await expect.poll(() => readWorkspaceFile(folderPath, "folder-note.md")).toBe("# Folder Note\n\nSaved by shortcut.");
      await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);

      await setActiveEditorValue(page, "# Folder Note\n\nSaved by button.");
      await page.locator(".save-current-file-button").first().click();
      await expect.poll(() => readWorkspaceFile(folderPath, "folder-note.md")).toBe("# Folder Note\n\nSaved by button.");
      await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
});
test("shows an exact offline license summary above the source editor", async ({ page }) => {
  const canonicalMit = fs.readFileSync(
    path.resolve(__dirname, "../../resources/assets/license-header/licenses/mit.txt"),
    "utf8"
  );
  const appLicense = fs.readFileSync(path.resolve(__dirname, "../../../LICENSE"), "utf8");
  const folderPath = await createTempWorkspace({
    LICENSE: canonicalMit,
    "LICENSE.txt": appLicense,
    "license-copy.txt": canonicalMit,
  });

  try {
    await page.route("https://**/*", (route) => route.abort());
    await page.setViewportSize({ width: 1000, height: 500 });
    await openApp(page);
    await openDesktopFolder(page, folderPath);
    await page.locator('.folder-tree-file[data-name="LICENSE"]').click();

    const activeView = page.locator(".tab-view.active");
    const header = activeView.locator(".license-summary-host");
    await expect(header).toBeVisible();
    await expect(header.locator("h3")).toHaveText("MIT License");
    await expect(header).toContainText("Permissions");
    await expect(header).toContainText("Limitations");
    await expect(header).toContainText("Conditions");
    await expect(header).toContainText("This is not legal advice.");

    await selectViewMode(page, "split");
    await expect(header).toBeVisible();
    await expect(activeView.locator(".preview-pane")).toBeVisible();
    const headerTop = await header.evaluate((element) => Math.round(element.getBoundingClientRect().top));
    await activeView.locator(".cm-scroller").evaluate((element) => { element.scrollTop = 120; });
    await expect.poll(() => header.evaluate((element) => Math.round(element.getBoundingClientRect().top))).toBe(headerTop);

    await selectViewMode(page, "preview");
    await expect(header).not.toBeVisible();
    await selectViewMode(page, "editor");
    await expect(header).toBeVisible();

    await setActiveEditorValue(page, `${canonicalMit}x`);
    await expect(header).not.toBeVisible();
    await setActiveEditorValue(page, canonicalMit);
    await expect(header).toBeVisible();

    await page.locator('.folder-tree-file[data-name="license-copy.txt"]').click();
    await expect(page.locator(".tab-view.active .license-summary-host")).not.toBeVisible();
    await page.locator('.folder-tree-file[data-name="LICENSE"]').click();
    await expect(page.locator(".tab-view.active .license-summary-host")).toBeVisible();

    await page.locator('.folder-tree-file[data-name="LICENSE.txt"]').click();
    await expect(page.locator(".tab-view.active .license-summary-host h3")).toHaveText("Apache License 2.0");
    await page.locator('.folder-tree-file[data-name="LICENSE"]').click();

    await page.setViewportSize({ width: 700, height: 500 });
    await expect.poll(() => page.locator(".tab-view.active .license-summary-card").evaluate((element) => element.scrollWidth <= element.clientWidth)).toBe(true);
  } finally {
    await removeTempWorkspace(folderPath);
  }
});
