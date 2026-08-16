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

test("Drop Shadow Apply persists and renders the layer effect", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  const target = await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 80, height: 60, name: "Drop shadow render", background: { mode: "transparent" } });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const pixels = new ImageData(10, 10);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = 255;
      pixels.data[index + 3] = 255;
    }
    const layer = controller.documentStore.addLayer("Shadow target");
    controller.documentStore.addRasterObject(pixels, { x: 20, y: 20, width: 10, height: 10 }, { name: "Shadow target", layerId: layer.id });
    controller.documentStore.select(layer.id);
    controller.layerPanel.reveal();
    controller.layerPanel.render();
    controller.compositor.render({ canvas: controller.view.canvas });
    controller.layerPanel.runAction("edit-drop-shadow");
    return { layerId: layer.id, tabId: root.dataset.tabId };
  });

  const dialog = page.locator(".image-editor-layer-style-dialog");
  await expect(dialog).toBeVisible();
  await dialog.locator('[name="opacity"]').fill("100");
  await dialog.locator('[name="angle"]').fill("180");
  await dialog.locator('[name="distance"]').fill("10");
  await dialog.locator('[name="spread"]').fill("0");
  await dialog.locator('[name="blur"]').fill("0");
  await dialog.locator('[data-layer-style-action="apply"]').click();

  expect(await page.evaluate(({ layerId, tabId }) => {
    const controller = window.markdownViewerApp.services.imageEditor.getView(tabId);
    const layer = window.MarkdownViewerImageEditor.findDocumentNode(controller.documentStore.document, layerId).node;
    return {
      effect: layer.effects.find((item) => item.type === "drop-shadow"),
      sourcePixel: Array.from(controller.view.context.getImageData(25, 25, 1, 1).data),
      shadowPixel: Array.from(controller.view.context.getImageData(35, 25, 1, 1).data)
    };
  }, target)).toMatchObject({
    effect: { type: "drop-shadow", enabled: true, opacity: 1, angle: 180, distance: 10, spread: 0, blur: 0 },
    sourcePixel: [255, 0, 0, 255],
    shadowPixel: [0, 0, 0, 255]
  });

  const layerRow = page.locator(`[data-layer-item="${target.layerId}"]`);
  const rowAlignment = await layerRow.evaluate((row) => {
    return {
      tracks: getComputedStyle(row).gridTemplateColumns,
      effectColumn: getComputedStyle(row.querySelector(".image-editor-layer-effect-indicator")).gridColumnStart,
      lockColumn: getComputedStyle(row.querySelector("[data-layer-lock]")).gridColumnStart
    };
  });
  expect(rowAlignment.tracks).toMatch(/18px 24px$/);
  expect(rowAlignment.effectColumn).toBe("5");
  expect(rowAlignment.lockColumn).toBe("6");
});

test("Drop Shadow Apply renders the default blurred effect", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  const target = await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 100, height: 80, name: "Default drop shadow", background: { mode: "transparent" } });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    const pixels = new ImageData(20, 20);
    for (let index = 0; index < pixels.data.length; index += 4) {
      pixels.data[index] = 255;
      pixels.data[index + 3] = 255;
    }
    const layer = controller.documentStore.addLayer("Default shadow target");
    controller.documentStore.addRasterObject(pixels, { x: 35, y: 25, width: 20, height: 20 }, { name: "Default shadow target", layerId: layer.id });
    controller.documentStore.select(layer.id);
    controller.layerPanel.runAction("edit-drop-shadow");
    return { layerId: layer.id, tabId: root.dataset.tabId };
  });

  await page.locator('.image-editor-layer-style-dialog [data-layer-style-action="apply"]').click();
  await page.waitForTimeout(100);

  const result = await page.evaluate(({ layerId, tabId }) => {
    const controller = window.markdownViewerApp.services.imageEditor.getView(tabId);
    const layer = window.MarkdownViewerImageEditor.findDocumentNode(controller.documentStore.document, layerId).node;
    const pixels = controller.view.context.getImageData(0, 0, 100, 80).data;
    let shadowPixels = 0;
    for (let y = 0; y < 80; y += 1) {
      for (let x = 0; x < 100; x += 1) {
        if (x >= 35 && x < 55 && y >= 25 && y < 45) continue;
        const offset = (y * 100 + x) * 4;
        if (pixels[offset + 3] > 0) shadowPixels += 1;
      }
    }
    return { effect: layer.effects.find((item) => item.type === "drop-shadow"), shadowPixels };
  }, target);
  expect(result.effect).toMatchObject({ type: "drop-shadow", enabled: true, opacity: 0.35, distance: 10, blur: 12 });
  expect(result.shadowPixels).toBeGreaterThan(0);
});

