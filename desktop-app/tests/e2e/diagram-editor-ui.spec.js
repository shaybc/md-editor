const { expect, test } = require("./desktop-fixture");
const { stubBrowserLibraries } = require("../helpers/candidate-app-helpers");

test.beforeEach(async ({ page }) => {
  page.errors = [];
  await stubBrowserLibraries(page);
  page.on("pageerror", (error) => page.errors.push(error.message));
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled", sidebarVisible: true, menuLayout: "full" }));
    window.showSaveFilePicker = async () => ({
      name: "offline-diagram.drawio",
      async createWritable() {
        return {
          async write(xml) { window.__savedDiagramXml = String(xml); },
          async close() {}
        };
      }
    });
  });
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test("retries bridge startup once and reports a terminal failure", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.MarkdownViewerDiagramBridge?.createBridge, null, { timeout: 60000 });

  const result = await page.evaluate(async () => {
    const assignedUrls = [];
    const frameListeners = new Map();
    const fakeFrame = {
      contentWindow: { postMessage() {} },
      addEventListener(name, listener) { frameListeners.set(name, listener); },
      removeEventListener(name) { frameListeners.delete(name); },
      set src(value) { assignedUrls.push(value); },
      get src() { return assignedUrls[assignedUrls.length - 1] || ""; }
    };
    const lifecycleEvents = [];
    const failureMessages = [];
    const bridge = window.MarkdownViewerDiagramBridge.createBridge(fakeFrame, {
      xml: "",
      startupTimeoutMs: 10,
      onLifecycle(event) { lifecycleEvents.push(event); },
      onFailure(error) { failureMessages.push(error.message); }
    });

    await new Promise((resolve) => setTimeout(resolve, 50));
    const ready = bridge.isReady();
    bridge.dispose();
    return { assignedUrls, lifecycleEvents, failureMessages, ready, listenerCount: frameListeners.size };
  });

  expect(result.ready).toBe(false);
  expect(result.assignedUrls).toHaveLength(3);
  expect(result.assignedUrls[0]).not.toContain("mdEditorStartupAttempt");
  expect(result.assignedUrls[1]).toContain("mdEditorStartupAttempt=2");
  expect(result.assignedUrls[2]).toBe("about:blank");
  expect(result.lifecycleEvents.map((event) => event.phase)).toEqual([
    "startup-attempt",
    "startup-timeout",
    "startup-retry",
    "startup-attempt",
    "startup-timeout",
    "startup-failed",
    "disposed"
  ]);
  expect(result.failureMessages).toEqual([expect.stringContaining("after 2 attempts")]);
  expect(result.listenerCount).toBe(0);
});

