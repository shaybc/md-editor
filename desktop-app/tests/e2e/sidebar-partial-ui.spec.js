const { test, expect } = require("./desktop-fixture");
const { openApp } = require("../helpers/desktop-ui");

async function installMockFolder(page, options = {}) {
  await page.evaluate((mockOptions) => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__openedPaths = [];
    window.__execCommands = [];
    window.__spawnedCommands = [];
    window.__updatedProcesses = [];
    window.__readDirectoryCalls = [];
    window.__moveCalls = [];
    window.__copyCalls = [];
    window.__removeCalls = [];
    window.__nextSpawnedProcessId = 100;
    const files = new Set(mockOptions.files || []);
    const folders = new Set(mockOptions.folders || []);
    const sourceContent = mockOptions.sourceContent || {};
    const listEntries = (path) => {
      const normalized = String(path).replace(/\\/g, "/");
      if (mockOptions.lazyDirectories) return mockOptions.lazyDirectories[normalized] || [];
      const children = [];
      for (const folderPath of folders) {
        const parent = folderPath.split("/").slice(0, -1).join("/");
        if (parent === normalized) children.push({ entry: folderPath.split("/").pop(), type: "DIRECTORY" });
      }
      for (const filePath of files) {
        const parent = filePath.split("/").slice(0, -1).join("/");
        if (parent === normalized) children.push({ entry: filePath.split("/").pop(), type: "FILE" });
      }
      return children;
    };
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async (path) => window.__openedPaths.push(String(path)),
        execCommand: async (command) => window.__execCommands.push(String(command)),
        spawnProcess: async (command) => {
          const id = window.__nextSpawnedProcessId++;
          window.__spawnedCommands.push(String(command));
          return { id, pid: 4000 + id };
        },
        updateSpawnedProcess: async (id, event, data) => {
          window.__updatedProcesses.push({ id, event, data });
          return { success: true };
        },
        setTray: async () => {},
      },
      filesystem: {
        readDirectory: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          window.__readDirectoryCalls.push(normalized);
          if (normalized === "C:/vault/too-expensive" && mockOptions.failOnTooExpensiveRead) throw new Error("Initial lazy open should not read this sibling.");
          return listEntries(normalized);
        },
        getStats: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          if (folders.has(normalized) || mockOptions.lazyDirectories?.[normalized]) return { isDirectory: true, modifiedAt: 1, createdAt: 1 };
          if (!files.has(normalized)) throw new Error("Missing path: " + normalized);
          return { isFile: true, modifiedAt: 1, createdAt: 1 };
        },
        readFile: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          if (sourceContent[normalized]) return sourceContent[normalized];
          if (!files.has(normalized)) throw new Error("Unexpected read path: " + normalized);
          return `# ${normalized.split(/[\\/]/).pop()}`;
        },
        writeFile: async (path) => files.add(String(path).replace(/\\/g, "/")),
        createDirectory: async (path) => folders.add(String(path).replace(/\\/g, "/")),
        remove: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          window.__removeCalls.push(normalized);
          const targets = normalized.startsWith("C:/") ? [normalized] : [normalized, `C:/vault/${normalized}`];
          Array.from(files).forEach((filePath) => {
            if (targets.some((target) => filePath === target || filePath.startsWith(`${target}/`))) files.delete(filePath);
          });
          Array.from(folders).forEach((folderPath) => {
            if (targets.some((target) => folderPath === target || folderPath.startsWith(`${target}/`))) folders.delete(folderPath);
          });
        },
        move: async (oldPath, newPath) => {
          const oldNormalized = String(oldPath).replace(/\\/g, "/");
          const newNormalized = String(newPath).replace(/\\/g, "/");
          window.__moveCalls.push({ oldPath: oldNormalized, newPath: newNormalized });
          for (const filePath of Array.from(files)) {
            if (filePath === oldNormalized || filePath.startsWith(`${oldNormalized}/`)) {
              files.delete(filePath);
              files.add(`${newNormalized}${filePath.slice(oldNormalized.length)}`);
            }
          }
          for (const folderPath of Array.from(folders)) {
            if (folderPath === oldNormalized || folderPath.startsWith(`${oldNormalized}/`)) {
              folders.delete(folderPath);
              folders.add(`${newNormalized}${folderPath.slice(oldNormalized.length)}`);
            }
          }
        },
        copy: async (oldPath, newPath) => {
          const oldNormalized = String(oldPath).replace(/\\/g, "/");
          const newNormalized = String(newPath).replace(/\\/g, "/");
          window.__copyCalls.push({ oldPath: oldNormalized, newPath: newNormalized });
          for (const filePath of Array.from(files)) {
            if (filePath === oldNormalized || filePath.startsWith(`${oldNormalized}/`)) {
              files.add(`${newNormalized}${filePath.slice(oldNormalized.length)}`);
            }
          }
          for (const folderPath of Array.from(folders)) {
            if (folderPath === oldNormalized || folderPath.startsWith(`${oldNormalized}/`)) {
              folders.add(`${newNormalized}${folderPath.slice(oldNormalized.length)}`);
            }
          }
        },
      },
      clipboard: { writeText: async () => {} },
    };
  }, options);
  await page.evaluate(() => window.markdownViewerApp.modules.sidebarContextTree.openFolderTree({ preventDefault() {} }));
  await expect(page.locator("#folder-tree-root > .folder-tree-list")).toBeVisible();
}

