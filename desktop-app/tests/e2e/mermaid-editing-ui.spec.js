const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect } = require("./desktop-fixture");
const { openApp, openDesktopFolder, codeMirrorDocText, selectViewMode } = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");

async function openDiagram(page, folder, name, index = 0) {
  await openApp(page);
  await openDesktopFolder(page, folder);
  await page.locator(`.folder-tree-file[data-path='${name}']`).click();
  const source = await fs.readFile(path.join(folder, name), "utf8");
  await expect.poll(() => codeMirrorDocText(page)).toBe(source);
  await selectViewMode(page, "split");
  const container = page.locator(".tab-view.active .mermaid-container").nth(index);
  await expect(container.locator("svg")).toBeVisible({ timeout: 15000 });
  await container.locator('button[title="Zoom diagram"]').click();
  await expect(page.locator("#mermaid-modal-edit")).toBeEnabled();
}

test("fullscreen MMD editing keeps a draft, saves label source and file, and supports one-step undo", async ({ page }, testInfo) => {
  const initial = 'flowchart LR\n A[Same] --> B[Same]\n style A fill:#fff\n';
  const folder = await createWorkspaceTree({ "workflow.mmd": initial });
  try {
    await openDiagram(page, folder, "workflow.mmd");
    const node = page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]');
    await expect(node).toHaveAttribute("data-mermaid-source-start", String(initial.indexOf("Same")));
    await page.locator("#mermaid-modal-edit").click();
    await expect(page.locator("#mermaid-modal-select-text")).toBeDisabled();
    await page.locator("#mermaid-modal-zoom-in").click();
    await node.click();
    const input = page.locator("#mermaid-modal-label-text");
    await expect(input).toHaveValue("Same");
    await input.fill('Review "input" & שלום\nNext');
    await page.screenshot({ path: testInfo.outputPath("label-editor.png") });
    const bounds = await input.boundingBox();
    expect(bounds.x).toBeGreaterThanOrEqual(0);
    expect(bounds.y).toBeGreaterThanOrEqual(0);
    await page.locator("#mermaid-modal-apply-label").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toContainText("Draft updated");
    expect(await codeMirrorDocText(page)).toBe(initial);
    expect(await fs.readFile(path.join(folder, "workflow.mmd"), "utf8")).toBe(initial);
    await page.locator("#mermaid-modal-save").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toContainText("saved");
    const updated = initial.replace("A[Same]", 'A["Review #34;input#34; #38; שלום<br/>Next"]');
    await expect.poll(() => codeMirrorDocText(page)).toBe(updated);
    await expect.poll(() => fs.readFile(path.join(folder, "workflow.mmd"), "utf8")).toBe(updated);
    await expect(page.locator("#mermaid-modal-edit")).toBeEnabled();
    await page.locator("#mermaid-modal-edit").click();
    await node.click();
    await expect(input).toHaveValue('Review "input" & שלום\nNext');
    await page.locator("#mermaid-modal-cancel-label").click();
    await page.locator("#mermaid-modal-cancel-edit").click();
    await page.locator("#mermaid-modal-close").click();
    await selectViewMode(page, "editor");
    await page.locator(".tab-view.active .codemirror-editor .cm-content").click();
    await page.keyboard.press("Control+z");
    await expect.poll(() => codeMirrorDocText(page)).toBe(initial);
    await page.keyboard.press("Control+y");
    await expect.poll(() => codeMirrorDocText(page)).toBe(updated);
  } finally { await removeTempWorkspace(folder); }
});

