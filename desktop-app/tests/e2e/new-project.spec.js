const fs = require("node:fs/promises");
const path = require("node:path");
const { test, expect } = require("./desktop-fixture");
const { openActionMenu, openApp } = require("../helpers/desktop-ui");
const { createTempWorkspace, removeTempWorkspace } = require("../helpers/temp-workspace");

test("New Project wizard creates and opens a runnable Node.js project", async ({ page }) => {
  const parentDirectory = await createTempWorkspace({}, "md-editor-new-project-");
  const projectPath = path.join(parentDirectory, "hello-project");
  try {
    await openApp(page);
    await page.evaluate(() => {
      window.markdownViewerApp.modules.jdkRegistry.list = () => [
        { id: "jdk-17", name: "JDK 17", path: "C:/Java/jdk-17", feature: 17 },
        { id: "jdk-25", name: "JDK 25", path: "C:/Java/jdk-25", feature: 25 },
        { id: "jdk-21", name: "JDK 21", path: "C:/Java/jdk-21", feature: 21 }
      ];
    });
    await openActionMenu(page);
    await page.locator(".header-action-menu > .action-menu > .new-project-button").click();

    await expect(page.locator("#new-project-name")).toBeFocused();
    await expect(page.locator("#new-project-parent")).not.toHaveValue("");
    await page.keyboard.press("Shift+Tab");
    await expect(page.locator("#new-project-next")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(page.locator("#new-project-modal")).toBeHidden();

    await openActionMenu(page);
    await page.locator(".header-action-menu > .action-menu > .new-project-button").click();

    await page.locator("#new-project-name").fill("cancelled-project");
    await page.locator("#new-project-parent").fill(parentDirectory);
    await page.locator("#new-project-cancel").click();
    await assertPathMissing(path.join(parentDirectory, "cancelled-project"));

    await openActionMenu(page);
    await page.locator(".header-action-menu > .action-menu > .new-project-button").click();

    await expect(page.getByRole("dialog", { name: "New Project" })).toBeVisible();
    await page.setViewportSize({ width: 1920, height: 1080 });
    const modalBounds = await page.locator(".new-project-modal-box").boundingBox();
    expect(modalBounds.width).toBeGreaterThan(800);
    await expect(page.locator("#new-project-name")).toHaveValue("hello-world");
    await page.locator("#new-project-name").fill("hello-project");
    await page.locator("#new-project-parent").fill(parentDirectory);
    await page.locator("#new-project-next").click();
    await expect(page.locator("#new-project-field-projectJdkId")).toHaveValue("jdk-25");
    await page.locator("#new-project-back").click();
    await page.locator("#new-project-language").selectOption("node");
    await page.locator("#new-project-next").click();

    await expect(page.locator('[data-new-project-step="2"]')).toBeVisible();
    const settingsWidths = await page.locator('[data-new-project-step="2"] input, [data-new-project-step="2"] select').evaluateAll((fields) => (
      fields.filter((field) => field.offsetParent).map((field) => field.getBoundingClientRect().width)
    ));
    expect(settingsWidths.every((width) => width >= 300)).toBe(true);
    await page.locator("#new-project-next").click();

    await expect(page.locator('[data-new-project-step="3"]')).toBeVisible();
    const reviewHasHorizontalOverflow = await page.locator("#new-project-review-list").evaluate((list) => list.scrollWidth > list.clientWidth + 1);
    expect(reviewHasHorizontalOverflow).toBe(false);
    await expect(page.locator("#new-project-review-list")).toContainText("README.md");
    await expect(page.locator("#new-project-review-list")).toContainText(".md-editor/project.json");
    await page.locator("#new-project-create").click();

    await expect(page.locator("#new-project-modal")).toBeHidden();
    await expect.poll(async () => JSON.parse(await fs.readFile(path.join(projectPath, ".md-editor", "project.json"), "utf8")).language).toBe("node");
    await expect.poll(async () => (await fs.readFile(path.join(projectPath, "README.md"), "utf8")).includes("npm start")).toBe(true);
    await assertPathMissing(path.join(projectPath, ".gitignor"));
    await assertPathMissing(path.join(projectPath, "AGENTS.m"));
    await assertPathMissing(path.join(projectPath, "README.m"));
    await expect(page.locator(".folder-tree-file[data-path='README.md']")).toBeVisible();
  } finally {
    await removeTempWorkspace(parentDirectory);
  }
});

test("New Project clears a stale JDT workspace before opening a recreated Java project", async ({ page }) => {
  const parentDirectory = await createTempWorkspace({}, "md-editor-new-java-project-");
  const projectPath = path.join(parentDirectory, "java-project");
  let jdtWorkspacePath = "";
  try {
    await openApp(page);
    await page.evaluate(() => {
      const runtime = { id: "jdk-25", name: "JDK 25", path: "C:/Java/jdk-25", feature: 25 };
      const registry = window.markdownViewerApp.modules.jdkRegistry;
      registry.list = () => [runtime];
      registry.resolve = () => runtime;
      registry.validate = async () => ({ valid: true, runtime });
    });
    jdtWorkspacePath = await page.evaluate(
      ({ openedProjectPath, scopeSignature }) => window.markdownViewerApp.modules.lspServerRegistry.getServerWorkspaceDir(
        "java",
        openedProjectPath,
        "",
        { scopeSignature }
      ),
      {
        openedProjectPath: projectPath.replace(/\\/g, "/"),
        scopeSignature: JSON.stringify({ boundaryVersion: 2, includedModuleRoots: ["."] })
      }
    );
    await fs.mkdir(jdtWorkspacePath, { recursive: true });
    const staleMarker = path.join(jdtWorkspacePath, "stale-classpath.marker");
    await fs.writeFile(staleMarker, "stale");

    await openActionMenu(page);
    await page.locator(".header-action-menu > .action-menu > .new-project-button").click();
    await page.locator("#new-project-name").fill("java-project");
    await page.locator("#new-project-parent").fill(parentDirectory);
    await page.locator("#new-project-next").click();
    await page.locator("#new-project-next").click();
    await page.locator("#new-project-create").click();

    await expect(page.locator("#new-project-modal")).toBeHidden();
    await assertPathMissing(staleMarker);
    await expect(page.locator(".folder-tree-file[data-path='README.md']")).toBeVisible();
  } finally {
    await removeTempWorkspace(parentDirectory);
    if (jdtWorkspacePath) await fs.rm(jdtWorkspacePath, { recursive: true, force: true });
  }
});

async function assertPathMissing(candidatePath) {
  await expect.poll(async () => {
    try {
      await fs.stat(candidatePath);
      return false;
    } catch (error) {
      return error?.code === "ENOENT";
    }
  }).toBe(true);
}
