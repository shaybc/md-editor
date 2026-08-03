const { test, expect } = require("./desktop-fixture");
const { openApp, openCodeConverterDialog } = require("../helpers/desktop-ui");

test("code converter minimized task flashes when conversion fails", async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => {
    window.NL_PATH = "C:/GitHub/shaybc/md-editor/desktop-app";
    window.NL_VERSION = "test";
    window.Neutralino = {
      os: {
        spawnProcess: async () => ({ id: 88, pid: 8800 }),
        updateSpawnedProcess: async () => {},
      },
    };
    window.__failConversion = () => {
      window.dispatchEvent(new CustomEvent("spawnedProcess", {
        detail: { id: 88, action: "stdErr", data: "Conversion failed hard" },
      }));
      window.dispatchEvent(new CustomEvent("spawnedProcess", {
        detail: { id: 88, action: "exit", data: { exitCode: 2 } },
      }));
    };
  });

  await openCodeConverterDialog(page);
  await page.locator("#code-converter-source-root").fill("C:/src/project");
  await page.locator("#code-converter-destination-root").fill("C:/docs/project-md");
  await page.locator("#code-converter-run").click();
  await page.locator("#code-converter-minimize").click();

  await page.evaluate(() => window.__failConversion());
  await expect(page.locator("#code-converter-task-status")).toHaveText("failed");
  await expect(page.locator("#code-converter-task-pill")).toHaveClass(/needs-attention/);

  await page.locator("#code-converter-task-pill").click();
  await expect(page.locator("#code-converter-status")).toHaveText("code converter failed. See console.");
  await expect(page.locator("#code-converter-console-output")).toContainText("Conversion failed hard");
  await expect(page.locator("#code-converter-open-folder")).toBeHidden();
  await expect(page.locator("#code-converter-finish")).toBeVisible();
});