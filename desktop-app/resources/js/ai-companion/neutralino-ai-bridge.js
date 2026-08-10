(function(window) {
  "use strict";

  function registerMarkdownViewerNeutralinoAiBridge(app, deps) {
    let session = null;
    let nextRequestId = 1;
    const pending = new Map();
    let lastBridgeError = "";
    let exitTimer = null;
    let sessionStartPromise = null;

    function encodeRequest(value) {
      return btoa(unescape(encodeURIComponent(JSON.stringify(value || {}))));
    }

    function quoteCommandPart(value) {
      return `"${String(value || "").replace(/"/g, '\\"')}"`;
    }

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinBridgePath() {
      return Array.from(arguments).map(normalizePath).filter(Boolean).join("/");
    }

    function getDesktopRootPath() {
      const appRoot = normalizePath(deps.getDesktopAppRootPath?.() || "");
      return /(?:^|\/)resources$/i.test(appRoot) ? appRoot.replace(/\/resources$/i, "") : appRoot;
    }

    async function getProfileRootPath() {
      return normalizePath(await deps.getProfileDataDirPath?.() || "");
    }

    async function writeBridgeSessionFile(workspaceRoot, settings, profileRoot) {
      const Neutralino = getNeutralino();
      if (!Neutralino?.filesystem?.writeFile || !Neutralino.os?.getPath) return "";
      const tempFolder = normalizePath(await Neutralino.os.getPath("temp")).replace(/\/+$/, "");
      const randomPart = Math.random().toString(36).slice(2);
      const requestPath = `${tempFolder}/md-editor-ai-bridge-${Date.now()}-${randomPart}.json`;
      await Neutralino.filesystem.writeFile(requestPath, JSON.stringify({ workspaceRoot, settings, profileRoot }));
      return requestPath;
    }

    async function getBridgeCommand(workspaceRoot, settings, profileRoot) {
      const desktopRoot = getDesktopRootPath();
      const bridgePath = desktopRoot
        ? joinBridgePath(desktopRoot, "resources", "bridges", "ai-companion-bridge", "ai-companion-bridge.cjs")
        : joinBridgePath("resources", "bridges", "ai-companion-bridge", "ai-companion-bridge.cjs");
      const requestFile = await writeBridgeSessionFile(workspaceRoot, settings, profileRoot);
      if (requestFile) return `node ${quoteCommandPart(bridgePath)} --request-file ${quoteCommandPart(requestFile)}`;
      const payload = encodeRequest({ workspaceRoot, settings, profileRoot });
      return `node ${quoteCommandPart(bridgePath)} ${quoteCommandPart(payload)}`;
    }

    function getNeutralino() {
      return deps.Neutralino || window.Neutralino;
    }

    function hasProcessId(value) {
      return value !== null && value !== undefined && value !== "";
    }

    function getProcessDebugSnapshot(detail = {}) {
      return {
        eventId: String(detail.id ?? ""),
        eventPid: String(detail.pid ?? ""),
        action: String(detail.action || ""),
        dataLength: String(detail.data || "").length,
        sessionProcessId: String(session?.processId ?? ""),
        sessionProcessPid: String(session?.processPid ?? "")
      };
    }

    function getBridgeMessageSnapshot(detail = {}) {
      return {
        id: String(detail.id || ""),
        type: String(detail.type || ""),
        action: String(detail.action || ""),
        hasResult: detail.result !== undefined,
        resultKeys: detail.result && typeof detail.result === "object" ? Object.keys(detail.result).slice(0, 10) : [],
        error: String(detail.error || ""),
        pendingIds: Array.from(pending.keys()).slice(0, 10)
      };
    }

    function logBridgeDebug(message, details = {}) {
      void deps.appDebugLog?.("debug", `[ai-companion] bridge ${message}`, details);
    }

    function logBridgeWarning(message, details = {}) {
      void deps.appDebugLog?.("warning", `[ai-companion] bridge ${message}`, details);
    }

    function isSessionProcess(detail) {
      return session && (
        (hasProcessId(session.processId) && String(detail?.id ?? "") === String(session.processId)) ||
        (hasProcessId(session.processPid) && String(detail?.pid ?? "") === String(session.processPid))
      );
    }

    function createCancelledError() {
      const error = new Error("AI Companion request cancelled.");
      error.cancelled = true;
      return error;
    }

    function rememberBridgeError(value) {
      const text = String(value || "").trim();
      if (text) lastBridgeError = lastBridgeError ? `${lastBridgeError}` + "\n" + text : text;
    }

    function createBridgeExitError(fallback) {
      return new Error(lastBridgeError || fallback || "AI Companion bridge process exited before completing the request.");
    }

    function rejectPendingRequests(error) {
      pending.forEach((request) => request.reject(error));
      pending.clear();
    }

    function clearSession(error) {
      if (exitTimer) {
        window.clearTimeout?.(exitTimer);
        exitTimer = null;
      }
      const currentError = error || createBridgeExitError("AI Companion bridge process exited.");
      rejectPendingRequests(currentError);
      lastBridgeError = "";
      session?.unregisterProcessOwner?.();
      session = null;
    }

    async function ensureSession(workspaceRoot, settings) {
      const Neutralino = getNeutralino();
      if (!Neutralino?.os?.spawnProcess) throw new Error("AI Companion requires the desktop app runtime.");
      if (hasProcessId(session?.processId)) {
        logBridgeDebug("session reused", { processId: String(session.processId ?? ""), processPid: String(session.processPid ?? ""), workspaceRoot });
        return session;
      }
      if (sessionStartPromise) return sessionStartPromise;
      sessionStartPromise = (async function() {
        if (hasProcessId(session?.processId)) {
          try {
            await Neutralino.os.updateSpawnedProcess(session.processId, "exit");
          } catch (_error) {
            // Best-effort replacement when the workspace changes.
          }
        }
        lastBridgeError = "";
        const profileRoot = await getProfileRootPath();
        const command = await getBridgeCommand(workspaceRoot, settings, profileRoot);
        const cwd = getDesktopRootPath() || workspaceRoot || "";
        logBridgeDebug("session start requested", { workspaceRoot, cwd, commandLength: command.length });
        const handle = await Neutralino.os.spawnProcess(command, { cwd });
        session = {
          processId: handle?.id ?? handle,
          processPid: handle?.pid ?? "",
          workspaceRoot,
          profileRoot
        };
        session.unregisterProcessOwner = deps.processRouter?.registerProcess?.(handle, {
          onStdout(data, detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "stdOut", data }) }); },
          onStderr(data, detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "stdErr", data }) }); },
          onExit(detail) { handleSpawnedProcessEvent({ detail: Object.assign({}, detail, { action: "exit" }) }); }
        });
        logBridgeDebug("session started", { processId: String(session.processId ?? ""), processPid: String(session.processPid ?? ""), workspaceRoot });
        return session;
      })();
      try {
        return await sessionStartPromise;
      } finally {
        sessionStartPromise = null;
      }
    }

    async function sendToSession(message) {
      const Neutralino = getNeutralino();
      if (!hasProcessId(session?.processId)) throw new Error("AI Companion bridge is not running.");
      await Neutralino.os.updateSpawnedProcess(session.processId, "stdIn", `${JSON.stringify(message)}\n`);
    }

    function dispatchEvent(detail) {
      const id = String(detail?.id || "");
      if (!id && detail?.type === "error") {
        logBridgeWarning("startup error received", getBridgeMessageSnapshot(detail));
        rememberBridgeError(detail.error);
        clearSession(createBridgeExitError("AI Companion bridge failed to start."));
        return;
      }
      if (!id) {
        logBridgeWarning("response missing id", getBridgeMessageSnapshot(detail));
        return;
      }
      if (!pending.has(id)) {
        logBridgeWarning("response had no pending request", getBridgeMessageSnapshot(detail));
        return;
      }
      const request = pending.get(id);
      if (detail.type === "debug") {
        // Request/response diagnostics from the bridge process (see core/provider-debug.js),
        // routed to the app's debug log under the "ai-companion" category. Not a completion
        // signal � the request stays pending.
        logBridgeDebug("debug event received", getBridgeMessageSnapshot(detail));
        deps.appDebugLog?.(detail.level || "debug", detail.message || "[ai-companion] debug event", detail.details);
        if (detail.details?.kind === "rate-limit-retry") {
          request.onEvent?.({
            type: "rate-limit-wait",
            delayMs: detail.details.delayMs,
            providerDelayMs: detail.details.providerDelayMs,
            delaySource: detail.details.delaySource,
            quota: detail.details.quota
          });
        }
        return;
      }
      request.onEvent?.(detail);
      if (detail.type === "done") {
        logBridgeDebug("done response received", getBridgeMessageSnapshot(detail));
        pending.delete(id);
        request.resolve(detail.result || {});
      } else if (detail.type === "cancelled") {
        logBridgeDebug("cancelled response received", getBridgeMessageSnapshot(detail));
        pending.delete(id);
        request.reject(createCancelledError());
      } else if (detail.type === "error") {
        logBridgeWarning("error response received", getBridgeMessageSnapshot(detail));
        pending.delete(id);
        request.reject(new Error(detail.error || "AI Companion request failed."));
      }
    }
    function request(action, payload, onEvent) {
      const workspaceRoot = Object.hasOwn(payload, "workspaceRoot") ? String(payload.workspaceRoot || "") : deps.getWorkspaceRoot?.() || "";
      const settings = payload.settings || deps.getSettings?.() || {};
      const id = String(nextRequestId++);
      const message = { id, action, ...payload, workspaceRoot, settings, profileRoot: payload.profileRoot || session?.profileRoot || "" };
      const promise = new Promise((resolve, reject) => {
        pending.set(id, { resolve, reject, onEvent });
        logBridgeDebug("request queued", { id, action, workspaceRoot, pendingCount: pending.size });
        ensureSession(workspaceRoot, settings)
          .then((currentSession) => {
            message.profileRoot = message.profileRoot || currentSession.profileRoot || "";
            logBridgeDebug("request sending", { id, action, processId: String(currentSession.processId ?? ""), processPid: String(currentSession.processPid ?? "") });
            return getNeutralino().os.updateSpawnedProcess(currentSession.processId, "stdIn", `${JSON.stringify(message)}\n`).then(() => {
              logBridgeDebug("request sent", { id, action, processId: String(currentSession.processId ?? ""), processPid: String(currentSession.processPid ?? "") });
            });
          })
          .catch((error) => {
            logBridgeWarning("request send failed", { id, action, workspaceRoot, error: error?.message || String(error) });
            pending.delete(id);
            if (session && session.workspaceRoot === workspaceRoot) session = null;
            reject(error);
          });
      });
      promise.requestId = id;
      promise.cancel = () => cancel(id);
      return promise;
    }

    async function respondApproval(approvalId, decision, instructions = "", grantOptionId = "") {
      const normalizedDecision = decision === true ? "approve" : decision === false ? "reject" : String(decision || "reject");
      const result = await request("approval", {
        approvalId,
        approved: normalizedDecision === "approve",
        decision: ["approve", "reject", "instruct"].includes(normalizedDecision) ? normalizedDecision : "reject",
        instructions: String(instructions || "").trim(),
        grantOptionId: String(grantOptionId || "")
      });
      if (result.accepted !== true) throw new Error(result.error || "This approval request is no longer available.");
      return result;
    }

    async function respondUserInput(interactionId, answers = {}, declined = false) {
      const result = await request("userInput", {
        interactionId: String(interactionId || ""),
        answers: answers && typeof answers === "object" ? answers : {},
        declined: declined === true
      });
      if (result.accepted !== true) throw new Error(result.error || "This user question is no longer available.");
      return result;
    }

    async function respondAppAction(actionId, result, error = "") {
      const appActionId = String(actionId || "");
      await sendToSession({
        id: `app-action-response-${appActionId}`,
        action: "appActionResult",
        appActionId,
        ok: !error,
        result: result || {},
        error: String(error || "")
      });
      return true;
    }
    async function cancel(requestOrId) {
      const id = String(requestOrId?.requestId || requestOrId || "");
      if (!id || !pending.has(id)) return false;
      const Neutralino = getNeutralino();
      const currentSession = session;
      const request = pending.get(id);
      pending.delete(id);
      request.reject(createCancelledError());
      if (hasProcessId(currentSession?.processId) && Neutralino?.os?.updateSpawnedProcess) {
        await Neutralino.os.updateSpawnedProcess(currentSession.processId, "stdIn", `${JSON.stringify({ id: `cancel-${id}`, action: "cancel", targetId: id })}\n`);
      }
      return true;
    }

    function handleSpawnedProcessEvent(event) {
      const detail = event?.detail || {};
      if (!isSessionProcess(detail)) return;
      logBridgeDebug("spawned process event", getProcessDebugSnapshot(detail));
      if (detail.action === "stdErr") {
        rememberBridgeError(detail.data);
        deps.appDebugLog?.("warning", "[ai-companion] bridge stderr", { data: detail.data || "" });
        return;
      }
      if (detail.action === "exit") {
        const exitedProcessId = String(detail.id ?? "");
        const exitedProcessPid = String(detail.pid ?? "");
        exitTimer = window.setTimeout(function() {
          if (session && (String(session.processId) === exitedProcessId || String(session.processPid) === exitedProcessPid)) {
            clearSession(createBridgeExitError("AI Companion bridge process exited before completing the request."));
          }
        }, 50);
        return;
      }
      if (detail.action !== "stdOut") return;
      String(detail.data || "").split(/\r?\n/).filter(Boolean).forEach((line) => {
        try {
          const parsed = JSON.parse(line);
          logBridgeDebug("stdout line parsed", getBridgeMessageSnapshot(parsed));
          dispatchEvent(parsed);
        } catch (error) {
          rememberBridgeError(line);
          logBridgeWarning("dropped malformed bridge output", { message: error?.message || String(error), preview: String(line || "").slice(0, 300) });
        }
      });
    }

    if (!deps.processRouter) getNeutralino()?.events?.on?.("spawnedProcess", handleSpawnedProcessEvent);
    window.addEventListener("beforeunload", function() {
      if (!hasProcessId(session?.processId)) return;
      try {
        void getNeutralino()?.os?.updateSpawnedProcess(session.processId, "exit");
      } catch (_error) {
        // Shutdown is best-effort.
      }
    });

    const api = {
      cancel,
      request,
      respondApproval,
      respondUserInput,
      respondAppAction,
      testConnection: function(settings, ephemeralCredentials) { return request("testConnection", { settings, ephemeralCredentials, workspaceRoot: deps.getWorkspaceRoot?.() || "" }); },
      credentialStore: function(payload) { return request("credentialStore", Object.assign({ settings: {} }, payload || {})); },
      credentialExists: function(payload) { return request("credentialExists", Object.assign({ settings: {} }, payload || {})); },
      credentialDelete: function(payload) { return request("credentialDelete", Object.assign({ settings: {} }, payload || {})); },
      inspectCertificate: function(payload) { return request("inspectCertificate", payload || {}); },
      chat: function(payload, onEvent) { return request("chat", payload, onEvent); },
      autocomplete: function(payload, onEvent) { return request("autocomplete", payload, onEvent); },
      gitSummary: function(payload, onEvent) { return request("gitSummary", payload, onEvent); },
      plan: function(payload, onEvent) { return request("plan", payload, onEvent); },
      runRecoveryInspect: function(payload) { return request("runRecoveryInspect", payload || {}); },
      schedulesClaimDue: function(payload) { return request("schedulesClaimDue", payload || {}); },
      scheduleComplete: function(payload) { return request("scheduleComplete", payload || {}); },
      plansList: function(payload) { return request("plansList", payload || {}); },
      planRead: function(payload) { return request("planRead", payload || {}); },
      planUpdate: function(payload) { return request("planUpdate", payload || {}); },
      planDelete: function(payload) { return request("planDelete", payload || {}); },
      planUpdateStatus: function(payload) { return request("planUpdateStatus", payload || {}); },
      planRebuildIndex: function(payload) { return request("planRebuildIndex", payload || {}); },
      promptsGet: function(payload) { return request("promptsGet", Object.assign({ workspaceRoot: getDesktopRootPath() || "ai-prompts", settings: {} }, payload || {})); },
      promptUpdate: function(payload) { return request("promptUpdate", Object.assign({ workspaceRoot: getDesktopRootPath() || "ai-prompts", settings: {} }, payload || {})); },
      promptsUpgradeCheck: function(payload) { return request("promptsUpgradeCheck", Object.assign({ workspaceRoot: getDesktopRootPath() || "ai-prompts", settings: {} }, payload || {})); },
      promptsUpgradeConflicts: function(payload) { return request("promptsUpgradeConflicts", Object.assign({ workspaceRoot: getDesktopRootPath() || "ai-prompts", settings: {} }, payload || {})); },
      promptsUpgradeResolve: function(payload) { return request("promptsUpgradeResolve", Object.assign({ workspaceRoot: getDesktopRootPath() || "ai-prompts", settings: {} }, payload || {})); },
      securityPolicyGet: function(payload) { return request("securityPolicyGet", payload || {}); },
      extensionsList: function(payload) { return request("extensionsList", payload || {}); },
      lifecycleList: function(payload) { return request("lifecycleList", payload || {}); },
      extensionConfigure: function(payload) { return request("extensionConfigure", payload || {}); },
      extensionRead: function(payload) { return request("extensionRead", payload || {}); },
      extensionValidate: function(payload) { return request("extensionValidate", payload || {}); },
      extensionSave: function(payload) { return request("extensionSave", payload || {}); },
      extensionRename: function(payload) { return request("extensionRename", payload || {}); },
      extensionDuplicate: function(payload) { return request("extensionDuplicate", payload || {}); },
      extensionExport: function(payload) { return request("extensionExport", payload || {}); },
      extensionTrash: function(payload) { return request("extensionTrash", payload || {}); },
      extensionTrashList: function(payload) { return request("extensionTrashList", payload || {}); },
      extensionRestore: function(payload) { return request("extensionRestore", payload || {}); },
      approvalGrantsList: function(payload) { return request("approvalGrantsList", payload || {}); },
      approvalGrantRevoke: function(payload) { return request("approvalGrantRevoke", payload || {}); },
      approvalGrantsReplace: function(payload) { return request("approvalGrantsReplace", payload || {}); },
      approvalLegacyImport: function(payload) { return request("approvalLegacyImport", payload || {}); },
      agent: function(payload, onEvent) { return request("agent", payload, onEvent); }
    };
    app.registerModule("neutralinoAiBridge", api);
    return api;
  }

  window.registerMarkdownViewerNeutralinoAiBridge = registerMarkdownViewerNeutralinoAiBridge;
})(window);
