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
test("startup override modes preserve saved tabs for later restore", async ({ page }) => {
  await page.addInitScript(() => {
    if (localStorage.getItem("__startupOverrideFixtureInstalled") === "1") return;
    const savedTab = {
      id: "saved_tab",
      title: "Saved Draft",
      content: "# Saved Draft",
      savedContent: "# Saved Draft",
      scrollPos: 0,
      viewMode: "split",
      type: "markdown"
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "welcome" }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([savedTab]));
    localStorage.setItem("markdownViewerActiveTab", "saved_tab");
    localStorage.setItem("__startupOverrideFixtureInstalled", "1");
  });

  await openApp(page);

  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Welcome to MD-Editor");
  await expect(page.locator("#markdown-editor")).toHaveValue(/# Welcome to MD-Editor/);
  await expect.poll(() => page.evaluate(() => {
    return JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").map((tab) => tab.title);
  })).toEqual(["Saved Draft"]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("markdownViewerActiveTab"))).toBe("saved_tab");

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ ...state, startupBehavior: "empty" }));
  });
  await page.reload();

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
  await expect.poll(() => page.evaluate(() => {
    return JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]").map((tab) => tab.title);
  })).toEqual(["Saved Draft"]);
  await expect.poll(() => page.evaluate(() => localStorage.getItem("markdownViewerActiveTab"))).toBe("saved_tab");

  await page.evaluate(() => {
    const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ ...state, startupBehavior: "last-tabs" }));
  });
  await page.reload();

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(1);
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Saved Draft");
  await expect(page.locator("#markdown-editor")).toHaveValue("# Saved Draft");
});

test("last-tabs startup flushes the active tab when the app is closing", async ({ page }) => {
  await page.addInitScript(() => {
    const savedTab = {
      id: "saved_tab",
      title: "Saved Draft",
      content: "# Saved Draft",
      savedContent: "# Saved Draft",
      scrollPos: 0,
      viewMode: "split",
      type: "markdown"
    };
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "last-tabs" }));
    localStorage.setItem("markdownViewerTabs", JSON.stringify([savedTab]));
    localStorage.setItem("markdownViewerActiveTab", "saved_tab");
  });
  await openApp(page);

  await page.locator("#markdown-editor").fill("# Saved Draft\n\nEdited right before close");
  await page.evaluate(() => {
    window.dispatchEvent(new PageTransitionEvent("pagehide"));
  });

  await expect.poll(() => page.evaluate(() => {
    return JSON.parse(localStorage.getItem("markdownViewerTabs") || "[]")[0]?.content;
  })).toBe("# Saved Draft\n\nEdited right before close");
});

test("desktop startup hydrates last tabs from the tabs profile", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    const files = new Map();
    const profilePath = "C:\\Users\\Test\\.md-editor\\preferences.json";
    const tabsPath = "C:\\Users\\Test\\.md-editor\\tabs.json";
    files.set(profilePath, JSON.stringify({
      version: 1,
      state: { startupBehavior: "last-tabs" }
    }));
    files.set(tabsPath, JSON.stringify({
      version: 1,
      activeTabId: "saved_tab_two",
      tabs: [
        {
          id: "saved_tab_one",
          title: "Saved One",
          content: "# Saved One",
          savedContent: "# Saved One",
          scrollPos: 0,
          viewMode: "split",
          type: "markdown"
        },
        {
          id: "saved_tab_two",
          title: "Saved Two",
          content: "# Saved Two",
          savedContent: "# Saved Two",
          scrollPos: 0,
          viewMode: "split",
          type: "markdown"
        }
      ]
    }));
    window.__desktopProfileWrites = [];
    window.Neutralino = {
      os: {
        getEnv: async (name) => name === "USERPROFILE" ? "C:\\Users\\Test" : ""
      },
      filesystem: {
        createDirectory: async () => {},
        readFile: async (path) => {
          if (!files.has(path)) throw new Error("No profile file");
          return files.get(path);
        },
        writeFile: async (path, content) => {
          files.set(path, content);
          window.__desktopProfileWrites.push({ path, content });
        }
      }
    };
  });

  await page.goto("/");

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(2);
  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Saved Two");
  await expect(page.locator("#markdown-editor")).toHaveValue("# Saved Two");
});

