const { test, expect } = require("./desktop-fixture");
const { openApp, selectSettingsTab } = require("../helpers/desktop-ui");

test.describe("AI execution security settings", () => {
  test("defaults to deny-and-audit and enables auto-run only for sandbox-shell", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await selectSettingsTab(page, "ai-security");

    const shellMode = page.locator("#settings-ai-security-shell-mode");
    const autoRun = page.locator("#settings-ai-agent-auto-run-commands");
    await expect(shellMode).toHaveValue("deny-and-audit");
    await expect(autoRun).toBeDisabled();

    await shellMode.selectOption("sandbox-shell");
    await expect(autoRun).toBeEnabled();
    await autoRun.check();
    await page.locator("#settings-ai-security-binary-npx").check();
    await page.locator("#settings-ai-security-package-npm").uncheck();
    await page.locator("#settings-ai-security-rule-package").fill("approved-package");
    await page.locator("#settings-ai-security-rule-version").fill("1.*");
    await page.locator("#settings-ai-security-rule-registry").fill("https://artifactory.example/npm");
    await page.locator("#settings-ai-security-rule-add").click();
    await expect(page.locator("#settings-ai-security-rule-list")).toContainText("approved-package");
    await page.locator("#settings-modal-save").click();

    await expect.poll(() => page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("markdownViewerGlobalState") || "{}");
      return {
        mode: state.aiCompanionSettings?.aiSecurityPolicy?.shell?.mode,
        autoRun: state.aiCompanionSettings?.agentAutoRunCommands,
        npx: state.aiCompanionSettings?.aiSecurityPolicy?.packageBinaries?.npx,
        packageId: state.aiCompanionSettings?.aiSecurityPolicy?.packages?.rules?.find((rule) => rule.ecosystem === "npm")?.packageId
      };
    })).toEqual({ mode: "sandbox-shell", autoRun: true, npx: true, packageId: "approved-package" });

    await selectSettingsTab(page, "ai-security");
    await expect(shellMode).toHaveValue("sandbox-shell");
    await expect(autoRun).toBeEnabled();
    await expect(autoRun).toBeChecked();
  });

  test("manages profile-owned workspace approval grants", async ({ page }) => {
    await openApp(page, { localStorage: { markdownViewerGlobalState: JSON.stringify({ startupBehavior: "empty" }) } });
    await selectSettingsTab(page, "ai-approvals");

    const advanced = page.locator("#settings-ai-approval-rules-json");
    await expect(advanced).toHaveValue(/"version": 2/);
    await advanced.fill(JSON.stringify({
      version: 2,
      rules: [{
        id: "playwright-java-writes",
        capability: "workspace.file.write",
        matcher: { type: "path-glob", value: "src/**/*.java" },
        lifetime: "workspace",
        enabled: true,
        createdAt: new Date().toISOString(),
        lastUsedAt: ""
      }]
    }, null, 2));
    await page.locator("#settings-modal-save").click();
    await expect(page.locator("#settings-modal")).toBeHidden();

    await selectSettingsTab(page, "ai-approvals");
    await expect(page.locator("#settings-ai-approval-rule-list")).toContainText("workspace.file.write");
    await expect(page.locator("#settings-ai-approval-rule-list")).toContainText("src/**/*.java");
    page.once("dialog", (dialog) => dialog.accept());
    await page.locator("#settings-ai-approval-rule-list .settings-secondary-button", { hasText: "Revoke" }).click();
    await expect(page.locator("#settings-ai-approval-rule-empty")).toBeVisible();
  });
});