test("pan and text selection remain distinct and the 15x zoom limit is preserved", async ({ page }) => {
  const folder = await createWorkspaceTree({ "pan.mmd": 'flowchart LR\n A[Alpha label] --> B[Beta label]' });
  try {
    await openDiagram(page, folder, "pan.mmd");
    const label = page.locator('#mermaid-modal-diagram [data-mermaid-component="A"] .nodeLabel');
    const svg = page.locator("#mermaid-modal-diagram > svg");
    let rect = await label.boundingBox();
    await page.mouse.move(rect.x + 5, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + 55, rect.y + rect.height / 2 + 20, { steps: 5 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection().toString())).toBe("");
    await expect(svg).toHaveAttribute("style", /translate\(50px, 20px\)/);
    await page.locator("#mermaid-modal-select-text").click();
    await expect(label).toHaveCSS("user-select", "text");
    const transform = await svg.getAttribute("style");
    rect = await label.boundingBox();
    await page.mouse.move(rect.x + 2, rect.y + rect.height / 2);
    await page.mouse.down();
    await page.mouse.move(rect.x + rect.width - 2, rect.y + rect.height / 2, { steps: 10 });
    await page.mouse.up();
    expect(await page.evaluate(() => window.getSelection().toString())).not.toBe("");
    expect(await svg.getAttribute("style")).toBe(transform);
    await page.locator("#mermaid-modal-select-text").click();
    await expect(label).toHaveCSS("user-select", "none");
    await page.evaluate(() => {
      for (let i = 0; i < 80; i++) document.getElementById("mermaid-modal-zoom-in").click();
    });
    await expect(svg).toHaveAttribute("style", /scale\(15\)/);
    await page.locator("#mermaid-modal-zoom-reset").click();
    await expect(svg).toHaveAttribute("style", /translate\(0px, 0px\) scale\(1\)/);
  } finally { await removeTempWorkspace(folder); }
});

test("file save errors keep the draft open and can be retried", async ({ page }) => {
  const initial = 'flowchart LR\n A[Original] --> B';
  const folder = await createWorkspaceTree({ "retry.mmd": initial });
  try {
    await openDiagram(page, folder, "retry.mmd");
    await page.evaluate(() => {
      const original = Neutralino.filesystem.writeFile;
      let failed = false;
      Neutralino.filesystem.writeFile = async function(...args) {
        if (String(args[0]).endsWith("retry.mmd") && !failed) { failed = true; throw new Error("Test write failure"); }
        return original.apply(this, args);
      };
    });
    await page.locator("#mermaid-modal-edit").click();
    await page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]').click();
    await page.locator("#mermaid-modal-label-text").fill("Retried");
    await page.locator("#mermaid-modal-save").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toContainText("file was not saved");
    const expected = initial.replace('[Original]', '["Retried"]');
    expect(await codeMirrorDocText(page)).toBe(expected);
    expect(await fs.readFile(path.join(folder, "retry.mmd"), "utf8")).toBe(initial);
    await expect(page.locator("#mermaid-modal-save")).toBeEnabled();
    await page.locator("#mermaid-modal-save").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toHaveText("Diagram saved.");
    await expect.poll(() => fs.readFile(path.join(folder, "retry.mmd"), "utf8")).toBe(expected);
  } finally { await removeTempWorkspace(folder); }
});

test("source changes during a draft are rejected without overwriting the document", async ({ page }) => {
  const initial = 'flowchart LR\n A[Original] --> B';
  const folder = await createWorkspaceTree({ "stale.mmd": initial });
  try {
    await openDiagram(page, folder, "stale.mmd");
    await page.locator("#mermaid-modal-edit").click();
    await page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]').click();
    await page.locator("#mermaid-modal-label-text").fill("Draft");
    const external = initial + '\n%% External change';
    await page.evaluate(source => {
      const commands = window.markdownViewerApp.modules.activeEditorCommands;
      commands.replaceActiveEditorRange(0, commands.getActiveEditorValue().length, source);
    }, external);
    await page.locator("#mermaid-modal-save").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toContainText("source document changed");
    expect(await codeMirrorDocText(page)).toBe(external);
    expect(await fs.readFile(path.join(folder, "stale.mmd"), "utf8")).toBe(initial);
  } finally { await removeTempWorkspace(folder); }
});