test("desktop last-tabs startup does not prefill the welcome document", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    window.__editorValueAssignments = [];
    const valueDescriptor = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value");
    Object.defineProperty(HTMLTextAreaElement.prototype, "value", {
      configurable: true,
      get() {
        return valueDescriptor.get.call(this);
      },
      set(nextValue) {
        if (this.id === "markdown-editor") {
          window.__editorValueAssignments.push(String(nextValue || "").slice(0, 80));
        }
        valueDescriptor.set.call(this, nextValue);
      }
    });

    const files = new Map();
    const profilePath = "C:\\Users\\Test\\.md-editor\\preferences.json";
    const tabsPath = "C:\\Users\\Test\\.md-editor\\tabs.json";
    files.set(profilePath, JSON.stringify({
      version: 1,
      state: { startupBehavior: "last-tabs" }
    }));
    files.set(tabsPath, JSON.stringify({
      version: 1,
      activeTabId: "saved_tab",
      tabs: [
        {
          id: "saved_tab",
          title: "Saved Draft",
          content: "# Saved Draft",
          savedContent: "# Saved Draft",
          scrollPos: 0,
          viewMode: "split",
          type: "markdown"
        }
      ]
    }));
    window.Neutralino = {
      os: {
        getEnv: async (name) => name === "USERPROFILE" ? "C:\\Users\\Test" : ""
      },
      filesystem: {
        createDirectory: async () => {},
        readFile: async (path) => {
          if (!files.has(path)) throw new Error("No profile file");
          return files.get(path);
        },
        writeFile: async (path, content) => {
          files.set(path, content);
        }
      }
    };
  });

  await page.goto("/");

  await expect(page.locator("#tab-list .tab-item.active")).toContainText("Saved Draft");
  await expect(page.locator("#markdown-editor")).toHaveValue("# Saved Draft");
  await expect.poll(() => page.evaluate(() => window.__editorValueAssignments.some((value) => value.includes("Welcome to MD-Editor")))).toBe(false);
});

test("desktop startup reopens the most recent folder when enabled", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    const normalizePath = (path) => String(path || "").replace(/\\/g, "/");
    const files = new Map();
    files.set("C:/Users/Test/.md-editor/preferences.json", JSON.stringify({
      version: 1,
      state: { startupBehavior: "empty", restoreLastFolderOnStartup: true }
    }));
    files.set("C:/Users/Test/.md-editor/recent-items.json", JSON.stringify({
      version: 1,
      recentFiles: [],
      recentFolders: [
        { name: "old", label: "old", path: "C:/old", updatedAt: 1 },
        { name: "vault", label: "vault", path: "C:/vault", updatedAt: 2 }
      ]
    }));
    window.__readDirectoryCalls = [];
    window.Neutralino = {
      os: {
        getEnv: async (name) => name === "USERPROFILE" ? "C:/Users/Test" : ""
      },
      filesystem: {
        createDirectory: async () => {},
        getStats: async () => ({ modifiedAt: 1, createdAt: 1, size: 10 }),
        readDirectory: async (path) => {
          const normalizedPath = normalizePath(path);
          window.__readDirectoryCalls.push(normalizedPath);
          if (normalizedPath === "C:/vault") {
            return [{ entry: "startup-note.md", type: "FILE" }];
          }
          return [];
        },
        readFile: async (path) => {
          const normalizedPath = normalizePath(path);
          if (files.has(normalizedPath)) return files.get(normalizedPath);
          if (normalizedPath === "C:/vault/startup-note.md") return "# Startup Note";
          throw new Error("No file: " + normalizedPath);
        },
        writeFile: async (path, content) => {
          files.set(normalizePath(path), content);
        }
      }
    };
  });

  await page.goto("/");

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".folder-tree-file", { hasText: "startup-note.md" })).toBeVisible();
  await expect(page.locator(".folder-tree-file", { hasText: "startup-note.md" })).toHaveAttribute("title", "C:/vault/startup-note.md");
  await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls)).toContain("C:/vault");
});

