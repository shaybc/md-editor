const { expect, test } = require("./desktop-fixture");
const { stubBrowserLibraries, openApp } = require("../helpers/candidate-app-helpers");

test.beforeEach(async ({ page }) => {
  page.errors = [];
  await stubBrowserLibraries(page);
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test("opens an image editor, draws, undoes, and explicitly saves", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);
  await page.waitForTimeout(1000);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 64;
    sourceCanvas.height = 48;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 64, 48);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "paint-test.png", { type: "image/png" });
    const handle = {
      name: "paint-test.png",
      async getFile() { return sourceFile; },
      async createWritable() {
        return {
          async write(blob) { window.__imageEditorSavedBlob = blob; },
          async close() {}
        };
      }
    };
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile,
      handle
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Image Editor");
  await expect(page.locator(".image-editor-status-dimensions")).toHaveText("64 × 48px");
  await expect(page.locator(".image-editor-status-zoom-percent")).toHaveText("100%");
  await expect(page.locator(".image-editor-status-zoom-slider")).toHaveValue("100");
  await expect(page.locator(".image-editor-shell .image-editor-status")).toHaveCount(0);
  await expect(page.locator(".image-editor-toolbar .image-editor-zoom-actions")).toHaveCount(0);
  await expect(page.locator(".image-editor-palette-color")).toHaveCount(20);
  await expect(page.locator('[data-tool="curve"]')).toHaveAttribute('title', 'Curve');
  const toolbarRows = await page.evaluate(() => {
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const undo = rect('[data-action="undo"]');
    const cut = rect('[data-action="cut"]');
    const line = rect('[data-tool="line"]');
    const pencil = rect('[data-tool="pencil"]');
    const select = rect('[data-tool="select"]');
    return { commandsUseTwoRows: cut.top > undo.top, toolsUseTwoRows: pencil.top > line.top, selectSpansRows: select.height > line.height };
  });
  expect(toolbarRows).toEqual({ commandsUseTwoRows: true, toolsUseTwoRows: true, selectSpansRows: true });
  await page.locator(".image-editor-background").evaluate((element) => element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await page.locator('[data-palette-color="#ed1c24"]').click();
  await expect(page.locator(".image-editor-background")).toHaveValue("#ed1c24");
  await expect(page.locator(".image-editor-foreground")).toHaveValue("#111111");
  await page.locator(".image-editor-foreground").evaluate((element) => element.dispatchEvent(new PointerEvent("pointerdown", { bubbles: true })));
  await page.locator('[data-palette-color="#22b14c"]').click();
  await expect(page.locator(".image-editor-foreground")).toHaveValue("#22b14c");
  await expect(page.locator(".image-editor-background")).toHaveValue("#ed1c24");
  await page.locator(".image-editor-status-zoom-slider").fill("125");
  await expect(page.locator(".image-editor-status-zoom-percent")).toHaveText("125%");
  await page.locator(".image-editor-status-zoom-out").click();
  await expect(page.locator(".image-editor-status-zoom-percent")).toHaveText("100%");
  const appZoomBeforeWheel = await page.evaluate(() => window.markdownViewerApp.modules.viewWindowControls.getZoomPercent());
  await page.locator(".image-editor-stage").dispatchEvent("wheel", { ctrlKey: true, deltaY: -100 });
  await expect(page.locator(".image-editor-status-zoom-percent")).toHaveText("125%");
  expect(await page.evaluate(() => window.markdownViewerApp.modules.viewWindowControls.getZoomPercent())).toBe(appZoomBeforeWheel);
  await page.locator(".image-editor-stage").dispatchEvent("wheel", { ctrlKey: true, deltaY: 100 });
  await expect(page.locator(".image-editor-status-zoom-percent")).toHaveText("100%");
  expect(await page.evaluate(() => window.markdownViewerApp.modules.viewWindowControls.getZoomPercent())).toBe(appZoomBeforeWheel);
  const overlay = page.locator(".image-editor-overlay");
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 20, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);
  await expect(page.locator(".image-editor-status-unsaved")).toBeVisible();

  await page.keyboard.press("Control+Z");
  await expect(page.locator(".image-editor-status-unsaved")).toBeHidden();
  await page.locator('[data-tool="curve"]').click();
  await page.mouse.move(box.x + 5, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 30, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-tool="curve"]')).toHaveClass(/active/);
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { phase: controller.curveTool.phase, bends: controller.curveTool.bends.length, hasSelection: controller.selection.hasSelection };
  })).toEqual({ phase: 'awaiting-bend', bends: 0, hasSelection: false });
  await page.mouse.move(box.x + 27, box.y + 30);
  await page.mouse.down();
  await page.mouse.move(box.x + 27, box.y + 10, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { phase: controller.curveTool.phase, bends: controller.curveTool.bends.length };
  })).toEqual({ phase: 'awaiting-bend', bends: 1 });
  const secondBend = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const point = window.MarkdownViewerImageEditor.curvePointAt(controller.curveTool.model, 0.75);
    const canvas = root.querySelector('.image-editor-overlay');
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + point.x * rect.width / canvas.width, y: rect.top + point.y * rect.height / canvas.height };
  });
  await page.mouse.move(secondBend.x, secondBend.y);
  await page.mouse.down();
  await page.mouse.move(secondBend.x + 4, secondBend.y + 15, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('[data-tool="select"]')).toHaveClass(/active/);
  const floatingCurve = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const selection = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).selection;
    return { floating: selection.floating, origin: selection.origin, rect: { ...selection.rect } };
  });
  expect(floatingCurve.floating).toBe(true);
  expect(floatingCurve.origin).toBe('curve');
  await page.locator('.image-editor-foreground').evaluate((element) => {
    element.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    element.value = '#ff0000';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const pixels = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).selection.imageData.data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index + 3] && (pixels[index] !== 255 || pixels[index + 1] !== 0 || pixels[index + 2] !== 0)) return false;
    }
    return true;
  })).toBe(true);
  await page.mouse.move(box.x + floatingCurve.rect.x + floatingCurve.rect.width / 2, box.y + floatingCurve.rect.y + floatingCurve.rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + floatingCurve.rect.x + floatingCurve.rect.width / 2 + 5, box.y + floatingCurve.rect.y + floatingCurve.rect.height / 2 + 3, { steps: 4 });
  await page.mouse.up();
  const movedCurveX = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).selection.rect.x;
  });
  expect(movedCurveX).toBeGreaterThan(floatingCurve.rect.x);
  await page.keyboard.press('Escape');
  const curvePixelCount = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 240 && pixels[index + 1] < 20 && pixels[index + 2] < 20) count += 1;
    }
    return count;
  });
  expect(curvePixelCount).toBeGreaterThan(10);
  await page.keyboard.press("Control+Z");
  await expect(page.locator(".image-editor-status-unsaved")).toBeHidden();
  await page.locator('[data-tool="pencil"]').click();
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 35, box.y + 22, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press("Control+S");

  await expect.poll(() => page.evaluate(() => window.__imageEditorSavedBlob?.type || "")).toBe("image/png");
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
});

