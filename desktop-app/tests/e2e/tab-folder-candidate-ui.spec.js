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
test("empty folder view clones a Git repository and opens the cloned folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__cloneCommands = [];
    window.__openedFolders = [];
    window.__installCloneRepositoryMocks = () => {
      window.prompt = () => "https://github.com/acme/demo.git";
      window.Neutralino = {
        os: {
          setTray: async () => true,
          showFolderDialog: async () => "C:/Projects",
          execCommand: async (command) => {
            window.__cloneCommands.push(command);
            return { exitCode: 0, stdOut: "", stdErr: "" };
          }
        },
        filesystem: {
          readDirectory: async (path) => {
            const normalized = String(path).replace(/\\/g, "/");
            window.__openedFolders.push(normalized);
            if (normalized === "C:/Projects/demo") return [{ entry: "README.md", type: "FILE" }];
            return [];
          },
          getStats: async (path) => {
            const normalized = String(path).replace(/\\/g, "/");
            if (normalized === "C:/Projects/demo/README.md") return { isFile: true, modifiedAt: 1, createdAt: 1 };
            throw new Error("missing: " + normalized);
          },
          readFile: async () => "# Demo"
        }
      };
    };
    window.__installCloneRepositoryMocks();
  });
  await page.goto("/");
  await page.evaluate(() => window.__installCloneRepositoryMocks());
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.sidebarContextTree?.handleFolderTreeRootClick);
  const cloneLink = page.locator(".folder-tree-clone-repository-link");
  await cloneLink.click();
  await page.locator("#app-notification-input").fill("https://github.com/acme/demo.git");
  await page.locator("[data-notification-button-id='confirm']").click();

  await expect.poll(() => page.evaluate(() => window.__cloneCommands)).toEqual([
    'git -c core.longpaths=true clone --progress "https://github.com/acme/demo.git" "C:/Projects/demo"'
  ]);
  await expect.poll(() => page.evaluate(() => window.__openedFolders.includes("C:/Projects/demo"))).toBe(true);
  await expect(page.locator(".folder-tree-file", { hasText: "README.md" })).toBeVisible();
});
test("tab context menu opens a generated markdown tab project folder", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.__openedFolders = [];
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault"
      },
      filesystem: {
        readDirectory: async (path) => {
          window.__openedFolders.push(path);
          return [];
        },
        getStats: async (path) => {
          if (String(path).replace(/\\/g, "/") === "C:/vault/.md-editor/_md_editor_project.json") return { isFile: true };
          throw new Error("missing");
        },
        readFile: async () => ""
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
  await page.evaluate(() => {
    window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab("# About API", "aboutApi.js", {
      name: "aboutApi.js.md",
      path: "C:/vault/client/api/aboutApi.js.md"
    });
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "aboutApi.js" })).toBeVisible();

  await page.locator("#tab-list .tab-item", { hasText: "aboutApi.js" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 180,
    clientY: 140
  });
  await page.locator(".tab-context-menu-action[data-action='open-project-folder']").evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/vault"]);
});

test("tab context menu falls back to containing folder when no generated project folder is found", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.__openedFolders = [];
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/loose/notes"
      },
      filesystem: {
        readDirectory: async (path) => {
          window.__openedFolders.push(path);
          return [];
        },
        getStats: async () => {
          throw new Error("missing");
        },
        readFile: async () => ""
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
  await page.evaluate(() => {
    window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab("# Rogue", "rogue", {
      name: "rogue.md",
      path: "C:/loose/notes/rogue.md"
    });
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "rogue" })).toBeVisible();

  await page.locator("#tab-list .tab-item", { hasText: "rogue" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 180,
    clientY: 140
  });
  await page.locator(".tab-context-menu-action[data-action='open-project-folder']").evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/loose/notes"]);
  const parentFolder = page.locator(".folder-tree-label", { hasText: ".." });
  await expect(parentFolder).toBeVisible();
  await parentFolder.evaluate((button) => button.click());
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/loose/notes", "C:/loose"]);
});

test("tab context menu does not reopen the folder that is already active", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.__openedFolders = [];
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault"
      },
      filesystem: {
        readDirectory: async (path) => {
          window.__openedFolders.push(path);
          return [];
        },
        getStats: async (path) => {
          if (String(path).replace(/\\/g, "/") === "C:/vault/.md-editor/_md_editor_project.json") return { isFile: true };
          throw new Error("missing");
        },
        readFile: async () => ""
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
  await page.locator("#import-from-folder").click();
  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual(["C:/vault"]);
  await page.evaluate(() => {
    window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab("# Alpha", "alpha", {
      name: "alpha.md",
      path: "C:/vault/alpha.md"
    });
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toBeVisible();
  await page.evaluate(() => { window.__openedFolders = []; });

  await page.locator("#tab-list .tab-item", { hasText: "alpha" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 180,
    clientY: 140
  });
  await page.locator(".tab-context-menu-action[data-action='open-project-folder']").evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => window.__openedFolders)).toEqual([]);
});