test("Cancel discards drafts and Save edits only the selected Mermaid fence", async ({ page }) => {
  const block = '```mermaid\nflowchart LR\n A[Same] --> B[Same]\n```';
  const initial = '# Before\n' + block + '\nBetween\n' + block + '\n# After\n';
  const folder = await createWorkspaceTree({ "diagrams.md": initial });
  try {
    await openDiagram(page, folder, "diagrams.md", 1);
    await page.locator("#mermaid-modal-edit").click();
    await page.locator('#mermaid-modal-diagram [data-mermaid-component="B"]').click();
    await page.locator("#mermaid-modal-label-text").fill("Discard me");
    await page.locator("#mermaid-modal-apply-label").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toContainText("Draft updated");
    await page.locator("#mermaid-modal-cancel-edit").click();
    await expect(page.locator("#app-notification-modal")).toBeVisible();
    await page.locator("#app-notification-actions button").last().click();
    await expect(page.locator("#mermaid-modal-edit")).toBeVisible();
    expect(await codeMirrorDocText(page)).toBe(initial);
    await expect(page.locator('#mermaid-modal-diagram [data-mermaid-component="B"]')).toContainText("Same");
    await page.locator("#mermaid-modal-edit").click();
    await page.locator('#mermaid-modal-diagram [data-mermaid-component="B"]').click();
    await page.locator("#mermaid-modal-label-text").fill("Second only");
    // Saving directly from the text field also applies its pending label.
    await page.locator("#mermaid-modal-save").click();
    const expected = initial.slice(0, initial.lastIndexOf(block)) + block.replace('B[Same]', 'B["Second only"]') + '\n# After\n';
    await expect.poll(() => codeMirrorDocText(page)).toBe(expected);
    await expect.poll(() => fs.readFile(path.join(folder, "diagrams.md"), "utf8")).toBe(expected);
  } finally { await removeTempWorkspace(folder); }
});

test("SVG text labels edit as literal text and non-flowcharts remain viewable but read-only", async ({ page }) => {
  const initial = '%%{init: {"htmlLabels": false, "flowchart": {"htmlLabels": false}}}%%\nflowchart LR\n A[Original] --> B';
  const folder = await createWorkspaceTree({ "text.mermaid": initial, "sequence.mmd": 'sequenceDiagram\n Alice->>Bob: Hello' });
  try {
    await openDiagram(page, folder, "text.mermaid");
    await expect(page.locator('#mermaid-modal-diagram [data-mermaid-component="A"] text')).toHaveCount(1);
    await page.locator("#mermaid-modal-edit").click();
    await page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]').click();
    const text = '<b>Literal</b> &quot; #';
    await page.locator("#mermaid-modal-label-text").fill(text);
    await page.locator("#mermaid-modal-save").click();
    await expect(page.locator("#mermaid-modal-edit-status")).toHaveText("Diagram saved.");
    await expect(page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]')).toContainText(text);
    await page.locator("#mermaid-modal-close").click();
    await expect(page.locator("#mermaid-zoom-modal")).not.toBeVisible();
    await page.locator('.tab-view.active .mermaid-container button[title="Zoom diagram"]').click();
    await expect(page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]')).toContainText(text);
    await page.locator("#mermaid-modal-edit").click();
    await page.locator('#mermaid-modal-diagram [data-mermaid-component="A"]').click();
    await expect(page.locator("#mermaid-modal-label-text")).toHaveValue(text);
    await page.locator("#mermaid-modal-cancel-label").click();
    await page.locator("#mermaid-modal-cancel-edit").click();
    await page.locator("#mermaid-modal-close").click();
    await page.locator(".folder-tree-file[data-path='sequence.mmd']").click();
    await expect.poll(() => codeMirrorDocText(page)).toContain("sequenceDiagram");
    await selectViewMode(page, "split");
    const container = page.locator(".tab-view.active .mermaid-container");
    await expect(container.locator("svg")).toBeVisible();
    await container.locator('button[title="Zoom diagram"]').click();
    await expect(page.locator("#mermaid-modal-edit")).toBeDisabled();
    await expect(page.locator("#mermaid-modal-diagram svg")).toBeVisible();
  } finally { await removeTempWorkspace(folder); }
});
