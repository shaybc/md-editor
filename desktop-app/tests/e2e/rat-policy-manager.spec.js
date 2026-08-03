const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp, openDesktopFolder } = require("../helpers/desktop-ui");
const { createTempWorkspace, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("Apache RAT Policy Manager", () => {
  let folderPath;

  test.afterEach(async () => {
    if (folderPath) await removeTempWorkspace(folderPath);
    folderPath = "";
  });

  test("opens the guided policy wizard without running Maven and builds a preview", async ({ page }) => {
    folderPath = await createTempWorkspace({
      "pom.xml": [
        "<project>",
        "  <modelVersion>4.0.0</modelVersion>",
        "  <groupId>example</groupId>",
        "  <artifactId>policy-demo</artifactId>",
        "  <version>1.0.0</version>",
        "</project>",
        ""
      ].join("\n")
    }, "md-editor-rat-policy-");
    await openApp(page);
    await openDesktopFolder(page, folderPath);
    await page.evaluate(() => {
      window.__ratPolicyCommands = 0;
      const terminal = window.markdownViewerApp.modules.desktopTerminal;
      if (terminal?.runCommand) {
        const original = terminal.runCommand.bind(terminal);
        terminal.runCommand = (...args) => { window.__ratPolicyCommands += 1; return original(...args); };
      }
    });
    await openActionMenu(page);
    const projectMenu = page.locator(".application-menu-project");
    await projectMenu.locator("> .application-menu-category-toggle").hover();
    await projectMenu.locator(".project-license-submenu > .dropdown-toggle").hover();
    const command = projectMenu.locator('[data-project-command="manage-rat-policy"]');
    await expect(command).toBeEnabled();
    await command.click();

    await expect(page.locator(".rat-policy-dialog")).toBeVisible();
    await expect(page.locator(".rat-policy-body")).toContainText("Current project policy");
    await expect.poll(() => page.evaluate(() => window.__ratPolicyCommands)).toBe(0);

    await page.locator('[data-rat-policy-help="overview"]').click();
    await expect(page.locator(".rat-policy-help")).toContainText("What a RAT policy controls");
    await expect(page.locator(".rat-policy-help a").first()).toHaveAttribute("target", "_blank");
    await page.locator(".rat-policy-help [data-close]").last().click();

    await page.locator('[data-step="1"]').click();
    await page.locator('input[name="license"][value="Apache-2.0"]').check();
    await page.locator('[data-step="4"]').click();
    await page.locator('[data-field="acknowledgePolicyOwnership"]').check();
    await page.locator("[data-next]").click();
    await expect(page.locator(".rat-policy-preview")).toBeVisible();
    await expect(page.locator(".rat-policy-diffs")).toContainText("apache-rat-plugin");
    await expect.poll(() => page.evaluate(() => window.__ratPolicyCommands)).toBe(0);
  });

  test("shows advanced audit bypasses as explicit non-default choices", async ({ page }) => {
    folderPath = await createTempWorkspace({ "pom.xml": "<project><artifactId>demo</artifactId></project>\n" }, "md-editor-rat-policy-advanced-");
    await openApp(page);
    await openDesktopFolder(page, folderPath);
    await page.evaluate(() => window.markdownViewerApp.modules.ratPolicyManager.open({ projectPath: window.markdownViewerApp.modules.projectCommands.getContext().folderPath, mode: "advanced", route: "coverage" }));
    await expect(page.locator(".rat-policy-dialog")).toBeVisible();
    await expect(page.locator(".rat-policy-advanced details")).toContainText("bypasses license audit");
    await expect(page.locator('[data-field="disableExecution"]')).toBeDisabled();
    await expect(page.locator('[data-field="skip"]')).not.toBeChecked();
    await page.locator(".rat-policy-advanced details summary").click();
    await page.locator('[data-field="skip"]').check();
    await page.locator(".rat-policy-close").click();
    await expect(page.locator("#app-notification-modal")).toBeVisible();
    await expect(page.locator("#app-notification-title")).toHaveText("Discard RAT policy draft?");
    await expect(page.locator("#app-notification-message")).toContainText("policy choices have not been applied");
    await page.locator('[data-notification-button-id="cancel"]').click();
    await expect(page.locator(".rat-policy-dialog")).toBeVisible();
  });
});
