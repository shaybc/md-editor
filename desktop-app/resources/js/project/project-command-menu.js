(function(global) {
  "use strict";

  /**
   * Own Project command capability state and dispatch.
   * @param {object} app Application module registry.
   * @param {object} deps Project context and Problems dependencies.
   * @returns {object} Project command API.
   */
  function registerMarkdownViewerProjectCommandMenu(app, deps = {}) {
    const commandButtons = Array.from(document.querySelectorAll("[data-project-command]"));
    const documentationModal = document.getElementById("project-documentation-modal");
    const documentationScope = document.getElementById("project-documentation-scope");
    const documentationConfirm = document.getElementById("project-documentation-confirm");
    const documentationCancel = document.getElementById("project-documentation-cancel");
    const providers = new Map();

    function getContext(overrides = {}) {
      return Object.assign({
        folderPath: String(deps.getActiveFolderPath?.() || ""),
        filePath: String(deps.getActiveFilePath?.() || ""),
        targetPath: "",
        targetKind: ""
      }, overrides);
    }

    function findProvider(context) {
      return Array.from(providers.values()).find((provider) => provider?.supports?.(context) === true) || null;
    }

    function getCapability(provider, commandName, context) {
      if (commandName === "show-problems" || commandName === "show-tasks") return true;
      if (commandName === "show-java-rebuild") return Boolean(context.folderPath && deps.javaRebuildOutput?.show);
      if (/^kubernetes-/.test(commandName)) return deps.kubernetesCommands?.canExecute?.(commandName, context) === true;
      if (/^helm-/.test(commandName)) return deps.helmCommands?.canExecute?.(commandName, context) === true;
      if (commandName === "manage-rat-licenses") return Boolean(context.folderPath && deps.getRatManager?.()?.open);
      if (commandName === "manage-rat-policy") return Boolean(context.folderPath && deps.getRatPolicyManager?.()?.open);
      if (!provider) return false;
      if (commandName === "java-build-path") return provider.canConfigureBuildPath?.(context) === true;
      if (commandName === "compile-file") return provider.canCompileFile?.(context) === true;
      if (commandName === "compile-folder") return provider.canCompileTarget?.(context) === true;
      if (commandName === "clean-project") return provider.canCleanProject?.(context) === true;
      if (commandName === "rebuild-project" || commandName === "rebuild-project-last-options") return provider.canRebuildProject?.(context) === true;
      if (commandName === "generate-documentation") return provider.canGenerateDocumentation?.(context) === true;
      return false;
    }

    function updateAvailability(overrides = {}) {
      const context = getContext(overrides);
      const provider = findProvider(context);
      commandButtons.forEach((button) => {
        const commandName = button.dataset.projectCommand;
        const enabled = getCapability(provider, commandName, context);
        button.disabled = !enabled;
        button.setAttribute("aria-disabled", enabled ? "false" : "true");
      });
      return { context, provider };
    }

    function closeDocumentationDialog() {
      if (documentationModal) documentationModal.style.display = "none";
    }

    function getAvailableDocumentationScopes(provider, context) {
      const requested = ["method", "file", "folder", "project"];
      return requested.filter((scope) => provider?.canGenerateDocumentation?.(Object.assign({}, context, { scope })) === true);
    }

    function chooseDefaultDocumentationScope(context, scopes) {
      if (context.targetKind === "method" && scopes.includes("method")) return "method";
      if (context.targetKind === "directory" && scopes.includes("folder")) return "folder";
      if ((context.targetKind === "file" || context.filePath) && scopes.includes("file")) return "file";
      return scopes.includes("project") ? "project" : scopes[0];
    }

    function openDocumentationDialog(provider, context) {
      if (!documentationModal || !documentationScope) return Promise.resolve(null);
      const scopes = getAvailableDocumentationScopes(provider, context);
      Array.from(documentationScope.options).forEach((option) => {
        option.disabled = !scopes.includes(option.value);
      });
      documentationScope.value = chooseDefaultDocumentationScope(context, scopes) || "project";
      documentationModal.style.display = "flex";
      documentationScope.focus();
      return new Promise((resolve) => {
        const finish = (value) => {
          documentationConfirm?.removeEventListener("click", confirm);
          documentationCancel?.removeEventListener("click", cancel);
          documentationModal?.removeEventListener("click", backdrop);
          closeDocumentationDialog();
          resolve(value);
        };
        const confirm = () => finish(documentationScope.value);
        const cancel = () => finish(null);
        const backdrop = (event) => { if (event.target === documentationModal) finish(null); };
        documentationConfirm?.addEventListener("click", confirm);
        documentationCancel?.addEventListener("click", cancel);
        documentationModal?.addEventListener("click", backdrop);
      });
    }

    async function execute(commandName, overrides = {}) {
      if (commandName === "show-problems") {
        deps.problemsPanel?.show?.();
        return true;
      }
      if (commandName === "show-tasks") {
        deps.tasksPanel?.toggle?.();
        return true;
      }
      if (commandName === "show-java-rebuild") {
        const context = getContext(overrides);
        if (!getCapability(null, commandName, context)) return false;
        try {
          await deps.javaRebuildOutput.show(context.folderPath);
          return true;
        } catch (error) {
          deps.alert?.(error?.message || "The Java Rebuild output could not be opened.");
          return false;
        }
      }
      if (commandName === "manage-rat-licenses") {
        const context = getContext(overrides);
        if (!getCapability(null, commandName, context)) return false;
        try {
          await deps.getRatManager().open({
            route: overrides.route || "finding.summary",
            projectPath: context.folderPath,
            targetPath: context.targetPath || context.filePath || context.folderPath,
            diagnostic: overrides.diagnostic,
            finding: overrides.finding
          });
          return true;
        } catch (error) {
          deps.alert?.(error?.message || "Apache RAT License Audit could not be opened.");
          return false;
        }
      }
      if (commandName === "manage-rat-policy") {
        const context = getContext(overrides);
        if (!getCapability(null, commandName, context)) return false;
        try {
          await deps.getRatPolicyManager().open({
            route: overrides.route || "overview",
            mode: overrides.mode || "guided",
            projectPath: context.folderPath
          });
          return true;
        } catch (error) {
          deps.alert?.(error?.message || "Apache RAT Policy Manager could not be opened.");
          return false;
        }
      }
      if (/^kubernetes-/.test(commandName)) {
        const context = getContext(overrides);
        if (!getCapability(null, commandName, context)) return false;
        let commandOptions = {};
        if (commandName === "kubernetes-dry-run" || commandName === "kubernetes-server-dry-run") {
          const summary = deps.kubernetesContext?.getContextSummary?.() || { contextName: "current context", namespaceName: "default" };
          commandOptions = await deps.kubernetesCommandOptionsDialog?.open?.({
            dryRunMode: commandName === "kubernetes-server-dry-run" ? "server" : "client",
            validateSchema: true,
            contextName: summary.contextName,
            namespaceName: summary.namespaceName,
            manifestSource: context.filePath || "active manifest",
            manifestPath: context.filePath || "<manifest>",
            command: "kubectl apply"
          });
          if (!commandOptions) return false;
        }
        const result = await deps.kubernetesCommands.execute(commandName, context, commandOptions);
        if (result && !result.cancelled) {
          deps.terminal?.attachCommandResult?.(result.terminalTabId, result);
          deps.projectCommandResultModal?.open?.(result);
        }
        return result?.ok === true;
      }
      if (/^helm-/.test(commandName)) {
        const context = getContext(overrides);
        if (!getCapability(null, commandName, context)) return false;
        const result = await deps.helmCommands.execute(commandName, context);
        if (result && !result.cancelled) {
          deps.terminal?.attachCommandResult?.(result.terminalTabId, result);
          deps.projectCommandResultModal?.open?.(result);
        }
        return result?.ok === true;
      }
      const context = getContext(overrides);
      const provider = findProvider(context);
      if (!getCapability(provider, commandName, context)) return false;
      const buildStartedAt = ["compile-file", "compile-folder", "rebuild-project", "rebuild-project-last-options"].includes(commandName)
        ? Date.now()
        : 0;
      try {
        if (commandName === "java-build-path") await provider.configureBuildPath(context);
        if (commandName === "compile-file") await provider.compileFile(context);
        if (commandName === "compile-folder") await provider.compileTarget(context);
        if (commandName === "clean-project") await provider.cleanProject(context);
        if (commandName === "rebuild-project") return await provider.rebuildProject(context);
        if (commandName === "rebuild-project-last-options") {
          return await provider.rebuildProject(context, {
            useLastOptions: true,
            configureIfMissing: overrides.configureIfMissing === true,
            waitForAnalysis: overrides.waitForAnalysis !== false
          });
        }
        if (commandName === "generate-documentation") {
          await provider.generateDocumentation(Object.assign({}, context, overrides.scope ? { scope: overrides.scope } : {}));
        }
        return true;
      } catch (error) {
        const diagnostics = Array.isArray(error?.diagnostics) ? error.diagnostics : [];
        if (diagnostics.length) deps.problemsPanel?.setDiagnostics?.(diagnostics, { revealErrors: true });
        deps.alert?.(error?.message || "The project command could not be completed.");
        return false;
      } finally {
        if (buildStartedAt) deps.statistics?.recordBuild?.(Date.now() - buildStartedAt);
      }
    }

    async function executeStructured(operationName, args = {}) {
      const context = getContext({
        targetPath: String(args.targetPath || ""),
        targetKind: args.scope === "file" ? "file" : "directory"
      });
      const provider = findProvider(context);
      if (!provider) throw new Error("No project provider supports the structured execution target.");
      if (operationName === "compile_project" && typeof provider.compileProject === "function") {
        const result = await provider.compileProject(context, args);
        deps.statistics?.recordBuild?.(result?.durationMs || 0);
        return result;
      }
      if (operationName === "run_tests" && typeof provider.runTests === "function") {
        return provider.runTests(context, args);
      }
      throw new Error(`The project provider does not support ${operationName}.`);
    }

    function registerProvider(id, provider) {
      const providerId = String(id || "").trim();
      if (!providerId || !provider) throw new Error("Project command providers require an id and implementation.");
      providers.set(providerId, provider);
      updateAvailability();
      return function unregisterProvider() {
        providers.delete(providerId);
        updateAvailability();
      };
    }

    commandButtons.forEach((button) => {
      button.addEventListener("click", () => void execute(button.dataset.projectCommand));
    });
    document.querySelectorAll(".application-menu-project > .application-menu-category-toggle").forEach((toggle) => {
      toggle.addEventListener("mouseenter", () => updateAvailability());
      toggle.addEventListener("focus", () => updateAvailability());
    });
    updateAvailability();

    const api = { execute, executeStructured, getContext, registerProvider, updateAvailability };
    app.registerModule?.("projectCommands", api);
    return api;
  }

  global.registerMarkdownViewerProjectCommandMenu = registerMarkdownViewerProjectCommandMenu;
})(typeof window !== "undefined" ? window : globalThis);