test('rounded rectangle adjusts all corners or one corner before commit', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 140, height: 100, name: 'Rounded Rectangle' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();

  await page.locator('[data-tool="rounded-rectangle"]').click();
  await expect(page.locator('.image-editor-rounded-rectangle-controls')).toBeVisible();
  await page.locator('.image-editor-corner-radius').fill('12');
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 120, box.y + 80, { steps: 5 });
  await page.mouse.up();

  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const tool = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).roundedRectangleTool;
    return { phase: tool.phase, radii: tool.model.radii };
  })).toEqual({ phase: 'editing', radii: { topLeft: 12, topRight: 12, bottomRight: 12, bottomLeft: 12 } });

  const guideWidthAtZoom = async (zoom) => page.evaluate((requestedZoom) => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    window.markdownViewerApp.services.imageEditor.setZoom(controller.tab, requestedZoom);
    const point = controller.roundedRectangleTool.getHandlePoint('topRight');
    const context = controller.view.overlayContext;
    const left = Math.max(0, Math.floor(point.x - 10));
    const top = Math.max(0, Math.floor(point.y - 2));
    const width = Math.min(context.canvas.width - left, 21);
    const height = Math.min(context.canvas.height - top, 5);
    const pixels = context.getImageData(left, top, width, height).data;
    const columns = new Set();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (pixels[index + 2] > pixels[index + 1] + 40 && pixels[index + 3] > 20) columns.add(x);
      }
    }
    return columns.size;
  }, zoom);
  const guideWidth100 = await guideWidthAtZoom(1);
  const guideWidth300 = await guideWidthAtZoom(3);
  expect(guideWidth100).toBeLessThanOrEqual(9);
  expect(guideWidth300).toBeLessThan(guideWidth100);
  expect(guideWidth300 * 3).toBeLessThanOrEqual(guideWidth100 + 4);
  await guideWidthAtZoom(1);

  const handleClientPoint = async (corner) => page.evaluate((cornerName) => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const point = controller.roundedRectangleTool.getHandlePoint(cornerName);
    const canvas = root.querySelector('.image-editor-overlay');
    const rect = canvas.getBoundingClientRect();
    return { x: rect.left + point.x * rect.width / canvas.width, y: rect.top + point.y * rect.height / canvas.height };
  }, corner);
  const topLeftHandle = await handleClientPoint('topLeft');
  await page.mouse.move(topLeftHandle.x, topLeftHandle.y);
  await page.mouse.down();
  await page.mouse.move(topLeftHandle.x + 12, topLeftHandle.y, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).roundedRectangleTool.model.radii;
  })).toEqual({ topLeft: 24, topRight: 24, bottomRight: 24, bottomLeft: 24 });

  await page.locator('.image-editor-all-corners').uncheck();
  const bottomRightHandle = await handleClientPoint('bottomRight');
  await page.mouse.move(bottomRightHandle.x, bottomRightHandle.y);
  await page.mouse.down();
  await page.mouse.move(bottomRightHandle.x + 14, bottomRightHandle.y, { steps: 4 });
  await page.mouse.up();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).roundedRectangleTool.model.radii;
  })).toEqual({ topLeft: 24, topRight: 24, bottomRight: 10, bottomLeft: 24 });
  await page.locator('.image-editor-corner-radius').fill('18');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).roundedRectangleTool.model.radii;
  })).toEqual({ topLeft: 24, topRight: 24, bottomRight: 18, bottomLeft: 24 });

  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { tool: controller.state.tool, floating: controller.selection.floating, origin: controller.selection.origin };
  })).toEqual({ tool: 'select', floating: true, origin: 'shape' });
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return false;
    }
    return true;
  })).toBe(true);
  await page.keyboard.press('Escape');
  const committedPixels = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) count += 1;
    }
    return count;
  });
  expect(committedPixels).toBeGreaterThan(20);
  await page.keyboard.press('Control+Z');
  const afterUndoPixels = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) count += 1;
    }
    return count;
  });
  expect(afterUndoPixels).toBe(0);
});

test('rounded callout guide changes tail direction length and attachment shape before placement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 140, height: 120, name: 'Rounded Callout' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).state.cornerRadius = 0;
  });
  await page.locator('[data-tool=callout]').click();
  await expect(page.locator('[data-tool=callout]')).toHaveAttribute('title', 'Rounded rectangular callout');
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 70, { steps: 5 });
  await page.mouse.up();

  const initialModel = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { phase: controller.calloutTool.phase, tool: controller.state.tool, model: controller.calloutTool.model };
  });
  expect(initialModel.phase).toBe('editing');
  expect(initialModel.tool).toBe('callout');
  expect(initialModel.model.side).toBe('bottom');
  expect(initialModel.model.radius).toBeGreaterThanOrEqual(12);
  expect(initialModel.model.tip.y).toBeGreaterThan(initialModel.model.rect.y + initialModel.model.rect.height);
  const initialLength = initialModel.model.tip.y - (initialModel.model.rect.y + initialModel.model.rect.height);
  const initialAttachmentSpan = Math.abs(initialModel.model.attachmentEnd.x - initialModel.model.attachmentStart.x);
  const guideWidthAtZoom = async (zoom) => page.evaluate((requestedZoom) => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    window.markdownViewerApp.services.imageEditor.setZoom(controller.tab, requestedZoom);
    const tip = controller.calloutTool.model.tip;
    const context = controller.view.overlayContext;
    const left = Math.max(0, Math.floor(tip.x - 10));
    const top = Math.max(0, Math.floor(tip.y - 2));
    const width = Math.min(context.canvas.width - left, 21);
    const height = Math.min(context.canvas.height - top, 5);
    const pixels = context.getImageData(left, top, width, height).data;
    const columns = new Set();
    for (let y = 0; y < height; y += 1) {
      for (let x = 0; x < width; x += 1) {
        const index = (y * width + x) * 4;
        if (pixels[index + 2] > pixels[index + 1] + 40 && pixels[index + 3] > 20) columns.add(x);
      }
    }
    return columns.size;
  }, zoom);
  const guideWidth100 = await guideWidthAtZoom(1);
  const guideWidth300 = await guideWidthAtZoom(3);
  expect(guideWidth100).toBeLessThanOrEqual(7);
  expect(guideWidth300).toBeLessThan(guideWidth100);
  expect(guideWidth300 * 3).toBeLessThanOrEqual(guideWidth100 + 4);
  await guideWidthAtZoom(1);

  await page.mouse.move(box.x + initialModel.model.tip.x, box.y + initialModel.model.tip.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 5, box.y + 45, { steps: 5 });
  await page.mouse.up();
  const redirectedModel = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).calloutTool.model;
  });
  expect(redirectedModel.side).toBe('left');
  expect(redirectedModel.tip.x).toBe(5);
  expect(redirectedModel.rect.x - redirectedModel.tip.x).toBeGreaterThan(initialLength);
  expect(redirectedModel.attachmentStart.x).toBe(redirectedModel.rect.x);
  expect(redirectedModel.attachmentEnd.x).toBe(redirectedModel.rect.x);

  await page.mouse.move(box.x + redirectedModel.attachmentStart.x, box.y + redirectedModel.attachmentStart.y);
  await page.mouse.down();
  await page.mouse.move(box.x + redirectedModel.rect.x, box.y + 43, { steps: 3 });
  await page.mouse.up();
  const reshapedModel = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).calloutTool.model;
  });
  const reshapedAttachmentSpan = Math.abs(reshapedModel.attachmentEnd.y - reshapedModel.attachmentStart.y);
  expect(reshapedAttachmentSpan).toBeLessThan(initialAttachmentSpan);

  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { tool: controller.state.tool, floating: controller.selection.floating, origin: controller.selection.origin };
  })).toEqual({ tool: 'select', floating: true, origin: 'shape' });
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return false;
    }
    return true;
  })).toBe(true);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool=callout]')).toHaveClass(/active/);
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    let count = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) count += 1;
    }
    return count;
  })).toBeGreaterThan(80);
  await page.keyboard.press('Control+Z');
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return false;
    }
    return true;
  })).toBe(true);
});

