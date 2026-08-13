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

test("File New Image configures preset, manual, solid, and transparent canvases", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.newImageDialog, null, { timeout: 60000 });
  const fileCategory = page.locator("#desktop-application-menu .application-menu-file");
  const newSubmenu = fileCategory.locator(".new-file-submenu");
  const openNewImageDialog = async () => {
    await fileCategory.locator("> .application-menu-category-toggle").click();
    await newSubmenu.locator("> .dropdown-toggle").hover();
    await newSubmenu.locator(".open-image-editor-tool").click();
  };
  await openNewImageDialog();

  const modal = page.locator("#new-image-modal");
  await expect(modal).toBeVisible();
  await expect(modal.locator("[data-new-image-template]")).toHaveCount(10);
  await expect(modal.locator('[data-new-image-template="screen-full-hd"]')).toHaveAttribute("aria-pressed", "true");
  await expect(modal.getByText("Color Mode")).toHaveCount(0);
  await expect(modal.getByText("Advanced Options")).toHaveCount(0);
  await expect(modal.locator('[role="tab"]')).toHaveCount(0);

  await modal.locator('[data-new-image-template="icon"]').click();
  await expect(modal.locator("#new-image-width")).toHaveValue("512");
  await expect(modal.locator("#new-image-height")).toHaveValue("512");
  await modal.locator("#new-image-background").selectOption("custom");
  await modal.locator("#new-image-custom-color").fill("#123456");
  await modal.locator("[data-new-image-create]").click();

  let root = page.locator('.tab-view.active[data-tab-view-kind="image-editor"]');
  await expect(root.locator(".image-editor-canvas")).toHaveAttribute("width", "512");
  await expect(root.locator(".image-editor-canvas")).toHaveAttribute("height", "512");
  expect(await root.locator(".image-editor-canvas").evaluate((canvas) => ({
    pixel: Array.from(canvas.getContext("2d").getImageData(500, 500, 1, 1).data),
    background: window.markdownViewerApp.services.imageEditor.getView(canvas.closest("[data-tab-id]").dataset.tabId).documentStore.document.canvas.backgroundColor
  }))).toEqual({ pixel: [18, 52, 86, 255], background: "#123456" });

  const tabCount = await page.locator("#tab-list .tab-item").count();
  await openNewImageDialog();
  await modal.locator("#new-image-width").fill("40");
  await modal.locator("#new-image-height").fill("30");
  await modal.locator("[data-new-image-create]").click();
  root = page.locator('.tab-view.active[data-tab-view-kind="image-editor"]');
  await expect(root.locator(".image-editor-canvas")).toHaveAttribute("width", "40");
  await expect(root.locator(".image-editor-canvas")).toHaveAttribute("height", "30");
  expect(await root.locator(".image-editor-canvas").evaluate((canvas) => Array.from(canvas.getContext("2d").getImageData(5, 5, 1, 1).data))).toEqual([0, 0, 0, 0]);

  const resizeHandle = root.locator('[data-canvas-resize="se"]');
  const handleBox = await resizeHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 10, handleBox.y + handleBox.height / 2 + 10, { steps: 4 });
  await page.mouse.up();
  await expect(root.locator(".image-editor-canvas")).toHaveAttribute("width", "50");
  await expect(root.locator(".image-editor-canvas")).toHaveAttribute("height", "40");
  expect(await root.locator(".image-editor-canvas").evaluate((canvas) => Array.from(canvas.getContext("2d").getImageData(45, 35, 1, 1).data))).toEqual([0, 0, 0, 0]);

  await openNewImageDialog();
  await page.keyboard.press("Escape");
  await expect(modal).toBeHidden();
  await expect(page.locator("#tab-list .tab-item")).toHaveCount(tabCount + 1);
});

test("New Image uses clipboard dimensions without overriding manual input", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.newImageDialog, null, { timeout: 60000 });
  await page.evaluate(async () => {
    const canvas = document.createElement("canvas");
    canvas.width = 37;
    canvas.height = 23;
    window.__newImageClipboardBlob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        async read() {
          return [{ types: ["image/png"], async getType() { return window.__newImageClipboardBlob; } }];
        }
      }
    });
    window.markdownViewerApp.modules.newImageDialog.open();
  });

  const modal = page.locator("#new-image-modal");
  const clipboardCard = modal.locator('[data-new-image-template="clipboard"]');
  await expect(clipboardCard).toBeEnabled();
  await expect(clipboardCard).toHaveAttribute("aria-pressed", "true");
  await expect(modal.locator("#new-image-width")).toHaveValue("37");
  await expect(modal.locator("#new-image-height")).toHaveValue("23");
  await modal.locator("[data-new-image-cancel]").last().click();

  await page.evaluate(() => {
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        read() {
          return new Promise((resolve) => {
            window.__resolveNewImageClipboard = () => resolve([
              { types: ["image/png"], async getType() { return window.__newImageClipboardBlob; } }
            ]);
          });
        }
      }
    });
    window.markdownViewerApp.modules.newImageDialog.open();
  });
  await modal.locator("#new-image-width").fill("77");
  await modal.locator("#new-image-height").fill("55");
  await page.evaluate(() => window.__resolveNewImageClipboard());
  await expect(clipboardCard).toBeEnabled();
  await expect(clipboardCard).toHaveAttribute("aria-pressed", "false");
  await expect(modal.locator("#new-image-width")).toHaveValue("77");
  await expect(modal.locator("#new-image-height")).toHaveValue("55");
  await modal.locator("[data-new-image-cancel]").last().click();
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
          async write(blob) { window.__imageEditorOriginalBlob = blob; },
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
  await expect(page.locator('[data-tool="callout"]')).toHaveAttribute('title', 'Rounded rectangular callout');
  await expect(page.locator('[data-tool="oval-callout"]')).toHaveCount(0);
  await expect(page.locator('.image-editor-callout-type option')).toHaveCount(3);
  const toolbarRows = await page.evaluate(() => {
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => {
        window.__imageEditorPickerCalls = (window.__imageEditorPickerCalls || 0) + 1;
        return ({
        name: "paint-test.mdimage",
        async createWritable() {
          return { async write(blob) { window.__imageEditorSavedBlob = blob; }, async close() {} };
        }
        });
      }
    });
    const rect = (selector) => document.querySelector(selector).getBoundingClientRect();
    const undo = rect('[data-action="undo"]');
    const cut = rect('[data-action="cut"]');
    const line = rect('[data-tool="line"]');
    const pencil = rect('[data-tool="pencil"]');
    const select = rect('[data-tool="select"]');
    const roundedRectangle = rect('[data-tool="rounded-rectangle"]');
    const callout = rect('[data-tool="callout"]');
    return {
      commandsUseTwoRows: cut.top > undo.top,
      toolsUseTwoRows: pencil.top > line.top,
      selectSpansRows: select.height > line.height,
      calloutUsesSecondRow: Math.abs(callout.top - roundedRectangle.top) < 1
    };
  });
  expect(toolbarRows).toEqual({ commandsUseTwoRows: true, toolsUseTwoRows: true, selectSpansRows: true, calloutUsesSecondRow: true });
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
  expect(await page.evaluate(async () => {
    window.alert = (message) => { window.__imageEditorSaveAlert = message; };
    Object.defineProperty(window, "showSaveFilePicker", {
      configurable: true,
      value: async () => ({
        name: "paint-test.mdimage",
        async createWritable() {
          return { async write(blob) { window.__imageEditorSavedBlob = blob; }, async close() {} };
        }
      })
    });
    const tabs = window.markdownViewerApp.modules.tabs;
    const result = await window.markdownViewerApp.services.imageEditor.saveTab(tabs.getActiveTab());
    return { result, alert: window.__imageEditorSaveAlert || "", picker: typeof window.showSaveFilePicker, sourceName: tabs.getActiveTab()?.sourceFileName };
  })).toEqual({ result: true, alert: "", picker: "function", sourceName: "paint-test.mdimage" });
  expect(await page.evaluate(async () => {
    const tabs = window.markdownViewerApp.modules.tabs;
    const bytes = await window.markdownViewerApp.services.imageEditor.getDraftBinary(tabs.getActiveTab());
    return [bytes[0], bytes[1]];
  })).toEqual([0x50, 0x4b]);
  expect(await page.evaluate(() => window.__imageEditorOriginalBlob)).toBeUndefined();
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
});

