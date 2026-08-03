const { expect, test } = require("./desktop-fixture");
const {
  stubBrowserLibraries,
  openApp,
  clickEditorFormatButton,
  selectSettingsTab,
} = require("../helpers/candidate-app-helpers");

test.beforeEach(async ({ page }) => {
  page.errors = [];
  await stubBrowserLibraries(page);
  page.on("pageerror", (error) => page.errors.push(error.message));
});

test.afterEach(async ({ page }) => {
  expect(page.errors).toEqual([]);
});

test("editor hover merges a diagnostic with delayed LSP information in one popup", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.MarkdownViewerCodeMirror?.createEditor);

  await page.evaluate(() => {
    const host = document.createElement("div");
    host.className = "codemirror-editor unified-hover-e2e-host";
    Object.assign(host.style, {
      position: "fixed",
      left: "80px",
      top: "100px",
      zIndex: "4900",
      width: "620px",
      height: "160px",
      background: "var(--editor-bg)"
    });
    document.body.appendChild(host);

    const handlers = new Set();
    const methods = [];
    const quickFixRequests = [];
    const openedActionIds = [];
    const emit = (message) => {
      const payload = JSON.stringify(message);
      for (const handler of handlers) handler(payload);
    };
    const transport = {
      getRequestTimeoutMs() { return 5000; },
      subscribe(handler) { handlers.add(handler); },
      unsubscribe(handler) { handlers.delete(handler); },
      send(payload) {
        const message = JSON.parse(payload);
        methods.push(message.method || "response");
        if (message.method === "initialize") {
          queueMicrotask(() => emit({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              capabilities: {
                hoverProvider: true,
                textDocumentSync: { openClose: true, change: 1 }
              }
            }
          }));
        } else if (message.method === "textDocument/hover") {
          setTimeout(() => emit({
            jsonrpc: "2.0",
            id: message.id,
            result: {
              contents: { kind: "markdown", value: "**Mock symbol information**" },
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 11 }
              }
            }
          }), 900);
        } else if (message.id != null) {
          queueMicrotask(() => emit({ jsonrpc: "2.0", id: message.id, result: null }));
        }
      }
    };
    const editor = window.MarkdownViewerCodeMirror.createEditor({
      parent: host,
      doc: "targetValue",
      language: "java",
      getEditorQuickFixSuggestions(request) {
        quickFixRequests.push(request);
        return new Promise((resolve) => setTimeout(() => resolve({
          diagnostic: { isLiveDiagnostic: true, filePath: "C:/workspace/UnifiedHover.java" },
          actions: [{ id: "jdt-create-field", title: "Create field 'targetValue'", provenance: "JDT", isPreferred: true }]
        }), 80));
      },
      openEditorQuickFix(_result, actionId) {
        openedActionIds.push(actionId);
      }
    });
    editor.setLspSession({
      transport,
      fileUri: "file:///C:/workspace/UnifiedHover.java",
      languageId: "java",
      rootUri: "file:///C:/workspace"
    });
    window.__unifiedHoverE2E = {
      editor,
      host,
      methods,
      quickFixRequests,
      openedActionIds,
      publishDiagnostic() {
        emit({
          jsonrpc: "2.0",
          method: "textDocument/publishDiagnostics",
          params: {
            uri: "file:///C:/workspace/UnifiedHover.java",
            diagnostics: [{
              range: {
                start: { line: 0, character: 0 },
                end: { line: 0, character: 11 }
              },
              severity: 1,
              message: "Mock diagnostic problem"
            }]
          }
        });
      }
    };
  });

  await expect.poll(() => page.evaluate(() => window.__unifiedHoverE2E.methods.includes("textDocument/didOpen"))).toBe(true);
  await page.evaluate(() => window.__unifiedHoverE2E.publishDiagnostic());
  await expect(page.locator(".unified-hover-e2e-host .cm-lintRange-error")).toHaveCount(1);
  await expect(page.locator(".unified-hover-e2e-host .cm-lint-marker-error")).toHaveCount(1);

  const hoverPoint = await page.evaluate(() => {
    const rectangle = window.__unifiedHoverE2E.editor.view.coordsAtPos(3);
    return { x: rectangle.left + 2, y: (rectangle.top + rectangle.bottom) / 2 };
  });
  await page.mouse.move(hoverPoint.x, hoverPoint.y);

  const allHoverTooltips = page.locator(".cm-tooltip.cm-tooltip-hover");
  const hoverTooltips = allHoverTooltips.filter({ has: page.locator(".cm-unified-hover-tooltip") });
  await expect(allHoverTooltips).toHaveCount(1);
  await expect(hoverTooltips).toHaveCount(1);
  await expect(hoverTooltips.locator(".cm-unified-hover-diagnostic-message")).toHaveText("Mock diagnostic problem");
  const quickFixAction = hoverTooltips.getByRole("button", { name: /Create field 'targetValue'/ });
  await expect(quickFixAction).toBeVisible();
  await expect(hoverTooltips.getByRole("button", { name: "Open Quick Fix..." })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__unifiedHoverE2E.quickFixRequests[0])).toEqual({
    uri: "file:///C:/workspace/UnifiedHover.java",
    range: {
      start: { line: 0, character: 0 },
      end: { line: 0, character: 11 }
    },
    message: "Mock diagnostic problem"
  });
  await expect(hoverTooltips.locator(".cm-lsp-hover-tooltip-content")).toHaveCount(0);
  await expect(hoverTooltips.locator(".cm-lsp-hover-tooltip-content")).toContainText("Mock symbol information", { timeout: 3000 });
  await expect(allHoverTooltips).toHaveCount(1);
  await expect(hoverTooltips).toHaveCount(1);
  await expect(hoverTooltips.locator(".cm-unified-hover-diagnostics + .cm-unified-hover-divider")).toBeVisible();
  await quickFixAction.evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__unifiedHoverE2E.openedActionIds)).toEqual(["jdt-create-field"]);

  await page.evaluate(() => {
    window.__unifiedHoverE2E.editor.destroy();
    window.__unifiedHoverE2E.host.remove();
    delete window.__unifiedHoverE2E;
  });
});