test('triangle tool draws a filled three-point shape and supports undo', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 80, name: 'Triangle' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    context.fillStyle = '#0000ff';
    context.fillRect(5, 5, 45, 70);
  });

  await page.locator('.image-editor-foreground').evaluate((element) => {
    element.value = '#ff0000';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.image-editor-background').evaluate((element) => {
    element.value = '#00ff00';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.image-editor-fill').check();
  await page.locator('[data-tool="triangle"]').click();
  await expect(page.locator('[data-tool="triangle"]')).toHaveClass(/active/);
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 45, box.y + 60, { steps: 5 });
  await page.mouse.up();

  const floatingTriangle = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { tool: controller.state.tool, floating: controller.selection.floating, origin: controller.selection.origin, rect: { ...controller.selection.rect } };
  });
  expect(floatingTriangle).toMatchObject({ tool: 'select', floating: true, origin: 'shape' });
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) =>
    Array.from(canvas.getContext('2d').getImageData(27, 35, 1, 1).data).slice(0, 3))).toEqual([0, 0, 255]);
  await page.mouse.move(box.x + floatingTriangle.rect.x + floatingTriangle.rect.width / 2, box.y + floatingTriangle.rect.y + floatingTriangle.rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + floatingTriangle.rect.x + floatingTriangle.rect.width / 2 + 40, box.y + floatingTriangle.rect.y + floatingTriangle.rect.height / 2, { steps: 6 });
  await page.mouse.up();
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) =>
    Array.from(canvas.getContext('2d').getImageData(27, 35, 1, 1).data).slice(0, 3))).toEqual([0, 0, 255]);
  await page.keyboard.press('Escape');
  const placedPixels = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const read = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { original: read(27, 35), moved: read(67, 35) };
  });
  expect(placedPixels.original).toEqual([0, 0, 255]);
  expect(placedPixels.moved).toEqual([0, 255, 0]);
  await page.keyboard.press('Control+Z');
  const undoPixels = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const read = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { original: read(27, 35), moved: read(67, 35) };
  });
  expect(undoPixels.original).toEqual([0, 0, 255]);
  expect(undoPixels.moved).toEqual([255, 255, 255]);
});

test('diamond and line tools return after each floating shape is placed', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 80, name: 'Diamond' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await page.locator('.image-editor-foreground').evaluate((element) => {
    element.value = '#ff0000';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.image-editor-background').evaluate((element) => {
    element.value = '#00ff00';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await page.locator('.image-editor-fill').check();
  await page.locator('[data-tool=diamond]').click();
  await expect(page.locator('[data-tool=diamond]')).toHaveClass(/active/);
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 50, { steps: 5 });
  await page.mouse.up();

  const floatingDiamond = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { tool: controller.state.tool, floating: controller.selection.floating, origin: controller.selection.origin, rect: { ...controller.selection.rect } };
  });
  expect(floatingDiamond).toMatchObject({ tool: 'select', floating: true, origin: 'shape' });
  await page.mouse.move(box.x + floatingDiamond.rect.x + floatingDiamond.rect.width / 2, box.y + floatingDiamond.rect.y + floatingDiamond.rect.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + floatingDiamond.rect.x + floatingDiamond.rect.width / 2 + 30, box.y + floatingDiamond.rect.y + floatingDiamond.rect.height / 2, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool=diamond]')).toHaveClass(/active/);

  const placedPixels = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const read = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { original: read(30, 30), moved: read(60, 30) };
  });
  expect(placedPixels.original).toEqual([255, 255, 255]);
  expect(placedPixels.moved).toEqual([0, 255, 0]);
  await page.mouse.move(box.x + 5, box.y + 5);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 20, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('[data-tool=select]')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool=diamond]')).toHaveClass(/active/);
  await page.keyboard.press('Control+Z');
  await page.keyboard.press('Control+Z');
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) =>
    Array.from(canvas.getContext('2d').getImageData(60, 30, 1, 1).data).slice(0, 3))).toEqual([255, 255, 255]);

  await page.locator('[data-tool=line]').click();
  await page.mouse.move(box.x + 5, box.y + 65);
  await page.mouse.down();
  await page.mouse.move(box.x + 30, box.y + 65, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('[data-tool=select]')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool=line]')).toHaveClass(/active/);
  await page.mouse.move(box.x + 40, box.y + 65);
  await page.mouse.down();
  await page.mouse.move(box.x + 70, box.y + 65, { steps: 3 });
  await page.mouse.up();
  await expect(page.locator('[data-tool=select]')).toHaveClass(/active/);
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool=line]')).toHaveClass(/active/);
});

