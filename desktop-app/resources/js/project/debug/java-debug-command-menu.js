// Top-level Debug menu commands for Java debugger workflows.
(function(global) {
  "use strict";

  /**
   * Register the top-level Debug menu.
   * @param {object} app Application module registry.
   * @param {object} deps Debugger, editor, and application-menu dependencies.
   * @returns {object} Debug command menu API.
   */
  function registerMarkdownViewerJavaDebugCommandMenu(app, deps = {}) {
    function createFallbackCategory() {
      const wrapper = document.createElement("div");
      wrapper.className = "dropdown-submenu action-menu-submenu application-menu-category application-menu-debug";
      wrapper.dataset.applicationMenuCategory = "debug";
      wrapper.innerHTML = '<button class="dropdown-item action-menu-item dropdown-toggle application-menu-category-toggle" type="button" aria-haspopup="true" aria-expanded="false"><i class="bi bi-bug-fill me-2"></i><span>Debug</span></button><div class="dropdown-menu action-submenu application-menu-category-content" aria-label="Debug commands"></div>';
      const run = document.querySelector(".application-menu-run");
      (run?.parentElement || document.querySelector(".header-action-menu .action-menu"))?.insertBefore(wrapper, run?.nextSibling || null);
      const toggle = wrapper.querySelector(".application-menu-category-toggle");
      toggle.addEventListener("click", (event) => {
        if (deps.applicationMenu?.getLayout?.() !== "full") return;
        event.preventDefault();
        event.stopPropagation();
        wrapper.classList.toggle("open");
        toggle.setAttribute("aria-expanded", wrapper.classList.contains("open") ? "true" : "false");
      });
      return { wrapper, toggle, content: wrapper.querySelector(".application-menu-category-content") };
    }

    const category = deps.applicationMenu?.getCategory?.("debug") || createFallbackCategory();
    const content = category?.content;
    const DEBUG_VIEW_COMMANDS = {
      "show-threads": "threads",
      "show-stack": "stack",
      "show-variables": "variables",
      "show-watches": "watches",
      "show-expressions": "expressions",
      "show-breakpoints": "breakpoints",
      "show-console": "console"
    };

    function shortcutLabel(commandId, fallback = "") {
      const shortcuts = app.modules?.keyboardShortcuts;
      const binding = shortcuts?.getEffectiveBinding?.(commandId);
      const formatted = shortcuts?.formatBinding?.(binding);
      return formatted && formatted !== "Unassigned" ? formatted : fallback;
    }

    function updateShortcutLabels() {
      content?.querySelectorAll?.("[data-debug-menu-shortcut]").forEach((label) => {
        const fallback = label.dataset.debugMenuShortcutFallback || label.textContent || "";
        label.textContent = shortcutLabel(label.dataset.debugMenuShortcut, fallback);
      });
    }
    if (content && !content.querySelector("[data-debug-menu-command]")) {
      content.innerHTML =
        '<div class="dropdown-header debug-menu-section-label">Launch</div>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="debug-dialog"><i class="bi bi-bug me-2"></i>Debug...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="attach"><i class="bi bi-plug me-2"></i>Attach to JVM...</button>' +
        '<hr class="dropdown-divider debug-saved-divider" hidden>' +
        '<div class="debug-saved-configurations" role="group" aria-label="Saved Java debug configurations"></div>' +
        '<hr class="dropdown-divider">' +
        '<div class="dropdown-submenu action-menu-submenu debug-session-stepping-submenu"><button class="dropdown-item action-menu-item dropdown-toggle" type="button" aria-haspopup="true"><i class="bi bi-signpost-split me-2"></i>Session / Stepping</button><div class="dropdown-menu action-submenu" aria-label="Session and stepping commands">' +
        '<div class="dropdown-header debug-menu-section-label">Session</div>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="resume"><i class="bi java-debug-icon java-debug-icon-continue me-2"></i><span>Continue / Resume</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-start-continue" data-debug-menu-shortcut-fallback="F5">F5</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="pause"><i class="bi bi-pause-fill me-2"></i><span>Pause</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-pause" data-debug-menu-shortcut-fallback="F6">F6</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="restart"><i class="bi bi-arrow-clockwise me-2"></i>Restart Debug Session</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="stop"><i class="bi bi-stop-fill me-2"></i><span>Stop Debugging</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-stop" data-debug-menu-shortcut-fallback="Shift+F5">Shift+F5</span></button>' +
        '<hr class="dropdown-divider">' +
        '<div class="dropdown-header debug-menu-section-label">Stepping</div>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="step-over"><i class="bi java-debug-icon java-debug-icon-step-over me-2"></i><span>Step Over</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-step-over" data-debug-menu-shortcut-fallback="F10">F10</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="step-into"><i class="bi java-debug-icon java-debug-icon-step-into me-2"></i><span>Step Into</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-step-into" data-debug-menu-shortcut-fallback="F11">F11</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="step-out"><i class="bi java-debug-icon java-debug-icon-step-out me-2"></i><span>Step Out</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-step-out" data-debug-menu-shortcut-fallback="Shift+F11">Shift+F11</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="run-to-cursor"><i class="bi bi-cursor me-2"></i><span>Run to Cursor</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-run-to-cursor" data-debug-menu-shortcut-fallback="Ctrl+F10">Ctrl+F10</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="drop-frame"><i class="bi bi-arrow-counterclockwise me-2"></i><span>Drop to Frame</span></button>' +
        '</div></div>' +
        '<hr class="dropdown-divider">' +
        '<div class="dropdown-header debug-menu-section-label">Breakpoints</div>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="toggle-breakpoint"><i class="bi bi-record-circle me-2"></i><span>Toggle Line Breakpoint</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-toggle-breakpoint" data-debug-menu-shortcut-fallback="F9">F9</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="breakpoint-properties"><i class="bi bi-sliders me-2"></i>Breakpoint Properties at Current Line...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="conditional-breakpoint"><i class="bi bi-filter me-2"></i>Conditional Breakpoint at Current Line...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="hit-count-breakpoint"><i class="bi bi-123 me-2"></i>Hit Count Breakpoint at Current Line...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="logpoint"><i class="bi bi-chat-left-text me-2"></i>Logpoint at Current Line...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="add-method-breakpoint"><i class="bi bi-braces me-2"></i>Add Method Breakpoint...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="exception-breakpoints"><i class="bi bi-exclamation-octagon me-2"></i>Exception Breakpoints...</button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="toggle-breakpoints-enabled"><i class="bi bi-slash-circle me-2"></i><span class="debug-breakpoints-enabled-label">Disable All Breakpoints</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="toggle-breakpoints-muted"><i class="bi bi-volume-mute me-2"></i><span class="debug-breakpoints-muted-label">Mute Breakpoints</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="clear-breakpoints"><i class="bi bi-trash me-2"></i>Delete All Breakpoints</button>' +
        '<hr class="dropdown-divider">' +
        '<div class="dropdown-header debug-menu-section-label">Evaluation</div>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="evaluate"><i class="bi bi-terminal me-2"></i><span>Evaluate Expression</span><span class="menu-shortcut-label" data-debug-menu-shortcut="debug-evaluate-expression" data-debug-menu-shortcut-fallback="Alt+F8">Alt+F8</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="add-watch"><i class="bi bi-eye me-2"></i><span class="debug-add-watch-label">Add Watch...</span></button>' +
        '<button class="dropdown-item action-menu-item" type="button" data-debug-menu-command="refresh-watches"><i class="bi bi-arrow-clockwise me-2"></i><span>Refresh Watches</span></button>';
    }

    function closeMenu() {
      category?.wrapper?.classList.remove("open");
      category?.toggle?.setAttribute("aria-expanded", "false");
      deps.closeActionMenus?.();
    }

    function runAndClose(action) {
      closeMenu();
      void Promise.resolve().then(action).catch((error) => deps.alert?.(error?.message || "The Debug command could not be completed."));
    }

    function getDebugState() {
      return deps.session?.getState?.() || { state: "not-running" };
    }

    function isStopped(state) {
      return state === "paused" || state === "stopped-at-breakpoint";
    }

    function isActive(state) {
      return !["not-running", "terminated", "failed"].includes(String(state || "not-running"));
    }

    function hasSelectedFrame(snapshot) {
      return Boolean(snapshot?.selectedFrameId);
    }

    function canDropFrame(snapshot) {
      const selectedFrameId = snapshot?.selectedFrameId;
      for (const thread of snapshot?.threads || []) {
        if ((thread.frames || []).some((frame) => frame.id === selectedFrameId && frame.canDrop === true)) return true;
      }
      return false;
    }

    function hasAnyBreakpoint(snapshot) {
      return (snapshot?.breakpoints || []).length > 0
        || (snapshot?.methodBreakpoints || []).length > 0
        || Boolean(snapshot?.exceptionBreakpoint && snapshot.exceptionBreakpoint.enabled !== false);
    }


    function hasEnabledBreakpoint(snapshot) {
      return (snapshot?.breakpoints || []).some((breakpoint) => breakpoint.enabled !== false)
        || (snapshot?.methodBreakpoints || []).some((breakpoint) => breakpoint.enabled !== false)
        || Boolean(snapshot?.exceptionBreakpoint && snapshot.exceptionBreakpoint.enabled !== false);
    }

    function hasEnabledWatch(snapshot) {
      return (snapshot?.watches || []).some((watch) => watch.enabled !== false);
    }

    function formatDebugState(value) {
      const labels = {
        "not-running": "Not Running",
        launching: "Launching",
        running: "Running",
        paused: "Paused",
        "stopped-at-breakpoint": "Stopped at Breakpoint",
        stepping: "Stepping",
        evaluating: "Evaluating Expression",
        terminated: "Terminated",
        failed: "Failed"
      };
      return labels[String(value || "not-running")] || String(value || "Not Running");
    }

    function stoppedReasonLabel(reason, fallback) {
      const labels = { breakpoint: "Stopped at Breakpoint", "method-breakpoint": "Stopped at Method Breakpoint", exception: "Stopped at Exception", "run-to-cursor": "Run to Cursor Complete", step: "Step Complete", pause: "Paused" };
      return labels[String(reason || "")] || fallback;
    }

    function debugStateLabel(snapshot) {
      const state = String(snapshot?.state || "not-running");
      const baseLabel = formatDebugState(state);
      const label = isStopped(state) ? stoppedReasonLabel(snapshot?.stoppedReason, baseLabel) : baseLabel;
      return snapshot?.breakpointsMuted ? `${label} - Breakpoints Muted` : label;
    }

    function findSelectedFrame(snapshot) {
      const selectedFrameId = snapshot?.selectedFrameId;
      for (const thread of snapshot?.threads || []) {
        for (const frame of thread.frames || []) if (frame.id === selectedFrameId) return frame;
      }
      return null;
    }

    function findSelectedThread(snapshot) {
      const selectedFrameId = snapshot?.selectedFrameId;
      return (snapshot?.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === selectedFrameId)) || null;
    }

    function formatThreadDetail(thread) {
      if (!thread) return "";
      const name = thread.name || thread.id || "Thread";
      const status = thread.suspended ? `${thread.status || "unknown"}, suspended` : (thread.status || "unknown");
      return `${name}${thread.id ? ` #${thread.id}` : ""} (${status})`;
    }

    function formatFrameTitle(frame) {
      if (!frame) return "No selected stack frame";
      return `${frame.className || "<unknown>"}.${frame.method || "<unknown>"}`;
    }

    function formatFrameSource(frame) {
      if (!frame) return "Unknown Source";
      return `${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""}`;
    }

    function countLineBreakpoints(snapshot) {
      return (snapshot?.breakpoints || []).length;
    }

    function debugStatusDetail(snapshot, projectSnapshot, activeConfiguration) {
      if (snapshot?.lastError) return snapshot.lastError;
      const state = String(snapshot?.state || "not-running");
      const selectedFrame = findSelectedFrame(snapshot);
      if (selectedFrame) {
        const threadDetail = formatThreadDetail(findSelectedThread(snapshot));
        const frameDetail = `${formatFrameTitle(selectedFrame)} - ${formatFrameSource(selectedFrame)}`;
        return threadDetail ? `${threadDetail} - ${frameDetail}` : frameDetail;
      }
      if (!projectSnapshot?.projectPath) return "Open a Java project to start debugging.";
      if (state === "terminated") return `Terminated - ${countLineBreakpoints(snapshot)} line breakpoint${countLineBreakpoints(snapshot) === 1 ? "" : "s"}`;
      if (state === "failed") return "Debugger failed. Check the Debug Console for details.";
      if (activeConfiguration?.type === "java-application") return `Ready: ${activeConfiguration.name}`;
      return "Select a Java Application configuration to start debugging.";
    }

    function renderDebugStatus(snapshot, projectSnapshot, activeConfiguration) {
      const status = content?.querySelector(".debug-menu-status");
      if (!status) return;
      const state = String(snapshot?.state || "not-running");
      const label = status.querySelector(".debug-menu-status-label");
      const detail = status.querySelector(".debug-menu-status-detail");
      status.dataset.debugState = state;
      if (label) label.textContent = `Debugger: ${debugStateLabel(snapshot)}`;
      if (detail) detail.textContent = debugStatusDetail(snapshot, projectSnapshot, activeConfiguration);
      status.title = `${label?.textContent || "Java Debugger"} - ${detail?.textContent || ""}`.trim();
    }

    function getJavaConfigurations() {
      return (deps.store?.getSnapshot?.().configurations || []).filter((configuration) => configuration.type === "java-application");
    }

    async function debugConfiguration(configuration) {
      if (!configuration) {
        deps.alert?.("Create or select a Java Application run configuration first.");
        return false;
      }
      if (configuration.type !== "java-application") {
        deps.alert?.("Java debugging is available for Java Application run configurations.");
        return false;
      }
      if (typeof deps.startDebugging === "function") return deps.startDebugging(configuration);
      await deps.panel?.open?.();
      return deps.session?.start?.(configuration);
    }

    async function debugActiveConfiguration() {
      const activeConfiguration = deps.store?.getActive?.();
      if (activeConfiguration?.type === "java-application") return debugConfiguration(activeConfiguration);
      if (typeof deps.startDebugging === "function") return deps.startDebugging();
      return debugConfiguration(activeConfiguration);
    }

    function openDebugConfigurationDialog() {
      return deps.dialog?.open?.({
        mode: "manage",
        initialType: "java-application",
        dialogKicker: "Debug",
        dialogTitle: "Debug Configurations",
        executeLabel: "Debug",
        executeIcon: "bi-bug-fill",
        onExecute: debugConfiguration
      });
    }

    async function openView(viewId) {
      if (deps.panel?.openView) return deps.panel.openView(viewId);
      return deps.panel?.open?.();
    }

    async function toggleView(viewId) {
      if (deps.panel?.isLayoutTabVisible?.(viewId) === true && deps.panel?.hideLayoutTab) return deps.panel.hideLayoutTab(viewId);
      return openView(viewId);
    }
    async function getPromptValue(title, value = "") {
      if (deps.prompt) return deps.prompt({ title, message: title, value, defaultValue: value, inputLabel: title });
      return null;
    }

    async function confirmClearBreakpoints() {
      if (!hasAnyBreakpoint(getDebugState())) return false;
      const notify = getNotificationModal();
      if (!notify?.show) return false;
      const result = await notify.show({
        title: "Delete All Breakpoints",
        message: "Delete all Java line, method, and exception breakpoints? Running debug sessions will be updated immediately.",
        dialogClassName: "java-debug-clear-breakpoints-modal",
        dismissValue: "cancel",
        buttons: [
          { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel", autoFocus: true },
          { id: "delete", label: "Delete All", value: "delete", variant: "danger" }
        ]
      });
      return result === "delete";
    }

    async function clearBreakpointsWithConfirmation() {
      if (!await confirmClearBreakpoints()) return false;
      await deps.session?.clearBreakpoints?.();
      return openView("breakpoints");
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
      const target = await promptAttachTarget();
      if (!target) return false;
      await openView("workspace");
      return deps.session?.attach?.(target.host, target.port);
    }

    async function evaluateSelectionOrFocus() {
      const selection = deps.getSelectionText?.() || "";
      await openView("expressions");
      if (selection) return deps.session?.evaluate?.(selection);
      return deps.panel?.focusExpressionInput?.();
    }

    async function addWatchExpression() {
      const selection = String(deps.getSelectionText?.() || "").trim();
      if (deps.panel?.addWatchExpression) return deps.panel.addWatchExpression(selection);
      const value = selection || await getPromptValue("Add Watch Expression", "");
      if (value === null || !String(value || "").trim()) return false;
      await deps.session?.addWatch?.(String(value).trim());
      return openView("watches");
    }

    async function configureActiveLineBreakpoint() {
      await openView("breakpoints");
      return deps.panel?.configureActiveLineBreakpoint?.();
    }

    async function addMethodBreakpoint() {
      await openView("breakpoints");
      return deps.panel?.addMethodBreakpoint?.();
    }

    async function configureExceptionBreakpoints() {
      await openView("breakpoints");
      return deps.panel?.editExceptionBreakpointProperties?.();
    }

    function getCommandButtons(command) {
      const selector = `[data-debug-menu-command="${command}"]`;
      const buttons = [];
      if (content) buttons.push(...Array.from(content.querySelectorAll(selector)));
      buttons.push(...Array.from(global.document?.querySelectorAll(`.show-hide-tabs-menu-submenu ${selector}`) || []));
      return Array.from(new Set(buttons));
    }

    function updateButton(command, disabled, title = "") {
      const buttons = getCommandButtons(command);
      buttons.forEach((button) => {
        const unavailable = disabled === true;
        button.disabled = unavailable;
        button.setAttribute("aria-disabled", unavailable ? "true" : "false");
        if (title) button.title = title;
        else button.removeAttribute("title");
      });
      return buttons[0] || null;
    }

    function updateDebugViewCommandChecks() {
      for (const [command, viewId] of Object.entries(DEBUG_VIEW_COMMANDS)) {
        const buttons = getCommandButtons(command);
        const visible = deps.panel?.isLayoutTabVisible?.(viewId) === true;
        const selected = visible;
        const label = `${visible ? "Hide" : "Show"} ${debugViewTitleForCommand(command)}`;
        buttons.forEach((button) => {
          button.classList.toggle("active", selected);
          button.setAttribute("role", "menuitemcheckbox");
          button.setAttribute("aria-checked", selected ? "true" : "false");
          button.title = label;
          const labelElement = button.querySelector(".debug-view-toggle-label");
          if (labelElement) labelElement.textContent = label;
          const icon = button.querySelector("i");
          if (icon) icon.className = `bi ${selected ? "bi-check2" : debugViewIconForCommand(command)} me-2`;
        });
      }
    }

    function debugViewTitleForCommand(command) {
      const titles = { "show-threads": "Threads", "show-stack": "Call Stack", "show-variables": "Variables", "show-watches": "Watches", "show-expressions": "Expressions", "show-breakpoints": "Breakpoints", "show-console": "Debug Console" };
      return titles[command] || "Debug View";
    }

    function debugViewIconForCommand(command) {
      const icons = { "show-threads": "bi-list-nested", "show-stack": "bi-layers", "show-variables": "bi-diagram-3", "show-watches": "bi-eye", "show-expressions": "bi-terminal", "show-breakpoints": "bi-record-circle", "show-console": "bi-terminal" };
      return icons[command] || "bi-window-sidebar";
    }

    function render() {
      if (!content) return;
      const snapshot = deps.store?.getSnapshot?.() || {};
      const activeConfiguration = deps.store?.getActive?.();
      const debugSnapshot = getDebugState();
      const state = String(debugSnapshot.state || "not-running");
      const stopped = isStopped(state);
      const canStep = stopped && hasSelectedFrame(debugSnapshot);
      const active = isActive(state);
      const running = ["running", "launching", "stepping", "evaluating"].includes(state);
      const hasBreakpoints = hasAnyBreakpoint(debugSnapshot);
      const hasEnabledBreakpoints = hasEnabledBreakpoint(debugSnapshot);
      const selectedText = deps.getSelectionText?.() || "";
      const javaEditor = deps.isJavaSourcePath?.(deps.getActiveEditorPath?.()) === true;
      const breakpointLineAvailable = javaEditor && (typeof deps.isActiveEditorBreakpointLineAvailable !== "function" || deps.isActiveEditorBreakpointLineAvailable() === true);
      const breakpointLineTooltip = !javaEditor ? "Open a Java source file before toggling breakpoints." : breakpointLineAvailable ? "Toggle a breakpoint on the active Java editor line." : "Choose an executable Java statement line before toggling breakpoints.";
      renderDebugStatus(debugSnapshot, snapshot, activeConfiguration);
      updateShortcutLabels();

      updateButton("debug-dialog", !snapshot.projectPath, !snapshot.projectPath ? "Open a project folder before creating a debug launch." : active ? "Create or launch another Java debug session." : "Create or launch a Java debug configuration.");
      updateButton("attach", !snapshot.projectPath, !snapshot.projectPath ? "Open a project folder before attaching the debugger." : active ? "Attach another JVM listening for JDWP socket debugging." : "Attach to a JVM listening for JDWP socket debugging.");
      const canDebugActiveConfiguration = activeConfiguration?.type === "java-application";
      const canDebugCurrentJavaFile = Boolean(snapshot.projectPath && javaEditor && !canDebugActiveConfiguration && deps.canDebugActiveJavaFile?.());
      const canDebugPrimaryTarget = canDebugActiveConfiguration || canDebugCurrentJavaFile;
      const debugActiveButton = updateButton("debug-active", !canDebugPrimaryTarget, active ? "Launch another Java debug session for this target." : canDebugActiveConfiguration ? "Debug the active Java Application configuration." : canDebugCurrentJavaFile ? "Debug the main class declared by the active Java source file." : !snapshot.projectPath ? "Open a project folder before debugging." : "Open a Java source file with a main method or choose a Java Application configuration.");
      const debugActiveLabel = debugActiveButton?.querySelector(".debug-active-label");
      if (debugActiveLabel) debugActiveLabel.textContent = canDebugActiveConfiguration ? `Debug '${activeConfiguration.name}'` : canDebugCurrentJavaFile ? "Debug Current Java File" : "Debug Active Configuration";
      updateButton("configurations", !snapshot.projectPath, snapshot.projectPath ? "Open Java debug configurations." : "Open a project folder before editing debug configurations.");
      updateButton("workspace", !deps.panel, deps.panel ? "Open the Debug Workspace." : "The Debug Workspace is not available yet.");
      updateButton("view-debug-layout", !deps.panel, deps.panel ? "View the Debug layout." : "The Debug layout is not available yet.");
      updateButton("reset-layout", !deps.panel?.resetLayout, deps.panel?.resetLayout ? "Reset the Debug Workspace layout." : "Open the Debug Workspace before resetting its layout.");
      updateButton("resume", !stopped, stopped ? "Continue the suspended Java debug session." : "Pause at a Java stack frame before resuming.");
      updateButton("pause", !running, running ? "Suspend the running Java debug session." : "Start a Java debug session before pausing.");
      updateButton("restart", !debugSnapshot.restartable, debugSnapshot.restartable ? "Restart the current Java debug session." : "Start a Java debug session before restarting.");
      updateButton("stop", !active, active ? "Terminate the current Java debug session." : "No Java debug session is running.");
      updateButton("step-over", !canStep, canStep ? "Step over the next Java source line." : "Pause at a Java stack frame before stepping.");
      updateButton("step-into", !canStep, canStep ? "Step into the next Java call." : "Pause at a Java stack frame before stepping.");
      updateButton("step-out", !canStep, canStep ? "Step out of the selected Java stack frame." : "Pause at a Java stack frame before stepping.");
      updateButton("run-to-cursor", !canStep || !javaEditor, !javaEditor ? "Open a Java source file before using Run to Cursor." : canStep ? "Run Java execution to the active editor line." : "Pause at a Java stack frame before using Run to Cursor.");
      updateButton("drop-frame", !stopped || !hasSelectedFrame(debugSnapshot) || !canDropFrame(debugSnapshot), canDropFrame(debugSnapshot) ? "Drop execution back to the selected stack frame." : "Select a suspended stack frame that supports Drop to Frame.");
      updateButton("toggle-breakpoint", !breakpointLineAvailable, breakpointLineTooltip);
      updateButton("breakpoint-properties", !breakpointLineAvailable || !deps.panel?.configureActiveLineBreakpoint, breakpointLineAvailable ? "Edit condition, hit count, and logpoint settings for the current line." : "Choose an executable Java statement line before editing breakpoint properties.");
      updateButton("conditional-breakpoint", !breakpointLineAvailable || !deps.panel?.configureActiveLineBreakpointField, breakpointLineAvailable ? "Create or edit a conditional breakpoint on the active Java editor line." : "Choose an executable Java statement line before creating conditional breakpoints.");
      updateButton("hit-count-breakpoint", !breakpointLineAvailable || !deps.panel?.configureActiveLineBreakpointField, breakpointLineAvailable ? "Create or edit a hit-count breakpoint on the active Java editor line." : "Choose an executable Java statement line before creating hit-count breakpoints.");
      updateButton("logpoint", !breakpointLineAvailable || !deps.panel?.configureActiveLineBreakpointField, breakpointLineAvailable ? "Create or edit a logpoint on the active Java editor line." : "Choose an executable Java statement line before creating logpoints.");
      updateButton("add-method-breakpoint", !snapshot.projectPath || !deps.panel?.addMethodBreakpoint, snapshot.projectPath ? "Add a Java method breakpoint by class and method." : "Open a project folder before adding method breakpoints.");
      updateButton("exception-breakpoints", !snapshot.projectPath || !deps.panel?.editExceptionBreakpointProperties, snapshot.projectPath ? "Configure Java exception breakpoints." : "Open a project folder before configuring exception breakpoints.");
      updateButton("evaluate", !stopped || !hasSelectedFrame(debugSnapshot), stopped && hasSelectedFrame(debugSnapshot) ? "Evaluate a Java expression in the selected stack frame." : "Pause at a Java stack frame before evaluating expressions.");
      updateButton("add-watch", !snapshot.projectPath, snapshot.projectPath ? "Add a Java watch expression." : "Open a project folder before adding watches.");
      updateButton("refresh-watches", !stopped || !hasSelectedFrame(debugSnapshot) || !hasEnabledWatch(debugSnapshot), hasEnabledWatch(debugSnapshot) ? "Refresh enabled watches in the selected stack frame." : "Add an enabled watch expression before refreshing watches.");
      const addWatchLabel = content.querySelector(".debug-add-watch-label");
      if (addWatchLabel) addWatchLabel.textContent = selectedText ? "Add Selection to Watches" : "Add Watch...";
      updateButton("toggle-breakpoints-enabled", !hasBreakpoints, hasBreakpoints ? "Enable or disable all Java breakpoints." : "Add a breakpoint before changing breakpoint enablement.");
      updateButton("toggle-breakpoints-muted", !hasBreakpoints, hasBreakpoints ? "Mute or unmute Java breakpoints." : "Add a breakpoint before muting breakpoints.");
      updateButton("clear-breakpoints", !hasBreakpoints, hasBreakpoints ? "Delete all Java breakpoints." : "No Java breakpoints are defined.");

      const breakpointLabel = content.querySelector(".debug-breakpoints-enabled-label");
      if (breakpointLabel) breakpointLabel.textContent = hasEnabledBreakpoints ? "Disable All Breakpoints" : "Enable All Breakpoints";
      const mutedLabel = content.querySelector(".debug-breakpoints-muted-label");
      if (mutedLabel) mutedLabel.textContent = debugSnapshot.breakpointsMuted ? "Unmute Breakpoints" : "Mute Breakpoints";
      updateDebugViewCommandChecks();
      const savedHost = content.querySelector(".debug-saved-configurations");
      const savedDivider = content.querySelector(".debug-saved-divider");
      if (!savedHost) return;
      savedHost.innerHTML = "";
      const javaConfigurations = getJavaConfigurations();
      javaConfigurations.forEach((configuration) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "dropdown-item action-menu-item";
        button.disabled = false;
        button.innerHTML = '<i class="bi bi-bug-fill me-2"></i><span></span>';
        button.querySelector("span").textContent = `Debug ${configuration.name}`;
        button.addEventListener("click", () => runAndClose(() => debugConfiguration(configuration)));
        savedHost.appendChild(button);
      });
      if (savedDivider) savedDivider.hidden = javaConfigurations.length === 0;
    }

    const commandHandlers = {
      "debug-dialog": openDebugConfigurationDialog,
      "debug-active": debugActiveConfiguration,
      attach: attachToJvm,
      configurations: openDebugConfigurationDialog,
      workspace: () => openView("workspace"),
      resume: () => deps.session?.resume?.(),
      pause: () => deps.session?.pause?.(),
      restart: () => deps.session?.restart?.(),
      stop: () => deps.session?.stop?.(),
      "step-over": () => deps.session?.stepOver?.(),
      "step-into": () => deps.session?.stepInto?.(),
      "step-out": () => deps.session?.stepOut?.(),
      "run-to-cursor": () => deps.runToCursor?.(),
      "drop-frame": () => deps.session?.dropToFrame?.(),
      "toggle-breakpoint": () => deps.toggleBreakpoint?.(),
      "breakpoint-properties": configureActiveLineBreakpoint,
      "conditional-breakpoint": () => deps.panel?.configureActiveLineBreakpointField?.("condition"),
      "hit-count-breakpoint": () => deps.panel?.configureActiveLineBreakpointField?.("hitCount"),
      "logpoint": () => deps.panel?.configureActiveLineBreakpointField?.("logMessage"),
      "add-method-breakpoint": addMethodBreakpoint,
      "exception-breakpoints": configureExceptionBreakpoints,
      evaluate: evaluateSelectionOrFocus,
      "add-watch": addWatchExpression,
      "refresh-watches": async () => { await deps.session?.refreshWatches?.(); return openView("watches"); },
      "toggle-breakpoints-enabled": () => deps.session?.setBreakpointsEnabled?.(!hasEnabledBreakpoint(getDebugState())),
      "toggle-breakpoints-muted": () => deps.session?.setBreakpointsMuted?.(!getDebugState().breakpointsMuted),
      "clear-breakpoints": clearBreakpointsWithConfirmation,
      "show-threads": () => toggleView("threads"),
      "show-stack": () => toggleView("stack"),
      "show-variables": () => toggleView("variables"),
      "show-watches": () => toggleView("watches"),
      "show-expressions": () => toggleView("expressions"),
      "show-breakpoints": () => toggleView("breakpoints"),
      "show-console": () => toggleView("console"),
      "view-debug-layout": () => openView("workspace"),
      "reset-layout": async () => { deps.panel?.resetLayout?.(); return openView("workspace"); }
    };

    function bindDebugCommandButtons(root) {
      root?.querySelectorAll?.("[data-debug-menu-command]").forEach((button) => {
        if (button.dataset.debugMenuBound === "true") return;
        button.dataset.debugMenuBound = "true";
        button.addEventListener("click", () => {
          const command = button.dataset.debugMenuCommand;
          const handler = commandHandlers[command];
          if (handler) runAndClose(handler);
        });
      });
    }

    bindDebugCommandButtons(content);
    bindDebugCommandButtons(global.document?.querySelector(".show-hide-tabs-menu-submenu"));

    deps.store?.subscribe?.(render);
    deps.session?.subscribe?.(render);
    const viewCategory = deps.applicationMenu?.getCategory?.("view");
    category?.toggle?.addEventListener("mouseenter", render);
    category?.toggle?.addEventListener("focus", render);
    category?.toggle?.addEventListener("click", render);
    viewCategory?.toggle?.addEventListener("mouseenter", render);
    viewCategory?.toggle?.addEventListener("focus", render);
    viewCategory?.toggle?.addEventListener("click", render);
    render();

    const api = { render };
    app.registerModule?.("javaDebugCommandMenu", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugCommandMenu = registerMarkdownViewerJavaDebugCommandMenu;
})(typeof window !== "undefined" ? window : globalThis);
