const { expect, test } = require("./desktop-fixture");
const { stubBrowserLibraries } = require("../helpers/candidate-app-helpers");

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

test("canvas context actions edit a selected standalone raster object", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 16, height: 16, name: "Standalone actions", background: { mode: "transparent" } });
  });
  await page.waitForFunction(() => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind="image-editor"]')].at(-1);
    return !!root && !!window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
  });
  await page.evaluate(() => {
    const root = [...document.querySelectorAll('.tab-view[data-tab-view-kind="image-editor"]')].at(-1);
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const pixels = new ImageData(16, 16);
    for (let y = 0; y < 16; y += 1) {
      for (let x = 0; x < 16; x += 1) {
        const offset = (y * 16 + x) * 4;
        pixels.data[offset] = (x + 1) * 10;
        pixels.data[offset + 3] = 255;
      }
    }
    const assetId = controller.documentStore.addRasterAsset(pixels);
    const object = window.MarkdownViewerImageEditor.createContentObject("raster", { assetId }, {
      name: "Standalone image",
      bounds: { x: 0, y: 0, width: 16, height: 16 },
      transform: { x: 0, y: 0, scaleX: 1, scaleY: 1, rotation: 0 }
    });
    controller.documentStore.document.nodes.unshift(object);
    controller.documentStore.select(object.id);
    controller.selection.setRect({ x: 2, y: 0 }, { x: 6, y: 16 }, controller.state);
    controller.compositor.render({ canvas: controller.view.canvas });
    controller.view.pointFromEvent = () => ({ x: 3, y: 1 });
    controller.view.overlay.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, clientX: 3, clientY: 1 }));
    window.__standaloneObjectId = object.id;
    window.__rootActionsController = controller;
  });

  const menu = page.locator(".image-editor-canvas-context-menu");
  await expect(menu).toBeVisible();
  await menu.locator('[data-layer-context-action="flip-horizontal"]').click();

  expect(await page.evaluate(() => {
    const controller = window.__rootActionsController;
    const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__standaloneObjectId).object;
    const pixels = controller.documentStore.assets.get(object.payload.assetId);
    return Array.from({ length: 8 }, (_, x) => pixels.data[x * 4]);
  })).toEqual([10, 20, 60, 50, 40, 30, 70, 80]);
});

test("pointer marquee lifts pixels from a selected standalone object before keyboard movement", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  const tabId = await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    const previousTabId = window.markdownViewerApp.modules.tabs.getActiveTab()?.id;
    const tab = window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: "Standalone pointer selection", background: { mode: "transparent" } });
    if (previousTabId) window.markdownViewerApp.modules.tabs.switchTab(previousTabId);
    window.markdownViewerApp.modules.tabs.switchTab(tab.id);
    return tab.id;
  });
  await page.waitForFunction((id) => !!window.markdownViewerApp.services.imageEditor.getView(id), tabId);
  await page.evaluate((id) => {
    const controller = window.markdownViewerApp.services.imageEditor.getView(id);
    const pixels = new ImageData(30, 20);
    for (let y = 0; y < pixels.height; y += 1) {
      for (let x = 0; x < pixels.width; x += 1) {
        const offset = (y * pixels.width + x) * 4;
        pixels.data[offset] = 30 + x * 5;
        pixels.data[offset + 1] = 90;
        pixels.data[offset + 2] = 210;
        pixels.data[offset + 3] = 255;
      }
    }
    const assetId = controller.documentStore.addRasterAsset(pixels);
    const object = window.MarkdownViewerImageEditor.createContentObject("raster", { assetId }, {
      name: "Standalone image",
      bounds: { x: 10, y: 10, width: 30, height: 20 },
      transform: { x: 10, y: 10, scaleX: 1, scaleY: 1, rotation: 0 }
    });
    controller.documentStore.document.nodes.unshift(object);
    controller.documentStore.notify({ type: "test-object", ids: [object.id] });
    controller.compositor.render({ canvas: controller.view.canvas });
    window.__standalonePointerObjectId = object.id;
  }, tabId);

  const shell = page.locator(`[data-tab-id="${tabId}"] .image-editor-shell`);
  await shell.locator('[data-tool="select"]').click();
  const overlay = shell.locator(".image-editor-overlay");
  const box = await overlay.boundingBox();
  await page.mouse.move(box.x + 12, box.y + 11);
  await page.mouse.down();
  await page.mouse.move(box.x + 18, box.y + 28, { steps: 4 });
  await page.mouse.up();
  await page.keyboard.press("ArrowRight");

  const result = await page.evaluate((id) => {
    const controller = window.markdownViewerApp.services.imageEditor.getView(id);
    const object = window.MarkdownViewerImageEditor.findDocumentObject(controller.documentStore.document, window.__standalonePointerObjectId).object;
    const source = controller.documentStore.assets.get(object.payload.assetId);
    let floatingAlpha = 0;
    for (let index = 3; index < controller.selection.imageData.data.length; index += 4) floatingAlpha += controller.selection.imageData.data[index];
    let clearedAlpha = 0;
    for (let y = 1; y < 18; y += 1) {
      for (let x = 2; x < 8; x += 1) clearedAlpha += source.data[(y * source.width + x) * 4 + 3];
    }
    return { floating: controller.selection.floating, floatingAlpha, clearedAlpha, selectedIds: [...controller.documentStore.selectedIds] };
  }, tabId);
  expect(result.floating).toBe(true);
  expect(result.floatingAlpha).toBeGreaterThan(0);
  expect(result.clearedAlpha).toBe(0);
  expect(result.selectedIds).toEqual([await page.evaluate(() => window.__standalonePointerObjectId)]);
});