test("opens the bundled offline Diagram Editor and saves native draw.io XML", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openBlankDiagramEditorInTab, null, { timeout: 60000 });

  const externalDiagramRequests = [];
  page.on("request", (request) => {
    const url = request.url();
    if (/^https?:/i.test(url) && !/^http:\/\/(127\.0\.0\.1|localhost)(:|\/)/i.test(url)) externalDiagramRequests.push(url);
  });
  await expect(page.locator(".sidebar-view-rail .open-diagram-editor-tool")).toHaveCount(0);
  const fileMenu = page.locator(".application-menu-file");
  await fileMenu.locator("> .application-menu-category-toggle").click();
  await expect(fileMenu.locator(".diagram-export-submenu")).toBeHidden();
  await fileMenu.locator("> .application-menu-category-toggle").click();

  const toolsMenu = page.locator(".application-menu-tools");
  await toolsMenu.locator("> .application-menu-category-toggle").click();
  await expect(toolsMenu.locator(".open-image-editor-tool")).toHaveCount(0);
  await expect(toolsMenu.locator(".open-diagram-editor-tool")).toHaveCount(0);
  await toolsMenu.locator("> .application-menu-category-toggle").click();

  await fileMenu.locator("> .application-menu-category-toggle").click();
  await fileMenu.locator(".new-file-submenu > .dropdown-toggle").hover();
  await fileMenu.locator(".new-file-submenu .open-diagram-editor-tool").click();
  await expect(page.locator(".diagram-editor-shell")).toBeVisible();
  await expect(page.locator('.sidebar-view-option[data-sidebar-view="files"]')).toHaveClass(/active/);
  await expect(page.locator(".diagram-editor-toolbar")).toHaveCount(0);
  await expect(page.locator(".content-container")).not.toHaveClass(/sidebar-hidden/);
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Untitled Diagram.drawio");
  await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);

  const editor = page.frameLocator(".diagram-editor-frame");
  await expect(editor.locator("body")).toBeVisible({ timeout: 60000 });
  await expect(editor.locator("body")).toContainText("General");
  await expect(editor.locator("body")).toContainText("Flowchart");
  await expect(editor.locator("body")).toContainText("UML");
  const shapeLibraries = await editor.locator("body").evaluate(() => ({
    selected: Sidebar.prototype.defaultEntries.split(";"),
    enabled: Sidebar.prototype.enabledLibraries,
    urlSelection: urlParams.libs
  }));
  expect(shapeLibraries.selected.length).toBeGreaterThan(60);
  expect(shapeLibraries.selected).toEqual(expect.arrayContaining(["general", "uml", "aws4", "kubernetes", "electrical", "sysml"]));
  expect(shapeLibraries.enabled).toBeNull();
  expect(shapeLibraries.urlSelection).toBe(shapeLibraries.selected.join(";"));

  await page.evaluate(() => {
    Neutralino.os.showSaveDialog = async () => "C:/tmp/offline-diagram.drawio";
    Neutralino.filesystem.writeFile = async (_path, xml) => { window.__savedDiagramXml = String(xml); };
  });

  await fileMenu.locator("> .application-menu-category-toggle").click();
  await fileMenu.locator(".save-current-file-button").click();
  await expect.poll(() => page.evaluate(() => window.__savedDiagramXml || "")).toContain("<mxfile");
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);

  await page.evaluate(() => {
    window.__diagramExports = {};
    Neutralino.os.showSaveDialog = async (title) => title.includes("PNG") ? "C:/tmp/offline-diagram.png" : "C:/tmp/offline-diagram.pdf";
    Neutralino.filesystem.writeBinaryFile = async (path, bytes) => { window.__diagramExports[path.split(/[\\/]/).pop()] = bytes.byteLength; };
    window.jspdf = {
      jsPDF: function() {
        return {
          addPage() {},
          addImage() {},
          output() { return new Blob(["pdf"], { type: "application/pdf" }); }
        };
      }
    };
  });
  await fileMenu.locator("> .application-menu-category-toggle").click();
  await expect(fileMenu.locator(".diagram-export-submenu")).toBeVisible();
  await fileMenu.locator(".diagram-export-submenu").hover();
  await fileMenu.locator('[data-diagram-export-format="png"]').click();
  await expect.poll(() => page.evaluate(() => window.__diagramExports["offline-diagram.png"] || 0), { timeout: 30000 }).toBeGreaterThan(0);
  await fileMenu.locator("> .application-menu-category-toggle").click();
  await expect(fileMenu.locator(".diagram-export-submenu")).toBeVisible();
  await fileMenu.locator(".diagram-export-submenu").hover();
  await fileMenu.locator('[data-diagram-export-format="pdf"]').click();
  await expect.poll(() => page.evaluate(() => window.__diagramExports["offline-diagram.pdf"] || 0), { timeout: 30000 }).toBeGreaterThan(0);
  expect(externalDiagramRequests).toEqual([]);
  const frameUrl = await page.locator(".diagram-editor-frame").getAttribute("src");
  expect(frameUrl).toMatch(/^\/vendor\/diagram-editor\/index\.html\?/);
  expect(frameUrl).toContain("offline=1");
  expect(frameUrl).toContain("plugins=0");

  await page.evaluate(() => document.querySelector(".toggle-sidebar")?.click());
  await expect(page.locator(".content-container")).toHaveClass(/sidebar-hidden/);
  await page.locator("#tab-list .tab-item:not(.active)").first().click();
  await expect(page.locator('.sidebar-view-option[data-sidebar-view="files"]')).toHaveClass(/active/);
  await expect(page.locator(".content-container")).toHaveClass(/sidebar-hidden/);
  await expect(page.locator(".diagram-editor-shell")).toBeHidden();

  await fileMenu.locator("> .application-menu-category-toggle").click();
  await expect(fileMenu.locator(".diagram-export-submenu")).toBeHidden();
  await fileMenu.locator("> .application-menu-category-toggle").click();
  await page.locator("#tab-list .tab-item").filter({ hasText: "offline-diagram.drawio" }).click();
  await expect(page.locator(".content-container")).toHaveClass(/sidebar-hidden/);
  await expect(page.locator(".diagram-editor-shell")).toBeVisible();

  await page.locator('.sidebar-view-option[data-sidebar-view="files"]').click();
  await expect(page.locator('.sidebar-view-option[data-sidebar-view="files"]')).toHaveClass(/active/);
  await expect(page.locator(".content-container")).not.toHaveClass(/sidebar-hidden/);
  await expect(page.locator(".diagram-editor-shell")).toBeVisible();
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("offline-diagram.drawio");
});

test("opens draw.io XML once and focuses the existing tab on repeat", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => typeof window.markdownViewerOpenDocumentSourceFile === "function", null, { timeout: 60000 });
  const xml = '<?xml version="1.0"?><mxfile host="MD-Editor"><diagram id="page-1" name="Page-1"><mxGraphModel><root><mxCell id="0"/><mxCell id="1" parent="0"/></root></mxGraphModel></diagram></mxfile>';
  await page.evaluate(async (diagramXml) => {
    await window.markdownViewerOpenDocumentSourceFile({ name: "architecture.xml", path: "C:/tmp/architecture.xml", content: diagramXml });
  }, xml);
  await expect(page.locator(".diagram-editor-shell:visible")).toBeVisible();
  await expect(page.locator('.sidebar-view-option[data-sidebar-view="files"]')).toHaveClass(/active/);
  await expect(page.locator(".content-container")).not.toHaveClass(/sidebar-hidden/);
  await page.evaluate(async (diagramXml) => {
    await window.markdownViewerOpenDocumentSourceFile({ name: "architecture.xml", path: "C:/tmp/architecture.xml", content: diagramXml });
  }, xml);
  await expect(page.locator("#tab-list .tab-item").filter({ hasText: "architecture.xml" })).toHaveCount(1);
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("architecture.xml");
});
