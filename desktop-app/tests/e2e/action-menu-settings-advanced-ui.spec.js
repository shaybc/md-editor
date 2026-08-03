const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, selectSettingsTab } = require("../helpers/desktop-ui");

test.describe("desktop action menu and advanced settings UI", () => {
  test("opens help about and license surfaces from desktop menu", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);

    await page.evaluate(() => document.querySelector(".open-help-home")?.click());
    await expect(page.locator("#tab-list .tab-item", { hasText: "Help" })).toBeVisible();
    await expect(page.locator("body")).toContainText("MD-Editor User Guide");

    await openActionMenu(page);
    await page.evaluate(() => document.querySelector("#about-modal").style.display = "flex");
    await expect(page.locator("#about-modal")).toBeVisible();
    await page.locator("#about-app-license").click();
    await expect(page.locator("#tab-list .tab-item", { hasText: "License" })).toBeVisible();
  });

  test("action submenus reset after closing and reopening the menu", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);
    const toolsSubmenu = page.locator(".tools-menu-submenu");
    await toolsSubmenu.locator("> .dropdown-toggle").hover();
    await expect(toolsSubmenu.locator("> .action-submenu")).toBeVisible();
    await page.keyboard.press("Escape");

    await openActionMenu(page);
    await expect(page.locator(".header-action-menu .action-submenu:visible")).toHaveCount(0);
  });

  test("theme controls are visible and save without leaving settings", async ({ page }) => {
    await openApp(page);
    await selectSettingsTab(page, "themes");
    await expect(page.locator("#settings-theme-light-select")).toBeVisible();
    await expect(page.locator("#settings-theme-dark-select")).toBeVisible();
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();
  });

  test("settings reset all exposes destructive confirmation controls", async ({ page }) => {
    await openApp(page);
    await selectSettingsTab(page, "reset");

    await expect(page.locator("#settings-reset-all")).toBeVisible();
    await expect(page.locator("#settings-reset-cache")).toBeVisible();
    await expect(page.locator("#settings-reset-preferences")).toBeVisible();
  });
});