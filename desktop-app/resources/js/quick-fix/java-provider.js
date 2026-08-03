(function(global) {
  "use strict";

  /** Request and normalize authoritative Java quick fixes from Eclipse JDT LS. */
  function registerMarkdownViewerJavaQuickFixProvider(app, deps = {}) {
    const requestClient = deps.requestClient;
    const diagnosticStore = deps.diagnosticStore;

    function actionKey(action) {
      return [
        String(action?.title || ""),
        String(action?.kind || ""),
        JSON.stringify(action?.edit || null),
        JSON.stringify(action?.command || null)
      ].join("|");
    }

    function getWorkspaceEdit(action) {
      if (action?.edit) return action.edit;
      const command = action?.command;
      if (command?.command !== "java.apply.workspaceEdit") return null;
      const candidate = Array.isArray(command.arguments) ? command.arguments[0] : null;
      return candidate && typeof candidate === "object" ? candidate : null;
    }

    async function requestResolvedAction(transport, action) {
      if (!action || action.edit || action.command || !action.data) return action;
      return requestClient.request(transport, "codeAction/resolve", action, {
        label: "Quick Fix action resolution"
      });
    }

    function normalizeAction(action, index, transport) {
      const workspaceEdit = getWorkspaceEdit(action);
      const disabledReason = action?.disabled?.reason || "";
      const opaqueCommand = !!(action?.command && !workspaceEdit);
      const needsResolve = !workspaceEdit && !action?.command && !!action?.data && !disabledReason;
      return {
        id: `jdt-${index}`,
        title: String(action?.title || "Unnamed JDT fix"),
        kind: String(action?.kind || ""),
        provenance: "JDT",
        isPreferred: action?.isPreferred === true,
        disabled: Boolean(disabledReason || opaqueCommand || (!workspaceEdit && !needsResolve)),
        disabledReason: disabledReason
          || (opaqueCommand ? "This server command cannot be previewed safely." : "")
          || (!workspaceEdit && !needsResolve ? "JDT did not return a previewable workspace edit." : ""),
        needsResolve,
        workspaceEdit,
        rawAction: action,
        transport
      };
    }

    async function resolveAction(action) {
      if (!action?.needsResolve) return action;
      const resolved = await requestResolvedAction(action.transport, action.rawAction);
      return {
        ...normalizeAction(resolved, Number(String(action.id || "").replace("jdt-", "")) || 0, action.transport),
        id: action.id
      };
    }

    /**
     * Return previewable quick fixes for one live Java diagnostic.
     * @param {object} problem Problems-panel diagnostic.
     * @param {object} options Discovery behavior for the active editor.
     * @returns {Promise<object>} Actions, matched diagnostic, and no-fix reason.
     */
    async function getActions(problem, options = {}) {
      const diagnostic = diagnosticStore.findMatchingDiagnostic(problem);
      if (!diagnostic) {
        return { actions: [], diagnostic: null, reason: "The problem is stale or has not been published by JDT LS yet." };
      }
      if (options.ensureDocumentOpen !== false) await deps.openDiagnostic?.(diagnostic);
      const context = await deps.getDocumentContext?.(diagnostic);
      if (!context?.transport || !context?.fileUri) {
        return { actions: [], diagnostic, reason: "The Java language server is unavailable or still initializing." };
      }
      const actions = await requestClient.request(context.transport, "textDocument/codeAction", {
        textDocument: { uri: diagnostic.uri || context.fileUri },
        range: diagnostic.range,
        context: {
          diagnostics: [diagnostic.lspDiagnostic],
          only: ["quickfix"]
        }
      }, { label: "Quick Fix" });
      const seen = new Set();
      const normalized = (Array.isArray(actions) ? actions : [])
        .filter((action) => action && !seen.has(actionKey(action)) && seen.add(actionKey(action)))
        .map((action, index) => normalizeAction(action, index, context.transport))
        .sort((left, right) => Number(right.isPreferred) - Number(left.isPreferred));
      return {
        actions: normalized,
        diagnostic,
        reason: normalized.length ? "" : "JDT LS returned no quick fixes for this problem."
      };
    }

    const api = { getActions, getWorkspaceEdit, resolveAction };
    app.registerModule?.("javaQuickFixProvider", api);
    return api;
  }

  global.registerMarkdownViewerJavaQuickFixProvider = registerMarkdownViewerJavaQuickFixProvider;
})(typeof window !== "undefined" ? window : globalThis);