async function rightClickTreeItem(page, locator) {
  await locator.dispatchEvent("contextmenu", { bubbles: true, cancelable: true, button: 2, clientX: 150, clientY: 160 });
}
async function dragTreeItem(page, sourceLocator, targetLocator, options = {}) {
  const sourceElement = await sourceLocator.elementHandle();
  const targetElement = await targetLocator.elementHandle();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await sourceElement.dispatchEvent("dragstart", { dataTransfer, bubbles: true, cancelable: true });
  await targetElement.dispatchEvent("dragenter", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
  await targetElement.dispatchEvent("dragover", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
  await targetElement.dispatchEvent("drop", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
  await sourceElement.dispatchEvent("dragend", { dataTransfer, bubbles: true, cancelable: true });
  await dataTransfer.dispose();
  await sourceElement.dispose();
  await targetElement.dispose();
}

async function hoverDragTreeItem(page, sourceLocator, targetLocator, options = {}) {
  const sourceElement = await sourceLocator.elementHandle();
  let targetElement = await targetLocator.elementHandle();
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await sourceElement.dispatchEvent("dragstart", { dataTransfer, bubbles: true, cancelable: true });
  await targetElement.dispatchEvent("dragenter", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
  await targetElement.dispatchEvent("dragover", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
  return {
    async moveTo(nextTargetLocator) {
      await targetElement.dispatchEvent("dragleave", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
      await targetElement.dispose();
      targetElement = await nextTargetLocator.elementHandle();
      await targetElement.dispatchEvent("dragenter", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
      await targetElement.dispatchEvent("dragover", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
    },
    async drop() {
      await targetElement.dispatchEvent("drop", { dataTransfer, bubbles: true, cancelable: true, ctrlKey: !!options.ctrlKey });
      await sourceElement.dispatchEvent("dragend", { dataTransfer, bubbles: true, cancelable: true });
      await dataTransfer.dispose();
      await sourceElement.dispose();
      await targetElement.dispose();
    },
    async cancel() {
      await sourceElement.dispatchEvent("dragend", { dataTransfer, bubbles: true, cancelable: true });
      await dataTransfer.dispose();
      await sourceElement.dispose();
      await targetElement.dispose();
    }
  };
}

test.describe("desktop sidebar exact migrated UI", () => {
  test("sidebar file context menu opens original source file in default app", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/client", "C:/vault/client/api"],
      files: ["C:/vault/client/api/aboutApi.js.md"],
      sourceContent: {
        "C:/vault/client/api/aboutApi.js.md": "# About API\n\n---\nsource_file: C:/workspace/my_project/client/api/aboutApi.js\n---\n\n## Details",
      },
    });
    await page.locator("details[data-path='client'] summary").click();
    await page.locator("details[data-path='client/api'] summary").click();
    const file = page.locator(".folder-tree-file", { hasText: "aboutApi.js.md" });
    await expect(file).toBeVisible();

    await rightClickTreeItem(page, file);
    const menu = page.locator(".sidebar-file-context-menu:not(.hidden)");
    await expect.poll(() => menu.evaluate((contextMenu) => Array.from(contextMenu.children)
      .filter((child) => child.matches("button.graph-context-menu-item:not(.hidden)"))
      .slice(0, 3)
      .map((button) => button.querySelector(".graph-context-menu-item-label")?.textContent?.trim()))).toEqual([
        "Open in a new tab",
        "Open in default app",
        "Reveal in file explorer",
      ]);
    const originalSourceSubmenu = menu.locator(".graph-context-menu-submenu", { hasText: "Original Source" });
    await expect(originalSourceSubmenu).toBeVisible();
    await expect(originalSourceSubmenu.locator(".graph-context-menu-item", { hasText: "Open original in a new tab" })).toHaveCount(1);
    await expect(originalSourceSubmenu.locator(".graph-context-menu-item", { hasText: "Open original in default app" })).toHaveCount(1);
    await expect(originalSourceSubmenu.locator(".graph-context-menu-item", { hasText: "Reveal original in file explorer" })).toHaveCount(1);
    await originalSourceSubmenu.locator(".graph-context-menu-item", { hasText: "Open original in default app" }).evaluate((button) => button.click());

    await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual(["C:/workspace/my_project/client/api/aboutApi.js"]);
  });

  test("bulk file context actions open every selected file and ignore folders", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/archive"],
      files: ["C:/vault/alpha.md", "C:/vault/beta.md"],
    });
    const archive = page.locator(".folder-tree-label", { hasText: "archive" });
    const alpha = page.locator(".folder-tree-file", { hasText: "alpha.md" });
    const beta = page.locator(".folder-tree-file", { hasText: "beta.md" });

    await archive.click();
    await alpha.click({ modifiers: ["Control"] });
    await beta.click({ modifiers: ["Control"] });
    await rightClickTreeItem(page, beta);
    let menu = page.locator(".sidebar-file-context-menu:not(.hidden)");
    await expect(menu.locator(".graph-context-menu-title")).toHaveText("3 selected items");
    const openInNewTab = menu.locator(".graph-context-menu-item", { hasText: "Open in a new tab" });
    await expect(openInNewTab).toBeEnabled();
    await openInNewTab.evaluate((button) => button.click());

    await expect(page.locator('#tab-list .tab-item[aria-label="C:/vault/alpha.md"]')).toHaveCount(1);
    await expect(page.locator('#tab-list .tab-item[aria-label="C:/vault/beta.md"]')).toHaveCount(1);
    await expect(page.locator('#tab-list .tab-item[aria-label="C:/vault/archive"]')).toHaveCount(0);

    await archive.click();
    await alpha.click({ modifiers: ["Control"] });
    await beta.click({ modifiers: ["Control"] });
    await rightClickTreeItem(page, alpha);
    menu = page.locator(".sidebar-file-context-menu:not(.hidden)");
    const openInDefaultApp = menu.locator(".graph-context-menu-item", { hasText: "Open in default app" });
    await expect(openInDefaultApp).toBeEnabled();
    await openInDefaultApp.evaluate((button) => button.click());

    await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual([
      "C:/vault/alpha.md",
      "C:/vault/beta.md",
    ]);
  });

  test("sidebar folder context menu reveals original source folder", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/client", "C:/vault/client/api", "C:/vault/client/editor"],
      files: ["C:/vault/client/api/aboutApi.js.md", "C:/vault/client/editor/editor.js.md"],
      sourceContent: {
        "C:/vault/client/api/aboutApi.js.md": "---\nsource_file: \"C:/workspace/my_project/client/api/aboutApi.js\"\n---\n# About API",
        "C:/vault/client/editor/editor.js.md": "---\nsource_file: \"C:/workspace/my_project/client/editor/editor.js\"\n---\n# Editor",
      },
    });
    const client = page.locator(".folder-tree-label", { hasText: "client" });
    await expect(client).toBeVisible();

    await rightClickTreeItem(page, client);
    await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal original folder" }).evaluate((button) => button.click());

    await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual(["C:/workspace/my_project/client"]);
  });

  test("sidebar file context menu reveals desktop files in Windows Explorer", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, { files: ["C:/vault/desktop-note.md"] });
    const file = page.locator(".folder-tree-file", { hasText: "desktop-note.md" });
    await expect(file).toBeVisible();

    await rightClickTreeItem(page, file);
    await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Reveal in file explorer" }).evaluate((button) => button.click());

    await expect.poll(() => page.evaluate(() => window.__execCommands)).toEqual([
      'cmd /c start "" explorer.exe /select,"C:\\vault\\desktop-note.md"',
    ]);
    await expect.poll(() => page.evaluate(() => window.__openedPaths)).toEqual([]);
  });

  test("desktop folder open renders a lazy root without threshold pre-scan", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }) },
    });
    await installMockFolder(page, {
      lazyDirectories: {
        "C:/vault": [{ entry: "already-large", type: "DIRECTORY" }, { entry: "too-expensive", type: "DIRECTORY" }],
        "C:/vault/already-large": [{ entry: "first.md", type: "FILE" }],
      },
    });

    await expect(page.locator(".folder-tree-label", { hasText: "already-large" })).toBeVisible();
    await expect(page.locator(".folder-tree-label", { hasText: "too-expensive" })).toBeVisible();
    await expect(page.locator(".folder-tree-file", { hasText: "first.md" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls[0])).toBe("C:/vault");
  });

  test("lazy desktop folder count bridge updates the status bar from JSON output", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }) },
    });
    await installMockFolder(page, {
      lazyDirectories: {
        "C:/vault": [{ entry: "already-large", type: "DIRECTORY" }],
        "C:/vault/already-large": [{ entry: "first.md", type: "FILE" }],
      },
    });

    await expect.poll(() => page.evaluate(() => window.__spawnedCommands)).toHaveLength(1);
    await expect.poll(() => page.evaluate(() => window.__spawnedCommands[0])).toContain("resources/bridges/folder-count-bridge/folder-count-bridge.cjs");
    await expect.poll(() => page.evaluate(() => window.__spawnedCommands[0])).not.toContain("robocopy");
    await expect(page.locator("#status-tip")).toHaveText("Counting files and folders...");
    await expect(page.locator("#status-tip")).toHaveClass(/status-progress-loop/);

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("spawnedProcess", {
        detail: { id: 100, action: "stdOut", data: `${JSON.stringify({ type: "result", files: 42, folders: 7, exitCode: 1 })}\n` }
      }));
    });

    await expect(page.locator("#folder-file-count")).toHaveText("42");
    await expect(page.locator("#folder-directory-count")).toHaveText("7");
    await expect(page.locator("#status-tip")).toHaveText("Tip: drag in text files, use split preview, or open a folder to build a graph.");
    await expect(page.locator("#status-tip")).not.toHaveClass(/status-progress-loop/);
  });

  test("closing a lazy desktop folder cancels the count bridge and ignores late output", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }) },
    });
    await installMockFolder(page, {
      lazyDirectories: {
        "C:/vault": [{ entry: "already-large", type: "DIRECTORY" }],
        "C:/vault/already-large": [{ entry: "first.md", type: "FILE" }],
      },
    });

    await expect.poll(() => page.evaluate(() => window.__spawnedCommands)).toHaveLength(1);
    await page.evaluate(() => document.querySelector(".close-folder-button")?.click());

    await expect(page.locator("#status-tip")).toHaveText("Tip: drag in text files, use split preview, or open a folder to build a graph.");
    await expect(page.locator("#status-tip")).not.toHaveClass(/status-progress-loop/);
    await expect.poll(() => page.evaluate(() => window.__updatedProcesses.map((entry) => entry.event))).toEqual(["stdIn", "exit"]);
    await expect.poll(() => page.evaluate(() => window.__execCommands)).toContain("cmd /c taskkill /PID 4100 /T /F");

    await page.evaluate(() => {
      window.dispatchEvent(new CustomEvent("spawnedProcess", {
        detail: { id: 100, action: "stdOut", data: `${JSON.stringify({ type: "result", files: 99, folders: 88, exitCode: 1 })}\n` }
      }));
    });

    await expect(page.locator("#folder-file-count")).toHaveText("0");
    await expect(page.locator("#folder-directory-count")).toHaveText("0");
  });

  test("desktop folder count bridge starts for every opened folder", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/docs"],
      files: ["C:/vault/readme.md", "C:/vault/docs/guide.md"],
    });

    await expect.poll(() => page.evaluate(() => window.__spawnedCommands)).toHaveLength(1);
    await expect(page.locator("#folder-file-count")).toHaveText("0");
    await expect(page.locator("#folder-directory-count")).toHaveText("0");
  });

  test("deleting sidebar files and folders updates the tree without reloading it", async ({ page }) => {
    page.on("dialog", async (dialog) => dialog.accept());
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmDeleteFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/notes"],
      files: ["C:/vault/alpha.md", "C:/vault/archive/gamma.md", "C:/vault/notes/beta.md"],
    });
    await page.evaluate(() => {
      window.markdownViewerApp.services.confirm = async () => true;
    });
    const initialReadCount = await page.evaluate(() => window.__readDirectoryCalls.length);
    await page.evaluate(() => {
      const details = Array.from(document.querySelectorAll("#folder-tree-root details")).find((node) => node.dataset.path === "archive");
      if (details) details.open = false;
    });

    await rightClickTreeItem(page, page.locator(".folder-tree-file", { hasText: "alpha.md" }));
    await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Delete file" }).evaluate((button) => button.click());
    await expect(page.locator(".folder-tree-file", { hasText: "alpha.md" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.length)).toBe(initialReadCount);

    await page.evaluate(async () => {
      const notesNode = window.markdownViewerApp.state.currentFolderTreeNodes.find((node) => node.name === "notes");
      await window.markdownViewerApp.modules.sidebarContextTree.deleteSidebarFolder(notesNode);
    });
    await expect(page.locator(".folder-tree-label", { hasText: "notes" })).toHaveCount(0);
    await expect(page.locator(".folder-tree-file", { hasText: "beta.md" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.length)).toBe(initialReadCount);
  });

  test("renaming sidebar files and folders updates the tree without reloading it", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/notes"],
      files: ["C:/vault/alpha.md", "C:/vault/archive/gamma.md", "C:/vault/notes/beta.md"],
    });
    const initialReadCalls = await page.evaluate(() => window.__readDirectoryCalls.slice());

    await rightClickTreeItem(page, page.locator(".folder-tree-file", { hasText: "alpha.md" }));
    await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).evaluate((button) => button.click());
    await page.locator("#rename-modal-input").fill("zeta.tx");
    await page.locator("#rename-modal-confirm").click();
    await expect(page.locator(".folder-tree-file", { hasText: "zeta.tx" })).toHaveCount(1);
    await expect(page.locator(".folder-tree-file", { hasText: "alpha.md" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);

    await page.evaluate(() => {
      const notesNode = window.markdownViewerApp.state.currentFolderTreeNodes.find((node) => node.name === "notes");
      window.__renameFolderPromise = window.markdownViewerApp.modules.sidebarContextTree.renameSidebarNodeOnDisk(notesNode, "folder");
    });
    await expect(page.locator("#rename-modal")).toBeVisible();
    await page.locator("#rename-modal-input").fill("drafts");
    await page.locator("#rename-modal-confirm").click();
    await page.evaluate(() => window.__renameFolderPromise);
    await expect(page.locator(".folder-tree-label", { hasText: "drafts" })).toHaveCount(1);
    await expect(page.locator(".folder-tree-label", { hasText: "notes" })).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);
  });

  test("creating sidebar files and folders updates the tree without reloading it", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/notes"],
      files: ["C:/vault/archive/gamma.md", "C:/vault/notes/beta.md"],
    });
    const initialReadCalls = await page.evaluate(() => window.__readDirectoryCalls.slice());

    await page.evaluate(() => {
      const notesNode = window.markdownViewerApp.state.currentFolderTreeNodes.find((node) => node.name === "notes");
      window.__createFilePromise = window.markdownViewerApp.modules.sidebarContextTree.createSidebarFileOnDisk(notesNode);
    });
    await expect(page.locator("#rename-modal")).toBeVisible();
    await page.locator("#rename-modal-input").fill("new-note.md");
    await page.locator("#rename-modal-confirm").click();
    await page.evaluate(() => window.__createFilePromise);
    await expect(page.locator(".folder-tree-file", { hasText: "new-note.md" })).toHaveCount(1);

    await page.evaluate(() => {
      const rootNode = window.markdownViewerApp.modules.sidebarContextTree.getOpenFolderRootContextNode();
      window.__createFolderPromise = window.markdownViewerApp.modules.sidebarContextTree.createSidebarFolderOnDisk(rootNode);
    });
    await expect(page.locator("#rename-modal")).toBeVisible();
    await page.locator("#rename-modal-input").fill("drafts");
    await page.locator("#rename-modal-confirm").click();
    await page.evaluate(() => window.__createFolderPromise);
    await expect(page.locator(".folder-tree-label", { hasText: "drafts" })).toHaveCount(1);
    await expect(page.locator("#folder-tree-root > .folder-tree-list > .folder-tree-item > details > .folder-tree-children > .folder-tree-list > .folder-tree-item > details[data-path='drafts']")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual([...initialReadCalls, "C:/vault/notes"]);
  });

  test("folder view move confirmation cancels or approves the filesystem move", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/archive"],
      files: ["C:/vault/alpha.md"],
    });
    const source = page.locator(".folder-tree-file[data-path='alpha.md']");
    const target = page.locator("details[data-path='archive'] > summary");

    await dragTreeItem(page, source, target);
    await expect(page.locator("#app-notification-message")).toHaveText("Move “alpha.md” to “archive”?");
    await expect(page.locator('[data-notification-button-id="confirm"]')).toHaveText("Move");
    await expect(page.evaluate(() => window.__moveCalls.slice())).resolves.toEqual([]);
    await page.locator('[data-notification-button-id="cancel"]').click();
    await expect(page.evaluate(() => window.__moveCalls.slice())).resolves.toEqual([]);

    await dragTreeItem(page, source, target);
    await page.locator('[data-notification-button-id="confirm"]').click();
    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
    ]);
  });

  test("Ctrl-drag copies every selected sidebar item after one confirmation", async ({ page }) => {
    await openApp(page);
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/notes"],
      files: ["C:/vault/alpha.md", "C:/vault/notes/beta.md"],
    });
    const alpha = page.locator(".folder-tree-file[data-path='alpha.md']");
    const notes = page.locator("details[data-path='notes'] > summary");
    const beta = page.locator(".folder-tree-file[data-path='notes/beta.md']");
    const archive = page.locator("details[data-path='archive'] > summary");
    await notes.click();
    await alpha.click({ modifiers: ["Control"] });
    await beta.click({ modifiers: ["Control"] });

    await dragTreeItem(page, alpha, archive, { ctrlKey: true });
    await expect(page.locator("#app-notification-message")).toHaveText("Copy 3 selected items to “archive”?");
    await expect(page.locator('[data-notification-button-id="confirm"]')).toHaveText("Copy");
    await page.locator('[data-notification-button-id="confirm"]').click();

    await expect.poll(() => page.evaluate(() => window.__copyCalls.slice())).toEqual([
      { oldPath: "C:/vault/notes", newPath: "C:/vault/archive/notes" },
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
    ]);
    await expect(page.evaluate(() => window.__moveCalls.slice())).resolves.toEqual([]);
    await expect(alpha).toHaveClass(/multi-selected/);
    await expect(notes).toHaveClass(/multi-selected/);
    await expect(beta).toHaveClass(/multi-selected/);
    await expect(page.locator("details[data-path='archive/notes'] > summary", { hasText: "notes" })).toHaveCount(1);
  });

  test("Ctrl-drag copy inserts a copied XML file into the visible tree", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/archive/existing-folder"],
      files: ["C:/vault/pom.xml", "C:/vault/archive/keep.md"],
    });
    await page.evaluate(async () => {
      const tree = window.markdownViewerApp.modules.sidebarContextTree;
      const archive = document.querySelector("details[data-path='archive']");
      await tree.renderFolderTreeLazyChildren(archive);
      archive.open = true;
    });
    await expect(page.locator("details[data-path='archive/existing-folder'] > summary", { hasText: "existing-folder" })).toHaveCount(1);
    await expect(page.locator(".folder-tree-file[data-path='archive/keep.md']")).toHaveCount(1);
    const initialReadCalls = await page.evaluate(() => window.__readDirectoryCalls.slice());

    await dragTreeItem(
      page,
      page.locator(".folder-tree-file[data-path='pom.xml']"),
      page.locator("details[data-path='archive'] > summary"),
      { ctrlKey: true }
    );

    await expect.poll(() => page.evaluate(() => window.__copyCalls.slice())).toEqual([
      { oldPath: "C:/vault/pom.xml", newPath: "C:/vault/archive/pom.xml" },
    ]);
    await expect(page.locator(".folder-tree-file[data-path='pom.xml']")).toHaveCount(1);
    await expect(page.locator(".folder-tree-file[data-path='archive/pom.xml']")).toHaveCount(1);
    await expect(page.locator("details[data-path='archive/existing-folder'] > summary", { hasText: "existing-folder" })).toHaveCount(1);
    await expect(page.locator(".folder-tree-file[data-path='archive/keep.md']")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);
  });

  test("Ctrl-drag copy asks before overwriting an existing destination", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive"],
      files: ["C:/vault/alpha.md", "C:/vault/archive/alpha.md"],
    });
    const source = page.locator("#folder-tree-root > .folder-tree-list .folder-tree-file[data-path='alpha.md']");
    const target = page.locator("details[data-path='archive'] > summary");

    await dragTreeItem(page, source, target, { ctrlKey: true });
    await expect(page.locator("#app-notification-title")).toHaveText("Copy conflict");
    await expect(page.locator("#app-notification-message")).toHaveText("“alpha.md” already exists in “archive”. Overwrite it?");
    await expect(page.locator('[data-notification-button-id="cancel"]')).toHaveText("Cancel copy");
    await expect(page.locator('[data-notification-button-id="overwrite"]')).toHaveText("Overwrite");
    await page.locator('[data-notification-button-id="cancel"]').click();
    await expect(page.evaluate(() => window.__copyCalls.slice())).resolves.toEqual([]);
    await expect(page.evaluate(() => window.__removeCalls.slice())).resolves.toEqual([]);

    await dragTreeItem(page, source, target, { ctrlKey: true });
    await page.locator('[data-notification-button-id="overwrite"]').click();
    await expect.poll(() => page.evaluate(() => window.__removeCalls.slice())).toEqual(["C:/vault/archive/alpha.md"]);
    await expect.poll(() => page.evaluate(() => window.__copyCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
    ]);
    await expect(page.locator(".folder-tree-file[data-path='archive/alpha.md']")).toHaveCount(1);
  });

  test("drag move asks before overwriting an existing destination", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive"],
      files: ["C:/vault/alpha.md", "C:/vault/archive/alpha.md"],
    });
    const source = page.locator("#folder-tree-root > .folder-tree-list .folder-tree-file[data-path='alpha.md']");
    const target = page.locator("details[data-path='archive'] > summary");

    await dragTreeItem(page, source, target);
    await expect(page.locator("#app-notification-title")).toHaveText("Move conflict");
    await expect(page.locator('[data-notification-button-id="cancel"]')).toHaveText("Cancel move");
    await page.locator('[data-notification-button-id="overwrite"]').click();
    await expect.poll(() => page.evaluate(() => window.__removeCalls.slice())).toEqual(["C:/vault/archive/alpha.md"]);
    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
    ]);
    await expect(page.locator("#folder-tree-root > .folder-tree-list .folder-tree-file[data-path='alpha.md']")).toHaveCount(0);
    await expect(page.locator(".folder-tree-file[data-path='archive/alpha.md']")).toHaveCount(1);
  });

  test("dragging over a closed folder opens it after a hover delay", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/archive/deep"],
      files: ["C:/vault/alpha.md"],
    });
    const archive = page.locator("details[data-path='archive']");
    await expect(archive).toHaveJSProperty("open", false);

    const drag = await hoverDragTreeItem(
      page,
      page.locator(".folder-tree-file[data-path='alpha.md']"),
      page.locator("details[data-path='archive'] > summary")
    );
    await page.waitForTimeout(1100);

    await expect(archive).toHaveJSProperty("open", true);
    await expect(page.locator("details[data-path='archive/deep'] > summary", { hasText: "deep" })).toHaveCount(1);
    await drag.drop();
    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
    ]);
  });

  test("drag hover reopens a folder after it is manually collapsed", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/archive/deep"],
      files: ["C:/vault/alpha.md"],
    });
    const archive = page.locator("details[data-path='archive']");
    const drag = await hoverDragTreeItem(
      page,
      page.locator(".folder-tree-file[data-path='alpha.md']"),
      page.locator("details[data-path='archive'] > summary")
    );
    await page.waitForTimeout(1100);
    await expect(archive).toHaveJSProperty("open", true);

    await page.evaluate(async () => {
      const tree = window.markdownViewerApp.modules.sidebarContextTree;
      await tree.toggleFolderTreeDetails(document.querySelector("details[data-path='archive']"));
    });
    await page.waitForTimeout(300);
    await expect(archive).toHaveJSProperty("open", false);
    await page.waitForTimeout(1100);
    await expect(archive).toHaveJSProperty("open", true);
    await drag.cancel();
  });

  test("dropping into a folder revealed by drag hover updates that folder", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/archive/deep"],
      files: ["C:/vault/alpha.md"],
    });

    const drag = await hoverDragTreeItem(
      page,
      page.locator(".folder-tree-file[data-path='alpha.md']"),
      page.locator("details[data-path='archive'] > summary")
    );
    await page.waitForTimeout(1100);
    await expect(page.locator("details[data-path='archive']")).toHaveJSProperty("open", true);
    await drag.moveTo(page.locator("details[data-path='archive/deep'] > summary"));
    await page.waitForTimeout(1100);
    await expect(page.locator("details[data-path='archive/deep']")).toHaveJSProperty("open", true);
    await drag.drop();

    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/deep/alpha.md" },
    ]);
    await expect(page.locator(".folder-tree-file[data-path='archive/deep/alpha.md']")).toHaveCount(1);
  });

  test("moving selected files removes them from the visible source folder", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/archive/existing-folder", "C:/vault/source"],
      files: ["C:/vault/archive/keep.md", "C:/vault/source/one.md", "C:/vault/source/two.md"],
    });

    const archive = page.locator("details[data-path='archive'] > summary");
    await page.evaluate(async () => {
      const tree = window.markdownViewerApp.modules.sidebarContextTree;
      for (const details of document.querySelectorAll("details[data-path='source'], details[data-path='archive']")) {
        await tree.renderFolderTreeLazyChildren(details);
        details.open = true;
      }
    });
    const one = page.locator(".folder-tree-file[data-path='source/one.md']");
    const two = page.locator(".folder-tree-file[data-path='source/two.md']");
    await one.click({ modifiers: ["Control"] });
    await two.click({ modifiers: ["Control"] });

    await dragTreeItem(page, one, archive);

    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/source/one.md", newPath: "C:/vault/archive/one.md" },
      { oldPath: "C:/vault/source/two.md", newPath: "C:/vault/archive/two.md" },
    ]);
    await expect(page.locator(".folder-tree-file[data-path='source/one.md']")).toHaveCount(0);
    await expect(page.locator(".folder-tree-file[data-path='source/two.md']")).toHaveCount(0);
    await expect(page.locator(".folder-tree-file[data-path='archive/one.md']")).toHaveCount(1);
    await expect(page.locator(".folder-tree-file[data-path='archive/two.md']")).toHaveCount(1);
    await expect(page.locator("details[data-path='archive/existing-folder'] > summary", { hasText: "existing-folder" })).toHaveCount(1);
    await expect(page.locator(".folder-tree-file[data-path='archive/keep.md']")).toHaveCount(1);
  });

  test("action-specific folder tree updates keep open folders expanded", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive"],
      files: ["C:/vault/alpha.md"],
    });
    const archive = page.locator("details[data-path='archive']");
    await archive.evaluate((details) => { details.open = true; });

    await page.evaluate(() => {
      window.markdownViewerApp.modules.sidebarContextTree.upsertCreatedPathInFolderTree({
        kind: "directory",
        name: "archive",
        path: "archive",
        fullPath: "C:/vault/archive",
        children: []
      });
    });

    await expect(archive).toHaveJSProperty("open", true);
  });

  test("dragging sidebar files and folders updates the visible tree without reloading it", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmMoveFiles: false }) },
    });
    await installMockFolder(page, {
      folders: ["C:/vault/archive", "C:/vault/notes"],
      files: ["C:/vault/alpha.md", "C:/vault/archive/gamma.md", "C:/vault/notes/beta.md"],
    });
    const initialReadCalls = await page.evaluate(() => window.__readDirectoryCalls.slice());

    await dragTreeItem(
      page,
      page.locator(".folder-tree-file[data-path='alpha.md']"),
      page.locator("details[data-path='archive'] > summary")
    );
    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
    ]);
    await expect(page.locator("details[data-path='archive'] .folder-tree-file", { hasText: "alpha.md" })).toHaveCount(1);
    await expect(page.locator(".folder-tree-file[data-path='alpha.md']")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);

    await dragTreeItem(
      page,
      page.locator("details[data-path='notes'] > summary"),
      page.locator("details[data-path='archive'] > summary")
    );
    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
      { oldPath: "C:/vault/notes", newPath: "C:/vault/archive/notes" },
    ]);
    await expect(page.locator("details[data-path='archive/notes'] > summary", { hasText: "notes" })).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => {
      const archive = window.markdownViewerApp.state.currentFolderTreeNodes.find((node) => node.name === "archive");
      return archive?.children?.some((node) => node.name === "notes" && node.path === "archive/notes") === true;
    })).toBe(true);

    await dragTreeItem(
      page,
      page.locator("details[data-path='archive'] > summary"),
      page.locator("details[data-path='archive/notes'] > summary")
    );
    await expect(page.evaluate(() => window.__moveCalls.length)).resolves.toBe(2);

    await dragTreeItem(
      page,
      page.locator("details[data-path='archive/notes'] > summary"),
      page.locator("#folder-tree-root")
    );
    await expect.poll(() => page.evaluate(() => window.__moveCalls.slice())).toEqual([
      { oldPath: "C:/vault/alpha.md", newPath: "C:/vault/archive/alpha.md" },
      { oldPath: "C:/vault/notes", newPath: "C:/vault/archive/notes" },
      { oldPath: "C:/vault/archive/notes", newPath: "C:/vault/notes" },
    ]);
    await expect(page.locator("#folder-tree-root > .folder-tree-list > .folder-tree-item > details[data-path='notes'] > summary", { hasText: "notes" })).toHaveCount(1);
    await expect(page.locator("details[data-path='archive/notes']")).toHaveCount(0);
    await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls.slice())).toEqual(initialReadCalls);

    await dragTreeItem(
      page,
      page.locator("details[data-path='notes'] > summary"),
      page.locator("details[data-path='archive'] > summary"),
      { ctrlKey: true }
    );
    await expect(page.locator("#app-notification-modal")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.__copyCalls.slice())).toEqual([
      { oldPath: "C:/vault/notes", newPath: "C:/vault/archive/notes" },
    ]);
  });
});