test("desktop startup marks ready before delayed folder restore completes", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    const normalizePath = (path) => String(path || "").replace(/\\/g, "/");
    const files = new Map();
    files.set("C:/Users/Test/.md-editor/preferences.json", JSON.stringify({
      version: 1,
      state: { startupBehavior: "empty", restoreLastFolderOnStartup: true }
    }));
    files.set("C:/Users/Test/.md-editor/recent-items.json", JSON.stringify({
      version: 1,
      recentFiles: [],
      recentFolders: [
        { name: "vault", label: "vault", path: "C:/vault", updatedAt: 2 }
      ]
    }));
    window.__readDirectoryCalls = [];
    window.__folderReadSettled = false;
    window.__startupReadyBeforeFolderReadSettled = false;
    window.addEventListener("markdownViewerStartupReady", () => {
      window.__startupReadyBeforeFolderReadSettled = window.__folderReadSettled === false;
    });
    window.Neutralino = {
      os: {
        getEnv: async (name) => name === "USERPROFILE" ? "C:/Users/Test" : ""
      },
      filesystem: {
        createDirectory: async () => {},
        getStats: async () => ({ modifiedAt: 1, createdAt: 1, size: 10 }),
        readDirectory: async (path) => {
          const normalizedPath = normalizePath(path);
          window.__readDirectoryCalls.push(normalizedPath);
          if (normalizedPath === "C:/vault") {
            await new Promise((resolve) => {
              window.__releaseStartupFolderRead = () => {
                window.__folderReadSettled = true;
                resolve();
              };
            });
            return [{ entry: "startup-note.md", type: "FILE" }];
          }
          return [];
        },
        readFile: async (path) => {
          const normalizedPath = normalizePath(path);
          if (files.has(normalizedPath)) return files.get(normalizedPath);
          if (normalizedPath === "C:/vault/startup-note.md") return "# Startup Note";
          throw new Error("No file: " + normalizedPath);
        },
        writeFile: async (path, content) => {
          files.set(normalizePath(path), content);
        }
      }
    };
  });

  await page.goto("/");

  await expect.poll(() => page.evaluate(() => window.__startupReadyBeforeFolderReadSettled)).toBe(true);
  await expect.poll(() => page.evaluate(() => typeof window.__releaseStartupFolderRead)).toBe("function");
  await page.evaluate(() => window.__releaseStartupFolderRead());
  await expect(page.locator(".folder-tree-file", { hasText: "startup-note.md" })).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls)).toEqual(["C:/vault"]);
});

test("desktop startup skips last folder restore when disabled", async ({ page }) => {
  await page.addInitScript(() => {
    window.NL_VERSION = "test";
    window.NL_OS = "Windows";
    const normalizePath = (path) => String(path || "").replace(/\\/g, "/");
    const files = new Map();
    files.set("C:/Users/Test/.md-editor/preferences.json", JSON.stringify({
      version: 1,
      state: { startupBehavior: "empty", restoreLastFolderOnStartup: false }
    }));
    files.set("C:/Users/Test/.md-editor/recent-items.json", JSON.stringify({
      version: 1,
      recentFiles: [],
      recentFolders: [
        { name: "vault", label: "vault", path: "C:/vault", updatedAt: 2 }
      ]
    }));
    window.__readDirectoryCalls = [];
    window.Neutralino = {
      os: {
        getEnv: async (name) => name === "USERPROFILE" ? "C:/Users/Test" : ""
      },
      filesystem: {
        createDirectory: async () => {},
        getStats: async () => ({ modifiedAt: 1, createdAt: 1, size: 10 }),
        readDirectory: async (path) => {
          window.__readDirectoryCalls.push(normalizePath(path));
          return [];
        },
        readFile: async (path) => {
          const normalizedPath = normalizePath(path);
          if (files.has(normalizedPath)) return files.get(normalizedPath);
          throw new Error("No file: " + normalizedPath);
        },
        writeFile: async (path, content) => {
          files.set(normalizePath(path), content);
        }
      }
    };
  });

  await page.goto("/");

  await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
  await expect(page.locator(".folder-tree-file", { hasText: "startup-note.md" })).toHaveCount(0);
  await expect.poll(() => page.evaluate(() => window.__readDirectoryCalls)).toEqual([]);
});
