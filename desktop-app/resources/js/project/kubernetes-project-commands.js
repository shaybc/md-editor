// Kubernetes manifest project commands and kubectl command construction.
(function(global) {
  "use strict";

  /** Register Kubernetes actions for active YAML manifests. */
  function registerMarkdownViewerKubernetesProjectCommands(app, deps = {}) {
    const COMMANDS = new Set([
      "kubernetes-dry-run",
      "kubernetes-server-dry-run",
      "kubernetes-diff",
      "kubernetes-apply",
      "kubernetes-delete",
      "kubernetes-explain",
      "kubernetes-explain-field",
      "kubernetes-show-events",
      "kubernetes-logs",
      "kubernetes-follow-logs"
    ]);

    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/");
    }

    function quote(value) {
      const text = String(value || "");
      return /[\s"&|<>^]/.test(text) ? `"${text.replace(/"/g, '\\"')}"` : text;
    }

    function isYamlPath(filePath) {
      return /\.ya?ml$/i.test(String(filePath || ""));
    }

    function hasKubernetesHeader(content) {
      const fields = new Set();
      for (const line of String(content || "").split(/\r?\n/)) {
        if (/^\s*---\s*(#.*)?$/.test(line) && fields.size) break;
        const match = line.match(/^([A-Za-z][A-Za-z0-9_-]*)\s*:/);
        if (match) fields.add(match[1]);
      }
      return fields.has("apiVersion") && fields.has("kind");
    }

    function hasKubernetesPathHint(filePath) {
      const normalizedPath = normalizePath(filePath).toLowerCase();
      const fileName = normalizedPath.split("/").pop()?.replace(/\.ya?ml$/i, "") || "";
      return ["deployment", "service", "ingress", "configmap", "secret", "namespace", "serviceaccount", "job", "cronjob", "hpa", "horizontalpodautoscaler"].includes(fileName)
        || normalizedPath.split("/").some((segment) => ["k8s", "kubernetes", "manifests"].includes(segment));
    }

    function isRawHelmTemplate(context = {}) {
      const filePath = normalizePath(context.filePath || deps.getActiveFilePath?.() || "").toLowerCase();
      const content = Object.prototype.hasOwnProperty.call(context, "content") ? context.content : deps.getActiveEditorValue?.() || "";
      return /\/templates\//.test(filePath) && /{{[-\s]?/.test(String(content || ""));
    }

    function isKubernetesManifest(context = {}) {
      const filePath = context.filePath || deps.getActiveFilePath?.() || "";
      if (!isYamlPath(filePath)) return false;
      const content = Object.prototype.hasOwnProperty.call(context, "content") ? context.content : deps.getActiveEditorValue?.() || "";
      return hasKubernetesHeader(content) || hasKubernetesPathHint(filePath);
    }

    function getKubernetesContext() {
      return deps.kubernetesContext || app?.modules?.kubernetesContext || null;
    }

    function getKubectlPrefix(options = {}) {
      return getKubernetesContext()?.buildKubectlPrefix?.(options) || "kubectl";
    }

    function getContextSummary() {
      return getKubernetesContext()?.getContextSummary?.() || { contextName: "current context", namespaceName: "default", kubeconfigPath: "" };
    }

    function getYamlKeyPath(content, offset) {
      const text = String(content || "");
      const safeOffset = Math.max(0, Math.min(Number(offset || text.length), text.length));
      const before = text.slice(0, safeOffset);
      const lines = before.split(/\r?\n/);
      const stack = [];
      lines.forEach((line) => {
        const match = line.match(/^(\s*)([A-Za-z][A-Za-z0-9_.-]*)\s*:/);
        if (!match) return;
        const indent = match[1].replace(/\t/g, "  ").length;
        while (stack.length && stack[stack.length - 1].indent >= indent) stack.pop();
        stack.push({ indent, key: match[2] });
      });
      return stack.map((entry) => entry.key).join(".");
    }

    function getExplainTarget(context = {}) {
      const selected = String(context.selectedText || deps.getSelectedText?.() || "").trim();
      if (selected && /^[A-Za-z][A-Za-z0-9_.-]*$/.test(selected)) return selected;
      const content = Object.prototype.hasOwnProperty.call(context, "content") ? context.content : deps.getActiveEditorValue?.() || "";
      const keyPath = Object.prototype.hasOwnProperty.call(context, "cursorOffset") ? getYamlKeyPath(content, context.cursorOffset) : "";
      const kind = String(content.match(/^kind:\s*([^\r\n#]+)/m)?.[1] || "").trim().toLowerCase();
      return keyPath && kind ? `${kind}.${keyPath}` : (kind || keyPath || "pod");
    }

    function getResourceName(context = {}) {
      const selected = String(context.selectedText || deps.getSelectedText?.() || "").trim();
      if (selected && /^[A-Za-z0-9_.:/-]+$/.test(selected)) return selected;
      const content = Object.prototype.hasOwnProperty.call(context, "content") ? context.content : deps.getActiveEditorValue?.() || "";
      const name = String(content.match(/^\s*name:\s*([^\r\n#]+)/m)?.[1] || "").trim();
      const kind = String(content.match(/^kind:\s*([^\r\n#]+)/m)?.[1] || "pod").trim().toLowerCase();
      return name ? `${kind}/${name}` : "pod";
    }

    function resolveDryRunMode(commandName, context = {}) {
      if (context.dryRunMode === "server" || commandName === "kubernetes-server-dry-run") return "server";
      return "client";
    }

    /** Build the shell command used for a Kubernetes project action. */
    function buildKubectlCommand(commandName, context = {}) {
      const filePath = context.filePath || deps.getActiveFilePath?.() || "";
      const kubectl = getKubectlPrefix({ contextName: context.contextName, namespaceName: context.namespaceName });
      if (commandName === "kubernetes-dry-run" || commandName === "kubernetes-server-dry-run") {
        const validate = context.validateSchema === false ? " --validate=false" : "";
        return `${kubectl} apply --dry-run=${resolveDryRunMode(commandName, context)}${validate} -f ${quote(filePath)}`;
      }
      if (commandName === "kubernetes-diff") return `${kubectl} diff -f ${quote(filePath)}`;
      if (commandName === "kubernetes-apply") return `${kubectl} apply -f ${quote(filePath)}`;
      if (commandName === "kubernetes-delete") return `${kubectl} delete -f ${quote(filePath)}`;
      if (commandName === "kubernetes-explain" || commandName === "kubernetes-explain-field") return `${getKubectlPrefix({ includeNamespace: false })} explain ${getExplainTarget(context)}`;
      if (commandName === "kubernetes-show-events") return `${kubectl} get events --sort-by=.lastTimestamp`;
      if (commandName === "kubernetes-logs") return `${kubectl} logs ${quote(getResourceName(context))}`;
      if (commandName === "kubernetes-follow-logs") return `${kubectl} logs -f ${quote(getResourceName(context))}`;
      return "";
    }

    async function confirmClusterChange(commandName) {
      if (!["kubernetes-apply", "kubernetes-delete"].includes(commandName)) return true;
      const action = commandName === "kubernetes-delete" ? "Delete" : "Apply";
      const summary = getContextSummary();
      if (typeof deps.confirm !== "function") return false;
      return await deps.confirm({
        title: `${action} Kubernetes manifest?`,
        message: `${action} the active manifest with kubectl against ${summary.contextName} / namespace ${summary.namespaceName}?`,
        confirmLabel: action,
        cancelLabel: "Cancel",
        confirmVariant: commandName === "kubernetes-delete" ? "danger" : "primary"
      }) === true;
    }

    function canExecute(commandName, context = {}) {
      if (!COMMANDS.has(commandName)) return false;
      if (commandName === "kubernetes-show-events") return Boolean(context.folderPath || deps.getActiveFolderPath?.());
      if (["kubernetes-logs", "kubernetes-follow-logs"].includes(commandName)) return Boolean(context.folderPath || deps.getActiveFolderPath?.());
      if (!Boolean(context.folderPath || deps.getActiveFolderPath?.()) || !isKubernetesManifest(context)) return false;
      if (["kubernetes-dry-run", "kubernetes-server-dry-run", "kubernetes-diff", "kubernetes-apply", "kubernetes-delete"].includes(commandName) && isRawHelmTemplate(context)) return false;
      return true;
    }

    function getCommandOutput(result) {
      return String([result?.stderr, result?.stdout, result?.output].filter(Boolean).join("\n"));
    }

    function isMissingKubectlOutput(output) {
      const text = String(output || "").toLowerCase();
      return text.includes("'kubectl' is not recognized")
        || text.includes("\"kubectl\" is not recognized")
        || text.includes("kubectl: command not found")
        || text.includes("kubectl: not found")
        || text.includes("cannot find path 'kubectl'");
    }

    function isMissingManifestPathOutput(output) {
      const text = String(output || "").toLowerCase();
      return text.includes("does not exist") || text.includes("no such file or directory") || text.includes("the system cannot find the file specified");
    }

    function isOpenApiValidationOutput(output) {
      const text = String(output || "").toLowerCase();
      return text.includes("failed to download openapi") || text.includes("openapi") && text.includes("--validate=false");
    }

    function isFileBasedKubectlCommand(commandName) {
      return ["kubernetes-dry-run", "kubernetes-server-dry-run", "kubernetes-diff", "kubernetes-apply", "kubernetes-delete"].includes(commandName);
    }

    function canUseTemporaryManifest(commandName) {
      return ["kubernetes-dry-run", "kubernetes-server-dry-run"].includes(commandName);
    }

    function getMissingManifestPathMessage(filePath) {
      const path = String(filePath || "").trim();
      const suffix = path ? ` The active path is ${path}.` : "";
      return `kubectl needs a saved manifest file for this command.${suffix} Save the rendered YAML first, or use Project > Helm > Render + Server Dry Run to validate rendered Helm output without saving it.`;
    }

    function getTemporaryManifestFailureMessage(commandName) {
      const action = commandName === "kubernetes-dry-run" ? "Dry Run" : "Server Dry Run";
      return `Unable to create a temporary manifest for Kubernetes ${action}. Save the rendered YAML first, then retry ${action}.`;
    }

    function getOpenApiValidationMessage() {
      return "kubectl reached the Kubernetes API server, but the server did not provide the OpenAPI schema needed for validation. Check that the selected context points to a compatible Kubernetes cluster. You can also try Client Dry Run for local client-side validation, or rerun Server Dry Run with schema validation disabled in the options dialog.";
    }

    function getKubectlFailureMessage(exitCode, result, filePath) {
      const output = getCommandOutput(result);
      if (isMissingKubectlOutput(output)) return "kubectl is not available. Install kubectl and add it to PATH, or set the full kubectl executable path in Settings > Kubernetes.";
      if (isMissingManifestPathOutput(output)) return getMissingManifestPathMessage(filePath);
      if (isOpenApiValidationOutput(output)) return getOpenApiValidationMessage();
      return `kubectl exited with code ${exitCode}.`;
    }

    async function activeManifestPathExists(filePath) {
      const normalized = normalizePath(filePath);
      if (!normalized) return false;
      if (typeof deps.pathExists !== "function") return true;
      try {
        return await deps.pathExists(normalized) === true;
      } catch (_error) {
        return false;
      }
    }

    function createSourceRefs(context = {}, filePath = "") {
      const refs = [];
      const activePath = context.originalFilePath || context.filePath || filePath;
      if (activePath) refs.push({ kind: "manifest", label: activePath === filePath ? "Manifest" : "Active manifest", path: activePath });
      if (filePath && filePath !== activePath) refs.push({ kind: "temporary-manifest", label: "Temporary manifest", path: filePath });
      return refs;
    }

    function createStructuredResult(commandName, context, command, terminalResult, startedAt, filePath) {
      const exitCode = Number(terminalResult?.exitCode ?? 0);
      const output = getCommandOutput(terminalResult);
      const ok = exitCode === 0;
      const diagnostics = ok ? [] : [{ severity: "error", title: getKubectlFailureMessage(exitCode, terminalResult, context.originalFilePath || context.filePath || filePath), message: output || `kubectl exited with code ${exitCode}.` }];
      return {
        ok,
        tool: "kubectl",
        title: commandName.includes("explain") ? "Kubernetes Explain" : "Kubernetes Command",
        commandName,
        command,
        exitCode,
        stdout: String(terminalResult?.stdout || ""),
        stderr: String(terminalResult?.stderr || ""),
        output,
        startedAt,
        durationMs: Date.now() - startedAt,
        contextSummary: getContextSummary(),
        sourceRefs: createSourceRefs(context, filePath),
        diagnostics,
        resources: [],
        manifestContent: context.content || ""
      };
    }

    function createBlockedResult(commandName, context, message) {
      return {
        ok: false,
        tool: "kubectl",
        title: "Kubernetes Command",
        commandName,
        command: "",
        exitCode: null,
        stdout: "",
        stderr: message,
        output: message,
        startedAt: Date.now(),
        durationMs: 0,
        contextSummary: getContextSummary(),
        sourceRefs: createSourceRefs(context, context.filePath || ""),
        diagnostics: [{ severity: "error", title: message, message }],
        resources: [],
        manifestContent: context.content || ""
      };
    }

    /** Execute a Kubernetes project command and return a structured result. */
    async function execute(commandName, context = {}, options = {}) {
      const activeContext = Object.assign({}, context, options || {});
      if (!canExecute(commandName, activeContext)) {
        if (isRawHelmTemplate(activeContext)) return createBlockedResult(commandName, activeContext, "Render Helm templates before running kubectl apply, delete, diff, or dry-run.");
        return createBlockedResult(commandName, activeContext, "The Kubernetes command is not available for the active editor context.");
      }
      if (!await confirmClusterChange(commandName)) return { ok: false, cancelled: true, tool: "kubectl", commandName };
      const originalFilePath = activeContext.filePath || deps.getActiveFilePath?.() || "";
      let executionContext = Object.assign({}, activeContext, { originalFilePath });
      let temporaryManifestPath = "";
      if (isFileBasedKubectlCommand(commandName) && !await activeManifestPathExists(originalFilePath)) {
        if (!canUseTemporaryManifest(commandName) || typeof deps.writeTemporaryManifest !== "function") {
          return createBlockedResult(commandName, executionContext, getMissingManifestPathMessage(originalFilePath));
        }
        try {
          const content = Object.prototype.hasOwnProperty.call(activeContext, "content") ? activeContext.content : deps.getActiveEditorValue?.() || "";
          temporaryManifestPath = await deps.writeTemporaryManifest(content);
          executionContext = Object.assign({}, executionContext, { filePath: temporaryManifestPath, content });
        } catch (_error) {
          return createBlockedResult(commandName, executionContext, getTemporaryManifestFailureMessage(commandName));
        }
      }
      const command = buildKubectlCommand(commandName, executionContext);
      const cwd = activeContext.folderPath || deps.getActiveFolderPath?.() || "";
      if (typeof deps.terminal?.runCommand !== "function") return createBlockedResult(commandName, executionContext, "Terminal execution is unavailable.");
      const startedAt = Date.now();
      try {
        const result = await deps.terminal.runCommand(command, {
          cwd,
          title: commandName.includes("explain") ? "Kubernetes Explain" : "Kubernetes",
          interactive: true,
          captureOutput: true
        });
        return createStructuredResult(commandName, executionContext, command, result, startedAt, executionContext.filePath || originalFilePath);
      } catch (error) {
        const message = error?.message || "The Kubernetes command could not be completed.";
        return createStructuredResult(commandName, executionContext, command, { exitCode: 1, stderr: message, output: message }, startedAt, executionContext.filePath || originalFilePath);
      } finally {
        if (temporaryManifestPath && typeof deps.removeTemporaryManifest === "function") {
          try { await deps.removeTemporaryManifest(temporaryManifestPath); } catch (_error) {}
        }
      }
    }

    const api = { buildKubectlCommand, canExecute, execute, getExplainTarget, isKubernetesManifest, isRawHelmTemplate };
    app.registerModule?.("kubernetesProjectCommands", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesProjectCommands = registerMarkdownViewerKubernetesProjectCommands;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerKubernetesProjectCommands };
  }
})(typeof window !== "undefined" ? window : globalThis);