test('rounded rectangle adjusts all corners or one corner before commit', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
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

test('oval callout guide changes tail direction length and attachment shape before placement', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 160, height: 120, name: 'Oval Callout' });
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  await page.locator('[data-tool=callout]').click();
  await expect(page.locator('.image-editor-callout-controls')).toBeVisible();
  await expect(page.locator('.image-editor-callout-type')).toHaveValue('callout');
  await page.locator('.image-editor-callout-type').selectOption('oval-callout');
  await expect(page.locator('.image-editor-callout-type')).toHaveValue('oval-callout');
  await expect(page.locator('[data-tool=callout]')).toHaveClass(/active/);
  const overlay = page.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 35, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 115, box.y + 70, { steps: 5 });
  await page.mouse.up();

  const initialModel = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { phase: controller.ovalCalloutTool.phase, tool: controller.state.tool, model: controller.ovalCalloutTool.model };
  });
  expect(initialModel.phase).toBe('editing');
  expect(initialModel.tool).toBe('oval-callout');
  expect(initialModel.model.side).toBe('bottom');
  expect(initialModel.model.attachmentStart.y).toBeLessThan(initialModel.model.rect.y + initialModel.model.rect.height);
  expect(initialModel.model.attachmentEnd.y).toBeLessThan(initialModel.model.rect.y + initialModel.model.rect.height);
  const initialLength = initialModel.model.tip.y - initialModel.model.attachmentStart.y;
  const initialAttachmentSpan = Math.abs(initialModel.model.attachmentEnd.x - initialModel.model.attachmentStart.x);

  await page.mouse.move(box.x + initialModel.model.tip.x, box.y + initialModel.model.tip.y);
  await page.mouse.down();
  await page.mouse.move(box.x + 150, box.y + 45, { steps: 5 });
  await page.mouse.up();
  const redirectedModel = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).ovalCalloutTool.model;
  });
  expect(redirectedModel.side).toBe('right');
  expect(redirectedModel.tip.x).toBe(150);
  expect(redirectedModel.tip.x - redirectedModel.attachmentStart.x).toBeGreaterThan(initialLength);
  expect(redirectedModel.attachmentStart.x).toBeLessThan(redirectedModel.rect.x + redirectedModel.rect.width);
  expect(redirectedModel.attachmentEnd.x).toBeLessThan(redirectedModel.rect.x + redirectedModel.rect.width);

  await page.mouse.move(box.x + redirectedModel.attachmentStart.x, box.y + redirectedModel.attachmentStart.y);
  await page.mouse.down();
  await page.mouse.move(box.x + redirectedModel.attachmentStart.x, box.y + 43, { steps: 3 });
  await page.mouse.up();
  const reshapedModel = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).ovalCalloutTool.model;
  });
  expect(Math.abs(reshapedModel.attachmentEnd.y - reshapedModel.attachmentStart.y)).toBeLessThan(initialAttachmentSpan);

  await page.keyboard.press('Enter');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { tool: controller.state.tool, floating: controller.selection.floating, origin: controller.selection.origin };
  })).toEqual({ tool: 'select', floating: true, origin: 'shape' });
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-tool=callout]')).toHaveClass(/active/);
  await expect(page.locator('.image-editor-callout-type')).toHaveValue('oval-callout');
  const placed = await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data).slice(0, 3);
    const data = context.getImageData(0, 0, canvas.width, canvas.height).data;
    let changed = 0;
    for (let index = 0; index < data.length; index += 4) {
      if (data[index] < 240 || data[index + 1] < 240 || data[index + 2] < 240) changed += 1;
    }
    return { corner: pixel(35, 20), topCenter: pixel(75, 20), changed };
  });
  expect(placed.corner).toEqual([255, 255, 255]);
  expect(placed.topCenter[0]).toBeLessThan(240);
  expect(placed.changed).toBeGreaterThan(80);
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
  await page.keyboard.press('Enter');

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