test("renaming folder-backed files updates open tab titles", async ({ page }) => {
  await openApp(page);

  await page.evaluate(() => {
    let fileName = "alpha.md";
    const fileHandle = {
      kind: "file",
      get name() { return fileName; },
      getFile: async () => new File(["# Alpha"], fileName, { type: "text/markdown" }),
      createWritable: async () => ({ write: async () => {}, close: async () => {} }),
      move: async (nextName) => {
        fileName = nextName;
      }
    };
    window.__renamedFileName = () => fileName;
    window.showDirectoryPicker = async () => ({
      kind: "directory",
      name: "Test Folder",
      values: async function* values() {
        yield fileHandle;
      }
    });
  });

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { hasText: "alpha" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 80
  });
  await page.locator(".tab-context-menu-action[data-action='rename']").evaluate((button) => button.click());
  await page.locator("#rename-modal-input").fill("renamed.md");
  await page.locator("#rename-modal-confirm").click();

  await expect.poll(() => page.evaluate(() => window.__renamedFileName())).toBe("renamed.md");
  await expect(page.locator("#tab-list .tab-item", { hasText: "renamed" })).toHaveCount(1);
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(0);
});

test("renames desktop folder files from tree, tab, and graph without showing an error", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    window.NL_OS = "Windows";
    window.__alerts = [];
    window.__moves = [];
    window.alert = (message) => window.__alerts.push(String(message));

    let fileName = "alpha.md";
    const getPath = () => `C:/vault/${fileName}`;
    window.Neutralino = {
      os: {
        showFolderDialog: async () => "C:/vault",
        open: async () => {},
        execCommand: async () => {}
      },
      filesystem: {
        readDirectory: async (path) => {
          if (path === "C:/vault") return [{ entry: fileName, type: "FILE" }];
          return [];
        },
        getStats: async () => ({ modifiedAt: 1, createdAt: 1 }),
        readFile: async (path) => {
          if (path === getPath()) return "# Alpha";
          throw new Error("Unexpected read path: " + path);
        },
        writeFile: async () => {},
        move: async (oldPath, newPath) => {
          window.__moves.push({ oldPath, newPath });
          fileName = newPath.split(/[\\/]/).pop();
        }
      },
      clipboard: { writeText: async () => {} }
    };
  });
  await openApp(page);

  await page.locator("#import-from-folder").click();
  await page.locator(".folder-tree-file", { hasText: "alpha.md" }).evaluate((button) => {
    button.dispatchEvent(new MouseEvent("dblclick", { bubbles: true, cancelable: true }));
  });
  await expect(page.locator("#tab-list .tab-item", { hasText: "alpha" })).toHaveCount(1);

  await page.locator("#tab-list .tab-item", { hasText: "alpha" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 120,
    clientY: 80
  });
  await page.locator(".tab-context-menu-action[data-action='rename']").evaluate((button) => button.click());
  await page.locator("#rename-modal-input").fill("beta.md");
  await page.locator("#rename-modal-confirm").click();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect(page.locator("#tab-list .tab-item", { hasText: "beta" })).toHaveCount(1);

  await page.locator(".folder-tree-file", { hasText: "beta.md" }).dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 90,
    clientY: 180
  });
  await page.locator(".sidebar-file-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).evaluate((button) => button.click());
  await page.locator("#rename-modal-input").fill("gamma.md");
  await page.locator("#rename-modal-confirm").click();
  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect(page.locator("#tab-list .tab-item", { hasText: "gamma" })).toHaveCount(1);

  await page.locator(".open-graph-view").first().click();
  await expect(page.locator(".graph-node-file")).toHaveCount(1);
  await page.locator(".graph-node-file").dispatchEvent("contextmenu", {
    bubbles: true,
    cancelable: true,
    button: 2,
    clientX: 220,
    clientY: 220
  });
  await page.locator(".graph-tab-render .graph-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Rename" }).click();
  await page.locator("#rename-modal-input").fill("delta.md");
  await page.locator("#rename-modal-confirm").click();

  await expect.poll(() => page.evaluate(() => window.__alerts)).toEqual([]);
  await expect.poll(() => page.evaluate(() => window.__moves.map((move) => move.newPath))).toEqual([
    "C:/vault/beta.md",
    "C:/vault/gamma.md",
    "C:/vault/delta.md"
  ]);
});

