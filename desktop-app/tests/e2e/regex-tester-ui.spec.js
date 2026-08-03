const { test, expect } = require("./desktop-fixture");
const { openApp } = require("../helpers/desktop-ui");

test.describe("Regex-Tester UI", () => {
  test("opens as a singleton, matches and replaces, responds, and restores the last workspace", async ({ page }) => {
    await openApp(page);

    const rail = page.locator(".open-regex-tester");
    await expect(rail).toBeVisible();
    await rail.click();
    await expect(page.locator(".regex-tester-view")).toBeVisible();
    await expect(rail).toHaveClass(/active/);
    await expect(page.locator(".regex-tester-pattern")).toHaveAttribute("rows", "1");
    const referenceGroup = page.locator(".regex-tester-reference-group");
    await expect(referenceGroup.locator("option")).toHaveCount(10);
    await referenceGroup.selectOption("anchors");
    await expect(page.locator('.regex-tester-reference-entry[data-reference-group="anchors"]')).not.toHaveCount(0);
    await expect(page.locator('.regex-tester-reference-entry:not([data-reference-group="anchors"])')).toHaveCount(0);
    await page.locator(".regex-tester-reference-filter").fill("word boundary");
    await expect(page.locator(".regex-tester-reference-entry")).toHaveCount(2);
    await page.locator(".regex-tester-reference-filter").fill("");
    await referenceGroup.selectOption("all");
    await expect(page.locator(".regex-tester-reference-group-heading")).not.toHaveCount(0);
    await expect(page.locator("#regex-tester-sidebar-panel")).toBeVisible();
    await expect(page.locator("#regex-tester-sidebar-panel .regex-tester-inspector")).toBeVisible();
    await expect(page.locator("#folder-tree-root")).toBeHidden();
    await expect(page.locator(".sidebar-view-option.active")).toHaveCount(0);
    await expect(page.locator(".folder-tree-topbar")).toBeHidden();
    await expect(page.locator(".regex-tester-workspace")).toHaveCSS("grid-template-columns", /.+/);
    const fullWidthBounds = await page.locator('.tab-view[data-tab-view-kind="regex-tester"]').evaluate((tabRoot) => ({
      tabRoot: tabRoot.getBoundingClientRect().width,
      view: tabRoot.querySelector(".regex-tester-view").getBoundingClientRect().width,
      workspace: tabRoot.querySelector(".regex-tester-workspace").getBoundingClientRect().width,
      main: tabRoot.querySelector(".regex-tester-main").getBoundingClientRect().width
    }));
    expect(fullWidthBounds.tabRoot - fullWidthBounds.view).toBeLessThanOrEqual(1);
    expect(fullWidthBounds.view - fullWidthBounds.workspace).toBeLessThanOrEqual(1);
    expect(fullWidthBounds.workspace - fullWidthBounds.main).toBeLessThanOrEqual(30);

    await page.locator('.sidebar-view-option[data-sidebar-view="files"]').click();
    await expect(page.locator(".regex-tester-view")).toBeVisible();
    await expect(page.locator("#folder-tree-root")).toBeVisible();
    await expect(page.locator(".folder-tree-topbar")).toBeVisible();
    await expect(rail).not.toHaveClass(/active/);

    await rail.click();
    await expect(rail).toHaveClass(/active/);
    await expect(page.locator("#regex-tester-sidebar-panel")).toBeVisible();
    await expect(page.locator("#folder-tree-root")).toBeHidden();
    await expect(page.locator(".folder-tree-topbar")).toBeHidden();

    await rail.click();
    await expect(page.locator("#regex-tester-sidebar-panel")).toBeHidden();
    await rail.click();
    await expect(page.locator("#regex-tester-sidebar-panel")).toBeVisible();
    await expect(rail).toHaveClass(/active/);

    await page.locator(".regex-tester-pattern").fill("(?<word>\\w+)");
    await page.locator(".regex-tester-test-string").fill("one");
    await expect(page.locator(".regex-tester-status")).toContainText("1 match");
    await expect(page.locator(".regex-tester-highlight-overlay mark")).toHaveCount(1);
    await page.locator(".regex-tester-test-string").fill("one two");
    await expect(page.locator(".regex-tester-status")).toContainText("2 matches");
    await expect(page.locator(".regex-tester-text-editor textarea")).toHaveCount(1);
    await expect(page.locator(".regex-tester-highlight-overlay mark")).toHaveCount(2);
    const mergedEditorBounds = await page.locator(".regex-tester-text-editor").evaluate((editor) => ({
      textarea: editor.querySelector("textarea").getBoundingClientRect().toJSON(),
      highlights: editor.querySelector(".regex-tester-highlight-overlay").getBoundingClientRect().toJSON()
    }));
    expect(mergedEditorBounds.textarea).toEqual(mergedEditorBounds.highlights);
    await expect(page.locator(".regex-tester-match-information")).toContainText("one");

    await page.locator(".regex-tester-engine").selectOption("java");
    await expect(page.locator(".regex-tester-status")).toContainText("2 matches", { timeout: 10000 });
    await expect(page.locator(".regex-tester-engine-version")).toContainText("Java");
    await page.locator('.regex-tester-mode[data-mode="replace"]').click();
    await referenceGroup.selectOption("meta");
    await expect(page.locator(".regex-tester-reference-entry").filter({ hasText: "Quoted literal" })).toBeVisible();
    const editorHeights = await page.locator(".regex-tester-main").evaluate((main) => ({
      testString: main.querySelector(".regex-tester-text-editor").getBoundingClientRect().height,
      replacementOutput: main.querySelector(".regex-tester-replacement-output").getBoundingClientRect().height
    }));
    expect(Math.abs(editorHeights.testString - editorHeights.replacementOutput)).toBeLessThanOrEqual(1);
    await page.locator(".regex-tester-replacement").fill("[${word}]");
    await expect(page.locator(".regex-tester-replacement-output")).toHaveValue("[one] [two]");
    await expect(page.locator(".regex-tester-replacement-highlight-overlay mark")).toHaveCount(2);
    const replacementEditorBounds = await page.locator(".regex-tester-replacement-output-editor").evaluate((editor) => ({
      textarea: editor.querySelector("textarea").getBoundingClientRect().toJSON(),
      highlights: editor.querySelector(".regex-tester-replacement-highlight-overlay").getBoundingClientRect().toJSON()
    }));
    expect(replacementEditorBounds.textarea).toEqual(replacementEditorBounds.highlights);
    await page.locator(".regex-tester-engine").selectOption("javascript");
    await page.locator('.regex-tester-mode[data-mode="replace"]').click();
    await page.locator(".regex-tester-replacement").fill("[$<word>]");
    await expect(page.locator(".regex-tester-replacement-output")).toHaveValue("[one] [two]");
    await expect(page.locator(".regex-tester-replacement-highlight-overlay mark")).toHaveCount(2);

    await expect(page.locator('.tab[data-tab-type="regex-tester"], .tab-item[data-tab-type="regex-tester"], .tab-title:has-text("Regex-Tester")')).toHaveCount(1);

    await page.setViewportSize({ width: 760, height: 800 });
    await expect(page.locator(".regex-tester-inspector")).toBeVisible();
    const columns = await page.locator(".regex-tester-workspace").evaluate((element) => getComputedStyle(element).gridTemplateColumns);
    expect(columns.trim().split(/\s+/)).toHaveLength(1);
    const widthUsage = await page.locator(".regex-tester-workspace").evaluate((workspace) => ({
      available: workspace.clientWidth,
      main: workspace.querySelector(".regex-tester-main").getBoundingClientRect().width
    }));
    expect(widthUsage.available - widthUsage.main).toBeLessThanOrEqual(30);

    const closeButton = page.locator('.tab:has-text("Regex-Tester") .tab-close-btn, .tab-item:has-text("Regex-Tester") .tab-close-btn').first();
    if (await closeButton.count()) await closeButton.click();
    await expect(page.locator("#regex-tester-sidebar-panel")).toBeHidden();
    await expect(page.locator("#folder-tree-root")).toBeVisible();
    await rail.click();
    await expect(page.locator(".regex-tester-pattern")).toHaveValue("(?<word>\\w+)");
    await expect(page.locator(".regex-tester-test-string")).toHaveValue("one two");
    await expect(page.locator("#regex-tester-sidebar-panel")).toBeVisible();
    await expect(page.locator("#folder-tree-root")).toBeHidden();
  });

  test("selects highlighted matches when either editor is scrolled to the exact bottom", async ({ page }) => {
    await openApp(page);
    await page.locator(".open-regex-tester").click();
    await page.locator(".regex-tester-engine").selectOption("javascript");
    await page.locator(".regex-tester-pattern").fill("first|last");
    await page.locator(".regex-tester-test-string").fill(["first", ...Array(80).fill("filler"), "last"].join("\n"));
    await expect(page.locator(".regex-tester-status")).toContainText("2 matches");

    const testString = page.locator(".regex-tester-test-string");
    await testString.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    const lastTestMatch = page.locator('.regex-tester-highlight-overlay [data-match-index="1"]');
    const lastTestMatchBounds = await lastTestMatch.boundingBox();
    expect(lastTestMatchBounds).not.toBeNull();
    await page.mouse.click(
      lastTestMatchBounds.x + lastTestMatchBounds.width / 2,
      lastTestMatchBounds.y + lastTestMatchBounds.height / 2
    );
    await expect(page.locator(".regex-tester-match-information")).toContainText("2 of 2");

    await page.locator('.regex-tester-mode[data-mode="replace"]').click();
    await page.locator(".regex-tester-replacement").fill("[$&]");
    await expect(page.locator(".regex-tester-replacement-output")).toHaveValue(/\[last\]$/);
    await page.locator(".regex-tester-previous").click();
    await expect(page.locator(".regex-tester-match-information")).toContainText("1 of 2");
    const replacementOutput = page.locator(".regex-tester-replacement-output");
    await replacementOutput.scrollIntoViewIfNeeded();
    await replacementOutput.evaluate((element) => {
      element.scrollTop = element.scrollHeight;
      element.dispatchEvent(new Event("scroll"));
    });
    const lastReplacement = page.locator('.regex-tester-replacement-highlight-overlay [data-match-index="1"]');
    const lastReplacementBounds = await lastReplacement.boundingBox();
    expect(lastReplacementBounds).not.toBeNull();
    await page.mouse.click(
      lastReplacementBounds.x + lastReplacementBounds.width / 2,
      lastReplacementBounds.y + lastReplacementBounds.height / 2
    );
    await expect(page.locator(".regex-tester-match-information")).toContainText("2 of 2");
  });
});
