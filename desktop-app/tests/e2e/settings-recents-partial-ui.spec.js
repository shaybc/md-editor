const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, selectSettingsTab } = require("../helpers/desktop-ui");

test.describe("desktop settings recents exact migrated UI", () => {
  test("toggles theme and persists it across reloads", async ({ page }) => {
    await openApp(page);

    const initialTheme = await page.locator("html").getAttribute("data-theme");
    const expectedTheme = initialTheme === "dark" ? "light" : "dark";

    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
    await expect(page.locator("#theme-toggle")).toContainText(initialTheme === "dark" ? "Dark Mode" : "Light Mode");

    await page.reload();
    await expect(page.locator("html")).toHaveAttribute("data-theme", expectedTheme);
  });

  test("settings expose and apply IntelliJ tooltip colors", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ theme: "dark" }) },
    });

    await selectSettingsTab(page, "themes");
    await page.locator("#settings-theme-dark-select").selectOption("intellij-dark");
    const darkThemeEditor = page.locator(".settings-theme-token-editor[data-theme-mode='dark']");
    const tooltipGroup = darkThemeEditor.locator(".settings-theme-token-group").filter({ hasText: "Tooltips" });
    await expect(tooltipGroup).toBeVisible();
    await expect(tooltipGroup.locator(".settings-theme-color-input[data-theme-token='lsp-tooltip-bg']")).toHaveValue("#2b2d30");
    await expect(tooltipGroup.locator(".settings-theme-color-input[data-theme-token='lsp-tooltip-text-color']")).toHaveValue("#dfe1e5");
    await expect.poll(() => page.evaluate(() => ({
      background: getComputedStyle(document.documentElement).getPropertyValue("--lsp-tooltip-bg").trim(),
      text: getComputedStyle(document.documentElement).getPropertyValue("--lsp-tooltip-text-color").trim(),
      themeId: document.documentElement.getAttribute("data-app-theme-id")
    }))).toEqual({ background: "#2b2d30", text: "#dfe1e5", themeId: "intellij-dark" });
    await expect.poll(() => page.evaluate(() => {
      const tooltip = document.createElement("div");
      tooltip.className = "cm-tooltip cm-tooltip-hover";
      tooltip.innerHTML = '<div class="cm-tooltip-section"><div class="cm-lsp-hover-tooltip"><div class="cm-lsp-hover-tooltip-content cm-lsp-documentation"><p>Documentation <a href="#">link</a> <code>TypeName</code></p></div></div></div>';
      document.body.appendChild(tooltip);
      const content = tooltip.querySelector(".cm-lsp-hover-tooltip-content");
      const link = tooltip.querySelector("a");
      const colors = {
        background: getComputedStyle(tooltip).backgroundColor,
        contentBackground: getComputedStyle(content).backgroundColor,
        text: getComputedStyle(content).color,
        link: getComputedStyle(link).color
      };
      tooltip.remove();
      return colors;
    })).toEqual({
      background: "rgb(43, 45, 48)",
      contentBackground: "rgb(43, 45, 48)",
      text: "rgb(223, 225, 229)",
      link: "rgb(84, 138, 247)"
    });
  });

  test("settings themes save built-ins and custom app colors", async ({ page }) => {
    await page.addInitScript(() => {
      window.confirm = () => true;
    });
    page.on("dialog", async (dialog) => {
      if (dialog.type() === "prompt") {
        await dialog.accept(dialog.message().includes("Rename") ? "Midnight Notes" : "Night Workbench");
      } else {
        await dialog.accept();
      }
    });
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ theme: "dark" }) },
    });

    await selectSettingsTab(page, "themes");
    await page.locator("#settings-theme-light-select").selectOption("solarized-light");
    await page.locator(".settings-theme-create[data-theme-mode='dark']").click();
    await expect(page.locator("#settings-theme-dark-select")).toContainText("Night Workbench");
    await page.locator(".settings-theme-color-input[data-theme-mode='dark'][data-theme-token='bg-color']").fill("#101820");
    await page.locator(".settings-theme-color-input[data-theme-mode='dark'][data-theme-token='dropzone-bg']").fill("#101820");
    await page.locator(".settings-theme-alpha-input[data-theme-mode='dark'][data-theme-token='dropzone-bg']").fill("0.42");
    await page.locator(".settings-theme-rename[data-theme-mode='dark']").click();
    await expect(page.locator("#settings-theme-dark-select")).toContainText("Midnight Notes");
    await page.locator(".settings-theme-duplicate[data-theme-mode='dark']").click();
    await expect(page.locator("#settings-theme-dark-select")).toContainText("Midnight Notes Copy");
    await page.locator(".settings-theme-delete[data-theme-mode='dark']").click();
    await page.locator("#settings-theme-dark-select").evaluate((select) => {
      const option = Array.from(select.options).find((candidate) => candidate.textContent === "Midnight Notes");
      if (!option) throw new Error("Midnight Notes custom theme option missing");
      select.value = option.value;
      select.dispatchEvent(new Event("change", { bubbles: true }));
    });
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();

    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
      return {
        darkSelection: state.themeSelections?.dark,
        lightSelection: state.themeSelections?.light,
        customCount: state.customThemes?.dark?.length || 0,
        customName: state.customThemes?.dark?.[0]?.name,
        customBg: state.customThemes?.dark?.[0]?.colors?.["bg-color"],
        customDropzone: state.customThemes?.dark?.[0]?.colors?.["dropzone-bg"],
        cssBg: getComputedStyle(document.documentElement).getPropertyValue("--bg-color").trim(),
      };
    })).toMatchObject({
      lightSelection: "solarized-light",
      darkSelection: expect.stringMatching(/^custom-dark-/),
      customCount: 1,
      customName: "Midnight Notes",
      customBg: "#101820",
      customDropzone: "rgba(16, 24, 32, 0.42)",
      cssBg: "#101820",
    });

    await page.reload();
    await expect(page.locator("#desktopActionMenu")).toBeVisible();
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-color").trim())).toBe("#101820");
    await page.locator("#theme-toggle").click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--bg-color").trim())).toBe("#fdf6e3");

    await openActionMenu(page);
    await page.getByRole("button", { name: /^Restore Defaults$/ }).click();
    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
      return {
        customThemes: state.customThemes,
        selections: state.themeSelections,
        cssBg: getComputedStyle(document.documentElement).getPropertyValue("--bg-color").trim(),
      };
    })).toEqual({ customThemes: undefined, selections: undefined, cssBg: "#ffffff" });
  });

  test("renders recent files in the action menu", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerRecentFiles: JSON.stringify([{ name: "notes.md", label: "notes.md", path: "docs/notes.md", updatedAt: Date.now() }]),
      },
    });

    await expect(page.locator(".recent-files-menu .recent-menu-item")).toHaveCount(1);
    await expect(page.locator(".recent-files-menu .recent-menu-item")).toContainText("notes.md");
  });

  test("settings reset all clears cache preferences and recent history", async ({ page }) => {
    await openApp(page, {
      localStorage: {
        markdownViewerGlobalState: JSON.stringify({
          graphAutoClusterThreshold: 1200,
          graphShowFileExtensions: true,
          maxRecentFiles: 2,
          maxRecentFolders: 1,
          startupBehavior: "untitled",
          sidebarVisible: false,
        }),
        markdownViewerRecentFiles: JSON.stringify([{ name: "one.md", label: "one.md", path: "docs/one.md", updatedAt: Date.now() }]),
        markdownViewerRecentFolders: JSON.stringify([{ name: "Vault One", label: "Vault One", path: "C:/vault-one", updatedAt: Date.now() }]),
      },
    });
    await page.evaluate(async () => {
      const cache = await caches.open("md-editor-test-cache");
      await cache.put("/cached-test", new Response("cached"));
    });
    await expect.poll(() => page.evaluate(async () => (await caches.keys()).includes("md-editor-test-cache"))).toBe(true);

    await selectSettingsTab(page, "reset");
    await page.locator("#settings-reset-all").click();
    await expect(page.locator("#app-notification-modal")).toBeVisible();
    await expect(page.locator("#app-notification-message")).toContainText("Reset all settings data?");
    await page.locator('#app-notification-actions [data-notification-button-id="confirm"]').click();
    await expect(page.locator("#app-notification-message")).toContainText("Cache, preferences, recent history, and saved tab drafts reset.");
    await page.locator('#app-notification-actions [data-notification-button-id="ok"]').click();

    await selectSettingsTab(page, "graph");
    await expect(page.locator("#settings-graph-auto-cluster-threshold")).toHaveValue("1000");
    await expect(page.locator("#settings-graph-most-referenced-percent")).toHaveValue("10");
    await expect(page.locator("#settings-graph-show-file-extensions")).not.toBeChecked();
    await selectSettingsTab(page, "interface");
    await expect(page.locator("#settings-max-recent-files")).toHaveValue("10");
    await expect(page.locator("#settings-max-recent-folders")).toHaveValue("10");
    await expect(page.locator(".recent-files-menu .recent-empty-item")).toHaveText("No recent files");
    await expect(page.locator(".recent-folders-menu .recent-empty-item")).toHaveText("No recent folders");
    await expect.poll(() => page.evaluate(async () => ({
      cacheKeys: await caches.keys(),
      globalState: JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}"),
      recentFiles: JSON.parse(localStorage.getItem("markdownViewerRecentFiles") || "[]"),
      recentFolders: JSON.parse(localStorage.getItem("markdownViewerRecentFolders") || "[]"),
    }))).toEqual({ cacheKeys: [], globalState: {}, recentFiles: [], recentFolders: [] });
  });

  test("last-tabs startup with no saved tabs opens an empty workspace", async ({ page }) => {
    await openApp(page, {
      localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "last-tabs" }) },
    });
    await page.evaluate(() => {
      localStorage.removeItem("markdownViewerTabs");
      localStorage.removeItem("markdownViewerActiveTab");
    });
    await page.reload();

    await expect(page.locator("#tab-list .tab-item")).toHaveCount(0);
    await expect(page.locator(".content-container")).toHaveClass(/no-open-tabs/);
    await expect(page.locator("#markdown-editor")).not.toBeVisible();
  });
});