test("folder tree expand all opens every folder below the large tree threshold", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      startupBehavior: "untitled",
      folderTreeExpandLimitThreshold: 99,
      folderTreeExpandLimitDepth: 1
    }));

    function createFileHandle(name, content) {
      return {
        kind: "file",
        name,
        getFile: async () => new File([content], name, { type: "text/markdown" })
      };
    }

    function createDirectoryHandle(name, entries) {
      return {
        kind: "directory",
        name,
        values: async function* values() {
          for (const entry of entries) yield entry;
        }
      };
    }

    window.showDirectoryPicker = async () => createDirectoryHandle("Small Depth Folder", [
      createDirectoryHandle("root-a", [
        createDirectoryHandle("level-2", [
          createDirectoryHandle("level-3", [
            createFileHandle("deep.md", "# Deep")
          ])
        ])
      ])
    ]);
  });
  await page.goto("/");
  await page.locator("#import-from-folder").click();
  await page.locator(".toggle-folder-tree-expanded").first().evaluate((button) => button.click());

  await expect.poll(() => page.evaluate(() => ({
    rootA: document.querySelector("#folder-tree-root details[data-path='root-a']")?.open,
    level2: document.querySelector("#folder-tree-root details[data-path='root-a/level-2']")?.open,
    level3: document.querySelector("#folder-tree-root details[data-path='root-a/level-2/level-3']")?.open
  }))).toEqual({ rootA: true, level2: true, level3: true });
});

test("manual folder expansion does not repeatedly scroll to the focused tab", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "5.0.0";
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({
      startupBehavior: "untitled",
    }));
    const directories = new Map([
      ["C:/vault", [{ entry: "pkg", type: "DIRECTORY" }]],
      ["C:/vault/pkg", [
        { entry: "active", type: "DIRECTORY" },
        { entry: "browse", type: "DIRECTORY" }
      ]],
      ["C:/vault/pkg/active", [{ entry: "Selected.md", type: "FILE" }]],
      ["C:/vault/pkg/browse", [{ entry: "level1", type: "DIRECTORY" }]],
      ["C:/vault/pkg/browse/level1", [{ entry: "level2", type: "DIRECTORY" }]],
      ["C:/vault/pkg/browse/level1/level2", [{ entry: "Other.md", type: "FILE" }]]
    ]);
    const files = new Set(["C:/vault/pkg/active/Selected.md", "C:/vault/pkg/browse/level1/level2/Other.md"]);
    window.Neutralino = {
      os: { showFolderDialog: async () => "C:/vault" },
      filesystem: {
        readDirectory: async (path) => directories.get(String(path).replace(/\\/g, "/")) || [],
        getStats: async (path) => {
          const normalized = String(path).replace(/\\/g, "/");
          if (directories.has(normalized)) return { isDirectory: true, modifiedAt: 1, createdAt: 1 };
          if (files.has(normalized)) return { isFile: true, modifiedAt: 1, createdAt: 1 };
          throw new Error("missing: " + normalized);
        },
        readFile: async () => "# Same"
      }
    };
  });
  await page.goto("/");
  await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.tabs?.openSidebarFileInPermanentTab);
  await page.locator("#import-from-folder").click();

  await page.evaluate(async () => {
    const openDetails = async (path) => {
      const details = document.querySelector(`#folder-tree-root details[data-path="${CSS.escape(path)}"]`);
      if (!details) throw new Error(`Missing tree path ${path}`);
      await window.markdownViewerApp.modules.sidebarContextTree.renderFolderTreeLazyChildren(details);
      details.open = true;
      return details;
    };
    await openDetails("pkg");
    await openDetails("pkg/active");
  });
  await page.locator(".folder-tree-file", { hasText: "Selected.md" }).evaluate((button) => button.click());
  await expect(page.locator("#tab-list .tab-item.active", { hasText: "Selected" })).toBeVisible();
  await expect(page.locator(".folder-tree-file.auto-selected")).toHaveAttribute("data-path", "pkg/active/Selected.md");

  await page.evaluate(() => {
    window.__activeFileScrolls = 0;
    const originalScrollIntoView = Element.prototype.scrollIntoView;
    Element.prototype.scrollIntoView = function(options) {
      if (this.matches?.(".folder-tree-file.auto-selected")) {
        window.__activeFileScrolls += 1;
      }
      if (typeof originalScrollIntoView === "function") {
        return originalScrollIntoView.call(this, options);
      }
      return undefined;
    };
  });

  await page.evaluate(() => {
    const summary = document.querySelector("#folder-tree-root details[data-path='pkg/browse'] > summary");
    if (!summary) throw new Error("Missing browse summary");
    summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await expect(page.locator("#folder-tree-root details[data-path='pkg/browse/level1'] > summary")).toBeVisible();

  await page.evaluate(() => {
    const summary = document.querySelector("#folder-tree-root details[data-path='pkg/browse/level1'] > summary");
    if (!summary) throw new Error("Missing level1 summary");
    summary.dispatchEvent(new MouseEvent("click", { bubbles: true, cancelable: true, view: window }));
  });
  await expect(page.locator("#folder-tree-root details[data-path='pkg/browse/level1/level2'] > summary")).toBeVisible();

  await expect.poll(() => page.evaluate(() => window.__activeFileScrolls)).toBe(0);
  await expect(page.locator(".folder-tree-file.auto-selected")).toHaveAttribute("data-path", "pkg/active/Selected.md");
});