test("bookmark context menu copies cuts and deletes bookmarked lines", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
    window.__bookmarkClipboardText = "";
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: {
        writeText: async (text) => {
          window.__bookmarkClipboardText = text;
        }
      }
    });
    document.execCommand = (command) => {
      if (command === "copy" && document.activeElement) {
        window.__bookmarkClipboardText = document.activeElement.value || "";
        return true;
      }
      return false;
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.codeMirrorEditor?.getView?.());

  async function setEditorText(lines) {
    await page.evaluate((text) => {
      const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: text
        }
      });
    }, lines.join("\n"));
  }

  async function bookmarkLinesContaining(term) {
    await page.locator(".codemirror-editor .cm-content").focus();
    await page.keyboard.press("Control+F");
    await expect(page.locator("#editor-find-replace-modal")).toBeVisible();
    await page.locator("#editor-find-input").fill(term);
    await page.locator("#editor-bookmark-find-lines").click();
    await page.locator("#editor-find-replace-close").click();
    await expect(page.locator("#editor-find-replace-modal")).not.toBeVisible();
  }

  async function openBookmarkMenu() {
    await page.locator(".cm-findLineBookmarkMarker").first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        buttons: 2,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        view: window
      }));
    });
    await expect(page.locator("#editor-bookmark-context-menu")).toBeVisible();
  }

  await setEditorText(["keep one", "alpha copy", "keep two", "alpha later", "keep three"]);
  await bookmarkLinesContaining("alpha");
  await expect(page.locator(".cm-findLineBookmarkMarker")).toHaveCount(2);
  await page.evaluate(() => {
    const host = document.createElement("div");
    host.style.display = "none";
    document.body.appendChild(host);
    window.__staleBookmarkEditorView = window.MarkdownViewerCodeMirror.createEditor({
      parent: host,
      doc: "plain text"
    });
  });

  await openBookmarkMenu();
  await expect(page.locator("[data-bookmark-context-action='copy-lines']")).toBeEnabled();
  await page.locator("[data-bookmark-context-action='copy-lines']").click();
  await expect.poll(() => page.evaluate(() => window.__bookmarkClipboardText)).toBe("alpha copy\nalpha later");
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.codeMirrorEditor.getView().state.doc.toString()))
    .toBe(["keep one", "alpha copy", "keep two", "alpha later", "keep three"].join("\n"));

  await openBookmarkMenu();
  await page.locator("[data-bookmark-context-action='delete-lines']").click();
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.codeMirrorEditor.getView().state.doc.toString()))
    .toBe(["keep one", "keep two", "keep three"].join("\n"));
  await expect(page.locator(".cm-findLineBookmarkMarker")).toHaveCount(0);

  await setEditorText(["alpha first", "middle", "alpha second", "tail"]);
  await bookmarkLinesContaining("alpha");
  await openBookmarkMenu();
  await page.locator("[data-bookmark-context-action='cut-lines']").click();
  await expect.poll(() => page.evaluate(() => window.__bookmarkClipboardText)).toBe("alpha first\nalpha second");
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.codeMirrorEditor.getView().state.doc.toString()))
    .toBe(["middle", "tail"].join("\n"));
  await expect(page.locator(".cm-findLineBookmarkMarker")).toHaveCount(0);
});

