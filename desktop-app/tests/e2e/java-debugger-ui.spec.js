const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile, spawn } = require("node:child_process");
const net = require("node:net");
const { promisify } = require("node:util");
const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, openDesktopFolder, selectSettingsTab } = require("../helpers/desktop-ui");
const { createWorkspaceTree, removeTempWorkspace } = require("../helpers/temp-workspace");
const execFileAsync = promisify(execFile);

async function openDebugMenu(page) {
  await openActionMenu(page);
  const debugSubmenu = page.locator(".header-action-menu .application-menu-debug");
  await debugSubmenu.locator("> .dropdown-toggle").hover();
  await expect(debugSubmenu.locator("> .action-submenu")).toBeVisible();
  return debugSubmenu.locator("> .action-submenu");
}
async function dismissVisibleNotification(page) {
  const modal = page.locator("#app-notification-modal");
  let quietChecks = 0;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    if (!await modal.isVisible().catch(() => false)) {
      quietChecks += 1;
      if (quietChecks >= 2) return;
      await page.waitForTimeout(150);
      continue;
    }
    quietChecks = 0;
    const button = modal.locator('[data-notification-button-id="close"], [data-notification-button-id="cancel"], [data-notification-button-id="dismiss"], button').first();
    if (await button.count()) await button.click();
    else await page.keyboard.press("Escape");
    await expect(modal).not.toBeVisible({ timeout: 2000 });
    await page.waitForTimeout(100);
  }
}

async function pathExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch (_error) {
    return false;
  }
}

function jdkToolPath(jdkHome, toolName) {
  return path.join(jdkHome, "bin", `${toolName}${process.platform === "win32" ? ".exe" : ""}`);
}

async function findAvailablePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : 0;
      server.close(() => resolve(port));
    });
  });
}

function waitForDebuggeeListening(child) {
  return new Promise((resolve, reject) => {
    let combinedOutput = "";
    const timer = setTimeout(() => finish(new Error(`Timed out waiting for JDWP listener. Output: ${combinedOutput}`)), 10000);
    function finish(error) {
      clearTimeout(timer);
      child.stdout?.off?.("data", onData);
      child.stderr?.off?.("data", onData);
      child.off?.("exit", onExit);
      if (error) reject(error);
      else resolve(combinedOutput);
    }
    function onData(chunk) {
      combinedOutput += String(chunk || "");
      if (/Listening for transport dt_socket/i.test(combinedOutput)) finish(null);
    }
    function onExit(code, signal) {
      finish(new Error(`JDWP debuggee exited before listening: code=${code} signal=${signal} output=${combinedOutput}`));
    }
    child.stdout?.on?.("data", onData);
    child.stderr?.on?.("data", onData);
    child.once?.("exit", onExit);
  });
}

function waitForProcessExit(child, timeout = 10000) {
  if (!child || child.exitCode !== null) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error("Timed out waiting for debuggee process exit."));
    }, timeout);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

function normalizeJavaPath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
}

function createJdkEntry(jdkHome) {
  const normalizedPath = normalizeJavaPath(jdkHome);
  const featureMatch = normalizedPath.match(/(?:jdk-|jdk)(\d+)/i);
  const feature = featureMatch ? Number(featureMatch[1]) : 17;
  return {
    id: `jdk:${normalizedPath.toLowerCase()}`,
    name: `JDK ${feature}`,
    path: normalizedPath,
    feature,
    detectedName: `JDK ${feature}`,
  };
}

function createStandardJavaBuildPath(projectJdkId, projectPath = "") {
  const profileSourceFolder = projectPath ? normalizeJavaPath(path.join(projectPath, "src", "main", "java")) : "src/main/java";
  const profileOutputPath = projectPath ? normalizeJavaPath(path.join(projectPath, "classes")) : "classes";
  return JSON.stringify({
    schemaVersion: 10,
    type: "md-editor-java-build-path",
    projectJdkId,
    buildSystem: "javac",
    sourceFolders: ["src/main/java"],
    classpathFolders: [],
    jarFiles: [],
    javacProfile: {
      sourceFolders: [profileSourceFolder],
      classpathEntries: [],
      outputMode: "classes",
      outputPath: profileOutputPath,
      exportSources: false,
    },
    analysisScope: {
      mode: "all",
      inventoryKind: "",
      deselectedEntryIds: [],
      customized: false,
    },
    maven: { compileTests: true, runTests: false },
    gradle: { mode: "installation", installationId: null, compileTests: true, runTests: false },
  }, null, 2) + "\n";
}

async function findUsableJdkHome() {
  const candidates = [
    process.env.JAVA_HOME,
    "C:/Program Files/Java/jdk-26.0.1",
    "C:/Program Files/Java/jdk-25.0.3",
    "C:/Program Files/Java/jdk-22",
    "C:/Program Files/Java/jdk-21",
    "C:/Program Files/Java/jdk-17",
    "C:/Program Files/Eclipse Adoptium/jdk-17.0.7.7-hotspot",
  ].filter(Boolean);

  try {
    const javaHomeEntries = await fs.readdir("C:/Program Files/Java", { withFileTypes: true });
    for (const entry of javaHomeEntries) {
      if (entry.isDirectory() && /^jdk/i.test(entry.name)) candidates.push(`C:/Program Files/Java/${entry.name}`);
    }
  } catch (_error) {
    // JDK discovery is best-effort in UI tests.
  }

  for (const candidate of Array.from(new Set(candidates.map(normalizeJavaPath)))) {
    const javaExecutable = `${candidate}/bin/java.exe`;
    const javacExecutable = `${candidate}/bin/javac.exe`;
    if (await pathExists(javaExecutable) && await pathExists(javacExecutable)) return candidate;
  }
  return "";
}
async function openJavaFile(page, folderPath, relativePath, options = {}) {
  await openDesktopFolder(page, folderPath);
  await dismissVisibleNotification(page);
  const javaFile = page.locator(`.folder-tree-file[data-path="${relativePath}"]`);
  if (await javaFile.count() === 0) {
    await page.locator(".folder-tree-tool-button.toggle-unsupported-files").first().evaluate((button) => button.click());
    await dismissVisibleNotification(page);
  }
  await page.evaluate(async (filePath) => {
    let current = "";
    for (const segment of String(filePath || "").split("/").slice(0, -1)) {
      current = current ? `${current}/${segment}` : segment;
      const details = document.querySelector(`#folder-tree-root details[data-path="${CSS.escape(current)}"]`);
      if (!details) throw new Error(`Missing tree path ${current}`);
      await window.markdownViewerApp.modules.sidebarContextTree.renderFolderTreeLazyChildren(details);
      details.open = true;
    }
  }, relativePath);
  await expect(javaFile).toBeVisible();
  await dismissVisibleNotification(page);
  await javaFile.click();
  await expect(page.locator(".codemirror-editor").last()).toHaveAttribute("data-language", "java");
  if (options.loadDebugState !== false) await page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.loadProjectState?.());
  await expect(page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive")).toBeVisible();
}

