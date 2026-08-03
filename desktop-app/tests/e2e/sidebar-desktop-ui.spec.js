const path = require("node:path");
const { test, expect } = require("./desktop-fixture");
const {
  activeEditorValue,
  dispatchFolderWatcherEvent,
  openDesktopFolder,
  openApp,
} = require("../helpers/desktop-ui");
const {
  createLazyWorkspace,
  createWorkspaceTree,
  removeTempWorkspace,
  removeWorkspacePath,
  renameWorkspacePath,
  writeWorkspaceFile,
} = require("../helpers/temp-workspace");

test.describe("desktop sidebar UI", () => {
  test("shows navigable source and markup Outlines beside the Dropzone", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "README.md": "# Project\n\n## Setup\n",
      "settings.yaml": "service:\n  database:\n    host: localhost\n",
      "index.html": "<main id=\app\><section>Welcome</section></main>",
      "build.cmd": "@echo off\n:build\necho Building\n:test\necho Testing\n",
      "Example.java": `package demo;
public class Example {
  private final String value = "outline";
  public Example(String value) { this.value = value; }
  public void run() {
    System.out.println(value);
  }
}`,
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-file[data-path='Example.java']").click();
      await expect.poll(() => activeEditorValue(page)).toContain("class Example");

      const lowerTabs = page.locator("#sidebar-lower-tabs");
      await expect(lowerTabs).toBeVisible();
      await expect(page.locator("#sidebar-lower-tab-outline")).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#sidebar-outline-panel")).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "Example" }).first()).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "run()" })).toBeVisible();

      await page.locator(".outline-row", { hasText: "run()" }).click();
      await expect.poll(() => page.evaluate(() => document.getElementById("markdown-editor")?.selectionStart || 0)).toBeGreaterThan(100);

      await page.locator(".folder-tree-file[data-path='README.md']").click();
      await expect.poll(() => activeEditorValue(page)).toContain("# Project");
      await expect(page.locator(".outline-row", { hasText: "Project" })).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "Setup" })).toBeVisible();

      await page.locator(".folder-tree-file[data-path='settings.yaml']").click();
      await expect(page.locator(".outline-row", { hasText: "service" })).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "database" })).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "host" })).toBeVisible();

      await page.locator(".folder-tree-file[data-path='index.html']").click();
      await expect(page.locator(".outline-row", { hasText: "main" })).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "section" })).toBeVisible();

      await page.locator(".folder-tree-file[data-path='build.cmd']").click();
      await expect(page.locator(".outline-row", { hasText: "build" })).toBeVisible();
      await expect(page.locator(".outline-row", { hasText: "test" })).toBeVisible();

      await page.evaluate(() => window.markdownViewerApp.modules.outlinePanel.setVisible(false));
      await expect(lowerTabs).toBeVisible();
      await expect(page.locator("#sidebar-lower-tab-dropzone")).toHaveAttribute("aria-selected", "true");
      await expect(page.locator("#sidebar-lower-dropzone-view")).toBeVisible();
      await page.evaluate(() => window.markdownViewerApp.modules.outlinePanel.setVisible(true));
      await expect(lowerTabs).toBeVisible();
      await expect(page.locator("#sidebar-outline-panel")).toBeVisible();

      await page.locator("#close-sidebar-lower-panel").click();
      await expect(lowerTabs).toBeVisible();
      await expect(page.locator("#sidebar-lower-tab-outline")).toBeHidden();
      await expect(page.locator("#sidebar-lower-dropzone-view")).toBeVisible();
      await page.evaluate(() => window.markdownViewerApp.modules.outlinePanel.setVisible(true));

      await page.evaluate(() => document.querySelector(".toggle-sidebar")?.click());
      await expect(page.locator("#folder-tree-pane .folder-tree-content")).toBeHidden();
      await page.evaluate(() => document.querySelector(".toggle-sidebar")?.click());
      await expect(page.locator("#sidebar-outline-panel")).toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("shows a JSON Outline for an unsaved tab parsed as JSON", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled" }),
      },
    });
    await page.waitForFunction(() => !!window.markdownViewerApp?.modules?.codeMirrorEditor?.getView?.());
    await page.evaluate(() => {
      const view = window.markdownViewerApp.modules.codeMirrorEditor.getView();
      view.dispatch({
        changes: {
          from: 0,
          to: view.state.doc.length,
          insert: '{"root":{"child":1}}',
        },
      });
    });

    const activeTab = page.locator("#tab-list .tab-item.active");
    await activeTab.dispatchEvent("contextmenu", {
      bubbles: true,
      cancelable: true,
      button: 2,
      clientX: 420,
      clientY: 110,
    });
    const parseAs = page.locator(".tab-parse-as-submenu");
    await expect(parseAs).toBeVisible();
    await parseAs.hover();
    await page.locator(".tab-parse-as-filter").fill("json");
    await page.locator(".tab-parse-as-choice[data-language-id='json']").click();

    await expect.poll(() => page.evaluate(
      () => window.markdownViewerApp.modules.tabs.getActiveTab()?.parseAsLanguageId
    )).toBe("json");
    await expect(page.locator("#sidebar-outline-panel")).toBeVisible();
    await expect(page.locator(".outline-row", { hasText: "root" })).toBeVisible();
    await expect(page.locator(".outline-row", { hasText: "child" })).toBeVisible();
  });

  test("expands nested folders and auto-selects the active file", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "root.md": "# Root",
      nested: {
        "child.md": "# Nested Child",
      },
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);

      const nestedFolder = page.locator(".folder-tree-label", { hasText: "nested" }).first();
      await expect(nestedFolder).toBeVisible();
      await nestedFolder.click();

      const childFile = page.locator(".folder-tree-file[data-path='nested/child.md']");
      await expect(childFile).toBeVisible();
      await childFile.click();

      await expect.poll(() => activeEditorValue(page)).toContain("Nested Child");
      await expect(childFile).toHaveClass(/auto-selected/);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("decorates current and lazy Maven module folders with one blue cube badge", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "module-a": {
        "pom.xml": "<project />",
        nested: {
          "note.md": "# Nested module",
        },
      },
    });
    const modulePath = path.join(folderPath, "module-a");
    const nestedModulePath = path.join(modulePath, "nested");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerFolderTreeLazyThreshold: "1",
        },
      });
      await page.evaluate(() => {
        window.markdownViewerApp.modules.mavenBuildPathAutoScan.schedule = () => {};
      });
      await openDesktopFolder(page, folderPath);

      await page.evaluate((detectedPath) => {
        const tree = window.markdownViewerApp.modules.sidebarContextTree;
        tree.setMavenModulePaths([detectedPath]);
        tree.setGradleModulePaths([detectedPath]);
        tree.setJavaSourceRootPaths([detectedPath]);
        tree.setJavaProjectMarkerMode("maven");
      }, modulePath);
      const moduleLabel = page.locator("#folder-tree-root details[data-path='module-a'] > .folder-tree-label");
      await expect(moduleLabel.locator(".folder-tree-maven-module-badge")).toHaveCount(1);
      await expect(moduleLabel.locator(".folder-tree-gradle-module-badge")).toHaveCount(0);
      await expect(moduleLabel.locator(".folder-tree-java-source-root-badge")).toHaveCount(0);
      await expect(page.locator(".folder-tree-maven-module-badge")).toHaveCount(1);

      await page.evaluate(async ({ detectedModulePath, detectedNestedPath }) => {
        const tree = window.markdownViewerApp.modules.sidebarContextTree;
        tree.setMavenModulePaths([detectedModulePath, detectedNestedPath]);
        tree.setMavenModulePaths([detectedModulePath, detectedNestedPath]);
        const details = document.querySelector("#folder-tree-root details[data-path='module-a']");
        await tree.renderFolderTreeLazyChildren(details);
      }, { detectedModulePath: modulePath, detectedNestedPath: nestedModulePath });

      await expect(moduleLabel.locator(".folder-tree-maven-module-badge")).toHaveCount(1);
      await expect(
        page.locator("#folder-tree-root details[data-path='module-a/nested'] > .folder-tree-label .folder-tree-maven-module-badge")
      ).toHaveCount(1);

      await page.evaluate(() => {
        window.markdownViewerApp.modules.sidebarContextTree.setMavenModulePaths([]);
      });
      await expect(page.locator(".folder-tree-maven-module-badge")).toHaveCount(0);

      await page.evaluate((detectedPath) => {
        window.markdownViewerApp.modules.sidebarContextTree.setMavenModulePaths([detectedPath]);
        document.querySelector(".close-folder-button")?.click();
      }, modulePath);
      await openDesktopFolder(page, folderPath);
      await expect(page.locator(".folder-tree-maven-module-badge")).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("decorates current and lazy Gradle module folders with one green cube badge", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "module-a": {
        "build.gradle": "plugins { id 'java' }\n",
        nested: {
          "note.md": "# Nested module",
        },
      },
    });
    const modulePath = path.join(folderPath, "module-a");
    const nestedModulePath = path.join(modulePath, "nested");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerFolderTreeLazyThreshold: "1",
        },
      });
      await page.evaluate(() => {
        window.markdownViewerApp.modules.mavenBuildPathAutoScan.schedule = () => {};
      });
      await openDesktopFolder(page, folderPath);

      await page.evaluate((detectedPath) => {
        const tree = window.markdownViewerApp.modules.sidebarContextTree;
        tree.setMavenModulePaths([detectedPath]);
        tree.setGradleModulePaths([detectedPath]);
        tree.setJavaSourceRootPaths([detectedPath]);
        tree.setJavaProjectMarkerMode("gradle");
      }, modulePath);
      const moduleLabel = page.locator("#folder-tree-root details[data-path='module-a'] > .folder-tree-label");
      await expect(moduleLabel.locator(".folder-tree-gradle-module-badge")).toHaveCount(1);
      await expect(moduleLabel.locator(".folder-tree-maven-module-badge")).toHaveCount(0);
      await expect(moduleLabel.locator(".folder-tree-java-source-root-badge")).toHaveCount(0);
      await expect(page.locator(".folder-tree-gradle-module-badge")).toHaveCount(1);
      await expect(moduleLabel.locator(".folder-tree-gradle-module-badge")).toHaveCSS("color", "rgb(112, 173, 71)");

      await page.evaluate(async ({ detectedModulePath, detectedNestedPath }) => {
        const tree = window.markdownViewerApp.modules.sidebarContextTree;
        tree.setGradleModulePaths([detectedModulePath, detectedNestedPath]);
        tree.setGradleModulePaths([detectedModulePath, detectedNestedPath]);
        const details = document.querySelector("#folder-tree-root details[data-path='module-a']");
        await tree.renderFolderTreeLazyChildren(details);
      }, { detectedModulePath: modulePath, detectedNestedPath: nestedModulePath });

      await expect(moduleLabel.locator(".folder-tree-gradle-module-badge")).toHaveCount(1);
      await expect(
        page.locator("#folder-tree-root details[data-path='module-a/nested'] > .folder-tree-label .folder-tree-gradle-module-badge")
      ).toHaveCount(1);

      await page.evaluate(() => {
        window.markdownViewerApp.modules.sidebarContextTree.setGradleModulePaths([]);
      });
      await expect(page.locator(".folder-tree-gradle-module-badge")).toHaveCount(0);

      await page.evaluate((detectedPath) => {
        window.markdownViewerApp.modules.sidebarContextTree.setGradleModulePaths([detectedPath]);
        document.querySelector(".close-folder-button")?.click();
      }, modulePath);
      await expect(page.locator(".folder-tree-gradle-module-badge")).toHaveCount(0);
      await openDesktopFolder(page, folderPath);
      await expect(page.locator(".folder-tree-gradle-module-badge")).toHaveCount(1);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("decorates current and lazy Java source roots with one orange cube badge", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "source-a": {
        nested: {
          "Example.java": "public class Example {}",
        },
      },
    });
    const sourceRootPath = path.join(folderPath, "source-a");
    const nestedSourceRootPath = path.join(sourceRootPath, "nested");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerFolderTreeLazyThreshold: "1",
        },
      });
      await page.evaluate(() => {
        window.markdownViewerApp.modules.mavenBuildPathAutoScan.schedule = () => {};
      });
      await openDesktopFolder(page, folderPath);
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp.modules.javaWorkspaceController?.getState?.().phase;
      })).not.toBe("detecting");

      await page.evaluate((detectedPath) => {
        const tree = window.markdownViewerApp.modules.sidebarContextTree;
        tree.setMavenModulePaths([detectedPath]);
        tree.setGradleModulePaths([detectedPath]);
        tree.setJavaSourceRootPaths([detectedPath]);
        tree.setJavaProjectMarkerMode("java");
      }, sourceRootPath);
      const sourceRootLabel = page.locator("#folder-tree-root details[data-path='source-a'] > .folder-tree-label");
      await expect(sourceRootLabel.locator(".folder-tree-java-source-root-badge")).toHaveCount(1);
      await expect(page.locator(".folder-tree-java-source-root-badge")).toHaveCount(1);
      await expect(sourceRootLabel.locator(".folder-tree-maven-module-badge")).toHaveCount(0);
      await expect(sourceRootLabel.locator(".folder-tree-gradle-module-badge")).toHaveCount(0);
      await expect(sourceRootLabel.locator(".folder-tree-java-source-root-badge")).toHaveCSS("color", "rgb(227, 154, 59)");

      await page.evaluate(async ({ detectedSourceRootPath, detectedNestedPath }) => {
        const tree = window.markdownViewerApp.modules.sidebarContextTree;
        tree.setJavaSourceRootPaths([detectedSourceRootPath, detectedNestedPath]);
        tree.setJavaSourceRootPaths([detectedSourceRootPath, detectedNestedPath]);
        const details = document.querySelector("#folder-tree-root details[data-path='source-a']");
        await tree.renderFolderTreeLazyChildren(details);
      }, { detectedSourceRootPath: sourceRootPath, detectedNestedPath: nestedSourceRootPath });

      await expect(sourceRootLabel.locator(".folder-tree-java-source-root-badge")).toHaveCount(1);
      await expect(
        page.locator("#folder-tree-root details[data-path='source-a/nested'] > .folder-tree-label .folder-tree-java-source-root-badge")
      ).toHaveCount(1);

      await page.evaluate(() => {
        window.markdownViewerApp.modules.sidebarContextTree.setJavaSourceRootPaths([]);
      });
      await expect(page.locator(".folder-tree-java-source-root-badge")).toHaveCount(0);

      await page.evaluate((detectedPath) => {
        window.markdownViewerApp.modules.sidebarContextTree.setJavaSourceRootPaths([detectedPath]);
        document.querySelector(".close-folder-button")?.click();
      }, sourceRootPath);
      await openDesktopFolder(page, folderPath);
      await expect(page.locator(".folder-tree-java-source-root-badge")).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("shows file and folder context menus for real desktop items", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      docs: {
        "note.md": "# Context Menu",
      },
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);

      await page.locator(".folder-tree-label", { hasText: "docs" }).first().click();
      await page.locator(".folder-tree-file[data-path='docs/note.md']").click({ button: "right" });
      await expect(page.locator(".sidebar-file-context-menu:not(.hidden)")).toBeVisible();
      await expect(page.locator(".sidebar-file-context-menu .graph-context-menu-item", { hasText: "Rename" })).toBeVisible();

      await page.keyboard.press("Escape");
      await page.locator(".folder-tree-label", { hasText: "docs" }).first().click({ button: "right" });
      await expect(page.locator(".sidebar-folder-context-menu:not(.hidden)")).toBeVisible();
      await expect(page.locator(".sidebar-folder-context-menu .graph-context-menu-item", { hasText: "New File" })).toBeVisible();
      await expect(page.locator(".sidebar-folder-context-menu .graph-context-menu-item", { hasText: "Compile Folder" })).toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("supports focused folder tree keyboard navigation and file opening", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      docs: {
        "alpha.md": "# Alpha",
        "beta.md": "# Beta",
      },
      "root.md": "# Root",
      "zeta.md": "# Zeta",
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);

      const docsFolder = page.locator(".folder-tree-label", { hasText: "docs" }).first();
      const docsDetails = page.locator("#folder-tree-root details[data-path='docs']");
      const alphaFile = page.locator(".folder-tree-file[data-path='docs/alpha.md']");
      const betaFile = page.locator(".folder-tree-file[data-path='docs/beta.md']");
      const rootFile = page.locator(".folder-tree-file[data-path='root.md']");
      const zetaFile = page.locator(".folder-tree-file[data-path='zeta.md']");
      const firstTreeItem = page.locator("#folder-tree-root .folder-tree-label, #folder-tree-root .folder-tree-file").first();

      await page.locator("#folder-tree-root").evaluate((root) => root.click());
      await page.keyboard.press("ArrowDown");
      await expect(firstTreeItem).toHaveClass(/multi-selected/);
      await page.keyboard.press("ArrowUp");
      await expect(firstTreeItem).toHaveClass(/multi-selected/);

      await docsFolder.click();
      await expect(docsDetails).toHaveJSProperty("open", true);
      await expect.poll(() => page.evaluate(() => ({
        isFolder: document.activeElement?.classList.contains("folder-tree-label"),
        name: document.activeElement?.textContent?.trim(),
      }))).toEqual({ isFolder: true, name: "docs" });

      await page.keyboard.press("ArrowDown");
      await expect(alphaFile).toHaveClass(/multi-selected/);
      await page.keyboard.press("ArrowDown");
      await expect(betaFile).toHaveClass(/multi-selected/);
      await page.keyboard.press("ArrowDown");
      await expect(rootFile).toHaveClass(/multi-selected/);
      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(zetaFile).toHaveClass(/multi-selected/);

      await docsFolder.click();
      await expect(docsDetails).toHaveJSProperty("open", false);
      await page.keyboard.press("ArrowDown");
      await expect(rootFile).toHaveClass(/multi-selected/);

      await docsFolder.click();
      await page.keyboard.press("ArrowLeft");
      await expect(docsDetails).toHaveJSProperty("open", false);
      await page.keyboard.press("ArrowRight");
      await expect(docsDetails).toHaveJSProperty("open", true);
      await page.keyboard.press("Enter");
      await expect(docsDetails).toHaveJSProperty("open", false);
      await page.keyboard.press("Enter");
      await expect(docsDetails).toHaveJSProperty("open", true);

      await page.keyboard.press("ArrowDown");
      await page.keyboard.press("ArrowDown");
      await expect(betaFile).toHaveClass(/multi-selected/);
      await page.keyboard.press("Space");
      await expect.poll(() => page.evaluate(() => ({
        name: window.markdownViewerApp.modules.tabs.getActiveTab()?.title,
        temporary: window.markdownViewerApp.modules.tabs.getActiveTab()?.isTemporary,
      }))).toEqual({ name: "beta", temporary: true });
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.isTemporary)).toBe(false);

      await page.locator(".codemirror-editor .cm-content").last().click();
      await page.keyboard.press("ArrowUp");
      await expect(betaFile).toHaveClass(/multi-selected/);
      await expect.poll(() => page.evaluate(() => document.activeElement?.closest?.("#folder-tree-root") !== null)).toBe(false);

      await page.locator(".toggle-folder-tree-filter").first().click();
      await page.locator("#folder-tree-filter-input").fill("root.md");
      await expect(rootFile).toBeVisible();
      await expect(zetaFile).toHaveCount(0);
      await rootFile.click();
      await expect.poll(() => page.evaluate(() => document.activeElement?.dataset.path)).toBe("root.md");
      await page.keyboard.press("ArrowDown");
      await expect(rootFile).toHaveClass(/multi-selected/);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("deletes focused folder tree items through the existing confirmation workflow", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      docs: {
        "child.md": "# Child",
      },
      "root.md": "# Root",
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({ startupBehavior: "untitled", confirmDeleteFiles: true }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.evaluate(() => {
        window.__folderTreeDeleteConfirmed = false;
        window.__folderTreeDeleteConfirmCount = 0;
        window.markdownViewerApp.services.confirm = async () => {
          window.__folderTreeDeleteConfirmCount += 1;
          return window.__folderTreeDeleteConfirmed;
        };
      });

      const rootFile = page.locator(".folder-tree-file[data-path='root.md']");
      await rootFile.click();
      await page.keyboard.press("Enter");
      await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.tabs.getActiveTab()?.isTemporary)).toBe(false);
      await page.keyboard.press("Delete");
      await expect(rootFile).toHaveCount(1);
      await expect.poll(() => page.evaluate(() => window.__folderTreeDeleteConfirmCount)).toBe(1);

      await page.evaluate(() => { window.__folderTreeDeleteConfirmed = true; });
      await page.keyboard.press("Delete");
      await expect(rootFile).toHaveCount(0);
      await expect(page.locator("#tab-list .tab-item", { hasText: "root.md" })).toHaveCount(0);

      const docsFolder = page.locator(".folder-tree-label", { hasText: "docs" }).first();
      await docsFolder.click();
      const childFile = page.locator(".folder-tree-file[data-path='docs/child.md']");
      await childFile.click();
      await page.keyboard.press("Enter");
      await docsFolder.click();
      await page.keyboard.press("Delete");
      await expect(docsFolder).toHaveCount(0);
      await expect(page.locator("#tab-list .tab-item", { hasText: "child.md" })).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => window.__folderTreeDeleteConfirmCount)).toBe(3);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("supports multi-select folder view context actions", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      docs: {
        "alpha.md": "# Alpha",
        "beta.md": "# Beta",
        "gamma.md": "# Gamma",
      },
      "root.md": "# Root",
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "untitled",
            confirmDeleteFiles: true,
          }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.evaluate(() => {
        window.__sidebarClipboard = "";
        window.__sidebarConfirmCount = 0;
        window.Neutralino = window.Neutralino || {};
        window.Neutralino.clipboard = {
          writeText: async (text) => {
            window.__sidebarClipboard = String(text || "");
          },
        };
        window.markdownViewerApp.services.confirm = async () => {
          window.__sidebarConfirmCount += 1;
          return true;
        };
      });

      const docsFolder = page.locator(".folder-tree-label", { hasText: "docs" }).first();
      const rootFile = page.locator(".folder-tree-file[data-path='root.md']");
      await docsFolder.click();
      await rootFile.click({ modifiers: ["Control"] });
      await expect(page.locator(".folder-tree-label.multi-selected")).toHaveCount(1);
      await expect(page.locator(".folder-tree-file.multi-selected")).toHaveCount(1);
      await expect.poll(() => activeEditorValue(page)).not.toContain("Root");

      await rootFile.click({ button: "right" });
      const fileMenu = page.locator(".sidebar-file-context-menu:not(.hidden)");
      await expect(fileMenu).toBeVisible();
      await expect(fileMenu.locator(".graph-context-menu-title")).toHaveText("2 selected items");
      await expect(fileMenu.locator(".graph-context-menu-item", { hasText: "Open in a new tab" })).toBeEnabled();
      await expect(fileMenu.locator(".graph-context-menu-item", { hasText: "Open in default app" })).toBeEnabled();
      await expect(fileMenu.locator(".graph-context-menu-item", { hasText: "Rename" })).toBeDisabled();
      await expect(fileMenu.locator(".graph-context-menu-item", { hasText: "Copy selected paths" })).toBeEnabled();
      await expect(fileMenu.locator(".graph-context-menu-item", { hasText: "Delete selected items" })).toBeEnabled();
      await expect(fileMenu.locator(".graph-context-menu-submenu", { hasText: "Export" }).locator("> .graph-context-menu-item")).toBeDisabled();
      await page.keyboard.press("Escape");

      const alphaFile = page.locator(".folder-tree-file[data-path='docs/alpha.md']");
      const betaFile = page.locator(".folder-tree-file[data-path='docs/beta.md']");
      const gammaFile = page.locator(".folder-tree-file[data-path='docs/gamma.md']");
      await alphaFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Alpha");
      await page.evaluate(({ rootPath }) => {
        window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab("# Root", "root.md", {
          name: "root.md",
          path: rootPath,
        });
      }, { rootPath: path.join(folderPath, "root.md") });
      await expect(rootFile).toHaveClass(/auto-selected/);
      await expect(page.locator(".folder-tree-file.multi-selected")).toHaveCount(0);
      await alphaFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Alpha");
      await gammaFile.click({ modifiers: ["Shift"] });
      await expect(page.locator(".folder-tree-file.multi-selected")).toHaveCount(3);
      const rootTab = page.locator("#tab-list .tab-item", { hasText: "root.md" });
      await rootTab.click();
      await expect(rootFile).toHaveClass(/auto-selected/);
      await expect(page.locator(".folder-tree-file.multi-selected")).toHaveCount(0);

      await alphaFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Alpha");
      await rootTab.click({ modifiers: ["Control"] });
      await expect(page.locator("#tab-list .tab-item.selected")).toHaveCount(2);
      await betaFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Beta");
      await expect(page.locator("#tab-list .tab-item.selected")).toHaveCount(0);

      await alphaFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Alpha");
      await gammaFile.click({ modifiers: ["Shift"] });
      await expect(page.locator(".folder-tree-file.multi-selected")).toHaveCount(3);

      await betaFile.click({ button: "right" });
      await expect(fileMenu).toBeVisible();
      await expect(fileMenu.locator(".graph-context-menu-title")).toHaveText("3 selected items");
      await fileMenu.locator(".graph-context-menu-item", { hasText: "Copy selected paths" }).evaluate((button) => button.click());
      const copiedPaths = await page.evaluate(() => window.__sidebarClipboard.replace(/\\/g, "/"));
      expect(copiedPaths).toContain("docs/alpha.md");
      expect(copiedPaths).toContain("docs/beta.md");
      expect(copiedPaths).toContain("docs/gamma.md");
      expect(copiedPaths.split(/\r?\n/)).toHaveLength(3);

      await betaFile.click({ button: "right" });
      await fileMenu.locator(".graph-context-menu-item", { hasText: "Delete selected items" }).evaluate((button) => button.click());
      await expect.poll(() => page.evaluate(() => window.__sidebarConfirmCount)).toBe(1);
      await expect(page.locator(".folder-tree-file[data-path='docs/alpha.md']")).toHaveCount(0);
      await expect(page.locator(".folder-tree-file[data-path='docs/beta.md']")).toHaveCount(0);
      await expect(page.locator(".folder-tree-file[data-path='docs/gamma.md']")).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("lazy folder fixture remains responsive enough to open a visible file", async ({ page }) => {
    const folderPath = await createLazyWorkspace(180);

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerFolderTreeLazyThreshold: "20",
        },
      });
      await openDesktopFolder(page, folderPath);

      const visibleFile = page.locator(".folder-tree-file", { hasText: "item-000.md" }).first();
      await expect(visibleFile).toBeVisible();
      await visibleFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Item 0");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("flat folder view virtualizes compressed folder groups", async ({ page }) => {
    const folderPath = await createLazyWorkspace(1);

    try {
      for (let index = 0; index < 180; index += 1) {
        await writeWorkspaceFile(folderPath, "bulk/item-" + String(index).padStart(3, "0") + ".md", "# Item " + index + "\n");
      }
      await writeWorkspaceFile(folderPath, "bulk/unsupported.bin", "binary-ish");
      await writeWorkspaceFile(folderPath, "bulk/src/main/java/com/mdeditor/javaconverter/Main.java", "class Main {}");
      await writeWorkspaceFile(folderPath, "bulk/src/main/java/com/mdeditor/javaconverter/compileunit/Unit.java", "class Unit {}");
      await writeWorkspaceFile(folderPath, "bulk/modules/ROOT/pages/core/aop/Page.md", "# Root Page\n");
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "untitled",
          }),
        },
      });
      await openDesktopFolder(page, folderPath);

      await expect(page.locator(".toggle-folder-view-mode")).toHaveCount(0);
      if ((await page.locator(".toggle-folder-tree-expanded").first().getAttribute("title")) === "Collapse all folders") {
        await page.locator(".toggle-folder-tree-expanded").first().evaluate((button) => button.click());
      }
      const bulkFolder = page.locator(".folder-tree-label", { hasText: "bulk" }).first();
      await bulkFolder.click({ button: "right" });
      await expect(page.locator(".sidebar-folder-context-menu:not(.hidden)")).toBeVisible();
      await page.locator(".sidebar-folder-context-menu:not(.hidden) .sidebar-folder-view-submenu > .graph-context-menu-item").hover();
      await page.locator(".sidebar-folder-context-menu:not(.hidden) [data-sidebar-folder-view-mode=\'flat\']").click();
      await page.keyboard.press("Escape");
      await page.locator("details[data-path=\'bulk\'] > summary").click();

      const packageGroup = page.locator(".folder-flat-group[data-path=\'bulk/src/main/java/com/mdeditor/javaconverter\']");
      const compileUnitGroup = page.locator(".folder-flat-group[data-path=\'bulk/src/main/java/com/mdeditor/javaconverter/compileunit\']");
      await expect(page.locator(".folder-flat-group[data-path=\'bulk/src\']")).toHaveCount(0);
      await expect(packageGroup).toBeVisible();
      await expect(compileUnitGroup).toBeVisible();
      await expect(page.locator(".folder-flat-file[data-path=\'bulk/src/main/java/com/mdeditor/javaconverter/Main.java\']")).toHaveCount(0);
      await packageGroup.click();
      await expect(packageGroup).toHaveCount(1);
      await expect(compileUnitGroup).toHaveCount(1);
      await expect(page.locator(".folder-flat-file[data-path=\'bulk/src/main/java/com/mdeditor/javaconverter/Main.java\']")).toBeVisible();

      const rootPagesGroup = page.locator(".folder-flat-group[data-path=\'bulk/modules/ROOT/pages/core/aop\']");
      await expect(page.locator(".folder-flat-group[data-path=\'bulk/modules\']")).toHaveCount(0);
      await expect(rootPagesGroup).toBeVisible();
      await expect(rootPagesGroup).not.toContainText("/ROOT");
      await expect(page.locator(".folder-flat-group", { hasText: /\/ROOT(\/|$)/ })).toHaveCount(0);
      await rootPagesGroup.click();
      await expect(rootPagesGroup).toHaveCount(1);
      const rootPageFile = page.locator(".folder-flat-file[data-path=\'bulk/modules/ROOT/pages/core/aop/Page.md\']");
      await expect(rootPageFile).toBeVisible();
      await expect(rootPageFile).not.toHaveAttribute("title", /\/ROOT(\/|$)/);
      await rootPageFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Root Page");

      await expect(page.locator(".folder-flat-group[data-path='bulk']")).toHaveCount(0);
      await expect(page.locator(".folder-flat-file", { hasText: "item-000.md" })).toBeVisible();
      await expect(page.locator(".folder-flat-file[data-path=\'bulk/unsupported.bin\']")).toHaveCount(0);
      await page.locator(".toggle-unsupported-files").first().evaluate((button) => button.click());
      await expect(page.locator(".folder-flat-file[data-path=\'bulk/unsupported.bin\']")).toBeVisible();
      await expect.poll(() => page.locator(".folder-flat-file").count()).toBeLessThan(80);

      await page.locator("#folder-tree-root").evaluate((root) => { root.scrollTop = root.scrollHeight; });
      await expect(page.locator(".folder-flat-file", { hasText: "item-179.md" })).toBeVisible();
      await page.locator(".folder-flat-file[data-path=\'bulk/item-179.md\']").click();
      await expect.poll(() => activeEditorValue(page)).toContain("Item 179");

      await bulkFolder.click({ button: "right" });
      await page.locator(".sidebar-folder-context-menu:not(.hidden) .sidebar-folder-view-submenu > .graph-context-menu-item").hover();
      await page.locator(".sidebar-folder-context-menu:not(.hidden) [data-sidebar-folder-view-mode=\'hierarchical\']").click();
      await expect(page.locator(".folder-tree-file[data-path=\'bulk/item-000.md\']").first()).toBeVisible();
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("folder watcher events update create rename delete UI state", async ({ page }) => {
    const folderPath = await createWorkspaceTree({ "watch.md": "# Watch" });
    const eventDir = folderPath.replace(/\\/g, "/");

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);

      await writeWorkspaceFile(folderPath, "created.md", "# Created");
      await dispatchFolderWatcherEvent(page, { action: "add", dir: eventDir, filename: "created.md" });
      await expect(page.locator(".folder-tree-file", { hasText: "created.md" })).toBeVisible();

      await renameWorkspacePath(folderPath, "created.md", "renamed.md");
      await dispatchFolderWatcherEvent(page, { action: "moved", dir: eventDir, oldFilename: "created.md", filename: "renamed.md" });
      await expect(page.locator(".folder-tree-file", { hasText: "renamed.md" })).toBeVisible();

      await removeWorkspacePath(folderPath, "renamed.md");
      await dispatchFolderWatcherEvent(page, { action: "delete", dir: eventDir, filename: "renamed.md" });
      await expect(page.locator(".folder-tree-file", { hasText: "renamed.md" })).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("folder tree expand toggle only collapses nested desktop folders", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      docs: {
        guide: {
          "intro.md": "# Intro",
        },
      },
      other: {
        "note.md": "# Note",
      },
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "untitled",
          }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.locator(".folder-tree-label", { hasText: "docs" }).first().click({ button: "right" });
      await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Expand this folder recursively" }).evaluate((button) => button.click());
      await expect(page.locator(".folder-tree-file[data-path='docs/guide/intro.md']")).toBeVisible();
      await page.locator(".folder-tree-file[data-path='docs/guide/intro.md']").click();
      await expect(page.locator(".folder-tree-file[data-path='docs/guide/intro.md']")).toHaveClass(/auto-selected/);
      await expect(page.locator(".toggle-folder-tree-expanded").first()).toHaveAttribute("title", "Collapse all folders");

      await page.locator(".toggle-folder-tree-expanded").first().evaluate((button) => button.click());
      await expect.poll(() => page.evaluate(() => ({
        docs: document.querySelector("#folder-tree-root details[data-path='docs']")?.open,
        guide: document.querySelector("#folder-tree-root details[data-path='docs/guide']")?.open,
        other: document.querySelector("#folder-tree-root details[data-path='other']")?.open,
      }))).toEqual({ docs: false, guide: false, other: false });
      await expect(page.locator(".toggle-folder-tree-expanded").first()).toHaveAttribute("title", "Collapse all folders");

      await page.locator(".toggle-folder-tree-expanded").first().evaluate((button) => button.click());
      await expect.poll(() => page.evaluate(() => ({
        docs: document.querySelector("#folder-tree-root details[data-path='docs']")?.open,
        guide: document.querySelector("#folder-tree-root details[data-path='docs/guide']")?.open,
        other: document.querySelector("#folder-tree-root details[data-path='other']")?.open,
      }))).toEqual({ docs: false, guide: false, other: false });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("folder context menu branch expansion opens the selected branch recursively", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "root-a": {
        "level-2": {
          "level-3": {
            "deep.md": "# Deep",
          },
        },
      },
      "root-b": {
        "note.md": "# Note",
      },
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "untitled",
                  folderTreeExpandLimitThreshold: 2,
            folderTreeExpandLimitDepth: 2,
          }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.locator(".toggle-folder-tree-expanded").first().evaluate((button) => button.click());
      await page.locator(".folder-tree-label", { hasText: "root-a" }).first().click({ button: "right" });
      await page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Expand this folder recursively" }).evaluate((button) => button.click());

      await expect.poll(() => page.evaluate(() => ({
        rootA: document.querySelector("#folder-tree-root details[data-path='root-a']")?.open,
        level2: document.querySelector("#folder-tree-root details[data-path='root-a/level-2']")?.open,
        level3: document.querySelector("#folder-tree-root details[data-path='root-a/level-2/level-3']")?.open,
        rootB: document.querySelector("#folder-tree-root details[data-path='root-b']")?.open,
      }))).toEqual({ rootA: true, level2: true, level3: true, rootB: false });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("folder toolbar collapse cancels a running branch expansion", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      root: {
        a: {
          b: {
            c: {
              d: {
                "deep.md": "# Deep",
              },
            },
          },
        },
      },
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "untitled",
          }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.evaluate(() => {
        const contextTree = window.markdownViewerApp?.modules?.sidebarContextTree;
        const originalRender = contextTree.renderFolderTreeLazyChildren;
        contextTree.renderFolderTreeLazyChildren = async (details) => {
          await new Promise((resolve) => setTimeout(resolve, 30));
          return originalRender(details);
        };
      });
      await page.locator(".folder-tree-label", { hasText: "root" }).first().click({ button: "right" });
      const expansion = page.locator(".sidebar-folder-context-menu:not(.hidden) .graph-context-menu-item", { hasText: "Expand this folder recursively" }).evaluate((button) => button.click());
      await page.locator(".toggle-folder-tree-expanded").first().evaluate((button) => button.click());
      await expansion;

      await expect.poll(() => page.evaluate(() => ({
        root: document.querySelector("#folder-tree-root details[data-path='root']")?.open,
        a: document.querySelector("#folder-tree-root details[data-path='root/a']")?.open,
        deepFileCount: document.querySelectorAll("#folder-tree-root .folder-tree-file[data-path='root/a/b/c/d/deep.md']").length,
      }))).toEqual({ root: false, a: false, deepFileCount: 0 });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("opens source and generated markdown files with the same sidebar title", async ({ page }) => {
    const folderPath = await createWorkspaceTree({
      "JarHandlerUtils1.java.md": "# Generated Markdown\n\nFrom generated docs.",
      "JarHandlerUtils1.java": "public class JarHandlerUtils1 {\n}",
    });

    try {
      await openApp(page);
      await openDesktopFolder(page, folderPath);

      const markdownFile = page.locator(".folder-tree-file[data-name='JarHandlerUtils1.java.md']");
      const sourceFile = page.locator(".folder-tree-file[data-name='JarHandlerUtils1.java']");
      await expect(markdownFile).toBeVisible();
      await expect(sourceFile).toBeVisible();

      await markdownFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Generated Markdown");
      await markdownFile.dblclick();

      await sourceFile.dblclick();
      await expect(page.locator("#tab-list .tab-item", { hasText: "JarHandlerUtils1.java" })).toHaveCount(2);
      await expect.poll(() => activeEditorValue(page)).toContain("public class JarHandlerUtils1");

      await markdownFile.click();
      await expect.poll(() => activeEditorValue(page)).toContain("Generated Markdown");
      await expect(page.locator("#tab-list .tab-item", { hasText: "JarHandlerUtils1.java" })).toHaveCount(2);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("auto select reveals the active duplicate path instead of the visible duplicate name", async ({ page }) => {
    const targetRelativePath = "framework-docs/src/main/java/org/springframework/docs/core/aop/ataspectj/aopaspectjsupport/ApplicationConfiguration.java.md";
    const visibleRelativePath = "framework-docs/src/main/java/org/springframework/docs/core/aop/aopajtwpspring/ApplicationConfiguration.java.md";
    const folderPath = await createWorkspaceTree({
      "framework-docs": {
        src: {
          main: {
            java: {
              org: {
                springframework: {
                  docs: {
                    core: {
                      aop: {
                        aopajtwpspring: {
                          "ApplicationConfiguration.java.md": "# Visible duplicate",
                        },
                        ataspectj: {
                          aopaspectjsupport: {
                            "ApplicationConfiguration.java.md": "# Target duplicate",
                          },
                        },
                      },
                    },
                  },
                },
              },
            },
          },
        },
      },
    });

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "untitled",
                }),
        },
      });
      await openDesktopFolder(page, folderPath);
      await page.evaluate(async (relativeFolderPath) => {
        let current = "";
        for (const segment of relativeFolderPath.split("/")) {
          current = current ? `${current}/${segment}` : segment;
          const details = document.querySelector(`#folder-tree-root details[data-path="${CSS.escape(current)}"]`);
          if (!details) throw new Error(`Missing tree path ${current}`);
          await window.markdownViewerApp.modules.sidebarContextTree.renderFolderTreeLazyChildren(details);
          details.open = true;
        }
      }, visibleRelativePath.split("/").slice(0, -1).join("/"));
      await expect(page.locator(".folder-tree-file", { hasText: "ApplicationConfiguration.java.md" })).toHaveCount(1);

      await page.evaluate(({ targetPath }) => {
        window.markdownViewerApp.modules.tabs.openSidebarFileInPermanentTab("# Target", "ApplicationConfiguration.java", {
          name: "ApplicationConfiguration.java.md",
          path: targetPath,
        });
      }, { targetPath: path.join(folderPath, targetRelativePath) });

      await expect(page.locator(".folder-tree-file.auto-selected")).toHaveAttribute("data-path", targetRelativePath);
      await expect.poll(() => page.evaluate(() => ({
        targetPackage: document.querySelector("#folder-tree-root details[data-path='framework-docs/src/main/java/org/springframework/docs/core/aop/ataspectj']")?.open,
        targetFolder: document.querySelector("#folder-tree-root details[data-path='framework-docs/src/main/java/org/springframework/docs/core/aop/ataspectj/aopaspectjsupport']")?.open,
        wrongFileSelected: document.querySelector(".folder-tree-file.auto-selected")?.dataset.path?.includes("/aopajtwpspring/"),
      }))).toEqual({ targetPackage: true, targetFolder: true, wrongFileSelected: false });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
});