test("editor selection occurrence highlights distinguish the active match and require two characters", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled", theme: "dark" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.codeMirrorEditor?.getView?.());

  await page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: "Alpha alpha ALPHA beta" },
      selection: { anchor: 0, head: 1 }
    });
  });

  await expect(page.locator(".cm-selectionMatch")).toHaveCount(0);
  await page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    view.dispatch({ selection: { anchor: 0, head: 5 } });
    view.focus();
  });

  await expect(page.locator(".cm-selectionMatch")).toHaveCount(0);
  await expect(page.locator(".cm-selectionMatch-selected")).toHaveCount(1);
  const selectedMatchStyles = await page.locator(".cm-selectionMatch-selected").evaluate((element) => {
    const styles = getComputedStyle(element);
    return { backgroundColor: styles.backgroundColor, color: styles.color };
  });
  expect(selectedMatchStyles).toEqual({ backgroundColor: "rgba(0, 0, 0, 0)", color: "rgb(0, 0, 0)" });
  await expect(page.locator(".cm-activeLine")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".cm-selectionLayer .cm-selectionBackground")).toHaveCount(1);
  const activeSelectionBackground = await page.locator(".cm-selectionLayer .cm-selectionBackground").evaluate((element) => {
    return getComputedStyle(element).backgroundColor;
  });
  expect(activeSelectionBackground).toBe("rgba(255, 241, 118, 0.8)");
  await page.evaluate(() => window.markdownViewerApp.modules.codeMirrorEditor.setSelectionMatchCaseSensitive(false));
  await expect(page.locator(".cm-selectionMatch")).toHaveCount(2);
  await expect(page.locator(".cm-selectionMatch-selected")).toHaveCount(1);
  const matchStyles = await page.locator(".cm-selectionMatch:not(.cm-selectionMatch-selected)").first().evaluate((element) => {
    const styles = getComputedStyle(element);
    return { backgroundColor: styles.backgroundColor, color: styles.color };
  });
  expect(matchStyles).toEqual({ backgroundColor: "rgba(139, 181, 128, 0.34)", color: "rgb(201, 209, 217)" });

  await page.evaluate(() => window.markdownViewerApp.modules.codeMirrorEditor.setSelectionMatchCaseSensitive(true));
  await expect(page.locator(".cm-selectionMatch")).toHaveCount(0);
  await page.evaluate(() => {
    document.documentElement.setAttribute("data-theme", "light");
    document.documentElement.style.setProperty("--editor-current-line-bg", "rgba(220, 226, 235, 0.62)");
    document.documentElement.style.setProperty("--editor-current-selection-bg", "rgba(255, 241, 118, 0.8)");
  });
  await expect(page.locator(".cm-activeLine")).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  await expect(page.locator(".cm-selectionLayer .cm-selectionBackground")).toHaveCSS("background-color", "rgba(255, 241, 118, 0.8)");
});

