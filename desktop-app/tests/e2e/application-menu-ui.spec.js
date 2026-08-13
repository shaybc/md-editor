const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, selectSettingsTab } = require("../helpers/desktop-ui");

test.describe("application-wide desktop menu", () => {
  test("full desktop menu is the default layout", async ({ page }) => {
    await openApp(page);

    await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.applicationMenu.getLayout())).toBe("full");
    await expect(page.locator("#desktopActionMenu")).toBeHidden();
    await expect(page.locator("#desktop-application-menu")).toBeVisible();
  });

  test("hamburger layout includes the New submenu and Project", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);
    await expect(page.locator("#desktopActionMenu")).toBeVisible();

    const hamburgerMenu = page.locator(".header-action-menu > .action-menu");
    await expect(hamburgerMenu.locator(":scope > .application-menu-file")).toHaveCount(0);
    await expect(hamburgerMenu.locator(":scope > .new-file-submenu")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .new-file-submenu + .new-project-button")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .new-file-submenu .new-unsaved-file-button")).toHaveText("New File ...");
    await expect(hamburgerMenu.locator(":scope > .new-file-submenu .open-image-editor-tool")).toHaveText("New Image ...");
    await expect(hamburgerMenu.locator(":scope > .new-file-submenu .open-diagram-editor-tool")).toHaveText("New Diagram ...");
    await expect(hamburgerMenu.locator(":scope > .new-file-submenu .new-document-button")).toContainText("New Document ...");
    await expect(hamburgerMenu.locator(":scope > .exit-app-button:last-child")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .reload-current-file-button + .diagram-export-submenu")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .diagram-export-submenu + .image-export-submenu + .dropdown-divider + .application-menu-edit")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .application-menu-edit + .dropdown-divider + .application-menu-find")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .application-menu-find + .dropdown-divider + .application-menu-view")).toHaveCount(1);
    await expect(hamburgerMenu.locator(":scope > .application-menu-help + .dropdown-divider + .exit-app-button")).toHaveCount(1);

    const categories = hamburgerMenu.locator(":scope > [data-application-menu-category]");
    await expect(categories).toHaveCount(8);
    await expect(categories.locator("> .application-menu-category-toggle")).toContainText([
      "Edit",
      "Find",
      "View",
      "Project",
      "Run",
      "Tools",
      "Settings",
      "Help"
    ]);
    await expect(page.locator(".header-action-menu .application-menu-settings > .application-menu-category-toggle")).toHaveText("Settings ...");

    const projectMenu = page.locator(".application-menu-project");
    await projectMenu.locator("> .application-menu-category-toggle").hover();
    await expect(projectMenu.locator('[data-project-command="java-build-path"]')).toBeDisabled();
    await expect(projectMenu.locator('[data-project-command="compile-file"]')).toBeDisabled();
    await expect(projectMenu.locator('[data-project-command="rebuild-project"]')).toBeDisabled();
    await expect(projectMenu.locator('[data-project-command="rebuild-project"]')).toContainText("Build Project");
    await expect(projectMenu.locator('[data-project-command="rebuild-project-last-options"]')).toBeDisabled();
    await expect(projectMenu.locator('[data-project-command="rebuild-project-last-options"]')).toHaveText("Rebuild Project");
    await expect(projectMenu.locator('[data-project-command="rebuild-project"] + [data-project-command="rebuild-project-last-options"]')).toHaveCount(1);
    await expect(projectMenu.locator('[data-project-command="clean-project"]')).toBeDisabled();
    await expect(projectMenu.locator('[data-project-command="show-problems"]')).toBeEnabled();

    const runMenu = page.locator(".application-menu-run");
    await runMenu.locator("> .application-menu-category-toggle").hover();
    await expect(runMenu.locator('[data-run-menu-command="configurations"]')).toBeDisabled();
    await expect(runMenu.locator('[data-run-menu-command="stop"]')).toBeDisabled();
  });

  test("Java settings expose application runtimes and Java Build Path includes a required Project JDK", async ({ page }) => {
    await openApp(page);
    await selectSettingsTab(page, "jdks");

    await expect(page.getByRole("heading", { name: "Java Runtimes" })).toBeVisible();
    await expect(page.locator("#settings-detect-jdks")).toBeVisible();
    await expect(page.locator("#settings-jdk-list")).toHaveCount(1);
    await expect(page.locator("#settings-jdk-empty")).toBeVisible();
    await expect(page.locator("#java-build-path-project-jdk")).toHaveCount(1);
    await expect(page.locator('#java-build-path-build-system option[value="gradle"]')).toHaveCount(1);
    await expect(page.locator("#java-build-path-gradle-installation")).toHaveCount(1);
    await expect(page.locator("#java-build-path-manage-gradle")).toHaveText("Manage Gradle installations...");
    await expect(page.locator("#java-build-path-manage-jdks")).toHaveText("Manage JDKs...");
  });

  test("auto-detected JDKs follow Settings Save and Cancel behavior", async ({ page }) => {
    const existingJdk = {
      id: "jdk:c:/existing/jdk-17",
      name: "Custom Java",
      path: "C:/Existing/jdk-17",
      feature: 17,
      detectedName: "JDK 17"
    };
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ codeConverterJavaJdks: [existingJdk] })
      }
    });
    await page.evaluate(() => {
      window.__jdkDetectionAlerts = [];
      window.__jdkGlobalStateWrites = [];
      const originalSetItem = Storage.prototype.setItem;
      Storage.prototype.setItem = function(key, value) {
        if (key === "markdownViewerGlobalState") {
          const state = JSON.parse(String(value || "{}"));
          window.__jdkGlobalStateWrites.push(state.codeConverterJavaJdks?.map((jdk) => jdk.name) || []);
        }
        return originalSetItem.call(this, key, value);
      };
      window.alert = (message) => window.__jdkDetectionAlerts.push(String(message));
      window.markdownViewerApp.modules.windowsJdkDetector.detectInstalledJdks = async () => [
        {
          id: "jdk:c:/existing/jdk-17",
          name: "JDK 17",
          path: "C:/Existing/jdk-17",
          feature: 17,
          detectedName: "JDK 17"
        },
        {
          id: "jdk:c:/detected/jdk-25",
          name: "JDK 25",
          path: "C:/Detected/jdk-25",
          feature: 25,
          detectedName: "JDK 25"
        }
      ];
    });
    await selectSettingsTab(page, "jdks");

    await page.locator("#settings-detect-jdks").click();
    await expect(page.locator("#settings-jdk-list .settings-table-row")).toHaveCount(2);
    const detectedNames = page.locator("#settings-jdk-list .settings-jdk-name-input");
    await expect(detectedNames.nth(0)).toHaveValue("Custom Java");
    await expect(detectedNames.nth(1)).toHaveValue("JDK 25");
    await expect.poll(() => page.evaluate(() => window.__jdkDetectionAlerts.at(-1))).toBe(
      "Added 1 detected JDK. Click Save settings to keep it."
    );

    await page.locator("#settings-modal-cancel").click();
    await selectSettingsTab(page, "jdks");
    await expect(page.locator("#settings-jdk-list .settings-table-row")).toHaveCount(1);
    await expect(page.locator("#settings-jdk-list .settings-jdk-name-input")).toHaveValue("Custom Java");
    await expect(page.locator("#settings-jdk-list .settings-jdk-name-input")).not.toHaveValue("JDK 25");

    await page.locator("#settings-detect-jdks").click();
    await expect(page.locator("#settings-jdk-list .settings-table-row")).toHaveCount(2);
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();
    await expect.poll(() => page.evaluate(() => {
      return window.__jdkGlobalStateWrites.some((names) => (
        names.length === 2 && names[0] === "Custom Java" && names[1] === "JDK 25"
      ));
    })).toBe(true);
  });

  test("full File menu places New Project directly after the New submenu", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty", menuLayout: "full" })
      }
    });
    const fileCategory = page.locator("#desktop-application-menu .application-menu-file");
    await fileCategory.locator("> .application-menu-category-toggle").click();
    await expect(fileCategory.locator(":scope > .application-menu-category-content > .new-file-submenu + .new-project-button")).toHaveCount(1);
  });

  test("JSON conversion submenu follows Edit in hamburger and full layouts", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);
    let jsonSubmenu = page.locator(".header-action-menu .application-menu-edit .json-edit-submenu");
    await expect(jsonSubmenu).toHaveCount(1);
    await expect(jsonSubmenu.locator("[data-edit-command]")).toHaveText([
      "One-line JSON",
      "JSON for Code",
      "JSON from Code"
    ]);

    await page.evaluate(() => window.markdownViewerApp.modules.applicationMenu.applyLayout("full"));
    jsonSubmenu = page.locator("#desktop-application-menu .application-menu-edit .json-edit-submenu");
    await expect(jsonSubmenu).toHaveCount(1);
    await expect(jsonSubmenu.locator("[data-edit-command]")).toHaveText([
      "One-line JSON",
      "JSON for Code",
      "JSON from Code"
    ]);
  });

  test("New File opens a named unsaved tab without creating a disk file", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty", menuLayout: "full" })
      }
    });
    const fileCategory = page.locator("#desktop-application-menu .application-menu-file");
    const newSubmenu = fileCategory.locator(".new-file-submenu");
    await fileCategory.locator("> .application-menu-category-toggle").click();
    await newSubmenu.locator("> .dropdown-toggle").hover();
    await newSubmenu.locator(".new-unsaved-file-button").click();

    await expect(page.locator("#rename-modal-title")).toHaveText("New File");
    await expect(page.locator("#rename-modal")).toBeVisible();
    await page.locator("#rename-modal-input").fill("Example.java");
    await page.locator("#rename-modal-confirm").click();

    await expect.poll(() => page.evaluate(() => {
      const tab = window.markdownViewerApp.modules.tabs.getActiveTab();
      return {
        title: tab?.title,
        sourceFileName: tab?.sourceFileName,
        sourceFilePath: tab?.sourceFilePath,
        hasHandle: !!tab?.sourceFileHandle,
        isNewUnsavedFile: tab?.isNewUnsavedFile,
        sourceKind: tab?.openedSource?.kind,
        type: tab?.type
      };
    })).toEqual({
      title: "Example.java",
      sourceFileName: "Example.java",
      sourceFilePath: null,
      hasHandle: false,
      isNewUnsavedFile: true,
      sourceKind: "new-file",
      type: "markdown"
    });
    await expect(page.locator("#tab-list .tab-item.active")).toHaveClass(/unsaved/);
  });

  test("New editor commands create a separate tab each time", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty", menuLayout: "full" })
      }
    });
    const fileCategory = page.locator("#desktop-application-menu .application-menu-file");
    const newSubmenu = fileCategory.locator(".new-file-submenu");
    const openNew = async (selector) => {
      await fileCategory.locator("> .application-menu-category-toggle").click();
      await newSubmenu.locator("> .dropdown-toggle").hover();
      await newSubmenu.locator(selector).click();
      if (selector === ".open-image-editor-tool") {
        await page.locator("#new-image-width").fill("32");
        await page.locator("#new-image-height").fill("24");
        await page.locator("[data-new-image-create]").click();
      }
    };

    await openNew(".open-image-editor-tool");
    await openNew(".open-image-editor-tool");
    await openNew(".open-diagram-editor-tool");
    await openNew(".open-diagram-editor-tool");
    await openNew(".new-document-button");
    await openNew(".new-document-button");

    await expect(page.locator(".image-editor-shell")).toHaveCount(2);
    await expect(page.locator(".diagram-editor-shell")).toHaveCount(2);
    await expect(page.locator("#tab-list .tab-item")).toHaveCount(6);

  });
  test("full-layout Recent Files flyout stays attached at 125% app zoom", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty", menuLayout: "full", appZoomPercent: 125 })
      }
    });
    const fileCategory = page.locator("#desktop-application-menu .application-menu-file");
    const fileMenu = fileCategory.locator("> .application-menu-category-content");
    const recentFiles = fileMenu.locator("> .recent-files-submenu");
    const recentMenu = recentFiles.locator("> .recent-files-menu");

    await fileCategory.locator("> .application-menu-category-toggle").click();
    await recentFiles.locator("> .dropdown-toggle").hover();
    await expect(recentMenu).toBeVisible();

    const fileMenuBox = await fileMenu.boundingBox();
    const recentToggleBox = await recentFiles.locator("> .dropdown-toggle").boundingBox();
    const recentMenuBox = await recentMenu.boundingBox();
    expect(Math.abs(recentMenuBox.x - (fileMenuBox.x + fileMenuBox.width))).toBeLessThanOrEqual(4);
    expect(Math.abs(recentMenuBox.y - recentToggleBox.y)).toBeLessThanOrEqual(4);
  });

  test("Interface preference persists both full and hamburger menu layouts", async ({ page }) => {
    await openApp(page, { preserveLocalStorage: true });
    await selectSettingsTab(page, "interface");
    await page.locator("#settings-menu-layout").selectOption("full");

    await expect.poll(() => page.evaluate(() => ({
      layout: document.documentElement.dataset.desktopMenuLayout,
      hamburgerHidden: document.querySelector(".header-action-menu")?.classList.contains("d-none"),
      fixedHidden: document.getElementById("desktop-application-menu")?.hidden
    }))).toEqual({ layout: "full", hamburgerHidden: true, fixedHidden: false });
    await expect(page.locator("#desktopActionMenu")).toBeHidden();
    await expect(page.locator("#desktop-application-menu .application-menu-settings")).toHaveCount(0);
    await expect(page.locator("#desktop-application-menu [data-application-menu-category]")).toHaveCount(8);
    await expect(page.locator('#desktop-application-menu .show-symbol-toggle[data-show-symbol="indentGuide"]')).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");

    await page.locator("#settings-modal").evaluate((modal) => { modal.style.display = "none"; });
    const fileCategory = page.locator("#desktop-application-menu .application-menu-file");
    const fileToggle = fileCategory.locator("> .application-menu-category-toggle");
    const fileMenu = fileCategory.locator("> .application-menu-category-content");
    await expect(fileMenu.locator(":scope > .new-file-submenu + .new-project-button")).toHaveCount(1);
    const settingsCommand = fileMenu.locator(":scope > .open-settings-dialog");
    await expect(settingsCommand).toHaveText("Settings ...");
    await expect(fileMenu.locator(":scope > .open-settings-dialog + .dropdown-divider + .exit-app-button")).toHaveCount(1);

    await fileToggle.click();
    await expect(fileMenu).toBeVisible();
    await expect(settingsCommand.locator("> .bi-gear")).toBeVisible();
    const settingsBox = await settingsCommand.boundingBox();
    const exitBox = await fileMenu.locator(":scope > .exit-app-button").boundingBox();
    expect(settingsBox).not.toBeNull();
    expect(settingsBox.width).toBeCloseTo(exitBox.width, 1);

    const menuBox = await fileMenu.boundingBox();
    expect(menuBox).not.toBeNull();
    await page.mouse.move(menuBox.x + Math.min(40, menuBox.width / 2), menuBox.y + Math.min(40, menuBox.height / 2));
    await page.waitForTimeout(250);
    await expect(fileMenu).toBeVisible();
    await expect.poll(() => page.evaluate(({ x, y }) => {
      const hit = document.elementFromPoint(x, y);
      return !!hit?.closest?.("#desktop-application-menu .application-menu-category-content");
    }, {
      x: menuBox.x + Math.min(40, menuBox.width / 2),
      y: menuBox.y + Math.min(40, menuBox.height / 2)
    })).toBe(true);

    const editCategory = page.locator("#desktop-application-menu .application-menu-edit");
    const editMenu = editCategory.locator("> .application-menu-category-content");
    await editCategory.locator("> .application-menu-category-toggle").hover();
    await expect(fileToggle).not.toBeFocused();
    await expect(fileMenu).toBeHidden();
    await expect(editMenu).toBeVisible();

    await page.reload();
    await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.applicationMenu?.getLayout === "function");
    await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.applicationMenu.getLayout())).toBe("full");

    await selectSettingsTab(page, "interface");
    await page.locator("#settings-menu-layout").selectOption("hamburger");
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();
    await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.applicationMenu.getLayout())).toBe("hamburger");
    await expect(page.locator("#desktopActionMenu")).toBeVisible();
    await expect(page.locator("#desktop-application-menu")).toBeHidden();

    await page.reload();
    await page.waitForFunction(() => typeof window.markdownViewerApp?.modules?.applicationMenu?.getLayout === "function");
    await expect.poll(() => page.evaluate(() => window.markdownViewerApp.modules.applicationMenu.getLayout())).toBe("hamburger");
    await expect(page.locator("#desktopActionMenu")).toBeVisible();
    await expect(page.locator("#desktop-application-menu")).toBeHidden();
  });

  test("Exit skips confirmation when the preference is disabled by default", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => {
      window.__exitConfirmationRequests = [];
      window.__applicationExitCalls = 0;
      window.markdownViewerApp.services.confirm = async (options) => {
        window.__exitConfirmationRequests.push(options);
        return false;
      };
      window.Neutralino.app.exit = async () => {
        window.__applicationExitCalls += 1;
      };
    });

    await openActionMenu(page);
    await page.locator(".header-action-menu > .action-menu > .exit-app-button").click();

    await expect.poll(() => page.evaluate(() => ({
      confirmations: window.__exitConfirmationRequests.length,
      exits: window.__applicationExitCalls
    }))).toEqual({ confirmations: 0, exits: 1 });
  });

  test("enabled Exit confirmation can cancel or approve closing the app", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({
          startupBehavior: "untitled",
          confirmExitApplication: true
        })
      }
    });
    await page.evaluate(() => {
      window.__exitConfirmationRequests = [];
      window.__exitConfirmationResponse = false;
      window.__applicationExitCalls = 0;
      window.markdownViewerApp.services.confirm = async (options) => {
        window.__exitConfirmationRequests.push(options);
        return window.__exitConfirmationResponse;
      };
      window.Neutralino.app.exit = async () => {
        window.__applicationExitCalls += 1;
      };
    });

    await page.evaluate(() => window.markdownViewerRequestApplicationExit());
    await expect.poll(() => page.evaluate(() => ({
      request: window.__exitConfirmationRequests[0],
      exits: window.__applicationExitCalls
    }))).toEqual({
      request: {
        message: "Are you sure you want to exit MD-Editor?",
        title: "Exit MD-Editor",
        confirmLabel: "Exit"
      },
      exits: 0
    });

    await page.evaluate(() => {
      window.__exitConfirmationResponse = true;
      return window.markdownViewerRequestApplicationExit();
    });
    await expect.poll(() => page.evaluate(() => window.__applicationExitCalls)).toBe(1);
  });

  test("Show Problems activates the permanent Problems bottom-panel tab", async ({ page }) => {
    await openApp(page);
    await page.evaluate(() => window.markdownViewerApp.modules.projectCommands.execute("show-problems"));

    await expect(page.locator("#find-in-files-results-panel")).toBeVisible();
    await expect(page.locator('[data-bottom-panel-tab-id="problems"]')).toHaveClass(/active/);
    await expect(page.locator("#problems-panel-summary")).toHaveText("No problems detected");
  });
});