test("Drop Shadow Apply renders on a shape created by the editor", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankImageEditorInTab && !!window.markdownViewerApp?.services?.imageEditor, null, { timeout: 60000 });
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.keyboardShortcuts, null, { timeout: 60000 });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.apiClient.deactivateApiClientSidebar = () => {};
    window.markdownViewerApp.modules.tabs.openBlankImageEditorInTab({ width: 120, height: 90, name: "Shape drop shadow", background: { mode: "transparent" } });
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    controller.documentStore.addLayer("Previously active layer");
  });
  await expect(page.locator('.tab-view.active[data-tab-view-kind="image-editor"] .image-editor-shell')).toBeVisible();
  const activeEditor = page.locator('.tab-view.active[data-tab-view-kind="image-editor"]');
  await activeEditor.locator('.image-editor-grouped-tool-main[data-tool="rectangle"]').click();
  await activeEditor.locator(".image-editor-fill").check();
  await activeEditor.locator(".image-editor-foreground").evaluate((element) => {
    element.value = "#ff0000";
    element.dispatchEvent(new Event("input", { bubbles: true }));
  });
  const box = await activeEditor.locator(".image-editor-overlay").boundingBox();
  await page.mouse.move(box.x + 35, box.y + 25);
  await page.mouse.down();
  await page.mouse.move(box.x + 65, box.y + 55, { steps: 5 });
  await page.mouse.up();

  const target = await page.evaluate(() => {
    const root = document.querySelector('.tab-view.active[data-tab-view-kind="image-editor"]');
    const controller = window.markdownViewerApp.services.imageEditor.getView(root.dataset.tabId);
    controller.layerPanel.runAction("edit-drop-shadow");
    const layer = controller.documentStore.activeLayer();
    return { layerId: layer.id, tabId: root.dataset.tabId };
  });
  const dialog = page.locator(".image-editor-layer-style-dialog");
  await dialog.locator('[name="opacity"]').fill("100");
  await dialog.locator('[name="angle"]').fill("180");
  await dialog.locator('[name="distance"]').fill("12");
  await dialog.locator('[name="blur"]').fill("4");
  await dialog.locator('[data-layer-style-action="apply"]').click();

  const result = await page.evaluate(({ layerId, tabId }) => {
    const controller = window.markdownViewerApp.services.imageEditor.getView(tabId);
    const layer = window.MarkdownViewerImageEditor.findDocumentNode(controller.documentStore.document, layerId).node;
    const pixels = controller.view.context.getImageData(0, 0, 120, 90).data;
    let shadowPixels = 0;
    for (let y = 0; y < 90; y += 1) {
      for (let x = 0; x < 120; x += 1) {
        if (x >= 35 && x <= 65 && y >= 25 && y <= 55) continue;
        const offset = (y * 120 + x) * 4;
        if (pixels[offset + 3] > 0) shadowPixels += 1;
      }
    }
    return { layerName: layer.name, effect: layer.effects.find((item) => item.type === "drop-shadow"), shadowPixels };
  }, target);
  expect(result).toMatchObject({
    layerName: "Rectangle",
    effect: { type: "drop-shadow", enabled: true, opacity: 1, angle: 180, distance: 12, blur: 4 }
  });
  expect(result.shadowPixels).toBeGreaterThan(0);
});
