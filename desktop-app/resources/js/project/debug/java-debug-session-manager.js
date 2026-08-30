// Active-session facade and session list manager for Java debugger controllers.
(function(global) {
  "use strict";

  /** Register a Java debugger session manager that delegates commands to the active session. */
  function registerMarkdownViewerJavaDebugSessionManager(app, deps = {}) {
    const listeners = new Set();
    const sessions = [];
    let nextSessionNumber = 1;
    let activeSessionId = "";

    function registerSession(appInstance, sessionDeps) {
      const factory = deps.sessionFactory || global.registerMarkdownViewerJavaDebugSession;
      if (typeof factory !== "function") throw new Error("Java debug session support is unavailable.");
      const baseSessionDeps = deps.sessionDeps || deps;
      return factory(appInstance || app, { ...baseSessionDeps, ...sessionDeps, registerModule: false });
    }

    function isActiveDebugState(value) {
      return !["not-running", "terminated", "failed"].includes(String(value || "not-running"));
    }

    function isAttentionDebugState(value) {
      return ["paused", "stopped-at-breakpoint", "failed"].includes(String(value || ""));
    }

    function sessionLabelForConfiguration(configuration) {
      return String(configuration?.name || configuration?.java?.mainClass || `Debug Session ${nextSessionNumber}`).trim();
    }

    function createSession(label = "") {
      const id = `java-debug-session-${Date.now().toString(36)}-${nextSessionNumber}`;
      const record = {
        id,
        index: nextSessionNumber,
        label: label || `Debug Session ${nextSessionNumber}`,
        session: null,
        state: { state: "not-running" },
        unsubscribe: null
      };
      nextSessionNumber += 1;
      record.session = registerSession(app, {});
      sessions.push(record);
      if (!activeSessionId) activeSessionId = id;
      record.unsubscribe = record.session.subscribe?.((snapshot) => {
        record.state = snapshot || record.state;
        if (!activeSessionId || record.id === activeSessionId || isAttentionDebugState(record.state.state)) {
          activeSessionId = record.id;
        }
        notify();
      }) || null;
      notify();
      return record;
    }

    function getActiveRecord() {
      return sessions.find((record) => record.id === activeSessionId) || sessions[0] || createSession();
    }

    function sessionSummaries() {
      return sessions.map((record) => ({
        id: record.id,
        index: record.index,
        label: record.label,
        state: record.state?.state || "not-running",
        stoppedReason: record.state?.stoppedReason || "",
        target: record.state?.target || record.label,
        threadCount: (record.state?.threads || []).length,
        selectedFrameId: record.state?.selectedFrameId || ""
      }));
    }

    function decorateState(snapshot = {}) {
      return { ...snapshot, activeSessionId, debugSessions: sessionSummaries() };
    }

    function getState() {
      return decorateState(getActiveRecord().session.getState?.() || getActiveRecord().state || {});
    }

    function notify() {
      const snapshot = getState();
      listeners.forEach((listener) => { try { listener(snapshot); } catch (_error) {} });
      return snapshot;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      listener(getState());
      return function() { listeners.delete(listener); };
    }

    function chooseLaunchRecord(label) {
      const active = getActiveRecord();
      if (isActiveDebugState(active.state?.state)) return createSession(label);
      active.label = label || active.label;
      return active;
    }

    function selectSession(id) {
      const record = sessions.find((item) => item.id === id);
      if (!record) return false;
      activeSessionId = record.id;
      notify();
      return true;
    }

    async function start(configuration) {
      const label = sessionLabelForConfiguration(configuration);
      const record = chooseLaunchRecord(label);
      record.label = label;
      activeSessionId = record.id;
      notify();
      return record.session.start(configuration);
    }

    async function attach(host = "localhost", port = "5005") {
      const label = `Attach ${host || "localhost"}:${port || "5005"}`;
      const record = chooseLaunchRecord(label);
      record.label = label;
      activeSessionId = record.id;
      notify();
      return record.session.attach(host, port);
    }

    async function stopAll() {
      for (const record of sessions) await record.session.stop?.();
      notify();
      return true;
    }

    async function disposeTerminatedSessions() {
      for (let index = sessions.length - 1; index >= 0; index -= 1) {
        const record = sessions[index];
        if (isActiveDebugState(record.state?.state)) continue;
        record.unsubscribe?.();
        sessions.splice(index, 1);
      }
      if (!sessions.some((record) => record.id === activeSessionId)) activeSessionId = sessions[0]?.id || "";
      if (!sessions.length) createSession();
      notify();
      return true;
    }

    function delegate(method) {
      return (...args) => getActiveRecord().session[method]?.(...args);
    }

    createSession();

    const api = {
      subscribe,
      getState,
      getSessions: () => sessionSummaries(),
      getActiveSessionId: () => activeSessionId,
      selectSession,
      start,
      attach,
      stopAll,
      disposeTerminatedSessions,
      loadProjectState: delegate("loadProjectState"),
      restart: delegate("restart"),
      stop: delegate("stop"),
      resume: delegate("resume"),
      pause: delegate("pause"),
      stepOver: delegate("stepOver"),
      stepInto: delegate("stepInto"),
      stepOut: delegate("stepOut"),
      dropToFrame: delegate("dropToFrame"),
      requestVariables: delegate("requestVariables"),
      selectFrame: delegate("selectFrame"),
      expand: delegate("expand"),
      evaluate: delegate("evaluate"),
      evaluateForInspection: delegate("evaluateForInspection"),
      setValue: delegate("setValue"),
      runToCursor: delegate("runToCursor"),
      sendStdin: delegate("sendStdin"),
      clearConsole: delegate("clearConsole"),
      navigateToSource: delegate("navigateToSource"),
      addBreakpoint: delegate("addBreakpoint"),
      toggleBreakpoint: delegate("toggleBreakpoint"),
      setBreakpointEnabled: delegate("setBreakpointEnabled"),
      updateBreakpoint: delegate("updateBreakpoint"),
      setBreakpointsEnabled: delegate("setBreakpointsEnabled"),
      setBreakpointsMuted: delegate("setBreakpointsMuted"),
      removeBreakpoint: delegate("removeBreakpoint"),
      moveBreakpoint: delegate("moveBreakpoint"),
      clearBreakpoints: delegate("clearBreakpoints"),
      sendBreakpoint: delegate("sendBreakpoint"),
      sendExceptionBreakpoint: delegate("sendExceptionBreakpoint"),
      sendMethodBreakpoint: delegate("sendMethodBreakpoint"),
      addMethodBreakpoint: delegate("addMethodBreakpoint"),
      updateMethodBreakpoint: delegate("updateMethodBreakpoint"),
      setMethodBreakpointEnabled: delegate("setMethodBreakpointEnabled"),
      removeMethodBreakpoint: delegate("removeMethodBreakpoint"),
      updateExceptionBreakpoint: delegate("updateExceptionBreakpoint"),
      addWatch: delegate("addWatch"),
      updateWatch: delegate("updateWatch"),
      removeWatch: delegate("removeWatch"),
      refreshWatches: delegate("refreshWatches"),
      expandWatch: delegate("expandWatch")
    };

    app.registerModule?.("javaDebugSession", api);
    app.registerModule?.("javaDebugSessionManager", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugSessionManager = registerMarkdownViewerJavaDebugSessionManager;
})(typeof window !== "undefined" ? window : globalThis);