test('placing an unfilled shape preserves transparency and names new or existing layers correctly', async ({ page }) => {
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
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const layer = controller.documentStore.activeLayer();
    return { layerName: layer.name, objectNames: layer.objects.map((object) => object.name) };
  })).toEqual({ layerName: 'Rectangle', objectNames: ['Rectangle'] });

  await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    controller.documentStore.activeLayer().name = 'City';
    controller.layerPanel.state.placementMode = 'active';
    window.__rectangleLayerCount = controller.documentStore.document.nodes.filter((node) => node.kind === 'layer').length;
    controller.documentStore.notify({ type: 'rename-layer' });
  });
  await page.locator('[data-tool=rectangle]').click();
  await page.mouse.move(box.x + 65, box.y + 10);
  await page.mouse.down();
  await page.mouse.move(box.x + 90, box.y + 35, { steps: 5 });
  await page.mouse.up();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const layer = controller.documentStore.activeLayer();
    return {
      layerName: layer.name,
      layerCount: controller.documentStore.document.nodes.filter((node) => node.kind === 'layer').length,
      objectNames: layer.objects.map((object) => object.name)
    };
  })).toEqual({ layerName: 'City', layerCount: await page.evaluate(() => window.__rectangleLayerCount), objectNames: ['Rectangle', 'Rectangle'] });
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
  expect(await page.locator('.image-editor-canvas').evaluate((canvas) => {
    const pixels = canvas.getContext('2d').getImageData(0, 0, canvas.width, canvas.height).data;
    for (let index = 0; index < pixels.length; index += 4) {
      if (pixels[index] < 240 || pixels[index + 1] < 240 || pixels[index + 2] < 240) return true;
    }
    return false;
  })).toBe(true);
});

test('layers panel creates layers and restores after being hidden', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: 'Layers' });
  });

  await expect(page.locator('.tab-view.active[data-tab-view-kind=image-editor] .image-editor-shell')).toBeVisible();
  const panel = page.locator('.tab-view.active .image-editor-layers-panel');
  await expect(panel).toBeVisible();
  await panel.locator('[data-layer-action="new-layer"]').click();
  await expect(panel.locator('[data-layer-item]')).toHaveCount(2);
  await panel.locator('[data-layer-item]').first().locator('.image-editor-layer-name').dblclick();
  await expect(page.locator('#app-notification-modal')).toBeVisible();
  await expect(page.locator('#app-notification-title')).toHaveText('Rename layer or object');
  await page.locator('#app-notification-input').fill('Layer zoom');
  await page.locator('#app-notification-input').evaluate((input) => input.setSelectionRange(6, 10));
  await page.keyboard.press('Delete');
  await expect(page.locator('#app-notification-input')).toHaveValue('Layer ');
  await expect(panel.locator('[data-layer-item]')).toHaveCount(2);
  await page.locator('#app-notification-input').fill('Renamed layer');
  await page.locator('[data-notification-button-id="confirm"]').click();
  await expect(panel.locator('[data-layer-item]').first().locator('.image-editor-layer-name')).toHaveText('Renamed layer');
  const objectId = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const pixels = new ImageData(1, 1);
    pixels.data[3] = 255;
    return controller.documentStore.addRasterObject(pixels, { x: 0, y: 0, width: 1, height: 1 }, { name: 'Object to rename', layerId: controller.documentStore.activeLayer().id }).id;
  });
  await panel.locator('[data-layer-item]').first().locator('[data-layer-expand]').click();
  await panel.locator(`[data-layer-item="${objectId}"] .image-editor-layer-name`).dblclick();
  await expect(page.locator('#app-notification-modal')).toBeVisible();
  await page.locator('#app-notification-input').fill('Object zoom');
  await page.locator('#app-notification-input').evaluate((input) => input.setSelectionRange(7, 11));
  await page.keyboard.press('Delete');
  await expect(page.locator('#app-notification-input')).toHaveValue('Object ');
  await expect(panel.locator(`[data-layer-item="${objectId}"]`)).toHaveCount(1);
  await page.locator('#app-notification-input').fill('Renamed object');
  await page.locator('[data-notification-button-id="confirm"]').click();
  await expect(panel.locator(`[data-layer-item="${objectId}"] .image-editor-layer-name`)).toHaveText('Renamed object');
  await panel.locator('[data-layer-item]').first().locator('[data-layer-expand]').click();
  await panel.locator('[data-layer-item]').first().locator('.image-editor-layer-thumbnail').click();
  await panel.locator('[data-layer-action="delete"]').click();
  await expect(page.locator('#app-notification-modal')).toBeVisible();
  await expect(page.locator('#app-notification-title')).toHaveText('Delete layer?');
  await expect(panel.locator('[data-layer-item]')).toHaveCount(2);
  await page.locator('[data-notification-button-id="cancel"]').click();
  await expect(panel.locator('[data-layer-item]')).toHaveCount(2);
  await panel.locator('[data-layer-action="delete"]').click();
  await page.locator('[data-notification-button-id="confirm"]').click();
  await expect(panel.locator('[data-layer-item]')).toHaveCount(1);
  await panel.locator('[data-layer-action="new-layer"]').click();
  await panel.locator('.image-editor-layer-placement select').selectOption('active');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return controller.layerPanel.state.placementMode;
  })).toBe('active');

  await panel.locator('[data-layer-action="hide"]').click();
  await expect(panel).toBeHidden();
  await page.locator('[data-layers-toggle="true"]').click();
  await expect(panel).toBeVisible();
  await expect(panel).not.toHaveClass(/hidden|minimized/);
  await page.evaluate(() => {
    const key = 'markdownViewerGlobalState';
    const state = JSON.parse(localStorage.getItem(key) || '{}');
    localStorage.setItem(key, JSON.stringify({ ...state, confirmDeleteImageEditorLayers: false }));
  });
  await panel.locator('[data-layer-action="delete"]').click();
  await expect(page.locator('#app-notification-modal')).toBeHidden();
  await expect(panel.locator('[data-layer-item]')).toHaveCount(1);
});