test('placing an unfilled shape preserves canvas pixels beneath its transparent interior', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 80, name: 'Transparent Shape' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    context.fillStyle = '#0000ff';
    context.fillRect(0, 0, canvas.width, canvas.height);
  });
  await page.locator('.image-editor-foreground').evaluate((element) => {
    element.value = '#ff0000';
    element.dispatchEvent(new Event('input', { bubbles: true }));
  });
  await expect(page.locator('.image-editor-fill')).not.toBeChecked();
  await page.locator('[data-tool=rectangle]').click();
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 10, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 50, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Escape');

  const placed = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const center = Array.from(context.getImageData(35, 30, 1, 1).data);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let redPixels = 0;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] > 180 && pixels[index + 1] < 80 && pixels[index + 2] < 80 && pixels[index + 3] > 0) redPixels += 1;
    }
    return { center, redPixels };
  });
  expect(placed.center).toEqual([0, 0, 255, 255]);
  expect(placed.redPixels).toBeGreaterThan(20);
});

test('completed polygon becomes a floating selection before placement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: 'Polygon Layer' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await page.locator('[data-tool="polygon"]').click();
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.click(box.x + 10, box.y + 10);
  await page.mouse.click(box.x + 60, box.y + 10);
  await page.mouse.click(box.x + 35, box.y + 45);
  await overlay.dispatchEvent('dblclick');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { tool: controller.state.tool, floating: controller.selection.floating, origin: controller.selection.origin };
  })).toEqual({ tool: 'select', floating: true, origin: 'shape' });
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return false;
    }
    return true;
  })).toBe(true);
  await page.keyboard.press('Escape');
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return true;
    }
    return false;
  })).toBe(true);
});

test("switching between image editor tabs preserves each tab's drawing", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    const first = window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 64, height: 48, name: "First" });
    window.__switchImageTabIds = [first.id];
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind="image-editor"] .image-editor-shell')).toBeVisible();

  async function drawAt(y) {
    await page.locator('.tab-view.active [data-tool="pencil"]').click();
    const overlay = page.locator('.tab-view.active .image-editor-overlay');
    const box = await overlay.boundingBox();
    await page.mouse.move(box.x + 8, box.y + y);
    await page.mouse.down();
    await page.mouse.move(box.x + 20, box.y + y, { steps: 6 });
    await page.mouse.up();
  }

  await drawAt(8);
  await page.evaluate(() => {
    const second = window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 64, height: 48, name: "Second" });
    window.__switchImageTabIds.push(second.id);
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind="image-editor"] .image-editor-shell')).toBeVisible();
  await drawAt(20);

  const pixel = async (tabIndex, x, y) => {
    await page.evaluate((index) => window.markdownViewerApp.modules.tabs.switchTab(window.__switchImageTabIds[index]), tabIndex);
    await expect(page.locator('.tab-view.active[data-tab-view-kind="image-editor"] .image-editor-shell')).toBeVisible();
    return page.locator('.tab-view.active .image-editor-canvas').evaluate((canvas, point) =>
      Array.from(canvas.getContext("2d").getImageData(point.x, point.y, 1, 1).data).slice(0, 3), { x, y });
  };

  expect(await pixel(0, 12, 8)).not.toEqual([255, 255, 255]);
  expect(await pixel(0, 12, 20)).toEqual([255, 255, 255]);
  expect(await pixel(1, 12, 20)).not.toEqual([255, 255, 255]);
  expect(await pixel(1, 12, 8)).toEqual([255, 255, 255]);
  expect(await pixel(0, 12, 8)).not.toEqual([255, 255, 255]);
});

test('pasting clipboard text opens a new editable text box', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 320, height: 180, name: 'Text Paste' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();

  const textInput = page.locator('.tab-view.active .image-editor-text-input');
  await page.evaluate(() => navigator.clipboard.writeText('First paste'));
  await page.keyboard.press('Control+V');
  await expect(textInput).toBeVisible();
  await expect(textInput).toHaveValue('First paste');
  await expect(page.locator('.tab-view.active [data-tool=text]')).toHaveClass(/active/);
  await textInput.evaluate((input) => input.setSelectionRange(5, 5));
  await page.evaluate(() => navigator.clipboard.writeText(' inserted'));
  await page.keyboard.press('Control+V');
  await expect(textInput).toHaveValue('First inserted paste');
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('image-editor-text-input'))).toBe(true);
  const draftSize = await page.evaluate(async () => {
    const tabs = window.markdownViewerApp.modules.tabs;
    return (await window.markdownViewerApp.services.imageEditor.getDraftBinary(tabs.getActiveTab())).byteLength;
  });
  expect(draftSize).toBeGreaterThan(0);
  await expect(textInput).toBeVisible();
  await expect(textInput).toHaveValue('First inserted paste');
  await page.keyboard.press('Control+Enter');
  await expect(textInput).toBeHidden();

  await page.evaluate(() => navigator.clipboard.writeText('Second box'));
  await page.keyboard.press('Control+V');
  await expect(textInput).toBeVisible();
  await expect(textInput).toHaveValue('Second box');
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains('image-editor-text-input'))).toBe(true);
  const origin = await page.evaluate(() => {
    const canvas = document.querySelector('.tab-view.active .image-editor-canvas').getBoundingClientRect();
    const textBox = document.querySelector('.tab-view.active .image-editor-text-box').getBoundingClientRect();
    return { left: Math.round(textBox.left - canvas.left), top: Math.round(textBox.top - canvas.top) };
  });
  expect(origin).toEqual({ left: 0, top: 0 });
});

test('committing pasted text preserves wrapped lines from an unbroken URL', async ({ context, page }) => {
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 420, height: 180, name: 'Wrapped Text Paste' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();

  await page.evaluate(() => navigator.clipboard.writeText('https://www.argaman4u.co.il/checkout/'));
  await page.keyboard.press('Control+V');
  const textInput = page.locator('.tab-view.active .image-editor-text-input');
  await expect(textInput).toHaveValue('https://www.argaman4u.co.il/checkout/');
  const contentRect = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const rect = { x: 12, y: 12, width: 220, height: 100 };
    controller.textRect = rect;
    controller.view.positionTextInput(rect);
    return controller.view.getTextContentRect();
  });
  await page.keyboard.press('Control+Enter');
  await expect(textInput).toBeHidden();

  const hasWrappedLinePixels = await page.locator('.tab-view.active .image-editor-canvas').evaluate((canvas, rect) => {
    const context = canvas.getContext('2d');
    const startY = Math.floor(rect.y + rect.lineHeight);
    const endY = Math.min(canvas.height, Math.ceil(rect.y + rect.lineHeight * 2));
    const startX = Math.floor(rect.x);
    const endX = Math.min(canvas.width, Math.ceil(rect.x + rect.width));
    const pixels = context.getImageData(startX, startY, endX - startX, endY - startY).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return true;
    }
    return false;
  }, contentRect);
  expect(hasWrappedLinePixels).toBe(true);
});

