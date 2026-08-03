const { test, expect } = require("./desktop-fixture");
const {
  mockNeutralinoDialogs,
  mockNeutralinoProcess,
  openApp,
  openCodeConverterDialog,
} = require("../helpers/desktop-ui");
const { createTempWorkspace, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("desktop code converter task UI", () => {
  test("cancel kills the active converter process tree", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-kill-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-kill-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Running\n"], autoExit: false });
      await openCodeConverterDialog(page);
      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();
      await page.locator("#code-converter-cancel").click();

      const processLog = await page.evaluate(() => window.__desktopProcessLog || []);
      expect(processLog.some((entry) => entry.type === "exec" && entry.command.includes("taskkill"))).toBe(true);
      expect(processLog.some((entry) => entry.type === "update" && entry.action === "exit")).toBe(true);
      await expect(page.locator("#code-converter-status")).toContainText("cancelled");
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("minimized converter task shows completion attention", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-min-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-min-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Created 1 markdown file(s)\n"], exitCode: 0, delayMs: 150 });
      await openCodeConverterDialog(page);
      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();
      await page.locator("#code-converter-minimize").click();
      await expect(page.locator("#code-converter-task-pill")).toBeVisible();
      await expect(page.locator("#code-converter-task-status")).toContainText(/complete|done|created/i, { timeout: 30000 });
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("converter backdrop clicks do not close an active task", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-backdrop-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-backdrop-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Running\n"], autoExit: false });
      await openCodeConverterDialog(page);
      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();
      await page.locator("#code-converter-modal").click({ position: { x: 5, y: 5 } });
      await expect(page.locator("#code-converter-modal")).toBeVisible();
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("converter remembers source and destination folders", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-remember-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-remember-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await openCodeConverterDialog(page);
      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-cancel").click();
      await openCodeConverterDialog(page);
      await expect(page.locator("#code-converter-source-root")).toHaveValue(sourcePath.replace(/\\/g, "/"));
      await expect(page.locator("#code-converter-destination-root")).toHaveValue(destinationPath.replace(/\\/g, "/"));
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });
});