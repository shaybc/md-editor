const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp } = require("../helpers/desktop-ui");

test.describe("Apache RAT Manager", () => {
  test("Project menu exposes the standalone license audit entry point", async ({ page }) => {
    await openApp(page);
    await openActionMenu(page);
    const projectMenu = page.locator(".application-menu-project");
    await projectMenu.locator("> .application-menu-category-toggle").hover();
    await projectMenu.locator(".project-license-submenu > .dropdown-toggle").hover();
    const command = projectMenu.locator('[data-project-command="manage-rat-licenses"]');
    await expect(command).toHaveCount(1);
    await expect(command).toContainText("RAT Problems Resolver");
    await expect(projectMenu.locator('[data-project-command="manage-rat-policy"]')).toContainText("Configure RAT policy");
    await expect(projectMenu.locator(".project-license-submenu .project-command")).toHaveText([
      "Configure RAT policy...",
      "RAT Problems Resolver..."
    ]);
  });
});