test("shows active dropzone state during drag", async ({ page }) => {
  await openApp(page);

  const dropzone = page.locator("#dropzone");
  await dropzone.dispatchEvent("dragenter");
  await expect(dropzone).toHaveClass(/active/);

  await dropzone.dispatchEvent("dragleave");
  await expect(dropzone).not.toHaveClass(/active/);
});

test("marks edited documents as unsaved", async ({ page }) => {
  await openApp(page);

  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
  await page.locator("#markdown-editor").fill("# Unsaved Draft\n\nChanged content.");

  await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);
  await expect.poll(() => page.evaluate(() => window.markdownViewerHasUnsavedChanges())).toBe(true);
});

test("overrides and restores an editor tab language from the searchable Parse as submenu", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.codeMirrorEditor?.getView?.());
  await page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: '<div class="card"><span>Hello</span></div>' } });
  });
  const editorHost = page.locator(".tab-view:not([hidden]) .codemirror-editor");
  const markdownToolbar = page.locator(".editor-formatting-toolbar");
  const activeTab = page.locator("#tab-list .tab-item.active");
  const originalTitle = await activeTab.getAttribute("title");

  await activeTab.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 420, clientY: 110 });
  const parseAs = page.locator(".tab-parse-as-submenu");
  await expect(parseAs).toBeVisible();
  await parseAs.hover();
  const filter = page.locator(".tab-parse-as-filter");
  await filter.fill("html");
  await expect(page.locator(".tab-parse-as-choice:not(.hidden)[data-language-id='html']")).toBeVisible();
  await page.locator(".tab-parse-as-choice[data-language-id='html']").click();

  await expect(editorHost).toHaveAttribute("data-language", "html");
  await expect(markdownToolbar).toBeHidden();
  await expect(activeTab).toHaveAttribute("title", originalTitle);
  await expect(activeTab).toHaveClass(/unsaved/);
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.parseAsLanguageId)).toBe("html");

  await activeTab.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 420, clientY: 110 });
  await parseAs.hover();
  await page.locator(".tab-parse-as-choice[data-language-id='']").click();
  await expect(editorHost).toHaveAttribute("data-language", "markdown");
  await expect(markdownToolbar).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.parseAsLanguageId)).toBe(null);
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.codeMirrorEditor.getView().state.doc.toString()))
    .toBe("<div class=\"card\"><span>Hello</span></div>");
});

test("reloads the active disk-backed tab with Ctrl+R and the menu action", async ({ page }) => {
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs);

  await page.evaluate(() => {
    window.__reloadDiskContent = "# Reload Note\n\nOriginal";
    const fileHandle = {
      kind: "file",
      name: "reload-note.md",
      getFile: async () => new File([window.__reloadDiskContent], "reload-note.md", { type: "text/markdown" }),
      createWritable: async () => ({
        write: async () => {},
        close: async () => {}
      })
    };
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Reload Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });
  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "reload-note.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true }));
  });
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.content)).toBe("# Reload Note\n\nOriginal");
  await expect(page.locator(".reload-current-file-button").first()).toBeEnabled();

  await page.evaluate(() => {
    window.markdownViewerApp.modules.tabs.getActiveTab().content = "# Reload Note\n\nUnsaved local edit";
    window.markdownViewerApp.modules.tabs.markCurrentTabSessionDirty();
  });
  await page.evaluate(() => {
    window.__reloadDiskContent = "# Reload Note\n\nChanged on disk";
  });
  await page.evaluate(() => {
    window.markdownViewerApp.modules.codeMirrorEditor.getView()?.focus();
  });
  await page.keyboard.press("Control+R");
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.content)).toBe("# Reload Note\n\nChanged on disk");
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);

  await page.evaluate(() => {
    window.markdownViewerApp.modules.tabs.getActiveTab().content = "# Reload Note\n\nSecond local edit";
    window.markdownViewerApp.modules.tabs.markCurrentTabSessionDirty();
  });
  await page.evaluate(() => {
    window.__reloadDiskContent = "# Reload Note\n\nReloaded from menu";
  });
  await page.locator(".reload-current-file-button").first().click();
  await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.content)).toBe("# Reload Note\n\nReloaded from menu");
  await expect(page.locator("#tab-list .tab-item.active")).not.toHaveClass(/unsaved/);
});

