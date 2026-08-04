const fs = require("node:fs/promises");
const path = require("node:path");

const { expect } = require("@playwright/test");

async function openApp(page, state = {}) {
  const appState = {
    localStorage: {},
    preserveLocalStorage: false,
    ...state,
  };

  await page.addInitScript((initState) => {
    if (!initState.preserveLocalStorage) {
      window.localStorage.clear();
    }
    for (const [key, value] of Object.entries(initState.localStorage || {})) {
      window.localStorage.setItem(key, value);
    }
    const globalState = JSON.parse(window.localStorage.getItem("markdownViewerGlobalState") || "{}");
    window.localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled", ...globalState }));
  }, appState);

  await page.goto("/");
  await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.activeEditorCommands?.getActiveEditorValue === "function");
}

async function openDesktopFolder(page, folderPath) {
  const normalizedPath = path.resolve(folderPath);
  await page.evaluate((targetPath) => {
    window.Neutralino = window.Neutralino || {};
    window.Neutralino.os = window.Neutralino.os || {};
    window.Neutralino.os.showFolderDialog = async () => targetPath;
  }, normalizedPath);

  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree({ preventDefault() {} }));
  await expect(page.locator("#folder-tree-root > .folder-tree-list")).toBeVisible({ timeout: 30000 });
}

async function activeEditorValue(page) {
  return page.evaluate(() => window.markdownViewerApp.modules.activeEditorCommands.getActiveEditorValue());
}

async function codeMirrorDocText(page) {
  return page.evaluate(() => {
    const app = window.markdownViewerApp;
    const codeMirror = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.() || app?.modules?.codeMirrorEditor;
    const view = codeMirror?.getView?.();
    return view?.state?.doc?.toString?.() ?? app?.modules?.activeEditorCommands?.getActiveEditorValue?.() ?? "";
  });
}

async function focusCodeMirror(page) {
  await page.locator(".codemirror-editor .cm-content").click();
  await page.waitForFunction(() => {
    const app = window.markdownViewerApp;
    const codeMirror = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.() || app?.modules?.codeMirrorEditor;
    return !!codeMirror?.getView?.();
  });
}

async function setActiveEditorValue(page, text) {
  await page.evaluate((value) => {
    const app = window.markdownViewerApp;
    const commands = app.modules.activeEditorCommands;
    commands.setActiveEditorValue(value);
    const codeMirror = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.() || app?.modules?.codeMirrorEditor;
    const view = codeMirror?.getView?.();
    if (view && view.state.doc.toString() !== value) {
      view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: value } });
    }
    commands.dispatchActiveEditorInput();
  }, text);
}

async function setActiveEditorSelection(page, start, end = start) {
  await page.evaluate(({ selectionStart, selectionEnd }) => {
    const commands = window.markdownViewerApp.modules.activeEditorCommands;
    if (typeof commands.setActiveEditorSelection === "function") {
      commands.setActiveEditorSelection(selectionStart, selectionEnd);
    }
    const app = window.markdownViewerApp;
    const codeMirror = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.() || app?.modules?.codeMirrorEditor;
    const view = codeMirror?.getView?.() || commands.getActiveEditorView?.();if (view?.dispatch) {
      view.dispatch({ selection: { anchor: selectionStart, head: selectionEnd }, scrollIntoView: true });
      view.focus?.();
    }
  }, { selectionStart: start, selectionEnd: end });
}

async function selectViewMode(page, mode) {
  const button = page.locator(`.view-mode-btn[data-mode="${mode}"]`);
  await button.click();
  await expect(button).toHaveAttribute("aria-pressed", "true");
}

async function openActionMenu(page) {
  await page.evaluate(() => window.markdownViewerApp?.modules?.applicationMenu?.applyLayout?.("hamburger"));
  await page.locator("#desktopActionMenu").click();
  await expect(page.locator(".header-action-menu .action-menu")).toBeVisible();
}

async function selectSettingsTab(page, tabName) {
  const modal = page.locator("#settings-modal");
  if (!(await modal.isVisible())) {
    await page.evaluate(() => document.querySelector(".open-settings-dialog")?.click());
    await expect(modal).toBeVisible();
  }
  await page.evaluate((targetTab) => {
    document.querySelector(`.settings-tab-button[data-settings-tab="${targetTab}"]`)?.click();
  }, tabName);
  await expect(page.locator(`.settings-panel[data-settings-panel="${tabName}"]`)).toBeVisible();
}
async function dispatchFolderWatcherEvent(page, detail) {
  await page.evaluate((eventDetail) => {
    window.dispatchEvent(new CustomEvent("folderWatcherEvent", { detail: eventDetail }));
  }, detail);
}

async function mockNeutralinoDialogs(page, options = {}) {
  const folders = [...(options.folders || [])];
  const files = [...(options.files || [])];
  const savePath = options.savePath || null;

  await page.evaluate(({ folderValues, fileValues, nextSavePath }) => {
    window.Neutralino = window.Neutralino || {};
    window.Neutralino.os = window.Neutralino.os || {};
    window.Neutralino.filesystem = window.Neutralino.filesystem || {};

    window.Neutralino.os.showFolderDialog = async () => folderValues.shift() || "";
    window.Neutralino.os.showOpenDialog = async () => fileValues.shift() || [];
    window.Neutralino.os.showSaveDialog = async () => nextSavePath || "";
  }, { folderValues: folders.map((value) => path.resolve(value)), fileValues: files, nextSavePath: savePath });
}

async function mockNeutralinoProcess(page, options = {}) {
  await page.evaluate((mockOptions) => {
    window.Neutralino = window.Neutralino || {};
    window.Neutralino.os = window.Neutralino.os || {};
    let nextProcessId = 9000;
    const processLog = [];
    window.__desktopProcessLog = processLog;

    window.Neutralino.os.spawnProcess = async (command) => {
      const id = nextProcessId++;
      processLog.push({ type: "spawn", id, command });
      setTimeout(() => {
        for (const line of mockOptions.stdout || []) {
          window.dispatchEvent(new CustomEvent("spawnedProcess", {
            detail: { id, action: "stdOut", data: line },
          }));
        }
        if (mockOptions.stderr) {
          window.dispatchEvent(new CustomEvent("spawnedProcess", {
            detail: { id, action: "stdErr", data: mockOptions.stderr },
          }));
        }
        if (mockOptions.autoExit !== false) {
          window.dispatchEvent(new CustomEvent("spawnedProcess", {
            detail: { id, action: "exit", data: String(mockOptions.exitCode ?? 0) },
          }));
        }
      }, mockOptions.delayMs || 25);
      return { id, pid: id + 1000 };
    };

    window.Neutralino.os.updateSpawnedProcess = async (id, action, data) => {
      processLog.push({ type: "update", id, action, data });
      return true;
    };

    window.Neutralino.os.execCommand = async (command) => {
      processLog.push({ type: "exec", command });
      return { exitCode: 0, stdOut: "", stdErr: "" };
    };
  }, options);
}

async function openCodeConverterDialog(page) {
  await page.evaluate(() => document.querySelector(".open-code-converter-dialog")?.click());
  await expect(page.locator("#code-converter-modal")).toBeVisible();
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_) {
    return false;
  }
}

module.exports = {
  activeEditorValue,
  codeMirrorDocText,
  dispatchFolderWatcherEvent,
  focusCodeMirror,
  mockNeutralinoDialogs,
  mockNeutralinoProcess,
  openActionMenu,
  openApp,
  openCodeConverterDialog,
  openDesktopFolder,
  pathExists,
  selectSettingsTab,
  selectViewMode,
  setActiveEditorSelection,
  setActiveEditorValue,
};





