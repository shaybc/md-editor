// Global Java debugger toolbar for the main IDE header.
(function(global, document) {
  "use strict";

  /**
   * Register a compact IDE-style toolbar that controls the active Java debug session.
   * @param {object} app - MD-Editor application service registry.
   * @param {object} deps - Debug session, panel, editor, and notification dependencies.
   * @returns {object|null} Toolbar controller, or null when the host is unavailable.
   */
  function registerMarkdownViewerJavaDebugGlobalToolbar(app, deps = {}) {
    const host = deps.host || document.getElementById("java-debug-header-toolbar");
    if (!host || !deps.session) return null;
    const viewModeControls = deps.viewModeControls || document.querySelector(".header-panel-controls .view-mode-group");

    let lastState = deps.session.getState?.() || { state: "not-running", breakpoints: [] };

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }

    function isRunning(debugState) {
      return ["running", "launching", "stepping", "evaluating"].includes(debugState);
    }

    function isStopped(debugState) {
      return debugState === "paused" || debugState === "stopped-at-breakpoint";
    }

    function isActive(debugState) {
      return !["not-running", "terminated", "failed"].includes(debugState);
    }

    function findSelectedFrame(state) {
      const selectedFrameId = state.selectedFrameId;
      for (const thread of state.threads || []) {
        for (const frame of thread.frames || []) {
          if (frame.id === selectedFrameId) return frame;
        }
      }
      return null;
    }

    function findSelectedThread(state) {
      const selectedFrameId = state.selectedFrameId;
      return (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === selectedFrameId)) || null;
    }

    function formatThreadDetail(thread) {
      if (!thread) return "";
      const status = thread.suspended ? `${thread.status || "unknown"}, suspended` : (thread.status || "unknown");
      return `${thread.name || thread.id || "Thread"}${thread.id ? ` #${thread.id}` : ""} (${status})`;
    }

    function formatFrameTitle(frame) {
      if (!frame) return "";
      return `${frame.className || "<unknown>"}.${frame.method || "<unknown>"}`;
    }

    function formatFrameSource(frame) {
      if (!frame) return "";
      return `${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""}`;
    }

    function hasAnyBreakpoint(state) {
      return (state.breakpoints || []).length > 0
        || (state.methodBreakpoints || []).length > 0
        || Boolean(state.exceptionBreakpoint && state.exceptionBreakpoint.enabled !== false);
    }

    function hasEnabledBreakpoint(state) {
      return (state.breakpoints || []).some((breakpoint) => breakpoint.enabled !== false)
        || (state.methodBreakpoints || []).some((breakpoint) => breakpoint.enabled !== false)
        || Boolean(state.exceptionBreakpoint && state.exceptionBreakpoint.enabled !== false);
    }

    function canRunToCursor(state) {
      const path = deps.getActiveEditorPath?.() || "";
      return isStopped(state.state) && Boolean(findSelectedFrame(state)) && deps.isJavaSourcePath?.(path);
    }

    function canToggleActiveLineBreakpoint() {
      return deps.isJavaSourcePath?.(deps.getActiveEditorPath?.() || "") === true;
    }

    function canStep(state) {
      return isStopped(state.state) && Boolean(findSelectedFrame(state));
    }

    function canDropSelectedFrame(state) {
      return isStopped(state.state) && findSelectedFrame(state)?.canDrop === true;
    }

    function dropFrameTitle(state) {
      const frame = findSelectedFrame(state);
      if (canDropSelectedFrame(state)) return `Drop to Frame: ${frame.className || "<unknown>"}.${frame.method || "<unknown>"}`;
      if (!isStopped(state.state)) return "Pause at a Java stack frame before using Drop to Frame";
      if (!frame) return "Select a suspended stack frame before using Drop to Frame";
      return "The selected JVM stack frame does not support Drop to Frame";
    }

    function renderButton(action, icon, title, disabled = false, active = false) {
      return `<button type="button" class="java-debug-header-button${active ? " active" : ""}" data-debug-header-action="${escapeHtml(action)}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}" aria-pressed="${active ? "true" : "false"}"${disabled ? " disabled" : ""}><i class="bi ${escapeHtml(icon)}" aria-hidden="true"></i></button>`;
    }
    function shortcutLabel(commandId, fallback) {
      const shortcuts = app.modules?.keyboardShortcuts;
      const binding = shortcuts?.getEffectiveBinding?.(commandId);
      const formatted = shortcuts?.formatBinding?.(binding);
      return formatted && formatted !== "Unassigned" ? formatted : fallback;
    }

    function titleWithShortcut(label, commandId, fallback) {
      const shortcut = shortcutLabel(commandId, fallback);
      return shortcut ? `${label} (${shortcut})` : label;
    }


    function formatDebugState(value) {
      const labels = {
        "not-running": "Not running",
        launching: "Launching",
        running: "Running",
        paused: "Paused",
        "stopped-at-breakpoint": "Stopped at breakpoint",
        stepping: "Stepping",
        evaluating: "Evaluating expression",
        terminated: "Terminated",
        failed: "Failed"
      };
      return labels[String(value || "not-running")] || String(value || "Not running");
    }

    function stoppedReasonLabel(reason, fallback, state = {}) {
      if (String(reason || "") === "exception" && state?.stoppedDescription) return state.stoppedDescription;
      const labels = { breakpoint: "Stopped at breakpoint", "method-breakpoint": "Stopped at method breakpoint", exception: "Stopped at exception", "run-to-cursor": "Run to Cursor complete", step: "Step complete", pause: "Paused" };
      return labels[String(reason || "")] || fallback;
    }

    function stateLabel(state) {
      const baseLabel = formatDebugState(state?.state);
      const label = isStopped(state?.state) ? stoppedReasonLabel(state?.stoppedReason, baseLabel, state) : baseLabel;
      if (state.breakpointsMuted) return `${label} - Breakpoints muted`;
      return label;
    }

    function selectedFrameContextLabel(state) {
      const frame = findSelectedFrame(state || {});
      if (!frame) return "";
      const source = formatFrameSource(frame);
      return `${formatFrameTitle(frame)}${source ? ` - ${source}` : ""}`;
    }

    function toolbarStateText(state) {
      const label = stateLabel(state);
      const context = isStopped(state?.state) ? selectedFrameContextLabel(state) : "";
      return context ? `${label} - ${context}` : label;
    }

    function toolbarStateTitle(state) {
      if (state?.lastError) return state.lastError;
      const context = selectedFrameContextLabel(state);
      const thread = formatThreadDetail(findSelectedThread(state || {}));
      return [stateLabel(state), thread, context].filter(Boolean).join(" - ");
    }

    function hasOpenProject() {
      return Boolean(deps.store?.getSnapshot?.().projectPath);
    }

    function setToolbarVisible(visible) {
      host.hidden = !visible;
      if (viewModeControls) {
        viewModeControls.hidden = visible;
        viewModeControls.style.display = visible ? "none" : "";
      }
    }

    function render(state = lastState) {
      const debugState = state.state || "not-running";
      if (!isActive(debugState)) {
        setToolbarVisible(false);
        host.innerHTML = "";
        return false;
      }
      setToolbarVisible(true);
      const running = isRunning(debugState);
      const stopped = isStopped(debugState);
      const stepAvailable = canStep(state);
      const active = isActive(debugState);
      const hasBreakpoints = hasAnyBreakpoint(state);
      const enabledBreakpoints = hasEnabledBreakpoint(state);
      const canLaunchDebug = hasOpenProject() && !active;
      host.innerHTML = `<div class="java-debug-header-controls" role="toolbar" aria-label="Java debugger">
        ${renderButton("start", "bi-bug-fill", titleWithShortcut("Start Debugging", "debug-start-continue", "F5"), !canLaunchDebug)}
        ${renderButton("attach", "bi-plug", "Attach to JVM", !canLaunchDebug)}
        ${renderButton("resume", "java-debug-icon java-debug-icon-continue", titleWithShortcut("Continue / Resume", "debug-start-continue", "F5"), !stopped)}
        ${renderButton("pause", "bi-pause-fill", titleWithShortcut("Pause / Suspend", "debug-pause", "F6"), !running)}
        ${renderButton("stop", "bi-stop-fill", titleWithShortcut("Stop / Terminate", "debug-stop", "Shift+F5"), !active)}
        ${renderButton("restart", "bi-arrow-clockwise", "Restart Debug Session", !state.restartable)}
        <span class="java-debug-header-separator" aria-hidden="true"></span>
        ${renderButton("step-over", "java-debug-icon java-debug-icon-step-over", titleWithShortcut("Step Over", "debug-step-over", "F10"), !stepAvailable)}
        ${renderButton("step-into", "java-debug-icon java-debug-icon-step-into", titleWithShortcut("Step Into", "debug-step-into", "F11"), !stepAvailable)}
        ${renderButton("step-out", "java-debug-icon java-debug-icon-step-out", titleWithShortcut("Step Out / Step Return", "debug-step-out", "Shift+F11"), !stepAvailable)}
        ${renderButton("run-to-cursor", "bi-cursor", titleWithShortcut("Run to Cursor", "debug-run-to-cursor", "Ctrl+F10"), !canRunToCursor(state))}
        ${renderButton("drop-frame", "bi-arrow-counterclockwise", dropFrameTitle(state), !canDropSelectedFrame(state))}
        <span class="java-debug-header-separator" aria-hidden="true"></span>
        ${renderButton("toggle-line-breakpoint", "bi-record-circle", titleWithShortcut("Toggle Line Breakpoint", "debug-toggle-breakpoint", "F9"), !canToggleActiveLineBreakpoint())}
        ${renderButton("toggle-breakpoints", enabledBreakpoints ? "bi-slash-circle" : "bi-record-circle", enabledBreakpoints ? "Disable All Breakpoints" : "Enable All Breakpoints", !hasBreakpoints)}
        ${renderButton("mute-breakpoints", state.breakpointsMuted ? "bi-volume-up" : "bi-volume-mute", state.breakpointsMuted ? "Unmute Breakpoints" : "Mute Breakpoints", !hasBreakpoints, state.breakpointsMuted === true)}
        ${renderButton("workspace", "bi-window-sidebar", "Open Debug Workspace", false)}
        <span class="java-debug-header-state java-debug-header-state-${escapeHtml(debugState)}" title="${escapeHtml(toolbarStateTitle(state))}">${escapeHtml(toolbarStateText(state))}</span>
      </div>`;
      return true;
    }

    function notifyError(error) {
      const message = String(error?.message || error || "Java debugger command failed.");
      if (typeof deps.alert === "function") return deps.alert(message);
      return app.services?.notify?.show?.({ title: "Java Debugger", message, type: "error" });
    }

    function notifyProjectRequired(message = "Open a Java project folder before starting Java debugging.") {
      if (typeof deps.alert === "function") return deps.alert(message);
      return app.services?.notify?.show?.({ title: "Java Debugger", message, type: "info" });
    }

    async function openWorkspace() {
      return deps.panel?.openView?.("workspace") || deps.panel?.open?.();
    }

    async function startDebugging() {
      if (!hasOpenProject()) return notifyProjectRequired();
      if (typeof deps.startDebugging === "function") return deps.startDebugging();
      await openWorkspace();
      return deps.session.start?.();
    }
    async function getPromptValue(title, value = "") {
      if (deps.prompt) return deps.prompt({ title, message: title, value, defaultValue: value, inputLabel: title });
      return null;
    }

    function getNotificationModal() {
      return app.services?.notify || app.modules?.notificationModal || null;
    }

    function appendAttachField(body, label, control) {
      const field = document.createElement("label");
      field.className = "java-debug-attach-field";
      const title = document.createElement("span");
      title.textContent = label;
      field.append(title, control);
      body.appendChild(field);
      return control;
    }

    async function promptAttachTarget() {
      const notify = getNotificationModal();
      if (!notify?.show) {
        const host = await getPromptValue("Attach JVM Host", "localhost");
        if (host === null || !String(host || "").trim()) return null;
        const port = await getPromptValue("Attach JVM Port", "5005");
        if (port === null || !String(port || "").trim()) return null;
        return { host: String(host).trim(), port: String(port).trim() };
      }

      const draft = { host: "localhost", port: "5005" };
      const result = await notify.show({
        title: "Attach to JVM",
        message: "Connect to a Java process listening for JDWP socket debugging.",
        dialogClassName: "java-debug-attach-modal",
        dismissValue: null,
        focusSelector: "[data-java-debug-attach-host]",
        renderBody(body) {
          body.classList.add("java-debug-attach-fields");
          const hostInput = document.createElement("input");
          hostInput.type = "text";
          hostInput.value = draft.host;
          hostInput.placeholder = "localhost";
          hostInput.dataset.javaDebugAttachHost = "true";
          hostInput.addEventListener("input", () => { draft.host = hostInput.value; });
          appendAttachField(body, "Host", hostInput);

          const portInput = document.createElement("input");
          portInput.type = "number";
          portInput.min = "1";
          portInput.max = "65535";
          portInput.step = "1";
          portInput.value = draft.port;
          portInput.placeholder = "5005";
          portInput.addEventListener("input", () => { draft.port = portInput.value; });
          appendAttachField(body, "Port", portInput);
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "attach", label: "Attach", value: "attach", variant: "primary" }
        ]
      });
      if (result !== "attach") return null;
      const host = String(draft.host || "").trim();
      const port = String(draft.port || "").trim();
      if (!host || !port) return null;
      return { host, port };
    }
    async function attachToJvm() {
      if (!hasOpenProject()) return notifyProjectRequired("Open a Java project folder before attaching the Java debugger.");
      const target = await promptAttachTarget();
      if (!target) return false;
      await openWorkspace();
      return deps.session.attach?.(target.host, target.port);
    }

    async function runAction(action) {
      if (action === "workspace") { await openWorkspace(); return; }
      if (action === "start") { if (isActive(lastState.state)) return; await startDebugging(); return; }
      if (action === "attach") { if (isActive(lastState.state)) return; await attachToJvm(); return; }
      if (action === "resume") { await deps.session.resume?.(); return; }
      if (action === "pause") { await deps.session.pause?.(); return; }
      if (action === "stop") { await deps.session.stop?.(); return; }
      if (action === "restart") { await openWorkspace(); await deps.session.restart?.(); return; }
      if (action === "step-over") { if (!canStep(lastState)) return; await deps.session.stepOver?.(); return; }
      if (action === "step-into") { if (!canStep(lastState)) return; await deps.session.stepInto?.(); return; }
      if (action === "step-out") { if (!canStep(lastState)) return; await deps.session.stepOut?.(); return; }
      if (action === "run-to-cursor") { if (!canRunToCursor(lastState)) return; await deps.runToCursor?.(); return; }
      if (action === "drop-frame") { if (!canDropSelectedFrame(lastState)) return; await deps.session.dropToFrame?.(); return; }
      if (action === "toggle-line-breakpoint") { await deps.toggleBreakpoint?.(); return; }
      if (action === "toggle-breakpoints") { await deps.session.setBreakpointsEnabled?.(!hasEnabledBreakpoint(lastState)); return; }
      if (action === "mute-breakpoints") { await deps.session.setBreakpointsMuted?.(!lastState.breakpointsMuted); }
    }

    function handleClick(event) {
      const button = event.target.closest?.("[data-debug-header-action]");
      if (!button || button.disabled) return;
      event.preventDefault();
      void runAction(button.dataset.debugHeaderAction).catch(notifyError);
    }

    host.addEventListener("click", handleClick);
    deps.session.subscribe?.((snapshot) => {
      lastState = snapshot || lastState;
      render(lastState);
    });
    render(lastState);

    const api = { render };
    app.registerModule?.("javaDebugGlobalToolbar", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugGlobalToolbar = registerMarkdownViewerJavaDebugGlobalToolbar;
})(typeof window !== "undefined" ? window : globalThis, document);
