const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, openDesktopFolder } = require("../helpers/desktop-ui");
const { createTempWorkspace, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("Apache RAT Manager workflow", () => {
  let folderPath;

  test.afterEach(async () => {
    if (folderPath) await removeTempWorkspace(folderPath);
    folderPath = "";
  });

  test("opens a Maven project audit without running Maven or requiring a reported file", async ({ page }) => {
    folderPath = await createTempWorkspace({
      "pom.xml": [
        "<project>",
        "  <modelVersion>4.0.0</modelVersion>",
        "  <groupId>example</groupId>",
        "  <artifactId>rat-demo</artifactId>",
        "  <version>1.0.0</version>",
        "</project>",
        ""
      ].join("\n")
    }, "md-editor-rat-");
    await openApp(page);
    await openDesktopFolder(page, folderPath);
    await openActionMenu(page);
    const projectMenu = page.locator(".application-menu-project");
    await projectMenu.locator("> .application-menu-category-toggle").hover();
    await projectMenu.locator(".project-license-submenu > .dropdown-toggle").hover();
    const command = projectMenu.locator('[data-project-command="manage-rat-licenses"]');
    await expect(command).toBeEnabled();
    await command.click();
    await expect(page.locator(".rat-manager-dialog")).toBeVisible();
    await expect(page.locator(".rat-manager-problem")).toContainText("Project-level RAT finding");
    await expect(page.locator(".rat-manager-actions")).toContainText("Run Apache RAT check");
    await page.locator("[data-rat-help-general]").click();
    await expect(page.locator(".rat-manager-help-dialog")).toContainText("Apache RAT (Release Audit Tool)");
    await expect(page.locator(".rat-manager-help-links a").first()).toHaveAttribute("target", "_blank");
    await page.locator(".rat-manager-help-dialog [data-rat-help-close]").last().click();
    await page.locator(".rat-manager-action-help").first().click();
    await expect(page.locator(".rat-manager-help-dialog")).toContainText("How it affects the build");
    await page.locator(".rat-manager-help-dialog [data-rat-help-close]").last().click();
    await expect(page.locator('[data-rat-back]')).toHaveCount(0);
  });
});