test('layers panel right-click menu exposes layer actions and targets an object owning layer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(async () => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    await window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: 'Layer context menu' });
  });
  await expect(page.locator('.tab-view[data-tab-view-kind=image-editor] .image-editor-shell').last()).toBeAttached();
  await page.evaluate(() => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind=image-editor]')].at(-1);
    window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).layerPanel.reveal();
  });
  const panel = page.locator('.tab-view[data-tab-view-kind=image-editor] .image-editor-layers-panel').last();
  const ids = await page.evaluate(() => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind=image-editor]')].at(-1);
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const layer = controller.documentStore.addLayer('Menu layer');
    const pixels = new ImageData(1, 1);
    pixels.data[3] = 255;
    const object = controller.documentStore.addRasterObject(pixels, { x: 0, y: 0, width: 1, height: 1 }, { name: 'Menu object', layerId: layer.id });
    return { layerId: layer.id, objectId: object.id };
  });
  await page.evaluate((layerId) => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind=image-editor]')].at(-1);
    window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).layerPanel.toggleExpanded(layerId);
  }, ids.layerId);
  await panel.locator(`[data-layer-item="${ids.objectId}"]`).dispatchEvent('contextmenu', { clientX: 200, clientY: 200 });
  const menu = page.locator('.image-editor-layer-context-menu');
  await expect(menu).toBeVisible();
  await expect(menu.locator('[data-layer-context-action]')).toHaveCount(14);
  await expect(menu.locator('[data-layer-context-action="new-layer"]')).toHaveText(/New layer/);
  await expect(menu.locator('[data-layer-context-action="group"]')).toHaveText(/New group from selected layers/);
  await expect(menu.locator('[data-layer-context-action="export-layer-png"]')).toBeEnabled();
  expect(await page.evaluate(() => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind=image-editor]')].at(-1);
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return [...controller.documentStore.selectedIds];
  })).toEqual([ids.layerId]);
  await menu.locator('[data-layer-context-action="toggle-lock"]').dispatchEvent('click');
  expect(await page.evaluate((layerId) => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind=image-editor]')].at(-1);
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return window.MarkdownViewerImageEditor.findDocumentNode(controller.documentStore.document, layerId).node.locked;
  }, ids.layerId)).toBe(true);
});

test('new group creates an empty root group when no layer is selected', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: 'Empty group' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).documentStore.select([]);
  });

  const panel = page.locator('.tab-view.active .image-editor-layers-panel');
  await panel.locator('[data-layer-action=new-group]').click();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const groups = controller.documentStore.document.nodes.filter((node) => node.kind === 'group');
    return { groupCount: groups.length, children: groups[0]?.children.length, selected: [...controller.documentStore.selectedIds] };
  })).toEqual({ groupCount: 1, children: 0, selected: [expect.any(String)] });
  await expect(panel.locator('[data-layer-item]').first().locator('.image-editor-layer-name')).toHaveText('Group');
});

test('background fill reaches canvas area added by resizing', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 40, height: 30, name: 'Background resize fill' });
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  const resizeHandle = root.locator('[data-canvas-resize="se"]');
  const handleBox = await resizeHandle.boundingBox();
  await page.mouse.move(handleBox.x + handleBox.width / 2, handleBox.y + handleBox.height / 2);
  await page.mouse.down();
  await page.mouse.move(handleBox.x + handleBox.width / 2 + 20, handleBox.y + handleBox.height / 2 + 15, { steps: 5 });
  await page.mouse.up();
  await expect(root.locator('.image-editor-canvas')).toHaveAttribute('width', '60');
  await expect(root.locator('.image-editor-canvas')).toHaveAttribute('height', '45');
  await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).state.foregroundColor = '#808080';
  });
  await root.locator('[data-tool="bucket"]').click();
  const overlayBox = await root.locator('.image-editor-overlay').boundingBox();
  await page.mouse.click(overlayBox.x + 5, overlayBox.y + 5);
  expect(await root.locator('.image-editor-canvas').evaluate((canvas) => {
    const context = canvas.getContext('2d');
    const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data);
    return { original: pixel(5, 5), expanded: pixel(50, 35) };
  })).toEqual({ original: [128, 128, 128, 255], expanded: [128, 128, 128, 255] });
});

test('canvas background is permanent, bottommost, and represents the canvas base', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  const result = await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 20, height: 20, name: 'Permanent canvas background' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const background = controller.documentStore.document.nodes.at(-1);
    const initialPanelRows = controller.layerPanel.list.querySelectorAll('[data-layer-item]').length;
    const initialOpacityDisabled = controller.layerPanel.element.querySelector('.image-editor-layer-opacity input').disabled;
    const backgroundObject = background.objects[0];
    const source = controller.documentStore.assets.get(backgroundObject.payload.assetId);
    const initialPixel = Array.from(controller.compositor.render().getContext('2d').getImageData(0, 0, 1, 1).data);
    const pixels = new ImageData(new Uint8ClampedArray(source.data), source.width, source.height);
    pixels.data[3] = 0;
    backgroundObject.payload = { assetId: controller.documentStore.addRasterAsset(pixels) };
    const foreground = controller.documentStore.addLayer('Foreground');
    controller.documentStore.select(background.id);
    const deleted = controller.documentStore.deleteSelected();
    const movedBackground = controller.documentStore.moveItems([background.id], foreground.id, 'before');
    const movedBelowBackground = controller.documentStore.moveItems([foreground.id], background.id, 'after');
    controller.compositor.render({ canvas: controller.view.canvas });
    controller.layerPanel.render();
    return {
      backgroundId: background.id,
      initialPanelRows,
      initialOpacityDisabled,
      deleted,
      movedBackground,
      movedBelowBackground,
      nodeNames: controller.documentStore.document.nodes.map((node) => node.name),
      initialPixel,
      basePixel: Array.from(controller.view.canvas.getContext('2d').getImageData(0, 0, 1, 1).data)
    };
  });
  expect(result).toEqual({
    backgroundId: result.backgroundId,
    initialPanelRows: 0,
    initialOpacityDisabled: true,
    deleted: false,
    movedBackground: false,
    movedBelowBackground: false,
    nodeNames: ['Foreground', 'Background'],
    initialPixel: [255, 255, 255, 255],
    basePixel: [0, 0, 0, 0]
  });
  await expect(page.locator(`[data-layer-item="${result.backgroundId}"]`)).toHaveCount(0);
  await expect(page.locator('.tab-view.active .image-editor-layer-list [data-layer-item]')).toHaveCount(1);

  expect(await page.evaluate(() => {
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 20, height: 20, name: 'Transparent canvas base', background: { mode: 'transparent' } });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return {
      pixel: Array.from(controller.compositor.render().getContext('2d').getImageData(0, 0, 1, 1).data),
      checkerboard: getComputedStyle(controller.view.wrap).backgroundImage
    };
  })).toEqual({ pixel: [0, 0, 0, 0], checkerboard: expect.stringContaining('linear-gradient') });
});