test.describe("Java debugger UI", () => {
  test("restores project breakpoints from .md-editor when the project opens", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    const folderPathRaw = await createWorkspaceTree({
      "src/main/java/Demo.java": [
        "public class Demo {",
        "  public static void main(String[] args) {",
        "    System.out.println(\"restored\");",
        "  }",
        "}"
      ].join("\n")
    }, "md-editor-java-debugger-restored-breakpoints-");
    try {
      const folderPath = normalizeJavaPath(folderPathRaw);
      const filePath = normalizeJavaPath(path.join(folderPath, "src", "main", "java", "Demo.java"));
      await fs.mkdir(path.join(folderPathRaw, ".md-editor"), { recursive: true });
      await fs.writeFile(path.join(folderPathRaw, ".md-editor", "java-debugger.json"), JSON.stringify({
        schemaVersion: 1,
        breakpoints: [{ file: filePath, line: 3, enabled: true, sourcePreview: "System.out.println(\"restored\");" }],
        methodBreakpoints: [],
        watches: [],
        expressionHistory: [],
        exceptionBreakpoint: null
      }, null, 2) + "\n", "utf8");

      await openJavaFile(page, folderPath, "src/main/java/Demo.java", { loadDebugState: false });

      await expect.poll(() => page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints?.map((breakpoint) => ({ file: breakpoint.file, line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [])).toEqual([
        { file: filePath, line: 3, enabled: true }
      ]);
      await expect(page.locator('.cm-navigationMarker[data-navigation-marker-line="3"] .cm-debugBreakpointMarker-enabled')).toHaveCount(1);
    } finally {
      await removeTempWorkspace(folderPathRaw);
    }
  });
  test("debug header toolbar stays hidden while idle and exposes IDE-style controls during debugging", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await expect.poll(() => page.evaluate(() => typeof window.markdownViewerApp?.modules?.javaDebugProtocolClient?.createClient)).toBe("function");

    const toolbarHost = page.locator("#java-debug-header-toolbar");
    const viewModeControls = page.locator(".header-panel-controls .view-mode-group");
    await expect(toolbarHost).toBeHidden();
    await expect(toolbarHost.locator(".java-debug-header-controls")).toHaveCount(0);
    await expect(viewModeControls).toBeVisible();
    await expect(viewModeControls.locator('.view-mode-btn[data-mode="editor"]')).toBeVisible();

    await page.evaluate(() => {
      window.markdownViewerApp?.modules?.javaDebugGlobalToolbar?.render?.({ state: "running", breakpoints: [] });
    });
    await expect(toolbarHost).toBeVisible();
    await expect(viewModeControls).toBeHidden();
    const toolbar = toolbarHost.locator(".java-debug-header-controls");
    await expect(toolbar).toBeVisible();
    const actions = [
      "start",
      "attach",
      "resume",
      "pause",
      "stop",
      "restart",
      "step-over",
      "step-into",
      "step-out",
      "run-to-cursor",
      "drop-frame",
      "toggle-line-breakpoint",
      "toggle-breakpoints",
      "mute-breakpoints",
      "workspace",
    ];
    await expect(toolbar.locator("[data-debug-header-action]")).toHaveCount(actions.length);
    for (const action of actions) {
      await expect(toolbar.locator(`[data-debug-header-action="${action}"]`)).toHaveCount(1);
    }
    await expect(toolbar.locator('[data-debug-header-action="start"]')).toHaveAttribute("title", /Start Debugging.*F5/);
    await expect(toolbar.locator('[data-debug-header-action="resume"]')).toHaveAttribute("title", /Continue \/ Resume.*F5/);
    await expect(toolbar.locator('[data-debug-header-action="pause"]')).toHaveAttribute("title", /Pause \/ Suspend.*F6/);
    await expect(toolbar.locator('[data-debug-header-action="step-over"]')).toHaveAttribute("title", /Step Over.*F10/);
    await expect(toolbar.locator('[data-debug-header-action="start"] i')).toHaveClass(/bi-bug-fill/);
    await expect(toolbar.locator('[data-debug-header-action="resume"] i')).toHaveClass(/java-debug-icon-continue/);
    await expect(toolbar.locator('[data-debug-header-action="step-over"] i')).toHaveClass(/java-debug-icon-step-over/);
    await expect(toolbar.locator('[data-debug-header-action="step-into"] i')).toHaveClass(/java-debug-icon-step-into/);
    await expect(toolbar.locator('[data-debug-header-action="step-out"] i')).toHaveClass(/java-debug-icon-step-out/);
    await expect(toolbar.locator('[data-debug-header-action="run-to-cursor"]')).toHaveAttribute("title", /Run to Cursor.*Ctrl\+F10/);
    await expect(toolbar.locator('[data-debug-header-action="toggle-line-breakpoint"]')).toHaveAttribute("title", /Toggle Line Breakpoint.*F9/);
    await expect(toolbar.locator(".java-debug-header-state")).toContainText("Running");
    await expect(toolbar.locator('[data-debug-header-action="start"]')).toBeDisabled();
    await expect(toolbar.locator('[data-debug-header-action="attach"]')).toBeDisabled();

    await page.evaluate(() => {
      const host = document.createElement("div");
      host.id = "active-debug-toolbar-test";
      const viewModeControls = document.createElement("div");
      document.body.append(host, viewModeControls);
      window.registerMarkdownViewerJavaDebugGlobalToolbar?.({
        modules: { keyboardShortcuts: window.markdownViewerApp?.modules?.keyboardShortcuts },
        registerModule() {}
      }, {
        host,
        viewModeControls,
        session: { getState: () => ({ state: "running", breakpoints: [] }), subscribe() {} },
        store: { getSnapshot: () => ({ projectPath: "C:/project" }) },
        getActiveEditorPath: () => "",
        isJavaSourcePath: () => false
      });
    });
    await expect(page.locator('#active-debug-toolbar-test [data-debug-header-action="start"]')).toBeDisabled();
    await expect(page.locator('#active-debug-toolbar-test [data-debug-header-action="attach"]')).toBeDisabled();

    await toolbar.locator('[data-debug-header-action="workspace"]').click();
    await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
    await expect(page.locator("#java-debug-right-dock")).toBeVisible();
    await expect(page.locator("#java-debug-left-perspective [data-debug-perspective-left-view='threads']")).toHaveClass(/active/);
    await page.locator("#java-debug-left-perspective [data-debug-perspective-left-view='stack']").click();
    await expect(page.locator("#java-debug-left-perspective [data-debug-pane='stack']")).toBeVisible();
    await expect(page.locator("#java-debug-right-perspective [data-debug-perspective-right-view='variables']")).toHaveClass(/active/);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-console"]')).toHaveClass(/active/);
    await expect(toolbar.locator('[data-debug-header-action="resume"] i')).toHaveClass(/java-debug-icon-continue/);
    await expect(toolbar.locator('[data-debug-header-action="step-over"] i')).toHaveClass(/java-debug-icon-step-over/);
    await expect(toolbar.locator('[data-debug-header-action="step-into"] i')).toHaveClass(/java-debug-icon-step-into/);
    await expect(toolbar.locator('[data-debug-header-action="step-out"] i')).toHaveClass(/java-debug-icon-step-out/);

    await page.evaluate(() => {
      window.markdownViewerApp?.modules?.javaDebugGlobalToolbar?.render?.({ state: "terminated", breakpoints: [] });
    });
    await expect(toolbarHost).toBeHidden();
    await expect(toolbarHost.locator(".java-debug-header-controls")).toHaveCount(0);
    await expect(viewModeControls).toBeVisible();
  });
  test("debug menu exposes IDE-style debugger groups and opens separated workspace panes", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.tabs?.newTab === "function");
    await page.evaluate(() => window.markdownViewerApp.modules.tabs.newTab("# Debug Layout", "DebugLayout.md"));
    const editorTab = page.locator("#tab-list .tab-item", { hasText: "DebugLayout.md" });
    await expect(editorTab).toBeVisible();

    const debugMenu = await openDebugMenu(page);
    await expect(debugMenu.locator(".debug-menu-section-label")).toHaveText([
      "Launch",
      "Session",
      "Stepping",
      "Breakpoints",
      "Evaluation",
      "Debug Views",
      "Debug Layout",
    ]);
    for (const command of [
      "debug-dialog",
      "debug-active",
      "workspace",
      "resume",
      "step-over",
      "toggle-breakpoint",
      "evaluate",
      "show-stack",
      "view-debug-layout",
      "reset-layout",
    ]) {
      await expect(debugMenu.locator(`[data-debug-menu-command="${command}"]`)).toHaveCount(1);
    }
    await expect(debugMenu.locator('[data-debug-menu-command="layout-eclipse"]')).toHaveCount(0);
    await expect(debugMenu.locator('[data-debug-menu-command="layout-intellij"]')).toHaveCount(0);
    await expect(debugMenu.locator('[data-debug-menu-command="view-debug-layout"]')).toHaveText(/View Debug Layout/);
    await expect(debugMenu.locator('[data-debug-menu-command="debug-active"] i')).toHaveClass(/bi-bug-fill/);
    await expect(debugMenu.locator('[data-debug-menu-command="resume"] i')).toHaveClass(/java-debug-icon-continue/);
    await expect(debugMenu.locator('[data-debug-menu-command="step-over"] i')).toHaveClass(/java-debug-icon-step-over/);
    await expect(debugMenu.locator('[data-debug-menu-command="step-into"] i')).toHaveClass(/java-debug-icon-step-into/);
    await expect(debugMenu.locator('[data-debug-menu-command="step-out"] i')).toHaveClass(/java-debug-icon-step-out/);

    await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
    const leftPerspective = page.locator("#java-debug-left-perspective");
    const rightPerspective = page.locator("#java-debug-right-perspective");
    await expect(leftPerspective).toBeVisible();
    await expect(page.locator("#java-debug-right-dock")).toBeVisible();
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-console"]')).toHaveClass(/active/);

    await editorTab.dblclick();
    await expect(page.locator("#java-debug-right-dock")).toBeHidden();
    await editorTab.dblclick();
    await expect(page.locator("#java-debug-right-dock")).toBeVisible();

    await page.locator('[data-bottom-panel-tab-id="java-debug-console"]').dblclick();
    await expect(page.locator("body")).toHaveClass(/bottom-panel-maximized/);
    await expect(page.locator("#java-debug-right-dock")).toBeHidden();
    await page.locator('[data-bottom-panel-tab-id="java-debug-console"]').dblclick();
    await expect(page.locator("body")).not.toHaveClass(/bottom-panel-maximized/);
    await expect(page.locator("#java-debug-right-dock")).toBeVisible();

    await expect(leftPerspective.locator('[data-debug-perspective-left-view="threads"]')).toHaveClass(/active/);
    await expect(leftPerspective.locator('[data-debug-perspective-left-view]')).toHaveText([
      "Threads",
      "Call Stack",
    ]);
    await leftPerspective.locator('[data-debug-perspective-left-view="stack"]').click();
    await expect(leftPerspective.locator('[data-debug-pane="stack"]')).toBeVisible();
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="variables"]')).toHaveClass(/active/);
    await expect(rightPerspective.locator('[data-debug-perspective-right-view]')).toHaveText([
      "Variables",
      "Breakpoints",
      "Watches",
      "Expressions",
      "AI Companion",
    ]);

    await leftPerspective.locator('[data-debug-perspective-left-view="threads"]').dblclick();
    await expect(page.locator("body")).toHaveClass(/java-debug-left-dock-maximized/);
    await expect(page.locator(".editor-workspace")).toBeHidden();
    await leftPerspective.locator('[data-debug-perspective-left-view="threads"]').dblclick();
    await expect(page.locator("body")).not.toHaveClass(/java-debug-left-dock-maximized/);
    await expect(page.locator(".editor-workspace")).toBeVisible();

    await rightPerspective.locator('[data-debug-perspective-right-view="variables"]').dblclick();
    await expect(page.locator("body")).toHaveClass(/java-debug-right-dock-maximized/);
    await expect(page.locator(".folder-tree-pane")).toBeHidden();
    await expect(page.locator(".editor-workspace")).toBeHidden();
    await rightPerspective.locator('[data-debug-perspective-right-view="variables"]').dblclick();
    await expect(page.locator("body")).not.toHaveClass(/java-debug-right-dock-maximized/);
    await expect(page.locator(".folder-tree-pane")).toBeVisible();
    await expect(page.locator(".editor-workspace")).toBeVisible();

    await rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]').click();
    await expect(rightPerspective.locator('[data-debug-pane="breakpoints"]')).toBeVisible();
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]')).toHaveClass(/bottom-panel-tab/);
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"] .bottom-panel-tab-close')).toBeVisible();

    await rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]').click({ button: "right" });
    const tabContextMenu = page.locator(".bottom-panel-tab-context-menu:not(.hidden)");
    await expect(tabContextMenu.getByRole("menuitem", { name: "Close", exact: true })).toBeVisible();
    await expect(tabContextMenu.getByRole("menuitem", { name: "Close others", exact: true })).toBeVisible();
    await expect(tabContextMenu.getByRole("menuitem", { name: "Close all", exact: true })).toBeVisible();
    await page.keyboard.press("Escape");

    await rightPerspective.locator('[data-debug-perspective-right-view="watches"] .bottom-panel-tab-close').click();
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="watches"]')).toHaveCount(0);
    await page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("watches"));
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="watches"]')).toHaveClass(/active/);

    await page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugRightPerspectiveTabs?.reorderTab?.("watches", "variables"));
    await expect.poll(() => page.locator('#java-debug-right-perspective [data-debug-perspective-right-view]').evaluateAll((tabs) => tabs.map((tab) => tab.dataset.debugPerspectiveRightView))).toEqual([
      "watches",
      "variables",
      "breakpoints",
      "expressions",
    ]);

    await rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]').dragTo(page.locator('[data-bottom-panel-tab-id="java-debug-console"]'));
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-breakpoints"]')).toBeVisible();
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]')).toHaveCount(0);

    const resetMenu = await openDebugMenu(page);
    await resetMenu.locator('[data-debug-menu-command="reset-layout"]').click();
    await expect(leftPerspective.locator('[data-debug-perspective-left-view]')).toHaveText([
      "Threads",
      "Call Stack",
    ]);
    await expect(rightPerspective.locator('[data-debug-perspective-right-view]')).toHaveText([
      "Variables",
      "Breakpoints",
      "Watches",
      "Expressions",
      "AI Companion",
    ]);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-console"]')).toBeVisible();
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-breakpoints"]')).toHaveCount(0);

    await rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]').dragTo(page.locator('[data-bottom-panel-tab-id="java-debug-console"]'));
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-breakpoints"]')).toBeVisible();
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]')).toHaveCount(0);

    await page.locator('[data-bottom-panel-tab-id="java-debug-breakpoints"]').dragTo(leftPerspective.locator('[data-debug-perspective-left-view="threads"]'));
    await expect(leftPerspective.locator('[data-debug-perspective-left-view="breakpoints"]')).toBeVisible();
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-breakpoints"]')).toHaveCount(0);

    await leftPerspective.locator('[data-debug-perspective-left-view="breakpoints"]').dragTo(rightPerspective.locator('[data-debug-perspective-right-view="variables"]'));
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="breakpoints"]')).toBeVisible();
    await expect(leftPerspective.locator('[data-debug-perspective-left-view="breakpoints"]')).toHaveCount(0);

    await rightPerspective.locator('[data-debug-perspective-right-view="variables"]').click({ button: "right" });
    await tabContextMenu.getByRole("menuitem", { name: "Close all", exact: true }).click();
    await expect(rightPerspective.locator('[data-debug-perspective-right-view]')).toHaveCount(0);
    await expect(rightPerspective.locator(".java-debug-perspective-empty")).toBeVisible();
    await page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("variables"));
    await expect(rightPerspective.locator('[data-debug-perspective-right-view="variables"]')).toHaveClass(/active/);
  });

  test("debug workspace opens side perspective without duplicate bottom tabs", async ({ page }) => {
    await openApp(page, { preserveLocalStorage: true, localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });

    await page.evaluate(async () => {
      await window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("workspace");
    });

    await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
    await expect(page.locator("#java-debug-right-dock")).toBeVisible();
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-console"]')).toHaveClass(/active/);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-stack"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-variables"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-watches"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-expressions"]')).toHaveCount(0);
    await expect(page.locator('[data-bottom-panel-tab-id="java-debug-breakpoints"]')).toHaveCount(0);
  });
  test("Java debug launch stops at a gutter breakpoint and populates runtime panes", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    String message = \"runtime breakpoint\";",
      "    System.out.println(message + \" \" + counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-runtime-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFive = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "5" }).first();
      await lineFive.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 5, enabled: true }]);

      const debugMenu = await openDebugMenu(page);
      const debugActive = debugMenu.locator('[data-debug-menu-command="debug-active"]');
      await expect(debugActive).toBeEnabled();
      await expect(debugActive.locator(".debug-active-label")).toContainText("Debug Current Java File");
      await debugActive.click();
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"].active')).toHaveCount(0);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const runtimeState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || selectedThread?.frames?.[0] || null;
        return {
          state: state.state,
          reason: state.stoppedReason,
          line: state.location?.line || 0,
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          threadCount: (state.threads || []).length,
          selectedFrame: state.selectedFrameId || "",
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      });
      if (runtimeState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop at the breakpoint: ${JSON.stringify(runtimeState, null, 2)}`);
      }
      expect(runtimeState).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "breakpoint",
        line: 5,
        frame: "Demo.main",
        lastError: "",
      });
      expect(runtimeState.console).not.toContain("Source file could not be opened");
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"].active')).toHaveCount(0);
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("workspace");
      });

      const panel = page.locator(".java-debug-panel.active");
      await expect(panel.locator(".java-debug-session-overview")).toContainText("Stopped at breakpoint");
      await expect(panel.locator(".java-debug-frame.active")).toContainText("Demo.main");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);

      await page.keyboard.press("Shift+F5");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger does not auto-focus the debug workspace on launch stop or stepping", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 1;",
      "    counter = counter + 1;",
      "    System.out.println(counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-no-auto-focus-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineThree = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "3" }).first();
      await lineThree.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 3, enabled: true }]);

      await page.keyboard.press("F5");
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"].active')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state || "", line: state.location?.line || 0, lastError: state.lastError || "" };
      }), { timeout: 60000 }).toEqual({ state: "stopped-at-breakpoint", line: 3, lastError: "" });
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"].active')).toHaveCount(0);

      await page.keyboard.press("F10");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state || "", line: state.location?.line || 0, lastError: state.lastError || "" };
      }), { timeout: 30000 }).toEqual({ state: "paused", line: 4, lastError: "" });
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"].active')).toHaveCount(0);
    } finally {
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stopAll?.();
      }).catch(() => {});
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java Debug menu launches and switches between multiple active sessions", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) throws Exception {",
      "    int counter = 7;",
      "    System.out.println(\"session \" + counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-multi-session-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    async function waitForStoppedSession(expectedSessionCount) {
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          line: state.location?.line || 0,
          sessions: (state.debugSessions || []).length,
          activeSessionId: state.activeSessionId || "",
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toMatchObject({
        state: "stopped-at-breakpoint",
        line: 3,
        sessions: expectedSessionCount,
        lastError: "",
      });
    }

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineThree = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "3" }).first();
      await lineThree.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 3, enabled: true }]);

      let debugMenu = await openDebugMenu(page);
      const firstDebugActive = debugMenu.locator('[data-debug-menu-command="debug-active"]');
      await expect(firstDebugActive).toBeEnabled();
      await firstDebugActive.click();
      await waitForStoppedSession(1);
      const firstSessionId = await page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().activeSessionId || "");
      expect(firstSessionId).toBeTruthy();

      debugMenu = await openDebugMenu(page);
      const secondDebugActive = debugMenu.locator('[data-debug-menu-command="debug-active"]');
      await expect(secondDebugActive).toBeEnabled();
      await expect(secondDebugActive).toHaveAttribute("title", /another Java debug session/i);
      await secondDebugActive.click();
      await waitForStoppedSession(2);

      const panel = page.locator(".java-debug-panel.active");
      const sessionPicker = panel.locator("[data-debug-session-select]");
      await expect(sessionPicker).toBeVisible();
      await expect(sessionPicker.locator("option")).toHaveCount(2);
      await expect.poll(() => page.evaluate((firstId) => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { activeChanged: state.activeSessionId !== firstId, sessions: (state.debugSessions || []).length };
      }, firstSessionId)).toEqual({ activeChanged: true, sessions: 2 });

      await sessionPicker.selectOption(firstSessionId);
      await expect.poll(() => page.evaluate((firstId) => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { activeSessionId: state.activeSessionId || "", state: state.state || "", line: state.location?.line || 0 };
      }, firstSessionId)).toEqual({ activeSessionId: firstSessionId, state: "stopped-at-breakpoint", line: 3 });
    } finally {
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stopAll?.();
      }).catch(() => {});
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger restarts a launched session and hits breakpoints again", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    System.out.println(\"boot\");",
      "    int counter = 7;",
      "    System.out.println(\"done \" + counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-restart-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    async function waitForBreakpointStop(label) {
      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const snapshot = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || selectedThread?.frames?.[0] || null;
        return {
          state: state.state,
          reason: state.stoppedReason || "",
          line: state.location?.line || 0,
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          restartable: state.restartable === true,
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      });
      if (snapshot.state !== "stopped-at-breakpoint") {
        throw new Error(`${label}: debugger did not stop at the breakpoint: ${JSON.stringify(snapshot, null, 2)}`);
      }
      expect(snapshot).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "breakpoint",
        line: 4,
        frame: "Demo.main",
        restartable: true,
        lastError: "",
      });
      expect(snapshot.console).toContain("boot");
      expect(snapshot.console).not.toContain("done 7");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);
      return snapshot;
    }

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await waitForBreakpointStop("before restart");
      const panel = page.locator(".java-debug-panel.active");
      const restartButton = panel.locator(".java-debug-toolbar [data-debug-action=\"restart\"]").first();
      await expect(restartButton).toBeEnabled();
      await restartButton.click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("launching");
      await waitForBreakpointStop("after restart");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java paused debugger evaluates variables watches and expressions", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    String message = \"runtime breakpoint\";",
      "    Helper helper = new Helper(\"Ada\", 3);",
      "    System.out.println(message + \" \" + counter + \" \" + helper.name);",
      "  }",
      "  static class Helper {",
      "    String name;",
      "    int count;",
      "    Helper(String name, int count) {",
      "      this.name = name;",
      "      this.count = count;",
      "    }",
      "    String getName() { return name; }",
      "    int total(int extra) { return count + extra; }",
      "    void rename(String nextName) { this.name = nextName; }",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-inspection-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineSix = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "6" }).first();
      await lineSix.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 6, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state,
          line: state.location?.line || 0,
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop before inspection: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState.line).toBe(6);
      expect(stoppedState.lastError).toBe("");
      expect(stoppedState.console).not.toContain("Source file could not be opened");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.threads || []).some((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId));
      }), { timeout: 30000 }).toBe(true);

      const panel = page.locator(".java-debug-panel.active");
      await page.evaluate(async () => {
        const session = window.markdownViewerApp?.modules?.javaDebugSession;
        await session.addWatch("counter + 5");
        await session.evaluate("counter + 5");
      });
      await expect(panel.locator(".java-debug-evaluation-result").first()).toContainText("counter + 5");
      await expect(panel.locator(".java-debug-evaluation-result").first()).toContainText("12");
      await page.evaluate(async () => {
        const session = window.markdownViewerApp?.modules?.javaDebugSession;
        await session.evaluate("message");
        const state = session.getState();
        const helper = (state.variables || []).find((variable) => variable.name === "helper");
        if (helper?.objectId) await session.expand(helper.objectId);
      });

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          variables: (state.variables || []).map((variable) => ({
            name: variable.name,
            type: variable.type,
            value: variable.value,
            childNames: (variable.children || []).map((child) => child.name),
          })),
          watches: (state.watches || []).map((watch) => ({
            expression: watch.expression,
            result: typeof watch.result === "object" && watch.result ? watch.result.value : watch.result || "",
            error: watch.error || "",
          })),
        };
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        variables: expect.arrayContaining([
          expect.objectContaining({ name: "counter", type: "int", value: "7" }),
          expect.objectContaining({ name: "message", type: "java.lang.String", value: expect.stringContaining("runtime breakpoint") }),
          expect.objectContaining({ name: "helper", type: "Demo$Helper", childNames: expect.arrayContaining(["name", "count"]) }),
        ]),
        watches: expect.arrayContaining([
          expect.objectContaining({ expression: "counter + 5", result: "12", error: "" }),
        ]),
      }));

      await expect(panel.locator(".java-debug-pane-variables .java-debug-value-text").filter({ hasText: "counter : int = 7" }).first()).toContainText("counter : int = 7");
      await expect(panel.locator(".java-debug-pane-watches [data-watch-expression-input]").first()).toHaveValue("counter + 5");
      await expect(panel.locator(".java-debug-pane-watches .java-debug-watch-result").first()).toContainText("12");
      await expect(panel.locator(".java-debug-evaluation-result").filter({ hasText: "runtime breakpoint" }).first()).toContainText("runtime breakpoint");
      const evaluatePausedExpression = async (expression) => {
        await expect.poll(() => page.evaluate(() => {
          return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
        }), { timeout: 30000 }).toBe("stopped-at-breakpoint");
        await page.evaluate(async (value) => {
          await window.markdownViewerApp?.modules?.javaDebugSession?.evaluate(value);
        }, expression);
      };
      await evaluatePausedExpression("helper.getName()");
      await evaluatePausedExpression("helper.total(9)");
      await expect(panel.locator(".java-debug-evaluation-result").filter({ hasText: "helper.total(9)" }).first()).toContainText("12");
      await evaluatePausedExpression("helper.rename(\"Grace\")");
      await evaluatePausedExpression("helper.getName()");
      await expect(panel.locator(".java-debug-evaluation-result").filter({ hasText: "helper.getName()" }).first()).toContainText("Grace");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          lastExpression: state.lastEvaluation?.expression || "",
          lastValue: state.lastEvaluation?.value || "",
        };
      }), { timeout: 30000 }).toEqual({
        lastExpression: "helper.getName()",
        lastValue: expect.stringContaining("Grace"),
      });

      const hoverPoint = await page.evaluate(() => {
        const app = window.markdownViewerApp;
        const source = app?.modules?.activeEditorCommands?.getActiveEditorValue?.() || "";
        const offset = source.indexOf("message =");
        if (offset < 0) throw new Error("Unable to locate message token for debugger hover inspection.");
        const view = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.();
        const coords = view?.coordsAtPos?.(offset + 1);
        if (!coords) throw new Error("Unable to locate message token coordinates for debugger hover inspection.");
        return { x: coords.left + 2, y: (coords.top + coords.bottom) / 2 };
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 5000 }).toBe("stopped-at-breakpoint");
      await page.mouse.move(hoverPoint.x, hoverPoint.y);

      await expect(page.locator(".java-debug-hover-tooltip")).toBeVisible({ timeout: 5000 });
      await expect(page.locator(".java-debug-hover-tooltip")).toContainText("message");
      await expect(page.locator(".java-debug-hover-tooltip")).toContainText("runtime breakpoint");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger keyboard shortcuts start resume toggle breakpoints and evaluate selections", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    System.out.println(counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-shortcuts-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    async function selectLineText(lineNumber, text) {
      await page.evaluate(({ lineNumber, text }) => {
        const app = window.markdownViewerApp;
        const view = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.()
          || app?.modules?.codeMirrorEditor?.getView?.();
        if (!view?.state?.doc?.line || !view.dispatch) throw new Error("Unable to access the active CodeMirror view.");
        const line = view.state.doc.line(lineNumber);
        const offset = line.text.indexOf(text);
        if (offset < 0) throw new Error(`Unable to locate ${text} on line ${lineNumber}.`);
        view.dispatch({ selection: { anchor: line.from + offset, head: line.from + offset + text.length }, scrollIntoView: true });
        view.focus?.();
      }, { lineNumber, text });
    }

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      await selectLineText(4, "counter");

      await page.keyboard.press("F9");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(1);

      await page.keyboard.press("F9");
      await expect.poll(() => page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints || [])).toEqual([]);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(0);

      await page.keyboard.press("F9");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      await page.keyboard.press("F5");
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-workspace"].active')).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state || "", line: state.location?.line || 0, lastError: state.lastError || "" };
      }), { timeout: 60000 }).toEqual({ state: "stopped-at-breakpoint", line: 4, lastError: "" });

      await selectLineText(4, "counter");
      await page.keyboard.press("Alt+F8");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const result = state.lastEvaluation || null;
        return result ? { expression: result.expression, value: result.value, error: result.error === true } : null;
      }), { timeout: 30000 }).toEqual({ expression: "counter", value: "7", error: false });
      const evaluationResult = page.locator(".java-debug-panel.active .java-debug-evaluation-result").first();
      await expect(evaluationResult).toContainText("counter");
      await expect(evaluationResult).toContainText("7");

      await page.keyboard.press("F5");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          output: (state.consoleEntries || []).map((entry) => entry.text || "").join(""),
          lastError: state.lastError || "",
        };
      }), { timeout: 30000 }).toMatchObject({ state: "terminated", output: expect.stringContaining("7"), lastError: "" });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger shortcuts can be reassigned and reflected in the Debug menu", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await selectSettingsTab(page, "keyboard-shortcuts");

    await page.locator("#settings-shortcuts-search").fill("Step Over");
    const stepOverRow = page.locator('[data-shortcut-command="debug-step-over"]');
    await expect(stepOverRow.locator(".settings-shortcut-binding")).toHaveText("F10");
    await stepOverRow.locator('[data-shortcut-action="edit"]').first().click();
    await page.keyboard.press("Alt+F10");
    await expect(stepOverRow.locator(".settings-shortcut-binding")).toHaveText("Alt+F10");
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();

    const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}"));
    expect(savedState.keyboardShortcutOverrides["debug-step-over"]).toEqual({ key: "F10", primary: false, alt: true, shift: false });

    const debugMenu = await openDebugMenu(page);
    await expect(debugMenu.locator('[data-debug-menu-command="step-over"] .menu-shortcut-label')).toHaveText("Alt+F10");
  });
  test("Java editor context menu evaluates selections and adds watches while paused", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    System.out.println(counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-editor-context-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    async function selectTextAndOpenContextMenu(searchText, selectionText = searchText) {
      const point = await page.evaluate(({ searchText, selectionText }) => {
        const app = window.markdownViewerApp;
        const sourceText = app?.modules?.activeEditorCommands?.getActiveEditorValue?.() || "";
        const start = sourceText.indexOf(searchText);
        if (start < 0) throw new Error(`Unable to locate editor context-menu selection source: ${searchText}`);
        const end = start + selectionText.length;
        const view = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.();
        if (!view?.dispatch) throw new Error("Unable to access the active CodeMirror view.");
        view.dispatch({ selection: { anchor: start, head: end }, scrollIntoView: true });
        view.focus?.();
        const coords = view.coordsAtPos?.(start + Math.floor(selectionText.length / 2));
        if (!coords) throw new Error("Unable to locate selected editor coordinates.");
        return { x: coords.left + 4, y: (coords.top + coords.bottom) / 2 };
      }, { searchText, selectionText });
      await page.mouse.click(point.x, point.y, { button: "right" });
      if (!await page.locator("#editor-context-menu:not(.hidden)").isVisible().catch(() => false)) {
        await page.evaluate(({ x, y }) => {
          const view = window.markdownViewerApp?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.();
          const target = view?.dom?.querySelector?.(".cm-content") || view?.dom;
          if (!target) throw new Error("Unable to locate CodeMirror context-menu target.");
          target.dispatchEvent(new MouseEvent("contextmenu", {
            bubbles: true,
            cancelable: true,
            clientX: x,
            clientY: y,
            button: 2,
            buttons: 2,
          }));
        }, point);
      }
      await expect(page.locator("#editor-context-menu")).toBeVisible();
    }

    async function selectCounterAndOpenContextMenu() {
      await selectTextAndOpenContextMenu("counter);", "counter");
    }

    async function openEditorDebugSubmenu() {
      const debugButton = page.locator('#editor-context-menu:not(.hidden) .editor-context-menu-submenu > button', { hasText: "Debug" }).first();
      await expect(debugButton).toBeVisible();
      await debugButton.hover();
      return debugButton.locator("..");
    }

    async function clickEditorContextAction(actionId) {
      const action = page.locator(`#editor-context-menu:not(.hidden) [data-editor-context-action="${actionId}"]`).first();
      if (!await action.isVisible().catch(() => false)) {
        await openEditorDebugSubmenu();
      }
      await expect(action).toBeVisible();
      await expect(action).toBeEnabled();
      await action.hover();
      await action.click();
    }
    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state || "", line: state.location?.line || 0, lastError: state.lastError || "" };
      }), { timeout: 60000 }).toMatchObject({ state: "stopped-at-breakpoint", line: 4, lastError: "" });

      await selectTextAndOpenContextMenu("System.out.println(counter);");
      const rootActionOrder = await page.locator("#editor-context-menu:not(.hidden) > .editor-context-menu-items > *").evaluateAll((elements) => elements.map((element) => {
        if (element.classList.contains("editor-context-menu-divider")) return "separator";
        const button = element.matches("button") ? element : element.querySelector(":scope > button");
        return button?.querySelector("span")?.textContent?.trim() || "";
      }));
      expect(rootActionOrder.indexOf("Edit")).toBeGreaterThan(-1);
      expect(rootActionOrder.indexOf("Source")).toBeGreaterThan(-1);
      expect(rootActionOrder.indexOf("Edit")).toBeLessThan(rootActionOrder.indexOf("Source"));
      const surroundIndex = rootActionOrder.indexOf("Surround With");
      expect(rootActionOrder.slice(surroundIndex, surroundIndex + 4)).toEqual(["Surround With", "Refactor", "separator", "Debug"]);
      expect(rootActionOrder).not.toContain("Debug Demo.main()");
      expect(rootActionOrder).not.toContain("Run Demo.main()");
      await page.keyboard.press("Escape");
      await expect(page.locator("#editor-context-menu")).toBeHidden();

      await selectCounterAndOpenContextMenu();
      const debugSubmenu = await openEditorDebugSubmenu();
      for (const actionId of [
        "run-java-main",
        "debug-java-main",
        "debug-toggle-breakpoint",
        "debug-run-to-cursor",
        "debug-evaluate-selection",
        "debug-evaluate-expression",
        "debug-add-selection-watch",
      ]) {
        await expect(debugSubmenu.locator(`[data-editor-context-action="${actionId}"]`).first()).toBeVisible();
      }
      await expect(debugSubmenu.locator('[data-editor-context-action="run-java-main"]').first()).toContainText("Run Demo.main()");
      await expect(debugSubmenu.locator('[data-editor-context-action="debug-java-main"]').first()).toContainText("Debug Demo.main()");
      const debugLaunchOrder = await debugSubmenu.locator('> .editor-context-menu-submenu-panel > *').evaluateAll((elements) => elements.map((element) => element.getAttribute("data-editor-context-action") || (element.classList.contains("editor-context-menu-divider") ? "separator" : "")));
      expect(debugLaunchOrder.slice(0, 2)).toEqual(["run-java-main", "debug-java-main"]);
      await expect(debugSubmenu.locator('[data-editor-context-action="debug-toggle-breakpoint"]').first()).toContainText("Remove Breakpoint at Line 4");
      await expect(debugSubmenu.locator('[data-editor-context-action="debug-run-to-cursor"]').first()).toBeEnabled();
      await expect(page.locator('#editor-context-menu:not(.hidden) .editor-context-menu-title', { hasText: "Debugger" })).toHaveCount(0);
      await expect(page.locator('#editor-context-menu:not(.hidden) .editor-context-menu-submenu > button', { hasText: "Debugger" })).toHaveCount(0);
      for (const actionId of [
        "debug-add-conditional-breakpoint",
        "debug-add-hit-count-breakpoint",
        "debug-add-logpoint",
        "debug-edit-breakpoint",
      ]) {
        await expect(page.locator(`#editor-context-menu:not(.hidden) [data-editor-context-action="${actionId}"]`)).toHaveCount(0);
      }
      await clickEditorContextAction("debug-evaluate-selection");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          expression: state.lastEvaluation?.expression || "",
          value: state.lastEvaluation?.value || "",
        };
      }), { timeout: 30000 }).toEqual({
        state: "stopped-at-breakpoint",
        expression: "counter",
        value: "7",
      });
      await expect(page.locator(".java-debug-evaluation-result").filter({ hasText: "counter" }).first()).toContainText("7");

      await selectCounterAndOpenContextMenu();
      await clickEditorContextAction("debug-add-selection-watch");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.watches || []).map((watch) => ({
          expression: watch.expression,
          result: typeof watch.result === "object" && watch.result ? watch.result.value : watch.result || "",
          error: watch.error || "",
        }));
      }), { timeout: 30000 }).toEqual(expect.arrayContaining([
        expect.objectContaining({ expression: "counter", result: "7", error: "" }),
      ]));
      await expect(page.locator(".java-debug-pane-watches [data-watch-expression-input]").first()).toHaveValue("counter");

      await selectCounterAndOpenContextMenu();
      await clickEditorContextAction("debug-toggle-breakpoint");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints || [];
      })).toEqual([]);

      await selectCounterAndOpenContextMenu();
      await expect(page.locator('#editor-context-menu:not(.hidden) [data-editor-context-action="debug-toggle-breakpoint"]').first()).toContainText("Add Breakpoint at Line 4");
      await clickEditorContextAction("debug-toggle-breakpoint");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger inspects and copies long string values while paused", async ({ page, context }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const longText = "alpha-bravo-charlie-delta-echo-foxtrot-golf-hotel-india-juliet-kilo-lima";
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      `    String longMessage = \"${longText}\";`,
      "    System.out.println(longMessage.length());",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-inspector-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("variables");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          line: state.location?.line || 0,
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toMatchObject({
        state: "stopped-at-breakpoint",
        line: 4,
        variables: expect.arrayContaining([expect.stringContaining("longMessage:java.lang.String=")]),
        lastError: "",
      });

      const panel = page.locator(".java-debug-panel.active");
      const longMessageRow = panel.locator(".java-debug-pane-variables .java-debug-value", { hasText: "longMessage : java.lang.String" }).first();
      await expect(longMessageRow).toContainText(longText);
      await longMessageRow.locator("[data-inspect-value-id]").click();
      const inspector = panel.locator(".java-debug-inspector");
      await expect(inspector).toBeVisible();
      await expect(inspector.locator(".java-debug-inspector-meta")).toContainText("longMessage");
      await expect(inspector.locator("pre")).toContainText(longText);

      await inspector.locator(".java-debug-inspector-toolbar [data-copy-value-id]").click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain(longText);
      await inspector.locator(".java-debug-inspector-toolbar [data-copy-expression-id]").click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("longMessage");
      await inspector.locator("[data-close-inspector]").click();
      await expect(inspector).not.toBeVisible();

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger sets local field and array values while paused", async ({ page, context }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    Holder holder = new Holder(\"Ada\");",
      "    int[] numbers = new int[] {1, 2, 3};",
      "    System.out.println(counter + \" \" + holder.name + \" \" + numbers[1]);",
      "  }",
      "  static class Holder {",
      "    String name;",
      "    Holder(String name) {",
      "      this.name = name;",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-set-value-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineSix = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "6" }).first();
      await lineSix.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 6, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state, line: state.location?.line || 0, lastError: state.lastError || "" };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop before setting values: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({ state: "stopped-at-breakpoint", line: 6, lastError: "" });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => ({ name: variable.name, type: variable.type, value: variable.value }));
      }), { timeout: 30000 }).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "counter", type: "int", value: "7" }),
        expect.objectContaining({ name: "holder", type: "Demo$Holder" }),
        expect.objectContaining({ name: "numbers", type: "int[]" }),
      ]));

      const counterRow = () => page.locator(".java-debug-pane-variables .java-debug-value", { hasText: /counter : int =/ }).first();
      const variableMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      async function openCounterContextMenu() {
        if (await variableMenu.isVisible().catch(() => false)) {
          await page.keyboard.press("Escape");
          await expect(variableMenu).not.toBeVisible();
        }
        await counterRow().click({ button: "right" });
        await expect(variableMenu).toBeVisible();
        return variableMenu;
      }

      await openCounterContextMenu();
      await expect(variableMenu).toContainText("Set Value...");
      await expect(variableMenu).toContainText("Copy Value");
      await expect(variableMenu).toContainText("Copy Name");
      await expect(variableMenu).toContainText("Copy Expression");
      await expect(variableMenu).toContainText("Add to Watches");
      await expect(variableMenu).toContainText("Inspect");

      await openCounterContextMenu();
      await variableMenu.getByRole("menuitem", { name: "Copy Value" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("7");

      await openCounterContextMenu();
      await variableMenu.getByRole("menuitem", { name: "Copy Name" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("counter");

      await openCounterContextMenu();
      await variableMenu.getByRole("menuitem", { name: "Copy Expression" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("counter");

      await openCounterContextMenu();
      await variableMenu.getByRole("menuitem", { name: "Inspect" }).click();
      const inspector = page.locator(".java-debug-panel.active .java-debug-inspector");
      await expect(inspector).toBeVisible();
      await expect(inspector.locator(".java-debug-inspector-meta")).toContainText("counter");
      await expect(inspector.locator("pre")).toContainText("7");

      await openCounterContextMenu();
      await variableMenu.getByRole("menuitem", { name: "Set Value..." }).click();
      const modal = page.locator("#app-notification-modal");
      await expect(modal).toBeVisible();
      await modal.locator("[data-java-debug-set-value]").fill("42");
      await modal.locator('[data-notification-button-id="set"]').click();
      await expect(modal).not.toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state,
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        variables: expect.arrayContaining(["counter:int=42"]),
      }));
      await expect(page.locator(".java-debug-pane-variables .java-debug-value-text").filter({ hasText: "counter : int = 42" }).first()).toContainText("counter : int = 42");
      await openCounterContextMenu();
      await variableMenu.getByRole("menuitem", { name: "Add to Watches" }).click();
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.watches || []).map((watch) => ({ expression: watch.expression, result: watch.result?.value || "" }));
      }), { timeout: 30000 }).toEqual(expect.arrayContaining([
        expect.objectContaining({ expression: "counter", result: "42" }),
      ]));
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("workspace");
      });

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.setValue("holder.name", "\"Grace\"");
      });
      await expect.poll(() => page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || ""), { timeout: 30000 }).toBe("stopped-at-breakpoint");
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.evaluate("holder.name");
      });
      await expect(page.locator(".java-debug-evaluation-result").filter({ hasText: "holder.name" }).first()).toContainText("Grace");
      await expect.poll(() => page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || ""), { timeout: 30000 }).toBe("stopped-at-breakpoint");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.setValue("numbers[1]", "99");
      });
      await expect.poll(() => page.evaluate(() => window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || ""), { timeout: 30000 }).toBe("stopped-at-breakpoint");
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.evaluate("numbers[1]");
      });
      await expect(page.locator(".java-debug-evaluation-result").filter({ hasText: "numbers[1]" }).first()).toContainText("99");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger reports evaluation and set-value errors without losing paused context", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    System.out.println(counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-error-handling-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          line: state.location?.line || 0,
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        line: 4,
        variables: expect.arrayContaining(["counter:int=7"]),
        lastError: "",
      }));

      const panel = page.locator(".java-debug-panel.active");
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.evaluate("missingValue + 1");
      });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          expression: state.lastEvaluation?.expression || "",
          error: state.lastEvaluation?.error === true,
          value: state.lastEvaluation?.value || "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        expression: "missingValue + 1",
        error: true,
        value: expect.stringContaining("Unknown variable or field"),
        variables: expect.arrayContaining(["counter:int=7"]),
      }));
      await expect(panel.locator(".java-debug-evaluation-result.error").filter({ hasText: "missingValue + 1" }).first()).toContainText("Unknown variable or field");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.setValue("counter", "missingValue");
      });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).filter((entry) => entry.kind === "error").map((entry) => entry.text || "").join("\n"),
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        lastError: expect.stringContaining("Cannot set counter"),
        console: expect.stringContaining("Cannot set counter"),
        variables: expect.arrayContaining(["counter:int=7"]),
      }));
      await expect(panel.locator(".java-debug-state")).toHaveAttribute("title", /Cannot set counter/);
      await expect(panel.locator(".java-debug-pane-variables .java-debug-value-text").filter({ hasText: "counter : int = 7" }).first()).toContainText("counter : int = 7");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.evaluate("counter + 5");
      });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          expression: state.lastEvaluation?.expression || "",
          value: state.lastEvaluation?.value || "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        expression: "counter + 5",
        value: "12",
        variables: expect.arrayContaining(["counter:int=7"]),
      }));

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger shows and sets static fields while paused", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  static int staticCounter = 7;",
      "  static String staticMessage = \"alpha\";",
      "  public static void main(String[] args) {",
      "    int localCounter = staticCounter;",
      "    System.out.println(staticMessage + \" \" + localCounter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-static-fields-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineSix = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "6" }).first();
      await lineSix.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 6, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state, line: state.location?.line || 0, lastError: state.lastError || "" };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop before inspecting static fields: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({ state: "stopped-at-breakpoint", line: 6, lastError: "" });

      const panel = page.locator(".java-debug-panel.active");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => ({
          name: variable.name,
          type: variable.type,
          value: variable.value,
          kind: variable.kind,
          expression: variable.expression,
          declaringType: variable.declaringType,
        }));
      }), { timeout: 30000 }).toEqual(expect.arrayContaining([
        expect.objectContaining({ name: "staticCounter", type: "int", value: "7", kind: "static", expression: "Demo.staticCounter", declaringType: "Demo" }),
        expect.objectContaining({ name: "staticMessage", type: "java.lang.String", value: expect.stringContaining("alpha"), kind: "static", expression: "Demo.staticMessage", declaringType: "Demo" }),
      ]));
      await expect(panel.locator(".java-debug-variable-group-static h5")).toContainText("Static Fields");
      await expect(panel.locator(".java-debug-pane-variables .java-debug-value", { hasText: "staticCounter (Demo) : int = 7" }).first()).toContainText("static");
      await expect(panel.locator(".java-debug-pane-variables .java-debug-value", { hasText: "staticMessage (Demo) : java.lang.String" }).first()).toContainText("alpha");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.setValue("Demo.staticCounter", "42");
        await window.markdownViewerApp?.modules?.javaDebugSession?.setValue("staticMessage", "\"beta\"");
      });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        variables: expect.arrayContaining([
          "staticCounter:int=42",
          expect.stringContaining("staticMessage:java.lang.String=\"beta\""),
        ]),
      }));



      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger runs to cursor then resumes without losing console output", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 1;",
      "    System.out.println(\"before \" + counter);",
      "    counter = counter + 1;",
      "    System.out.println(\"middle \" + counter);",
      "    counter = counter + 1;",
      "    System.out.println(\"target \" + counter);",
      "    System.out.println(\"after \" + counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-run-to-cursor-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const firstStop = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state, reason: state.stoppedReason || "", line: state.location?.line || 0, lastError: state.lastError || "" };
      });
      if (firstStop.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop before Run to Cursor: ${JSON.stringify(firstStop, null, 2)}`);
      }
      expect(firstStop).toMatchObject({ state: "stopped-at-breakpoint", reason: "breakpoint", line: 4, lastError: "" });

      await page.evaluate(() => {
        const app = window.markdownViewerApp;
        const view = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.()
          || app?.modules?.codeMirrorEditor?.getView?.();
        if (!view?.state?.doc?.line || !view.dispatch) throw new Error("Unable to access the active CodeMirror view.");
        const line = view.state.doc.line(8);
        view.dispatch({ selection: { anchor: line.from }, scrollIntoView: true });
        view.focus?.();
      });
      await page.keyboard.press("Control+F10");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          reason: state.stoppedReason || "",
          line: state.location?.line || 0,
          lastError: state.lastError || "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      }), { timeout: 30000 }).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "run-to-cursor",
        line: 8,
        lastError: "",
        variables: expect.arrayContaining(["counter:int=3"]),
        console: expect.stringContaining("before 1"),
      });
      await expect.poll(() => page.evaluate(() => {
        const entries = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().consoleEntries || [];
        return entries.map((entry) => entry.text).join("");
      }), { timeout: 30000 }).toContain("middle 2");

      const consoleBeforeResume = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.consoleEntries || []).map((entry) => entry.text).join("");
      });
      expect(consoleBeforeResume).toContain("before 1");
      expect(consoleBeforeResume).toContain("middle 2");
      expect(consoleBeforeResume).not.toContain("target 3");

      await page.keyboard.press("F5");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("terminated");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.consoleEntries || []).map((entry) => entry.text).join("");
      }), { timeout: 30000 }).toEqual(expect.stringContaining("target 3"));
      const finalConsole = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          output: (state.consoleEntries || []).map((entry) => entry.text).join(""),
          lastError: state.lastError || "",
        };
      });
      expect(finalConsole.output).toContain("before 1");
      expect(finalConsole.output).toContain("middle 2");
      expect(finalConsole.output).toContain("target 3");
      expect(finalConsole.output).toContain("after 3");
      expect(finalConsole.lastError).toBe("");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger steps through real JVM frames and refreshes variables", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 1;",
      "    counter = add(counter, 2);",
      "    counter = counter + 5;",
      "    System.out.println(counter);",
      "  }",
      "  static int add(int value, int amount) {",
      "    int total = value + amount;",
      "    return total;",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-steps-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    async function waitForFrame(expectedMethod, expectedLine) {
      return expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || selectedThread?.frames?.[0] || null;
        return {
          state: state.state || "",
          reason: state.stoppedReason || "",
          method: selectedFrame?.method || "",
          className: selectedFrame?.className || "",
          line: state.location?.line || selectedFrame?.line || 0,
          lastError: state.lastError || "",
          variables: (state.variables || []).map((variable) => ({ name: variable.name, type: variable.type, value: variable.value })),
        };
      }), { timeout: 30000 }).toMatchObject({
        state: "paused",
        reason: "step",
        method: expectedMethod,
        line: expectedLine,
        lastError: "",
      });
    }

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state, line: state.location?.line || 0, lastError: state.lastError || "" };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop before stepping: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({ state: "stopped-at-breakpoint", line: 4, lastError: "" });

      await page.keyboard.press("F11");
      await waitForFrame("add", 9);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`);
      }), { timeout: 30000 }).toEqual(expect.arrayContaining(["value:int=1", "amount:int=2"]));
      await expect(page.locator(".java-debug-frame.active").first()).toContainText("Demo.add");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);

      await page.keyboard.press("F10");
      await waitForFrame("add", 10);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`);
      }), { timeout: 30000 }).toEqual(expect.arrayContaining(["total:int=3"]));

      await page.keyboard.press("Shift+F11");
      await waitForFrame("main", 4);

      await page.keyboard.press("F10");
      await waitForFrame("main", 5);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`);
      }), { timeout: 30000 }).toEqual(expect.arrayContaining(["counter:int=3"]));

      await page.keyboard.press("F10");
      await waitForFrame("main", 6);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`);
      }), { timeout: 30000 }).toEqual(expect.arrayContaining(["counter:int=8"]));
      await expect(page.locator(".java-debug-session-overview")).toContainText("Step complete");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger drops to a caller frame and refreshes the execution context", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 1;",
      "    counter = add(counter, 2);",
      "    counter = counter + 5;",
      "    System.out.println(counter);",
      "  }",
      "  static int add(int value, int amount) {",
      "    int total = value + amount;",
      "    return total;",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-drop-frame-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFour = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "4" }).first();
      await lineFour.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const firstStop = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state, line: state.location?.line || 0, lastError: state.lastError || "" };
      });
      if (firstStop.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop before Drop to Frame: ${JSON.stringify(firstStop, null, 2)}`);
      }
      expect(firstStop).toMatchObject({ state: "stopped-at-breakpoint", line: 4, lastError: "" });

      await page.evaluate(async () => window.markdownViewerApp?.modules?.javaDebugSession?.stepInto?.());
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || selectedThread?.frames?.[0] || null;
        return {
          state: state.state || "",
          reason: state.stoppedReason || "",
          method: selectedFrame?.method || "",
          line: state.location?.line || selectedFrame?.line || 0,
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toMatchObject({
        state: "paused",
        reason: "step",
        method: "add",
        line: 9,
        variables: expect.arrayContaining(["value:int=1", "amount:int=2"]),
      });

      const frameCapability = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const frames = (state.threads || []).flatMap((thread) => thread.frames || []);
        const topFrame = frames.find((frame) => frame.method === "add") || null;
        const callerFrame = frames.find((frame) => frame.method === "main") || null;
        return {
          topCanDrop: topFrame?.canDrop === true,
          callerCanDrop: callerFrame?.canDrop === true,
          callerFrameId: callerFrame?.id || "",
        };
      });
      expect(frameCapability.topCanDrop).toBe(false);
      expect(frameCapability.callerCanDrop).toBe(true);
      expect(frameCapability.callerFrameId).not.toBe("");
      await expect(page.locator(".java-debug-frame", { hasText: "Demo.main" }).first()).toContainText("Drop to Frame available");

      await page.evaluate(async (frameId) => {
        const session = window.markdownViewerApp?.modules?.javaDebugSession;
        await session.selectFrame(frameId);
        await session.dropToFrame(frameId);
      }, frameCapability.callerFrameId);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || selectedThread?.frames?.[0] || null;
        return {
          state: state.state || "",
          method: selectedFrame?.method || "",
          line: state.location?.line || selectedFrame?.line || 0,
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          lastError: state.lastError || "",
        };
      }), { timeout: 30000 }).toMatchObject({
        state: "paused",
        method: "main",
        line: 4,
        variables: expect.arrayContaining(["counter:int=1"]),
        lastError: "",
      });
      await expect(page.locator(".java-debug-frame.active").first()).toContainText("Demo.main");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java stack frame context menu copies stack and evaluates from selected frames", async ({ page, context }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int result = middle(5);",
      '    System.out.println("result " + result);',
      "  }",
      "  static int middle(int input) {",
      "    return leaf(input + 1);",
      "  }",
      "  static int leaf(int seed) {",
      "    int total = seed * 2;",
      "    return total;",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-stack-context-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    async function openFrameContextMenu(frameText) {
      const panel = page.locator(".java-debug-panel.active");
      const frame = panel.locator(".java-debug-frame", { hasText: frameText }).first();
      await expect(frame).toBeVisible();
      await frame.click({ button: "right" });
      const menu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(menu).toBeVisible();
      return menu;
    }

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineTen = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "10" }).first();
      await lineTen.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 10, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("stack");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { state: state.state || "", line: state.location?.line || 0, lastError: state.lastError || "" };
      }), { timeout: 60000 }).toEqual({ state: "stopped-at-breakpoint", line: 10, lastError: "" });
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("stack");
      });

      let menu = await openFrameContextMenu("Demo.leaf");
      await menu.getByRole("menuitem", { name: /Copy Stack/ }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain('at Demo.leaf(Demo.java:10)');
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain('at Demo.middle(Demo.java:7)');
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain('at Demo.main(Demo.java:3)');

      menu = await openFrameContextMenu("Demo.middle");
      await menu.getByRole("menuitem", { name: /Evaluate Expression/ }).click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="expressions"]')).toHaveClass(/active/);
      await expect(panel.locator(".java-debug-expression-panel")).toContainText("Demo.middle");
      await panel.locator("[data-debug-expression]").fill("input");
      await panel.locator('[data-debug-action="evaluate"]').click();
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          expression: state.lastEvaluation?.expression || "",
          value: state.lastEvaluation?.value || "",
          frameMethod: state.threads?.flatMap((thread) => thread.frames || []).find((frame) => frame.id === state.selectedFrameId)?.method || "",
        };
      }), { timeout: 30000 }).toEqual({ expression: "input", value: "5", frameMethod: "middle" });

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger pauses a running JVM and resumes cleanly", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  static volatile long sink = 0;",
      "  public static void main(String[] args) {",
      "    long end = System.currentTimeMillis() + 12000L;",
      "    while (System.currentTimeMillis() < end) {",
      "      sink += work(3);",
      "    }",
      "    System.out.println(\"done \" + sink);",
      "  }",
      "  static long work(long value) {",
      "    long total = value;",
      "    for (int index = 0; index < 1000; index++) {",
      "      total += index;",
      "    }",
      "    return total;",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-pause-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("running");
      await page.keyboard.press("F6");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const threads = state.threads || [];
        const frames = threads.flatMap((thread) => thread.frames || []);
        return state.state === "paused"
          && state.stoppedReason === "pause"
          && threads.length > 0
          && threads.some((thread) => thread.suspended === true)
          && Boolean(state.selectedFrameId)
          && frames.some((frame) => frame.className === "Demo")
          && !state.lastError;
      }), { timeout: 30000 }).toBe(true);
      const pausedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          threadCount: (state.threads || []).length,
          suspendedThreads: (state.threads || []).filter((thread) => thread.suspended === true).length,
          selectedFrameId: state.selectedFrameId || "",
          frames: (state.threads || []).flatMap((thread) => thread.frames || []).map((frame) => `${frame.className}.${frame.method}:${frame.line}`),
        };
      });
      expect(pausedState.threadCount).toBeGreaterThan(0);
      expect(pausedState.suspendedThreads).toBeGreaterThan(0);
      expect(pausedState.selectedFrameId).not.toBe("");
      expect(pausedState.frames.some((frame) => frame.startsWith("Demo."))).toBe(true);
      await expect(page.locator(".java-debug-session-overview")).toContainText("Paused");

      await page.keyboard.press("F5");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 10000 }).toBe("running");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 15000 }).toBe("terminated");
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.consoleEntries || []).map((entry) => entry.text).join("");
      }), { timeout: 10000 }).toContain("done ");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger shows and switches between suspended application threads", async ({ page, context }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  static volatile boolean workerReady = false;",
      "  static volatile boolean release = false;",
      "  public static void main(String[] args) throws Exception {",
      "    int mainToken = 7;",
      "    Thread worker = new Thread(Demo::workerLoop, \"worker-debug\");",
      "    worker.start();",
      "    while (!workerReady) {",
      "      Thread.sleep(10L);",
      "    }",
      "    while (!release) {",
      "      Thread.sleep(10L);",
      "    }",
      "    System.out.println(\"main \" + mainToken);",
      "  }",
      "  static void workerLoop() {",
      "    int workerToken = 42;",
      "    workerReady = true;",
      "    System.out.println(\"worker \" + workerToken);",
      "    while (!release) {",
      "      sleepQuietly();",
      "    }",
      "  }",
      "  static void sleepQuietly() {",
      "    try { Thread.sleep(10L); } catch (InterruptedException ignored) {}",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-threads-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineNineteen = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "19" }).first();
      await lineNineteen.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 19, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const threads = state.threads || [];
        const selectedThread = threads.find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || null;
        return {
          state: state.state,
          reason: state.stoppedReason || "",
          line: state.location?.line || 0,
          selectedThread: selectedThread?.name || "",
          selectedFrame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          threadNames: threads.map((thread) => thread.name),
          appFrames: threads.flatMap((thread) => (thread.frames || []).map((frame) => `${thread.name}:${frame.className}.${frame.method}:${frame.line}`)),
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          lastError: state.lastError || "",
        };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop at the worker breakpoint: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "breakpoint",
        line: 19,
        selectedThread: "worker-debug",
        selectedFrame: "Demo.workerLoop",
        lastError: "",
      });
      expect(stoppedState.threadNames).toEqual(expect.arrayContaining(["main", "worker-debug"]));
      expect(stoppedState.appFrames).toEqual(expect.arrayContaining([
        expect.stringContaining("worker-debug:Demo.workerLoop:19"),
        expect.stringContaining("main:Demo.main:"),
      ]));
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || null;
        return {
          thread: selectedThread?.name || "",
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toMatchObject({
        thread: "worker-debug",
        frame: "Demo.workerLoop",
        variables: expect.arrayContaining(["workerToken:int=42"]),
      });

      const panel = page.locator(".java-debug-panel.active");
      await expect(panel.locator(".java-debug-pane-threads")).toContainText("worker-debug");
      await expect(panel.locator(".java-debug-pane-threads")).toContainText("main");
      const workerThread = panel.locator(".java-debug-pane-threads .java-debug-thread-card", { hasText: "worker-debug" }).first();
      const workerEntry = panel.locator(".java-debug-pane-threads .java-debug-thread-entry", { hasText: "worker-debug" }).first();
      await expect(workerThread).toBeVisible();
      await workerThread.click({ button: "right" });
      let threadMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(threadMenu).toBeVisible();
      await expect(threadMenu.getByRole("menuitem", { name: "Select Thread" })).toBeVisible();
      await expect(threadMenu.getByRole("menuitem", { name: "Show Call Stack" })).toBeVisible();
      await expect(threadMenu.getByRole("menuitem", { name: "Collapse Stack" })).toBeVisible();
      await threadMenu.getByRole("menuitem", { name: "Copy Stack" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain('Thread "worker-debug"');
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain("at Demo.workerLoop(Demo.java:19)");

      await workerThread.click({ button: "right" });
      threadMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      await threadMenu.getByRole("menuitem", { name: "Collapse Stack" }).click();
      await expect(workerEntry.locator(".java-debug-thread-frame", { hasText: "Demo.workerLoop" })).not.toBeVisible();
      await workerThread.click({ button: "right" });
      threadMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(threadMenu.getByRole("menuitem", { name: "Expand Stack" })).toBeVisible();
      await threadMenu.getByRole("menuitem", { name: "Expand Stack" }).click();
      await expect(workerEntry.locator(".java-debug-thread-frame", { hasText: "Demo.workerLoop" })).toBeVisible();

      const mainThread = panel.locator(".java-debug-pane-threads .java-debug-thread-card", { hasText: "main" }).first();
      await expect(mainThread).toBeVisible();
      await mainThread.click({ button: "right" });
      threadMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(threadMenu).toBeVisible();
      await threadMenu.getByRole("menuitem", { name: "Show Call Stack" }).click();
      await expect(page.locator('#java-debug-left-perspective [data-debug-pane="stack"]')).toBeVisible();
      await panel.locator(".java-debug-frame", { hasText: "Demo.main" }).first().click();
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || null;
        return {
          thread: selectedThread?.name || "",
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
        };
      }), { timeout: 30000 }).toMatchObject({
        thread: "main",
        frame: "Demo.main",
        variables: expect.arrayContaining(["mainToken:int=7"]),
      });
      await expect(panel.locator(".java-debug-frame-context").first()).toContainText("main");
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("workspace");
      });
      await expect(panel.locator(".java-debug-pane-variables .java-debug-value-text").filter({ hasText: "mainToken : int = 7" }).first()).toContainText("mainToken : int = 7");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debug console sends stdin to the running JVM", async ({ page, context }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "import java.io.BufferedReader;",
      "import java.io.InputStreamReader;",
      "public class Demo {",
      "  public static void main(String[] args) throws Exception {",
      "    System.out.println(\"name?\");",
      "    BufferedReader reader = new BufferedReader(new InputStreamReader(System.in));",
      "    String name = reader.readLine();",
      "    System.out.println(\"Hello \" + name);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-stdin-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          canAcceptStdin: state.canAcceptStdin === true,
          console: (state.consoleEntries || []).map((entry) => entry.text).join(""),
        };
      }), { timeout: 30000 }).toMatchObject({
        state: "running",
        canAcceptStdin: true,
        console: expect.stringContaining("name?"),
      });

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugPanel?.openView?.("console");
      });
      await expect(page.locator('[data-bottom-panel-tab-id="java-debug-console"]')).toHaveClass(/active/);
      const consoleInput = page.locator(".java-debug-panel.active [data-debug-stdin]").first();
      await expect(consoleInput).toBeEnabled();
      await expect(consoleInput).toBeVisible();
      await expect(consoleInput).toBeFocused();
      const interactiveConsolePanel = page.locator(".java-debug-panel.active .java-debug-console").first();
      await expect(interactiveConsolePanel.locator("[data-debug-expression]")).toHaveCount(0);
      await expect(interactiveConsolePanel.locator(".java-debug-console-evaluation")).toHaveCount(0);
      const inputBox = await consoleInput.boundingBox();
      const panelBox = await interactiveConsolePanel.boundingBox();
      expect(inputBox).toBeTruthy();
      expect(panelBox).toBeTruthy();
      expect(inputBox.y + inputBox.height).toBeLessThanOrEqual(panelBox.y + panelBox.height + 1);
      await consoleInput.fill("Ada");
      await consoleInput.press("Enter");
      await expect(consoleInput).toHaveValue("");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("terminated");
      const finalConsole = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          canAcceptStdin: state.canAcceptStdin === true,
          entries: (state.consoleEntries || []).map((entry) => ({ kind: entry.kind, text: entry.text })),
          output: (state.consoleEntries || []).map((entry) => entry.text).join(""),
          lastError: state.lastError || "",
        };
      });
      expect(finalConsole.canAcceptStdin).toBe(false);
      expect(finalConsole.entries).toEqual(expect.arrayContaining([
        expect.objectContaining({ kind: "stdin", text: expect.stringContaining("Ada") }),
        expect.objectContaining({ kind: "stdout", text: expect.stringContaining("Hello Ada") }),
      ]));
      expect(finalConsole.output).toContain("name?");
      expect(finalConsole.output).toContain("Hello Ada");
      expect(finalConsole.lastError).toBe("");

      await page.locator(".java-debug-panel.active [data-debug-action=\"copy-console\"]").click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain("Hello Ada");
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toContain("Ada");
      await page.locator(".java-debug-panel.active [data-debug-action=\"select-console\"]").click();
      const selectedConsole = await page.evaluate(() => window.getSelection()?.toString() || "");
      expect(selectedConsole).toContain("name?");
      expect(selectedConsole).toContain("Hello Ada");

      const consolePanel = page.locator(".java-debug-panel.active .java-debug-console").first();
      const consoleOutput = consolePanel.locator("[data-debug-console-output]");
      const consoleSearch = consolePanel.locator("[data-debug-console-search]");
      await consoleSearch.click();
      await consoleSearch.pressSequentially("Hello");
      await expect(consoleSearch).toBeFocused();
      await expect(consoleSearch).toHaveValue("Hello");
      await expect(consoleOutput.locator("mark")).toContainText("Hello");
      await consoleSearch.fill("");

      const autoScrollToggle = consolePanel.locator("[data-debug-console-autoscroll]");
      await expect(autoScrollToggle).toBeChecked();
      await autoScrollToggle.uncheck();
      await expect(autoScrollToggle).not.toBeChecked();
      await autoScrollToggle.check();
      await expect(autoScrollToggle).toBeChecked();

      await consolePanel.locator('[data-debug-console-filter="stdout"]').click();
      await expect(consoleOutput).not.toContainText("Hello Ada");
      await expect(consoleOutput).toContainText("Ada");
      await consolePanel.locator('[data-debug-console-filter="all"]').click();
      await expect(consoleOutput).toContainText("Hello Ada");

      await consolePanel.locator('[data-debug-action="clear-console"]').click();
      await expect(consoleOutput).toContainText("No debug console output yet.");
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().consoleEntries?.length || 0;
      })).toBe(0);

    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger reports missing configured main class without app error overlay", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "package com.example;",
      "public class MainApp {",
      "  public static void main(String[] args) {",
      "    System.out.println(\"hello\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/com/example/MainApp.java": source,
    }, "md-editor-java-debugger-missing-main-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/com/example/MainApp.java");
      const configuration = await page.evaluate(async () => {
        const store = window.markdownViewerApp?.modules?.runConfigurationStore;
        const draft = {
          id: "missing-main-debug-test",
          name: "Missing Main Debug Test",
          type: "java-application",
          java: { mainClass: "com.test.example.MainApp", programArguments: "", vmArguments: "" },
          buildBeforeLaunch: false,
        };
        await store?.upsert?.(draft);
        await store?.setActive?.(draft.id);
        return store?.getActive?.();
      });
      expect(configuration?.java?.mainClass).toBe("com.test.example.MainApp");

      const result = await page.evaluate(async () => {
        const app = window.markdownViewerApp;
        return app.modules.javaDebugSession.start(app.modules.runConfigurationStore.getActive());
      });
      expect(result).toBe(false);
      await expect(page.locator("#app-error-overlay, .app-error-overlay, [data-app-error-overlay]")).toHaveCount(0);
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).filter((entry) => entry.kind === "error").map((entry) => entry.text || "").join("\n"),
          threads: (state.threads || []).length,
          variables: (state.variables || []).length,
        };
      }), { timeout: 10000 }).toMatchObject({
        state: "failed",
        lastError: expect.stringContaining("was not found in the configured source roots"),
        console: expect.stringContaining("was not found in the configured source roots"),
        threads: 0,
        variables: 0,
      });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java debugger reports failed JDWP attach without stale runtime state", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    System.out.println(\"attach failure\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-attach-failure-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      const closedPort = await findAvailablePort();

      await page.evaluate(async (port) => {
        const app = window.markdownViewerApp;
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.attach("127.0.0.1", String(port));
      }, closedPort);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          threads: (state.threads || []).length,
          variables: (state.variables || []).length,
          canAcceptStdin: state.canAcceptStdin === true,
        };
      }), { timeout: 30000 }).toMatchObject({
        state: "failed",
        threads: 0,
        variables: 0,
        canAcceptStdin: false,
      });
      const failedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      });
      expect(failedState.lastError).toMatch(/attach|connect|refused|transport|handshake|timed out/i);
      expect(failedState.console).toContain("error:");
      expect(failedState.console).toContain(failedState.lastError);

      await expect(page.locator(".java-debug-panel.active .java-debug-state-failed")).toContainText("Failed");
      await expect(page.locator(".java-debug-panel.active .java-debug-error")).toContainText(failedState.lastError);
      await expect(page.locator(".java-debug-panel.active .java-debug-pane-stack")).toContainText("No stack frames");
      await expect(page.locator(".java-debug-panel.active .java-debug-pane-variables")).toContainText("No variables");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger attaches to a JDWP JVM and hits source breakpoints", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) throws Exception {",
      "    System.out.println(\"ready\");",
      "    Thread.sleep(20000L);",
      "    int counter = 11;",
      "    String message = \"attached\";",
      "    System.out.println(message + \" \" + counter);",
      "    System.out.println(\"finished\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-attach-");
    const classesPath = path.join(folderPath, "stale-classes");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.mkdir(classesPath, { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    let debuggee = null;
    const debuggeeOutput = { stdout: "", stderr: "" };
    try {
      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await execFileAsync(jdkToolPath(jdkHome, "javac"), ["-g:lines,vars,source", "-d", classesPath, javaFilePath], { windowsHide: true });
      const port = await findAvailablePort();
      debuggee = spawn(jdkToolPath(jdkHome, "java"), [
        `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=127.0.0.1:${port}`,
        "-cp",
        classesPath,
        "Demo",
      ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      debuggee.stdout.on("data", (chunk) => { debuggeeOutput.stdout += String(chunk || ""); });
      debuggee.stderr.on("data", (chunk) => { debuggeeOutput.stderr += String(chunk || ""); });
      await waitForDebuggeeListening(debuggee);
      await expect.poll(() => debuggeeOutput.stdout, { timeout: 10000 }).toContain("ready");

      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineSeven = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "7" }).first();
      await lineSeven.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 7, enabled: true }]);

      const debugMenu = await openDebugMenu(page);
      const attachButton = debugMenu.locator('[data-debug-menu-command="attach"]');
      await expect(attachButton).toBeVisible();
      await expect(attachButton).toBeEnabled();
      await attachButton.click();
      const attachModal = page.locator("#app-notification-modal");
      await expect(attachModal).toBeVisible();
      await expect(attachModal).toContainText("Attach to JVM");
      await expect(attachModal.locator("[data-java-debug-attach-host]")).toBeFocused();
      await attachModal.locator("[data-java-debug-attach-host]").fill("127.0.0.1");
      await attachModal.locator('input[type="number"]').fill(String(port));
      await attachModal.locator('[data-notification-button-id="attach"]').click();
      await expect(attachModal).not.toBeVisible();
      await expect(page.locator('#java-debug-left-perspective')).toBeVisible();
      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && Number(state.location?.line || 0) > 0) || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedThread = (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === state.selectedFrameId)) || null;
        const selectedFrame = selectedThread?.frames?.find((frame) => frame.id === state.selectedFrameId) || selectedThread?.frames?.[0] || null;
        return {
          state: state.state,
          reason: state.stoppedReason || "",
          line: state.location?.line || 0,
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          lastError: state.lastError || "",
        };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Attached debugger did not stop at the breakpoint: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "breakpoint",
        line: 7,
        frame: "Demo.main",
        lastError: "",
      });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`);
      }), { timeout: 30000 }).toEqual(expect.arrayContaining(["counter:int=11"]));
      await expect(page.locator(".java-debug-session-overview")).toContainText("Stopped at breakpoint");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.resume?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("terminated");
      await waitForProcessExit(debuggee);
      expect(debuggeeOutput.stdout).toContain("attached 11");
      expect(debuggeeOutput.stdout).toContain("finished");
    } finally {
      if (debuggee && debuggee.exitCode === null) debuggee.kill();
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debugger reports stale source when loaded bytecode has no matching line", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const compiledSource = [
      "public class Demo {",
      "  public static void main(String[] args) throws Exception {",
      "    System.out.println(\"ready\");",
      "    Thread.sleep(60000L);",
      "    System.out.println(\"compiled\");",
      "  }",
      "}",
    ].join("\n");
    const editorSource = [
      "public class Demo {",
      "  public static void main(String[] args) throws Exception {",
      "    System.out.println(\"ready\");",
      "    Thread.sleep(60000L);",
      "    System.out.println(\"compiled\");",
      "    int addedAfterCompile = 42;",
      "    System.out.println(addedAfterCompile);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": compiledSource,
    }, "md-editor-java-debugger-stale-source-");
    const classesPath = path.join(folderPath, "stale-classes");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.mkdir(classesPath, { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    let debuggee = null;
    const debuggeeOutput = { stdout: "", stderr: "" };
    try {
      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await execFileAsync(jdkToolPath(jdkHome, "javac"), ["-g:lines,vars,source", "-d", classesPath, javaFilePath], { windowsHide: true });
      await fs.writeFile(javaFilePath, editorSource, "utf8");
      const port = await findAvailablePort();
      debuggee = spawn(jdkToolPath(jdkHome, "java"), [
        `-agentlib:jdwp=transport=dt_socket,server=y,suspend=n,address=127.0.0.1:${port}`,
        "-cp",
        classesPath,
        "Demo",
      ], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
      debuggee.stdout.on("data", (chunk) => { debuggeeOutput.stdout += String(chunk || ""); });
      debuggee.stderr.on("data", (chunk) => { debuggeeOutput.stderr += String(chunk || ""); });
      await waitForDebuggeeListening(debuggee);
      await expect.poll(() => debuggeeOutput.stdout, { timeout: 10000 }).toContain("ready");

      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      await page.evaluate(async (attachPort) => {
        const app = window.markdownViewerApp;
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugPanel.openView("breakpoints");
        await app.modules.javaDebugSession.attach("127.0.0.1", String(attachPort));
      }, port);
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("running");

      const lineSeven = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "7" }).first();
      await lineSeven.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 7, enabled: true }]);
      await expect.poll(() => page.evaluate(() => {
        const breakpoint = (window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints || [])
          .find((item) => item.line === 7);
        return breakpoint ? { verified: breakpoint.verified === true, message: breakpoint.message || "" } : null;
      }), { timeout: 30000 }).toEqual({
        verified: false,
        message: expect.stringContaining("running bytecode may be out of date"),
      });
      await expect(page.locator(".java-debug-breakpoint[data-breakpoint-line='7']").first()).toContainText("running bytecode may be out of date");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      }), { timeout: 30000 }).toBe("terminated");
    } finally {
      if (debuggee && debuggee.exitCode === null) debuggee.kill();
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java breakpoint gutter toggles line breakpoints without a line-number prompt", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    System.out.println(\"debug me\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-ui-");

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineThree = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "3" }).first();
      await expect(lineThree).toHaveAttribute("title", /Line 3\. Double-click to toggle breakpoint\. Single-click to add bookmark\. Right-click for more options\./);
      await lineThree.click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 3, enabled: true }]);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(1);

      await lineThree.click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints || [];
      })).toEqual([]);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(0);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java breakpoint gutter ignores invalid source lines", async ({ page }) => {
    const source = [
      "package demo;",
      "",
      "// comment only",
      "public class Demo {",
      "  private String name;",
      "  public static void main(String[] args) {",
      "    System.out.println(\"debug me\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/demo/Demo.java": source,
    }, "md-editor-java-debugger-invalid-breakpoint-lines-");

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/demo/Demo.java");

      const lineNumber = (line) => page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: String(line) }).first();
      await expect(lineNumber(5)).toHaveAttribute("title", /Line 5\. Single-click to add bookmark\. Right-click for more options\./);
      await expect(page.locator('.cm-navigationMarker[data-navigation-marker-line="5"] .cm-debugBreakpointEmptyMarker')).toHaveCount(0);

      for (const invalidLine of [1, 2, 3, 4, 5, 6, 8]) {
        await lineNumber(invalidLine).dblclick();
        await expect.poll(() => page.evaluate(() => {
          return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints || [];
        })).toEqual([]);
      }

      await lineNumber(7).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 7, enabled: true }]);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java debug gutter keeps execution-line markers sorted before later breakpoints", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int first = 1;",
      "    int current = first + 1;",
      "    int later = current + 1;",
      "    System.out.println(later);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-gutter-sort-");

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      await page.evaluate(() => {
        const commands = window.markdownViewerApp?.modules?.activeEditorCommands;
        if (!commands?.setActiveEditorDebugBreakpoints || !commands?.setActiveEditorDebugExecutionLine) {
          throw new Error("Active editor debug marker commands are unavailable");
        }
        commands.setActiveEditorDebugBreakpoints([{ line: 6, enabled: true }]);
        commands.setActiveEditorDebugExecutionLine(4);
      });

      await expect(page.locator('.cm-navigationMarker[data-navigation-marker-line="4"] .cm-debugExecutionLineMarker')).toHaveCount(1);
      await expect(page.locator('.cm-navigationMarker[data-navigation-marker-line="6"] .cm-debugBreakpointMarker-enabled')).toHaveCount(1);
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java gutter uses one compact marker lane beside separate line-number and fold gutters", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    System.out.println(\"combined marker lane\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-compact-gutter-");

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      await expect(page.locator(".cm-navigationMarkerGutter")).toHaveCount(1);
      await expect(page.locator(".cm-findLineBookmarkGutter")).toHaveCount(0);
      await expect(page.locator(".cm-lineNumbers")).toBeVisible();
      await expect(page.locator(".cm-foldGutter")).toBeVisible();

      const gutterMetrics = await page.evaluate(() => {
        const rect = (selector) => document.querySelector(selector)?.getBoundingClientRect();
        const nav = rect(".cm-navigationMarkerGutter");
        const lines = rect(".cm-lineNumbers");
        const fold = rect(".cm-foldGutter");
        return {
          navBeforeLines: !!nav && !!lines && nav.left <= lines.left,
          linesBeforeFold: !!lines && !!fold && lines.left <= fold.left,
          navWidth: nav?.width || 0,
          lineWidth: lines?.width || 0,
          foldWidth: fold?.width || 0,
          lineToFoldGap: !!lines && !!fold ? Math.max(0, fold.left - lines.right) : 999
        };
      });
      expect(gutterMetrics.navBeforeLines).toBe(true);
      expect(gutterMetrics.linesBeforeFold).toBe(true);
      expect(gutterMetrics.navWidth).toBeLessThanOrEqual(22);
      expect(gutterMetrics.lineWidth).toBeGreaterThan(0);
      expect(gutterMetrics.foldWidth).toBeGreaterThan(0);
      expect(gutterMetrics.lineToFoldGap).toBeLessThanOrEqual(4);

      await page.locator('.cm-navigationMarker [data-bookmark-line="3"]').first().evaluate((element) => {
        element.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, cancelable: true, button: 0 }));
      });
      await page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "3" }).first().click();
      const lineThreeMarker = page.locator('.cm-navigationMarker[data-navigation-marker-line="3"]');
      await expect(lineThreeMarker.locator(".cm-findLineBookmarkMarker")).toHaveCount(1);
      await expect(lineThreeMarker.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(1);
      await expect(lineThreeMarker).toHaveAttribute("title", /Multiple markers at this line/);

      await lineThreeMarker.click({ button: "right" });
      const gutterMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(gutterMenu).toBeVisible();
      await expect(gutterMenu.locator(":scope > .java-debug-context-menu-submenu > .java-debug-context-menu-submenu-button", { hasText: "Breakpoints" })).toBeVisible();
      await expect(gutterMenu.locator(":scope > .java-debug-context-menu-submenu > .java-debug-context-menu-submenu-button", { hasText: "Bookmarks" })).toBeVisible();
      await expect(gutterMenu.locator(":scope > .java-debug-context-menu-submenu > .java-debug-context-menu-submenu-button", { hasText: "Folding" })).toBeVisible();

      const breakpointsSubmenu = gutterMenu.locator(".java-debug-context-menu-submenu", { hasText: "Breakpoints" }).first();
      await breakpointsSubmenu.locator(".java-debug-context-menu-submenu-button").hover();
      await expect(breakpointsSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Breakpoint Properties");
      await expect(breakpointsSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Show Breakpoints");

      const bookmarksSubmenu = gutterMenu.locator(".java-debug-context-menu-submenu", { hasText: "Bookmarks" }).first();
      await bookmarksSubmenu.locator(".java-debug-context-menu-submenu-button").hover();
      await expect(bookmarksSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Remove Bookmark");
      await expect(bookmarksSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Cut bookmarked lines");
      await expect(bookmarksSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Copy bookmarked lines");
      await expect(bookmarksSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Delete bookmarked lines");
      await expect(bookmarksSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Clear all bookmarks");

      const foldingSubmenu = gutterMenu.locator(".java-debug-context-menu-submenu", { hasText: "Folding" }).first();
      await foldingSubmenu.locator(".java-debug-context-menu-submenu-button").hover();
      await expect(foldingSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Collapse All Folds");
      await expect(foldingSubmenu.locator(".java-debug-context-menu-submenu-panel")).toContainText("Expand All Folds");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java gutter breakpoints persist after reopening the project", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    System.out.println(\"persist me\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-persist-");

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineThree = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "3" }).first();
      await lineThree.click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 3, enabled: true }]);

      await page.reload();
      await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.activeEditorCommands?.getActiveEditorValue === "function");
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 3, enabled: true }]);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(1);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java watch expressions persist after reopening the project", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    String message = \"watch me\";",
      "    System.out.println(message);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-watch-");

    async function openWatchesPane() {
      const debugMenu = await openDebugMenu(page);
      await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="watches"]').click();
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="watches"]')).toHaveClass(/active/);
      await expect(panel.locator("[data-watch-add-input]")).toBeVisible();
      return panel;
    }

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      let panel = await openWatchesPane();

      await panel.locator("[data-watch-add-input]").fill("message");
      await panel.locator("[data-watch-add-submit]").click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches
          ?.map((watch) => ({ expression: watch.expression, enabled: watch.enabled !== false })) || [];
      })).toEqual([{ expression: "message", enabled: true }]);
      await expect(panel.locator('[data-watch-expression-input]')).toHaveValue("message");

      await page.reload();
      await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.activeEditorCommands?.getActiveEditorValue === "function");
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      panel = await openWatchesPane();

      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches
          ?.map((watch) => ({ expression: watch.expression, enabled: watch.enabled !== false })) || [];
      })).toEqual([{ expression: "message", enabled: true }]);
      await expect(panel.locator('[data-watch-expression-input]')).toHaveValue("message");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java Watches pane manages errors edits disable remove and expandable results while paused", async ({ page, context }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    Holder holder = new Holder(\"Ada\", 3);",
      "    System.out.println(counter + \" \" + holder.name);",
      "  }",
      "  static class Holder {",
      "    String name;",
      "    int count;",
      "    Holder(String name, int count) {",
      "      this.name = name;",
      "      this.count = count;",
      "    }",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-watch-management-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      const lineFive = page.locator(".cm-editor.cm-debugBreakpointLineNumbersActive .cm-lineNumbers .cm-gutterElement", { hasText: "5" }).first();
      await lineFive.dblclick();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 5, enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          line: state.location?.line || 0,
          variables: (state.variables || []).map((variable) => `${variable.name}:${variable.type}=${variable.value}`),
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toEqual(expect.objectContaining({
        state: "stopped-at-breakpoint",
        line: 5,
        variables: expect.arrayContaining(["counter:int=7"]),
        lastError: "",
      }));

      const panel = page.locator(".java-debug-panel.active");
      const watchesPane = panel;
      const watchMenu = page.locator(".java-debug-context-menu:not(.hidden)");
      async function openWatchContextMenu() {
        if (await watchMenu.isVisible().catch(() => false)) {
          await page.keyboard.press("Escape");
          await expect(watchMenu).not.toBeVisible();
        }
        const row = watchesPane.locator(".java-debug-watch[data-watch-row-id]").first();
        await expect(row).toBeVisible();
        await row.click({ button: "right" });
        await expect(watchMenu).toBeVisible();
        return watchMenu;
      }
      await expect(watchesPane.locator("[data-watch-add-input]")).toBeVisible();
      await watchesPane.locator("[data-watch-add-input]").fill("missingValue");
      await watchesPane.locator("[data-watch-add-submit]").click();
      await expect.poll(() => page.evaluate(() => {
        const watches = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches || [];
        return watches.map((watch) => ({
          expression: watch.expression,
          enabled: watch.enabled !== false,
          error: watch.result?.error === true,
          value: watch.result?.value || "",
        }));
      }), { timeout: 30000 }).toEqual([
        expect.objectContaining({
          expression: "missingValue",
          enabled: true,
          error: true,
          value: expect.stringContaining("Unknown variable or field"),
        }),
      ]);
      await expect(watchesPane.locator(".java-debug-watch.error").first()).toContainText("Unknown variable or field");

      let menu = await openWatchContextMenu();
      await expect(menu).toContainText("Evaluate Now");
      await expect(menu).toContainText("Disable Watch");
      await expect(menu).toContainText("Edit Watch");
      await expect(menu).toContainText("Copy Expression");
      await expect(menu).toContainText("Copy Result");
      await expect(menu).toContainText("Inspect Result");
      await expect(menu).toContainText("Remove Watch");
      await menu.getByRole("menuitem", { name: "Evaluate Now" }).click();
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { expression: state.lastEvaluation?.expression || "", error: state.lastEvaluation?.error === true, value: state.lastEvaluation?.value || "" };
      }), { timeout: 30000 }).toEqual({ expression: "missingValue", error: true, value: expect.stringContaining("Unknown variable or field") });

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Copy Expression" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("missingValue");

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Edit Watch" }).click();
      const watchInput = watchesPane.locator("[data-watch-expression-input]").first();
      await expect(watchInput).toBeFocused();
      await watchInput.fill("counter + 5");
      await watchInput.press("Enter");
      await expect.poll(() => page.evaluate(() => {
        const watches = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches || [];
        return watches.map((watch) => ({
          expression: watch.expression,
          enabled: watch.enabled !== false,
          error: watch.result?.error === true,
          value: watch.result?.value || "",
        }));
      }), { timeout: 30000 }).toEqual([
        expect.objectContaining({ expression: "counter + 5", enabled: true, error: false, value: "12" }),
      ]);
      await expect(watchesPane.locator(".java-debug-watch-result").first()).toContainText("12");

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Copy Result" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("int = 12");

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Inspect Result" }).click();
      const inspector = page.locator(".java-debug-panel.active .java-debug-inspector");
      await expect(inspector).toBeVisible();
      await expect(inspector.locator(".java-debug-inspector-meta")).toContainText("counter + 5");
      await expect(inspector.locator("pre")).toContainText("12");

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Disable Watch" }).click();
      await expect.poll(() => page.evaluate(() => {
        const watch = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches?.[0] || null;
        return watch ? { expression: watch.expression, enabled: watch.enabled !== false } : null;
      }), { timeout: 30000 }).toEqual({ expression: "counter + 5", enabled: false });
      await expect(watchesPane.locator(".java-debug-watch-result").first()).toContainText("disabled");

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Enable Watch" }).click();
      await expect.poll(() => page.evaluate(() => {
        const watch = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches?.[0] || null;
        return watch ? { expression: watch.expression, enabled: watch.enabled !== false, value: watch.result?.value || "" } : null;
      }), { timeout: 30000 }).toEqual({ expression: "counter + 5", enabled: true, value: "12" });

      menu = await openWatchContextMenu();
      await menu.getByRole("menuitem", { name: "Remove Watch" }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches?.length || 0;
      }), { timeout: 30000 }).toBe(0);

      await watchesPane.locator("[data-watch-add-input]").fill("holder");
      await watchesPane.locator("[data-watch-add-submit]").click();
      await expect.poll(() => page.evaluate(() => {
        const watch = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches?.[0] || null;
        return watch ? {
          expression: watch.expression,
          type: watch.result?.type || "",
          expandable: watch.result?.expandable === true,
          objectId: watch.result?.objectId || "",
        } : null;
      }), { timeout: 30000 }).toEqual(expect.objectContaining({
        expression: "holder",
        type: "Demo$Holder",
        expandable: true,
        objectId: expect.any(String),
      }));
      await watchesPane.locator("[data-watch-expand]").first().click();
      await expect.poll(() => page.evaluate(() => {
        const watch = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().watches?.[0] || null;
        return (watch?.result?.children || []).map((child) => `${child.name}:${child.type}=${child.value}`);
      }), { timeout: 30000 }).toEqual(expect.arrayContaining([
        expect.stringContaining("name:java.lang.String"),
        "count:int=3",
      ]));
      await expect(watchesPane.getByRole("treeitem", { name: /field count .* : int = 3/ }).first()).toBeVisible();

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java Breakpoints pane configures conditional hit-count logpoints", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    System.out.println(counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-breakpoint-props-");

    async function openBreakpointsPane() {
      const debugMenu = await openDebugMenu(page);
      await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]').click();
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]')).toHaveClass(/active/);
      await expect(panel.locator(".java-debug-breakpoint-controls")).toBeVisible();
      return panel;
    }

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      await page.evaluate(() => {
        const app = window.markdownViewerApp;
        const view = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.()
          || app?.modules?.codeMirrorEditor?.getView?.();
        const position = view?.state?.doc?.line?.(3)?.from || 0;
        view?.dispatch?.({ selection: { anchor: position, head: position }, scrollIntoView: true });
        view?.focus?.();
      });
      const panel = await openBreakpointsPane();

      await panel.locator('[data-debug-action="configure-line-breakpoint"]').click();
      const modal = page.locator("#app-notification-modal");
      await expect(modal).toBeVisible();
      await modal.locator("[data-java-debug-breakpoint-condition]").fill("counter == 7");
      await modal.locator("[data-java-debug-breakpoint-hit-count]").fill("3");
      await modal.locator("[data-java-debug-breakpoint-log-message]").fill("counter={counter}");
      await modal.locator('[data-notification-button-id="save"]').click();
      await expect(modal).not.toBeVisible();

      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, condition: breakpoint.condition, hitCount: breakpoint.hitCount, logMessage: breakpoint.logMessage })) || [];
      })).toEqual([{ line: 3, condition: "counter == 7", hitCount: 3, logMessage: "counter={counter}" }]);
      const breakpointRow = panel.locator(".java-debug-breakpoint[data-breakpoint-line='3']");
      await expect(breakpointRow).toContainText("counter == 7");
      await expect(breakpointRow).toContainText("hit count 3");
      await expect(breakpointRow).toContainText("counter={counter}");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java breakpoint context menu manages breakpoint actions", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    int counter = 7;",
      "    System.out.println(counter);",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-breakpoint-context-");

    async function openBreakpointsPane() {
      const debugMenu = await openDebugMenu(page);
      await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]').click();
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]')).toHaveClass(/active/);
      return panel;
    }

    async function openBreakpointContextMenu(panel) {
      const breakpointRow = panel.locator(".java-debug-breakpoint[data-breakpoint-line='3']").first();
      await expect(breakpointRow).toBeVisible();
      await breakpointRow.click({ button: "right" });
      const menu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(menu).toBeVisible();
      return menu;
    }

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      await page.evaluate(() => {
        const app = window.markdownViewerApp;
        const view = app?.services?.editorViewManager?.getActiveCodeMirrorEditor?.()?.getView?.()
          || app?.modules?.codeMirrorEditor?.getView?.();
        const position = view?.state?.doc?.line?.(3)?.from || 0;
        view?.dispatch?.({ selection: { anchor: position, head: position }, scrollIntoView: true });
        view?.focus?.();
      });
      const panel = await openBreakpointsPane();

      await panel.locator('[data-debug-action="configure-line-breakpoint"]').click();
      const createModal = page.locator("#app-notification-modal");
      await expect(createModal).toBeVisible();
      await createModal.locator('[data-notification-button-id="save"]').click();
      await expect(createModal).not.toBeVisible();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 3, enabled: true }]);

      let menu = await openBreakpointContextMenu(panel);
      await expect(menu).toContainText("Navigate to Source");
      await expect(menu).toContainText("Disable Breakpoint at Line 3");
      await expect(menu).toContainText("Edit Condition");
      await expect(menu).toContainText("Edit Hit Count");
      await expect(menu).toContainText("Remove Breakpoint at Line 3");

      await menu.getByRole("menuitem", { name: /Disable Breakpoint at Line 3/ }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints?.[0]?.enabled === false;
      })).toBe(true);

      menu = await openBreakpointContextMenu(panel);
      await expect(menu).toContainText("Enable Breakpoint at Line 3");
      await menu.getByRole("menuitem", { name: /Enable Breakpoint at Line 3/ }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints?.[0]?.enabled !== false;
      })).toBe(true);

      menu = await openBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Edit Condition" }).click();
      const modal = page.locator("#app-notification-modal");
      await expect(modal).toBeVisible();
      await expect(modal.locator("[data-java-debug-breakpoint-condition]")).toBeFocused();
      await modal.locator("[data-java-debug-breakpoint-condition]").fill("counter == 7");
      await modal.locator('[data-notification-button-id="save"]').click();
      await expect(modal).not.toBeVisible();

      menu = await openBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Edit Hit Count" }).click();
      await expect(modal).toBeVisible();
      await expect(modal.locator("[data-java-debug-breakpoint-hit-count]")).toBeFocused();
      await modal.locator("[data-java-debug-breakpoint-hit-count]").fill("2");
      await modal.locator('[data-notification-button-id="save"]').click();
      await expect(modal).not.toBeVisible();

      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints?.[0] || {};
        return { condition: breakpoint.condition || "", hitCount: breakpoint.hitCount || 0 };
      })).toEqual({ condition: "counter == 7", hitCount: 2 });
      await expect(panel.locator(".java-debug-breakpoint[data-breakpoint-line='3']")).toContainText("counter == 7");
      await expect(panel.locator(".java-debug-breakpoint[data-breakpoint-line='3']")).toContainText("hit count 2");

      menu = await openBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Navigate to Source" }).click();
      await expect(page.locator(".cm-editor.cm-focused")).toBeVisible();

      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]').click();
      menu = await openBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: /Remove Breakpoint at Line 3/ }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints || [];
      })).toEqual([]);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java conditional hit-count logpoints run against the real JVM", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    for (int counter = 1; counter <= 4; counter++) {",
      '      System.out.println("condition " + counter);',
      "    }",
      "    for (int counter = 1; counter <= 4; counter++) {",
      '      System.out.println("log " + counter);',
      "    }",
      '    System.out.println("done");',
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-advanced-breakpoints-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const session = window.markdownViewerApp?.modules?.javaDebugSession;
        await session.updateBreakpoint(filePath, 4, { enabled: true, condition: "counter == 3" });
        await session.updateBreakpoint(filePath, 7, { enabled: true, hitCount: 3, logMessage: "log counter={counter}" });
      }, javaFilePath);

      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const conditionBreakpoint = state.breakpoints?.find((breakpoint) => Number(breakpoint.line) === 4) || null;
        return {
          state: state.state || "",
          reason: state.stoppedReason || "",
          line: state.location?.line || 0,
          counter: (state.variables || []).find((variable) => variable.name === "counter")?.value || "",
          condition: conditionBreakpoint?.condition || "",
          hits: conditionBreakpoint?.hits || 0,
          verified: conditionBreakpoint?.verified === true,
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toEqual({
        state: "stopped-at-breakpoint",
        reason: "breakpoint",
        line: 4,
        counter: "3",
        condition: "counter == 3",
        hits: 3,
        verified: true,
        lastError: "",
      });

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.resume?.();
      });
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const logpoint = state.breakpoints?.find((breakpoint) => Number(breakpoint.line) === 7) || null;
        const entries = state.consoleEntries || [];
        return {
          state: state.state || "",
          logpointHits: logpoint?.hits || 0,
          logpointVerified: logpoint?.verified === true,
          logpointOutput: entries.filter((entry) => entry.kind === "logpoint").map((entry) => entry.text || "").join("\n"),
          stdout: entries.filter((entry) => entry.kind === "stdout").map((entry) => entry.text || "").join("\n"),
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toMatchObject({
        state: "terminated",
        logpointHits: 1,
        logpointVerified: true,
        logpointOutput: expect.stringContaining("log counter=3"),
        stdout: expect.stringContaining("done"),
        lastError: "",
      });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java breakpoint toolbar bulk enablement and mute control real JVM stops", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      '    System.out.println("before");',
      '    System.out.println("first stop");',
      '    System.out.println("between");',
      '    System.out.println("second stop");',
      '    System.out.println("done");',
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-breakpoint-bulk-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");
    const javaFilePath = path.join(folderPath, "src/main/java/Demo.java");

    async function startDebuggee() {
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);
    }

    function waitForStopOrTermination() {
      return expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return {
          state: state.state || "",
          line: Number(state.location?.line || 0),
          breakpointsMuted: state.breakpointsMuted === true,
          enabledLines: (state.breakpoints || []).filter((breakpoint) => breakpoint.enabled !== false).map((breakpoint) => Number(breakpoint.line)),
          output: (state.consoleEntries || []).map((entry) => entry.text || "").join(""),
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 });
    }

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      await page.evaluate(async (filePath) => {
        const session = window.markdownViewerApp?.modules?.javaDebugSession;
        await session.addBreakpoint(filePath, 4);
        await session.addBreakpoint(filePath, 6);
      }, javaFilePath);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(2);

      const toolbar = page.locator("#java-debug-header-toolbar");
      await (await openDebugMenu(page)).locator('[data-debug-menu-command="toggle-breakpoints-enabled"]').click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: false }, { line: 6, enabled: false }]);
      await expect(page.locator(".cm-debugBreakpointMarker-disabled")).toHaveCount(2);

      await startDebuggee();
      await waitForStopOrTermination().toMatchObject({
        state: "terminated",
        enabledLines: [],
        output: expect.stringContaining("done"),
        lastError: "",
      });

      await (await openDebugMenu(page)).locator('[data-debug-menu-command="toggle-breakpoints-enabled"]').click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().breakpoints
          ?.map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ line: 4, enabled: true }, { line: 6, enabled: true }]);
      await expect(page.locator(".cm-debugBreakpointMarker-enabled")).toHaveCount(2);

      await startDebuggee();
      await waitForStopOrTermination().toMatchObject({
        state: "stopped-at-breakpoint",
        line: 4,
        enabledLines: [4, 6],
        lastError: "",
      });
      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");

      await (await openDebugMenu(page)).locator('[data-debug-menu-command="toggle-breakpoints-muted"]').click();
      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return { muted: state.breakpointsMuted === true, enabled: (state.breakpoints || []).every((breakpoint) => breakpoint.enabled !== false) };
      })).toEqual({ muted: true, enabled: true });

      await startDebuggee();
      await waitForStopOrTermination().toMatchObject({
        state: "terminated",
        breakpointsMuted: true,
        enabledLines: [4, 6],
        output: expect.stringContaining("done"),
        lastError: "",
      });
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });


  test("Java Breakpoints pane deletes all breakpoint types after confirmation", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    helper();",
      "  }",
      "  static void helper() {",
      "    System.out.println(\"clear breakpoints\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-clear-breakpoints-");

    async function openBreakpointsPane() {
      const debugMenu = await openDebugMenu(page);
      await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]').click();
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]')).toHaveClass(/active/);
      await expect(panel.locator(".java-debug-breakpoint-controls")).toBeVisible();
      return panel;
    }

    async function readBreakpointSummary() {
      return page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const exceptionBreakpoint = state.exceptionBreakpoint || null;
        return {
          lines: (state.breakpoints || []).map((breakpoint) => ({ line: breakpoint.line, enabled: breakpoint.enabled !== false })),
          methods: (state.methodBreakpoints || []).map((breakpoint) => ({ className: breakpoint.className, methodName: breakpoint.methodName, enabled: breakpoint.enabled !== false })),
          exception: exceptionBreakpoint ? { enabled: exceptionBreakpoint.enabled !== false, caught: exceptionBreakpoint.caught !== false, uncaught: exceptionBreakpoint.uncaught !== false } : null,
        };
      });
    }

    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const session = window.markdownViewerApp?.modules?.javaDebugSession;
        await session.addBreakpoint(filePath, 3);
        await session.addMethodBreakpoint("Demo", "helper");
        await session.updateExceptionBreakpoint({ enabled: true, caught: false, uncaught: true });
      }, javaFilePath);
      const panel = await openBreakpointsPane();

      await expect.poll(readBreakpointSummary).toEqual({
        lines: [{ line: 3, enabled: true }],
        methods: [{ className: "Demo", methodName: "helper", enabled: true }],
        exception: { enabled: true, caught: false, uncaught: true },
      });
      await expect(panel.locator(".java-debug-breakpoint[data-breakpoint-line='3']")).toBeVisible();
      await expect(panel.locator(".java-debug-method-breakpoint[data-method-breakpoint-row-id]")).toContainText("Demo.helper()");
      await expect(panel.locator(".java-debug-exception-breakpoint[data-exception-breakpoint-row]")).toContainText("uncaught");

      await panel.locator('[data-debug-action="clear-breakpoints"]').click();
      const modal = page.locator("#app-notification-modal");
      await expect(modal).toBeVisible();
      await expect(modal).toContainText("Delete All Breakpoints");
      await modal.locator('[data-notification-button-id="cancel"]').click();
      await expect(modal).not.toBeVisible();
      await expect.poll(readBreakpointSummary).toEqual({
        lines: [{ line: 3, enabled: true }],
        methods: [{ className: "Demo", methodName: "helper", enabled: true }],
        exception: { enabled: true, caught: false, uncaught: true },
      });

      await panel.locator('[data-debug-action="clear-breakpoints"]').click();
      await expect(modal).toBeVisible();
      await modal.locator('[data-notification-button-id="delete"]').click();
      await expect(modal).not.toBeVisible();
      await expect.poll(readBreakpointSummary).toEqual({
        lines: [],
        methods: [],
        exception: { enabled: false, caught: true, uncaught: true },
      });
      await expect(panel.locator(".java-debug-breakpoint[data-breakpoint-line]" )).toHaveCount(0);
      await expect(panel.locator(".java-debug-method-breakpoint[data-method-breakpoint-row-id]")).toHaveCount(0);
      await expect(panel.locator(".java-debug-exception-breakpoint[data-exception-breakpoint-row]")).toContainText("disabled");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java method breakpoints persist after reopening the project", async ({ page, context }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    helper();",
      "  }",
      "  static void helper() {",
      "    System.out.println(\"method breakpoint\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-method-");

    async function openBreakpointsPane() {
      const debugMenu = await openDebugMenu(page);
      await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]').click();
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]')).toHaveClass(/active/);
      await expect(panel.locator(".java-debug-breakpoint-controls")).toBeVisible();
      return panel;
    }


    async function openMethodBreakpointContextMenu(panel) {
      const row = panel.locator(".java-debug-method-breakpoint[data-method-breakpoint-row-id]", { hasText: "Demo.helper()" }).first();
      await expect(row).toBeVisible();
      await row.click({ button: "right" });
      const menu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(menu).toBeVisible();
      return menu;
    }
    try {
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      let panel = await openBreakpointsPane();

      await panel.locator('.java-debug-breakpoint-controls [data-debug-action="add-method-breakpoint"]').click();
      const modal = page.locator("#app-notification-modal");
      await expect(modal).toBeVisible();
      await modal.locator("[data-java-debug-method-breakpoint-class]").fill("Demo");
      await modal.locator("[data-java-debug-method-breakpoint-method]").fill("helper");
      await modal.locator('[data-notification-button-id="add"]').click();
      await expect(modal).not.toBeVisible();

      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().methodBreakpoints
          ?.map((breakpoint) => ({ className: breakpoint.className, methodName: breakpoint.methodName, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ className: "Demo", methodName: "helper", enabled: true }]);
      await expect(panel.locator(".java-debug-method-breakpoint[data-method-breakpoint-row-id]")).toContainText("Demo.helper()");

      let menu = await openMethodBreakpointContextMenu(panel);
      await expect(menu.getByRole("menuitem", { name: "Disable Method Breakpoint" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Edit Method Breakpoint" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Copy Method" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Remove Method Breakpoint" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "Copy Method" }).click();
      await expect.poll(() => page.evaluate(() => navigator.clipboard.readText()), { timeout: 5000 }).toBe("Demo.helper()");

      menu = await openMethodBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Disable Method Breakpoint" }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().methodBreakpoints?.[0]?.enabled === false;
      })).toBe(true);

      menu = await openMethodBreakpointContextMenu(panel);
      await expect(menu.getByRole("menuitem", { name: "Enable Method Breakpoint" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "Enable Method Breakpoint" }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().methodBreakpoints?.[0]?.enabled !== false;
      })).toBe(true);

      menu = await openMethodBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Edit Method Breakpoint" }).click();
      const editModal = page.locator("#app-notification-modal");
      await expect(editModal).toBeVisible();
      await expect(editModal.locator("[data-java-debug-method-breakpoint-class]")).toHaveValue("Demo");
      await expect(editModal.locator("[data-java-debug-method-breakpoint-method]")).toHaveValue("helper");
      await editModal.locator('[data-notification-button-id="save"]').click();
      await expect(editModal).not.toBeVisible();

      await page.reload();
      await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.activeEditorCommands?.getActiveEditorValue === "function");
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      panel = await openBreakpointsPane();

      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().methodBreakpoints
          ?.map((breakpoint) => ({ className: breakpoint.className, methodName: breakpoint.methodName, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ className: "Demo", methodName: "helper", enabled: true }]);
      await expect(panel.locator(".java-debug-method-breakpoint[data-method-breakpoint-row-id]")).toContainText("Demo.helper()");

      menu = await openMethodBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Remove Method Breakpoint" }).click();
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().methodBreakpoints || [];
      })).toEqual([]);
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java method breakpoint stops on real JVM method entry", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      '    String greeting = helper("Grace");',
      "    System.out.println(greeting);",
      "  }",
      "  static String helper(String name) {",
      '    String message = "Hello " + name;',
      "    return message;",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-method-runtime-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.addMethodBreakpoint?.("Demo", "helper");
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().methodBreakpoints
          ?.map((breakpoint) => ({ className: breakpoint.className, methodName: breakpoint.methodName, enabled: breakpoint.enabled !== false })) || [];
      })).toEqual([{ className: "Demo", methodName: "helper", enabled: true }]);

      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await expect.poll(() => page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const topFrame = state.threads?.find((thread) => thread.id === state.selectedThreadId)?.frames?.[0] || null;
        const breakpoint = state.methodBreakpoints?.find((item) => item.className === "Demo" && item.methodName === "helper") || null;
        return {
          state: state.state || "",
          reason: state.stoppedReason || "",
          method: state.location?.method || topFrame?.method || "",
          sourceName: state.location?.sourceName || topFrame?.sourceName || "",
          hits: breakpoint?.hits || 0,
          verified: breakpoint?.verified === true,
          lastError: state.lastError || "",
        };
      }), { timeout: 60000 }).toEqual({
        state: "stopped-at-breakpoint",
        reason: "method-breakpoint",
        method: "helper",
        sourceName: "Demo.java",
        hits: 1,
        verified: true,
        lastError: "",
      });
      const panel = page.locator(".java-debug-panel.active");
      await expect(panel.locator(".java-debug-session-overview")).toContainText("Stopped at method breakpoint");
      await expect(panel.locator(".java-debug-method-breakpoint[data-method-breakpoint-row-id]")).toContainText("hit 1");

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java exception breakpoint stops on caught exceptions when enabled", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    try {",
      '      throw new IllegalArgumentException("caught breakpoint");',
      "    } catch (IllegalArgumentException handled) {",
      '      System.out.println("handled " + handled.getMessage());',
      "    }",
      '    System.out.println("after catch");',
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-caught-exception-runtime-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.updateExceptionBreakpoint({ enabled: true, caught: true, uncaught: false });
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && state.stoppedReason === "exception") || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedFrame = (state.threads || []).flatMap((thread) => thread.frames || []).find((frame) => frame.id === state.selectedFrameId);
        const exceptionBreakpoint = state.exceptionBreakpoint || null;
        return {
          state: state.state,
          reason: state.stoppedReason || "",
          description: state.stoppedDescription || "",
          line: state.location?.line || 0,
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          exceptionBreakpoint: exceptionBreakpoint ? { enabled: exceptionBreakpoint.enabled !== false, caught: exceptionBreakpoint.caught !== false, uncaught: exceptionBreakpoint.uncaught !== false } : null,
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop on the caught exception: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "exception",
        line: 4,
        frame: "Demo.main",
        exceptionBreakpoint: { enabled: true, caught: true, uncaught: false },
        lastError: "",
      });
      expect(stoppedState.description).toContain("IllegalArgumentException");
      expect(stoppedState.console).not.toContain("handled caught breakpoint");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
  test("Java exception breakpoint stops on uncaught exceptions without stopping on caught ones", async ({ page }) => {
    const jdkHome = await findUsableJdkHome();
    test.skip(!jdkHome, "A local JDK with java and javac is required for JVM-backed debugger validation.");
    const jdk = createJdkEntry(jdkHome);
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    try {",
      "      throw new IllegalArgumentException(\"caught\");",
      "    } catch (IllegalArgumentException ignored) {",
      "      System.out.println(\"caught\");",
      "    }",
      "    throw new IllegalStateException(\"uncaught\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-exception-runtime-");
    await fs.mkdir(path.join(folderPath, ".md-editor"), { recursive: true });
    await fs.writeFile(path.join(folderPath, ".md-editor", "java-build-path.json"), createStandardJavaBuildPath(jdk.id, folderPath), "utf8");

    try {
      await openApp(page, {
        localStorage: {
          markdownViewerGlobalState: JSON.stringify({
            startupBehavior: "empty",
            codeConverterJavaJdks: [jdk],
          }),
        },
      });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      const javaFilePath = path.join(folderPath, "src", "main", "java", "Demo.java");
      await page.evaluate(async (filePath) => {
        const app = window.markdownViewerApp;
        const configuration = await app.modules.runLauncher.ensureJavaFileConfiguration(filePath);
        if (!configuration) throw new Error("Unable to create Java debug configuration for Demo.java");
        await app.modules.javaDebugPanel.openView("workspace");
        await app.modules.javaDebugSession.updateExceptionBreakpoint({ enabled: true, caught: false, uncaught: true });
        await app.modules.javaDebugSession.start(configuration);
      }, javaFilePath);

      await page.waitForFunction(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        return (state.state === "stopped-at-breakpoint" && state.stoppedReason === "exception") || ["failed", "terminated"].includes(state.state);
      }, null, { timeout: 60000 });
      const stoppedState = await page.evaluate(() => {
        const state = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.() || {};
        const selectedFrame = (state.threads || []).flatMap((thread) => thread.frames || []).find((frame) => frame.id === state.selectedFrameId);
        return {
          state: state.state,
          reason: state.stoppedReason || "",
          line: state.location?.line || 0,
          frame: selectedFrame ? `${selectedFrame.className}.${selectedFrame.method}` : "",
          lastError: state.lastError || "",
          console: (state.consoleEntries || []).map((entry) => `${entry.kind}: ${entry.text}`).join("\n"),
        };
      });
      if (stoppedState.state !== "stopped-at-breakpoint") {
        throw new Error(`Debugger did not stop on the uncaught exception: ${JSON.stringify(stoppedState, null, 2)}`);
      }
      expect(stoppedState).toMatchObject({
        state: "stopped-at-breakpoint",
        reason: "exception",
        line: 8,
        frame: "Demo.main",
        lastError: "",
      });
      expect(stoppedState.console).toContain("caught");
      await expect(page.locator(".cm-debugExecutionLine")).toHaveCount(1);

      await page.evaluate(async () => {
        await window.markdownViewerApp?.modules?.javaDebugSession?.stop?.();
      });
      await expect.poll(() => page.evaluate(() => {
        return window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().state || "";
      })).toBe("terminated");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });

  test("Java exception breakpoint settings persist after reopening the project", async ({ page }) => {
    const source = [
      "public class Demo {",
      "  public static void main(String[] args) {",
      "    throw new RuntimeException(\"boom\");",
      "  }",
      "}",
    ].join("\n");
    const folderPath = await createWorkspaceTree({
      "src/main/java/Demo.java": source,
    }, "md-editor-java-debugger-exception-");

    async function openBreakpointsPane() {
      const debugMenu = await openDebugMenu(page);
      await debugMenu.locator('[data-debug-menu-command="workspace"]').click();
      const panel = page.locator(".java-debug-panel.active");
      await expect(page.locator("#java-debug-left-perspective")).toBeVisible();
      await page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]').click();
      await expect(page.locator('#java-debug-right-perspective [data-debug-perspective-right-view="breakpoints"]')).toHaveClass(/active/);
      await expect(panel.locator(".java-debug-exception-breakpoint[data-exception-breakpoint-row]")).toBeVisible();
      return panel;
    }


    async function openExceptionBreakpointContextMenu(panel) {
      const row = panel.locator(".java-debug-exception-breakpoint[data-exception-breakpoint-row]").first();
      await expect(row).toBeVisible();
      await row.click({ button: "right" });
      const menu = page.locator(".java-debug-context-menu:not(.hidden)");
      await expect(menu).toBeVisible();
      return menu;
    }
    try {
      await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      let panel = await openBreakpointsPane();

      await panel.locator("[data-exception-breakpoint-properties]").click();
      const modal = page.locator("#app-notification-modal");
      await expect(modal).toBeVisible();
      await modal.locator("[data-java-debug-exception-breakpoint-enabled]").check();
      await modal.locator("[data-java-debug-exception-breakpoint-caught]").uncheck();
      await modal.locator("[data-java-debug-exception-breakpoint-uncaught]").check();
      await modal.locator('[data-notification-button-id="save"]').click();
      await expect(modal).not.toBeVisible();

      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().exceptionBreakpoint || null;
        return breakpoint ? { enabled: breakpoint.enabled !== false, caught: breakpoint.caught !== false, uncaught: breakpoint.uncaught !== false } : null;
      })).toEqual({ enabled: true, caught: false, uncaught: true });
      await expect(panel.locator(".java-debug-exception-breakpoint[data-exception-breakpoint-row]")).toContainText("uncaught");

      let menu = await openExceptionBreakpointContextMenu(panel);
      await expect(menu.getByRole("menuitem", { name: "Disable Exception Breakpoint" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Exception Breakpoint Properties" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Enable Caught Exceptions" })).toBeVisible();
      await expect(menu.getByRole("menuitem", { name: "Disable Uncaught Exceptions" })).toBeVisible();

      await menu.getByRole("menuitem", { name: "Enable Caught Exceptions" }).click();
      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().exceptionBreakpoint || null;
        return breakpoint ? { enabled: breakpoint.enabled !== false, caught: breakpoint.caught !== false, uncaught: breakpoint.uncaught !== false } : null;
      })).toEqual({ enabled: true, caught: true, uncaught: true });

      menu = await openExceptionBreakpointContextMenu(panel);
      await expect(menu.getByRole("menuitem", { name: "Disable Caught Exceptions" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "Disable Caught Exceptions" }).click();
      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().exceptionBreakpoint || null;
        return breakpoint ? { enabled: breakpoint.enabled !== false, caught: breakpoint.caught !== false, uncaught: breakpoint.uncaught !== false } : null;
      })).toEqual({ enabled: true, caught: false, uncaught: true });

      menu = await openExceptionBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Disable Exception Breakpoint" }).click();
      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().exceptionBreakpoint || null;
        return breakpoint ? breakpoint.enabled !== false : null;
      })).toBe(false);

      menu = await openExceptionBreakpointContextMenu(panel);
      await expect(menu.getByRole("menuitem", { name: "Enable Exception Breakpoint" })).toBeVisible();
      await menu.getByRole("menuitem", { name: "Enable Exception Breakpoint" }).click();
      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().exceptionBreakpoint || null;
        return breakpoint ? { enabled: breakpoint.enabled !== false, caught: breakpoint.caught !== false, uncaught: breakpoint.uncaught !== false } : null;
      })).toEqual({ enabled: true, caught: false, uncaught: true });

      menu = await openExceptionBreakpointContextMenu(panel);
      await menu.getByRole("menuitem", { name: "Exception Breakpoint Properties" }).click();
      await expect(modal).toBeVisible();
      await modal.locator('[data-notification-button-id="save"]').click();
      await expect(modal).not.toBeVisible();

      await page.reload();
      await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.activeEditorCommands?.getActiveEditorValue === "function");
      await openJavaFile(page, folderPath, "src/main/java/Demo.java");
      panel = await openBreakpointsPane();

      await expect.poll(() => page.evaluate(() => {
        const breakpoint = window.markdownViewerApp?.modules?.javaDebugSession?.getState?.().exceptionBreakpoint || null;
        return breakpoint ? { enabled: breakpoint.enabled !== false, caught: breakpoint.caught !== false, uncaught: breakpoint.uncaught !== false } : null;
      })).toEqual({ enabled: true, caught: false, uncaught: true });
      await expect(panel.locator(".java-debug-exception-breakpoint[data-exception-breakpoint-row]")).toContainText("uncaught");
    } finally {
      await removeTempWorkspace(folderPath);
    }
  });
});
