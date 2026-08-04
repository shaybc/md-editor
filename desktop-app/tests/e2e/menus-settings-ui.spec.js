const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, selectSettingsTab } = require("../helpers/desktop-ui");

test.describe("desktop menus and settings UI", () => {
  test("suppresses the browser context menu on unhandled app surfaces", async ({ page }) => {
    await openApp(page);
    await expect(page.locator(".content-container")).toHaveCount(1);

    const defaultPrevented = await page.locator(".content-container").evaluate((element) => {
      const event = new MouseEvent("contextmenu", {
        bubbles: true,
        button: 2,
        cancelable: true,
        clientX: 480,
        clientY: 260,
      });
      element.dispatchEvent(event);
      return event.defaultPrevented;
    });

    expect(defaultPrevented).toBe(true);
  });
  test("action menu exposes desktop workflow sections", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);

    await expect(page.locator(".recent-files-submenu > .dropdown-toggle")).toContainText("Recent files");
    await expect(page.locator(".recent-folders-submenu > .dropdown-toggle")).toContainText("Recent folders");
    await expect(page.locator(".view-menu-submenu > .dropdown-toggle")).toContainText("View");
    await expect(page.locator(".tools-menu-submenu > .dropdown-toggle")).toContainText("Tools");
    await expect(page.locator(".header-action-menu .open-code-converter-dialog")).toHaveCount(1);
    await expect(page.locator(".header-action-menu .open-settings-dialog")).toBeVisible();
  });

  test("status bar visibility can be toggled from the view menu", async ({ page }) => {
    await openApp(page);

    await openActionMenu(page);
    const viewSubmenu = page.locator(".view-menu-submenu");
    await viewSubmenu.locator("> .dropdown-toggle").hover();
    await viewSubmenu.locator("> .action-submenu > .toggle-status-bar").click();
    await expect(page.locator("#app-status-line")).toBeHidden();

    await viewSubmenu.locator("> .dropdown-toggle").hover();
    await viewSubmenu.locator("> .action-submenu > .toggle-status-bar").click();
    await expect(page.locator("#app-status-line")).toBeVisible();
  });

  test("settings tabs, search, themes, and syntax controls are reachable", async ({ page }) => {
    await openApp(page);

    await selectSettingsTab(page, "themes");
    await expect(page.locator("#settings-theme-light-select")).toBeVisible();
    await expect(page.locator("#settings-theme-dark-select")).toBeVisible();

    await selectSettingsTab(page, "syntax");
    await expect(page.locator("#settings-syntax-language")).toBeVisible();
    await expect(page.locator("#settings-syntax-color-grid")).toBeVisible();

    await page.locator("#settings-search-input").fill("startup");
    await expect(page.locator(".settings-search-empty")).toBeHidden();
  });

  test("file opening modes support defaults, drafts, bulk actions, and custom extensions", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty", defaultOpenViewMode: "preview" })
      }
    });

    await selectSettingsTab(page, "file-opening-modes");
    const untitledMode = page.locator('[data-opening-mode-key="untitled"]');
    const markdownMode = page.locator('[data-opening-mode-key="extension:md"]');
    await expect(untitledMode).toHaveValue("editor");
    await expect(markdownMode).toHaveValue("split");
    await page.locator("#settings-file-opening-mode-search").fill("markdown");
    await expect(page.locator(".settings-file-opening-mode-row:visible")).toHaveCount(4);
    await page.locator("#settings-file-opening-mode-search").fill("");

    await markdownMode.selectOption("preview");
    await page.locator("#settings-modal-cancel").click();
    await selectSettingsTab(page, "file-opening-modes");
    await expect(page.locator('[data-opening-mode-key="extension:md"]')).toHaveValue("split");

    await selectSettingsTab(page, "folder-view");
    await page.locator("#settings-supported-text-extensions").fill("md markdown java foo");
    await selectSettingsTab(page, "file-opening-modes");
    const customMode = page.locator('[data-opening-mode-key="extension:foo"]');
    await expect(customMode).toHaveValue("editor");
    await page.locator("#settings-file-opening-mode-set-all").selectOption("preview");
    await page.locator("#settings-file-opening-mode-apply-all").click();
    await expect(page.locator('[data-opening-mode-key="extension:java"]')).toHaveValue("preview");
    await page.locator("#settings-file-opening-mode-restore").click();
    await expect(page.locator('[data-opening-mode-key="untitled"]')).toHaveValue("editor");
    await expect(page.locator('[data-opening-mode-key="extension:md"]')).toHaveValue("split");
    await expect(page.locator('[data-opening-mode-key="extension:html"]')).toHaveValue("split");
    await page.locator('[data-opening-mode-key="untitled"]').selectOption("preview");
    await page.locator('[data-opening-mode-key="extension:md"]').selectOption("editor");
    await page.locator('[data-opening-mode-key="extension:foo"]').selectOption("preview");
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();

    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
      return state.fileOpeningModes;
    })).toEqual({
      version: 1,
      modes: { untitled: "preview", "extension:md": "editor", "extension:foo": "preview" }
    });

    await page.waitForTimeout(250);
    await page.reload();
    await expect(page.locator(".content-container")).toBeVisible();
    await selectSettingsTab(page, "file-opening-modes");
    await expect(page.locator('[data-opening-mode-key="untitled"]')).toHaveValue("preview");
    await expect(page.locator('[data-opening-mode-key="extension:md"]')).toHaveValue("editor");
    await expect(page.locator('[data-opening-mode-key="extension:foo"]')).toHaveValue("preview");
    await page.locator("#settings-modal-cancel").click();

    const openedModes = await page.evaluate(() => {
      const tabs = window.markdownViewerApp.modules.tabs;
      const untitled = tabs.newTab("", "Untitled preference check");
      const markdown = tabs.openNewUnsavedFileInTab("notes.md");
      const custom = tabs.openNewUnsavedFileInTab("notes.foo");
      const java = tabs.openNewUnsavedFileInTab("Example.java");
      const html = tabs.openNewUnsavedFileInTab("index.html");
      return {
        untitled: untitled?.viewMode,
        markdown: markdown?.viewMode,
        custom: custom?.viewMode,
        java: java?.viewMode,
        html: html?.viewMode
      };
    });
    expect(openedModes).toEqual({ untitled: "preview", markdown: "editor", custom: "preview", java: "editor", html: "split" });
  });

  test("side rail bar style saves and restores spacious labeled buttons", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await selectSettingsTab(page, "interface");

    const railButtons = page.locator(".sidebar-view-rail-button");
    await expect(page.locator("#settings-sidebar-rail-style")).toHaveValue("thin");
    await expect(railButtons).toHaveCount(8);
    await expect(page.locator(".sidebar-view-rail-label")).toHaveCount(8);

    await page.locator("#settings-sidebar-rail-style").selectOption("spacious");
    await page.locator("#settings-modal-save").click();

    await expect(page.locator("body")).toHaveClass(/sidebar-rail-spacious/);
    await expect(page.locator(".sidebar-view-rail-label").first()).toBeVisible();
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}").sidebarRailStyle)).toBe("spacious");
    await page.locator(".content-container").evaluate((element) => element.classList.add("sidebar-hidden"));
    await expect.poll(() => page.evaluate(() => {
      const rail = document.querySelector(".folder-tree-pane")?.getBoundingClientRect();
      const editor = document.querySelector(".editor-workspace")?.getBoundingClientRect();
      return !!rail && !!editor && editor.left >= rail.right;
    })).toBe(true);
    await page.locator(".content-container").evaluate((element) => element.classList.remove("sidebar-hidden"));
    await page.waitForTimeout(250);

    await page.reload();
    await expect(page.locator("body")).toHaveClass(/sidebar-rail-spacious/);
    await expect(page.locator(".sidebar-view-rail-label").first()).toBeVisible();

    await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
      localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ ...state, sidebarRailStyle: "unsupported" }));
    });
    await page.reload();
    await expect(page.locator("body")).toHaveClass(/sidebar-rail-thin/);
    await expect(page.locator(".sidebar-view-rail-label").first()).toBeHidden();
  });

  test("side rail icon visibility saves, restores, and keeps menu access", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });

    await page.evaluate(() => {
      const filesButton = document.querySelector('[data-sidebar-rail-icon="files"]');
      const gitButton = document.querySelector('[data-sidebar-rail-icon="git"]');
      filesButton?.classList.remove("active");
      filesButton?.setAttribute("aria-pressed", "false");
      gitButton?.classList.add("active");
      gitButton?.setAttribute("aria-pressed", "true");
    });
    await expect(page.locator('[data-sidebar-rail-icon="git"]')).toHaveClass(/active/);
    await selectSettingsTab(page, "interface");
    await page.locator("#settings-sidebar-rail-show-git").uncheck();
    await page.locator("#settings-sidebar-rail-show-api-client").uncheck();
    await page.locator("#settings-sidebar-rail-show-regex-tester").uncheck();
    await page.locator("#settings-sidebar-rail-show-ai-companion").uncheck();
    await page.locator("#settings-sidebar-rail-show-settings").uncheck();
    await page.locator("#settings-modal-save").click();

    for (const iconId of ["git", "api-client", "regex-tester", "ai-companion", "settings"]) {
      await expect(page.locator(`[data-sidebar-rail-icon="${iconId}"]`)).toBeHidden();
    }
    await expect(page.locator('[data-sidebar-rail-icon="files"]')).toHaveClass(/active/);
    await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}").sidebarRailIconVisibility)).toEqual({
      git: false,
      "api-client": false,
      "regex-tester": false,
      "ai-companion": false,
      settings: false,
    });

    await openActionMenu(page);
    await expect(page.locator(".header-action-menu .toggle-ai-companion-panel")).toHaveCount(1);
    const toolsSubmenu = page.locator(".tools-menu-submenu");
    await toolsSubmenu.locator("> .dropdown-toggle").hover();
    await expect(toolsSubmenu.locator("> .action-submenu .open-api-client")).toHaveCount(1);

    await page.reload();
    for (const iconId of ["git", "api-client", "regex-tester", "ai-companion", "settings"]) {
      await expect(page.locator(`[data-sidebar-rail-icon="${iconId}"]`)).toBeHidden();
    }
  });

  test("side rail icons reorder after a long press and persist", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    const filesButton = page.locator('[data-sidebar-rail-icon="files"]');
    const searchButton = page.locator('[data-sidebar-rail-icon="search"]');
    const filesBounds = await filesButton.boundingBox();
    const searchBounds = await searchButton.boundingBox();

    await page.mouse.move(filesBounds.x + filesBounds.width / 2, filesBounds.y + filesBounds.height / 2);
    await page.mouse.down();
    await page.mouse.move(filesBounds.x + filesBounds.width / 2 + 4, filesBounds.y + filesBounds.height / 2);
    await page.waitForTimeout(100);
    await page.mouse.up();
    await expect(filesButton).not.toHaveClass(/sidebar-rail-button-dragging/);
    await expect.poll(() => page.evaluate(() => {
      return Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon)
        .slice(0, 2);
    })).toEqual(["files", "search"]);

    await page.mouse.move(filesBounds.x + filesBounds.width / 2, filesBounds.y + filesBounds.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await expect(filesButton).toHaveClass(/sidebar-rail-button-dragging/);
    await page.mouse.move(searchBounds.x + searchBounds.width / 2, searchBounds.y + searchBounds.height + 2);
    await page.mouse.up();

    await expect.poll(() => page.evaluate(() => {
      return Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon)
        .slice(0, 2);
    })).toEqual(["search", "files"]);
    await expect.poll(() => page.evaluate(() => {
      return JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}").sidebarRailIconOrder?.slice(0, 2);
    })).toEqual(["search", "files"]);
    await page.waitForTimeout(250);

    await page.reload();
    await expect.poll(() => page.evaluate(() => {
      return Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon)
        .slice(0, 2);
    })).toEqual(["search", "files"]);
  });

  test("side rail preferences normalize malformed saved orders", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({
          startupBehavior: "empty",
          sidebarRailIconOrder: ["settings", "git", "git", "unknown"],
          sidebarRailIconVisibility: { "api-client": false },
        }),
      },
    });

    await expect.poll(() => page.evaluate(() => {
      return Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon);
    })).toEqual(["git", "files", "search", "api-client", "regex-tester", "convert", "ai-companion", "settings"]);
    await expect(page.locator('[data-sidebar-rail-icon="api-client"]')).toBeHidden();

    await selectSettingsTab(page, "interface");
    await page.locator("#settings-sidebar-rail-show-api-client").check();
    await page.locator("#settings-modal-save").click();
    await expect(page.locator('[data-sidebar-rail-icon="api-client"]')).toBeVisible();
    await expect.poll(() => page.evaluate(() => {
      return Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon);
    })).toEqual(["git", "files", "search", "api-client", "regex-tester", "convert", "ai-companion", "settings"]);
  });

  test("AI Companion can move between the bottom and main rail areas while Settings stays fixed", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    const rail = page.locator(".sidebar-view-rail");
    const filesButton = page.locator('[data-sidebar-rail-icon="files"]');
    const aiButton = page.locator('[data-sidebar-rail-icon="ai-companion"]');
    const settingsButton = page.locator('[data-sidebar-rail-icon="settings"]');

    await expect(rail).toHaveClass(/sidebar-rail-ai-bottom/);
    await expect.poll(async () => {
      const railBounds = await rail.boundingBox();
      const aiBounds = await aiButton.boundingBox();
      const settingsBounds = await settingsButton.boundingBox();
      return {
        settingsBottomGap: Math.round(railBounds.y + railBounds.height - settingsBounds.y - settingsBounds.height),
        aiSettingsGap: Math.round(settingsBounds.y - aiBounds.y - aiBounds.height),
      };
    }).toEqual({ settingsBottomGap: 8, aiSettingsGap: 6 });

    const settingsBounds = await settingsButton.boundingBox();
    await page.mouse.move(settingsBounds.x + settingsBounds.width / 2, settingsBounds.y + settingsBounds.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await expect(settingsButton).not.toHaveClass(/sidebar-rail-button-dragging/);
    await page.mouse.up();
    await expect(page.locator("#settings-modal")).toBeVisible();
    await page.locator("#settings-modal-close").click();

    const aiBounds = await aiButton.boundingBox();
    const filesBounds = await filesButton.boundingBox();
    await page.mouse.move(aiBounds.x + aiBounds.width / 2, aiBounds.y + aiBounds.height / 2);
    await page.mouse.down();
    await page.waitForTimeout(450);
    await expect(aiButton).toHaveClass(/sidebar-rail-button-dragging/);
    await page.mouse.move(filesBounds.x + filesBounds.width / 2, filesBounds.y - 2);
    await page.mouse.up();

    await expect(rail).not.toHaveClass(/sidebar-rail-ai-bottom/);
    await expect.poll(() => page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon);
      return { first: ids[0], last: ids[ids.length - 1] };
    })).toEqual({ first: "ai-companion", last: "settings" });
    await page.waitForTimeout(250);

    await page.reload();
    await expect(rail).not.toHaveClass(/sidebar-rail-ai-bottom/);
    await expect.poll(() => page.evaluate(() => {
      const ids = Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => button.dataset.sidebarRailIcon);
      return { first: ids[0], last: ids[ids.length - 1] };
    })).toEqual({ first: "ai-companion", last: "settings" });
  });

  test("restoring defaults resets side rail visibility and order", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({
          startupBehavior: "empty",
          sidebarRailIconOrder: ["settings", "files", "search", "git", "api-client", "regex-tester", "convert", "ai-companion"],
          sidebarRailIconVisibility: { git: false, "api-client": false, "regex-tester": false, "ai-companion": false, settings: false },
        }),
      },
    });

    await openActionMenu(page);
    await page.locator(".header-action-menu .restore-defaults-button").evaluate((button) => button.click());
    await page.locator('#app-notification-modal [data-notification-button-id="confirm"]').click();

    await expect.poll(() => page.evaluate(() => {
      return Array.from(document.querySelectorAll(".sidebar-view-rail-button[data-sidebar-rail-icon]"))
        .map((button) => ({ id: button.dataset.sidebarRailIcon, hidden: button.hidden }));
    })).toEqual([
      { id: "files", hidden: false },
      { id: "search", hidden: false },
      { id: "git", hidden: false },
      { id: "api-client", hidden: false },
      { id: "regex-tester", hidden: false },
      { id: "convert", hidden: false },
      { id: "ai-companion", hidden: false },
      { id: "settings", hidden: false },
    ]);
  });

  test("desktop zoom menu actions update app zoom state", async ({ page }) => {
    await openApp(page);

    await page.evaluate(() => document.querySelector(".app-zoom-in-button")?.click());
    await expect.poll(() => page.evaluate(() => document.documentElement.style.zoom || "")).not.toBe("");

    await page.evaluate(() => document.querySelector(".app-zoom-reset-button")?.click());
    await expect(page.locator("#desktopActionMenu")).toBeVisible();
  });

  test("tools submenu groups graph export sort and converter commands", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);

    const toolsSubmenu = page.locator(".tools-menu-submenu");
    await toolsSubmenu.locator("> .dropdown-toggle").hover();
    const toolsMenu = toolsSubmenu.locator("> .action-submenu");
    await expect(toolsMenu).toBeVisible();

    await expect(toolsMenu.locator("> .open-graph-view")).toHaveCount(1);
    await expect(toolsMenu.locator("> .open-graph-view")).toBeDisabled();
    await expect(toolsMenu.locator("> .export-folder-to-graph")).toHaveCount(1);
    await expect(toolsMenu.locator("> .open-editor-sort-dialog")).toBeEnabled();
    await expect(toolsMenu.locator("> .open-code-converter-dialog")).toHaveCount(1);
    await expect(toolsMenu.locator("> .update-project-button")).toHaveCount(1);
    await expect(toolsMenu.locator("> .set-original-source-root")).toHaveCount(1);
  });

  test("edit menu and snippet settings stay wired", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);

    await expect.poll(() => page.locator(".header-action-menu > .action-menu").evaluate((menu) => {
      const children = Array.from(menu.children);
      return children.findIndex((child) => child.classList.contains("edit-menu-submenu"))
        < children.findIndex((child) => child.classList.contains("find-menu-submenu"));
    })).toBe(true);

    const editSubmenu = page.locator(".edit-menu-submenu");
    await editSubmenu.locator("> .dropdown-toggle").hover();
    const editMenu = editSubmenu.locator("> .action-submenu");
    await expect(editMenu).toBeVisible();
    await expect(editMenu.locator('[data-edit-command="undo"]')).toBeVisible();
    await expect(editMenu.locator('[data-edit-command="indent-more"]')).toHaveCount(1);
    await expect(editMenu.locator('[data-edit-command="autocomplete-toggle"]')).toHaveAttribute("aria-pressed", "false");
    await expect(editMenu.locator('[data-edit-command="space-to-tab"]').first()).toHaveText("4 Space to TAB");
    await expect(editMenu.locator('[aria-label="UTF8 conversion options"]')).toHaveCount(1);
    await expect(editMenu.locator('[aria-label="Encoded URI options"]')).toHaveCount(1);
    await expect(editMenu.locator('[aria-label="Base64 options"]')).toHaveCount(1);
    const delimiterSubmenu = editMenu.locator(".action-menu-submenu", { hasText: "Convert Line Delimiters To" });
    await delimiterSubmenu.locator("> .dropdown-toggle").hover();
    await expect(delimiterSubmenu.locator('[data-line-delimiter="crlf"]')).toHaveCount(1);
    await expect(delimiterSubmenu.locator('[data-line-delimiter="lf"]')).toHaveCount(1);
    await delimiterSubmenu.locator('[data-line-delimiter="lf"]').evaluate((button) => button.click());
    await expect(page.locator("#line-delimiter-scope-modal")).toBeVisible();
    await expect(page.locator("#line-delimiter-scope-folder")).toBeChecked();
    await expect(page.locator("#line-delimiter-folder-tree")).toBeVisible();
    await expect(page.locator("#line-delimiter-folder-selected")).toHaveText(". (Workspace root)");
    await page.locator("#line-delimiter-scope-cancel").click();
    await openActionMenu(page);

    await page.locator(".open-settings-dialog").first().click();
    await selectSettingsTab(page, "snippets");
    await expect(page.locator("#settings-snippet-language")).toHaveValue("javascript");
    await expect(page.locator("#settings-snippet-list")).toContainText("function");
    await expect(page.locator('#settings-snippet-language option[value="java"]')).toHaveCount(1);
    await page.locator("#settings-snippet-language").selectOption("java");
    await expect(page.locator("#settings-snippet-list")).toContainText("main");


  });

  test("view submenu exposes zoom fullscreen and symbol controls", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);

    const viewSubmenu = page.locator(".view-menu-submenu");
    await viewSubmenu.locator("> .dropdown-toggle").hover();
    const viewMenu = viewSubmenu.locator("> .action-submenu");
    await expect(viewMenu).toBeVisible();

    await expect(viewMenu.locator("> .toggle-fullscreen-button .menu-shortcut-label")).toHaveText("F11");
    await expect(viewMenu.locator("> .app-zoom-in-button .menu-shortcut-label")).toHaveText("Ctrl+Shift+=");
    await expect(viewMenu.locator("> .app-zoom-out-button .menu-shortcut-label")).toHaveText("Ctrl+-");
    await expect(viewMenu.locator("> .app-zoom-reset-button .menu-shortcut-label")).toHaveText("Ctrl+0");

    const symbolsSubmenu = page.locator(".show-symbols-menu-submenu");
    await expect(symbolsSubmenu.locator("> .dropdown-toggle")).toContainText("Show Symbols");
    await symbolsSubmenu.locator("> .dropdown-toggle").hover();
    await expect(symbolsSubmenu.locator("> .action-submenu")).toBeVisible();
    await expect(symbolsSubmenu.locator('.show-symbol-toggle[data-show-symbol="spaceTab"]')).toBeVisible();
    await expect(symbolsSubmenu.locator('.show-symbol-toggle[data-show-symbol="wrapSymbol"]')).toBeVisible();
    const indentGuideToggle = symbolsSubmenu.locator('.show-symbol-toggle[data-show-symbol="indentGuide"]');
    await expect(indentGuideToggle).toHaveAttribute("aria-pressed", "true");
    await expect(indentGuideToggle.locator(".bi-check2")).not.toHaveClass(/invisible/);
    await expect(indentGuideToggle).toHaveCSS("background-color", "rgba(0, 0, 0, 0)");
  });

  test("settings side tabs and search route to the right panels", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);
    await page.locator(".open-settings-dialog").first().click();

    await expect(page.locator("#settings-modal")).toBeVisible();
    await expect(page.locator("#settings-search-input")).toBeFocused();
    await expect(page.locator(".settings-tab-button[data-settings-tab='interface']")).toHaveClass(/active/);
    await expect(page.locator(".settings-tab-button[data-settings-tab='recent']")).toHaveCount(0);

    await selectSettingsTab(page, "confirmations");
    await expect(page.locator("#settings-confirm-delete-files")).toBeVisible();
    await expect(page.locator("#settings-confirm-edited-prompt-attachment-removal")).toBeVisible();

    await page.locator("#settings-search-input").fill("tooltip");
    await expect(page.locator(".settings-tab-button[data-settings-tab='interface']")).toHaveClass(/active/);
    await expect(page.locator("#settings-context-menu-tooltip-delay")).toBeVisible();

    await page.locator("#settings-search-input").fill("reset");
    await expect(page.locator(".settings-tab-button[data-settings-tab='reset']")).toHaveClass(/active/);
    await expect(page.locator("#settings-reset-all")).toBeVisible();
  });

  test("keyboard shortcuts can be searched, reassigned, and saved", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await selectSettingsTab(page, "keyboard-shortcuts");

    const shortcutRows = page.locator(".settings-shortcut-row");
    await expect(shortcutRows).toHaveCount(17);
    await page.locator("#settings-shortcuts-search").fill("Save Changes");
    await expect(shortcutRows).toHaveCount(1);

    const saveRow = page.locator('[data-shortcut-command="save-current-file"]');
    await saveRow.locator('[data-shortcut-action="edit"]').first().click();
    await page.keyboard.press("Control+K");
    await expect(saveRow.locator(".settings-shortcut-binding")).toHaveText("Ctrl+K");
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();

    const savedState = await page.evaluate(() => JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}"));
    expect(savedState.keyboardShortcutOverrides["save-current-file"]).toEqual({ key: "k", primary: true, alt: false, shift: false });
  });
  test("settings syntax colors can be edited per language", async ({ page }) => {
    await openApp(page);
    await selectSettingsTab(page, "syntax");

    await page.locator("#settings-syntax-language").selectOption("javascript");
    await expect(page.locator(".settings-syntax-color-input")).toHaveCount(24);
    await page.locator("#settings-syntax-color-keyword").evaluate((input) => {
      input.value = "#ff00aa";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect(page.locator("#settings-syntax-color-keyword")).toHaveValue("#ff00aa");
  });

  test("settings syntax colors can be previewed in the interactive editor", async ({ page }) => {
    await openApp(page);
    await selectSettingsTab(page, "syntax");

    await expect(page.locator("#settings-syntax-open-editor")).toBeVisible();
    await page.locator("#settings-syntax-language").selectOption("javascript");
    await page.locator("#settings-syntax-open-editor").click();

    await expect(page.locator("#settings-syntax-editor-layer")).toBeVisible();
    await expect(page.locator("#settings-syntax-editor-language")).toHaveValue("javascript");
    await expect(page.locator(".settings-syntax-editor-color-input")).toHaveCount(24);
    await expect(page.locator("#settings-syntax-editor-preview .cm-editor, #settings-syntax-editor-preview pre")).toHaveCount(1);
    await expect.poll(() => page.evaluate(() => {
      const sidebar = document.querySelector(".settings-syntax-editor-sidebar")?.getBoundingClientRect();
      const preview = document.querySelector(".settings-syntax-editor-preview")?.getBoundingClientRect();
      return Boolean(sidebar && preview && sidebar.width >= 300 && preview.left >= sidebar.right - 1);
    })).toBe(true);

    await page.locator("#settings-syntax-editor-color-keyword").evaluate((input) => {
      input.value = "#00ffaa";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await expect.poll(() => page.locator("#settings-syntax-editor-preview").evaluate((element) => (
      element.style.getPropertyValue("--editor-syntax-keyword").trim()
    ))).toBe("#00ffaa");

    await page.locator("#settings-syntax-editor-save").click();
    await expect(page.locator("#settings-syntax-editor-layer")).toBeHidden();
    await expect(page.locator("#settings-syntax-color-keyword")).toHaveValue("#00ffaa");

    await page.locator("#settings-syntax-open-editor").click();
    await page.locator("#settings-syntax-editor-color-keyword").evaluate((input) => {
      input.value = "#aa00ff";
      input.dispatchEvent(new Event("input", { bubbles: true }));
      input.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#settings-syntax-editor-close").click();
    await expect(page.locator("#settings-syntax-editor-layer")).toBeHidden();
    await expect(page.locator("#settings-syntax-color-keyword")).toHaveValue("#00ffaa");
  });
});