test('layer drag shows an insertion line and moves multiple layers into and out of a group', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  const ids = await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: 'Layer drag hierarchy' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const group = controller.documentStore.addGroup('Destination', null);
    const first = controller.documentStore.addLayer('First', null);
    const second = controller.documentStore.addLayer('Second', null);
    controller.layerPanel.expandedIds.add(group.id);
    controller.documentStore.select([second.id, first.id]);
    controller.layerPanel.render();
    return { group: group.id, first: first.id, second: second.id };
  });
  const panel = page.locator('.tab-view.active .image-editor-layers-panel');
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  const secondRow = panel.locator(`[data-layer-item="${ids.second}"]`);
  const groupRow = panel.locator(`[data-layer-item="${ids.group}"]`);
  const groupBox = await groupRow.boundingBox();
  await secondRow.dispatchEvent('dragstart', { dataTransfer });
  await groupRow.dispatchEvent('dragover', { dataTransfer, clientX: groupBox.x + 80, clientY: groupBox.y + groupBox.height / 2 });
  const indicator = panel.locator('.image-editor-layer-drop-indicator');
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute('data-placement', 'inside');
  await groupRow.dispatchEvent('drop', { dataTransfer, clientX: groupBox.x + 80, clientY: groupBox.y + groupBox.height / 2 });
  expect(await page.evaluate(({ group }) => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return window.MarkdownViewerImageEditor.findDocumentNode(controller.documentStore.document, group).node.children.map((node) => node.name);
  }, ids)).toEqual(['Second', 'First']);

  const nestedSecondRow = panel.locator(`[data-layer-item="${ids.second}"]`);
  const refreshedGroupBox = await groupRow.boundingBox();
  await nestedSecondRow.dispatchEvent('dragstart', { dataTransfer });
  await groupRow.dispatchEvent('dragover', { dataTransfer, clientX: refreshedGroupBox.x + 4, clientY: refreshedGroupBox.y + refreshedGroupBox.height - 1 });
  await expect(indicator).toBeVisible();
  await expect(indicator).toHaveAttribute('data-placement', 'after');
  await groupRow.dispatchEvent('drop', { dataTransfer, clientX: refreshedGroupBox.x + 4, clientY: refreshedGroupBox.y + refreshedGroupBox.height - 1 });
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return controller.documentStore.document.nodes.map((node) => node.name);
  })).toEqual(['Destination', 'Second', 'First', 'Background']);
  await expect(indicator).toBeHidden();
});

test('select and move are distinct tools without a selection mode dropdown', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 70, name: 'Selection tools' });
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  await expect(root.locator('.image-editor-select-mode')).toHaveCount(0);
  await expect(root.locator('[data-tool="select"]')).toHaveAttribute('title', 'Select');
  await expect(root.locator('[data-tool="move"]')).toHaveAttribute('title', 'Move');
  await root.locator('[data-tool="select"]').click();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const state = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).state;
    return { tool: state.tool, selectionMode: state.selectionMode };
  })).toEqual({ tool: 'select', selectionMode: 'pixel' });
  await root.locator('[data-tool="move"]').click();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const state = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).state;
    return { tool: state.tool, selectionMode: state.selectionMode };
  })).toEqual({ tool: 'move', selectionMode: 'object' });
});

test('editing a selected layer preserves its objects without creating new panel items', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 120, height: 80, name: 'Layer edits' });
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  const panel = root.locator('.image-editor-layers-panel');
  const overlay = root.locator('.image-editor-overlay');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const pixels = new ImageData(120, 80);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = 180;
      pixels.data[index + 3] = 255;
    }
    const object = controller.documentStore.addRasterObject(pixels, { x: 0, y: 0, width: 120, height: 80 }, { name: 'Existing object', layerId: controller.documentStore.activeLayer().id });
    window.__layerEditObjectId = object.id;
    window.__layerEditObjectCount = controller.documentStore.activeLayer().objects.length;
    controller.compositor.render({ canvas: controller.view.canvas });
    controller.state.setTool('brush');
  });
  await panel.locator('[data-layer-expand]').click();
  const initialPanelItemCount = await panel.locator('[data-layer-item]').count();
  await overlay.hover({ position: { x: 20, y: 20 } });
  await page.mouse.down();
  await page.mouse.move((await overlay.boundingBox()).x + 55, (await overlay.boundingBox()).y + 35);
  await page.mouse.up();
  await expect(panel.locator('[data-layer-item]')).toHaveCount(initialPanelItemCount);
  const layerEditResult = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const layer = controller.documentStore.activeLayer();
    return { objects: layer.objects.length, expectedObjects: window.__layerEditObjectCount, objectPreserved: layer.objects.some((object) => object.id === window.__layerEditObjectId), pixelEdits: layer.pixelEdits.length };
  });
  expect(layerEditResult.objects).toBe(layerEditResult.expectedObjects);
  expect({ objectPreserved: layerEditResult.objectPreserved, pixelEdits: layerEditResult.pixelEdits }).toEqual({ objectPreserved: true, pixelEdits: 1 });
});

