// Helm chart project commands and rendered YAML tab output.
(function(global) {
  "use strict";

  /** Register Helm actions for active chart files. */
  function registerMarkdownViewerHelmProjectCommands(app, deps = {}) {
    const COMMANDS = new Set([
      "helm-lint-chart",
      "helm-template-chart",
      "helm-template-active-file",
      "helm-preview-template",
      "helm-preview-chart",
      "helm-dependency-update",
      "helm-show-dependencies",
      "helm-insert-dependency",
      "helm-package-chart",
      "helm-render-kubernetes-dry-run",
      "helm-render-server-dry-run"
    ]);
    const chartContext = deps.chartContext || app?.modules?.helmChartContext || global.markdownViewerHelmChartContext;
    const helmAuthoringDocs = deps.helmAuthoringDocs || app?.modules?.helmAuthoringDocs || global.markdownViewerHelmAuthoringDocs;
    let cachedCompletionItems = [];
    let completionRequestId = 0;

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function getKubernetesContext() {
      return deps.kubernetesContext || app?.modules?.kubernetesContext || null;
    }

    function helm() {
      return getKubernetesContext()?.buildHelmPrefix?.() || "helm";
    }

    function kubectl(options = {}) {
      return getKubernetesContext()?.buildKubectlPrefix?.(options) || "kubectl";
    }

    function getContextSummary() {
      return getKubernetesContext()?.getContextSummary?.() || { contextName: "current context", namespaceName: "default", kubeconfigPath: "" };
    }

    function getContext(overrides = {}) {
      return Object.assign({
        folderPath: String(deps.getActiveFolderPath?.() || ""),
        filePath: String(deps.getActiveFilePath?.() || ""),
        content: deps.getActiveEditorValue?.() || ""
      }, overrides);
    }

    function getLikelyChartRoot(context = {}) {
      return chartContext?.resolveLikelyChartRoot?.(context) || "";
    }

    /** Find the nearest Helm chart root for the active context. */
    async function findChartRoot(context = {}) {
      const activeContext = getContext(context);
      return await chartContext?.findChartRoot?.(activeContext, { pathExists: deps.pathExists }) || getLikelyChartRoot(activeContext);
    }

    /** Return whether the active path belongs to a Helm chart file. */
    function isHelmChart(context = {}) {
      const activeContext = getContext(context);
      const chartRoot = activeContext.chartRoot || getLikelyChartRoot(activeContext);
      return Boolean(chartRoot && activeContext.folderPath && activeContext.filePath && chartContext?.isHelmChartPath?.(activeContext.filePath, chartRoot));
    }

    function getReleaseName(context = {}, chartRoot = "") {
      return String(context.releaseName || chartContext?.getDefaultReleaseName?.(chartRoot) || "release");
    }

    function getTemplateRelativePath(context = {}, chartRoot = "") {
      return String(context.templateRelativePath || chartContext?.getTemplateRelativePath?.(context.filePath || deps.getActiveFilePath?.() || "", chartRoot) || "");
    }

    function normalizeValuesFiles(valuesFiles) {
      return (Array.isArray(valuesFiles) ? valuesFiles : [])
        .map((entry) => {
          if (typeof entry === "string") return { path: entry, name: chartContext?.getFileName?.(entry) || entry };
          const path = String(entry?.path || entry?.filePath || "").trim();
          return path ? { path, name: String(entry?.name || chartContext?.getFileName?.(path) || path) } : null;
        })
        .filter(Boolean);
    }

    function appendTemplateOptions(parts, context, chartRoot) {
      const relativePath = context.mode === "template" || context.previewMode === "template" || context.showOnlyTemplate
        ? getTemplateRelativePath(context, chartRoot)
        : "";
      if (relativePath) parts.push("--show-only", quote(relativePath));
      normalizeValuesFiles(context.valuesFiles).forEach((file) => parts.push("--values", quote(file.path)));
      const setValues = String(context.setValues || "").trim();
      if (setValues) parts.push("--set", quote(setValues));
      return parts;
    }

    function buildTemplateCommand(context, chartRoot, includeTemplate) {
      const commandContext = Object.assign({}, context, includeTemplate ? { showOnlyTemplate: true } : {});
      const parts = [`${helm()} template`, quote(getReleaseName(context, chartRoot)), quote(chartRoot)];
      appendTemplateOptions(parts, commandContext, chartRoot);
      return parts.join(" ");
    }

    function getDependencyFragment(context = {}) {
      const name = String(context.dependencyName || "chart-name");
      const version = String(context.dependencyVersion || "1.0.0");
      const repository = String(context.dependencyRepository || "https://example.com/charts");
      return `dependencies:\n  - name: ${name}\n    version: ${version}\n    repository: ${repository}\n`;
    }

    function resolveDryRunMode(commandName, context = {}) {
      if (context.dryRunMode === "server" || commandName === "helm-render-server-dry-run") return "server";
      return "client";
    }

    /** Build the shell command used for a Helm project action. */
    function buildHelmCommand(commandName, context = {}) {
      const activeContext = getContext(context);
      const chartRoot = activeContext.chartRoot || getLikelyChartRoot(activeContext);
      const releaseName = getReleaseName(activeContext, chartRoot);
      if (commandName === "helm-lint-chart") return `${helm()} lint ${quote(chartRoot)}`;
      if (commandName === "helm-template-chart" || commandName === "helm-preview-chart") return buildTemplateCommand(activeContext, chartRoot, false);
      if (commandName === "helm-template-active-file") return buildTemplateCommand(activeContext, chartRoot, true);
      if (commandName === "helm-preview-template") return buildTemplateCommand(Object.assign({}, activeContext, { mode: "template" }), chartRoot, true);
      if (commandName === "helm-dependency-update") return `${helm()} dependency update ${quote(chartRoot)}`;
      if (commandName === "helm-show-dependencies") return `${helm()} dependency list ${quote(chartRoot)}`;
      if (commandName === "helm-package-chart") return `${helm()} package ${quote(chartRoot)}`;
      if (commandName === "helm-render-kubernetes-dry-run" || commandName === "helm-render-server-dry-run") {
        const validate = activeContext.validateSchema === false ? " --validate=false" : "";
        return `${helm()} template ${quote(releaseName)} ${quote(chartRoot)} | ${kubectl({ contextName: activeContext.contextName, namespaceName: activeContext.namespaceName })} apply --dry-run=${resolveDryRunMode(commandName, activeContext)}${validate} -f -`;
      }
      return "";
    }

    function canExecute(commandName, context = {}) {
      if (!COMMANDS.has(commandName)) return false;
      const activeContext = getContext(context);
      if (!activeContext.folderPath || !isHelmChart(activeContext)) return false;
      if (commandName === "helm-template-active-file" || commandName === "helm-preview-template") return Boolean(getTemplateRelativePath(activeContext, getLikelyChartRoot(activeContext)));
      return true;
    }

    async function runTerminalCommand(command, options) {
      if (typeof deps.terminal?.runCommand !== "function") throw new Error("Terminal execution is unavailable.");
      return await deps.terminal.runCommand(command, Object.assign({ interactive: false, captureOutput: true }, options || {}));
    }

    function openRenderedYamlTab(content, title) {
      if (typeof deps.openRenderedYamlTab === "function") return deps.openRenderedYamlTab(content, title);
      return deps.tabs?.newTab?.(String(content || ""), title, { viewMode: "editor" }) || null;
    }

    function getRenderedTabTitle(commandName, context, chartRoot) {
      if (commandName === "helm-template-active-file" || commandName === "helm-preview-template") {
        const relativePath = getTemplateRelativePath(context, chartRoot);
        const name = chartContext?.getFileName?.(relativePath) || "template.yaml";
        return name.replace(/\.ya?ml$/i, ".rendered.yaml");
      }
      return "helm-template.yaml";
    }

    function getPreviewTitle(context, chartRoot) {
      const templatePath = getTemplateRelativePath(context, chartRoot);
      const name = context.mode === "template" && templatePath
        ? chartContext?.getFileName?.(templatePath)
        : chartContext?.getFileName?.(chartRoot);
      return `Helm preview: ${name || "chart"}`;
    }

    async function getChartPreviewSource(chartRoot, context) {
      const chartPath = chartContext?.joinPath?.(chartRoot, "Chart.yaml") || `${chartRoot}/Chart.yaml`;
      if (typeof deps.readFile === "function") {
        try {
          return { name: "Chart.yaml", path: chartPath, content: await deps.readFile(chartPath) };
        } catch (_) {}
      }
      const values = normalizeValuesFiles(context.valuesFiles).map((file) => `- ${file.path}`).join("\n") || "- values.yaml";
      return {
        name: "Helm chart source",
        path: chartRoot,
        content: `# Helm chart preview source\nChart root: ${chartRoot}\nValues files:\n${values}\nAdditional values: ${String(context.setValues || "").trim() || "none"}\n`
      };
    }

    async function getTemplatePreviewSource(context, chartRoot) {
      const relativePath = getTemplateRelativePath(context, chartRoot);
      const templatePath = relativePath ? chartContext?.joinPath?.(chartRoot, relativePath) : context.filePath;
      if (templatePath && typeof deps.readFile === "function") {
        try {
          return { name: chartContext?.getFileName?.(templatePath) || "template.yaml", path: templatePath, content: await deps.readFile(templatePath) };
        } catch (_) {}
      }
      return { name: chartContext?.getFileName?.(context.filePath) || "active template", path: context.filePath || "", content: String(context.content || "") };
    }

    async function openPreviewCompareTab(renderedYaml, context, chartRoot) {
      if (typeof deps.openFileCompareInTab !== "function") return null;
      const isTemplate = context.mode === "template";
      const left = isTemplate ? await getTemplatePreviewSource(context, chartRoot) : await getChartPreviewSource(chartRoot, context);
      return deps.openFileCompareInTab({
        title: getPreviewTitle(context, chartRoot),
        readOnly: true,
        viewMode: "side-by-side",
        left,
        right: {
          name: "Rendered Helm YAML",
          content: String(renderedYaml || "")
        }
      });
    }

    function getCommandOutput(result) {
      return String([result?.stderr, result?.stdout, result?.output].filter(Boolean).join("\n"));
    }

    function isMissingToolOutput(toolName, output) {
      const text = String(output || "").toLowerCase();
      const tool = String(toolName || "").toLowerCase();
      return text.includes(`'${tool}' is not recognized`)
        || text.includes(`\"${tool}\" is not recognized`)
        || text.includes(`${tool}: command not found`)
        || text.includes(`${tool}: not found`)
        || text.includes(`cannot find path '${tool}'`);
    }

    function getMissingToolMessage(toolName) {
      const label = toolName === "kubectl" ? "kubectl" : "Helm";
      const executable = toolName === "kubectl" ? "kubectl executable" : "Helm executable";
      return `${label} is not available. Install ${label} and add it to PATH, or set the full ${executable} path in Settings > Kubernetes.`;
    }

    function createSourceRefs(context, chartRoot, extraRefs = []) {
      return [
        chartRoot ? { kind: "chart", label: "Chart root", path: chartRoot } : null,
        chartRoot ? { kind: "chart-file", label: "Chart.yaml", path: `${chartRoot}/Chart.yaml` } : null,
        chartRoot ? { kind: "values", label: "values.yaml", path: `${chartRoot}/values.yaml` } : null,
        context.filePath ? { kind: "active-file", label: "Active file", path: context.filePath } : null,
        ...extraRefs
      ].filter(Boolean);
    }

    function createStructuredResult(toolName, commandName, context, chartRoot, command, terminalResult, startedAt, extra = {}) {
      const exitCode = Number(terminalResult?.exitCode ?? 0);
      const output = getCommandOutput(terminalResult);
      const ok = exitCode === 0;
      const title = commandName.startsWith("helm-render") ? "Helm Render + Kubernetes Dry Run" : "Helm Command";
      const diagnostics = ok ? [] : [{ severity: "error", title: isMissingToolOutput(toolName, output) ? getMissingToolMessage(toolName) : `${toolName} exited with code ${exitCode}.`, message: output || `${toolName} exited with code ${exitCode}.` }];
      return Object.assign({
        ok,
        tool: toolName,
        title,
        commandName,
        command,
        exitCode,
        stdout: String(terminalResult?.stdout || ""),
        stderr: String(terminalResult?.stderr || ""),
        output,
        startedAt,
        durationMs: Date.now() - startedAt,
        contextSummary: getContextSummary(),
        sourceRefs: createSourceRefs(context, chartRoot, extra.sourceRefs || []),
        diagnostics,
        resources: [],
        renderedYaml: extra.renderedYaml || ""
      }, extra);
    }

    function createBlockedResult(commandName, context, message) {
      return {
        ok: false,
        tool: "helm",
        title: "Helm Command",
        commandName,
        command: "",
        exitCode: null,
        stdout: "",
        stderr: message,
        output: message,
        startedAt: Date.now(),
        durationMs: 0,
        contextSummary: getContextSummary(),
        sourceRefs: createSourceRefs(context, context.chartRoot || ""),
        diagnostics: [{ severity: "error", title: message, message }],
        resources: []
      };
    }

    async function executeTemplateCommand(commandName, context, chartRoot) {
      const command = buildHelmCommand(commandName, Object.assign({}, context, { chartRoot }));
      const startedAt = Date.now();
      const result = await runTerminalCommand(command, { cwd: chartRoot, title: commandName === "helm-template-active-file" ? "Helm Template File" : "Helm Template" });
      const structured = createStructuredResult("helm", commandName, context, chartRoot, command, result, startedAt, { renderedYaml: result?.stdout || result?.output || "" });
      if (structured.ok) openRenderedYamlTab(structured.renderedYaml, getRenderedTabTitle(commandName, context, chartRoot));
      return structured;
    }

    async function executePreviewCommand(commandName, context, chartRoot) {
      const templateRelativePath = getTemplateRelativePath(context, chartRoot);
      const mode = commandName === "helm-preview-chart" ? "chart" : "template";
      if (typeof deps.templatePreviewDialog?.open !== "function") return createBlockedResult(commandName, context, "The Helm template preview dialog is unavailable.");
      const selected = await deps.templatePreviewDialog.open({
        mode,
        releaseName: getReleaseName(context, chartRoot),
        chartRoot,
        templateRelativePath,
        valuesFiles: [],
        setValues: ""
      });
      if (!selected) return { ok: false, cancelled: true, tool: "helm", commandName };
      const previewContext = Object.assign({}, context, selected, { chartRoot, previewMode: selected.mode });
      const command = buildHelmCommand(selected.mode === "template" ? "helm-preview-template" : "helm-preview-chart", previewContext);
      const startedAt = Date.now();
      const result = await runTerminalCommand(command, { cwd: chartRoot, title: selected.mode === "template" ? "Helm Preview Template" : "Helm Preview Chart" });
      const structured = createStructuredResult("helm", commandName, previewContext, chartRoot, command, result, startedAt, { renderedYaml: result?.stdout || result?.output || "" });
      if (structured.ok) await openPreviewCompareTab(structured.renderedYaml, previewContext, chartRoot);
      return structured;
    }

    async function executeDependencyFragment(context) {
      const fragment = getDependencyFragment(context);
      if (typeof deps.insertDependencyFragment === "function") return await deps.insertDependencyFragment(fragment, context) !== false;
      openRenderedYamlTab(fragment, "Chart-dependency-fragment.yaml");
      return true;
    }

    async function getDryRunOptions(commandName, context, chartRoot, renderedYaml) {
      const defaultMode = commandName === "helm-render-server-dry-run" ? "server" : "client";
      if (typeof deps.dryRunOptionsDialog?.open !== "function") return { dryRunMode: defaultMode, validateSchema: true };
      return await deps.dryRunOptionsDialog.open({
        dryRunMode: defaultMode,
        validateSchema: true,
        contextName: getContextSummary().contextName,
        namespaceName: getContextSummary().namespaceName,
        manifestSource: "Helm rendered output",
        manifestPath: "-",
        command: "kubectl apply",
        renderedYaml,
        chartRoot
      });
    }

    /** Execute a Helm project command through the existing terminal and tab systems. */
    async function execute(commandName, context = {}, options = {}) {
      const activeContext = getContext(Object.assign({}, context, options || {}));
      if (!canExecute(commandName, activeContext)) return createBlockedResult(commandName, activeContext, "The Helm command is not available for the active editor context.");
      const chartRoot = await findChartRoot(activeContext);
      if (!chartRoot) return createBlockedResult(commandName, activeContext, "No Helm Chart.yaml was found for the active file.");
      try {
        if (commandName === "helm-template-chart" || commandName === "helm-template-active-file") return await executeTemplateCommand(commandName, activeContext, chartRoot);
        if (commandName === "helm-preview-template" || commandName === "helm-preview-chart") return await executePreviewCommand(commandName, activeContext, chartRoot);
        if (commandName === "helm-insert-dependency") {
          const ok = await executeDependencyFragment(activeContext);
          return createStructuredResult("helm", commandName, activeContext, chartRoot, "insert dependency fragment", { exitCode: ok ? 0 : 1, stdout: "", stderr: ok ? "" : "Unable to insert dependency fragment." }, Date.now());
        }
        if (commandName === "helm-render-kubernetes-dry-run" || commandName === "helm-render-server-dry-run") {
          const rendered = await executeTemplateCommand("helm-template-chart", activeContext, chartRoot);
          if (!rendered.ok) return rendered;
          const dryRunOptions = await getDryRunOptions(commandName, activeContext, chartRoot, rendered.renderedYaml);
          if (!dryRunOptions) return { ok: false, cancelled: true, tool: "kubectl", commandName };
          const dryRunContext = Object.assign({}, activeContext, dryRunOptions, { chartRoot });
          const command = buildHelmCommand(commandName, dryRunContext);
          const startedAt = Date.now();
          const dryRun = await runTerminalCommand(command, {
            cwd: chartRoot,
            title: dryRunOptions.dryRunMode === "server" ? "Kubernetes Server Dry Run" : "Kubernetes Dry Run"
          });
          return createStructuredResult("kubectl", commandName, dryRunContext, chartRoot, command, dryRun, startedAt, { renderedYaml: rendered.renderedYaml });
        }
        const title = commandName === "helm-lint-chart" ? "Helm Lint"
          : commandName === "helm-show-dependencies" ? "Helm Dependencies"
          : commandName === "helm-package-chart" ? "Helm Package"
          : "Helm Dependency Update";
        const command = buildHelmCommand(commandName, Object.assign({}, activeContext, { chartRoot }));
        const startedAt = Date.now();
        const result = await runTerminalCommand(command, { cwd: chartRoot, title });
        return createStructuredResult("helm", commandName, activeContext, chartRoot, command, result, startedAt);
      } catch (error) {
        const message = String(error?.message || "The Helm command could not be completed.");
        const toolName = isMissingToolOutput("helm", message) ? "helm" : "helm";
        return createStructuredResult(toolName, commandName, activeContext, chartRoot, "", { exitCode: 1, stderr: message, output: message }, Date.now());
      }
    }

    async function refreshCompletionItems(context = {}) {
      const requestId = ++completionRequestId;
      const activeContext = getContext(context);
      const chartRoot = await findChartRoot(activeContext);
      const functionItems = helmAuthoringDocs?.getFunctionCompletionItems?.() || [];
      if (!chartRoot || typeof deps.readFile !== "function") {
        if (requestId === completionRequestId) cachedCompletionItems = functionItems;
        return cachedCompletionItems;
      }
      const valuesPath = chartContext.joinPath(chartRoot, "values.yaml");
      const helpersPath = chartContext.joinPath(chartRoot, "templates/_helpers.tpl");
      const valuesYaml = await deps.readFile(valuesPath).catch(() => "");
      const helpersText = await deps.readFile(helpersPath).catch(() => "");
      const items = [...chartContext.createCompletionItems(valuesYaml, helpersText), ...functionItems];
      if (requestId === completionRequestId) cachedCompletionItems = items;
      return items;
    }

    function getCachedCompletionItems() {
      return cachedCompletionItems.slice();
    }

    const api = { buildHelmCommand, canExecute, execute, findChartRoot, getCachedCompletionItems, getDependencyFragment, isHelmChart, refreshCompletionItems };
    app?.registerModule?.("helmProjectCommands", api);
    return api;
  }

  global.registerMarkdownViewerHelmProjectCommands = registerMarkdownViewerHelmProjectCommands;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerHelmProjectCommands };
  }
})(typeof window !== "undefined" ? window : globalThis);