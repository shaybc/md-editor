const { test, expect } = require("./desktop-fixture");
const {
  activeEditorValue,
  codeMirrorDocText,
  focusCodeMirror,
  openActionMenu,
  openApp,
  selectViewMode,
  setActiveEditorSelection,
  setActiveEditorValue,
} = require("../helpers/desktop-ui");

async function waitForActiveEditorSelection(page, from, to) {
  await expect.poll(() => page.evaluate(() => {
    const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
    if (!view) return null;
    const selection = view.state.selection.main;
    return { from: selection.from, to: selection.to };
  })).toEqual({ from, to });
}

async function setAndWaitForActiveEditorSelection(page, from, to) {
  await expect.poll(async () => {
    await setActiveEditorSelection(page, from, to);
    return page.evaluate(() => {
      const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
      if (!view) return null;
      const selection = view.state.selection.main;
      return { from: selection.from, to: selection.to };
    });
  }).toEqual({ from, to });
}

async function openEditorEditSubmenu(page) {
  await page.locator(".codemirror-editor .cm-content").last().dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 240,
    clientY: 220,
  });
  const editButton = page.locator("#editor-context-menu").getByRole("menuitem", { name: "Edit", exact: true });
  const editSubmenu = editButton.locator("..");
  await editButton.hover();
  return editSubmenu;
}

async function openEditorSourceSubmenu(page) {
  const sourceButton = page.locator("#editor-context-menu").getByRole("menuitem", { name: "Source", exact: true });
  const sourceSubmenu = sourceButton.locator("..");
  await sourceButton.hover();
  return sourceSubmenu;
}

async function openUtf8ConvertSubmenu(page) {
  const editSubmenu = await openEditorEditSubmenu(page);
  const unicodeSubmenu = editSubmenu.locator(".editor-context-menu-submenu", { hasText: "UTF8 Convert" }).first();
  await unicodeSubmenu.locator("> button").hover();
  return unicodeSubmenu;
}

async function openEncodedUriSubmenu(page) {
  const editSubmenu = await openEditorEditSubmenu(page);
  const uriSubmenu = editSubmenu.locator(".editor-context-menu-submenu", { hasText: "Encoded URI" }).last();
  await expect(uriSubmenu.locator("> button")).toContainText("Encoded URI");
  await uriSubmenu.locator("> button").hover();
  return uriSubmenu;
}

async function openBase64Submenu(page) {
  const editSubmenu = await openEditorEditSubmenu(page);
  const base64Submenu = editSubmenu.locator(".editor-context-menu-submenu", { hasText: "Base64" }).first();
  await expect(base64Submenu.locator("> button")).toContainText("Base64");
  await base64Submenu.locator("> button").hover();
  return base64Submenu;
}

async function openEditorEditNamedSubmenu(page, label) {
  const editSubmenu = await openEditorEditSubmenu(page);
  const submenu = editSubmenu.locator(".editor-context-menu-submenu", { hasText: label }).first();
  await expect(submenu.locator("> button")).toContainText(label);
  await submenu.locator("> button").hover();
  return submenu;
}

async function openMainEditNamedSubmenu(page, label) {
  await openActionMenu(page);
  const editSubmenu = page.locator(".edit-menu-submenu");
  await editSubmenu.locator("> .dropdown-toggle").hover();
  const submenuLabels = {
    "UTF8 Convert": "UTF8 conversion options",
    "Encoded URI": "Encoded URI options",
    Base64: "Base64 options",
    JSON: "JSON conversion options",
  };
  const submenu = editSubmenu.locator(`.action-submenu[aria-label="${submenuLabels[label]}"]`).locator("..");
  await expect(submenu.locator("> .dropdown-toggle")).toContainText(label);
  await submenu.locator("> .dropdown-toggle").hover();
  return submenu;
}