test('pixel deletion affects only the selected layer and preserves its object row', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 70, name: 'Layer delete isolation' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const solidPixels = (red, green, blue) => {
      const pixels = new ImageData(100, 70);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = red; pixels.data[index + 1] = green; pixels.data[index + 2] = blue; pixels.data[index + 3] = 255;
      }
      return pixels;
    };
    const lower = controller.documentStore.activeLayer();
    controller.documentStore.addRasterObject(solidPixels(0, 0, 255), { x: 0, y: 0, width: 100, height: 70 }, { name: 'Lower object', layerId: lower.id });
    const upper = controller.documentStore.addLayer('Upper layer', lower.id);
    const upperObject = controller.documentStore.addRasterObject(solidPixels(255, 0, 0), { x: 0, y: 0, width: 100, height: 70 }, { name: 'Upper object', layerId: upper.id });
    window.__upperLayerObjectId = upperObject.id;
    controller.compositor.render({ canvas: controller.view.canvas });
    controller.state.selectionMode = 'pixel';
    controller.state.setTool('select');
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  const panel = root.locator('.image-editor-layers-panel');
  await expect(panel.locator('[data-layer-expand]')).toHaveCount(2);
  await panel.locator('[data-layer-expand]').nth(0).click();
  await panel.locator('[data-layer-expand]').nth(1).click();
  const initialPanelItemCount = await panel.locator('[data-layer-item]').count();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 20, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 40, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const canvas = controller.view.canvas.getContext('2d');
    const pixel = (x, y) => Array.from(canvas.getImageData(x, y, 1, 1).data).slice(0, 3);
    const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__upperLayerObjectId)?.object;
    const layer = controller.documentStore.activeLayer();
    return { deletedArea: pixel(30, 30), untouchedArea: pixel(10, 10), objectPreserved: !!object, pixelEdits: layer.pixelEdits.length };
  })).toEqual({ deletedArea: [0, 0, 255], untouchedArea: [255, 0, 0], objectPreserved: true, pixelEdits: 0 });
  const movedResult = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__upperLayerObjectId)?.object;
    object.transform.x += 10;
    controller.documentStore.notify({ type: 'transform', ids: [object.id] });
    controller.compositor.render({ canvas: controller.view.canvas });
    const canvas = controller.view.canvas.getContext('2d');
    const pixel = (x, y) => Array.from(canvas.getImageData(x, y, 1, 1).data).slice(0, 3);
    return { previousLocation: pixel(25, 30), movedDeletedArea: pixel(35, 30), objectId: object.id };
  });
  expect(movedResult).toEqual({ previousLocation: [255, 0, 0], movedDeletedArea: [0, 0, 255], objectId: await page.evaluate(() => window.__upperLayerObjectId) });
  await expect(panel.locator('[data-layer-item]')).toHaveCount(initialPanelItemCount);
});

test('a pixel marquee stays active while the Layers panel changes and extends its targets', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 120, height: 60, name: 'Pixel layer synchronization' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const addObject = (name, x, colorIndex, targetId) => {
      const layer = controller.documentStore.addLayer(name, targetId);
      const pixels = new ImageData(30, 30);
      for (let index = 0; index < pixels.data.length; index += 4) { pixels.data[index + colorIndex] = 255; pixels.data[index + 3] = 255; }
      const object = controller.documentStore.addRasterObject(pixels, { x, y: 15, width: 30, height: 30 }, { name, layerId: layer.id });
      controller.layerPanel.expandedIds.add(layer.id);
      return { layer, object };
    };
    const first = addObject('First object', 10, 0, controller.documentStore.activeLayer().id);
    const second = addObject('Second object', 70, 2, first.layer.id);
    controller.documentStore.select(first.object.id);
    controller.compositor.render({ canvas: controller.view.canvas });
    window.__pixelSyncIds = { first: first.object.id, firstLayer: first.layer.id, second: second.object.id, secondLayer: second.layer.id };
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  await root.locator('[data-tool=select]').click();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  const marquee = async (x1, x2) => {
    await page.mouse.move(box.x + x1, box.y + 20);
    await page.mouse.down();
    await page.mouse.move(box.x + x2, box.y + 40, { steps: 3 });
    await page.mouse.up();
  };
  await marquee(15, 35);
  await marquee(75, 95);
  await expect.poll(() => page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const selected = [...controller.documentStore.selectedIds];
    const selectedRows = [...root.querySelectorAll('.image-editor-layer-row.selected')].map((row) => row.dataset.layerItem);
    return { selected, activeLayer: controller.documentStore.document.activeLayerId, selectedRows };
  })).toEqual({
    selected: [await page.evaluate(() => window.__pixelSyncIds.second)],
    activeLayer: await page.evaluate(() => window.__pixelSyncIds.secondLayer),
    selectedRows: [
      await page.evaluate(() => window.__pixelSyncIds.secondLayer),
      await page.evaluate(() => window.__pixelSyncIds.second)
    ]
  });
  const selectionRect = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return { ...window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId).selection.rect };
  });
  const panel = root.locator('.image-editor-layers-panel');
  await panel.locator(`[data-layer-item=${await page.evaluate(() => window.__pixelSyncIds.firstLayer)}]`).click();
  await panel.locator(`[data-layer-item=${await page.evaluate(() => window.__pixelSyncIds.secondLayer)}]`).click({ modifiers: ['Control'] });
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { hasSelection: controller.selection.hasSelection, rect: controller.selection.rect, selected: [...controller.documentStore.selectedIds] };
  })).toEqual({
    hasSelection: true,
    rect: selectionRect,
    selected: [
      await page.evaluate(() => window.__pixelSyncIds.firstLayer),
      await page.evaluate(() => window.__pixelSyncIds.secondLayer)
    ]
  });
});

test('deleting a marquee never imports flattened presentation pixels', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 120, height: 60, name: 'Layered marquee delete' });
  });
  await page.waitForFunction(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    return !!root && !!window.markdownViewerApp?.services?.imageEditor?.getView(root.dataset.tabId);
  }, null, { timeout: 60000 });
  await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const background = controller.documentStore.activeLayer();
    background.objects[0].payload = { assetId: controller.documentStore.addRasterAsset(new ImageData(120, 60)) };
    const addRaster = (name, x, color) => {
      const layer = controller.documentStore.addLayer(name, controller.documentStore.activeLayer().id);
      const pixels = new ImageData(30, 30);
      for (let index = 0; index < pixels.data.length; index += 4) {
        pixels.data[index] = color[0]; pixels.data[index + 1] = color[1]; pixels.data[index + 2] = color[2]; pixels.data[index + 3] = 255;
      }
      controller.documentStore.addRasterObject(pixels, { x, y: 15, width: 30, height: 30 }, { name, layerId: layer.id });
    };
    addRaster('Rectangle', 75, [255, 0, 0]);
    addRaster('Triangle', 20, [0, 160, 220]);
    controller.documentStore.select(background.id);
    controller.compositor.render({ canvas: controller.view.canvas });
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await root.locator('[data-tool=select]').click();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 5, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 110, box.y + 40, { steps: 4 });
  await page.mouse.up();
  await root.locator('[data-action=delete]').click();
  await root.locator('[data-tool=move]').click();
  await page.mouse.click(box.x + 10, box.y + 10);
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const presentation = Array.from(controller.view.canvas.getContext('2d').getImageData(25, 25, 1, 1).data);
    const composite = Array.from(controller.compositor.render().getContext('2d').getImageData(25, 25, 1, 1).data);
    return { names: controller.documentStore.document.nodes.map((node) => node.name), presentation, composite };
  })).toEqual({
    names: ['Triangle', 'Rectangle', 'Background'],
    presentation: [0, 160, 220, 255],
    composite: [0, 160, 220, 255]
  });
});

