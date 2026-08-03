const { test, expect } = require("./desktop-fixture");

test("bundled Kotlin support is registered and shown in Language Servers settings", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => Boolean(
    window.markdownViewerApp?.modules?.lspServerRegistry
      && window.markdownViewerApp?.modules?.kotlinWorkspaceCoordinator
      && window.markdownViewerApp?.modules?.projectProblemsBroker
  ));

  const registration = await page.evaluate(() => {
    const server = window.markdownViewerApp.modules.lspServerRegistry.getServerForLanguage("kotlin");
    return { id: server?.id, bundledVariantId: server?.bundledVariantId, extensions: Array.from(server?.extensions || []) };
  });
  expect(registration).toEqual({ id: "kotlin", bundledVariantId: "jetbrains-kotlin-lsp", extensions: ["kt", "kts"] });
  await expect(page.locator("#settings-lsp-kotlin-status")).toHaveCount(1);
  await expect(page.locator("#settings-lsp-kotlin-remove")).toHaveCount(0);
});

test("mixed-project generation waits for delayed Kotlin ABI and AJDT completion", async ({ page }) => {
  await page.addInitScript(() => {
    localStorage.clear();
    localStorage.setItem("markdownViewerGlobalState", JSON.stringify({ startupBehavior: "untitled" }));
  });
  await page.goto("/");
  await page.waitForFunction(() => typeof window.registerMarkdownViewerAnalysisGenerationCoordinator === "function");

  const result = await page.evaluate(async () => {
    const builds = [];
    const finalizations = [];
    const commits = [];
    const app = { modules: {}, registerModule(id, value) { this.modules[id] = value; } };
    const coordinator = window.registerMarkdownViewerAnalysisGenerationCoordinator(app, {
      stallTimeoutMs: 60000,
      maximumTimeoutMs: 60000,
      async requestFinalJdtBuild(value) { builds.push(value.generationId); },
      async finalizeJdtGeneration(value) { finalizations.push(value.generationId); return true; },
      async commitProblemsGeneration(value) { commits.push(value.generationId); return { snapshotId: `commit-${value.generationId}` }; }
    });
    const generationId = coordinator.beginGeneration({
      workspaceRoot: "C:/mixed-project",
      reason: "e2e-delayed-mixed",
      requirements: { jdt: true, jdtImportRequired: true, kotlin: true, kotlinAbiRequired: true, ajdt: true }
    });
    coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/mixed-project", phase: "service-ready" });
    coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/mixed-project", phase: "import-complete" });
    coordinator.markKotlinReady({ generationId, workspaceRoot: "C:/mixed-project", snapshotId: "kotlin" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const buildsBeforeAbi = builds.length;
    coordinator.markKotlinAbiReady({ generationId, workspaceRoot: "C:/mixed-project", workspaceRevision: "abi-1" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    coordinator.acceptJdtLifecycle({ generationId, workspaceRoot: "C:/mixed-project", phase: "build-complete" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    coordinator.markJdtDiagnosticsSettled({ generationId, workspaceRoot: "C:/mixed-project", snapshotId: "jdt" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    const commitsBeforeAjdt = commits.length;
    coordinator.markAjdtTerminal({ generationId, workspaceRoot: "C:/mixed-project", outcome: "ready" });
    await new Promise((resolve) => setTimeout(resolve, 20));
    return { buildsBeforeAbi, builds, finalizations, commitsBeforeAjdt, commits, state: coordinator.getState() };
  });

  expect(result.buildsBeforeAbi).toBe(0);
  expect(result.builds).toHaveLength(1);
  expect(result.finalizations).toHaveLength(1);
  expect(result.commitsBeforeAjdt).toBe(0);
  expect(result.commits).toHaveLength(1);
  expect(result.state.status).toBe("committed");
});