test.describe("desktop editor UI", () => {
  test("switches editor split and preview modes", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("# Preview Title\n\n**Bold body**");

    await selectViewMode(page, "preview");
    await expect(page.locator(".view-mode-btn[data-mode=\"preview\"]")).toHaveAttribute("aria-pressed", "true");

    await selectViewMode(page, "split");
    await expect(page.locator(".cm-editor")).toBeVisible();
    await expect(page.locator(".view-mode-btn[data-mode=\"split\"]")).toHaveAttribute("aria-pressed", "true");

    await selectViewMode(page, "editor");
    await expect(page.locator(".cm-editor")).toBeVisible();
  });

  test("Ctrl-click does not show the crash overlay when CodeMirror cannot resolve coordinates", async ({ page }) => {
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await setActiveEditorValue(page, "alpha\nbeta");
    await expect.poll(() => codeMirrorDocText(page)).toBe("alpha\nbeta");

    await page.evaluate(() => {
      const editor = window.markdownViewerApp.modules.codeMirrorEditor;
      const view = editor.getView();
      const coords = view.coordsAtPos(1);
      Object.defineProperty(view, "posAtCoords", {
        configurable: true,
        value: () => { throw new TypeError("Cannot read properties of undefined (reading 'isText')"); },
      });
      view.contentDOM.dispatchEvent(new MouseEvent("click", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        ctrlKey: true,
        clientX: coords.left,
        clientY: coords.top,
      }));
    });

    await expect(page.locator("#startup-crash-overlay")).toHaveCount(0);
    expect(pageErrors.filter((message) => message.includes("isText"))).toEqual([]);
  });

  test("toolbar formatting and undo redo update the active editor", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("plain");
    await expect.poll(() => codeMirrorDocText(page)).toBe("plain");
    await setActiveEditorSelection(page, 0, 0);

    await page.locator('.editor-format-button[data-editor-format-action="strong"]').click();
    await expect.poll(() => codeMirrorDocText(page)).toBe("****plain");

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => codeMirrorDocText(page)).toBe("plain");

    await page.locator('.editor-format-button[data-editor-format-action="redo"]').click();
    await expect.poll(() => codeMirrorDocText(page)).toBe("****plain");
  });

  test("find replace dialog updates text and exposes bookmark controls", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("alpha\nbeta\nalpha");
    await expect.poll(() => codeMirrorDocText(page)).toBe("alpha\nbeta\nalpha");

    await page.locator('.editor-format-button[data-editor-format-action="find-replace"]').click();
    await expect(page.locator("#editor-find-replace-modal")).toBeVisible();

    await page.locator("#editor-find-input").fill("alpha");
    await expect(page.locator("#editor-find-replace-status")).toContainText("2");
    await expect(page.locator("#editor-bookmark-find-lines")).toBeVisible();

    await page.locator("#editor-replace-input").fill("gamma");
    await page.locator("#editor-replace-all").click();
    await expect.poll(() => activeEditorValue(page)).toBe("gamma\nbeta\ngamma");
  });

  test("find and replace retain input focus while selecting and replacing matches", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "alpha one alpha two alpha";
    await setActiveEditorValue(page, source);
    await focusCodeMirror(page);
    await page.keyboard.press("Control+F");

    const findInput = page.locator("#editor-find-input");
    await findInput.fill("alpha");
    await findInput.press("Enter");
    await expect(findInput).toBeFocused();
    const firstSelection = await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      const selection = editor.getView().state.selection.main;
      return { start: selection.from, end: selection.to, text: editor.getView().state.sliceDoc(selection.from, selection.to) };
    });
    expect(firstSelection.text).toBe("alpha");

    await findInput.press("Enter");
    await expect(findInput).toBeFocused();
    const secondSelection = await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      const selection = editor.getView().state.selection.main;
      return { start: selection.from, end: selection.to, text: editor.getView().state.sliceDoc(selection.from, selection.to) };
    });
    expect(secondSelection.text).toBe("alpha");
    expect(secondSelection.start).toBeGreaterThan(firstSelection.start);

    await page.keyboard.type("x");
    await expect(findInput).toHaveValue("alphax");
    await expect.poll(() => activeEditorValue(page)).toBe(source);

    await findInput.press("Escape");
    await page.keyboard.press("Control+H");
    const replaceInput = page.locator("#editor-replace-input");
    await expect(replaceInput).toBeFocused();
    await replaceInput.fill("alpha!");
    await replaceInput.press("Enter");
    await expect(replaceInput).toBeFocused();
    await expect.poll(() => activeEditorValue(page)).toBe("alpha one alpha two alpha!");
    await replaceInput.press("Enter");
    await expect(replaceInput).toBeFocused();
    await expect.poll(() => activeEditorValue(page)).toBe("alpha! one alpha two alpha!");
  });

  test("document stats update from editor content", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await page.locator(".cm-content").click();
    await page.keyboard.press("Control+A");
    await page.keyboard.type("one two\nthree");

    await expect(page.locator("#word-count")).toHaveText("3");
    await expect(page.locator("#line-count")).toHaveText("2");
  });

  test("content-edge drag preserves exact multi-row boundaries", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInTab);
    const source = [
      "class Example {",
      "\tvoid run() {",
      "\t\tif (ready) {",
      "\t\t\tfirst();",
      "\t\t\tsecond();",
      "\t\t}",
      "\t}",
      "}",
    ].join("\n");
    const fileName = `SelectionBoundary-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      const app = window.markdownViewerApp;
      app.modules.tabs.closeAllTabs({ promptForUnsaved: false, recordInHistory: false });
      app.modules.tabs.openSidebarFileInTab(content, fileName, {
        name: fileName,
        path: `C:/workspace/${fileName}`,
      }, { temporary: false, skipExistingSourceTab: true });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await focusCodeMirror(page);

    const dragPoints = await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      const view = editor.getView();
      const contentLeft = view.contentDOM.getBoundingClientRect().left + 1;
      return [view.state.doc.line(3), view.state.doc.line(6)].map((line) => {
        const bounds = view.coordsAtPos(line.from);
        return { x: contentLeft, y: (bounds.top + bounds.bottom) / 2 };
      });
    });

    await page.mouse.move(dragPoints[0].x, dragPoints[0].y);
    await page.mouse.down();
    await page.mouse.move(dragPoints[1].x, dragPoints[1].y);
    await page.mouse.up();

    const selection = await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      const mainSelection = editor.getView().state.selection.main;
      const range = { start: mainSelection.from, end: mainSelection.to };
      return {
        ...range,
        text: editor.getView().state.sliceDoc(range.start, range.end),
        rangeCursorCount: editor.getView().dom.querySelectorAll(".cm-cursorLayer .cm-cursor").length,
        lineStartInset: Math.round(editor.getView().coordsAtPos(editor.getView().state.doc.line(3).from).left - editor.getView().contentDOM.getBoundingClientRect().left),
      };
    });
    expect(selection).toEqual({
      start: source.indexOf("\t\tif (ready)"),
      end: source.indexOf("\t\t}", source.indexOf("second();")),
      text: "\t\tif (ready) {\n\t\t\tfirst();\n\t\t\tsecond();\n",
      rangeCursorCount: 0,
      lineStartInset: 0,
    });

    await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      const view = editor.getView();
      view.dispatch({ selection: { anchor: 0 } });
      view.focus();
    });
    await expect.poll(() => page.evaluate(() => {
      const app = window.markdownViewerApp;
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      return editor.getView().dom.querySelectorAll(".cm-cursorLayer .cm-cursor").length;
    })).toBe(1);
  });

  test("CodeMirror paste replacement normalizes Windows line endings", async ({ page }) => {
    await openApp(page);
    await focusCodeMirror(page);

    await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const codeMirror = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      codeMirror.replaceRange(0, 0, "alpha\r\nbeta");
    });

    await expect.poll(() => codeMirrorDocText(page)).toBe("alpha\nbeta");
  });

  test("find and replace supports match case preserve case and editor shortcuts", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type("Alpha alpha ALPHA");
    await expect.poll(() => codeMirrorDocText(page)).toBe("Alpha alpha ALPHA");
    await page.keyboard.press("Control+F");

    const modal = page.locator("#editor-find-replace-modal");
    await expect(modal).toBeVisible();
    await expect(modal).toHaveClass(/find-replace-collapsed/);
    await page.locator("#editor-find-input").fill("alpha");
    await expect(page.locator("#editor-find-replace-status")).toContainText("matches");

    await page.locator("#editor-find-match-case").click();
    await expect(page.locator("#editor-find-match-case")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#editor-find-replace-status")).toHaveText("1 of 1 matches");

    await focusCodeMirror(page);
    await page.keyboard.press("Control+H");
    await expect(modal).toHaveClass(/find-replace-expanded/);
    await expect(page.locator("#editor-replace-input")).toBeVisible();

    await page.locator("#editor-find-match-case").click();
    await page.locator("#editor-find-preserve-case").click();
    await expect(page.locator("#editor-find-preserve-case")).toHaveAttribute("aria-pressed", "true");
    await page.locator("#editor-find-input").fill("alpha");
    await page.locator("#editor-replace-input").fill("beta");
    await page.locator("#editor-replace-all").click();
    await expect.poll(() => codeMirrorDocText(page)).toBe("Beta beta BETA");
  });

  test("find can bookmark every line containing the search term", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await focusCodeMirror(page);
    await page.keyboard.press("Control+A");
    await page.keyboard.type([
      "alpha first",
      "beta alpha alpha",
      "ALPHA loud",
      "plain text",
      "alpha final",
    ].join("\n"));
    await expect.poll(() => codeMirrorDocText(page)).toContain("alpha final");
    await page.keyboard.press("Control+F");
    await expect(page.locator("#editor-find-replace-modal")).toBeVisible();

    await page.locator("#editor-find-input").fill("alpha");
    await expect(page.locator("#editor-find-replace-status")).toContainText("matches");
    await page.locator("#editor-bookmark-find-lines").click();
    await expect.poll(() => page.locator(".cm-findLineBookmarkMarker").count()).toBeGreaterThan(0);

    await page.locator("#editor-find-replace-close").click();
    await expect(page.locator("#editor-find-replace-modal")).not.toBeVisible();
    await expect.poll(() => page.locator(".cm-findLineBookmarkMarker").count()).toBeGreaterThan(0);

    await focusCodeMirror(page);
    await page.keyboard.press("Control+F");
    await page.locator("#editor-find-input").fill("alpha");
    await page.locator("#editor-find-match-case").click();
    await expect(page.locator("#editor-find-match-case")).toHaveAttribute("aria-pressed", "true");
    await expect(page.locator("#editor-find-replace-status")).toContainText("matches");
    await page.locator("#editor-bookmark-find-lines").click();
    await expect.poll(() => page.locator(".cm-findLineBookmarkMarker").count()).toBeGreaterThan(0);
  });

  test("bookmark gutter toggles manual line bookmarks", async ({ page }) => {
    await openApp(page);
    await setActiveEditorValue(page, ["first line", "second line", "third line"].join("\n"));

    await focusCodeMirror(page);
    await expect.poll(() => page.locator(".cm-findLineBookmarkEmptyMarker").count()).toBeGreaterThan(0);
    const bookmarkTargets = page.locator(".cm-findLineBookmarkEmptyMarker");
    await bookmarkTargets.first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        view: window,
      }));
    });

    await expect(page.locator(".cm-findLineBookmarkMarker")).toHaveCount(1);
    await page.locator(".cm-findLineBookmarkMarker").first().evaluate((element) => {
      const rect = element.getBoundingClientRect();
      element.dispatchEvent(new MouseEvent("mousedown", {
        bubbles: true,
        cancelable: true,
        button: 0,
        buttons: 1,
        clientX: rect.left + rect.width / 2,
        clientY: rect.top + rect.height / 2,
        view: window,
      }));
    });
    await expect(page.locator(".cm-findLineBookmarkMarker")).toHaveCount(0);
  });

  test("editor generic context menu includes editing actions", async ({ page }) => {
    await openApp(page);
    await setActiveEditorValue(page, "# Alpha\n\nBeta");
    await setActiveEditorSelection(page, 0, 0);

    await page.locator(".codemirror-editor .cm-content").last().dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 240,
      clientY: 220,
    });
    const menu = page.locator("#editor-context-menu");
    await expect(menu).toBeVisible();
    await expect(menu).toContainText("Emoji");
    await expect(menu).toContainText("Format File");
    await expect(menu).not.toContainText("Collapse all");
    await expect(menu).not.toContainText("Expand all");
    await expect(page.locator("[data-editor-context-action='collapse-all-folds']")).toHaveCount(0);
    await expect(page.locator("[data-editor-context-action='expand-all-folds']")).toHaveCount(0);
    await expect(page.locator("[data-editor-context-action='emoji']")).toBeVisible();
    await expect(page.locator("[data-editor-context-action='format-file']")).toHaveCount(1);
    const rootMenuLabels = await menu.locator("> .editor-context-menu-items > *").evaluateAll((elements) => elements.map((element) => {
      const button = element.matches("button") ? element : element.querySelector(":scope > button");
      return button?.querySelector("span")?.textContent?.trim() || "";
    }));
    expect(rootMenuLabels.indexOf("Edit")).toBeGreaterThan(-1);
    expect(rootMenuLabels.indexOf("Source")).toBeGreaterThan(-1);
    expect(rootMenuLabels.indexOf("Edit")).toBeLessThan(rootMenuLabels.indexOf("Source"));

    const editButton = menu.getByRole("menuitem", { name: "Edit", exact: true });
    const editSubmenu = editButton.locator("..");
    await editButton.hover();
    const disabledCopyAction = editSubmenu.locator('[data-editor-context-action="copy"]');
    await expect(disabledCopyAction).toBeDisabled();
    await expect(disabledCopyAction).toHaveCSS("cursor", "not-allowed");
    await expect(disabledCopyAction).toHaveCSS("opacity", "0.55");
  });

  test("Edit submenu groups no-selection editor actions", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    await setActiveEditorValue(page, "Alpha");
    await expect.poll(() => activeEditorValue(page)).toBe("Alpha");
    await setActiveEditorSelection(page, 0, 0);

    const editSubmenu = await openEditorEditSubmenu(page);
    const editActionOrder = await editSubmenu.locator("> .editor-context-menu-submenu-panel > *").evaluateAll((elements) => (
      elements.map((element) => element.dataset.editorContextAction || "")
    ));
    expect(editActionOrder).toEqual(["copy", "cut", "paste", "delete", "select-all"]);
    await expect(editSubmenu.locator('[data-editor-context-action="copy"]')).toBeDisabled();
    await expect(editSubmenu.locator('[data-editor-context-action="cut"]')).toBeDisabled();
    await expect(editSubmenu.locator('[data-editor-context-action="paste"]')).toBeVisible();
    await expect(editSubmenu.locator('[data-editor-context-action="delete"]')).toBeDisabled();
    await expect(editSubmenu.locator('[data-editor-context-action="select-all"]')).toBeVisible();
    await expect(page.locator("#editor-context-menu > .editor-context-menu-items > [data-editor-context-action='paste']")).toHaveCount(0);
  });

  test("Edit submenu deletes the selected text through editor undo history", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "Alpha Beta Omega";
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 6, 10);

    const editSubmenu = await openEditorEditSubmenu(page);
    const editActionOrder = await editSubmenu.locator("> .editor-context-menu-submenu-panel > *").evaluateAll((elements) => (
      elements.map((element) => element.dataset.editorContextAction
        || element.querySelector("button span")?.textContent
        || "")
    ));
    expect(editActionOrder.slice(0, 5)).toEqual(["copy", "cut", "paste", "delete", "select-all"]);
    const deleteAction = editSubmenu.locator('[data-editor-context-action="delete"]');
    await expect(deleteAction).toBeEnabled();
    await deleteAction.evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe("Alpha  Omega");
    await expect.poll(() => page.evaluate(() => {
      const selection = window.markdownViewerApp.modules.codeMirrorEditor.getView().state.selection.main;
      return { from: selection.from, to: selection.to };
    })).toEqual({ from: 6, to: 6 });

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
  });

  test("Edit submenu converts selected case and path separators", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "before C:\\Folder\\FILE after";
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 21);

    let submenu = await openEditorEditNamedSubmenu(page, "Convert Case to");
    await submenu.locator('[data-editor-context-action="lowercase"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe("before c:\\folder\\file after");

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 21);

    submenu = await openEditorEditNamedSubmenu(page, "Replace Path Separators");
    await submenu.locator('[data-editor-context-action="path-separators-backslash-to-slash"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe("before C:/Folder/FILE after");
  });

  test("main Edit menu converts selected Unicode, URI, and Base64 text", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "before שלום after";
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);

    await setAndWaitForActiveEditorSelection(page, 7, 11);
    let submenu = await openMainEditNamedSubmenu(page, "UTF8 Convert");
    await submenu.locator('[data-edit-command="unicode-hex-ncr"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe("before &#x05E9;&#x05DC;&#x05D5;&#x05DD; after");

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 11);
    submenu = await openMainEditNamedSubmenu(page, "Encoded URI");
    await submenu.locator('[data-edit-command="uri-encode"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe("before %D7%A9%D7%9C%D7%95%D7%9D after");

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 11);
    submenu = await openMainEditNamedSubmenu(page, "Base64");
    await submenu.locator('[data-edit-command="base64-encode"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe("before 16nXnNeV150= after");
  });

  test("JSON conversions live under Edit and preserve context and main-menu selection behavior", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = '{\n  "name": "value"\n}';
    const compactSource = '{"name":"value"}';
    const javaLiteral = '"{\\"name\\":\\"value\\"}"';
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 0, 0);

    let jsonSubmenu = await openEditorEditNamedSubmenu(page, "JSON");
    const sourceSubmenu = page.locator("#editor-context-menu").getByRole("menuitem", { name: "Source", exact: true }).locator("..");
    await expect(sourceSubmenu.locator('[data-editor-context-action="compact-json"]')).toHaveCount(0);
    await expect(sourceSubmenu.locator('[data-editor-context-action="json-for-code"]')).toHaveCount(0);
    await expect(sourceSubmenu.locator('[data-editor-context-action="json-from-code"]')).toHaveCount(0);
    await expect(jsonSubmenu.locator('[data-editor-context-action="compact-json"]')).toContainText("One-line JSON");
    await expect(jsonSubmenu.locator('[data-editor-context-action="json-for-code"]')).toContainText("JSON for Code");
    await expect(jsonSubmenu.locator('[data-editor-context-action="json-from-code"]')).toContainText("JSON from Code");
    await jsonSubmenu.locator('[data-editor-context-action="compact-json"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(compactSource);

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 0, source.length);
    jsonSubmenu = await openEditorEditNamedSubmenu(page, "JSON");
    await jsonSubmenu.locator('[data-editor-context-action="json-for-code"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(javaLiteral);

    const surroundedLiteral = `before ${javaLiteral} after`;
    await setActiveEditorValue(page, surroundedLiteral);
    await expect.poll(() => activeEditorValue(page)).toBe(surroundedLiteral);
    await setAndWaitForActiveEditorSelection(page, 7, 7 + javaLiteral.length);
    jsonSubmenu = await openMainEditNamedSubmenu(page, "JSON");
    await jsonSubmenu.locator('[data-edit-command="json-from-code"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(`before ${source} after`);
  });

  test("UTF8 Convert encodes and decodes the selected editor text with undo and redo", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "before שלום after";
    const encoded = "before &#x05E9;&#x05DC;&#x05D5;&#x05DD; after";
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 11);

    let unicodeSubmenu = await openUtf8ConvertSubmenu(page);
    const actionOrder = await unicodeSubmenu.locator("> .editor-context-menu-submenu-panel > *").evaluateAll((elements) => (
      elements.map((element) => element.dataset.editorContextAction
        || (element.classList.contains("editor-context-menu-divider") ? "separator" : ""))
    ));
    expect(actionOrder).toEqual([
      "unicode-hex-ncr",
      "unicode-javascript-es6",
      "unicode-java-c",
      "unicode-css",
      "unicode-encoded-uri",
      "separator",
      "unicode-decode",
    ]);
    await unicodeSubmenu.locator('[data-editor-context-action="unicode-hex-ncr"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(encoded);
    await expect.poll(() => page.evaluate(() => {
      const editor = window.markdownViewerApp.modules.codeMirrorEditor.getView();
      return { from: editor.state.selection.main.from, to: editor.state.selection.main.to };
    })).toEqual({ from: 7, to: 39 });

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await page.locator('.editor-format-button[data-editor-format-action="redo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(encoded);

    await setAndWaitForActiveEditorSelection(page, 7, 39);
    unicodeSubmenu = await openUtf8ConvertSubmenu(page);
    await unicodeSubmenu.locator('[data-editor-context-action="unicode-decode"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await expect.poll(() => page.evaluate(() => {
      const editor = window.markdownViewerApp.modules.codeMirrorEditor.getView();
      return { from: editor.state.selection.main.from, to: editor.state.selection.main.to };
    })).toEqual({ from: 7, to: 11 });
  });

  test("UTF8 Convert is selection-only and leaves malformed input unchanged", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const malformedSource = "prefix \\uD83D suffix";
    await setActiveEditorValue(page, malformedSource);
    await expect.poll(() => activeEditorValue(page)).toBe(malformedSource);
    await setActiveEditorSelection(page, 0, 0);

    await page.locator(".codemirror-editor .cm-content").last().dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 240,
      clientY: 220,
    });
    await expect(page.locator('[data-editor-context-action="unicode-decode"]')).toHaveCount(0);

    await setAndWaitForActiveEditorSelection(page, 7, 13);
    const unicodeSubmenu = await openUtf8ConvertSubmenu(page);
    await page.evaluate(() => {
      window.__unicodeConversionAlert = "";
      window.alert = (message) => { window.__unicodeConversionAlert = String(message || ""); };
    });
    await unicodeSubmenu.locator('[data-editor-context-action="unicode-decode"]').evaluate((button) => button.click());
    await expect.poll(() => page.evaluate(() => window.__unicodeConversionAlert)).toContain("surrogate");
    await expect.poll(() => activeEditorValue(page)).toBe(malformedSource);
  });

  test("Encoded URI submenu encodes and decodes selected text and rejects malformed input", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "before שלום world after";
    const encodedSelection = "%D7%A9%D7%9C%D7%95%D7%9D%20world";
    const encodedSource = `before ${encodedSelection} after`;
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 17);

    let uriSubmenu = await openEncodedUriSubmenu(page);
    const actionOrder = await uriSubmenu.locator("> .editor-context-menu-submenu-panel > *").evaluateAll((elements) => (
      elements.map((element) => element.dataset.editorContextAction || "")
    ));
    expect(actionOrder).toEqual(["uri-encode", "uri-decode"]);
    await uriSubmenu.locator('[data-editor-context-action="uri-encode"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(encodedSource);
    await waitForActiveEditorSelection(page, 7, 39);

    await setAndWaitForActiveEditorSelection(page, 7, 39);
    uriSubmenu = await openEncodedUriSubmenu(page);
    await uriSubmenu.locator('[data-editor-context-action="uri-decode"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await waitForActiveEditorSelection(page, 7, 17);

    const malformedSource = "prefix %D7% suffix";
    await setActiveEditorValue(page, malformedSource);
    await expect.poll(() => activeEditorValue(page)).toBe(malformedSource);
    await setAndWaitForActiveEditorSelection(page, 7, 11);
    uriSubmenu = await openEncodedUriSubmenu(page);
    await page.evaluate(() => {
      window.__uriConversionAlert = "";
      window.alert = (message) => { window.__uriConversionAlert = String(message || ""); };
    });
    await uriSubmenu.locator('[data-editor-context-action="uri-decode"]').evaluate((button) => button.click());
    await expect.poll(() => page.evaluate(() => window.__uriConversionAlert)).toContain("invalid percent-encoded UTF-8");
    await expect.poll(() => activeEditorValue(page)).toBe(malformedSource);
  });

  test("Base64 submenu encodes and decodes selected UTF-8 text with undo and validation", async ({ page }) => {
    await openApp(page);
    await selectViewMode(page, "editor");
    const source = "before שלום 😀 after";
    const encodedSelection = "16nXnNeV150g8J+YgA==";
    const encodedSource = `before ${encodedSelection} after`;
    await setActiveEditorValue(page, source);
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await setAndWaitForActiveEditorSelection(page, 7, 14);

    let base64Submenu = await openBase64Submenu(page);
    const actionOrder = await base64Submenu.locator("> .editor-context-menu-submenu-panel > *").evaluateAll((elements) => (
      elements.map((element) => element.dataset.editorContextAction || "")
    ));
    expect(actionOrder).toEqual(["base64-encode", "base64-decode"]);
    await base64Submenu.locator('[data-editor-context-action="base64-encode"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(encodedSource);
    await waitForActiveEditorSelection(page, 7, 27);

    await page.locator('.editor-format-button[data-editor-format-action="undo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await page.locator('.editor-format-button[data-editor-format-action="redo"]').click();
    await expect.poll(() => activeEditorValue(page)).toBe(encodedSource);

    await setAndWaitForActiveEditorSelection(page, 7, 27);
    base64Submenu = await openBase64Submenu(page);
    await base64Submenu.locator('[data-editor-context-action="base64-decode"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await waitForActiveEditorSelection(page, 7, 14);

    const malformedSource = "prefix SGVsbG8_ suffix";
    await setActiveEditorValue(page, malformedSource);
    await expect.poll(() => activeEditorValue(page)).toBe(malformedSource);
    await setAndWaitForActiveEditorSelection(page, 7, 15);
    base64Submenu = await openBase64Submenu(page);
    await page.evaluate(() => {
      window.__base64ConversionAlert = "";
      window.alert = (message) => { window.__base64ConversionAlert = String(message || ""); };
    });
    await base64Submenu.locator('[data-editor-context-action="base64-decode"]').evaluate((button) => button.click());
    await expect.poll(() => page.evaluate(() => window.__base64ConversionAlert)).toContain("valid standard Base64");
    await expect.poll(() => activeEditorValue(page)).toBe(malformedSource);
  });

  test("Source submenu toggles language-aware line and block comments", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
    await page.evaluate(() => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInTab("class Demo {}", "Demo.java", {
        name: "Demo.java",
        path: "C:/workspace/Demo.java",
      }, { temporary: false, skipExistingSourceTab: true });
    });
    await expect.poll(() => activeEditorValue(page)).toBe("class Demo {}");
    await expect(page.locator(".codemirror-editor").last()).toHaveAttribute("data-language", "java");
    await setActiveEditorSelection(page, 0, 13);

    const editor = page.locator(".codemirror-editor .cm-content").last();
    await editor.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 240,
      clientY: 220,
    });
    const sourceSubmenu = await openEditorSourceSubmenu(page);
    await expect(sourceSubmenu.locator('[data-editor-context-action="toggle-comment"]')).toContainText("Toggle Comment");
    await expect(sourceSubmenu.locator('[data-editor-context-action="toggle-block-comment"]')).toContainText("Toggle Block Comment");
    await expect(sourceSubmenu.locator('[data-editor-context-action="toggle-block-comment"] kbd')).toHaveText("Ctrl+Shift+/");

    await sourceSubmenu.locator('[data-editor-context-action="toggle-block-comment"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe("/* class Demo {} */");
    await page.locator(".codemirror-editor .cm-content").last().evaluate((content) => content.focus());
    await page.keyboard.press("Control+Shift+/");
    await expect.poll(() => activeEditorValue(page)).toBe("class Demo {}");

    await page.evaluate(() => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInTab('print("x")', "demo.py", {
        name: "demo.py",
        path: "C:/workspace/demo.py",
      }, { temporary: false, skipExistingSourceTab: true });
    });
    await expect.poll(() => activeEditorValue(page)).toBe('print("x")');
    await expect(page.locator(".codemirror-editor").last()).toHaveAttribute("data-language", "python");
    await setActiveEditorSelection(page, 0, 10);
    await page.locator(".codemirror-editor .cm-content").last().dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 240,
      clientY: 220,
    });
    const pythonSourceSubmenu = await openEditorSourceSubmenu(page);
    await expect(pythonSourceSubmenu.locator('[data-editor-context-action="toggle-comment"]')).toBeVisible();
    await expect(pythonSourceSubmenu.locator('[data-editor-context-action="toggle-block-comment"]')).toHaveCount(0);
    await pythonSourceSubmenu.locator('[data-editor-context-action="toggle-comment"]').evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe('# print("x")');
    await page.locator(".codemirror-editor .cm-content").last().evaluate((content) => content.focus());
    await page.keyboard.press("Control+/");
    await expect.poll(() => activeEditorValue(page)).toBe('print("x")');
  });

  test("Source submenu corrects selected and current-line indentation", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
    const source = 'class Demo {\nvoid run() {\nSystem.out.println("x");\n}\n}';
    const expected = 'class Demo {\n  void run() {\n    System.out.println("x");\n  }\n}';
    const fileName = `IndentationDemo-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInTab(content, fileName, {
        name: fileName,
        path: `C:/workspace/${fileName}`,
      }, { temporary: false, skipExistingSourceTab: true });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await expect(page.locator(".codemirror-editor").last()).toHaveAttribute("data-language", "java");
    await setActiveEditorSelection(page, 0, source.length);

    const editor = page.locator(".codemirror-editor .cm-content").last();
    await editor.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 240,
      clientY: 220,
    });
    const sourceSubmenu = await openEditorSourceSubmenu(page);
    const sourceActionOrder = await sourceSubmenu.locator("> .editor-context-menu-submenu-panel > *").evaluateAll((elements) => (
      elements.map((element) => element.getAttribute("data-editor-context-action")
        || (element.classList.contains("editor-context-menu-divider") ? "separator" : ""))
    ));
    const indentationIndex = sourceActionOrder.indexOf("correct-indentation");
    expect(sourceActionOrder.slice(indentationIndex - 1, indentationIndex + 4)).toEqual([
      "separator", "correct-indentation", "format-file", "format-selected", "separator"
    ]);
    const correctIndentationAction = sourceSubmenu.locator('[data-editor-context-action="correct-indentation"]');
    await expect(correctIndentationAction).toContainText("Correct Indentation");
    await expect(correctIndentationAction.locator("kbd")).toHaveText("Ctrl+I");
    await correctIndentationAction.evaluate((button) => button.click());
    await expect.poll(() => activeEditorValue(page)).toBe(expected);

    await editor.evaluate((content) => content.focus());
    await page.keyboard.press("Control+z");
    await expect.poll(() => activeEditorValue(page)).toBe(source);

    const cursorPosition = source.indexOf("void");
    await setActiveEditorSelection(page, cursorPosition, cursorPosition);
    await page.keyboard.press("Control+i");
    await expect.poll(() => activeEditorValue(page)).toBe('class Demo {\n  void run() {\nSystem.out.println("x");\n}\n}');
  });
  test("format file formats Java files", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab('class Example{void run(){System.out.println("x");}}', "Example.java", {
        name: "Example.java",
        path: "C:/workspace/Example.java",
      });
    });
    await setActiveEditorSelection(page, 0, 0);

    await page.locator(".codemirror-editor .cm-content").last().dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 240,
      clientY: 220,
    });
    const formatAction = page.locator("[data-editor-context-action='format-file']");
    await expect(formatAction).toBeEnabled();
    await formatAction.click();

    await expect.poll(() => codeMirrorDocText(page), { timeout: 20000 }).toContain("class Example {");
    await expect.poll(() => codeMirrorDocText(page), { timeout: 20000 }).toContain("void run() {");
  });

  test("Java context menu surrounds selected statements and preserves undo", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.javaSurroundWithActions);
    await page.evaluate(() => window.markdownViewerApp.modules.tabs.closeAllTabs({
      promptForUnsaved: false,
      recordInHistory: false,
    }));
    const source = "class Example {\n    void run() {\n        first();\n        second();\n    }\n}";
    const fileName = `SurroundWithExample-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInTab(content, fileName, {
        name: fileName,
        path: `C:/workspace/${fileName}`,
      }, { temporary: false, skipExistingSourceTab: true });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await expect.poll(() => page.evaluate(() => {
      return window.markdownViewerApp.services.editorViewManager.getActiveCodeMirrorEditor()?.getActiveLanguage?.()?.id || "";
    })).toBe("java");
    const selectionStart = source.indexOf("first();");
    const selectionEnd = source.indexOf("second();") + "second();".length;
    await setActiveEditorSelection(page, selectionStart, selectionEnd);
    await expect.poll(() => page.evaluate(() => {
      const app = window.markdownViewerApp;
      const commands = app.modules.activeEditorCommands;
      return app.modules.javaSurroundWithActions.provider.getAvailableActions({
        selection: commands.getActiveEditorSelection(),
        source: commands.getActiveEditorValue(),
      }).map((action) => action.id);
    })).toContain("surround-with");

    await page.evaluate(({ position }) => {
      const app = window.markdownViewerApp;
      const codeMirror = app.services.editorViewManager.getActiveCodeMirrorEditor();
      const view = codeMirror.getView();
      const coords = view.coordsAtPos(position);
      view.contentDOM.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: coords.left,
        clientY: coords.top,
      }));
    }, { position: selectionStart + 2 });
    await page.locator("#editor-context-menu .editor-context-menu-submenu > button", { hasText: "Surround With" }).hover();
    const ifAction = page.locator("[data-editor-context-action='surround-with-template-if']");
    await expect(ifAction).toBeVisible();
    await ifAction.click();

    await expect.poll(() => codeMirrorDocText(page)).toContain("if (condition) {");
    const selectedPlaceholder = await page.evaluate(() => {
      const editor = window.markdownViewerApp.services.editorViewManager.getActiveCodeMirrorEditor();
      const view = editor.getView();
      return view.state.sliceDoc(view.state.selection.main.from, view.state.selection.main.to);
    });
    expect(selectedPlaceholder).toBe("condition");
    await page.keyboard.press("Control+z");
    await expect.poll(() => codeMirrorDocText(page)).toBe(source);
  });

  test("Format Selected formats only the selected Java lines", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
    const source = 'class SelectedDemo {\n  void first(){System.out.println("a");}\n  void second(){System.out.println("b");}\n}';
    const fileName = `FormatSelected-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab(content, fileName, {
        name: fileName,
        path: `C:/workspace/${fileName}`,
      });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await expect(page.locator(".codemirror-editor").last()).toHaveAttribute("data-language", "java");
    const from = source.indexOf("  void first");
    const to = source.indexOf("\n", from);
    await setActiveEditorSelection(page, from, to);

    await page.evaluate(({ position }) => {
      const app = window.markdownViewerApp;
      const codeMirror = app.services.editorViewManager.getActiveCodeMirrorEditor();
      const view = codeMirror.getView();
      const coords = view.coordsAtPos(position);
      view.contentDOM.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: coords.left,
        clientY: coords.top,
      }));
    }, { position: from + 2 });

    const sourceSubmenu = await openEditorSourceSubmenu(page);
    const formatSelectedAction = sourceSubmenu.locator('[data-editor-context-action="format-selected"]');
    await expect(formatSelectedAction).toBeVisible();
    await formatSelectedAction.click();
    await expect.poll(() => activeEditorValue(page), { timeout: 20000 }).toContain("void first() {");
    await expect.poll(() => activeEditorValue(page), { timeout: 20000 }).toContain('    System.out.println("a");');
    await expect.poll(() => activeEditorValue(page), { timeout: 20000 }).toContain('void second(){System.out.println("b");}');
  });

  test("Refactor submenu opens the Extract Interface preview workflow", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInTab);
    await page.evaluate(() => window.markdownViewerApp.modules.tabs.closeAllTabs({
      promptForUnsaved: false,
      recordInHistory: false
    }));
    const source = "class Greeting { int id() { return 1; } }";
    const fileName = `ExtractInterface-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      window.markdownViewerApp.modules.tabs.openSidebarFileInTab(content, fileName, {
        name: fileName,
        path: `C:/workspace/${fileName}`
      }, { temporary: false, skipExistingSourceTab: true });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await page.waitForFunction(() => !!window.markdownViewerApp.services.editorViewManager.getActiveCodeMirrorEditor?.());
    await page.evaluate(() => {
      const app = window.markdownViewerApp;
      app.modules.sourceActions.registerProvider({
        id: "extract-interface-e2e-provider",
        getAvailableActions() {
          return [{
            id: "extract-interface-e2e",
            label: "Extract Interface...",
            icon: "bi-diagram-2",
            menu: "refactor",
            run() {
              const dialog = window.createMarkdownViewerExtractInterfaceDialog();
              window.__extractInterfaceDialogResult = undefined;
              dialog.open({
                subTypeName: "Greeting",
                members: [{ name: "id", typeName: "int", parameters: [], handleIdentifier: "id-handle" }],
                async preparePreview() {
                  return {
                    summary: [{
                      type: "modify",
                      path: "C:/workspace/Greeting.java",
                      before: "class Greeting {}",
                      after: "class Greeting implements Greeter {}"
                    }]
                  };
                },
                async applyPreview() {
                  return { applied: true, async undo() { window.__extractInterfaceUndone = true; } };
                }
              }).then((result) => { window.__extractInterfaceDialogResult = result; });
            }
          }];
        }
      });
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor();
      const coords = editor.getView().coordsAtPos(0);
      editor.getView().contentDOM.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: coords.left,
        clientY: coords.top
      }));
    });

    const refactor = page.locator("#editor-context-menu .editor-context-menu-submenu > button", { hasText: "Refactor" });
    await expect(refactor).toBeVisible();
    await refactor.hover();
    await page.locator('[data-editor-context-action="extract-interface-e2e"]').click();

    const dialog = page.locator("#extract-interface-dialog");
    await expect(dialog).toBeVisible();
    await dialog.locator(".extract-interface-name").fill("Greeter");
    await dialog.locator(".extract-interface-member input").check();
    await dialog.locator(".extract-interface-preview-button").click();
    await expect(dialog.locator(".extract-interface-after")).toContainText("implements Greeter");
    await dialog.locator(".extract-interface-back").click();
    await expect(dialog.locator(".extract-interface-member input")).toBeChecked();
    await expect(dialog.locator(".extract-interface-name")).toHaveValue("Greeter");
    await dialog.locator(".extract-interface-preview-button").click();
    await dialog.locator(".extract-interface-apply").click();
    await expect(dialog.locator(".extract-interface-undo")).toBeVisible();
    await dialog.locator(".extract-interface-undo").click();
    await expect.poll(() => page.evaluate(() => window.__extractInterfaceUndone)).toBe(true);
  });
  test("Refactor submenu opens the Push Down member, preview, and undo workflow", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInTab);
    const source = "class Base { int value; int getValue() { return value; } }";
    const childSource = "class Child extends Base {}";
    const fileName = `PushDown-${Date.now()}.java`;
    const childFileName = `PushDownChild-${Date.now()}.java`;
    await page.evaluate(async ({ content, childContent, fileName, childFileName }) => {
      const app = window.markdownViewerApp;
      await app.modules.tabs.closeAllTabs({
        promptForUnsaved: false,
        recordInHistory: false
      });
      const workspaceRoot = String(app.state.activeFolderPath || "C:/workspace").replace(/[\\/]+$/, "");
      const childPath = `${workspaceRoot}/${childFileName}`;
      const basePath = `${workspaceRoot}/${fileName}`;
      await app.modules.tabs.openSidebarFileInTab(childContent, childFileName, {
        name: childFileName,
        path: childPath
      }, { temporary: false, skipExistingSourceTab: true });
      await app.modules.tabs.openSidebarFileInTab(content, fileName, {
        name: fileName,
        path: basePath
      }, { temporary: false, skipExistingSourceTab: true });
      window.__pushDownPaths = {
        basePath,
        childPath,
        baseUri: app.modules.lspServerRegistry.toFileUri(basePath),
        childUri: app.modules.lspServerRegistry.toFileUri(childPath)
      };
      window.__pushDownWorkspaceEditPreview = window.registerMarkdownViewerWorkspaceEditPreview(app, {
        registry: app.modules.lspServerRegistry,
        tabs: app.modules.tabs,
        osName: "Windows",
        getWorkspaceRoot: () => workspaceRoot
      });
    }, { content: source, childContent: childSource, fileName, childFileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await page.waitForFunction(() => !!window.markdownViewerApp.services.editorViewManager.getActiveCodeMirrorEditor?.());
    await page.evaluate(() => {
      const app = window.markdownViewerApp;
      app.modules.sourceActions.registerProvider({
        id: "push-down-e2e-provider",
        getAvailableActions() {
          return [{
            id: "push-down-e2e",
            label: "Push Down...",
            icon: "bi-arrow-down-square",
            menu: "refactor",
            run() {
              const paths = window.__pushDownPaths;
              const members = [
                { handle: "field", label: "value", action: "pushDown", availableActions: ["none", "pushDown"] },
                { handle: "method", label: "getValue()", action: "pushDown", availableActions: ["none", "pushDown", "leaveAbstract"] }
              ];
              const dialog = window.createMarkdownViewerPushDownDialog();
              dialog.open({
                analysis: { members, problems: [] },
                request: { uri: paths.baseUri, selectionStart: 17, selectionEnd: 22 },
                async resolveRequiredMembers(settings) {
                  return {
                    members: [...members, {
                      handle: "required",
                      label: "requiredValue",
                      action: "pushDown",
                      availableActions: ["none", "pushDown"]
                    }],
                    problems: []
                  };
                },
                async preparePreview(settings) {
                  window.__pushDownSettings = settings;
                  const fullDocument = { start: { line: 0, character: 0 }, end: { line: 0, character: 999 } };
                  return window.__pushDownWorkspaceEditPreview.resolve({
                    title: "Push Down",
                    workspaceEdit: {
                      changes: {
                        [paths.baseUri]: [{ range: fullDocument, newText: "class Base { int value; }" }],
                        [paths.childUri]: [{
                          range: fullDocument,
                          newText: "class Child extends Base { int getValue() { return value; } }"
                        }]
                      }
                    }
                  });
                },
                async applyPreview(preview) {
                  const applied = await window.__pushDownWorkspaceEditPreview.apply(preview);
                  return {
                    ...applied,
                    async undo() {
                      const result = await applied.undo();
                      window.__pushDownUndone = true;
                      return result;
                    }
                  };
                }
              });
            }
          }];
        }
      });
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor();
      const coords = editor.getView().coordsAtPos(0);
      editor.getView().contentDOM.dispatchEvent(new MouseEvent("contextmenu", {
        bubbles: true,
        cancelable: true,
        button: 2,
        clientX: coords.left,
        clientY: coords.top
      }));
    });

    const refactor = page.locator("#editor-context-menu .editor-context-menu-submenu > button", { hasText: "Refactor" });
    await expect(refactor).toBeVisible();
    await refactor.hover();
    await page.locator('[data-editor-context-action="push-down-e2e"]').click();

    const dialog = page.locator(".push-down-dialog");
    await expect(dialog).toBeVisible();
    await dialog.getByRole("button", { name: "Add Required" }).click();
    await expect(dialog.locator(".push-down-members tr", { hasText: "requiredValue" })).toBeVisible();
    const methodRow = dialog.locator(".push-down-members tr", { hasText: "getValue()" });
    await methodRow.locator("select").selectOption("leaveAbstract");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await dialog.locator(".push-down-file-list button", { hasText: childFileName }).click();
    await expect(dialog.locator(".push-down-after")).toContainText("int getValue()");
    await dialog.getByRole("button", { name: "Back" }).click();
    await expect(dialog.locator(".push-down-members tr", { hasText: "getValue()" }).locator("select")).toHaveValue("leaveAbstract");
    await dialog.getByRole("button", { name: "Preview" }).click();
    await dialog.getByRole("button", { name: "Apply" }).click();
    await expect(dialog.getByRole("button", { name: "Undo" })).toBeVisible();
    await page.locator("#tab-list .tab-item", { hasText: childFileName }).evaluate((tab) => tab.click());
    await expect.poll(() => activeEditorValue(page)).toContain("int getValue()");
    await dialog.getByRole("button", { name: "Undo" }).click();
    await expect.poll(() => page.evaluate(() => window.__pushDownUndone)).toBe(true);
    await expect.poll(() => page.evaluate(() => window.__pushDownSettings.actions.method)).toBe("leaveAbstract");
    await expect.poll(() => activeEditorValue(page)).toBe(childSource);
  });
  test("Refactor submenu opens the Extract Method preview and undo workflow", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInTab);
    const source = "class Demo { void run() { work(); } }";
    const fileName = `ExtractMethod-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      const app = window.markdownViewerApp;
      app.modules.tabs.closeAllTabs({
        promptForUnsaved: false,
        recordInHistory: false
      });
      app.modules.tabs.openSidebarFileInTab(content, fileName, { name: fileName, path: `C:/workspace/${fileName}` }, { temporary: false, skipExistingSourceTab: true });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await page.waitForFunction(() => !!window.markdownViewerApp.services.editorViewManager.getActiveCodeMirrorEditor?.());
    await page.evaluate(({ content }) => {
      const app = window.markdownViewerApp;
      app.modules.sourceActions.registerProvider({
        id: "extract-method-e2e-provider",
        getAvailableActions() {
          return [{ id: "extract-method-e2e", label: "Extract Method...", shortcut: "Alt+Shift+M", menu: "refactor", run() {
            const dialog = window.createMarkdownViewerExtractMethodDialog();
            const preview = { methodName: "extracted", summary: [{ type: "modify", before: content, after: "class Demo { void run() { extracted(); } private void extracted() { work(); } }" }] };
            dialog.open({
              defaultMethodName: "extracted",
              methodSignature: "private void extracted()",
              initialPreview: preview,
              getSignature(settings) {
                const modifiers = [settings.accessModifier === "package" ? "" : settings.accessModifier, settings.declareFinal ? "final" : "", settings.declareSynchronized ? "synchronized" : ""].filter(Boolean).join(" ");
                return `${modifiers ? `${modifiers} ` : ""}void ${settings.methodName}()`;
              },
              async preparePreview(settings) {
                const modifiers = [settings.accessModifier === "package" ? "" : settings.accessModifier, settings.declareFinal ? "final" : "", settings.declareSynchronized ? "synchronized" : ""].filter(Boolean).join(" ");
                const signature = `${modifiers ? `${modifiers} ` : ""}void ${settings.methodName}()`;
                const comment = settings.generateMethodComment ? "/** Extracted method. */ " : "";
                return {
                  methodName: settings.methodName,
                  summary: [{ type: "modify", before: content, after: `class Demo { void run() { ${settings.methodName}(); } ${comment}${signature} { work(); } }` }]
                };
              },
              async applyPreview() { return { applied: true, async undo() { window.__extractMethodUndone = true; } }; }
            });
          } }];
        }
      });
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor();
      const coords = editor.getView().coordsAtPos(0);
      editor.getView().contentDOM.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: coords.left, clientY: coords.top }));
    }, { content: source, fileName });

    const refactor = page.locator("#editor-context-menu .editor-context-menu-submenu > button", { hasText: "Refactor" });
    await expect(refactor).toBeVisible();
    await refactor.hover();
    await page.locator('[data-editor-context-action="extract-method-e2e"]').click();
    const dialog = page.locator("#extract-method-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".extract-method-name")).toHaveValue("extracted");
    await expect(dialog.locator(".extract-method-options")).toContainText("Access modifier");
    await dialog.locator(".extract-method-name").fill("calculate");
    await dialog.locator('input[name="extract-method-access"][value="protected"]').check();
    await dialog.locator(".extract-method-final").check();
    await dialog.locator(".extract-method-synchronized").check();
    await dialog.locator(".extract-method-comment").check();
    await expect(dialog.locator(".extract-method-signature")).toContainText("protected final synchronized void calculate()");
    await dialog.locator(".extract-method-preview-button").click();
    await expect(dialog.locator(".extract-method-change-tree")).toContainText("Create new method 'calculate'");
    await expect(dialog.locator(".extract-method-after")).toContainText("Extracted method");
    await expect(dialog.locator(".extract-method-after")).toContainText("protected final synchronized void calculate()");
    await dialog.locator(".extract-method-back").click();
    await expect(dialog.locator(".extract-method-name")).toHaveValue("calculate");
    await expect(dialog.locator('input[name="extract-method-access"][value="protected"]')).toBeChecked();
    await expect(dialog.locator(".extract-method-final")).toBeChecked();
    await expect(dialog.locator(".extract-method-synchronized")).toBeChecked();
    await expect(dialog.locator(".extract-method-comment")).toBeChecked();
    await dialog.locator(".extract-method-preview-button").click();
    await dialog.locator(".extract-method-ok").click();
    await expect(dialog).toBeHidden();
    const undoBanner = page.locator(".extract-method-undo-banner");
    await expect(undoBanner).toBeVisible();
    await undoBanner.getByRole("button", { name: "Undo Extract Method" }).click();
    await expect.poll(() => page.evaluate(() => window.__extractMethodUndone)).toBe(true);
  });
  test("Refactor submenu opens the Introduce Parameter Object preview and undo workflow", async ({ page }) => {
    await openApp(page);
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInTab);
    const source = "class Demo { void save(String name, int id) { } }";
    const fileName = `IntroduceParameterObject-${Date.now()}.java`;
    await page.evaluate(({ content, fileName }) => {
      const app = window.markdownViewerApp;
      app.modules.tabs.closeAllTabs({ promptForUnsaved: false, recordInHistory: false });
      app.modules.tabs.openSidebarFileInTab(content, fileName, { name: fileName, path: `C:/workspace/${fileName}` }, { temporary: false, skipExistingSourceTab: true });
    }, { content: source, fileName });
    await expect.poll(() => activeEditorValue(page)).toBe(source);
    await page.waitForFunction(() => !!window.markdownViewerApp.services.editorViewManager.getActiveCodeMirrorEditor?.());
    await page.evaluate(({ content, fileName }) => {
      const app = window.markdownViewerApp;
      const analysis = {
        methodName: "save",
        owner: { name: "Demo" },
        parameters: [
          { originalIndex: 0, type: "String", name: "name" },
          { originalIndex: 1, type: "int", name: "id" }
        ],
        returnType: "void",
        visibility: "",
        isConstructor: false,
        isStatic: false
      };
      app.modules.sourceActions.registerProvider({
        id: "introduce-parameter-object-e2e-provider",
        getAvailableActions() {
          return [{ id: "introduce-parameter-object-e2e", label: "Introduce Parameter Object...", menu: "refactor", run() {
            const modelApi = window.markdownViewerJavaParameterObjectModel;
            const dialog = window.createMarkdownViewerIntroduceParameterObjectDialog();
            dialog.open({
              analysis,
              initialModel: modelApi.createModel(analysis),
              getSignature(model) { return modelApi.buildSignature(model, analysis); },
              validate(model) { return modelApi.validate(model, analysis); },
              async preparePreview(model) {
                return {
                  summary: [
                    { type: "modify", path: `C:/workspace/${fileName}`, before: content, after: `class Demo { void save(${model.className} ${model.parameterName}) { } }` },
                    { type: "modify", path: `C:/workspace/${model.className}.java`, before: "", after: `public class ${model.className} { }` }
                  ]
                };
              },
              async applyPreview() { return { applied: true, async undo() { window.__introduceParameterObjectUndone = true; } }; }
            });
          } }];
        }
      });
      const editor = app.services.editorViewManager.getActiveCodeMirrorEditor();
      const coords = editor.getView().coordsAtPos(0);
      editor.getView().contentDOM.dispatchEvent(new MouseEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: coords.left, clientY: coords.top }));
    }, { content: source, fileName });

    const refactor = page.locator("#editor-context-menu .editor-context-menu-submenu > button", { hasText: "Refactor" });
    await expect(refactor).toBeVisible();
    await refactor.hover();
    await page.locator('[data-editor-context-action="introduce-parameter-object-e2e"]').click();
    const dialog = page.locator("#introduce-parameter-object-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".introduce-parameter-object-class-name")).toHaveValue("DemoParameter");
    await dialog.locator(".introduce-parameter-object-class-name").fill("SaveRequest");
    await dialog.locator(".introduce-parameter-object-delegate").check();
    await dialog.locator(".introduce-parameter-object-deprecate").check();
    await expect(dialog.locator(".introduce-parameter-object-signature")).toContainText("SaveRequest parameterObject");
    await dialog.locator(".introduce-parameter-object-preview-button").click();
    await expect(dialog.locator(".introduce-parameter-object-file-list")).toContainText("SaveRequest.java");
    await expect(dialog.locator(".introduce-parameter-object-after")).toContainText("SaveRequest");
    await dialog.locator(".introduce-parameter-object-back").click();
    await expect(dialog.locator(".introduce-parameter-object-class-name")).toHaveValue("SaveRequest");
    await dialog.locator(".introduce-parameter-object-preview-button").click();
    await dialog.locator(".introduce-parameter-object-ok").click();
    await expect(dialog).toBeHidden();
    const undoBanner = page.locator(".introduce-parameter-object-undo-banner");
    await expect(undoBanner).toBeVisible();
    await undoBanner.getByRole("button", { name: "Undo Introduce Parameter Object" }).click();
    await expect.poll(() => page.evaluate(() => window.__introduceParameterObjectUndone)).toBe(true);
  });
  test("Generate Getters and Setters dialog selects accessor kinds", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const dialog = window.createMarkdownViewerGetterSetterDialog();
      window.__getterSetterDialogResult = undefined;
      dialog.open([
        { fieldName: "id", typeName: "int", isStatic: false, generateGetter: true, generateSetter: true },
        { fieldName: "name", typeName: "String", isStatic: false, generateGetter: true, generateSetter: true }
      ]).then((result) => { window.__getterSetterDialogResult = result; });
    });

    const dialog = page.locator("#getter-setter-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".getter-setter-field-group")).toHaveCount(2);
    await dialog.locator('[data-selection-action="getters"]').click();
    await dialog.locator(".getter-setter-order").selectOption("getters-first");
    await dialog.locator(".getter-setter-generate-comments").check();
    await expect(dialog.locator(".getter-setter-selection-summary")).toHaveText("2 of 4 selected.");
    await dialog.locator(".getter-setter-dialog-generate").click();

    await expect.poll(() => page.evaluate(() => window.__getterSetterDialogResult)).toEqual({
      fields: [
        { fieldName: "id", typeName: "int", isStatic: false, generateGetter: true, generateSetter: false },
        { fieldName: "name", typeName: "String", isStatic: false, generateGetter: true, generateSetter: false }
      ],
      order: "getters-first",
      generateComments: true
    });
  });


  test("Generate toString dialog returns members and generation options", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const dialog = window.createMarkdownViewerToStringDialog();
      window.__toStringDialogResult = undefined;
      dialog.open({
        fields: [
          { id: "field:name", kind: "field", name: "name", label: "name", typeName: "String" },
          { id: "field:id", kind: "field", name: "id", label: "id", typeName: "int" }
        ],
        methods: [
          { id: "method:getId", kind: "method", name: "getId", label: "getId()", typeName: "int" }
        ]
      }).then((result) => { window.__toStringDialogResult = result; });
    });

    const dialog = page.locator("#to-string-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".to-string-member-option")).toHaveCount(3);
    await dialog.locator('[data-selection-action="all"]').click();
    await dialog.locator(".to-string-code-style").selectOption("builder-chained");
    await dialog.locator(".to-string-generate-comments").check();
    await dialog.locator(".to-string-list-arrays").check();
    await dialog.locator(".to-string-dialog-generate").click();

    await expect.poll(() => page.evaluate(() => window.__toStringDialogResult)).toMatchObject({
      members: [
        { id: "field:name" },
        { id: "field:id" },
        { id: "method:getId" }
      ],
      codeStyle: "builder-chained",
      generateComments: true,
      listArrays: true
    });
  });


  test("Generate Constructor using Fields dialog returns ordered fields and options", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const dialog = window.createMarkdownViewerConstructorDialog();
      window.__constructorDialogResult = undefined;
      dialog.open({
        fields: [
          { id: "field:name", name: "name", label: "name", typeName: "String" },
          { id: "field:id", name: "id", label: "id", typeName: "int" }
        ]
      }).then((result) => { window.__constructorDialogResult = result; });
    });

    const dialog = page.locator("#constructor-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".constructor-field-option")).toHaveCount(2);
    await dialog.locator('[data-field-id="field:id"]').focus();
    await dialog.locator('[data-order-action="up"]').click();
    await dialog.locator(".constructor-insertion-point").selectOption("end");
    await dialog.locator('input[name="constructor-access"][value="private"]').check();
    await dialog.locator(".constructor-generate-comments").check();
    await dialog.locator(".constructor-omit-super").check();
    await dialog.locator(".constructor-dialog-generate").click();

    await expect.poll(() => page.evaluate(() => window.__constructorDialogResult)).toMatchObject({
      fields: [
        { id: "field:id" },
        { id: "field:name" }
      ],
      insertionPoint: "end",
      accessModifier: "private",
      generateComments: true,
      omitSuper: true
    });
  });



  test("Generate hashCode and equals dialog returns selected fields and options", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      const dialog = window.createMarkdownViewerEqualsHashCodeDialog();
      window.__equalsHashCodeDialogResult = undefined;
      dialog.open({
        fields: [
          { id: "field:name", name: "name", label: "name", typeName: "String" },
          { id: "field:id", name: "id", label: "id", typeName: "int" }
        ]
      }).then((result) => { window.__equalsHashCodeDialogResult = result; });
    });

    const dialog = page.locator("#equals-hashcode-dialog");
    await expect(dialog).toBeVisible();
    await expect(dialog.locator(".equals-hashcode-field-option")).toHaveCount(2);
    await dialog.locator('[data-selection-action="none"]').click();
    await expect(dialog.locator(".equals-hashcode-selection-summary")).toHaveText("0 of 2 selected.");
    await dialog.locator(".equals-hashcode-field-option").nth(1).locator("input").check();
    await dialog.locator(".equals-hashcode-insertion-point").selectOption("after-field:field:id");
    await dialog.locator(".equals-hashcode-instanceof").uncheck();
    await dialog.locator(".equals-hashcode-blocks").uncheck();
    await dialog.locator(".equals-hashcode-dialog-generate").click();

    await expect.poll(() => page.evaluate(() => window.__equalsHashCodeDialogResult)).toMatchObject({
      fields: [
        { id: "field:id" }
      ],
      insertionPoint: "after-field:field:id",
      generateComments: true,
      useInstanceof: false,
      useBlocks: false,
      useObjects: true
    });
  });



  test("show wrap symbol displays markers for CodeMirror soft wraps", async ({ page }) => {
    await page.setViewportSize({ width: 760, height: 520 });
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({
          showSymbolPreferences: { wrapSymbol: true },
          startupBehavior: "untitled",
          wordWrapEnabled: true,
        }),
      },
    });
    await focusCodeMirror(page);
    await page.evaluate(() => {
      const app = window.markdownViewerApp;
      const codeMirror = app.services.editorViewManager.getActiveCodeMirrorEditor() || app.modules.codeMirrorEditor;
      const view = codeMirror.getView();
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: "ThisIsAnIntentionallyUnbreakableLongToken".repeat(20),
        },
        selection: { anchor: 0 },
      });
    });

    await expect.poll(() => page.locator(".cm-visible-wrap").count()).toBeGreaterThan(0);
  });

});