test('duplicating an image editor preserves its live canvas in another image editor', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.__duplicateImageOriginalId = window.markdownViewerApp.modules.tabs
      .openBlankImageEditorInTab({ width: 64, height: 48, name: 'Duplicate Test' }).id;
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();

  await page.locator('.tab-view.active [data-tool=pencil]').click();
  const overlay = page.locator('.tab-view.active .image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 8, box.y + 8);
  await page.mouse.down();
  await page.mouse.move(box.x + 20, box.y + 8, { steps: 6 });
  await page.mouse.up();

  const originalTab = page.locator('#tab-list .tab-item.active');
  await originalTab.dispatchEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 140 });
  await page.locator('.tab-context-menu-action[data-action=duplicate]').evaluate((button) => button.click());

  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await expect(page.locator('#tab-list .tab-item.active')).toContainText('Duplicate Test (copy)');
  const duplicate = await page.evaluate(() => {
    const tab = window.markdownViewerApp.modules.tabs.getActiveTab();
    return { id: tab.id, originalId: window.__duplicateImageOriginalId, type: tab.type, dirty: tab.imageEditorDirty, sourceFilePath: tab.sourceFilePath };
  });
  expect(duplicate.id).not.toBe(duplicate.originalId);
  expect(duplicate).toMatchObject({
    type: 'image-editor',
    dirty: true,
    sourceFilePath: null
  });
  const pixel = await page.locator('.tab-view.active .image-editor-canvas').evaluate((canvas) =>
    Array.from(canvas.getContext('2d').getImageData(12, 8, 1, 1).data).slice(0, 3));
  expect(pixel).not.toEqual([255, 255, 255]);
});
test("text tool creates a dragged text box and moves populated text from its border", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 96;
    sourceCanvas.height = 64;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 96, 64);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "text-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="text"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 12, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 72, box.y + 44, { steps: 5 });
  await page.mouse.up();

  const textInput = page.locator(".image-editor-text-input");
  const textBox = page.locator(".image-editor-text-box");
  await expect(textInput).toBeVisible();
  await expect.poll(() => page.evaluate(() => document.activeElement?.classList.contains("image-editor-text-input") === true)).toBe(true);
  await page.keyboard.type("Hello");
  await expect(textInput).toHaveValue("Hello");
  await page.keyboard.press("Control+A");
  await page.locator(".image-editor-font").selectOption("Georgia");
  await page.locator(".image-editor-font-size").fill("32");
  await page.locator('[data-format="bold"]').click();
  await page.locator(".image-editor-foreground").evaluate((element) => {
    element.value = "#ff0000";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await expect(textInput).toBeVisible();
  await expect(textInput).toHaveValue("Hello");
  await expect.poll(() => textInput.evaluate((element) => getComputedStyle(element).fontFamily.toLowerCase())).toContain("georgia");
  await expect.poll(() => textInput.evaluate((element) => getComputedStyle(element).fontSize)).toBe("32px");
  await expect.poll(() => textInput.evaluate((element) => Number.parseInt(getComputedStyle(element).fontWeight, 10))).toBeGreaterThan(500);
  await expect.poll(() => textInput.evaluate((element) => getComputedStyle(element).color)).toBe("rgb(255, 0, 0)");
  await textInput.focus();
  const beforeMove = await textBox.boundingBox();
  await page.mouse.move(beforeMove.x + 2, beforeMove.y + beforeMove.height / 2);
  await page.mouse.down();
  await page.mouse.move(beforeMove.x + 14, beforeMove.y + beforeMove.height / 2 + 7, { steps: 4 });
  await page.mouse.up();
  await expect(textInput).toHaveValue("Hello");
  await expect.poll(async () => (await textBox.boundingBox()).x).toBeGreaterThan(beforeMove.x + 5);
  const beforeResize = await textBox.boundingBox();
  const resizeHandle = await textBox.locator('[data-text-resize="se"]').boundingBox();
  await page.mouse.move(resizeHandle.x + resizeHandle.width / 2, resizeHandle.y + resizeHandle.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeHandle.x + resizeHandle.width / 2 + 24, resizeHandle.y + resizeHandle.height / 2 + 18, { steps: 4 });
  await page.mouse.up();
  await expect(textInput).toHaveValue("Hello");
  await expect.poll(async () => (await textBox.boundingBox()).width).toBeGreaterThan(beforeResize.width + 10);
  await expect.poll(async () => (await textBox.boundingBox()).height).toBeGreaterThan(beforeResize.height + 8);
  const textContentRect = await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas");
    const textBoxElement = document.querySelector(".image-editor-text-box");
    const textInputElement = document.querySelector(".image-editor-text-input");
    const canvasRect = canvas.getBoundingClientRect();
    const textBoxRect = textBoxElement.getBoundingClientRect();
    const boxStyle = getComputedStyle(textBoxElement);
    const inputStyle = getComputedStyle(textInputElement);
    const scaleX = canvas.width / canvasRect.width;
    const scaleY = canvas.height / canvasRect.height;
    return {
      x: (textBoxRect.left - canvasRect.left) * scaleX + (parseFloat(boxStyle.paddingLeft) + parseFloat(inputStyle.paddingLeft)) * scaleX,
      y: (textBoxRect.top - canvasRect.top) * scaleY + (parseFloat(boxStyle.paddingTop) + parseFloat(inputStyle.paddingTop)) * scaleY
    };
  });
  await page.keyboard.press("Control+Enter");

  await expect(textInput).toBeHidden();
  const committedTextBounds = await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas");
    const data = canvas.getContext("2d").getImageData(0, 0, canvas.width, canvas.height).data;
    let minX = Infinity;
    let minY = Infinity;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const offset = (y * canvas.width + x) * 4;
        if (data[offset] > 180 && data[offset + 1] < 90 && data[offset + 2] < 90 && data[offset + 3] > 0) {
          minX = Math.min(minX, x);
          minY = Math.min(minY, y);
        }
      }
    }
    return { minX, minY };
  });
  expect(committedTextBounds.minX).toBeGreaterThanOrEqual(Math.floor(textContentRect.x) - 1);
  expect(committedTextBounds.minY).toBeGreaterThanOrEqual(Math.floor(textContentRect.y) - 1);
  await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);
});
test("bucket fill recolors both sides of an antialiased curved edge and undo restores it", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 80;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 80);
    sourceContext.strokeStyle = "#a349a4";
    sourceContext.lineWidth = 2;
    sourceContext.beginPath();
    sourceContext.ellipse(40, 40, 20, 20, 0, 0, Math.PI * 2);
    sourceContext.stroke();
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "bucket-fill-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator(".image-editor-foreground").evaluate((element) => {
    element.value = "#a349a4";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.locator('[data-tool="bucket"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const box = await overlay.boundingBox();
  await page.mouse.click(box.x + 40, box.y + 40);

  const inspectCircle = () => page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas");
    const context = canvas.getContext("2d");
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const distanceSquared = (index, color) => {
      const red = data[index] - color[0];
      const green = data[index + 1] - color[1];
      const blue = data[index + 2] - color[2];
      return red * red + green * green + blue * blue;
    };
    let insideWhiteFringe = 0;
    let outsideWhiteFringe = 0;
    let purpleBoundaryPixels = 0;
    for (let y = 0; y < canvas.height; y += 1) {
      for (let x = 0; x < canvas.width; x += 1) {
        const radius = Math.hypot(x + 0.5 - 40, y + 0.5 - 40);
        const index = (y * canvas.width + x) * 4;
        const whiteDistance = distanceSquared(index, [255, 255, 255]);
        const purpleDistance = distanceSquared(index, [163, 73, 164]);
        const grayDistance = distanceSquared(index, [128, 128, 128]);
        if (radius >= 17.5 && radius <= 20.5 && whiteDistance < purpleDistance) insideWhiteFringe += 1;
        if (radius >= 19.5 && radius <= 22.5 && whiteDistance < purpleDistance && whiteDistance < grayDistance) outsideWhiteFringe += 1;
        if (radius >= 19 && radius <= 21 && purpleDistance < whiteDistance && purpleDistance < grayDistance) purpleBoundaryPixels += 1;
      }
    }
    const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { insideWhiteFringe, outsideWhiteFringe, purpleBoundaryPixels, center: pixel(40, 40), outside: pixel(5, 5) };
  });
  const insideFill = await inspectCircle();
  expect(insideFill.insideWhiteFringe).toBe(0);
  expect(insideFill.purpleBoundaryPixels).toBeGreaterThan(80);
  expect(insideFill.center).toEqual([163, 73, 164]);
  expect(insideFill.outside).toEqual([255, 255, 255]);
  await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);

  await page.keyboard.press("Control+Z");
  expect(await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas");
    return Array.from(canvas.getContext("2d").getImageData(40, 40, 1, 1).data).slice(0, 3);
  })).toEqual([255, 255, 255]);

  await page.locator(".image-editor-foreground").evaluate((element) => {
    element.value = "#808080";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  await page.mouse.click(box.x + 5, box.y + 5);
  const outsideFill = await inspectCircle();
  expect(outsideFill.outsideWhiteFringe).toBe(0);
  expect(outsideFill.purpleBoundaryPixels).toBeGreaterThan(80);
  expect(outsideFill.center).toEqual([255, 255, 255]);
  expect(outsideFill.outside).toEqual([128, 128, 128]);
});
test("selection moves with arrows and Ctrl+arrow starts a movable copy", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 70;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 70);
    sourceContext.fillStyle = "#ff0000";
    sourceContext.fillRect(20, 20, 12, 12);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "selection-arrow-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="select"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 20, overlayBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 32, overlayBox.y + 32, { steps: 4 });
  await page.mouse.up();

  await page.keyboard.down("Control");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Control");
  for (let index = 0; index < 15; index += 1) await page.keyboard.press("ArrowRight");
  for (let index = 0; index < 15; index += 1) await page.keyboard.press("ArrowDown");

  const beforeCommitPixels = await page.evaluate(() => {
    function pixel(selector, x, y) {
      const canvas = document.querySelector(selector);
      return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data);
    }
    return {
      original: pixel(".image-editor-canvas", 20, 20),
      canvasCopyTarget: pixel(".image-editor-canvas", 40, 40),
      overlayCopyTarget: pixel(".image-editor-overlay", 40, 40)
    };
  });
  expect(beforeCommitPixels.original.slice(0, 3)).toEqual([255, 0, 0]);
  expect(beforeCommitPixels.canvasCopyTarget.slice(0, 3)).toEqual([255, 255, 255]);
  expect(beforeCommitPixels.overlayCopyTarget.slice(0, 3)).toEqual([255, 0, 0]);

  await page.locator('[data-tool="pencil"]').click();
  const afterCommitPixels = await page.evaluate(() => {
    function pixel(selector, x, y) {
      const canvas = document.querySelector(selector);
      return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data);
    }
    return {
      original: pixel(".image-editor-canvas", 20, 20),
      copyTarget: pixel(".image-editor-canvas", 40, 40)
    };
  });
  expect(afterCommitPixels.original.slice(0, 3)).toEqual([255, 0, 0]);
  expect(afterCommitPixels.copyTarget.slice(0, 3)).toEqual([255, 0, 0]);
});
test("selection pointer drag moves, Ctrl clones, and Shift stamps canvas content", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 70;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 70);
    sourceContext.fillStyle = "#00ff00";
    sourceContext.fillRect(20, 20, 4, 4);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "selection-pointer-modifiers-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="select"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const box = await overlay.boundingBox();
  const drag = async (fromX, fromY, toX, toY) => {
    await page.mouse.move(box.x + fromX, box.y + fromY);
    await page.mouse.down();
    await page.mouse.move(box.x + toX, box.y + toY, { steps: 5 });
    await page.mouse.up();
  };

  await drag(20, 20, 24, 24);
  await drag(22, 22, 32, 22);
  let pixels = await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas").getContext("2d");
    const overlay = document.querySelector(".image-editor-overlay").getContext("2d");
    const pixel = (context, x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { source: pixel(canvas, 20, 20), baseTarget: pixel(canvas, 31, 21), floatingTarget: pixel(overlay, 31, 21) };
  });
  expect(pixels).toEqual({ source: [255, 255, 255], baseTarget: [255, 255, 255], floatingTarget: [0, 255, 0] });

  await page.mouse.click(box.x + 70, box.y + 60);
  await drag(30, 20, 34, 24);

  await page.keyboard.down("Control");
  await drag(32, 22, 42, 22);
  await page.keyboard.up("Control");
  pixels = await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas").getContext("2d");
    const overlay = document.querySelector(".image-editor-overlay").getContext("2d");
    const pixel = (context, x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { original: pixel(canvas, 31, 21), baseTarget: pixel(canvas, 41, 21), floatingTarget: pixel(overlay, 41, 21) };
  });
  expect(pixels).toEqual({ original: [0, 255, 0], baseTarget: [255, 255, 255], floatingTarget: [0, 255, 0] });

  await page.mouse.click(box.x + 70, box.y + 60);
  await drag(40, 20, 44, 24);
  await page.keyboard.down("Shift");
  await drag(42, 22, 52, 22);
  await page.keyboard.up("Shift");
  pixels = await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas").getContext("2d");
    const pixel = (x, y) => Array.from(canvas.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { original: pixel(40, 20), trail: pixel(45, 20), finalStamp: pixel(50, 20) };
  });
  expect(pixels).toEqual({ original: [0, 255, 0], trail: [0, 255, 0], finalStamp: [0, 255, 0] });
});
test("clicking outside a floating selection commits it and clears the selection", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 70;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 70);
    sourceContext.fillStyle = "#ff0000";
    sourceContext.fillRect(20, 20, 8, 8);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "selection-dismiss-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="select"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 20, overlayBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 28, overlayBox.y + 28, { steps: 4 });
  await page.mouse.up();

  await page.keyboard.down("Control");
  await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Control");
  for (let index = 0; index < 12; index += 1) await page.keyboard.press("ArrowRight");

  await page.mouse.click(overlayBox.x + 60, overlayBox.y + 50);

  const result = await page.evaluate(() => {
    function pixel(selector, x, y) {
      const canvas = document.querySelector(selector);
      return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data).slice(0, 4);
    }
    const overlay = document.querySelector(".image-editor-overlay");
    const overlayData = overlay.getContext("2d").getImageData(0, 0, overlay.width, overlay.height).data;
    let overlayAlpha = 0;
    for (let index = 3; index < overlayData.length; index += 4) overlayAlpha += overlayData[index];
    return {
      original: pixel(".image-editor-canvas", 20, 20),
      committedCopy: pixel(".image-editor-canvas", 33, 20),
      overlayAlpha
    };
  });
  expect(result.original.slice(0, 3)).toEqual([255, 0, 0]);
  expect(result.committedCopy.slice(0, 3)).toEqual([255, 0, 0]);
  expect(result.overlayAlpha).toBe(0);
});
test("dragging a pasted floating selection does not alter canvas underneath until placed", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 70;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 70);
    sourceContext.fillStyle = "#00ff00";
    sourceContext.fillRect(0, 0, 8, 8);
    sourceContext.fillStyle = "#0000ff";
    sourceContext.fillRect(20, 20, 8, 8);
    sourceContext.fillStyle = "#ff0000";
    sourceContext.fillRect(20, 8, 8, 8);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "floating-paste-drag-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="select"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 20, overlayBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 28, overlayBox.y + 28, { steps: 4 });
  await page.mouse.up();
  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async write() {},
        async writeText() {},
        read() {
          return new Promise((resolve) => { window.__resolvePendingImagePaste = resolve; });
        }
      }
    });
  });
  await page.keyboard.press("Control+C");
  await overlay.evaluate((element) => element.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: new DataTransfer()
  })));
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).selection.isPasting;
  })).toBe(true);

  await page.mouse.move(overlayBox.x + 22, overlayBox.y + 22);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 42, overlayBox.y + 42, { steps: 6 });
  await page.mouse.up();
  const whilePastePending = await page.evaluate(() => {
    const canvas = document.querySelector(".image-editor-canvas");
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const selection = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).selection;
    return {
      sourcePixel: Array.from(canvas.getContext("2d").getImageData(20, 20, 1, 1).data).slice(0, 3),
      isPasting: selection.isPasting,
      hasSelection: selection.hasSelection
    };
  });
  expect(whilePastePending).toEqual({ sourcePixel: [0, 0, 255], isPasting: true, hasSelection: false });
  await page.evaluate(() => window.__resolvePendingImagePaste([]));
  await expect.poll(() => page.evaluate(() => {
    const overlay = document.querySelector(".image-editor-overlay");
    return Array.from(overlay.getContext("2d").getImageData(4, 4, 1, 1).data).slice(0, 3);
  })).toEqual([0, 0, 255]);
  const pastedSelection = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { rect: { ...controller.selection.rect }, floating: controller.selection.floating };
  });
  expect(pastedSelection).toEqual({ rect: { x: 0, y: 0, width: 8, height: 8 }, floating: true });
  const afterDraftCapture = await page.evaluate(async () => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const imageEditor = window.markdownViewerApp.services.imageEditor;
    const controller = imageEditor.getView(root.dataset.tabId);
    const draftBytes = await imageEditor.getDraftBinary(controller.tab);
    const draftBitmap = await createImageBitmap(new Blob([draftBytes], { type: "image/png" }));
    const draftCanvas = document.createElement("canvas");
    draftCanvas.width = draftBitmap.width;
    draftCanvas.height = draftBitmap.height;
    draftCanvas.getContext("2d").drawImage(draftBitmap, 0, 0);
    draftBitmap.close?.();
    const canvas = document.querySelector(".image-editor-canvas");
    return {
      floating: controller.selection.floating,
      sourcePixel: Array.from(canvas.getContext("2d").getImageData(20, 20, 1, 1).data).slice(0, 3),
      draftPastePixel: Array.from(draftCanvas.getContext("2d").getImageData(4, 4, 1, 1).data).slice(0, 3)
    };
  });
  expect(afterDraftCapture).toEqual({ floating: true, sourcePixel: [0, 0, 255], draftPastePixel: [0, 0, 255] });
  await page.locator('[data-tool="select"]').click();

  await page.mouse.move(overlayBox.x + 4, overlayBox.y + 4);
  await page.keyboard.down("Control");
  await page.mouse.down();
  const selectionAfterPointerDown = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { hasSelection: controller.selection.hasSelection, moving: controller.selection.isMoving };
  });
  expect(selectionAfterPointerDown).toEqual({ hasSelection: true, moving: true });
  await page.mouse.move(overlayBox.x + 24, overlayBox.y + 12, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Control");

  await page.mouse.move(overlayBox.x + 24, overlayBox.y + 12);
  await page.keyboard.down("Shift");
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 34, overlayBox.y + 22, { steps: 6 });
  await page.mouse.up();
  await page.keyboard.up("Shift");

  const afterDrag = await page.evaluate(() => {
    function pixel(selector, x, y) {
      const canvas = document.querySelector(selector);
      return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data).slice(0, 3);
    }
    const overlay = document.querySelector(".image-editor-overlay");
    const overlayData = overlay.getContext("2d").getImageData(0, 0, overlay.width, overlay.height).data;
    let overlayBluePoint = null;
    for (let y = 0; y < overlay.height && !overlayBluePoint; y += 1) {
      for (let x = 0; x < overlay.width; x += 1) {
        const index = (y * overlay.width + x) * 4;
        if (overlayData[index] === 0 && overlayData[index + 1] === 0 && overlayData[index + 2] === 255 && overlayData[index + 3] > 0) {
          overlayBluePoint = { x, y };
          break;
        }
      }
    }
    return {
      canvasStart: pixel(".image-editor-canvas", 4, 4),
      canvasUnderFloatingCopy: pixel(".image-editor-canvas", 24, 12),
      canvasUnderShiftMovedCopy: pixel(".image-editor-canvas", 34, 22),
      overlayBluePoint
    };
  });
  expect(afterDrag.canvasStart).toEqual([0, 255, 0]);
  expect(afterDrag.canvasUnderFloatingCopy).toEqual([255, 0, 0]);
  expect(afterDrag.canvasUnderShiftMovedCopy).toEqual([255, 255, 255]);
  expect(afterDrag.overlayBluePoint).not.toBeNull();

  await page.mouse.move(overlayBox.x + 60, overlayBox.y + 50);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 70, overlayBox.y + 60, { steps: 4 });
  await page.mouse.up();
  const afterPlace = await page.evaluate((point) => {
    const canvas = document.querySelector(".image-editor-canvas");
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return {
      pixel: Array.from(canvas.getContext("2d").getImageData(point.x, point.y, 1, 1).data).slice(0, 3),
      hasSelection: controller.selection.hasSelection
    };
  }, afterDrag.overlayBluePoint);
  expect(afterPlace).toEqual({ pixel: [0, 0, 255], hasSelection: false });
});
test("selection keyboard shortcuts copy paste and Escape place floating selections", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 70;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 70);
    sourceContext.fillStyle = "#0000ff";
    sourceContext.fillRect(20, 20, 8, 8);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "selection-keyboard-shortcuts-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="select"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 20, overlayBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 28, overlayBox.y + 28, { steps: 4 });
  await page.mouse.up();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { async write() {}, async writeText() {}, async read() { throw new Error("Use in-app clipboard fallback"); } }
    });
  });
  await page.keyboard.press("Control+C");
  await overlay.evaluate((element) => element.dispatchEvent(new ClipboardEvent('paste', {
    bubbles: true,
    cancelable: true,
    clipboardData: new DataTransfer()
  })));
  const pastedOverlay = await page.evaluate(() => {
    const overlay = document.querySelector(".image-editor-overlay");
    return Array.from(overlay.getContext("2d").getImageData(4, 4, 1, 1).data).slice(0, 3);
  });
  expect(pastedOverlay).toEqual([0, 0, 255]);

  for (let index = 0; index < 8; index += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.press("Escape");

  const afterEscape = await page.evaluate(() => {
    function pixel(selector, x, y) {
      const canvas = document.querySelector(selector);
      return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data).slice(0, 4);
    }
    const overlay = document.querySelector(".image-editor-overlay");
    const overlayData = overlay.getContext("2d").getImageData(0, 0, overlay.width, overlay.height).data;
    let overlayAlpha = 0;
    for (let index = 3; index < overlayData.length; index += 4) overlayAlpha += overlayData[index];
    return {
      original: pixel(".image-editor-canvas", 20, 20),
      placedCopyTarget: pixel(".image-editor-canvas", 12, 4),
      overlayAlpha
    };
  });
  expect(afterEscape.original.slice(0, 3)).toEqual([0, 0, 255]);
  expect(afterEscape.placedCopyTarget.slice(0, 3)).toEqual([0, 0, 255]);
  expect(afterEscape.overlayAlpha).toBe(0);
});
test("selection stamps repeated copies with Shift+arrow", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openImageEditorInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 80;
    sourceCanvas.height = 70;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 80, 70);
    sourceContext.fillStyle = "#00ff00";
    sourceContext.fillRect(20, 20, 4, 4);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "selection-stamp-test.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openImageEditorInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".image-editor-shell")).toBeVisible();
  await page.locator('[data-tool="select"]').click();
  const overlay = page.locator(".image-editor-overlay");
  const overlayBox = await overlay.boundingBox();
  await page.mouse.move(overlayBox.x + 20, overlayBox.y + 20);
  await page.mouse.down();
  await page.mouse.move(overlayBox.x + 24, overlayBox.y + 24, { steps: 4 });
  await page.mouse.up();

  await page.keyboard.down("Shift");
  for (let index = 0; index < 8; index += 1) await page.keyboard.press("ArrowRight");
  await page.keyboard.up("Shift");

  const pixels = await page.evaluate(() => {
    function pixel(x, y) {
      const canvas = document.querySelector(".image-editor-canvas");
      return Array.from(canvas.getContext("2d").getImageData(x, y, 1, 1).data).slice(0, 3);
    }
    return {
      original: pixel(20, 20),
      firstStamp: pixel(21, 20),
      laterStamp: pixel(28, 20)
    };
  });
  expect(pixels.original).toEqual([0, 255, 0]);
  expect(pixels.firstStamp).toEqual([0, 255, 0]);
  expect(pixels.laterStamp).toEqual([0, 255, 0]);
});
test("image preview zooms beyond 100 percent and supports drag panning", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openFilePreviewInTab);
  expect(page.errors).toEqual([]);

  await page.evaluate(async () => {
    const sourceCanvas = document.createElement("canvas");
    sourceCanvas.width = 1200;
    sourceCanvas.height = 820;
    const sourceContext = sourceCanvas.getContext("2d");
    sourceContext.fillStyle = "#ffffff";
    sourceContext.fillRect(0, 0, 1200, 820);
    sourceContext.fillStyle = "#7f1db3";
    sourceContext.fillRect(1100, 720, 80, 80);
    const sourceBlob = await new Promise((resolve) => sourceCanvas.toBlob(resolve, "image/png"));
    const sourceFile = new File([sourceBlob], "preview-pan.png", { type: "image/png" });
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openFilePreviewInTab({
      name: sourceFile.name,
      type: sourceFile.type,
      mimeType: sourceFile.type,
      file: sourceFile
    });
  });

  await expect(page.locator(".file-preview-viewer")).toBeVisible();
  const image = page.locator("img.file-preview-content");
  await expect(image).toBeVisible();
  const naturalWidth = await image.evaluate((element) => element.naturalWidth);
  const zoomIn = page.locator('.image-preview-floating-toolbar [data-action="zoom-in"]');
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();
  await zoomIn.click();

  await expect.poll(() => image.evaluate((element) => Math.round(element.getBoundingClientRect().width))).toBeGreaterThan(naturalWidth);
  const stage = page.locator(".file-preview-stage");
  const before = await stage.evaluate((element) => {
    element.scrollLeft = 0;
    element.scrollTop = 0;
    return { left: element.scrollLeft, top: element.scrollTop, width: element.scrollWidth, clientWidth: element.clientWidth };
  });
  expect(before.width).toBeGreaterThan(before.clientWidth);
  const box = await stage.boundingBox();
  await page.mouse.move(box.x + box.width * 0.75, box.y + box.height * 0.6);
  await page.mouse.down();
  await page.mouse.move(box.x + box.width * 0.35, box.y + box.height * 0.35, { steps: 8 });
  await page.mouse.up();

  await expect.poll(() => stage.evaluate((element) => element.scrollLeft)).toBeGreaterThan(before.left);
});