test("duplicating a source tab preserves file type and can save immediately", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.__saveDialogs = [];
    window.__writtenFiles = [];
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        showSaveDialog: async (title, options) => {
          window.__saveDialogs.push({ title, options });
          return "C:/vault/JarHandlerUtils1 (copy).java";
        }
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") return [{ entry: "JarHandlerUtils1.java", type: "FILE" }];
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === "C:/vault/JarHandlerUtils1.java") return "public class JarHandlerUtils1 {\n}";
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async (path, content) => {
          window.__writtenFiles.push({ path, content });
        }
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs && !!document.querySelector("#import-from-folder"));

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file[data-name='JarHandlerUtils1.java']").evaluate((button) => {
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });

  const originalTab = page.locator("#tab-list .tab-item", { hasText: "JarHandlerUtils1.java" }).first();
  await originalTab.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 180, clientY: 140 });
  await page.locator(".tab-context-menu-action[data-action='duplicate']").evaluate((button) => button.click());

  await expect(page.locator("#tab-list .tab-item.active", { hasText: "JarHandlerUtils1 (copy).java" })).toBeVisible();
  await expect(page.locator(".save-current-file-button").first()).toBeEnabled();
  await expect.poll(() => page.locator("#codemirror-editor").getAttribute("data-language")).toBe("java");

  const duplicateMetadata = await page.evaluate(() => {
    const tabs = JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]");
    const activeTabId = localStorage.getItem("markdownViewerActiveTab");
    const tab = tabs.find((entry) => entry.id === activeTabId);
    return {
      title: tab.title,
      sourceFileName: tab.sourceFileName,
      sourceFilePath: tab.sourceFilePath,
      hasUnsavedChanges: tab.savedContent !== tab.content,
      viewMode: tab.viewMode
    };
  });
  expect(duplicateMetadata).toEqual({
    title: "JarHandlerUtils1 (copy).java",
    sourceFileName: "JarHandlerUtils1 (copy).java",
    sourceFilePath: null,
    hasUnsavedChanges: true,
    viewMode: "editor"
  });

  await page.locator(".save-current-file-button").first().click();
  await expect.poll(() => page.evaluate(() => window.__saveDialogs[0]?.options?.defaultPath)).toBe("C:/vault/JarHandlerUtils1 (copy).java");
  await expect.poll(() => page.evaluate(() => window.__saveDialogs[0]?.options?.filters?.[0]?.extensions)).toEqual(["java"]);
  await expect.poll(() => page.evaluate(() => window.__writtenFiles[0])).toEqual({
    path: "C:/vault/JarHandlerUtils1 (copy).java",
    content: "public class JarHandlerUtils1 {\n}"
  });
});

test("copies markdown content to the clipboard", async ({ page, context }) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await openApp(page);

  const markdown = "# Clipboard Check\n\nCopied from the editor.";
  await page.locator("#markdown-editor").fill(markdown);
  await page.locator("#copy-markdown-button").click({ force: true });

  await expect(page.locator("#copy-markdown-button")).toContainText("Copied!");
  await expect.poll(async () => {
    const copiedText = await page.evaluate(() => navigator.clipboard.readText());
    return copiedText.replace(/\r\n/g, "\n");
  }).toBe(markdown);
});