test('pixel marquee lifts only the selected layer above a filled background', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 70, name: 'Layer scoped pixel lift', background: { mode: 'transparent' } });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const background = controller.documentStore.activeLayer();
    const red = new ImageData(100, 70);
    for (let index = 0; index < red.data.length; index += 4) { red.data[index] = 255; red.data[index + 3] = 255; }
    const backgroundObject = controller.documentStore.addRasterObject(red, { x: 0, y: 0, width: 100, height: 70 }, { name: 'Red background', layerId: background.id });
    const triangleLayer = controller.documentStore.addLayer('Triangle', background.id);
    const blue = new ImageData(40, 30);
    for (let index = 0; index < blue.data.length; index += 4) { blue.data[index + 2] = 255; blue.data[index + 3] = 255; }
    const triangleObject = controller.documentStore.addRasterObject(blue, { x: 30, y: 10, width: 40, height: 30 }, { name: 'Triangle', layerId: triangleLayer.id });
    controller.layerPanel.expandedIds.add(triangleLayer.id);
    controller.layerPanel.render();
    controller.documentStore.select([backgroundObject.id]);
    controller.compositor.render({ canvas: controller.view.canvas });
    window.__pixelLayerSyncIds = { backgroundObjectId: backgroundObject.id, triangleObjectId: triangleObject.id };
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  await root.locator('[data-tool=select]').click();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 40, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + 30, { steps: 3 });
  await page.mouse.up();
  const selectedIds = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return [...controller.documentStore.selectedIds];
  });
  expect(selectedIds).toEqual([await page.evaluate(() => window.__pixelLayerSyncIds.triangleObjectId)]);
  await expect(root.locator(`[data-layer-item="${selectedIds[0]}"]`)).toHaveClass(/selected/);
  await page.mouse.move(box.x + 50, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 50, box.y + 55, { steps: 3 });
  await page.mouse.up();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const canvasContext = controller.view.canvas.getContext('2d');
    const overlayContext = controller.view.overlay.getContext('2d');
    return {
      sourceAfterLift: Array.from(canvasContext.getImageData(50, 25, 1, 1).data),
      floatingTriangle: Array.from(overlayContext.getImageData(50, 55, 1, 1).data),
      floatingOutsideTriangle: Array.from(overlayContext.getImageData(75, 55, 1, 1).data)
    };
  })).toEqual({ sourceAfterLift: [255, 0, 0, 255], floatingTriangle: [0, 0, 255, 255], floatingOutsideTriangle: [0, 0, 0, 0] });
});

test('File menu offers flattened PNG, JPEG, and WebP export for image tabs', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor?.exportFlattenedImage, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.__tabBeforeImageExport = window.markdownViewerApp.modules.tabs.getActiveTab().id;
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: 'File menu image export' });
    window.__imageExportRequests = [];
    window.markdownViewerApp.services.imageEditor.exportFlattenedImage = async (tab, options) => {
      window.__imageExportRequests.push({ tabId: tab.id, mimeType: options.mimeType });
      return true;
    };
  });
  const fileMenu = page.locator('#desktop-application-menu .application-menu-file');
  await fileMenu.locator('> .application-menu-category-toggle').click();
  const exportMenu = fileMenu.locator('.image-export-submenu');
  await expect(exportMenu).toBeVisible();
  await exportMenu.hover();
  await expect(exportMenu.locator('.export-active-image')).toHaveText(['Export PNG', 'Export JPEG', 'Export WebP']);
  await exportMenu.locator('[data-image-export-mime-type="image/webp"]').click();
  await expect.poll(() => page.evaluate(() => window.__imageExportRequests)).toEqual([
    { tabId: await page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab().id), mimeType: 'image/webp' }
  ]);
  await page.evaluate(() => window.markdownViewerApp.modules.tabs.switchTab(window.__tabBeforeImageExport));
  await fileMenu.locator('> .application-menu-category-toggle').click();
  await expect(exportMenu).toBeHidden();
});

test('Shift-arrow pixel stamping remains attached to the selected object', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 70, name: 'Object pixel stamping' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const layer = controller.documentStore.addLayer('Rectangle', controller.documentStore.activeLayer().id);
    const pixels = new ImageData(40, 30);
    for (let y = 0; y < 10; y += 1) for (let x = 0; x < 10; x += 1) {
      const index = (y * pixels.width + x) * 4;
      pixels.data[index + 1] = 160;
      pixels.data[index + 2] = 220;
      pixels.data[index + 3] = 255;
    }
    const object = controller.documentStore.addRasterObject(pixels, { x: 30, y: 20, width: 40, height: 30 }, { name: 'Rectangle', layerId: layer.id });
    controller.documentStore.select([object.id]);
    controller.compositor.render({ canvas: controller.view.canvas });
    window.__stampedObjectId = object.id;
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  await root.locator('[data-tool=select]').click();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 30, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 40, box.y + 30, { steps: 3 });
  await page.mouse.up();
  for (let step = 0; step < 15; step += 1) await page.keyboard.press('Shift+ArrowRight');
  const stamped = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const found = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__stampedObjectId);
    const pixel = Array.from(controller.view.canvas.getContext('2d').getImageData(50, 25, 1, 1).data);
    return { objectCount: found.layer.objects.length, objectPreserved: found.object.id === window.__stampedObjectId, pixelEdits: found.layer.pixelEdits.length, stampedPixel: pixel };
  });
  expect({ objectCount: stamped.objectCount, objectPreserved: stamped.objectPreserved, pixelEdits: stamped.pixelEdits }).toEqual({ objectCount: 1, objectPreserved: true, pixelEdits: 0 });
  expect(stamped.stampedPixel[3]).toBe(255);
  const moved = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__stampedObjectId).object;
    object.transform.x += 20;
    object.transform.y += 10;
    controller.documentStore.notify({ type: 'transform', ids: [object.id] });
    controller.compositor.render({ canvas: controller.view.canvas });
    const context = controller.view.canvas.getContext('2d');
    return { previousPixel: Array.from(context.getImageData(40, 25, 1, 1).data), movedStamp: Array.from(context.getImageData(70, 35, 1, 1).data) };
  });
  expect(moved.previousPixel).toEqual([255, 255, 255, 255]);
  expect(moved.movedStamp[3]).toBe(255);
  expect(moved.movedStamp.slice(0, 3)).not.toEqual([255, 255, 255]);
});

