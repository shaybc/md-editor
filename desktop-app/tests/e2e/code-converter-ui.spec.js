const { test, expect } = require("./desktop-fixture");
const {
  mockNeutralinoDialogs,
  mockNeutralinoProcess,
  openApp,
  openCodeConverterDialog,
} = require("../helpers/desktop-ui");
const { createTempWorkspace, removeTempWorkspace } = require("../helpers/temp-workspace");

test.describe("desktop code converter UI", () => {
  test("opens converter dialog and accepts source destination folders", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await openCodeConverterDialog(page);

      await page.locator("#code-converter-source-browse").click();
      await expect(page.locator("#code-converter-source-root")).toHaveValue(sourcePath.replace(/\\/g, "/"));

      await page.locator("#code-converter-destination-browse").click();
      await expect(page.locator("#code-converter-destination-root")).toHaveValue(destinationPath.replace(/\\/g, "/"));
      await expect(page.locator("#code-converter-type")).toBeVisible();
      await expect(page.locator("#code-converter-include-comments")).toBeVisible();
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("shows progress output and completion for mocked converter process", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-run-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-run-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, {
        stdout: ["Processed src/Main.java\n", "Conversion complete\n"],
        exitCode: 0,
      });
      await openCodeConverterDialog(page);

      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();

      await expect(page.locator("#code-converter-progress")).toBeVisible();
      await expect(page.locator("#code-converter-console-output")).toContainText("Processed src/Main.java");
      await expect(page.locator("#code-converter-status")).toContainText(/Markdown files created|complete|finished|done/i);

      const processLog = await page.evaluate(() => window.__desktopProcessLog || []);
      expect(processLog.some((entry) => entry.type === "spawn")).toBe(true);
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("minimize restore and cancel controls stay wired while a converter task is active", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-cancel-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-cancel-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Running\n"], autoExit: false });
      await openCodeConverterDialog(page);

      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();

      await expect(page.locator("#code-converter-cancel")).toBeEnabled();
      await expect(page.locator("#code-converter-minimize")).toBeVisible();
      await page.locator("#code-converter-minimize").click();
      await expect(page.locator("#code-converter-task-pill")).toBeVisible();

      await page.locator("#code-converter-task-pill").click();
      await expect(page.locator("#code-converter-modal")).toBeVisible();
      await page.locator("#code-converter-cancel").click();

      const processLog = await page.evaluate(() => window.__desktopProcessLog || []);
      expect(processLog.some((entry) => entry.type === "update" || entry.type === "exec")).toBe(true);
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });
  test("shows default built-in options and java dependency toggles", async ({ page }) => {
    try {
      await openApp(page);
      await openCodeConverterDialog(page);

      await expect(page.locator("#code-converter-type")).toHaveValue("builtin");
      await expect(page.locator("#code-converter-language-support")).toContainText("Supported languages: JavaScript, TypeScript, Python, Java, and C#");
      await expect(page.locator("#code-converter-include-methods")).toBeChecked();
      await expect(page.locator("#code-converter-include-accessors")).toBeChecked();
      await expect(page.locator("#code-converter-include-signatures")).toBeChecked();
      await expect(page.locator("#code-converter-include-return-codes")).toBeChecked();
      await expect(page.locator("#code-converter-include-exceptions")).toBeChecked();
      await expect(page.locator("#code-converter-include-package")).toBeChecked();
      await expect(page.locator("#code-converter-include-comments")).not.toBeChecked();
      await expect(page.locator("#code-converter-include-external-dependencies")).toBeHidden();
      await expect(page.locator("#code-converter-resolve-maven")).toBeHidden();

      await page.locator("#code-converter-type").selectOption("java");
      await expect(page.locator("#code-converter-language-support")).toHaveText("Supported language: Java. Supported extension: .java.");
      await expect(page.locator("#code-converter-include-external-dependencies")).toBeVisible();
      await expect(page.locator("#code-converter-include-external-dependencies")).toBeChecked();
      await expect(page.locator("#code-converter-resolve-maven")).toBeVisible();
      await expect(page.locator("#code-converter-resolve-maven")).toBeChecked();

      await page.locator("#code-converter-include-external-dependencies").uncheck();
      await expect(page.locator("#code-converter-resolve-maven")).not.toBeChecked();
      await expect(page.locator("#code-converter-resolve-maven")).toBeDisabled();

      await page.locator("#code-converter-type").selectOption("builtin");
      await expect(page.locator("#code-converter-include-external-dependencies")).toBeHidden();
    } finally {
      await page.locator("#code-converter-cancel").click().catch(() => {});
    }
  });

  test("built-in converter command includes comments only when enabled", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.ts": "export class Main {}" }, "md-editor-converter-comments-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-comments-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Created 1 markdown file(s)\n"], exitCode: 0 });
      await openCodeConverterDialog(page);

      await expect(page.locator("#code-converter-include-comments")).not.toBeChecked();
      await page.locator("#code-converter-include-comments").check();
      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();
      await expect(page.locator("#code-converter-finish")).toBeVisible();

      const spawnedCommand = await page.evaluate(() => (window.__desktopProcessLog || []).find((entry) => entry.type === "spawn")?.command || "");
      expect(spawnedCommand).toContain("--include-comments");
      expect(spawnedCommand).toContain("--include-methods");
      expect(spawnedCommand).toContain("--include-package");
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("locks converter form controls while a conversion is running", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-lock-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-lock-dest-");

    try {
      await openApp(page);
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Running\n"], autoExit: false });
      await openCodeConverterDialog(page);

      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();

      await expect(page.locator("#code-converter-run")).toBeDisabled();
      await expect(page.locator("#code-converter-type")).toBeDisabled();
      await expect(page.locator("#code-converter-source-browse")).toBeDisabled();
      await expect(page.locator("#code-converter-destination-browse")).toBeDisabled();
      await expect(page.locator("#code-converter-include-methods")).toBeDisabled();
      await expect(page.locator("#code-converter-include-package")).toBeDisabled();
      await expect(page.locator("#code-converter-include-comments")).toBeDisabled();
      await expect(page.locator("#code-converter-cancel")).toBeEnabled();

      await page.locator("#code-converter-run").click({ force: true });
      const spawnCount = await page.evaluate(() => (window.__desktopProcessLog || []).filter((entry) => entry.type === "spawn").length);
      expect(spawnCount).toBe(1);
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("streams progress metadata and console interactions from spawned converter output", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/App.java": "class App {}" }, "md-editor-converter-progress-source-");
    const destinationPath = await createTempWorkspace({}, "md-editor-converter-progress-dest-");

    try {
      await openApp(page);
      await page.evaluate(() => {
        window.__converterClipboardText = "";
        window.Neutralino = window.Neutralino || {};
        window.Neutralino.clipboard = {
          writeText: async (text) => {
            window.__converterClipboardText = text;
          },
        };
      });
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, {
        stdout: [
          '::md-progress{"stage":"scan","stageLabel":"Scanning Java source files","completed":42,"total":100,"currentFile":"src/App.java"}\n',
          "[2026-06-12 20:11:00] Indexing 9355 Java files...\n",
        ],
        autoExit: false,
      });
      await openCodeConverterDialog(page);

      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();

      await expect(page.locator("#code-converter-console-output")).toContainText("Indexing 9355 Java files");
      await expect(page.locator("#code-converter-console-output")).not.toContainText("::md-progress");
      await expect(page.locator("#code-converter-progress")).toBeVisible();
      await expect(page.locator("#code-converter-progress-stage")).toHaveText("Building dependency indexes");
      await expect(page.locator("#code-converter-progress-percent")).toHaveText("42%");
      await expect(page.locator("#code-converter-progress-count")).toContainText("42 / 100 files");
      await expect(page.locator("#code-converter-console-state")).toHaveText("running");

      await page.locator("#code-converter-console-copy").click();
      await expect(page.locator("#code-converter-console-copy")).toHaveClass(/is-copied/);

      const autoScrollButton = page.locator("#code-converter-console-autoscroll");
      await expect(autoScrollButton).toHaveAttribute("aria-pressed", "false");
      await autoScrollButton.click();
      await expect(autoScrollButton).toHaveAttribute("aria-pressed", "true");
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });

  test("completion status exposes generated folder actions", async ({ page }) => {
    const sourcePath = await createTempWorkspace({ "src/Main.java": "class Main {}" }, "md-editor-converter-complete-source-");
    const destinationPath = await createTempWorkspace({ "README.md": "# Generated" }, "md-editor-converter-complete-dest-");

    try {
      await openApp(page);
      await page.evaluate(() => {
        window.__openedConverterPaths = [];
        window.Neutralino = window.Neutralino || {};
        window.Neutralino.os = window.Neutralino.os || {};
        window.Neutralino.os.open = async (targetPath) => {
          window.__openedConverterPaths.push(targetPath);
        };
      });
      await mockNeutralinoDialogs(page, { folders: [sourcePath, destinationPath] });
      await mockNeutralinoProcess(page, { stdout: ["Created 1 markdown file(s)\n"], exitCode: 0 });
      await openCodeConverterDialog(page);

      await page.locator("#code-converter-source-browse").click();
      await page.locator("#code-converter-destination-browse").click();
      await page.locator("#code-converter-run").click();

      const statusLink = page.locator("#code-converter-status .code-converter-status-link");
      await expect(statusLink).toHaveText(destinationPath.split(/[\\/]/).pop());
      await expect(statusLink).toHaveAttribute("title", destinationPath.replace(/\\/g, "/"));
      await statusLink.click();
      await expect.poll(() => page.evaluate(() => window.__openedConverterPaths || [])).toEqual([destinationPath.replace(/\\/g, "/")]);
      await expect(page.locator("#code-converter-cancel")).toBeHidden();
      await expect(page.locator("#code-converter-run")).toBeHidden();
      await expect(page.locator("#code-converter-open-folder")).toBeVisible();
      await expect(page.locator("#code-converter-finish")).toBeVisible();
    } finally {
      await removeTempWorkspace(sourcePath);
      await removeTempWorkspace(destinationPath);
    }
  });
});