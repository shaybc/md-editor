const path = require("node:path");
const { expect, test } = require("@playwright/test");

test("Quick Fix requires a resolved preview before Apply", async ({ page }) => {
  await page.setContent("<html><body></body></html>");
  await page.addScriptTag({
    path: path.resolve(__dirname, "../../resources/js/quick-fix/dialog.js")
  });
  await page.evaluate(() => {
    const app = { registerModule() {} };
    const dialog = window.registerMarkdownViewerQuickFixDialog(app);
    void dialog.open({
      diagnostic: {
        message: "Widget cannot be resolved to a type",
        filePath: "C:/Project/Demo.java",
        line: 3,
        column: 5
      },
      initialActionId: "jdt-1",
      actions: [{
        id: "jdt-1",
        title: "Create class 'Widget'",
        provenance: "JDT",
        disabled: false,
        isPreferred: true
      }],
      aiAvailable: true,
      async resolvePreview() {
        await new Promise((resolve) => setTimeout(resolve, 100));
        return {
          affectedPaths: ["C:/Project/Widget.java"],
          summary: [{ type: "create", path: "C:/Project/Widget.java" }]
        };
      },
      async applyPreview() {
        return { async undo() {} };
      },
      async verify() {
        return "Resolved.";
      }
    });
  });

  await expect(page.locator(".quick-fix-apply")).toBeDisabled();
  await expect(page.getByRole("button", { name: /Create class 'Widget'/ })).toBeFocused();
  await expect(page.locator(".quick-fix-preview")).toBeVisible();
  await expect(page.locator(".quick-fix-apply")).toBeEnabled();
  await expect(page.getByRole("button", { name: /AI: investigate/ })).toBeVisible();
});