test('selected object outline refreshes and bucket fill follows the moved object', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 70, name: 'Object fill movement' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const pixels = new ImageData(30, 30);
    for (let y = 0; y < 30; y += 1) for (let x = 0; x < 30; x += 1) {
      if (x !== 0 && x !== 29 && y !== 0 && y !== 29) continue;
      pixels.data[(y * 30 + x) * 4 + 3] = 255;
    }
    const object = controller.documentStore.addRasterObject(pixels, { x: 10, y: 10, width: 30, height: 30 }, { name: 'Outlined object', layerId: controller.documentStore.activeLayer().id });
    window.__filledObjectId = object.id;
    controller.compositor.render({ canvas: controller.view.canvas });
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  await root.locator('[data-tool="move"]').click();
  await root.locator('[data-layer-expand]').click();
  await root.locator(`[data-layer-item="${await page.evaluate(() => window.__filledObjectId)}"]`).click();
  expect(await root.locator('.image-editor-overlay').evaluate((canvas) => canvas.getContext('2d').getImageData(10, 10, 1, 1).data[3])).toBeGreaterThan(0);
  await root.locator('[data-tool="bucket"]').click();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();
  const backgroundPixel = await root.locator('.image-editor-canvas').evaluate((canvas) => Array.from(canvas.getContext('2d').getImageData(20, 20, 1, 1).data));
  await page.mouse.click(box.x + 20, box.y + 20);
  const result = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__filledObjectId).object;
    const context = controller.view.canvas.getContext('2d');
    const pixel = (x, y) => Array.from(context.getImageData(x, y, 1, 1).data);
    const filledPixel = pixel(20, 20);
    object.transform.x += 40;
    controller.compositor.render({ canvas: controller.view.canvas });
    return { filledPixel, oldPixel: pixel(20, 20), movedPixel: pixel(60, 20), pixelEdits: controller.documentStore.activeLayer().pixelEdits.length, objectId: object.id };
  });
  expect(result.filledPixel).not.toEqual(backgroundPixel);
  expect(result.oldPixel).toEqual(backgroundPixel);
  expect(result.movedPixel).toEqual(result.filledPixel);
  expect({ pixelEdits: result.pixelEdits, objectId: result.objectId }).toEqual({ pixelEdits: 0, objectId: await page.evaluate(() => window.__filledObjectId) });
});

test('fill, move, pixel delete, and layer delete affect every selected layer', async ({ page }) => {
  await page.goto('/');
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 70, name: 'Multiple layer edits' });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const outlinedPixels = () => {
      const pixels = new ImageData(30, 30);
      for (let y = 0; y < 30; y += 1) for (let x = 0; x < 30; x += 1) {
        if (x !== 0 && x !== 29 && y !== 0 && y !== 29) continue;
        pixels.data[(y * 30 + x) * 4 + 3] = 255;
      }
      return pixels;
    };
    const first = controller.documentStore.addLayer('First');
    const firstObject = controller.documentStore.addRasterObject(outlinedPixels(), { x: 10, y: 10, width: 30, height: 30 }, { name: 'First object', layerId: first.id });
    const second = controller.documentStore.addLayer('Second', first.id);
    const secondObject = controller.documentStore.addRasterObject(outlinedPixels(), { x: 10, y: 10, width: 30, height: 30 }, { name: 'Second object', layerId: second.id });
    controller.documentStore.select([second.id, first.id]);
    controller.compositor.render({ canvas: controller.view.canvas });
    window.__multiLayerIds = [second.id, first.id];
    window.__multiObjectIds = [secondObject.id, firstObject.id];
  });
  const root = page.locator('.tab-view.active[data-tab-view-kind=image-editor]');
  await expect(root.locator('.image-editor-shell')).toBeVisible();
  const overlay = root.locator('.image-editor-overlay');
  const box = await overlay.boundingBox();

  await root.locator('[data-tool="bucket"]').click();
  await page.mouse.click(box.x + 20, box.y + 20);
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return window.__multiObjectIds.map((id) => {
      const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, id).object;
      const pixels = controller.documentStore.assets.get(object.payload.assetId);
      return { centerAlpha: pixels.data[(15 * pixels.width + 15) * 4 + 3], layerPixelEdits: window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, id).layer.pixelEdits.length };
    });
  })).toEqual([{ centerAlpha: 255, layerPixelEdits: 0 }, { centerAlpha: 255, layerPixelEdits: 0 }]);

  await root.locator('[data-tool="move"]').click();
  await page.mouse.move(box.x + 25, box.y + 25);
  await page.mouse.down();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return { selectedCount: controller.documentStore.selectedIds.size, mode: controller.objectGesture?.mode, transformCount: controller.objectGesture?.transforms.size };
  })).toEqual({ selectedCount: 2, mode: 'move', transformCount: 2 });
  await page.mouse.move(box.x + 55, box.y + 25, { steps: 5 });
  await page.mouse.up();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return window.__multiObjectIds.map((id) => window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, id).object.transform.x);
  })).toEqual([40, 40]);

  await root.locator('[data-tool="select"]').click();
  await page.mouse.move(box.x + 50, box.y + 20);
  await page.mouse.down();
  await page.mouse.move(box.x + 60, box.y + 30, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press('Delete');
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return window.__multiObjectIds.map((id) => {
      const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, id).object;
      const pixels = controller.documentStore.assets.get(object.payload.assetId);
      return pixels.data[(15 * pixels.width + 15) * 4 + 3];
    });
  })).toEqual([0, 0]);

  await root.locator('[data-layer-action="delete"]').click();
  await page.locator('[data-notification-button-id="confirm"]').click();
  expect(await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind=image-editor]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    return window.__multiLayerIds.map((id) => !!window.MarkdownViewerImageEditor.findDocumentNode(controller.documentStore.document, id));
  })).toEqual([false, false]);
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
    const draftArchive = await JSZip.loadAsync(draftBytes);
    const draftBitmap = await createImageBitmap(await draftArchive.file("preview.png").async("blob"));
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
  await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    controller.state.setTool('select');
  });

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
