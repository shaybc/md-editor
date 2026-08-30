// Compact debugger toolbar and inspector panel for Java debug sessions.
(function(global) {
  "use strict";

  function registerMarkdownViewerJavaDebugPanel(app, deps = {}) {
    const views = new Map();
    const perspectiveViews = new Map();
    let perspectiveOpen = false;
    let activeLeftView = "threads";
    let activeRightView = "variables";
    const dockableDebugTabViews = new Map();
    const debugDockApis = new Map();
    const debugDockContentHosts = new Map();
    const debugDockEmptyStates = new Map();
    const detachedPanelTabs = new Map();
    let debugDockTabsInitialized = false;
    let subscribed = false;
    let lastState = deps.session.getState();
    let consoleSearchQuery = "";
    let breakpointSearchQuery = "";
    let consoleAutoScroll = true;
    let expressionHistoryIndex = -1;
    let inspectedValue = null;
    let contextMenu = null;
    let contextMenuReturnFocus = null;
    let debugLaunchWorkspaceOpened = false;
    let lastAutoOpenedDebugStopKey = "";
    const DEBUG_WORKSPACE_COLLAPSED_PANES_KEY = "md-editor.javaDebug.collapsedWorkspacePanes";
    const DEBUG_WORKSPACE_MAXIMIZED_PANE_KEY = "md-editor.javaDebug.maximizedWorkspacePane";
    const DEBUG_WORKSPACE_SPLIT_KEY = "md-editor.javaDebug.workspaceSplit";
    const DEBUG_WORKSPACE_LAYOUT_KEY = "md-editor.javaDebug.workspaceLayout";
    const DEBUG_CONSOLE_FILTERS_KEY = "md-editor.javaDebug.consoleFilters";
    const DEFAULT_WORKSPACE_SPLIT = { columns: [0.95, 1.1, 1.25], rows: [1, 0.85, 0.9] };
    const DEBUG_WORKSPACE_LAYOUT_PRESETS = [
      { id: "eclipse", label: "Eclipse", title: "Balanced Debug perspective", columns: [0.95, 1.1, 1.25], rows: [1, 0.85, 0.9] },
      { id: "intellij", label: "IntelliJ", title: "Inspector-focused Debug tool window", columns: [0.78, 1.02, 1.65], rows: [1.08, 0.72, 1.08] },
      { id: "custom", label: "Custom", title: "Current manually adjusted layout" }
    ];
    const DEBUG_WORKSPACE_LAYOUT_IDS = new Set(DEBUG_WORKSPACE_LAYOUT_PRESETS.map((preset) => preset.id));
    const DEBUG_CONSOLE_FILTERS = [
      { id: "stdout", label: "stdout" },
      { id: "stdin", label: "stdin" },
      { id: "stderr", label: "stderr" },
      { id: "logpoint", label: "logpoints" },
      { id: "debugger", label: "debugger" },
      { id: "error", label: "errors" }
    ];
    const DEBUG_VIEW_SWITCHER_ITEMS = [
      { view: "workspace", label: "Workspace", icon: "bi-window-sidebar" },
      { view: "threads", label: "Threads", icon: "bi-list-nested" },
      { view: "stack", label: "Call Stack", icon: "bi-layers" },
      { view: "variables", label: "Variables", icon: "bi-diagram-3" },
      { view: "watches", label: "Watches", icon: "bi-eye" },
      { view: "expressions", label: "Expressions", icon: "bi-terminal" },
      { view: "breakpoints", label: "Breakpoints", icon: "bi-record-circle" },
      { view: "console", label: "Console", icon: "bi-terminal" }
    ];
    const DEBUG_WORKSPACE_PANE_IDS = new Set(["threads", "stack", "variables", "watches", "expressions", "breakpoints", "console"]);
    const DEBUG_ROW_NAVIGATION_SELECTOR = [
      ".java-debug-thread-card[data-thread-row-id]",
      ".java-debug-thread-frame[data-frame-id]",
      ".java-debug-frame-main[data-frame-id]",
      ".java-debug-value[data-value-id]",
      ".java-debug-watch[data-watch-row-id]",
      ".java-debug-breakpoint[data-breakpoint-file][data-breakpoint-line]",
      ".java-debug-method-breakpoint[data-method-breakpoint-row-id]",
      ".java-debug-exception-breakpoint[data-exception-breakpoint-row]"
    ].join(", ");
    const DEBUG_ROW_NAVIGATION_SCOPE_SELECTOR = ".java-debug-thread-stack, .java-debug-values, .java-debug-watch-list, .java-debug-thread-list, .java-debug-workbench-section, .java-debug-panel";
    const collapsedThreadIds = new Set();
    let collapsedPaneIds = loadCollapsedPaneIds();
    let maximizedPaneId = loadMaximizedPaneId();
    let workspaceSplit = loadWorkspaceSplit();
    let workspaceLayout = loadWorkspaceLayout();
    let consoleFilters = loadConsoleFilters();
    let activeDebugView = "workspace";
    let valueActionItems = new Map();
    let valueActionCounter = 0;
    const sourceContext = deps.sourceContext || global.MarkdownViewerJavaDebugSourceContext || {};
    const viewDefinitions = [];
    const leftPerspectiveViews = [
      { view: "threads", title: "Threads", icon: "bi-list-nested", defaultDock: "left" },
      { view: "stack", title: "Call Stack", icon: "bi-layers", defaultDock: "left" }
    ];
    const rightPerspectiveViews = [
      { view: "variables", title: "Variables", icon: "bi-diagram-3", defaultDock: "right" },
      { view: "breakpoints", title: "Breakpoints", icon: "bi-record-circle", defaultDock: "right" },
      { view: "watches", title: "Watches", icon: "bi-eye", defaultDock: "right" },
      { view: "expressions", title: "Expressions", icon: "bi-terminal", defaultDock: "right" }
    ];
    const aiCompanionPerspectiveViews = deps.aiCompanionDockElement ? [
      { view: "ai-companion", title: "AI Companion", icon: "bi-stars", defaultDock: "right", external: true }
    ] : [];
    const bottomPerspectiveViews = [
      { view: "console", title: "Debug Console", icon: "bi-terminal", defaultDock: "bottom" }
    ];
    const coreDebugPerspectiveViews = [...leftPerspectiveViews, ...rightPerspectiveViews, ...bottomPerspectiveViews];
    const dockableDebugViews = [...leftPerspectiveViews, ...rightPerspectiveViews, ...aiCompanionPerspectiveViews, ...bottomPerspectiveViews];
    const dockableDebugViewIds = new Set(dockableDebugViews.map((item) => item.view));
    const DEBUG_DOCK_IDS = new Set(["left", "right", "bottom"]);
    const PANEL_TAB_DRAG_GROUP = "markdown-panel-tabs";
    const PANEL_LAYOUT_TAB_PREFIX = "panel:";
    const DEFAULT_DEBUG_DOCK_ASSIGNMENTS = dockableDebugViews.reduce((assignments, item) => {
      assignments[item.view] = item.defaultDock;
      return assignments;
    }, {});
    const DEBUG_LAYOUT_FILE_NAME = "java-debug-layouts.json";
    const DEBUG_LAYOUT_DOCUMENT_TYPE = "md-editor-java-debug-layouts";
    const DEBUG_LAYOUT_IDS = new Set(["developer", "debug"]);
    let debugLayoutProjectPath = "";
    let debugLayoutDocument = createDebugLayoutDocument();
    let debugLayoutWriteQueue = Promise.resolve();
    let debugLayoutLoadGeneration = 0;
    let restoringDebugLayout = false;
    let projectLayoutRestorePending = false;
    let bottomPanelLayoutSubscribed = false;
    let debugDockAssignments = loadDebugDockAssignments();
    let suppressAiCompanionActivationSync = false;

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }

    function createButton(action, icon, title, disabled = false) {
      return `<button type="button" class="java-debug-button" data-debug-action="${action}" title="${escapeHtml(title)}" aria-label="${escapeHtml(title)}"${disabled ? " disabled" : ""}><i class="bi ${icon}" aria-hidden="true"></i></button>`;
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


    function isRunning(state) { return ["running", "launching", "stepping", "evaluating"].includes(state); }
    function isStopped(state) { return ["paused", "stopped-at-breakpoint"].includes(state); }
    function isActive(state) { return !["not-running", "terminated", "failed"].includes(String(state || "not-running")); }
    function canEvaluateExpressions(state = lastState) { return isStopped(state?.state) && Boolean(state?.selectedFrameId); }
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
    function debugStateLabel(state) {
      const baseLabel = formatDebugState(state?.state);
      const label = isStopped(state?.state) ? stoppedReasonLabel(state?.stoppedReason, baseLabel, state) : baseLabel;
      return state?.breakpointsMuted ? `${label} - Breakpoints muted` : label;
    }
    function getValueExpression(item) { return item?.expression || item?.name || ""; }

    function registerValueAction(item) {
      const id = `value-${++valueActionCounter}`;
      valueActionItems.set(id, item || {});
      return id;
    }

    function findValueAction(id) {
      return valueActionItems.get(id) || null;
    }

    function findValueByObjectId(values, objectId) {
      const targetId = String(objectId || "");
      if (!targetId) return null;
      for (const value of values || []) {
        if (String(value?.objectId || "") === targetId) return value;
        const child = findValueByObjectId(value?.children, targetId);
        if (child) return child;
      }
      return null;
    }

    function findInspectedValue() {
      const objectId = inspectedValue?.objectId;
      if (!objectId) return inspectedValue;
      const variable = findValueByObjectId(lastState.variables, objectId);
      if (variable) return variable;
      for (const watch of lastState.watches || []) {
        const watchValue = findValueByObjectId([watch.result], objectId);
        if (watchValue) return watchValue;
      }
      return inspectedValue;
    }
    function findThread(threadId) {
      return (lastState.threads || []).find((thread) => String(thread.id || "") === String(threadId || "")) || null;
    }

    function formatThreadRuntimeState(thread) {
      const status = String(thread?.status || "unknown");
      return thread?.suspended ? `${status}, suspended` : status;
    }

    function formatThreadStack(thread) {
      if (!thread) return "";
      const header = `Thread "${thread.name || thread.id || "unknown"}" ${formatThreadRuntimeState(thread)}`.trim();
      const frames = (thread.frames || []).map((frame) => `    at ${frame.className || "<unknown>"}.${frame.method || "<unknown>"}(${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""})`);
      return [header, ...frames].join("\n");
    }

    function formatAllThreadStacks(threads = lastState.threads) {
      return (threads || []).map(formatThreadStack).filter(Boolean).join("\n\n");
    }

    function isThreadCollapsed(thread) {
      return collapsedThreadIds.has(String(thread?.id || ""));
    }

    function toggleThread(threadId) {
      const id = String(threadId || "");
      if (!id) return false;
      if (collapsedThreadIds.has(id)) collapsedThreadIds.delete(id);
      else collapsedThreadIds.add(id);
      render(lastState);
      return true;
    }

    function setThreadCollapsed(threadId, collapsed) {
      const id = String(threadId || "");
      if (!id) return false;
      if (collapsed) collapsedThreadIds.add(id);
      else collapsedThreadIds.delete(id);
      render(lastState);
      return true;
    }

    function setAllThreadsCollapsed(collapsed) {
      collapsedThreadIds.clear();
      if (collapsed) (lastState.threads || []).forEach((thread) => {
        const id = String(thread?.id || "");
        if (id) collapsedThreadIds.add(id);
      });
      render(lastState);
      return true;
    }

    function loadCollapsedPaneIds() {
      try {
        const values = JSON.parse(window.localStorage?.getItem?.(DEBUG_WORKSPACE_COLLAPSED_PANES_KEY) || "[]");
        return new Set(Array.isArray(values) ? values.map((value) => String(value || "")).filter(Boolean) : []);
      } catch (_error) {
        return new Set();
      }
    }

    function saveCollapsedPaneIds() {
      try { window.localStorage?.setItem?.(DEBUG_WORKSPACE_COLLAPSED_PANES_KEY, JSON.stringify(Array.from(collapsedPaneIds))); } catch (_error) {}
    }

    function loadMaximizedPaneId() {
      try {
        const saved = String(window.localStorage?.getItem?.(DEBUG_WORKSPACE_MAXIMIZED_PANE_KEY) || "");
        return DEBUG_WORKSPACE_PANE_IDS.has(saved) ? saved : "";
      } catch (_error) { return ""; }
    }

    function saveMaximizedPaneId() {
      try {
        if (maximizedPaneId) window.localStorage?.setItem?.(DEBUG_WORKSPACE_MAXIMIZED_PANE_KEY, maximizedPaneId);
        else window.localStorage?.removeItem?.(DEBUG_WORKSPACE_MAXIMIZED_PANE_KEY);
      } catch (_error) {}
    }

    function normalizeWorkspaceLayoutId(value) {
      const id = String(value || "eclipse");
      return DEBUG_WORKSPACE_LAYOUT_IDS.has(id) ? id : "eclipse";
    }

    function loadWorkspaceLayout() {
      try { return normalizeWorkspaceLayoutId(window.localStorage?.getItem?.(DEBUG_WORKSPACE_LAYOUT_KEY)); }
      catch (_error) { return "eclipse"; }
    }

    function saveWorkspaceLayout() {
      try { window.localStorage?.setItem?.(DEBUG_WORKSPACE_LAYOUT_KEY, normalizeWorkspaceLayoutId(workspaceLayout)); } catch (_error) {}
    }

    function markWorkspaceLayoutCustom() {
      if (workspaceLayout === "custom") return;
      workspaceLayout = "custom";
      saveWorkspaceLayout();
    }

    function defaultConsoleFilters() {
      return DEBUG_CONSOLE_FILTERS.reduce((filters, filter) => ({ ...filters, [filter.id]: filter.id !== "debugger" }), {});
    }

    function loadConsoleFilters() {
      try {
        const saved = JSON.parse(window.localStorage?.getItem?.(DEBUG_CONSOLE_FILTERS_KEY) || "{}");
        const defaults = defaultConsoleFilters();
        return DEBUG_CONSOLE_FILTERS.reduce((filters, filter) => ({ ...filters, [filter.id]: Object.prototype.hasOwnProperty.call(saved, filter.id) ? saved[filter.id] !== false : defaults[filter.id] !== false }), {});
      } catch (_error) {
        return defaultConsoleFilters();
      }
    }

    function saveConsoleFilters() {
      try { window.localStorage?.setItem?.(DEBUG_CONSOLE_FILTERS_KEY, JSON.stringify(consoleFilters)); } catch (_error) {}
    }

    function normalizeConsoleEntryKind(kind) {
      const value = String(kind || "stdout");
      return DEBUG_CONSOLE_FILTERS.some((filter) => filter.id === value) ? value : "stdout";
    }

    function isConsoleKindVisible(kind) {
      return consoleFilters[normalizeConsoleEntryKind(kind)] !== false;
    }

    function toggleConsoleFilter(filterId) {
      const id = String(filterId || "");
      if (id === "all") {
        consoleFilters = defaultConsoleFilters();
      } else if (DEBUG_CONSOLE_FILTERS.some((filter) => filter.id === id)) {
        const next = { ...consoleFilters, [id]: consoleFilters[id] === false };
        if (!DEBUG_CONSOLE_FILTERS.some((filter) => next[filter.id] !== false)) next[id] = true;
        consoleFilters = next;
      } else {
        return false;
      }
      saveConsoleFilters();
      render(lastState);
      return true;
    }

    function isPaneCollapsed(paneId) {
      return paneId ? collapsedPaneIds.has(String(paneId)) : false;
    }

    function toggleWorkspacePane(paneId) {
      const id = String(paneId || "");
      if (!id) return false;
      if (maximizedPaneId === id) {
        maximizedPaneId = "";
        saveMaximizedPaneId();
      }
      if (collapsedPaneIds.has(id)) collapsedPaneIds.delete(id);
      else collapsedPaneIds.add(id);
      markWorkspaceLayoutCustom();
      saveCollapsedPaneIds();
      render(lastState);
      return true;
    }

    function toggleMaximizedWorkspacePane(paneId) {
      const id = String(paneId || "");
      if (!id || !DEBUG_WORKSPACE_PANE_IDS.has(id)) return false;
      maximizedPaneId = maximizedPaneId === id ? "" : id;
      if (maximizedPaneId) collapsedPaneIds.delete(maximizedPaneId);
      markWorkspaceLayoutCustom();
      saveMaximizedPaneId();
      saveCollapsedPaneIds();
      render(lastState);
      return true;
    }

    function normalizeWorkspaceSplit(values, fallback) {
      const source = Array.isArray(values) && values.length === fallback.length ? values : fallback;
      return source.map((value, index) => Math.max(0.35, Number.isFinite(Number(value)) ? Number(value) : fallback[index]));
    }

    function loadWorkspaceSplit() {
      try {
        const parsed = JSON.parse(window.localStorage?.getItem?.(DEBUG_WORKSPACE_SPLIT_KEY) || "{}");
        return {
          columns: normalizeWorkspaceSplit(parsed.columns, DEFAULT_WORKSPACE_SPLIT.columns),
          rows: normalizeWorkspaceSplit(parsed.rows, DEFAULT_WORKSPACE_SPLIT.rows)
        };
      } catch (_error) {
        return { columns: [...DEFAULT_WORKSPACE_SPLIT.columns], rows: [...DEFAULT_WORKSPACE_SPLIT.rows] };
      }
    }

    function saveWorkspaceSplit() {
      try { window.localStorage?.setItem?.(DEBUG_WORKSPACE_SPLIT_KEY, JSON.stringify(workspaceSplit)); } catch (_error) {}
    }

    function workspaceSplitPercent(values, index) {
      const total = values.reduce((sum, value) => sum + Math.max(0.01, Number(value) || 0), 0) || 1;
      return `${values.slice(0, index + 1).reduce((sum, value) => sum + Math.max(0.01, Number(value) || 0), 0) / total * 100}%`;
    }

    function renderWorkspaceSplitStyle() {
      const columns = normalizeWorkspaceSplit(workspaceSplit.columns, DEFAULT_WORKSPACE_SPLIT.columns);
      const rows = normalizeWorkspaceSplit(workspaceSplit.rows, DEFAULT_WORKSPACE_SPLIT.rows);
      return ` style="--java-debug-workspace-col-1:${columns[0]}fr;--java-debug-workspace-col-2:${columns[1]}fr;--java-debug-workspace-col-3:${columns[2]}fr;--java-debug-workspace-row-1:${rows[0]}fr;--java-debug-workspace-row-2:${rows[1]}fr;--java-debug-workspace-row-3:${rows[2]}fr;--java-debug-workspace-col-split-1:${workspaceSplitPercent(columns, 0)};--java-debug-workspace-col-split-2:${workspaceSplitPercent(columns, 1)};--java-debug-workspace-row-split-1:${workspaceSplitPercent(rows, 0)};--java-debug-workspace-row-split-2:${workspaceSplitPercent(rows, 1)};"`;
    }

    function renderWorkspaceSplitters() {
      return '<div class="java-debug-workspace-splitter java-debug-workspace-splitter-column java-debug-workspace-splitter-column-1" data-debug-workspace-splitter="column-1" role="separator" aria-orientation="vertical" tabindex="0" title="Resize Threads and Call Stack"></div>' +
        '<div class="java-debug-workspace-splitter java-debug-workspace-splitter-column java-debug-workspace-splitter-column-2" data-debug-workspace-splitter="column-2" role="separator" aria-orientation="vertical" tabindex="0" title="Resize Call Stack and Variables"></div>' +
        '<div class="java-debug-workspace-splitter java-debug-workspace-splitter-row java-debug-workspace-splitter-row-1" data-debug-workspace-splitter="row-1" role="separator" aria-orientation="horizontal" tabindex="0" title="Resize upper debugger panes"></div>' +
        '<div class="java-debug-workspace-splitter java-debug-workspace-splitter-row java-debug-workspace-splitter-row-2" data-debug-workspace-splitter="row-2" role="separator" aria-orientation="horizontal" tabindex="0" title="Resize Debug Console"></div>';
    }

    function applyDebugWorkspaceLayoutPreset(layoutId) {
      const preset = DEBUG_WORKSPACE_LAYOUT_PRESETS.find((item) => item.id === normalizeWorkspaceLayoutId(layoutId));
      if (!preset) return false;
      workspaceLayout = preset.id;
      if (preset.columns && preset.rows) {
        workspaceSplit = { columns: [...preset.columns], rows: [...preset.rows] };
        collapsedPaneIds = new Set();
        maximizedPaneId = "";
        saveWorkspaceSplit();
        saveCollapsedPaneIds();
        saveMaximizedPaneId();
      }
      saveWorkspaceLayout();
      render(lastState);
      return true;
    }

    function resetDebugWorkspaceLayout() {
      let resetApplied = false;
      const defaultPanelSizes = normalizeDebugPanelSizes(deps.getDefaultPanelSizes?.() || {});
      const wasRestoringDebugLayout = restoringDebugLayout;
      restoringDebugLayout = true;
      try {
        resetApplied = applyDebugWorkspaceLayoutPreset("eclipse");
        returnSideDockPanelTabsToBottom();
        debugLayoutDocument.layouts.debug = createDefaultDebugPerspectiveLayout("debug", { includeAiCompanion: false, sizes: defaultPanelSizes });
      } finally {
        restoringDebugLayout = wasRestoringDebugLayout;
      }
      if (perspectiveOpen) {
        restoreDebugPerspectiveLayout("debug");
        deps.applyPanelSizes?.(defaultPanelSizes);
        global.requestAnimationFrame?.(() => deps.applyPanelSizes?.(defaultPanelSizes));
      } else {
        queueSaveDebugLayoutDocument();
      }
      renderDockableDebugTabs(lastState);
      return resetApplied;
    }

    function findFrame(frameId, threads = lastState.threads) {
      for (const thread of threads || []) for (const frame of thread.frames || []) if (frame.id === frameId) return frame;
      return null;
    }

    function canDropFrame(frame, state = lastState) {
      return isStopped(state.state) && frame?.canDrop === true;
    }

    function canDropSelectedFrame(state) {
      return canDropFrame(findFrame(state.selectedFrameId, state.threads), state);
    }

    function selectedDropFrameTitle(state) {
      const frame = findFrame(state.selectedFrameId, state.threads);
      if (canDropSelectedFrame(state)) return `Drop to Frame: ${frame.className || "<unknown>"}.${frame.method || "<unknown>"}`;
      if (!isStopped(state.state)) return "Pause at a Java stack frame before using Drop to Frame";
      if (!frame) return "Select a suspended stack frame before using Drop to Frame";
      return "The selected JVM stack frame does not support Drop to Frame";
    }

    function formatFrame(frame) {
      if (!frame) return "";
      return `at ${frame.className || "<unknown>"}.${frame.method || "<unknown>"}(${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""})`;
    }

    function formatStackForFrame(frameId) {
      const thread = findThreadForFrame(lastState, frameId);
      return formatThreadStack(thread) || formatFrame(findFrame(frameId));
    }

    async function startDebugging() {
      if (typeof deps.startDebugging === "function") return deps.startDebugging();
      return deps.session.start();
    }

    function hasOpenProject() {
      return Boolean(deps.store?.getSnapshot?.().projectPath);
    }

    function hasAnyBreakpointState(state) {
      return (state?.breakpoints || []).length > 0
        || (state?.methodBreakpoints || []).length > 0
        || Boolean(state?.exceptionBreakpoint && state.exceptionBreakpoint.enabled !== false);
    }

    function hasEnabledBreakpointState(state) {
      return (state?.breakpoints || []).some((breakpoint) => breakpoint.enabled !== false)
        || (state?.methodBreakpoints || []).some((breakpoint) => breakpoint.enabled !== false)
        || Boolean(state?.exceptionBreakpoint && state.exceptionBreakpoint.enabled !== false);
    }

    function renderToolbar(state) {
      const stopped = isStopped(state.state);
      const running = isRunning(state.state);
      const canStep = canEvaluateExpressions(state);
      const hasBreakpoints = hasAnyBreakpointState(state);
      const hasEnabledBreakpoints = hasEnabledBreakpointState(state);
      const enableBreakpointsTitle = hasEnabledBreakpoints ? "Disable All Breakpoints" : "Enable All Breakpoints";
      const muteBreakpointsTitle = state.breakpointsMuted ? "Unmute Breakpoints" : "Mute Breakpoints";
      const canRunToCursorFromEditor = canStep && isJavaSourcePath(deps.getActiveEditorPath?.());
      const canToggleActiveLine = isJavaSourcePath(deps.getActiveEditorPath?.());
      const canLaunchDebug = hasOpenProject() && !isActive(state.state);
      return `<div class="java-debug-toolbar" role="toolbar" aria-label="Java debugger controls">
        ${createButton("start", "bi-bug-fill", titleWithShortcut("Start Debugging", "debug-start-continue", "F5"), !canLaunchDebug)}
        ${createButton("attach", "bi-plug", "Attach to JVM", !canLaunchDebug)}
        ${createButton("resume", "java-debug-icon java-debug-icon-continue", titleWithShortcut("Continue / Resume", "debug-start-continue", "F5"), !stopped)}
        ${createButton("pause", "bi-pause-fill", titleWithShortcut("Pause / Suspend", "debug-pause", "F6"), !running)}
        ${createButton("stop", "bi-stop-fill", titleWithShortcut("Stop / Terminate", "debug-stop", "Shift+F5"), !isActive(state.state))}
        ${createButton("restart", "bi-arrow-clockwise", "Restart Debug Session", !state.restartable)}
        ${createButton("step-over", "java-debug-icon java-debug-icon-step-over", titleWithShortcut("Step Over", "debug-step-over", "F10"), !canStep)}
        ${createButton("step-into", "java-debug-icon java-debug-icon-step-into", titleWithShortcut("Step Into", "debug-step-into", "F11"), !canStep)}
        ${createButton("step-out", "java-debug-icon java-debug-icon-step-out", titleWithShortcut("Step Out / Step Return", "debug-step-out", "Shift+F11"), !canStep)}
        ${createButton("run-to-cursor", "bi-cursor", titleWithShortcut("Run to Cursor", "debug-run-to-cursor", "Ctrl+F10"), !canRunToCursorFromEditor)}
        ${createButton("drop-frame", "bi-arrow-counterclockwise", selectedDropFrameTitle(state), !canDropSelectedFrame(state))}
        <span class="java-debug-toolbar-separator" aria-hidden="true"></span>
        ${createButton("toggle-line-breakpoint", "bi-record-circle", titleWithShortcut("Toggle Line Breakpoint", "debug-toggle-breakpoint", "F9"), !canToggleActiveLine)}
        ${createButton("disable-breakpoints", hasEnabledBreakpoints ? "bi-slash-circle" : "bi-record-circle", enableBreakpointsTitle, !hasBreakpoints)}
        ${createButton("mute-breakpoints", state.breakpointsMuted ? "bi-volume-up" : "bi-volume-mute", muteBreakpointsTitle, !hasBreakpoints)}
        <span class="java-debug-toolbar-separator" aria-hidden="true"></span>
        ${createButton("view-threads", "bi-list-nested", "Show Threads")}
        ${createButton("view-stack", "bi-layers", "Show Call Stack")}
        ${createButton("view-variables", "bi-diagram-3", "Show Variables")}
        ${createButton("view-watches", "bi-eye", "Show Watches")}
        ${createButton("view-expressions", "bi-terminal", "Show Expressions")}
        ${createButton("view-breakpoints", "bi-record-circle", "Show Breakpoints")}
        ${createButton("view-console", "bi-terminal", "Show Debug Console")}
        ${createButton("reset-layout", "bi-layout-three-columns", "Reset Debug Layout")}
        <span class="java-debug-state java-debug-state-${escapeHtml(state.state)}" title="${escapeHtml(state.lastError || debugStateLabel(state))}">${escapeHtml(debugStateLabel(state))}</span>
      </div>`;
    }

    function renderWorkspaceLayoutPicker(activeView) {
      if (String(activeView || "workspace") !== "workspace") return "";
      const options = DEBUG_WORKSPACE_LAYOUT_PRESETS.map((preset) => `<option value="${escapeHtml(preset.id)}"${preset.id === workspaceLayout ? " selected" : ""}>${escapeHtml(preset.label)}</option>`).join("");
      const activePreset = DEBUG_WORKSPACE_LAYOUT_PRESETS.find((preset) => preset.id === workspaceLayout) || DEBUG_WORKSPACE_LAYOUT_PRESETS[0];
      return `<label class="java-debug-layout-picker" title="${escapeHtml(activePreset.title || "Debug workspace layout")}"><span>Layout</span><select data-debug-workspace-layout aria-label="Debug workspace layout preset">${options}</select></label>`;
    }

    function renderViewSwitcher(activeView) {
      const active = String(activeView || "workspace");
      const buttons = DEBUG_VIEW_SWITCHER_ITEMS.map((item) => `<button type="button" class="java-debug-view-button${item.view === active ? " active" : ""}" data-debug-view="${escapeHtml(item.view)}" aria-pressed="${item.view === active ? "true" : "false"}" title="Show ${escapeHtml(item.label)}"><i class="bi ${escapeHtml(item.icon)}" aria-hidden="true"></i><span>${escapeHtml(item.label)}</span></button>`).join("");
      return `<div class="java-debug-view-switcher" role="tablist" aria-label="Debugger views">${buttons}${renderWorkspaceLayoutPicker(active)}</div>`;
    }

    function findSelectedThread(state) {
      const selectedFrameId = state.selectedFrameId;
      if (selectedFrameId) {
        const thread = (state.threads || []).find((item) => (item.frames || []).some((frame) => frame.id === selectedFrameId));
        if (thread) return thread;
      }
      return (state.threads || [])[0] || null;
    }

    function formatFrameSource(frame) {
      if (!frame) return "Unknown Source";
      return `${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""}`;
    }

    function formatFrameTitle(frame) {
      if (!frame) return "No selected frame";
      return `${frame.className || "<unknown>"}.${frame.method || "<unknown>"}`;
    }

    function formatThreadStatusSummary(threads) {
      const statusCounts = new Map();
      for (const thread of threads || []) {
        const status = formatThreadRuntimeState(thread).toLowerCase();
        statusCounts.set(status, (statusCounts.get(status) || 0) + 1);
      }
      return Array.from(statusCounts, ([status, count]) => `${count} ${status}`).join(", ") || "No thread status";
    }

    function renderDebugSummary(items) {
      return `<div class="java-debug-summary">${items.filter(Boolean).map((item) => `<div class="java-debug-summary-item${item.primary ? " primary" : ""}"><span>${escapeHtml(item.label)}</span><strong>${escapeHtml(item.value)}</strong></div>`).join("")}</div>`;
    }

    function renderDebugSessionSwitcher(state) {
      const sessions = Array.isArray(state?.debugSessions) ? state.debugSessions : [];
      if (sessions.length <= 1) return "";
      const activeId = String(state?.activeSessionId || "");
      const options = sessions.map((session) => {
        const name = session.label || `Debug Session ${session.index || ""}`.trim();
        const label = `${name} - ${formatDebugState(session.state)}`;
        return `<option value="${escapeHtml(session.id)}"${session.id === activeId ? " selected" : ""}>${escapeHtml(label)}</option>`;
      }).join("");
      return `<label class="java-debug-session-picker" title="Switch active Java debug session"><span>Session</span><select data-debug-session-select aria-label="Active Java debug session">${options}</select></label>`;
    }
    function renderWorkspaceSessionOverview(state) {
      const selectedThread = findSelectedThread(state);
      const selectedFrame = findFrame(state.selectedFrameId, state.threads) || selectedThread?.frames?.[0] || null;
      const activeConfiguration = deps.store?.getActive?.();
      const target = activeConfiguration?.type === "java-application" ? activeConfiguration.name : "No Java debug target";
      const threadCount = (state.threads || []).length;
      const frameSource = selectedFrame ? formatFrameSource(selectedFrame) : "No selected source";
      const frameTitle = selectedFrame ? formatFrameTitle(selectedFrame) : "No selected frame";
      const breakpointCount = countBreakpoints(state);
      const muted = state.breakpointsMuted ? " muted" : "";
      return `<section class="java-debug-session-overview" aria-label="Debug session overview"><div class="java-debug-session-overview-state java-debug-session-overview-state-${escapeHtml(state.state || "not-running")}"><i class="bi bi-bug-fill" aria-hidden="true"></i><div><span>${escapeHtml(debugStateLabel(state))}</span><small>${escapeHtml(threadCount ? `${threadCount} thread${threadCount === 1 ? "" : "s"}` : "No suspended threads")}</small></div></div>${renderDebugSessionSwitcher(state)}<div class="java-debug-session-overview-item"><span>Target</span><strong>${escapeHtml(target)}</strong></div><div class="java-debug-session-overview-item primary"><span>Frame</span><strong>${escapeHtml(frameTitle)}</strong></div><div class="java-debug-session-overview-item"><span>Source</span><strong>${escapeHtml(frameSource)}</strong></div><div class="java-debug-session-overview-item"><span>Breakpoints</span><strong>${escapeHtml(`${breakpointCount}${muted}`)}</strong></div></section>`;
    }
    function renderThreadSummary(state, threads, selectedThread) {
      const selectedFrame = findFrame(state.selectedFrameId, threads) || selectedThread?.frames?.[0] || null;
      const frameCount = (threads || []).reduce((total, thread) => total + (thread.frames || []).length, 0);
      return renderDebugSummary([
        { label: "Threads", value: threads.length },
        { label: "Frames", value: frameCount },
        { label: "Status", value: formatThreadStatusSummary(threads) },
        selectedThread ? { label: "Selected", value: selectedThread.name || selectedThread.id || "Thread", primary: true } : null,
        selectedFrame ? { label: "Top Frame", value: `${formatFrameTitle(selectedFrame)} (${formatFrameSource(selectedFrame)})` } : null
      ]);
    }

    function renderCallStackSummary(state, thread) {
      const selectedFrame = findFrame(state.selectedFrameId, [thread]) || thread?.frames?.[0] || null;
      return renderDebugSummary([
        { label: "Thread", value: `${thread.name || thread.id || "Thread"}${thread.id ? ` #${thread.id}` : ""}`, primary: true },
        { label: "Status", value: formatThreadRuntimeState(thread) },
        { label: "Frames", value: (thread.frames || []).length },
        selectedFrame ? { label: "Selected Frame", value: formatFrameTitle(selectedFrame) } : null,
        selectedFrame ? { label: "Source", value: formatFrameSource(selectedFrame) } : null
      ]);
    }

    function renderCallStackThreadPicker(state, selectedThread) {
      const threads = state.threads || [];
      if (threads.length < 2) return "";
      const selectedId = String(selectedThread?.id || "");
      const options = threads.map((thread, index) => {
        const threadId = String(thread.id || "");
        const frameCount = (thread.frames || []).length;
        const label = `${thread.name || thread.id || `Thread ${index + 1}`} - ${formatThreadRuntimeState(thread)} - ${frameCount} frame${frameCount === 1 ? "" : "s"}`;
        return `<option value="${escapeHtml(threadId)}"${threadId === selectedId ? " selected" : ""}${threadId ? "" : " disabled"}>${escapeHtml(label)}</option>`;
      }).join("");
      return `<label class="java-debug-call-stack-thread-picker"><span>Thread</span><select data-call-stack-thread-select title="Switch Call Stack Thread">${options}</select></label>`;
    }
    function renderThreadStackEmptyState(state, title = "No suspended threads.") {
      const stateId = String(state?.state || "not-running");
      const canPause = stateId === "running" || stateId === "stepping";
      const canStart = hasOpenProject() && ["not-running", "terminated", "failed"].includes(stateId);
      const action = canPause
        ? `<button type="button" class="java-debug-empty-action" data-debug-action="pause" title="Pause Debugger"><i class="bi bi-pause-fill" aria-hidden="true"></i><span>Pause Debugger</span></button>`
        : canStart
          ? `<button type="button" class="java-debug-empty-action" data-debug-action="start" title="Start Debugging"><i class="bi bi-bug-fill" aria-hidden="true"></i><span>Start Debugging</span></button>`
          : `<span class="java-debug-empty-action disabled"><i class="bi bi-pause-fill" aria-hidden="true"></i><span>Wait for suspend</span></span>`;
      return `<div class="java-debug-empty java-debug-thread-empty"><strong>${escapeHtml(title)}</strong><span>Threads and stack frames appear when the Java process is suspended at a breakpoint, pause, or step.</span>${action}</div>`;
    }
    function renderThreads(state) {
      const threads = state.threads || [];
      if (!threads.length) return renderThreadStackEmptyState(state, "No suspended threads.");
      const selectedThread = findSelectedThread(state);
      const toolbar = `<div class="java-debug-thread-toolbar"><button type="button" class="java-debug-inline" data-copy-all-thread-stacks="true" title="Copy All Thread Stacks"><i class="bi bi-clipboard"></i></button><button type="button" class="java-debug-inline" data-expand-all-thread-stacks="true" title="Expand All Thread Stacks"><i class="bi bi-arrows-expand"></i></button><button type="button" class="java-debug-inline" data-collapse-all-thread-stacks="true" title="Collapse All Thread Stacks"><i class="bi bi-arrows-collapse"></i></button></div>`;
      return `${renderThreadSummary(state, threads, selectedThread)}${toolbar}<div class="java-debug-thread-list">${threads.map((thread) => {
        const frames = thread.frames || [];
        const topFrame = frames[0];
        const active = selectedThread && String(selectedThread.id || "") === String(thread.id || "");
        const threadId = String(thread.id || "");
        const collapsed = isThreadCollapsed(thread);
        const topFrameSummary = topFrame ? `${topFrame.className || "<unknown>"}.${topFrame.method || "<unknown>"}:${topFrame.line || ""}` : "No stack frames";
        return `<div class="java-debug-thread-entry${active ? " active" : ""}"><div class="java-debug-thread-card${active ? " active" : ""}" data-thread-select="${escapeHtml(threadId)}" data-thread-row-id="${escapeHtml(threadId)}" tabindex="0" role="button" title="Select Thread"><button type="button" class="java-debug-expander" data-thread-toggle="${escapeHtml(threadId)}" title="${collapsed ? "Expand Stack" : "Collapse Stack"}" aria-expanded="${collapsed ? "false" : "true"}"><i class="bi ${collapsed ? "bi-caret-right-fill" : "bi-caret-down-fill"}"></i></button><div class="java-debug-thread-card-main"><span>${escapeHtml(thread.name || thread.id || "Thread")}</span><small>${escapeHtml(formatThreadRuntimeState(thread))}${thread.id ? ` - #${escapeHtml(thread.id)}` : ""}</small><small>${escapeHtml(topFrameSummary)}</small></div><span class="java-debug-thread-count" title="${frames.length} stack frame${frames.length === 1 ? "" : "s"}">${frames.length}</span><button type="button" class="java-debug-inline" data-copy-thread-stack="${escapeHtml(threadId)}" title="Copy Stack"><i class="bi bi-clipboard"></i></button></div>${renderThreadStackPreview(frames, state, collapsed)}</div>`;
      }).join("")}</div>`;
    }

    function renderThreadStackPreview(frames, state, collapsed) {
      if (collapsed) return "";
      const visibleFrames = (frames || []).slice(0, 8);
      const rows = visibleFrames.map((frame) => `<button type="button" class="java-debug-thread-frame${frame.id === state.selectedFrameId ? " active" : ""}" data-frame-id="${escapeHtml(frame.id)}" title="Select Stack Frame. Double-click to Navigate to Source"><span>${escapeHtml(frame.className || "<unknown>")}.${escapeHtml(frame.method || "<unknown>")}</span><small>${escapeHtml(frame.sourceName || frame.file || "Unknown Source")}${frame.line ? `:${frame.line}` : ""}</small></button>`).join("");
      const hiddenFrameCount = (frames || []).length - visibleFrames.length;
      const overflow = hiddenFrameCount > 0 ? `<div class="java-debug-thread-stack-more">${hiddenFrameCount} more frame${hiddenFrameCount === 1 ? "" : "s"} in Call Stack</div>` : "";
      return `<div class="java-debug-thread-stack">${rows || renderThreadStackEmptyState(state, "No stack frames for this thread.")}${overflow}</div>`;
    }
    function renderCallStack(state) {
      const thread = findSelectedThread(state);
      if (!thread) return renderThreadStackEmptyState(state, "No stack frames.");
      const frames = (thread.frames || []).map((frame, index) => renderFrame(frame, state, index)).join("");
      return `<div class="java-debug-thread">${renderCallStackSummary(state, thread)}${renderCallStackThreadPicker(state, thread)}<div class="java-debug-thread-title"><span class="java-debug-thread-name">${escapeHtml(thread.name || thread.id || "Thread")} <small>${escapeHtml(formatThreadRuntimeState(thread))}${thread.id ? ` - #${escapeHtml(thread.id)}` : ""}</small></span><button type="button" class="java-debug-inline" data-copy-thread-stack="${escapeHtml(thread.id || "")}" title="Copy Stack"><i class="bi bi-clipboard"></i></button><button type="button" class="java-debug-inline" data-copy-all-thread-stacks="true" title="Copy All Thread Stacks"><i class="bi bi-layers"></i></button></div>${frames || renderThreadStackEmptyState(state, "No stack frames for this thread.")}</div>`;
    }

    function renderFrame(frame, state, fallbackIndex = 0) {
      const dropDisabled = !canDropFrame(frame, state);
      const selected = frame.id === state.selectedFrameId;
      const frameIndex = Number.isInteger(Number(frame.index)) ? Number(frame.index) : fallbackIndex;
      const source = `${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""}`;
      const dropLabel = dropDisabled ? "Drop to Frame unavailable" : "Drop to Frame available";
      return `<div class="java-debug-frame${selected ? " active" : ""}" data-frame-row-id="${escapeHtml(frame.id)}"><button type="button" class="java-debug-frame-main" data-frame-id="${escapeHtml(frame.id)}" title="Select Stack Frame. Double-click to Navigate to Source"><div class="java-debug-frame-title"><span>${escapeHtml(frame.className || "<unknown>")}.${escapeHtml(frame.method || "<unknown>")}</span><small>#${escapeHtml(frameIndex)}</small></div><div class="java-debug-frame-meta"><span title="${escapeHtml(source)}">${escapeHtml(source)}</span><span class="java-debug-frame-badge${selected ? " active" : ""}">${selected ? "selected" : "frame"}</span><span class="java-debug-frame-badge${dropDisabled ? "" : " can-drop"}">${escapeHtml(dropLabel)}</span></div></button><div class="java-debug-frame-actions"><button type="button" class="java-debug-inline" data-frame-navigate="${escapeHtml(frame.id)}" title="Navigate to Source"><i class="bi bi-box-arrow-up-right"></i></button><button type="button" class="java-debug-inline" data-frame-evaluate="${escapeHtml(frame.id)}" title="Evaluate Expression"><i class="bi bi-terminal"></i></button><button type="button" class="java-debug-inline" data-frame-drop="${escapeHtml(frame.id)}" title="${escapeHtml(dropLabel)}"${dropDisabled ? " disabled" : ""}><i class="bi bi-arrow-counterclockwise"></i></button><button type="button" class="java-debug-inline" data-frame-copy="${escapeHtml(frame.id)}" title="Copy Stack"><i class="bi bi-clipboard"></i></button></div></div>`;
    }
    function findThreadForFrame(state, frameId) {
      if (!frameId) return null;
      return (state.threads || []).find((thread) => (thread.frames || []).some((frame) => frame.id === frameId)) || null;
    }

    function renderSelectedFrameContext(state) {
      const frame = findFrame(state.selectedFrameId, state.threads) || findSelectedThread(state)?.frames?.[0] || null;
      if (!frame) return `<div class="java-debug-frame-context empty">No selected stack frame.</div>`;
      const thread = findThreadForFrame(state, frame.id) || findSelectedThread(state);
      const source = `${frame.sourceName || frame.file || "Unknown Source"}${frame.line ? `:${frame.line}` : ""}`;
      return `<div class="java-debug-frame-context"><span>${escapeHtml(frame.className || "<unknown>")}.${escapeHtml(frame.method || "<unknown>")}</span><small>${escapeHtml(thread?.name || thread?.id || "Thread")} - ${escapeHtml(formatThreadRuntimeState(thread))} - ${escapeHtml(source)}</small></div>`;
    }

    function valueKindLabel(kind) {
      const labels = { this: "this", parameter: "param", local: "local", field: "field", static: "static", element: "item", entry: "entry", result: "result", summary: "info", error: "error" };
      const key = String(kind || "value").toLowerCase();
      return labels[key] || key;
    }

    function valueKindClass(kind) {
      return String(kind || "value").toLowerCase().replace(/[^a-z0-9_-]+/g, "-");
    }

    function variableGroups(values) {
      const groups = [
        { id: "this", title: "this", kinds: new Set(["this"]), values: [] },
        { id: "parameters", title: "Parameters", kinds: new Set(["parameter"]), values: [] },
        { id: "locals", title: "Local Variables", kinds: new Set(["local"]), values: [] },
        { id: "static", title: "Static Fields", kinds: new Set(["static"]), values: [] },
        { id: "other", title: "Other Values", kinds: null, values: [] }
      ];
      const byKind = new Map(groups.filter((group) => group.kinds).flatMap((group) => [...group.kinds].map((kind) => [kind, group])));
      (values || []).forEach((item) => {
        const group = byKind.get(String(item?.kind || "").toLowerCase()) || groups[groups.length - 1];
        group.values.push(item);
      });
      return groups.filter((group) => group.values.length);
    }

    function shortDeclaringTypeName(declaringType) {
      const name = String(declaringType || "");
      return name.split(".").filter(Boolean).pop() || name;
    }

    function valueDisplayName(item) {
      const name = item?.name || "";
      const kind = String(item?.kind || "").toLowerCase();
      const declaringType = shortDeclaringTypeName(item?.declaringType);
      return declaringType && ["field", "static"].includes(kind) ? `${name} (${declaringType})` : name;
    }

    function valueDisplayTitle(item, expression) {
      const declaringType = String(item?.declaringType || "");
      const name = item?.name || expression || "";
      return declaringType ? `${name} declared in ${declaringType}` : expression;
    }

    function renderVariablesEmptyState(state) {
      const frameCount = (state?.threads || []).reduce((total, thread) => total + (thread.frames || []).length, 0);
      const action = frameCount
        ? `<button type="button" class="java-debug-empty-action" data-debug-action="view-stack" title="Show Call Stack"><i class="bi bi-layers" aria-hidden="true"></i><span>Show Call Stack</span></button>`
        : `<span class="java-debug-empty-action disabled"><i class="bi bi-pause-fill" aria-hidden="true"></i><span>Pause at a frame</span></span>`;
      return `<div class="java-debug-empty java-debug-variable-empty"><strong>No variables for the selected frame.</strong><span>Variables appear after execution is paused at a Java stack frame.</span>${action}</div>`;
    }
    function renderGroupedVariables(values) {
      const groups = variableGroups(values);
      if (!groups.length) return renderVariablesEmptyState(lastState);
      return `<div class="java-debug-variable-groups">${groups.map((group) => `<section class="java-debug-variable-group java-debug-variable-group-${escapeHtml(group.id)}"><h5>${escapeHtml(group.title)}</h5>${renderVariables(group.values, 0)}</section>`).join("")}</div>`;
    }
    function formatVariableTree(values, depth = 0) {
      return (values || []).flatMap((item) => {
        const expression = getValueExpression(item);
        const prefix = "  ".repeat(depth);
        const label = `${prefix}${item?.name || expression || "<value>"} : ${item?.type || ""} = ${item?.value ?? ""}`.trimEnd();
        return [label, ...formatVariableTree(item?.children, depth + 1)];
      });
    }

    function renderVariablesPane(state) {
      const canRefresh = canEvaluateExpressions(state);
      const hasVariables = (state.variables || []).length > 0;
      const refreshTitle = canRefresh ? "Refresh Variables" : "Pause at a Java stack frame to refresh variables";
      const copyTitle = hasVariables ? "Copy Variables" : "No variables to copy";
      const toolbar = `<div class="java-debug-variable-toolbar"><button type="button" class="java-debug-inline" data-debug-action="refresh-variables" title="${escapeHtml(refreshTitle)}"${canRefresh ? "" : " disabled"}><i class="bi bi-arrow-clockwise"></i></button><button type="button" class="java-debug-inline" data-debug-action="copy-variables" title="${escapeHtml(copyTitle)}"${hasVariables ? "" : " disabled"}><i class="bi bi-copy"></i></button></div>`;
      return `${renderSelectedFrameContext(state)}${toolbar}${renderGroupedVariables(state.variables)}`;
    }
    function renderVariables(values, depth = 0) {
      if (!values?.length && depth === 0) return renderVariablesEmptyState(lastState);
      const canUseSelectedFrame = canEvaluateExpressions();
      const canAddWatch = hasOpenProject();
      const frameActionDisabled = canUseSelectedFrame ? "" : " disabled";
      const watchActionDisabled = canAddWatch ? "" : " disabled";
      const setValueTitle = canUseSelectedFrame ? "Set Value" : "Pause at a Java stack frame to set values";
      const watchTitle = canAddWatch ? "Add to Watches" : "Open a Java project to add watches";
      return `<div class="java-debug-values">${(values || []).map((item) => {
        const valueId = registerValueAction(item);
        const expression = getValueExpression(item);
        const kind = valueKindLabel(item.kind);
        const kindClass = valueKindClass(item.kind);
        const expansionState = item.expandable ? ` aria-expanded="${item.expanded ? "true" : "false"}"` : "";
        const displayName = valueDisplayName(item);
        const displayTitle = valueDisplayTitle(item, expression);
        return `<div class="java-debug-value" data-value-id="${escapeHtml(valueId)}" tabindex="0" role="treeitem"${expansionState} style="--depth:${depth}"><button type="button" class="java-debug-expander" data-object-id="${escapeHtml(item.objectId || "")}"${item.expandable ? "" : " disabled"}><i class="bi ${item.expanded ? "bi-caret-down-fill" : "bi-caret-right-fill"}"></i></button><span class="java-debug-value-kind java-debug-value-kind-${escapeHtml(kindClass)}">${escapeHtml(kind)}</span><span class="java-debug-value-text" data-expression="${escapeHtml(expression)}" title="${escapeHtml(displayTitle)}">${escapeHtml(displayName)} : ${escapeHtml(item.type)} = ${escapeHtml(item.value)}</span><button type="button" class="java-debug-inline" data-set-value-id="${escapeHtml(valueId)}" title="${escapeHtml(setValueTitle)}"${frameActionDisabled}><i class="bi bi-pencil"></i></button><button type="button" class="java-debug-inline" data-copy-value-id="${escapeHtml(valueId)}" title="Copy Value"><i class="bi bi-copy"></i></button><button type="button" class="java-debug-inline" data-copy-name-id="${escapeHtml(valueId)}" title="Copy Name"><i class="bi bi-fonts"></i></button><button type="button" class="java-debug-inline" data-copy-expression-id="${escapeHtml(valueId)}" title="Copy Expression"><i class="bi bi-braces"></i></button><button type="button" class="java-debug-inline" data-add-watch-value-id="${escapeHtml(valueId)}" title="${escapeHtml(watchTitle)}"${watchActionDisabled}><i class="bi bi-eye"></i></button><button type="button" class="java-debug-inline" data-inspect-value-id="${escapeHtml(valueId)}" title="Inspect"><i class="bi bi-search"></i></button></div>${item.expanded && item.children ? renderVariables(item.children, depth + 1) : ""}`;
      }).join("")}</div>`;
    }
    function renderValueInspector() {
      if (!inspectedValue) return "";
      const currentValue = findInspectedValue();
      const valueId = registerValueAction(currentValue);
      const expression = getValueExpression(currentValue);
      const canAddWatch = hasOpenProject();
      const watchTitle = canAddWatch ? "Add to Watches" : "Open a Java project to add watches";
      const canExpand = currentValue?.expandable && currentValue?.objectId;
      const children = currentValue?.expanded && currentValue?.children?.length ? `<div class="java-debug-inspector-members">${renderVariables(currentValue.children, 1)}</div>` : "";
      return `<section class="java-debug-inspector"><div class="java-debug-inspector-toolbar"><h4>Value Inspector</h4><button type="button" class="java-debug-inline" data-inspect-expand-object="${escapeHtml(currentValue?.objectId || "")}" title="Expand Members"${canExpand ? "" : " disabled"}><i class="bi ${currentValue?.expanded ? "bi-caret-down-fill" : "bi-caret-right-fill"}"></i></button><button type="button" class="java-debug-inline" data-copy-value-id="${escapeHtml(valueId)}" title="Copy Value"><i class="bi bi-copy"></i></button><button type="button" class="java-debug-inline" data-copy-name-id="${escapeHtml(valueId)}" title="Copy Name"><i class="bi bi-fonts"></i></button><button type="button" class="java-debug-inline" data-copy-expression-id="${escapeHtml(valueId)}" title="Copy Expression"><i class="bi bi-braces"></i></button><button type="button" class="java-debug-inline" data-add-watch-value-id="${escapeHtml(valueId)}" title="${escapeHtml(watchTitle)}"${canAddWatch ? "" : " disabled"}><i class="bi bi-eye"></i></button><button type="button" class="java-debug-inline" data-close-inspector="true" title="Close Inspector"><i class="bi bi-x"></i></button></div><div class="java-debug-inspector-meta"><span>${escapeHtml(currentValue?.name || expression)}</span><small>${escapeHtml(currentValue?.type || "")}${expression ? ` - ${escapeHtml(expression)}` : ""}</small></div><pre>${escapeHtml(currentValue?.value ?? "")}</pre>${children}</section>`;
    }
    function renderExceptionBreakpoint(state) {
      const exceptionBreakpoint = state.exceptionBreakpoint || { enabled: false, caught: true, uncaught: true };
      const enabled = exceptionBreakpoint.enabled !== false;
      return `<div class="java-debug-exception-breakpoint${enabled ? "" : " disabled"}" data-exception-breakpoint-row="true" tabindex="0" role="button" title="Double-click to edit exception breakpoint. Right-click for actions."><button type="button" class="java-debug-inline" data-exception-breakpoint-toggle="true" data-exception-breakpoint-enabled="${enabled}" title="${enabled ? "Disable Exception Breakpoint" : "Enable Exception Breakpoint"}"><i class="bi ${enabled ? "bi-exclamation-octagon-fill" : "bi-exclamation-octagon"}"></i></button><div class="java-debug-breakpoint-summary"><span>Java Exceptions</span><small>${enabled ? "break on" : "disabled"}${enabled && exceptionBreakpoint.caught !== false ? " - caught" : ""}${enabled && exceptionBreakpoint.uncaught !== false ? " - uncaught" : ""}</small></div><div class="java-debug-breakpoint-actions"><button type="button" class="java-debug-inline" data-exception-breakpoint-properties="true" title="Exception Breakpoint Properties"><i class="bi bi-sliders"></i></button><button type="button" class="java-debug-inline${exceptionBreakpoint.caught !== false ? " active" : ""}" data-exception-breakpoint-kind="caught" data-exception-breakpoint-enabled="${exceptionBreakpoint.caught !== false}" title="Toggle Caught Exceptions"><i class="bi bi-box-arrow-in-down-right"></i></button><button type="button" class="java-debug-inline${exceptionBreakpoint.uncaught !== false ? " active" : ""}" data-exception-breakpoint-kind="uncaught" data-exception-breakpoint-enabled="${exceptionBreakpoint.uncaught !== false}" title="Toggle Uncaught Exceptions"><i class="bi bi-exclamation-triangle"></i></button></div></div>`;
    }

    function breakpointSearchMatchesText(...values) {
      const query = String(breakpointSearchQuery || "").trim().toLowerCase();
      if (!query) return true;
      return values.some((value) => String(value || "").toLowerCase().includes(query));
    }

    function renderMethodBreakpoints(state) {
      const methodBreakpoints = (state.methodBreakpoints || []).filter((bp) => breakpointSearchMatchesText(bp.className, bp.methodName, bp.message, bp.verified ? "resolved" : "pending"));
      if (!methodBreakpoints.length) return renderMethodBreakpointsEmptyState(state.methodBreakpoints || []);
      return methodBreakpoints.map((bp) => `<div class="java-debug-method-breakpoint${bp.enabled !== false ? "" : " disabled"}" data-method-breakpoint-row-id="${escapeHtml(bp.id)}" tabindex="0" role="button" title="Double-click to edit method breakpoint. Right-click for actions."><button type="button" class="java-debug-inline" data-method-breakpoint-toggle="${escapeHtml(bp.id)}" data-method-breakpoint-enabled="${bp.enabled !== false}" title="${bp.enabled !== false ? "Disable Method Breakpoint" : "Enable Method Breakpoint"}"><i class="bi ${bp.enabled !== false ? "bi-record-circle-fill" : "bi-circle"}"></i></button><div class="java-debug-breakpoint-summary"><span>${escapeHtml(bp.className)}.${escapeHtml(bp.methodName)}()</span><small>${bp.verified ? "resolved" : escapeHtml(bp.message || "pending")}${bp.hits ? ` - hit ${bp.hits}` : ""}</small></div><div class="java-debug-breakpoint-actions"><button type="button" class="java-debug-inline" data-method-breakpoint-edit="${escapeHtml(bp.id)}" title="Edit Method Breakpoint"><i class="bi bi-pencil"></i></button><button type="button" class="java-debug-inline" data-method-breakpoint-copy="${escapeHtml(bp.id)}" title="Copy Method"><i class="bi bi-clipboard"></i></button><button type="button" class="java-debug-inline" data-method-breakpoint-remove="${escapeHtml(bp.id)}" title="Remove Method Breakpoint"><i class="bi bi-x"></i></button></div></div>`).join("");
    }

    function renderMethodBreakpointsEmptyState(methodBreakpoints) {
      if (methodBreakpoints.length) return `<div class="java-debug-empty">No Java method breakpoints match the current filter.</div>`;
      const action = hasOpenProject()
        ? `<button type="button" class="java-debug-empty-action" data-debug-action="add-method-breakpoint" title="Add Method Breakpoint"><i class="bi bi-braces" aria-hidden="true"></i><span>Add Method Breakpoint</span></button>`
        : `<span class="java-debug-empty-action disabled"><i class="bi bi-folder2-open" aria-hidden="true"></i><span>Open a Java project</span></span>`;
      return `<div class="java-debug-empty java-debug-breakpoint-empty"><strong>No Java method breakpoints.</strong><span>Break when a selected Java method is entered, similar to Eclipse and IntelliJ method breakpoints.</span>${action}</div>`;
    }
    function lineBreakpointMethodName(bp) {
      return String(bp?.methodName || bp?.method || "");
    }

    function lineBreakpointLocationLabel(bp) {
      const className = String(bp?.className || "");
      const methodName = lineBreakpointMethodName(bp);
      if (!className && !methodName) return "";
      return `${className || "<unknown>"}.${methodName || "<unknown>"}()`;
    }

    function lineBreakpointResolutionLabel(bp) {
      if (bp.enabled === false) return "disabled";
      return bp.verified ? "resolved" : bp.message || "pending";
    }

    function lineBreakpointDetails(bp) {
      const details = [lineBreakpointResolutionLabel(bp)];
      const locationLabel = lineBreakpointLocationLabel(bp);
      if (locationLabel) details.push(locationLabel);
      if (bp.hits) details.push(`hit ${bp.hits}`);
      if (bp.hitCount) details.push(`break after ${bp.hitCount}`);
      if (bp.condition) details.push(`if ${bp.condition}`);
      if (bp.logMessage) details.push(`log "${bp.logMessage}"`);
      return details.join(" - ");
    }

    function sourceNameForBreakpoint(bp) {
      return String(bp?.file || "").split(/[\\/]/).pop() || "Unknown Source";
    }

    function normalizeBreakpointSourcePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "").toLowerCase();
    }

    function activeEditorMatchesBreakpoint(bp) {
      const activeFile = normalizeBreakpointSourcePath(deps.getActiveEditorPath?.());
      if (!activeFile) return false;
      return [bp?.file, bp?.resolvedFile]
        .map(normalizeBreakpointSourcePath)
        .filter(Boolean)
        .some((file) => file === activeFile);
    }

    function lineBreakpointSourcePreview(bp) {
      const savedPreview = String(bp?.sourcePreview || bp?.sourceLine || bp?.lineText || "").trim();
      if (savedPreview) return savedPreview.replace(/\s+/g, " ");
      if (!activeEditorMatchesBreakpoint(bp)) return "";
      return sourceContext.getJavaLinePreview?.({ source: deps.getActiveEditorValue?.() || "", line: bp.line }) || "";
    }

    function renderLineBreakpointChip(label, kind = "") {
      const chipClass = kind ? ` java-debug-breakpoint-chip-${escapeHtml(kind)}` : "";
      return `<span class="java-debug-breakpoint-chip${chipClass}" title="${escapeHtml(label)}">${escapeHtml(label)}</span>`;
    }

    function renderLineBreakpointChips(bp) {
      const statusKind = bp.enabled === false ? "disabled" : bp.verified ? "resolved" : "pending";
      const chips = [{ label: lineBreakpointResolutionLabel(bp), kind: statusKind }];
      if (bp.condition) chips.push({ label: `if ${bp.condition}`, kind: "condition" });
      if (bp.hitCount) chips.push({ label: `hit count ${bp.hitCount}`, kind: "hit-count" });
      if (bp.logMessage) chips.push({ label: `log ${bp.logMessage}`, kind: "logpoint" });
      if (bp.hits) chips.push({ label: `${bp.hits} hits`, kind: "hits" });
      const locationLabel = lineBreakpointLocationLabel(bp);
      if (locationLabel) chips.push({ label: locationLabel, kind: "location" });
      return chips.map((chip) => renderLineBreakpointChip(chip.label, chip.kind)).join("");
    }

    function lineBreakpointMatchesQuery(bp) {
      return breakpointSearchMatchesText(bp.file, bp.resolvedFile, sourceNameForBreakpoint(bp), bp.line, lineBreakpointDetails(bp), lineBreakpointSourcePreview(bp));
    }
    function groupLineBreakpointsByFile(breakpoints) {
      const groups = new Map();
      (breakpoints || []).forEach((bp) => {
        const key = bp.resolvedFile || bp.file || "Unknown Source";
        if (!groups.has(key)) groups.set(key, []);
        groups.get(key).push(bp);
      });
      return Array.from(groups.entries()).sort(([left], [right]) => String(left).localeCompare(String(right)));
    }

    function renderLineBreakpointRow(bp) {
      const navigateFile = bp.resolvedFile || bp.file || "";
      const navigateSourceName = bp.sourceName || sourceNameForBreakpoint(bp);
      const navigateClassName = bp.className || "";
      const navigationData = `data-breakpoint-navigate-file="${escapeHtml(navigateFile)}" data-breakpoint-source-name="${escapeHtml(navigateSourceName)}" data-breakpoint-class-name="${escapeHtml(navigateClassName)}"`;
      const sourceLocation = `${sourceNameForBreakpoint(bp)}:${bp.line}`;
      const locationLabel = lineBreakpointLocationLabel(bp);
      const primaryLabel = locationLabel || sourceLocation;
      const detailsLabel = lineBreakpointDetails(bp);
      const sourcePreview = lineBreakpointSourcePreview(bp);
      const previewMarkup = sourcePreview ? `<code class="java-debug-breakpoint-preview" title="${escapeHtml(sourcePreview)}">${escapeHtml(sourcePreview)}</code>` : `<small class="java-debug-breakpoint-detail" title="${escapeHtml(detailsLabel)}">${escapeHtml(detailsLabel)}</small>`;
      return `<div class="java-debug-breakpoint${bp.enabled !== false ? "" : " disabled"}" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" ${navigationData} tabindex="0" role="button" title="Click to navigate to source. Right-click for breakpoint actions."><button type="button" class="java-debug-inline" data-breakpoint-toggle="true" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" data-breakpoint-enabled="${bp.enabled !== false}" title="${bp.enabled !== false ? "Disable Breakpoint" : "Enable Breakpoint"}"><i class="bi ${bp.enabled !== false ? "bi-record-circle-fill" : "bi-circle"}"></i></button><div class="java-debug-breakpoint-summary"><div class="java-debug-breakpoint-main"><span title="${escapeHtml(primaryLabel)}">${escapeHtml(primaryLabel)}</span><small title="${escapeHtml(bp.resolvedFile || bp.file)}">${escapeHtml(sourceLocation)}</small></div><div class="java-debug-breakpoint-meta">${renderLineBreakpointChips(bp)}</div>${previewMarkup}</div><div class="java-debug-breakpoint-actions"><button type="button" class="java-debug-inline" data-breakpoint-navigate="true" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" ${navigationData} title="Navigate to Source"><i class="bi bi-box-arrow-up-right"></i></button><button type="button" class="java-debug-inline" data-breakpoint-properties="true" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" title="Edit Breakpoint"><i class="bi bi-sliders"></i></button><button type="button" class="java-debug-inline" data-breakpoint-edit="condition" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" title="Edit Condition"><i class="bi bi-filter"></i></button><button type="button" class="java-debug-inline" data-breakpoint-edit="hitCount" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" title="Edit Hit Count"><i class="bi bi-123"></i></button><button type="button" class="java-debug-inline" data-breakpoint-edit="logMessage" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" title="Edit Logpoint"><i class="bi bi-chat-left-text"></i></button><button type="button" class="java-debug-inline" data-breakpoint-remove="true" data-breakpoint-file="${escapeHtml(bp.file)}" data-breakpoint-line="${bp.line}" title="Remove Breakpoint"><i class="bi bi-x"></i></button></div></div>`;
    }
    function renderLineBreakpointsEmptyState(breakpoints) {
      if (breakpoints.length) return `<div class="java-debug-empty">No Java line breakpoints match the current filter.</div>`;
      const canToggleActiveLine = isJavaSourcePath(deps.getActiveEditorPath?.());
      const currentLineAction = canToggleActiveLine
        ? `<button type="button" class="java-debug-empty-action" data-debug-action="add-line-breakpoint" title="Toggle Breakpoint at Current Line"><i class="bi bi-record-circle" aria-hidden="true"></i><span>Toggle Current Line</span></button>`
        : `<span class="java-debug-empty-action disabled"><i class="bi bi-file-earmark-code" aria-hidden="true"></i><span>Open a Java file</span></span>`;
      return `<div class="java-debug-empty java-debug-breakpoint-empty"><strong>No Java line breakpoints.</strong><span>Click the editor gutter to add one, or use the current Java editor line.</span>${currentLineAction}</div>`;
    }
    function renderLineBreakpointGroups(breakpoints) {
      const visibleBreakpoints = (breakpoints || []).filter(lineBreakpointMatchesQuery);
      if (!visibleBreakpoints.length) return renderLineBreakpointsEmptyState(breakpoints || []);
      return groupLineBreakpointsByFile(visibleBreakpoints).map(([file, rows]) => `<div class="java-debug-breakpoint-group"><div class="java-debug-breakpoint-group-title"><i class="bi bi-file-earmark-code" aria-hidden="true"></i><span>${escapeHtml(sourceNameForBreakpoint({ file }))}</span><small>${escapeHtml(file)}</small></div>${rows.sort((left, right) => Number(left.line) - Number(right.line)).map(renderLineBreakpointRow).join("")}</div>`).join("");
    }

    function renderBreakpointSection(title, icon, body) {
      return `<div class="java-debug-breakpoint-section"><div class="java-debug-breakpoint-section-title"><i class="bi ${escapeHtml(icon)}" aria-hidden="true"></i><span>${escapeHtml(title)}</span></div>${body}</div>`;
    }

    function renderBreakpoints(state) {
      const breakpoints = state.breakpoints || [];
      const hasBreakpoints = hasAnyBreakpointState(state);
      const canToggleActiveLine = isJavaSourcePath(deps.getActiveEditorPath?.());
      const activeMethodContext = getActiveJavaMethodContext();
      const canAddMethodBreakpoint = hasOpenProject();
      const addMethodTitle = !canAddMethodBreakpoint ? "Open a Java project to add method breakpoints" : activeMethodContext ? `Add Method Breakpoint: ${activeMethodContext.className}.${activeMethodContext.methodName}()` : "Add Method Breakpoint by Class and Method";
      const controls = `<div class="java-debug-breakpoint-controls">${createButton("add-line-breakpoint", "bi-record-circle", "Toggle Breakpoint at Current Line", !canToggleActiveLine)}${createButton("configure-line-breakpoint", "bi-sliders", "Breakpoint Properties at Current Line", !canToggleActiveLine)}${createButton("configure-conditional-breakpoint", "bi-filter", "Conditional Breakpoint at Current Line", !canToggleActiveLine)}${createButton("configure-hit-count-breakpoint", "bi-123", "Hit Count Breakpoint at Current Line", !canToggleActiveLine)}${createButton("configure-logpoint", "bi-chat-left-text", "Logpoint at Current Line", !canToggleActiveLine)}${createButton("add-method-breakpoint", "bi-braces", addMethodTitle, !canAddMethodBreakpoint)}${createButton("enable-all-breakpoints", "bi-record-circle", "Enable All Breakpoints", !hasBreakpoints)}${createButton("disable-all-breakpoints", "bi-slash-circle", "Disable All Breakpoints", !hasBreakpoints)}${createButton("clear-breakpoints", "bi-trash", "Delete All Breakpoints", !hasBreakpoints)}<input type="search" class="java-debug-breakpoint-search" data-debug-breakpoint-search placeholder="Search breakpoints" value="${escapeHtml(breakpointSearchQuery)}"></div>`;
      return controls
        + renderBreakpointSection("Line Breakpoints", "bi-record-circle", renderLineBreakpointGroups(breakpoints))
        + renderBreakpointSection("Method Breakpoints", "bi-braces", renderMethodBreakpoints(state))
        + renderBreakpointSection("Exception Breakpoints", "bi-exclamation-octagon", renderExceptionBreakpoint(state));
    }

    function registerWatchResultAction(watch) {
      const result = watch?.result;
      if (!result) return "";
      return registerValueAction({
        name: watch.expression || "watch",
        expression: watch.expression || "",
        type: result.type || "",
        value: result.value ?? "",
        objectId: result.objectId || "",
        expandable: result.expandable,
        expanded: result.expanded,
        children: result.children,
        kind: result.error ? "error" : "result",
        error: result.error
      });
    }

    function renderWatchResult(watch) {
      if (watch.enabled === false) return `<small class="java-debug-watch-result">disabled</small>`;
      const result = watch.result;
      if (!result) return `<small class="java-debug-watch-result">not evaluated</small>`;
      const text = result.error ? result.value : `${result.type ? `${result.type} = ` : ""}${result.value || ""}`;
      return `<small class="java-debug-watch-result${result.error ? " java-debug-watch-result-error" : ""}" title="${escapeHtml(text)}">${escapeHtml(text)}</small>`;
    }

    function renderEvaluationResult(state) {
      const result = state.lastEvaluation;
      if (!result) return "";
      const text = result.error ? result.value : `${result.type ? `${result.type} = ` : ""}${result.value ?? ""}`;
      const valueId = registerValueAction({ name: result.expression || "result", expression: result.expression || "", type: result.type || "", value: result.value ?? "", objectId: result.objectId || "", expandable: result.expandable, expanded: result.expanded, children: result.children, kind: result.error ? "error" : "result", error: result.error });
      const canExpand = result.expandable && result.objectId && !result.error;
      const children = result.expanded && result.children?.length ? `<div class="java-debug-evaluation-members">${renderVariables(result.children, 1)}</div>` : "";
      return `<div class="java-debug-evaluation-result${result.error ? " error" : ""}"><button type="button" class="java-debug-expander" data-evaluation-expand-object="${escapeHtml(result.objectId || "")}"${canExpand ? "" : " disabled"} title="Expand Result"><i class="bi ${result.expanded ? "bi-caret-down-fill" : "bi-caret-right-fill"}"></i></button><div class="java-debug-evaluation-result-main"><span>${escapeHtml(result.expression || "")}</span><small title="${escapeHtml(text)}">${escapeHtml(text || "(no result)")}</small></div><div class="java-debug-evaluation-actions"><button type="button" class="java-debug-inline" data-copy-value-id="${escapeHtml(valueId)}" title="Copy Result"><i class="bi bi-copy"></i></button><button type="button" class="java-debug-inline" data-copy-expression-id="${escapeHtml(valueId)}" title="Copy Expression"><i class="bi bi-braces"></i></button><button type="button" class="java-debug-inline" data-add-watch-value-id="${escapeHtml(valueId)}" title="Add Result Expression to Watches"${result.expression ? "" : " disabled"}><i class="bi bi-eye"></i></button><button type="button" class="java-debug-inline" data-inspect-value-id="${escapeHtml(valueId)}" title="Inspect Result"><i class="bi bi-search"></i></button></div></div>${children}`;
    }

    function renderExpressionHistoryOptions(state) {
      return (state.expressionHistory || []).map((expression) => `<option value="${escapeHtml(expression)}"></option>`).join("");
    }

    function renderExpressionHistoryList(state) {
      const history = (state.expressionHistory || []).slice(0, 12);
      if (!history.length) return renderExpressionHistoryEmptyState(state);
      const canEvaluate = canEvaluateExpressions(state);
      const evaluateDisabled = canEvaluate ? "" : " disabled";
      const evaluateTitle = canEvaluate ? "Evaluate" : "Pause at a Java stack frame to evaluate expressions";
      return `<div class="java-debug-expression-history"><h4>Recent Expressions</h4>${history.map((expression) => `<div class="java-debug-expression-history-row"><button type="button" class="java-debug-expression-history-text" data-expression-history-run="${escapeHtml(expression)}" title="${escapeHtml(evaluateTitle)} ${escapeHtml(expression)}"${evaluateDisabled}>${escapeHtml(expression)}</button><div class="java-debug-expression-history-actions"><button type="button" class="java-debug-inline" data-expression-history-run="${escapeHtml(expression)}" title="${escapeHtml(evaluateTitle)} Again"${evaluateDisabled}><i class="bi bi-play-fill"></i></button><button type="button" class="java-debug-inline" data-expression-history-watch="${escapeHtml(expression)}" title="Add to Watches"><i class="bi bi-eye"></i></button><button type="button" class="java-debug-inline" data-expression-history-copy="${escapeHtml(expression)}" title="Copy Expression"><i class="bi bi-copy"></i></button></div></div>`).join("")}</div>`;
    }

    function renderExpressionEvaluator(state, className = "", listId = "java-debug-expression-history") {
      const canEvaluate = canEvaluateExpressions(state);
      const canAddWatch = hasOpenProject();
      const evaluateDisabled = canEvaluate ? "" : " disabled";
      const watchDisabled = canAddWatch ? "" : " disabled";
      const evaluateTitle = canEvaluate ? "Evaluate Expression" : "Pause at a Java stack frame to evaluate expressions";
      const watchTitle = canAddWatch ? "Add to Watches" : "Open a Java project to add watches";
      return `<div class="java-debug-evaluator${className}"><input type="text" data-debug-expression list="${escapeHtml(listId)}" placeholder="Expression or variable path"><datalist id="${escapeHtml(listId)}">${renderExpressionHistoryOptions(state)}</datalist><button type="button" class="java-debug-evaluate" data-debug-action="evaluate" title="${escapeHtml(evaluateTitle)}"${evaluateDisabled}><i class="bi bi-terminal"></i></button><button type="button" class="java-debug-evaluate" data-debug-action="add-watch" title="${escapeHtml(watchTitle)}"${watchDisabled}><i class="bi bi-plus"></i></button></div>`;
    }

    function renderExpressionEmptyAction(state, readyLabel = "Evaluate Expression") {
      const stateId = String(state?.state || "not-running");
      const frameCount = (state?.threads || []).reduce((total, thread) => total + (thread.frames || []).length, 0);
      if (canEvaluateExpressions(state)) return `<button type="button" class="java-debug-empty-action" data-debug-action="focus-expression" title="Focus Expression Input"><i class="bi bi-terminal" aria-hidden="true"></i><span>${escapeHtml(readyLabel)}</span></button>`;
      if (frameCount) return `<button type="button" class="java-debug-empty-action" data-debug-action="view-stack" title="Show Call Stack"><i class="bi bi-layers" aria-hidden="true"></i><span>Show Call Stack</span></button>`;
      if (stateId === "running" || stateId === "stepping") return `<button type="button" class="java-debug-empty-action" data-debug-action="pause" title="Pause Debugger"><i class="bi bi-pause-fill" aria-hidden="true"></i><span>Pause Debugger</span></button>`;
      if (hasOpenProject() && ["not-running", "terminated", "failed"].includes(stateId)) return `<button type="button" class="java-debug-empty-action" data-debug-action="start" title="Start Debugging"><i class="bi bi-bug-fill" aria-hidden="true"></i><span>Start Debugging</span></button>`;
      return `<span class="java-debug-empty-action disabled"><i class="bi bi-pause-fill" aria-hidden="true"></i><span>Pause at a frame</span></span>`;
    }

    function renderExpressionResultEmptyState(state) {
      return `<div class="java-debug-empty java-debug-expression-empty"><strong>No expression result.</strong><span>Evaluate a Java expression in the selected stack frame to inspect values, call methods, or add the result to Watches.</span>${renderExpressionEmptyAction(state)}</div>`;
    }

    function renderExpressionHistoryEmptyState(state) {
      return `<div class="java-debug-empty java-debug-expression-empty"><strong>No recent expressions.</strong><span>Expressions evaluated here are kept for quick re-run and can be promoted to Watches.</span>${renderExpressionEmptyAction(state, "Focus Input")}</div>`;
    }
    function renderWatchesEmptyState(canAddWatch) {
      const action = canAddWatch
        ? `<button type="button" class="java-debug-empty-action" data-debug-action="add-watch-expression" title="Add Watch Expression"><i class="bi bi-eye" aria-hidden="true"></i><span>Add Watch</span></button>`
        : `<span class="java-debug-empty-action disabled"><i class="bi bi-folder2-open" aria-hidden="true"></i><span>Open a Java project</span></span>`;
      return `<div class="java-debug-empty java-debug-watch-empty"><strong>No watches.</strong><span>Add persistent Java expressions to re-evaluate whenever execution stops.</span>${action}</div>`;
    }
    function renderWatches(state) {
      const watches = state.watches || [];
      const rows = watches.map((watch) => {
        const enabled = watch.enabled !== false;
        const result = watch.result || {};
        const expansionState = result.expandable ? ` aria-expanded="${result.expanded ? "true" : "false"}"` : "";
        const expandTitle = result.expanded ? "Collapse Watch" : "Expand Watch";
        const resultValueId = registerWatchResultAction(watch);
        const inspectDisabled = resultValueId ? "" : " disabled";
        return `<div class="java-debug-watch-entry"><div class="java-debug-watch${enabled ? "" : " disabled"}${result.error ? " error" : ""}" data-watch-row-id="${escapeHtml(watch.id)}" data-watch-object-id="${escapeHtml(result.objectId || "")}" data-watch-result-value-id="${escapeHtml(resultValueId)}" tabindex="0" role="treeitem"${expansionState}><button type="button" class="java-debug-inline" data-watch-toggle="${escapeHtml(watch.id)}" data-watch-enabled="${enabled}" title="${enabled ? "Disable Watch" : "Enable Watch"}"><i class="bi ${enabled ? "bi-eye" : "bi-eye-slash"}"></i></button><button type="button" class="java-debug-expander" data-watch-expand="${escapeHtml(result.objectId || "")}"${enabled && result.expandable ? "" : " disabled"} title="${escapeHtml(expandTitle)}"><i class="bi ${result.expanded ? "bi-caret-down-fill" : "bi-caret-right-fill"}"></i></button><input type="text" class="java-debug-watch-expression" data-watch-expression-input="${escapeHtml(watch.id)}" data-watch-expression-original="${escapeHtml(watch.expression)}" value="${escapeHtml(watch.expression)}" title="Edit watch expression">${renderWatchResult(watch)}<div class="java-debug-watch-actions"><button type="button" class="java-debug-inline" data-inspect-value-id="${escapeHtml(resultValueId)}" title="Inspect Result"${inspectDisabled}><i class="bi bi-search"></i></button><button type="button" class="java-debug-inline" data-watch-edit="${escapeHtml(watch.id)}" title="Edit Watch"><i class="bi bi-pencil"></i></button><button type="button" class="java-debug-inline" data-remove-watch="${escapeHtml(watch.id)}" title="Remove Watch"><i class="bi bi-x"></i></button></div></div>${result.expanded && result.children ? renderVariables(result.children, 1) : ""}</div>`;
      }).join("");
      const hasEnabledWatch = watches.some((watch) => watch.enabled !== false);
      const canRefreshWatches = canEvaluateExpressions(state) && hasEnabledWatch;
      const canAddWatch = hasOpenProject();
      const addWatchTitle = canAddWatch ? "Add Watch Expression" : "Open a Java project to add watches";
      const toolbar = `<div class="java-debug-watch-toolbar"><input type="text" class="java-debug-watch-add-input" data-watch-add-input placeholder="Expression or variable path" title="${escapeHtml(addWatchTitle)}"${canAddWatch ? "" : " disabled"}><button type="button" class="java-debug-inline" data-watch-add-submit title="${escapeHtml(addWatchTitle)}"${canAddWatch ? "" : " disabled"}><i class="bi bi-plus"></i></button><button type="button" class="java-debug-inline" data-debug-action="add-watch-expression" title="${escapeHtml(addWatchTitle)}"${canAddWatch ? "" : " disabled"}><i class="bi bi-plus-circle"></i></button><button type="button" class="java-debug-inline" data-debug-action="refresh-watches" title="${canRefreshWatches ? "Refresh Watches" : "Pause at a Java stack frame to refresh watches"}"${canRefreshWatches ? "" : " disabled"}><i class="bi bi-arrow-clockwise"></i></button></div>`;
      return toolbar + `<div class="java-debug-watch-list">${rows || renderWatchesEmptyState(canAddWatch)}</div>`;
    }

    function renderExpressions(state) {
      return `<div class="java-debug-expression-panel">${renderSelectedFrameContext(state)}${renderExpressionEvaluator(state)}${renderEvaluationResult(state) || renderExpressionResultEmptyState(state)}${renderExpressionHistoryList(state)}</div>`;
    }

    function renderConsoleText(text) {
      const source = String(text || "");
      const query = String(consoleSearchQuery || "");
      if (!query) return escapeHtml(source);
      const lowerSource = source.toLowerCase();
      const lowerQuery = query.toLowerCase();
      let cursor = 0;
      let result = "";
      let index = lowerSource.indexOf(lowerQuery);
      while (index >= 0) {
        result += escapeHtml(source.slice(cursor, index));
        result += `<mark>${escapeHtml(source.slice(index, index + query.length))}</mark>`;
        cursor = index + query.length;
        index = lowerSource.indexOf(lowerQuery, cursor);
      }
      return result + escapeHtml(source.slice(cursor));
    }

    function consoleEntryLabel(kind) {
      if (kind === "stderr") return "stderr";
      if (kind === "stdin") return "stdin";
      if (kind === "debugger") return "debugger";
      if (kind === "logpoint") return "log";
      if (kind === "error") return "error";
      return "stdout";
    }

    function consoleEntryCounts(entries) {
      return (entries || []).reduce((counts, entry) => {
        const kind = normalizeConsoleEntryKind(entry?.kind);
        counts[kind] = (counts[kind] || 0) + 1;
        return counts;
      }, {});
    }

    function filteredConsoleEntries(entries) {
      return (entries || []).filter((entry) => isConsoleKindVisible(entry?.kind));
    }

    function formatConsoleEntries(entries) {
      return (entries || []).map((entry) => entry?.text || "").join("");
    }

    function renderConsoleFilters(state) {
      const entries = state.consoleEntries || [];
      const counts = consoleEntryCounts(entries);
      const allActive = DEBUG_CONSOLE_FILTERS.every((filter) => consoleFilters[filter.id] !== false);
      const filters = DEBUG_CONSOLE_FILTERS.map((filter) => {
        const active = consoleFilters[filter.id] !== false;
        const count = counts[filter.id] || 0;
        return `<button type="button" class="java-debug-console-filter${active ? " active" : ""}" data-debug-console-filter="${escapeHtml(filter.id)}" aria-pressed="${active ? "true" : "false"}" title="${active ? "Hide" : "Show"} ${escapeHtml(filter.label)} output">${escapeHtml(filter.label)} <span>${count}</span></button>`;
      }).join("");
      return `<div class="java-debug-console-filters" role="group" aria-label="Console output filters"><button type="button" class="java-debug-console-filter java-debug-console-filter-all${allActive ? " active" : ""}" data-debug-console-filter="all" aria-pressed="${allActive ? "true" : "false"}" title="Show all console output">All</button>${filters}</div>`;
    }

    function renderConsoleEntries(state) {
      const entries = state.consoleEntries || [];
      if (!entries.length) return renderConsoleText(state.console || "") || `<span class="java-debug-console-empty">No debug console output yet.</span>`;
      const visibleEntries = filteredConsoleEntries(entries);
      if (!visibleEntries.length) return `<span class="java-debug-console-empty">No console output matches the current filters.</span>`;
      return visibleEntries.map((entry) => {
        const kind = normalizeConsoleEntryKind(entry.kind);
        return `<span class="java-debug-console-entry java-debug-console-entry-${escapeHtml(kind)}"><span class="java-debug-console-label">${escapeHtml(consoleEntryLabel(kind))}</span><span>${renderConsoleText(entry.text || "")}</span></span>`;
      }).join("");
    }

    function paneCountBadge(count, singular, plural = `${singular}s`) {
      const value = Math.max(0, Number(count) || 0);
      return `${value} ${value === 1 ? singular : plural}`;
    }

    function countDebugValues(values) {
      return (values || []).reduce((total, item) => total + 1 + countDebugValues(item?.children), 0);
    }

    function countBreakpoints(state) {
      return (state.breakpoints || []).length
        + (state.methodBreakpoints || []).length
        + (state.exceptionBreakpoint ? 1 : 0);
    }

    function countConsoleEntries(state) {
      const entries = state.consoleEntries || [];
      if (entries.length) return entries.length;
      const text = String(state.console || "").trim();
      return text ? text.split(/\r?\n/).length : 0;
    }
    function renderPaneToggle(title, paneId, collapsed) {
      if (!paneId) return "";
      const label = collapsed ? `Expand ${title}` : `Collapse ${title}`;
      return `<button type="button" class="java-debug-pane-toggle" data-debug-pane-toggle="${escapeHtml(paneId)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-expanded="${collapsed ? "false" : "true"}"><i class="bi ${collapsed ? "bi-chevron-right" : "bi-chevron-down"}" aria-hidden="true"></i></button>`;
    }

    function renderPaneMaximize(title, paneId) {
      if (!paneId) return "";
      const maximized = maximizedPaneId === paneId;
      const label = maximized ? `Restore ${title}` : `Maximize ${title}`;
      return `<button type="button" class="java-debug-pane-toggle java-debug-pane-maximize" data-debug-pane-maximize="${escapeHtml(paneId)}" title="${escapeHtml(label)}" aria-label="${escapeHtml(label)}" aria-pressed="${maximized ? "true" : "false"}"><i class="bi ${maximized ? "bi-fullscreen-exit" : "bi-arrows-fullscreen"}" aria-hidden="true"></i></button>`;
    }

    function paneIconClass(paneId) {
      return DEBUG_VIEW_SWITCHER_ITEMS.find((item) => item.view === paneId)?.icon || "bi-window";
    }

    function renderPaneTitle(title, paneId) {
      return `<span class="java-debug-pane-title"><i class="bi ${escapeHtml(paneIconClass(paneId))}" aria-hidden="true"></i><span>${escapeHtml(title)}</span></span>`;
    }
    function renderPaneHeader(title, paneId, collapsed, badge = "") {
      const badgeMarkup = badge ? `<span class="java-debug-pane-count">${escapeHtml(badge)}</span>` : "";
      return `<div class="java-debug-pane-header"><h4>${renderPaneTitle(title, paneId)}</h4>${badgeMarkup}${renderPaneMaximize(title, paneId)}${renderPaneToggle(title, paneId, collapsed)}</div>`;
    }

    function renderConsole(state, paneId = "") {
      const maximized = maximizedPaneId === paneId;
      const hidden = maximizedPaneId && paneId && maximizedPaneId !== paneId;
      const collapsed = maximized ? false : isPaneCollapsed(paneId);
      const paneAttributes = paneId ? ` data-debug-pane="${escapeHtml(paneId)}"` : "";
      const paneClass = `${collapsed ? " collapsed" : ""}${maximized ? " maximized" : ""}${hidden ? " workspace-hidden" : ""}`;
      const tools = collapsed ? "" : `${renderConsoleFilters(state)}<button type="button" class="java-debug-inline" data-debug-action="clear-console" title="Clear Console"><i class="bi bi-eraser"></i></button><button type="button" class="java-debug-inline" data-debug-action="copy-console" title="Copy Visible Console Output"><i class="bi bi-copy"></i></button><button type="button" class="java-debug-inline" data-debug-action="select-console" title="Select Console Output"><i class="bi bi-textarea-t"></i></button><label class="java-debug-console-toggle"><input type="checkbox" data-debug-console-autoscroll${consoleAutoScroll ? " checked" : ""}> Auto</label><input type="search" class="java-debug-console-search" data-debug-console-search placeholder="Search console" value="${escapeHtml(consoleSearchQuery)}">`;
      const canSendStdin = state.canAcceptStdin === true && isActive(state.state);
      const stdinDisabled = canSendStdin ? "" : " disabled";
      const stdinTitle = canSendStdin ? "Send Input" : "Standard input is available only for launched Java debug sessions";
      const stdinPlaceholder = canSendStdin ? "Type input and press Enter" : "Standard input unavailable";
      const body = collapsed ? "" : `<div class="java-debug-console-body"><pre data-debug-console-output>${renderConsoleEntries(state)}</pre><div class="java-debug-console-input"><span class="java-debug-console-input-label">stdin &gt;</span><input type="text" data-debug-stdin aria-label="Debug console standard input" placeholder="${escapeHtml(stdinPlaceholder)}" autocomplete="off" spellcheck="false"${stdinDisabled}><button type="button" class="java-debug-evaluate" data-debug-action="send-stdin" title="${escapeHtml(stdinTitle)}"${stdinDisabled}><i class="bi bi-send"></i></button></div></div>`;
      return `<section class="java-debug-console${paneClass}"${paneAttributes}><div class="java-debug-console-toolbar"><h4>${renderPaneTitle("Debug Console", paneId || "console")}</h4><span class="java-debug-pane-count">${escapeHtml(paneCountBadge(countConsoleEntries(state), "entry", "entries"))}</span>${renderPaneMaximize("Debug Console", paneId)}${renderPaneToggle("Debug Console", paneId, collapsed)}${tools}</div>${body}</section>`;
    }
    function orderedDebugViews() {
      const activeView = dockableDebugTabViews.get(activeDebugView) || views.get(resolveViewTabId(activeDebugView));
      const ordered = [activeView, ...Array.from(dockableDebugTabViews.values()), ...Array.from(perspectiveViews.values()), ...Array.from(views.values())].filter(Boolean);
      return ordered.filter((view, index) => ordered.indexOf(view) === index);
    }

    function queryDebugPanel(selector) {
      for (const view of orderedDebugViews()) {
        const match = view.querySelector(selector);
        if (match) return match;
      }
      return null;
    }

    function findExpressionInput(source) {
      return source?.closest?.(".java-debug-evaluator")?.querySelector?.("[data-debug-expression]") || queryDebugPanel("[data-debug-expression]");
    }

    function renderPanelSection(title, body, className = "", paneId = "", badge = "") {
      const maximized = maximizedPaneId === paneId;
      const hidden = maximizedPaneId && paneId && maximizedPaneId !== paneId;
      const collapsed = maximized ? false : isPaneCollapsed(paneId);
      const paneAttributes = paneId ? ` data-debug-pane="${escapeHtml(paneId)}"` : "";
      const paneClass = `${collapsed ? " collapsed" : ""}${maximized ? " maximized" : ""}${hidden ? " workspace-hidden" : ""}`;
      return `<section class="java-debug-workbench-section${className ? ` ${escapeHtml(className)}` : ""}${paneClass}"${paneAttributes}>${renderPaneHeader(title, paneId, collapsed, badge)}${collapsed ? "" : body}</section>`;
    }
    function renderDebugChrome(state, body, activeView = "workspace") {
      return `${renderToolbar(state)}${renderViewSwitcher(activeView)}${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${body}`;
    }
    function normalizeDebugLayoutPath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinDebugLayoutPath(parent, child) {
      return `${normalizeDebugLayoutPath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function getDebugLayoutFilesystem() {
      return (deps.Neutralino || global.Neutralino)?.filesystem || null;
    }

    function getActiveDebugProjectPath() {
      return normalizeDebugLayoutPath(debugLayoutProjectPath || deps.getProjectPath?.() || deps.store?.getSnapshot?.().projectPath || "");
    }

    function getDebugLayoutPath(root = getActiveDebugProjectPath()) {
      return root ? joinDebugLayoutPath(joinDebugLayoutPath(root, ".md-editor"), DEBUG_LAYOUT_FILE_NAME) : "";
    }

    function getActiveDebugLayoutId() {
      return perspectiveOpen ? "debug" : "developer";
    }

    function createDefaultDebugPerspectiveLayout(layoutId = "debug", options = {}) {
      const normalizedLayoutId = DEBUG_LAYOUT_IDS.has(layoutId) ? layoutId : "debug";
      const docks = { left: { tabs: [], active: "", visible: false }, right: { tabs: [], active: "", visible: false }, bottom: { tabs: [], active: "", visible: false } };
      const assignments = Object.assign({}, DEFAULT_DEBUG_DOCK_ASSIGNMENTS);
      const defaultViews = options.includeAiCompanion === false ? coreDebugPerspectiveViews : dockableDebugViews;
      if (normalizedLayoutId === "debug") {
        defaultViews.forEach((item) => {
          const dockId = normalizeDebugDockId(item.defaultDock, "right");
          docks[dockId].tabs.push(item.view);
          if (!docks[dockId].active) docks[dockId].active = item.view;
          docks[dockId].visible = true;
        });
      } else if (deps.aiCompanionDockElement) {
        docks.right.tabs.push("ai-companion");
        docks.right.active = "ai-companion";
        docks.right.visible = isAiCompanionOpen() || isRightSidebarVisible();
      }
      return {
        docks,
        assignments,
        sizes: normalizeDebugPanelSizes(options.sizes || deps.getPanelSizes?.() || {}),
        sidebarLowerPanel: normalizeSidebarLowerPanelState(Object.prototype.hasOwnProperty.call(options, "sidebarLowerPanel") ? options.sidebarLowerPanel : (normalizedLayoutId === "developer" ? deps.getSidebarLowerPanelState?.() || {} : {}))
      };
    }

    function createDebugLayoutDocument() {
      return {
        schemaVersion: 1,
        type: DEBUG_LAYOUT_DOCUMENT_TYPE,
        layouts: {
          developer: createDefaultDebugPerspectiveLayout("developer"),
          debug: createDefaultDebugPerspectiveLayout("debug")
        }
      };
    }

    function normalizeDebugPanelSizes(value = {}, fallback = {}) {
      const sizes = {};
      ["sidebarWidth", "sidebarDropzoneHeight", "rightSidebarWidth", "bottomPanelHeight"].forEach((key) => {
        const number = Number(Object.prototype.hasOwnProperty.call(value, key) ? value[key] : fallback[key]);
        if (Number.isFinite(number) && number > 0) sizes[key] = Math.round(number);
      });
      return sizes;
    }

    function normalizeSidebarLowerPanelState(value = {}, fallback = {}) {
      const enabled = {
        dropzone: Object.prototype.hasOwnProperty.call(value?.enabled || {}, "dropzone") ? value.enabled.dropzone === true : fallback?.enabled?.dropzone !== false,
        outline: Object.prototype.hasOwnProperty.call(value?.enabled || {}, "outline") ? value.enabled.outline === true : fallback?.enabled?.outline !== false
      };
      const activeCandidate = String(value?.activeViewId || fallback?.activeViewId || "outline");
      const activeViewId = enabled[activeCandidate] === true ? activeCandidate : (enabled.outline ? "outline" : (enabled.dropzone ? "dropzone" : ""));
      return { activeViewId, enabled };
    }

    function normalizeDebugDockTabs(value, usedViews = new Set()) {
      const tabs = [];
      (Array.isArray(value) ? value : []).forEach((item) => {
        const layoutTabId = normalizePanelLayoutTabId(item);
        if (!layoutTabId || usedViews.has(layoutTabId)) return;
        usedViews.add(layoutTabId);
        tabs.push(layoutTabId);
      });
      return tabs;
    }

    function normalizeDebugAssignments(value = {}) {
      const assignments = Object.assign({}, DEFAULT_DEBUG_DOCK_ASSIGNMENTS);
      dockableDebugViews.forEach((item) => {
        const dockId = String(value?.[item.view] || "");
        if (DEBUG_DOCK_IDS.has(dockId)) assignments[item.view] = dockId;
      });
      return assignments;
    }

    function normalizeDebugDockLayout(value, fallback, usedViews) {
      const tabs = normalizeDebugDockTabs(value?.tabs ?? fallback.tabs, usedViews);
      const activeCandidate = normalizePanelLayoutTabId(value?.active || "");
      const fallbackActive = normalizePanelLayoutTabId(fallback.active);
      const active = tabs.includes(activeCandidate) ? activeCandidate : (tabs.includes(fallbackActive) ? fallbackActive : (tabs[0] || ""));
      const visible = typeof value?.visible === "boolean" ? value.visible : fallback.visible === true;
      return { tabs, active, visible };
    }

    function normalizeDebugPerspectiveLayout(value, layoutId) {
      const fallback = createDefaultDebugPerspectiveLayout(layoutId);
      const usedViews = new Set();
      const docks = {};
      DEBUG_DOCK_IDS.forEach((dockId) => {
        docks[dockId] = normalizeDebugDockLayout(value?.docks?.[dockId], fallback.docks[dockId], usedViews);
      });
      const assignments = normalizeDebugAssignments(value?.assignments || fallback.assignments);
      DEBUG_DOCK_IDS.forEach((dockId) => docks[dockId].tabs.forEach((viewId) => { if (dockableDebugViewIds.has(viewId)) assignments[viewId] = dockId; }));
      const sizes = normalizeDebugPanelSizes(value?.sizes || {}, fallback.sizes || {});
      const sidebarLowerPanel = normalizeSidebarLowerPanelState(value?.sidebarLowerPanel || {}, fallback.sidebarLowerPanel || {});
      return { docks, assignments, sizes, sidebarLowerPanel };
    }

    function normalizeDebugLayoutDocument(value = {}) {
      const defaults = createDebugLayoutDocument();
      const layouts = {};
      DEBUG_LAYOUT_IDS.forEach((layoutId) => {
        layouts[layoutId] = normalizeDebugPerspectiveLayout(value?.layouts?.[layoutId] || defaults.layouts[layoutId], layoutId);
      });
      return { schemaVersion: 1, type: DEBUG_LAYOUT_DOCUMENT_TYPE, layouts };
    }

    function getDebugPerspectiveLayout(layoutId = getActiveDebugLayoutId()) {
      const normalizedLayoutId = DEBUG_LAYOUT_IDS.has(layoutId) ? layoutId : getActiveDebugLayoutId();
      debugLayoutDocument.layouts[normalizedLayoutId] = normalizeDebugPerspectiveLayout(debugLayoutDocument.layouts[normalizedLayoutId], normalizedLayoutId);
      return debugLayoutDocument.layouts[normalizedLayoutId];
    }

    function getDebugDockStateKey(dockId) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      return `javaDebug${normalizedDockId[0].toUpperCase()}${normalizedDockId.slice(1)}Dock`;
    }

    function loadDebugDockTabState(dockId) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      const stateKey = getDebugDockStateKey(normalizedDockId);
      const dock = getDebugPerspectiveLayout().docks[normalizedDockId] || { tabs: [], active: "", visible: true };
      return { [stateKey]: { tabOrder: dock.tabs.map((layoutTabId) => getDockTabIdFromLayoutTab(layoutTabId, normalizedDockId)), activeTabId: dock.active ? getDockTabIdFromLayoutTab(dock.active, normalizedDockId) : "", visible: dock.visible === true } };
    }

    function saveDebugDockTabState(dockId, patch = {}) {
      if (restoringDebugLayout || projectLayoutRestorePending) return;
      const normalizedDockId = normalizeDebugDockId(dockId);
      const stateKey = getDebugDockStateKey(normalizedDockId);
      const nextState = patch?.[stateKey] || {};
      const layout = getDebugPerspectiveLayout();
      const existing = layout.docks[normalizedDockId] || { tabs: [], active: "", visible: true };
      const tabs = Array.isArray(nextState.tabOrder) ? normalizeDebugDockTabs(nextState.tabOrder.map(getLayoutTabFromDockTabId)) : existing.tabs;
      const activeView = Object.prototype.hasOwnProperty.call(nextState, "activeTabId") ? getLayoutTabFromDockTabId(nextState.activeTabId) : existing.active;
      layout.docks[normalizedDockId] = {
        tabs,
        active: tabs.includes(activeView) ? activeView : (tabs[0] || ""),
        visible: Object.prototype.hasOwnProperty.call(nextState, "visible") ? nextState.visible === true : existing.visible === true
      };
      layout.assignments = Object.assign({}, debugDockAssignments);
      queueSaveDebugLayoutDocument();
    }

    function isDebugDockVisible(dockId) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      if (normalizedDockId === "left") return deps.leftHost?.hidden !== true;
      if (normalizedDockId === "right") return isRightSidebarVisible();
      return deps.bottomPanel?.isPanelVisible?.() === true;
    }

    function captureDebugDockLayout(dockId) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      const tabsApi = ensureDebugDockManager(normalizedDockId);
      const tabs = (tabsApi?.getTabOrder?.() || []).map(getLayoutTabFromDockTabId).filter((layoutTabId) => layoutTabId && tabsApi?.hasTab?.(getDockTabIdFromLayoutTab(layoutTabId, normalizedDockId)));
      const activeView = getLayoutTabFromDockTabId(tabsApi?.getActiveTabId?.() || "");
      return { tabs, active: tabs.includes(activeView) ? activeView : "", visible: isDebugDockVisible(normalizedDockId) };
    }

    function captureCurrentDebugLayout(layoutId = getActiveDebugLayoutId(), options = {}) {
      if (restoringDebugLayout || projectLayoutRestorePending) return;
      const normalizedLayoutId = DEBUG_LAYOUT_IDS.has(layoutId) ? layoutId : getActiveDebugLayoutId();
      const docks = {};
      DEBUG_DOCK_IDS.forEach((dockId) => { docks[dockId] = captureDebugDockLayout(dockId); });
      debugLayoutDocument.layouts[normalizedLayoutId] = normalizeDebugPerspectiveLayout({
        docks,
        assignments: debugDockAssignments,
        sizes: deps.getPanelSizes?.() || {},
        sidebarLowerPanel: deps.getSidebarLowerPanelState?.() || {}
      }, normalizedLayoutId);
      if (options.persist !== false) queueSaveDebugLayoutDocument();
    }

    function captureCurrentLayoutSizes(layoutId = getActiveDebugLayoutId(), options = {}) {
      if (restoringDebugLayout || projectLayoutRestorePending) return;
      const normalizedLayoutId = DEBUG_LAYOUT_IDS.has(layoutId) ? layoutId : getActiveDebugLayoutId();
      const layout = getDebugPerspectiveLayout(normalizedLayoutId);
      layout.sizes = normalizeDebugPanelSizes(deps.getPanelSizes?.() || {}, layout.sizes || {});
      if (options.persist !== false) queueSaveDebugLayoutDocument();
    }

    function queueSaveDebugLayoutDocument() {
      const root = getActiveDebugProjectPath();
      const filesystem = getDebugLayoutFilesystem();
      if (!root || !filesystem?.writeFile || !filesystem?.createDirectory) return Promise.resolve(false);
      const document = normalizeDebugLayoutDocument(debugLayoutDocument);
      debugLayoutDocument = document;
      debugLayoutWriteQueue = debugLayoutWriteQueue.then(async () => {
        const metadataDirectory = joinDebugLayoutPath(root, ".md-editor");
        try { await filesystem.createDirectory(metadataDirectory); } catch (_error) {}
        await filesystem.writeFile(getDebugLayoutPath(root), JSON.stringify({ ...document, updatedAt: new Date().toISOString() }, null, 2) + "\n");
        return true;
      }, async () => false);
      return debugLayoutWriteQueue;
    }

    async function restoreForProject(projectPath = deps.getProjectPath?.() || "", options = {}) {
      const root = normalizeDebugLayoutPath(projectPath);
      const generation = ++debugLayoutLoadGeneration;
      debugLayoutProjectPath = root;
      debugLayoutDocument = createDebugLayoutDocument();
      projectLayoutRestorePending = true;
      try {
        const after = Array.isArray(options.after) ? options.after : [];
        if (after.length) await Promise.allSettled(after.map((item) => Promise.resolve(item)));
        const filesystem = getDebugLayoutFilesystem();
        if (root && filesystem?.readFile) {
          try {
            debugLayoutDocument = normalizeDebugLayoutDocument(JSON.parse(await filesystem.readFile(getDebugLayoutPath(root))));
          } catch (_error) {
            debugLayoutDocument = createDebugLayoutDocument();
          }
        }
        if (generation !== debugLayoutLoadGeneration) return false;
        restoreDebugPerspectiveLayout(getActiveDebugLayoutId(), { persist: false });
        render(lastState);
        return true;
      } finally {
        if (generation === debugLayoutLoadGeneration) projectLayoutRestorePending = false;
      }
    }

    function subscribeBottomPanelLayoutChanges() {
      if (bottomPanelLayoutSubscribed || typeof deps.bottomPanel?.addStateChangeListener !== "function") return;
      bottomPanelLayoutSubscribed = true;
      deps.bottomPanel.addStateChangeListener(() => {
        if (restoringDebugLayout || projectLayoutRestorePending) return;
        captureCurrentDebugLayout();
      });
    }

    function detachAllDockableDebugTabs() {
      dockableDebugViews.forEach((item) => {
        DEBUG_DOCK_IDS.forEach((dockId) => {
          ensureDebugDockManager(dockId)?.detachTab?.(getDebugTabIdForDock(item.view, dockId));
        });
      });
    }

    function getPanelTabsInLayout(layout) {
      const panelTabIds = new Set();
      DEBUG_DOCK_IDS.forEach((dockId) => {
        (layout?.docks?.[dockId]?.tabs || []).forEach((layoutTabId) => {
          const panelTabId = getPanelTabIdFromLayoutTab(layoutTabId);
          if (panelTabId) panelTabIds.add(panelTabId);
        });
      });
      return panelTabIds;
    }

    function cacheDetachedPanelTab(tabId, tab) {
      const panelTabId = getPanelTabIdFromLayoutTab(getLayoutTabFromDockTabId(tabId));
      if (!panelTabId || !tab?.view) return;
      detachedPanelTabs.set(panelTabId, { ...tab, id: panelTabId });
      tab.view.remove?.();
    }

    function detachPanelTabsNotInLayout(layout) {
      const expectedPanelTabIds = getPanelTabsInLayout(layout);
      DEBUG_DOCK_IDS.forEach((dockId) => {
        const tabsApi = ensureDebugDockManager(dockId);
        (tabsApi?.getTabOrder?.() || []).forEach((tabId) => {
          const panelTabId = getPanelTabIdFromLayoutTab(getLayoutTabFromDockTabId(tabId));
          if (!panelTabId || expectedPanelTabIds.has(panelTabId)) return;
          cacheDetachedPanelTab(tabId, tabsApi?.detachTab?.(tabId));
        });
        syncDebugDockEmptyState(dockId);
      });
    }

    function restorePanelTabToDock(layoutTabId, dockId) {
      const panelTabId = getPanelTabIdFromLayoutTab(layoutTabId);
      if (!panelTabId) return false;
      if (moveDockablePanelTab(panelTabId, dockId, { activate: false })) {
        detachedPanelTabs.delete(panelTabId);
        return true;
      }
      const tab = detachedPanelTabs.get(panelTabId);
      const tabsApi = ensureDebugDockManager(dockId);
      if (!tab?.view || !tabsApi?.addTab) return false;
      tabsApi.addTab({
        id: panelTabId,
        title: tab.title,
        icon: tab.icon,
        view: tab.view,
        permanent: tab.permanent === true,
        buttonDataAttributes: tab.buttonDataAttributes || null,
        onActivate: tab.onActivate,
        onClose: tab.onClose,
        activate: false
      });
      detachedPanelTabs.delete(panelTabId);
      syncDebugDockEmptyState(dockId);
      return true;
    }

    function returnSideDockPanelTabsToBottom() {
      ["left", "right"].forEach((dockId) => {
        const tabsApi = ensureDebugDockManager(dockId);
        (tabsApi?.getTabOrder?.() || []).forEach((tabId) => {
          const panelTabId = getPanelTabIdFromLayoutTab(getLayoutTabFromDockTabId(tabId));
          if (panelTabId) moveDockablePanelTab(panelTabId, "bottom", { activate: false });
        });
        syncDebugDockEmptyState(dockId);
      });
      syncDebugDockEmptyState("bottom");
    }

    function applyDebugDockOrder(dockId, tabs) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      const tabsApi = ensureDebugDockManager(normalizedDockId);
      const tabIds = (tabs || []).map((layoutTabId) => getDockTabIdFromLayoutTab(layoutTabId, normalizedDockId)).filter((tabId) => tabsApi?.hasTab?.(tabId));
      if (tabsApi?.setTabOrder?.(tabIds)) return;
      for (let index = tabIds.length - 2; index >= 0; index -= 1) tabsApi?.reorderTab?.(tabIds[index], tabIds[index + 1]);
    }

    function setDebugDockVisibility(dockId, visible) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      if (normalizedDockId === "left" && deps.leftHost) deps.leftHost.hidden = visible !== true;
      if (normalizedDockId === "right") {
        if (deps.rightDock) deps.rightDock.hidden = visible !== true;
        if (deps.rightHost) deps.rightHost.hidden = visible !== true;
      }
      if (normalizedDockId === "bottom") {
        if (visible === true) deps.bottomPanel?.showPanel?.({ persist: false });
        else deps.bottomPanel?.hidePanel?.({ persist: false });
      }
    }

    function syncAiCompanionForRestoredLayout(layout) {
      let aiCompanionActive = false;
      DEBUG_DOCK_IDS.forEach((dockId) => {
        const dock = layout.docks[dockId];
        if (dock?.active === "ai-companion" && dock.tabs.includes("ai-companion") && dock.visible !== false && (dockId !== "right" || isRightSidebarVisible())) aiCompanionActive = true;
      });
      setAiCompanionDockContentOpen(aiCompanionActive);
    }

    function restoreDebugPerspectiveLayout(layoutId = getActiveDebugLayoutId(), options = {}) {
      const normalizedLayoutId = DEBUG_LAYOUT_IDS.has(layoutId) ? layoutId : getActiveDebugLayoutId();
      const layout = getDebugPerspectiveLayout(normalizedLayoutId);
      restoringDebugLayout = true;
      try {
        ensureDebugDockManager("left");
        ensureDebugDockManager("right");
        ensureDebugDockManager("bottom");
        detachAllDockableDebugTabs();
        detachPanelTabsNotInLayout(layout);
        debugDockAssignments = normalizeDebugAssignments(layout.assignments);
        DEBUG_DOCK_IDS.forEach((dockId) => {
          (layout.docks[dockId]?.tabs || []).forEach((layoutTabId) => {
            if (dockableDebugViewIds.has(layoutTabId)) {
              debugDockAssignments[layoutTabId] = dockId;
              ensureDockableDebugTab(layoutTabId, dockId, { activate: false });
            } else {
              restorePanelTabToDock(layoutTabId, dockId);
            }
          });
          applyDebugDockOrder(dockId, layout.docks[dockId]?.tabs || []);
          const activeView = layout.docks[dockId]?.active || "";
          const activeTabId = activeView ? getDockTabIdFromLayoutTab(activeView, dockId) : "";
          if (activeTabId && (dockId !== "bottom" || layout.docks[dockId]?.visible !== false) && ensureDebugDockManager(dockId)?.hasTab?.(activeTabId)) ensureDebugDockManager(dockId)?.activateTab?.(activeTabId);
        });
        if (normalizedLayoutId === "debug") {
          setDebugDockVisibility("left", layout.docks.left?.visible !== false);
          setDebugDockVisibility("right", layout.docks.right?.visible !== false);
        } else {
          setDebugDockVisibility("left", false);
          setDebugDockVisibility("right", layout.docks.right?.visible === true);
        }
        setDebugDockVisibility("bottom", layout.docks.bottom?.visible !== false);
        deps.applyPanelSizes?.(layout.sizes || {});
        deps.applySidebarLowerPanelState?.(layout.sidebarLowerPanel || {});
        syncAiCompanionForRestoredLayout(layout);
        DEBUG_DOCK_IDS.forEach(syncDebugDockEmptyState);
        debugDockTabsInitialized = true;
      } finally {
        restoringDebugLayout = false;
      }
      if (options.persist !== false) queueSaveDebugLayoutDocument();
    }
    function loadDebugDockAssignments() {
      return normalizeDebugAssignments(getDebugPerspectiveLayout().assignments || deps.loadGlobalState?.().javaDebugDockAssignments || {});
    }

    function saveDebugDockAssignments() {
      const layout = getDebugPerspectiveLayout();
      layout.assignments = normalizeDebugAssignments(debugDockAssignments);
      queueSaveDebugLayoutDocument();
    }

    function getDockableDebugViewDefinition(viewId) {
      return dockableDebugViews.find((item) => item.view === viewId) || null;
    }

    function getRightPerspectiveDefinition(viewId) {
      return getDockableDebugViewDefinition(viewId) || rightPerspectiveViews[0];
    }

    function normalizeDebugDockId(dockId, fallback = "right") {
      const key = String(dockId || fallback).toLowerCase();
      return DEBUG_DOCK_IDS.has(key) ? key : fallback;
    }

    function getDebugDockAssignment(viewId) {
      return normalizeDebugDockId(debugDockAssignments[viewId], DEFAULT_DEBUG_DOCK_ASSIGNMENTS[viewId] || "right");
    }

    function getDebugTabIdForDock(viewId, dockId) {
      return normalizeDebugDockId(dockId) === "bottom" ? `java-debug-${viewId}` : viewId;
    }

    function getDebugViewIdFromTabId(tabId) {
      const id = String(tabId || "");
      return id.startsWith("java-debug-") ? id.slice("java-debug-".length) : id;
    }

    function normalizePanelLayoutTabId(tabId) {
      const id = String(tabId || "").trim();
      if (!id) return "";
      if (id.startsWith(PANEL_LAYOUT_TAB_PREFIX)) {
        const panelTabId = id.slice(PANEL_LAYOUT_TAB_PREFIX.length).trim();
        return panelTabId ? `${PANEL_LAYOUT_TAB_PREFIX}${panelTabId}` : "";
      }
      const debugViewId = getDebugViewIdFromTabId(id);
      return dockableDebugViewIds.has(debugViewId) ? debugViewId : `${PANEL_LAYOUT_TAB_PREFIX}${id}`;
    }

    function getLayoutTabFromDockTabId(tabId) {
      return normalizePanelLayoutTabId(tabId);
    }

    function getPanelTabIdFromLayoutTab(layoutTabId) {
      const id = String(layoutTabId || "").trim();
      return id.startsWith(PANEL_LAYOUT_TAB_PREFIX) ? id.slice(PANEL_LAYOUT_TAB_PREFIX.length) : "";
    }

    function getDockTabIdFromLayoutTab(layoutTabId, dockId) {
      const id = normalizePanelLayoutTabId(layoutTabId);
      if (!id) return "";
      return dockableDebugViewIds.has(id) ? getDebugTabIdForDock(id, dockId) : getPanelTabIdFromLayoutTab(id);
    }

    function renderDockableDebugViewBody(viewId, state) {
      const selectedThread = findSelectedThread(state);
      if (viewId === "threads") return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderPanelSection("Threads", renderThreads(state), "java-debug-pane-threads", "threads", paneCountBadge((state.threads || []).length, "thread"))}`;
      if (viewId === "stack") return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderPanelSection("Call Stack", renderCallStack(state), "java-debug-pane-stack", "stack", paneCountBadge((selectedThread?.frames || []).length, "frame"))}`;
      if (viewId === "breakpoints") return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderPanelSection("Breakpoints", renderBreakpoints(state), "java-debug-pane-breakpoints", "breakpoints", paneCountBadge(countBreakpoints(state), "breakpoint"))}`;
      if (viewId === "watches") return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderPanelSection("Watches", renderWatches(state), "java-debug-pane-watches", "watches", paneCountBadge((state.watches || []).length, "watch", "watches"))}${renderValueInspector()}`;
      if (viewId === "expressions") return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderPanelSection("Expressions", renderExpressions(state), "java-debug-pane-expressions", "expressions", paneCountBadge((state.expressionHistory || []).length, "history item"))}${renderValueInspector()}`;
      if (viewId === "console") return renderConsole(state, "console");
      return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderPanelSection("Variables", renderVariablesPane(state), "java-debug-pane-variables", "variables", paneCountBadge(countDebugValues(state.variables), "value"))}${renderValueInspector()}`;
    }

    function getDebugDockLabel(dockId) {
      if (dockId === "left") return "Java debug navigator views";
      if (dockId === "bottom") return "Java debug bottom views";
      return "Java debug inspector views";
    }

    function getDebugDockHost(dockId) {
      if (dockId === "left") return perspectiveViews.get("left") || deps.leftHost;
      if (dockId === "right") return perspectiveViews.get("right") || deps.rightHost;
      return null;
    }

    function syncDebugDockEmptyState(dockId) {
      const emptyState = debugDockEmptyStates.get(dockId);
      const contentHost = debugDockContentHosts.get(dockId);
      const tabsApi = debugDockApis.get(dockId);
      if (!emptyState || !contentHost || !tabsApi) return;
      const hasTabs = tabsApi.getTabCount?.() > 0;
      emptyState.hidden = hasTabs;
      contentHost.hidden = !hasTabs;
    }

    function getDebugDockTransferData(tab) {
      const viewId = getDebugViewIdFromTabId(tab?.id);
      if (dockableDebugViewIds.has(viewId)) return { viewId };
      const panelTabId = String(tab?.id || "").trim();
      return panelTabId ? { panelTabId } : null;
    }

    function canAcceptDebugDockTransfer(data, beforeTabId, targetApi) {
      const viewId = String(data?.viewId || "");
      if (dockableDebugViewIds.has(viewId)) return true;
      const panelTabId = String(data?.panelTabId || data?.sourceTabId || "").trim();
      return !!panelTabId
        && data?.source !== targetApi
        && data?.source?.hasTab?.(panelTabId) === true
        && targetApi?.hasTab?.(panelTabId) !== true
        && typeof targetApi?.moveExternalTabHere === "function";
    }

    function handleDebugDockTransfer(data) {
      const viewId = String(data?.viewId || "");
      if (dockableDebugViewIds.has(viewId)) {
        return moveDockableDebugTab(viewId, data.targetDockId, { beforeTabId: data.beforeTabId, activate: true });
      }
      const moved = data?.target?.moveExternalTabHere?.(data, { beforeTabId: data.beforeTabId, activate: true }) === true;
      if (moved) {
        syncDebugDockEmptyState(data.sourceDockId);
        syncDebugDockEmptyState(data.targetDockId);
        captureCurrentDebugLayout();
      }
      return moved;
    }

    function getDebugDockTransferOptions(dockId) {
      return {
        dockId,
        dragGroup: PANEL_TAB_DRAG_GROUP,
        getTransferData: getDebugDockTransferData,
        canAcceptExternalTabDrop: canAcceptDebugDockTransfer,
        onExternalTabDrop: handleDebugDockTransfer
      };
    }

    function configureDebugDockTransfer(tabsApi, dockId) {
      tabsApi?.setDockTransfer?.(getDebugDockTransferOptions(dockId));
    }

    function ensureDebugDockManager(dockId) {
      const normalizedDockId = normalizeDebugDockId(dockId);
      if (debugDockApis.has(normalizedDockId)) return debugDockApis.get(normalizedDockId);
      if (normalizedDockId === "bottom") {
        subscribeBottomPanelLayoutChanges();
        configureDebugDockTransfer(deps.bottomPanel, "bottom");
        debugDockApis.set("bottom", deps.bottomPanel);
        return deps.bottomPanel;
      }
      const host = getDebugDockHost(normalizedDockId);
      if (!host) return null;
      host.textContent = "";
      const header = document.createElement("div");
      header.className = "bottom-panel-header java-debug-perspective-tab-header";
      const tabList = document.createElement("div");
      tabList.className = `bottom-panel-tab-list java-debug-perspective-tabs java-debug-${normalizedDockId}-tabs`;
      tabList.setAttribute("role", "tablist");
      tabList.setAttribute("aria-label", getDebugDockLabel(normalizedDockId));
      header.appendChild(tabList);
      const contentHost = document.createElement("div");
      contentHost.className = "bottom-panel-content-host java-debug-perspective-body";
      const emptyState = document.createElement("div");
      emptyState.className = "java-debug-perspective-empty";
      emptyState.textContent = "Drag tabs here.";
      emptyState.hidden = true;
      host.append(header, contentHost, emptyState);
      debugDockContentHosts.set(normalizedDockId, contentHost);
      debugDockEmptyStates.set(normalizedDockId, emptyState);
      const tabsApi = global.registerMarkdownViewerBottomPanelTabs?.(app, {
        panel: null,
        tabList,
        contentHost,
        searchResultsView: null,
        closeButton: null,
        tabHeader: header,
        stateKey: getDebugDockStateKey(normalizedDockId),
        moduleName: normalizedDockId === "right" ? "javaDebugRightPerspectiveTabs" : (normalizedDockId === "left" ? "javaDebugLeftPerspectiveTabs" : `javaDebug${normalizedDockId[0].toUpperCase()}${normalizedDockId.slice(1)}DockTabs`),
        defaultTabId: getDebugTabIdForDock(dockableDebugViews.find((item) => item.defaultDock === normalizedDockId)?.view || "variables", normalizedDockId),
        defaultTabOrder: dockableDebugViews.filter((item) => item.defaultDock === normalizedDockId).map((item) => getDebugTabIdForDock(item.view, normalizedDockId)),
        panelHeight: false,
        maximize: true,
        maximizeClassName: `java-debug-${normalizedDockId}-dock-maximized`,
        closeAllAction: "close",
        loadGlobalState: () => loadDebugDockTabState(normalizedDockId),
        saveGlobalState: (patch) => saveDebugDockTabState(normalizedDockId, patch),
        onStateChanged: () => captureCurrentDebugLayout(),
        onTabsEmpty: () => syncDebugDockEmptyState(normalizedDockId),

        dockTransfer: getDebugDockTransferOptions(normalizedDockId)

      });
      debugDockApis.set(normalizedDockId, tabsApi);
      syncDebugDockEmptyState(normalizedDockId);
      return tabsApi;
    }

    function findDockContainingDebugTab(viewId) {
      for (const dockId of DEBUG_DOCK_IDS) {
        const tabsApi = ensureDebugDockManager(dockId);
        if (tabsApi?.hasTab?.(getDebugTabIdForDock(viewId, dockId))) return dockId;
      }
      return "";
    }

    function findDockContainingPanelTab(tabId) {
      const panelTabId = String(tabId || "").trim();
      if (!panelTabId) return "";
      for (const dockId of DEBUG_DOCK_IDS) {
        const tabsApi = ensureDebugDockManager(dockId);
        if (tabsApi?.hasTab?.(panelTabId)) return dockId;
      }
      return "";
    }

    function isLayoutTabVisible(layoutTabId) {
      const normalizedLayoutTabId = normalizePanelLayoutTabId(layoutTabId);
      if (!normalizedLayoutTabId) return false;
      for (const dockId of DEBUG_DOCK_IDS) {
        const tabsApi = dockId === "bottom" ? deps.bottomPanel : debugDockApis.get(dockId);
        const dockTabId = getDockTabIdFromLayoutTab(normalizedLayoutTabId, dockId);
        if (tabsApi?.hasTab?.(dockTabId) && isDebugDockVisible(dockId)) return true;
      }
      return false;
    }

    function hideLayoutTab(layoutTabId) {
      const normalizedLayoutTabId = normalizePanelLayoutTabId(layoutTabId);
      if (!normalizedLayoutTabId) return false;
      for (const dockId of DEBUG_DOCK_IDS) {
        const tabsApi = dockId === "bottom" ? deps.bottomPanel : debugDockApis.get(dockId);
        const dockTabId = getDockTabIdFromLayoutTab(normalizedLayoutTabId, dockId);
        if (!tabsApi?.hasTab?.(dockTabId)) continue;
        let hidden = tabsApi.closeTab?.(dockTabId) === true;
        if (!hidden) hidden = !!tabsApi.detachTab?.(dockTabId);
        if (!hidden) return false;
        if (normalizedLayoutTabId === "ai-companion") setAiCompanionDockContentOpen(false);
        syncDebugDockEmptyState(dockId);
        captureCurrentDebugLayout();
        render(lastState);
        return true;
      }
      return false;
    }

    function moveDockablePanelTab(tabId, targetDockId, options = {}) {
      const panelTabId = String(tabId || "").trim();
      if (!panelTabId) return false;
      const normalizedTargetDockId = normalizeDebugDockId(targetDockId, "bottom");
      const targetApi = ensureDebugDockManager(normalizedTargetDockId);
      if (!targetApi) return false;
      const currentDockId = findDockContainingPanelTab(panelTabId);
      if (!currentDockId) return false;
      if (currentDockId === normalizedTargetDockId) {
        if (options.activate === true) targetApi.activateTab?.(panelTabId);
        if (options.beforeTabId) targetApi.reorderTab?.(panelTabId, options.beforeTabId);
        return true;
      }
      const sourceApi = ensureDebugDockManager(currentDockId);
      const moved = targetApi.moveExternalTabHere?.({
        source: sourceApi,
        sourceDockId: currentDockId,
        sourceTabId: panelTabId,
        panelTabId,
        target: targetApi,
        targetDockId: normalizedTargetDockId
      }, options) === true;
      if (moved) {
        syncDebugDockEmptyState(currentDockId);
        syncDebugDockEmptyState(normalizedTargetDockId);
      }
      return moved;
    }

    function createDockableDebugTabView(definition) {
      const view = document.createElement("section");
      view.className = `bottom-panel-view java-debug-panel java-debug-perspective-tab-view java-debug-perspective-tab-view-${definition.view}`;
      view.dataset.debugPerspectivePanel = definition.view;
      if (definition.external && definition.view === "ai-companion") {
        if (!deps.aiCompanionDockElement) return null;
        view.appendChild(deps.aiCompanionDockElement);
      } else {
        attachDebugViewEvents(view);
      }
      return view;
    }

    function ensureDockableDebugTab(viewId, dockId = getDebugDockAssignment(viewId), options = {}) {
      const definition = getDockableDebugViewDefinition(viewId);
      if (!definition) return null;
      const normalizedDockId = normalizeDebugDockId(dockId, definition.defaultDock || "right");
      const tabsApi = ensureDebugDockManager(normalizedDockId);
      if (!tabsApi) return null;
      let view = dockableDebugTabViews.get(definition.view);
      if (!view) {
        view = createDockableDebugTabView(definition);
        if (!view) return null;
        dockableDebugTabViews.set(definition.view, view);
      } else if (definition.external && definition.view === "ai-companion" && deps.aiCompanionDockElement?.parentElement !== view) {
        view.appendChild(deps.aiCompanionDockElement);
      }
      const tabId = getDebugTabIdForDock(definition.view, normalizedDockId);
      if (!tabsApi.hasTab?.(tabId)) {
        const buttonDataAttributes = {};
        if (normalizedDockId === "left") buttonDataAttributes.debugPerspectiveLeftView = definition.view;
        else if (normalizedDockId === "right") buttonDataAttributes.debugPerspectiveRightView = definition.view;
        else buttonDataAttributes.debugPerspectiveBottomView = definition.view;
        tabsApi.addTab({
          id: tabId,
          title: definition.title,
          icon: definition.icon,
          view,
          activate: options.activate === true,
          buttonDataAttributes,
          onActivate: () => {
            if (normalizedDockId === "left") activeLeftView = definition.view;
            if (normalizedDockId === "right") activeRightView = definition.view;
            if (definition.view === "ai-companion" && !suppressAiCompanionActivationSync) setAiCompanionDockContentOpen(true);
          },
          onClose: () => {
            if (definition.view === "ai-companion") setAiCompanionDockContentOpen(false);
            window.setTimeout(() => syncDebugDockEmptyState(normalizedDockId), 0);
          }
        });
      } else if (options.activate === true) {
        tabsApi.activateTab(tabId);
      }
      if (options.beforeTabId) tabsApi.reorderTab?.(tabId, options.beforeTabId);
      syncDebugDockEmptyState(normalizedDockId);
      return view;
    }

    function moveDockableDebugTab(viewId, targetDockId, options = {}) {
      const definition = getDockableDebugViewDefinition(viewId);
      if (!definition) return false;
      const normalizedTargetDockId = normalizeDebugDockId(targetDockId, definition.defaultDock || "right");
      const currentDockId = findDockContainingDebugTab(viewId) || getDebugDockAssignment(viewId);
      if (currentDockId && currentDockId !== normalizedTargetDockId) {
        ensureDebugDockManager(currentDockId)?.detachTab?.(getDebugTabIdForDock(viewId, currentDockId));
        syncDebugDockEmptyState(currentDockId);
      }
      debugDockAssignments[viewId] = normalizedTargetDockId;
      saveDebugDockAssignments();
      ensureDockableDebugTab(viewId, normalizedTargetDockId, options);
      captureCurrentDebugLayout();
      renderDockableDebugTabs(lastState);
      return true;
    }

    function ensureDebugPerspectiveTabs() {
      ensureDebugDockManager("left");
      ensureDebugDockManager("right");
      ensureDebugDockManager("bottom");
      restoreDebugPerspectiveLayout(getActiveDebugLayoutId(), { persist: false });
      debugDockTabsInitialized = true;
      DEBUG_DOCK_IDS.forEach(syncDebugDockEmptyState);
    }

    function ensureDefaultDebugDockTabs() {
      ensureDebugDockManager("left");
      ensureDebugDockManager("right");
      ensureDebugDockManager("bottom");
      if (!debugDockTabsInitialized) ensureDebugPerspectiveTabs();
      else DEBUG_DOCK_IDS.forEach(syncDebugDockEmptyState);
    }

    function hasRightDebugInspectorTab() {
      const rightDockApi = ensureDebugDockManager("right");
      return rightPerspectiveViews.some((item) => getDebugDockAssignment(item.view) === "right" && rightDockApi?.hasTab?.(getDebugTabIdForDock(item.view, "right")));
    }

    function activateDefaultRightDebugTab() {
      const rightDockApi = ensureDebugDockManager("right");
      const defaultRightView = rightPerspectiveViews.find((item) => getDebugDockAssignment(item.view) === "right" && rightDockApi?.hasTab?.(getDebugTabIdForDock(item.view, "right")));
      if (defaultRightView) rightDockApi?.activateTab?.(getDebugTabIdForDock(defaultRightView.view, "right"));
    }

    function setAiCompanionDockContentOpen(open) {
      deps.setAiCompanionOpen?.(open === true, { persist: false, skipRightSidebarSync: true, keepRightSidebar: true });
    }

    function showDockableDebugView(viewId) {
      const dockId = getDebugDockAssignment(viewId);
      const view = ensureDockableDebugTab(viewId, dockId, { activate: true });
      if (viewId === "threads" || viewId === "stack") activeLeftView = viewId;
      if (["variables", "breakpoints", "watches", "expressions", "ai-companion"].includes(viewId)) activeRightView = viewId;
      return view;
    }

    function showRightPerspectiveView(viewId) {
      return showDockableDebugView(viewId);
    }

    function renderDockableDebugTabs(state) {
      ensureDefaultDebugDockTabs();
      dockableDebugTabViews.forEach((view, viewId) => {
        const definition = getDockableDebugViewDefinition(viewId);
        if (definition?.external) return;
        view.innerHTML = renderDockableDebugViewBody(viewId, state);
      });
      DEBUG_DOCK_IDS.forEach(syncDebugDockEmptyState);
    }

    function renderPerspective(state) {
      renderDockableDebugTabs(state);
    }
    function renderDebugWorkspaceView(state) {
      const selectedThread = findSelectedThread(state);
      return renderDebugChrome(state, `${renderWorkspaceSessionOverview(state)}<div class="java-debug-layout java-debug-workspace-grid${maximizedPaneId ? " has-maximized-pane" : ""}"${renderWorkspaceSplitStyle()}>${renderPanelSection("Threads", renderThreads(state), "java-debug-pane-threads", "threads", paneCountBadge((state.threads || []).length, "thread"))}${renderPanelSection("Call Stack", renderCallStack(state), "java-debug-pane-stack", "stack", paneCountBadge((selectedThread?.frames || []).length, "frame"))}${renderPanelSection("Variables", renderVariablesPane(state), "java-debug-pane-variables", "variables", paneCountBadge(countDebugValues(state.variables), "value"))}${renderPanelSection("Watches", renderWatches(state), "java-debug-pane-watches", "watches", paneCountBadge((state.watches || []).length, "watch", "watches"))}${renderPanelSection("Expressions", renderExpressions(state), "java-debug-pane-expressions", "expressions", paneCountBadge((state.expressionHistory || []).length, "history item"))}${renderPanelSection("Breakpoints", renderBreakpoints(state), "java-debug-pane-breakpoints", "breakpoints", paneCountBadge(countBreakpoints(state), "breakpoint"))}${renderConsole(state, "console")}${maximizedPaneId ? "" : renderWorkspaceSplitters()}</div>${renderValueInspector()}`, "workspace");
    }

    function renderThreadsView(state) {
      return renderDebugChrome(state, `<div class="java-debug-workbench-main">${renderPanelSection("Threads", renderThreads(state), "", "", paneCountBadge((state.threads || []).length, "thread"))}</div>`, "threads");
    }

    function renderCallStackView(state) {
      const selectedThread = findSelectedThread(state);
      return renderDebugChrome(state, renderPanelSection("Call Stack", renderCallStack(state), "", "", paneCountBadge((selectedThread?.frames || []).length, "frame")), "stack");
    }

    function renderVariablesView(state) {
      return renderDebugChrome(state, renderPanelSection("Variables", renderVariablesPane(state), "", "", paneCountBadge(countDebugValues(state.variables), "value")) + renderValueInspector(), "variables");
    }

    function renderWatchesView(state) {
      return renderDebugChrome(state, renderPanelSection("Watches", renderWatches(state), "", "", paneCountBadge((state.watches || []).length, "watch", "watches")) + renderValueInspector(), "watches");
    }

    function renderExpressionsView(state) {
      return renderDebugChrome(state, renderPanelSection("Expressions", renderExpressions(state), "", "", paneCountBadge((state.expressionHistory || []).length, "history item")) + renderValueInspector(), "expressions");
    }

    function renderBreakpointsView(state) {
      return renderDebugChrome(state, renderPanelSection("Breakpoints", renderBreakpoints(state), "", "", paneCountBadge(countBreakpoints(state), "breakpoint")), "breakpoints");
    }

    function renderConsoleView(state) {
      return `${state.lastError ? `<div class="java-debug-error">${escapeHtml(state.lastError)}</div>` : ""}${renderConsole(state)}`;
    }

    function syncConsoleScroll() {
      if (!consoleAutoScroll) return;
      orderedDebugViews().forEach((view) => view.querySelectorAll?.("[data-debug-console-output]").forEach((output) => {
        output.scrollTop = output.scrollHeight;
      }));
    }

    function render(state) {
      lastState = state;
      if (!views.size && !dockableDebugTabViews.size && !perspectiveViews.size) return;
      valueActionItems = new Map();
      valueActionCounter = 0;
      viewDefinitions.forEach((definition) => {
        const view = views.get(definition.id);
        if (view) view.innerHTML = definition.render(state);
      });
      renderPerspective(state);
      window.setTimeout(syncConsoleScroll, 0);
    }

    function getAutoOpenStopKey(state) {
      if (!isStopped(state?.state)) return "";
      const location = state.location || {};
      return [state.state, state.selectedFrameId || "", location.file || "", location.sourceName || "", location.line || ""].join("|");
    }

    function requestDebugWorkspaceOpen() {
      void openView("workspace").catch?.(notifyActionError);
    }

    function followDebugSessionLifecycle(snapshot) {
      const state = snapshot || lastState;
      if (state.state === "launching") {
        if (!debugLaunchWorkspaceOpened) {
          debugLaunchWorkspaceOpened = true;
          render(state);
        }
        return;
      }
      if (["not-running", "terminated", "failed"].includes(state.state)) {
        debugLaunchWorkspaceOpened = false;
        lastAutoOpenedDebugStopKey = "";
        return;
      }
      const stopKey = getAutoOpenStopKey(state);
      if (!stopKey) {
        lastAutoOpenedDebugStopKey = "";
        return;
      }
      if (stopKey !== lastAutoOpenedDebugStopKey) {
        lastAutoOpenedDebugStopKey = stopKey;
        render(state);
      }
    }

    function attachDebugViewEvents(view) {
      view.addEventListener("click", handleClick);
      view.addEventListener("contextmenu", handleContextMenu);
      view.addEventListener("dblclick", handleDoubleClick);
      view.addEventListener("input", handleInput);
      view.addEventListener("change", handleChange);
      view.addEventListener("keydown", handleKeydown);
      view.addEventListener("focusout", handleFocusout);
      view.addEventListener("pointerdown", handlePointerdown);
    }

    function ensureViews() {
      if (!views.size) {
        viewDefinitions.forEach((definition) => {
          const view = document.createElement("section");
          view.className = `bottom-panel-view java-debug-panel java-debug-panel-${definition.id.replace(/^java-debug-?/, "") || "main"}`;
          attachDebugViewEvents(view);
          views.set(definition.id, view);
          deps.bottomPanel.addTab({ id: definition.id, title: definition.title, icon: definition.icon, view, permanent: true, activate: false });
        });
      }
      if (deps.leftHost && !perspectiveViews.has("left")) {
        deps.leftHost.classList.add("java-debug-panel", "java-debug-panel-perspective-left");
        attachDebugViewEvents(deps.leftHost);
        perspectiveViews.set("left", deps.leftHost);
      }
      if (deps.rightHost && !perspectiveViews.has("right")) {
        deps.rightHost.classList.add("java-debug-panel", "java-debug-panel-perspective-right");
        attachDebugViewEvents(deps.rightHost);
        perspectiveViews.set("right", deps.rightHost);
      }
      if (!subscribed) {
        deps.session.subscribe(render);
        subscribed = true;
      }
    }
    function resolveViewTabId(viewId) {
      const key = String(viewId || "debug").toLowerCase();
      return key === "console" ? "java-debug-console" : "";
    }

    async function open(viewId = "debug") {
      return openView(viewId);
    }

    function normalizeDebugViewId(viewId = "debug") {
      const key = String(viewId || "debug").toLowerCase();
      if (key === "debug") return "workspace";
      if (key === "callstack" || key === "call-stack") return "stack";
      return DEBUG_VIEW_SWITCHER_ITEMS.some((item) => item.view === key) ? key : "workspace";
    }

    function setPerspectiveOpen(open, options = {}) {
      ensureViews();
      const wasPerspectiveOpen = perspectiveOpen;
      const nextPerspectiveOpen = open === true;
      if (options.persist !== false && wasPerspectiveOpen !== nextPerspectiveOpen) captureCurrentDebugLayout(wasPerspectiveOpen ? "debug" : "developer");
      perspectiveOpen = nextPerspectiveOpen;
      global.document?.body?.classList.toggle("java-debug-perspective-active", perspectiveOpen);
      deps.setRailActive?.(perspectiveOpen);
      restoreDebugPerspectiveLayout(perspectiveOpen ? "debug" : "developer", { persist: options.persist !== false });
      if (perspectiveOpen) deps.setSidebarVisible?.(true, options.persist !== false, false);
      if (options.persist !== false) deps.saveGlobalState?.({ javaDebugPerspectiveOpen: perspectiveOpen });
      render(lastState);
      return perspectiveOpen;
    }

    function isAiCompanionOpen() {
      return global.document?.body?.classList?.contains?.("ai-companion-open") === true;
    }

    function removeDebugTabsFromDeveloperRightDock() {
      const rightDockApi = ensureDebugDockManager("right");
      rightPerspectiveViews.forEach((item) => rightDockApi?.detachTab?.(getDebugTabIdForDock(item.view, "right")));
      syncDebugDockEmptyState("right");
    }

    function isRightSidebarVisible() {
      return !!deps.rightDock && deps.rightDock.hidden !== true && (!deps.rightHost || deps.rightHost.hidden !== true);
    }

    function showRightSidebar(options = {}) {
      if (!deps.rightDock) return false;
      ensureViews();
      if (!perspectiveOpen) {
        removeDebugTabsFromDeveloperRightDock();
      }
      deps.rightDock.hidden = false;
      if (deps.rightHost) deps.rightHost.hidden = false;
      syncDebugDockEmptyState("right");
      const activeRightTabId = ensureDebugDockManager("right")?.getActiveTabId?.() || "";
      if (getLayoutTabFromDockTabId(activeRightTabId) === "ai-companion") setAiCompanionDockContentOpen(true);
      captureCurrentDebugLayout();
      return true;
    }

    function openAiCompanionRightSidebar(options = {}) {
      if (!showRightSidebar(options)) return false;
      suppressAiCompanionActivationSync = options.fromAiCompanion === true;
      try {
        ensureDockableDebugTab("ai-companion", "right", { activate: true });
        setAiCompanionDockContentOpen(true);
        captureCurrentDebugLayout();
      } finally {
        suppressAiCompanionActivationSync = false;
      }
      return true;
    }

    function hideRightSidebar() {
      if (deps.rightDock) deps.rightDock.hidden = true;
      if (deps.rightHost) deps.rightHost.hidden = true;
      captureCurrentDebugLayout();
      return true;
    }
    async function openPerspective(options = {}) {
      setPerspectiveOpen(true, options);
      return true;
    }

    function closePerspective(options = {}) {
      return setPerspectiveOpen(false, options);
    }

    async function openView(viewId = "debug") {
      ensureViews();
      activeDebugView = normalizeDebugViewId(viewId);
      if (activeDebugView === "stack" || activeDebugView === "threads") showDockableDebugView(activeDebugView);
      if (["variables", "breakpoints", "watches", "expressions", "console"].includes(activeDebugView)) showDockableDebugView(activeDebugView);
      if (activeDebugView === "workspace") {
        activeLeftView = "threads";
        showDockableDebugView("variables");
      }
      await openPerspective({ persist: true });
      if (activeDebugView === "console") window.setTimeout(() => queryDebugPanel("[data-debug-stdin]:not(:disabled)")?.focus?.(), 0);
      return true;
    }
    async function getPromptValue(title, value = "") {
      if (deps.prompt) return deps.prompt({ title, message: title, value, defaultValue: value, inputLabel: title });
      return null;
    }

    async function confirmClearBreakpoints() {
      if (!hasAnyBreakpointState(lastState)) return false;
      const notify = app.services?.notify || app.modules?.notificationModal || null;
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
      await deps.session.clearBreakpoints?.();
      return true;
    }

    function findBreakpoint(file, line) {
      return (lastState.breakpoints || []).find((breakpoint) => breakpoint.file === file && Number(breakpoint.line) === Number(line)) || null;
    }

    function findWatch(id) {
      return (lastState.watches || []).find((watch) => watch.id === id) || null;
    }

    function findMethodBreakpoint(id) {
      return (lastState.methodBreakpoints || []).find((breakpoint) => String(breakpoint.id || "") === String(id || "")) || null;
    }

    function findWatchAddInput(source) {
      return source?.closest?.(".java-debug-watch-toolbar")?.querySelector?.("[data-watch-add-input]") || queryDebugPanel("[data-watch-add-input]");
    }

    function focusWatchAddInput(source) {
      const input = findWatchAddInput(source);
      input?.focus?.();
      input?.select?.();
      return !!input;
    }

    function focusWatchExpressionInput(watchId) {
      const id = String(watchId || "");
      let input = null;
      for (const view of orderedDebugViews()) {
        input = Array.from(view.querySelectorAll?.("[data-watch-expression-input]") || []).find((candidate) => String(candidate.dataset.watchExpressionInput || "") === id) || null;
        if (input) break;
      }
      input?.focus?.();
      input?.select?.();
      return !!input;
    }

    async function commitWatchExpressionInput(input) {
      const watchId = input?.dataset?.watchExpressionInput;
      if (!watchId) return false;
      const original = String(input.dataset.watchExpressionOriginal || "");
      const expression = String(input.value || "").trim();
      if (!expression) { input.value = original; return false; }
      if (expression === original) return false;
      await deps.session.updateWatch?.(watchId, { expression });
      return true;
    }

    async function submitWatchAddInput(source) {
      const input = findWatchAddInput(source);
      if (!input || input.disabled) return false;
      const expression = String(input.value || "").trim();
      if (!expression) { input.focus?.(); return false; }
      await deps.session.addWatch?.(expression);
      input.value = "";
      await openView("watches");
      return true;
    }

    async function editWatchExpression(watchId) {
      await openView("watches");
      if (focusWatchExpressionInput(watchId)) return true;
      const watch = findWatch(watchId);
      const value = await getPromptValue("Edit Watch Expression", watch?.expression || "");
      if (value !== null) await deps.session.updateWatch?.(watchId, { expression: value });
      return true;
    }

    async function addWatchExpression(defaultValue = "") {
      await openView("watches");
      if (!defaultValue && focusWatchAddInput(queryDebugPanel("[data-watch-add-input]"))) return true;
      const value = await getPromptValue("Add Watch Expression", defaultValue || deps.getSelectionText?.() || "");
      if (value === null || !String(value || "").trim()) return false;
      await deps.session.addWatch?.(String(value).trim());
      return true;
    }

    async function selectThreadTopFrame(threadId, showCallStack = false) {
      const thread = findThread(threadId);
      const frameId = thread?.frames?.[0]?.id;
      if (frameId) await deps.session.selectFrame?.(frameId);
      if (showCallStack) await openView("stack");
      return true;
    }

    function formatWatchResult(watch) {
      const result = watch?.result;
      if (!result) return "";
      return result.error ? String(result.value || "") : `${result.type ? `${result.type} = ` : ""}${result.value ?? ""}`;
    }

    async function copyMethodBreakpoint(id) {
      const breakpoint = findMethodBreakpoint(id);
      await copyDebugText(breakpoint ? `${breakpoint.className}.${breakpoint.methodName}()` : "");
    }

    function appendMethodBreakpointPropertiesField(body, label, control) {
      const field = document.createElement("label");
      field.className = "java-debug-breakpoint-properties-field";
      const title = document.createElement("span");
      title.textContent = label;
      field.append(title, control);
      body.appendChild(field);
      return control;
    }

    async function editMethodBreakpoint(id) {
      const breakpoint = findMethodBreakpoint(id);
      if (!breakpoint) return false;
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (!notify?.show) {
        const className = await getPromptValue("Method Breakpoint Class", breakpoint.className || "");
        if (className === null || !String(className || "").trim()) return false;
        const methodName = await getPromptValue("Method Breakpoint Method", breakpoint.methodName || "");
        if (methodName === null || !String(methodName || "").trim()) return false;
        await deps.session.updateMethodBreakpoint?.(id, { className: String(className).trim(), methodName: String(methodName).trim() });
        return true;
      }

      const draft = {
        enabled: breakpoint.enabled !== false,
        className: String(breakpoint.className || ""),
        methodName: String(breakpoint.methodName || "")
      };
      const result = await notify.show({
        title: "Method Breakpoint Properties",
        message: "Configure this Java method breakpoint.",
        dialogClassName: "java-debug-breakpoint-properties-modal",
        dismissValue: null,
        focusSelector: "[data-java-debug-method-breakpoint-class]",
        renderBody(body) {
          body.classList.add("java-debug-breakpoint-properties");
          const enabledLabel = document.createElement("label");
          enabledLabel.className = "java-debug-breakpoint-properties-toggle";
          const enabledInput = document.createElement("input");
          enabledInput.type = "checkbox";
          enabledInput.checked = draft.enabled;
          enabledInput.addEventListener("change", () => { draft.enabled = enabledInput.checked; });
          enabledLabel.append(enabledInput, document.createTextNode("Enabled"));
          body.appendChild(enabledLabel);

          const classInput = document.createElement("input");
          classInput.type = "text";
          classInput.value = draft.className;
          classInput.placeholder = "com.example.Service";
          classInput.dataset.javaDebugMethodBreakpointClass = "true";
          classInput.addEventListener("input", () => { draft.className = classInput.value; });
          appendMethodBreakpointPropertiesField(body, "Class", classInput);

          const methodInput = document.createElement("input");
          methodInput.type = "text";
          methodInput.value = draft.methodName;
          methodInput.placeholder = "calculateTotal";
          methodInput.dataset.javaDebugMethodBreakpointMethod = "true";
          methodInput.addEventListener("input", () => { draft.methodName = methodInput.value; });
          appendMethodBreakpointPropertiesField(body, "Method", methodInput);
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "save", label: "Save", value: "save", variant: "primary" }
        ]
      });
      if (result !== "save") return false;
      const className = draft.className.trim();
      const methodName = draft.methodName.trim();
      if (!className || !methodName) {
        deps.alert?.("Method breakpoints require both a Java class and method name.");
        return false;
      }
      await deps.session.updateMethodBreakpoint?.(id, { enabled: draft.enabled, className, methodName });
      return true;
    }

    function normalizeBreakpointHitCount(value) {
      const text = String(value ?? "").trim();
      if (!text) return 0;
      if (!/^\d+$/.test(text)) throw new Error("Hit count must be a whole number of 0 or higher.");
      return Number(text);
    }
    function getBreakpointFieldTitle(field) {
      const titles = { condition: "Edit Breakpoint Condition", hitCount: "Edit Breakpoint Hit Count", logMessage: "Edit Logpoint Message" };
      return titles[field] || "Edit Breakpoint";
    }

    function getBreakpointPropertiesFocusSelector(field) {
      const selectors = {
        condition: "[data-java-debug-breakpoint-condition]",
        hitCount: "[data-java-debug-breakpoint-hit-count]",
        logMessage: "[data-java-debug-breakpoint-log-message]"
      };
      return selectors[field] || selectors.condition;
    }

    async function promptBreakpointField(file, line, field, breakpoint) {
      const value = await getPromptValue(getBreakpointFieldTitle(field), breakpoint[field] || "");
      if (value === null) return false;
      const patch = field === "hitCount" ? { hitCount: normalizeBreakpointHitCount(value) } : { [field]: String(value || "") };
      await deps.session.updateBreakpoint?.(file, line, patch);
      return true;
    }

    async function editBreakpointField(button) {
      const file = button.dataset.breakpointFile;
      const line = button.dataset.breakpointLine;
      const field = button.dataset.breakpointEdit;
      const breakpoint = findBreakpoint(file, line);
      if (!breakpoint || !field) return false;
      return editBreakpointProperties(file, line, { focusField: field });
    }

    function appendBreakpointPropertiesField(body, label, control) {
      const field = document.createElement("label");
      field.className = "java-debug-breakpoint-properties-field";
      const title = document.createElement("span");
      title.textContent = label;
      field.append(title, control);
      body.appendChild(field);
      return control;
    }

    async function editExceptionBreakpointProperties() {
      const exceptionBreakpoint = lastState.exceptionBreakpoint || { enabled: false, caught: true, uncaught: true };
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (!notify?.show) {
        await deps.session.updateExceptionBreakpoint?.({ enabled: exceptionBreakpoint.enabled === false });
        return true;
      }

      const draft = {
        enabled: exceptionBreakpoint.enabled !== false,
        caught: exceptionBreakpoint.caught !== false,
        uncaught: exceptionBreakpoint.uncaught !== false
      };
      const result = await notify.show({
        title: "Exception Breakpoint Properties",
        message: "Configure when Java exception breakpoints suspend execution.",
        dialogClassName: "java-debug-breakpoint-properties-modal",
        dismissValue: null,
        focusSelector: "[data-java-debug-exception-breakpoint-enabled]",
        renderBody(body) {
          body.classList.add("java-debug-breakpoint-properties");
          const enabledLabel = document.createElement("label");
          enabledLabel.className = "java-debug-breakpoint-properties-toggle";
          const enabledInput = document.createElement("input");
          enabledInput.type = "checkbox";
          enabledInput.checked = draft.enabled;
          enabledInput.dataset.javaDebugExceptionBreakpointEnabled = "true";
          enabledInput.addEventListener("change", () => { draft.enabled = enabledInput.checked; });
          enabledLabel.append(enabledInput, document.createTextNode("Enabled"));
          body.appendChild(enabledLabel);

          const caughtInput = document.createElement("input");
          caughtInput.type = "checkbox";
          caughtInput.checked = draft.caught;
          caughtInput.dataset.javaDebugExceptionBreakpointCaught = "true";
          caughtInput.addEventListener("change", () => { draft.caught = caughtInput.checked; });
          const caughtLabel = document.createElement("label");
          caughtLabel.className = "java-debug-breakpoint-properties-toggle";
          caughtLabel.append(caughtInput, document.createTextNode("Break on caught exceptions"));
          body.appendChild(caughtLabel);

          const uncaughtInput = document.createElement("input");
          uncaughtInput.type = "checkbox";
          uncaughtInput.checked = draft.uncaught;
          uncaughtInput.dataset.javaDebugExceptionBreakpointUncaught = "true";
          uncaughtInput.addEventListener("change", () => { draft.uncaught = uncaughtInput.checked; });
          const uncaughtLabel = document.createElement("label");
          uncaughtLabel.className = "java-debug-breakpoint-properties-toggle";
          uncaughtLabel.append(uncaughtInput, document.createTextNode("Break on uncaught exceptions"));
          body.appendChild(uncaughtLabel);
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "save", label: "Save", value: "save", variant: "primary" }
        ]
      });
      if (result !== "save") return false;
      if (draft.enabled && !draft.caught && !draft.uncaught) {
        deps.alert?.("Choose caught exceptions, uncaught exceptions, or disable the exception breakpoint.");
        return false;
      }
      await deps.session.updateExceptionBreakpoint?.({ enabled: draft.enabled, caught: draft.caught, uncaught: draft.uncaught });
      return true;
    }

    async function editBreakpointProperties(file, line, options = {}) {
      const breakpoint = findBreakpoint(file, line) || { enabled: true, condition: "", hitCount: 0, logMessage: "" };
      const sourcePreview = lineBreakpointSourcePreview({ ...breakpoint, file, line });
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (!notify?.show) {
        return promptBreakpointField(file, line, options.focusField || "condition", breakpoint);
      }

      const draft = {
        enabled: breakpoint.enabled !== false,
        condition: String(breakpoint.condition || ""),
        hitCount: breakpoint.hitCount ? String(breakpoint.hitCount) : "",
        logMessage: String(breakpoint.logMessage || "")
      };
      const result = await notify.show({
        title: `Breakpoint Properties: line ${line}`,
        message: "Configure this Java line breakpoint.",
        dialogClassName: "java-debug-breakpoint-properties-modal",
        dismissValue: null,
        focusSelector: getBreakpointPropertiesFocusSelector(options.focusField),
        renderBody(body) {
          body.classList.add("java-debug-breakpoint-properties");
          const enabledLabel = document.createElement("label");
          enabledLabel.className = "java-debug-breakpoint-properties-toggle";
          const enabledInput = document.createElement("input");
          enabledInput.type = "checkbox";
          enabledInput.checked = draft.enabled;
          enabledInput.addEventListener("change", () => { draft.enabled = enabledInput.checked; });
          enabledLabel.append(enabledInput, document.createTextNode("Enabled"));
          body.appendChild(enabledLabel);

          const conditionInput = document.createElement("input");
          conditionInput.type = "text";
          conditionInput.value = draft.condition;
          conditionInput.placeholder = "user != null && user.getId() == 123";
          conditionInput.dataset.javaDebugBreakpointCondition = "true";
          conditionInput.addEventListener("input", () => { draft.condition = conditionInput.value; });
          appendBreakpointPropertiesField(body, "Condition", conditionInput);

          const hitCountInput = document.createElement("input");
          hitCountInput.type = "number";
          hitCountInput.min = "0";
          hitCountInput.step = "1";
          hitCountInput.value = draft.hitCount;
          hitCountInput.placeholder = "Break after hit count";
          hitCountInput.dataset.javaDebugBreakpointHitCount = "true";
          hitCountInput.addEventListener("input", () => { draft.hitCount = hitCountInput.value; });
          appendBreakpointPropertiesField(body, "Hit count", hitCountInput);

          const logpointInput = document.createElement("textarea");
          logpointInput.rows = 3;
          logpointInput.value = draft.logMessage;
          logpointInput.placeholder = "Log message instead of suspending";
          logpointInput.dataset.javaDebugBreakpointLogMessage = "true";
          logpointInput.addEventListener("input", () => { draft.logMessage = logpointInput.value; });
          appendBreakpointPropertiesField(body, "Logpoint message", logpointInput);
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "save", label: "Save", value: "save", variant: "primary" }
        ]
      });
      if (result !== "save") return false;
      await deps.session.updateBreakpoint?.(file, line, {
        enabled: draft.enabled,
        condition: draft.condition.trim(),
        hitCount: normalizeBreakpointHitCount(draft.hitCount),
        logMessage: draft.logMessage.trim(),
        ...(sourcePreview ? { sourcePreview } : {})
      });
      return true;
    }
    function isJavaSourcePath(file) {
      if (typeof deps.isJavaSourcePath === "function") return deps.isJavaSourcePath(file) === true;
      return /\.java$/i.test(String(file || ""));
    }

    function isActiveBreakpointLineAvailable() {
      return typeof deps.isActiveEditorBreakpointLineAvailable !== "function" || deps.isActiveEditorBreakpointLineAvailable() === true;
    }

    function alertInvalidBreakpointLine() {
      deps.alert?.("Choose an executable Java statement line before adding a breakpoint.");
      return false;
    }

    function getActiveJavaMethodContext() {
      const activeFile = String(deps.getActiveEditorPath?.() || "").trim();
      if (!activeFile || !isJavaSourcePath(activeFile)) return null;
      const source = String(deps.getActiveEditorValue?.() || "");
      const selection = deps.getActiveEditorSelection?.() || { start: 0, end: 0 };
      return sourceContext.findJavaMethodContext?.({ source, selection, offset: selection.start }) || null;
    }

    async function addLineBreakpoint() {
      const activeFile = String(deps.getActiveEditorPath?.() || "").trim();
      const activeLine = Math.max(1, Number(deps.getActiveEditorLine?.()) || 1);
      if (activeFile && isJavaSourcePath(activeFile)) {
        if (!isActiveBreakpointLineAvailable()) return alertInvalidBreakpointLine();
        if (typeof deps.toggleBreakpoint === "function") await deps.toggleBreakpoint(activeFile, activeLine);
        else await deps.session.toggleBreakpoint?.(activeFile, activeLine);
        return true;
      }
      deps.alert?.("Open a Java source file and click the editor gutter to add or remove a line breakpoint.");
      return false;
    }

    async function configureActiveLineBreakpoint() {
      const activeFile = String(deps.getActiveEditorPath?.() || "").trim();
      const activeLine = Math.max(1, Number(deps.getActiveEditorLine?.()) || 1);
      if (activeFile && isJavaSourcePath(activeFile)) return isActiveBreakpointLineAvailable() ? editBreakpointProperties(activeFile, activeLine) : alertInvalidBreakpointLine();
      deps.alert?.("Open a Java source file before editing breakpoint properties.");
      return false;
    }

    async function configureActiveLineBreakpointField(field) {
      const activeFile = String(deps.getActiveEditorPath?.() || "").trim();
      const activeLine = Math.max(1, Number(deps.getActiveEditorLine?.()) || 1);
      if (activeFile && isJavaSourcePath(activeFile)) return isActiveBreakpointLineAvailable() ? editBreakpointProperties(activeFile, activeLine, { focusField: field }) : alertInvalidBreakpointLine();
      deps.alert?.("Open a Java source file before editing breakpoint properties.");
      return false;
    }

    async function addMethodBreakpoint() {
      if (!hasOpenProject()) {
        deps.alert?.("Open a Java project before adding method breakpoints.");
        return false;
      }
      const methodContext = getActiveJavaMethodContext() || {};
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (!notify?.show) {
        const className = await getPromptValue("Method Breakpoint Class", methodContext.className || "");
        if (className === null || !String(className || "").trim()) return false;
        const methodName = await getPromptValue("Method Breakpoint Method", methodContext.methodName || "");
        if (methodName === null || !String(methodName || "").trim()) return false;
        await deps.session.addMethodBreakpoint?.(String(className).trim(), String(methodName).trim());
        return true;
      }

      const draft = {
        className: String(methodContext.className || ""),
        methodName: String(methodContext.methodName || "")
      };
      const result = await notify.show({
        title: "Add Method Breakpoint",
        message: "Break when a Java method is entered.",
        dialogClassName: "java-debug-breakpoint-properties-modal",
        dismissValue: null,
        focusSelector: "[data-java-debug-method-breakpoint-class]",
        renderBody(body) {
          body.classList.add("java-debug-breakpoint-properties");
          const classInput = document.createElement("input");
          classInput.type = "text";
          classInput.value = draft.className;
          classInput.placeholder = "com.example.Service";
          classInput.dataset.javaDebugMethodBreakpointClass = "true";
          classInput.addEventListener("input", () => { draft.className = classInput.value; });
          appendMethodBreakpointPropertiesField(body, "Class", classInput);

          const methodInput = document.createElement("input");
          methodInput.type = "text";
          methodInput.value = draft.methodName;
          methodInput.placeholder = "calculateTotal";
          methodInput.dataset.javaDebugMethodBreakpointMethod = "true";
          methodInput.addEventListener("input", () => { draft.methodName = methodInput.value; });
          appendMethodBreakpointPropertiesField(body, "Method", methodInput);
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "add", label: "Add", value: "add", variant: "primary" }
        ]
      });
      if (result !== "add") return false;
      const className = draft.className.trim();
      const methodName = draft.methodName.trim();
      if (!className || !methodName) {
        deps.alert?.("Method breakpoints require both a Java class and method name.");
        return false;
      }
      await deps.session.addMethodBreakpoint?.(className, methodName);
      await openView("breakpoints");
      return true;
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

    async function promptPanelAttachTarget() {
      const notify = app.services?.notify || app.modules?.notificationModal;
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
      const target = await promptPanelAttachTarget();
      if (!target) return false;
      await deps.session.attach?.(target.host, target.port);
      return true;
    }

    async function evaluateFrame(frameId) {
      if (!frameId) return false;
      await deps.session.selectFrame?.(frameId);
      await openView("expressions");
      return focusExpressionInput();
    }

    async function selectFrameContext(frameId, options = {}) {
      if (!frameId) return false;
      await deps.session.selectFrame?.(frameId);
      if (options.showVariables) await openView("variables");
      return true;
    }

    async function selectFrameAndShowVariables(frameId) {
      return selectFrameContext(frameId, { showVariables: true });
    }

    async function navigateFrameToSource(frameId) {
      const frame = findFrame(frameId);
      if (!frame) return false;
      await deps.session.selectFrame?.(frameId);
      await deps.session.navigateToSource?.(frame.file, frame.line, frame.sourceName, frame.className);
      return true;
    }

    async function navigateToBreakpoint(button) {
      if (!button?.dataset?.breakpointFile || !button?.dataset?.breakpointLine) return false;
      const file = button.dataset.breakpointNavigateFile || button.dataset.breakpointFile;
      const sourceName = button.dataset.breakpointSourceName || "";
      const className = button.dataset.breakpointClassName || "";
      await deps.session.navigateToSource?.(file, button.dataset.breakpointLine, sourceName, className);
      await openView("breakpoints");
      return true;
    }
    function notifyActionError(error) {
      const message = String(error?.message || error || "Java debugger command failed.");
      return deps.alert?.(message) || app.services?.notify?.show?.({ title: "Java Debugger", message, type: "error" });
    }
    async function copyDebugText(text) {
      const value = String(text ?? "");
      if (typeof deps.copyTextToClipboard === "function") return deps.copyTextToClipboard(value);
      if (typeof deps.copyText === "function") return deps.copyText(value);
      if (global.Neutralino?.clipboard?.writeText) return global.Neutralino.clipboard.writeText(value);
      if (global.navigator?.clipboard?.writeText) return global.navigator.clipboard.writeText(value);
      throw new Error("Clipboard is unavailable.");
    }

    async function setValueForItemId(valueId) {
      if (!canEvaluateExpressions()) return false;
      const item = findValueAction(valueId);
      const expression = getValueExpression(item);
      if (!expression) {
        deps.alert?.("Select a value with a Java expression before setting it.");
        return false;
      }
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (!notify?.show) {
        const value = await getPromptValue("Set Value", String(item?.value ?? ""));
        if (value !== null) await deps.session.setValue(expression, value);
        return value !== null;
      }
      const draft = { value: String(item?.value ?? "") };
      const result = await notify.show({
        title: `Set Value: ${item?.name || expression}`,
        message: "Modify the selected Java value in the suspended stack frame.",
        dialogClassName: "java-debug-set-value-modal",
        dismissValue: null,
        focusSelector: "[data-java-debug-set-value]",
        renderBody(body) {
          body.classList.add("java-debug-set-value");
          const metadata = document.createElement("div");
          metadata.className = "java-debug-set-value-metadata";
          metadata.innerHTML = `<span>Expression</span><code>${escapeHtml(expression)}</code><span>Type</span><code>${escapeHtml(item?.type || "unknown")}</code><span>Current value</span><code>${escapeHtml(String(item?.value ?? ""))}</code>`;
          body.appendChild(metadata);
          const valueInput = document.createElement("textarea");
          valueInput.rows = 3;
          valueInput.value = draft.value;
          valueInput.dataset.javaDebugSetValue = "true";
          valueInput.placeholder = "New Java value";
          valueInput.addEventListener("input", () => { draft.value = valueInput.value; });
          appendBreakpointPropertiesField(body, "New value", valueInput);
        },
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "set", label: "Set Value", value: "set", variant: "primary" }
        ]
      });
      if (result !== "set") return false;
      await deps.session.setValue(expression, draft.value);
      return true;
    }

    async function copyValueForItemId(valueId) {
      const item = findValueAction(valueId);
      await copyDebugText(String(item?.value ?? ""));
    }

    async function copyNameForItemId(valueId) {
      const item = findValueAction(valueId);
      await copyDebugText(String(item?.name ?? ""));
    }

    async function copyExpressionForItemId(valueId) {
      const item = findValueAction(valueId);
      await copyDebugText(getValueExpression(item));
    }

    async function addWatchForItemId(valueId) {
      if (!hasOpenProject()) return false;
      const item = findValueAction(valueId);
      const expression = getValueExpression(item);
      if (!expression) return false;
      await deps.session.addWatch(expression);
      await openView("watches");
      return true;
    }

    function inspectValueForItemId(valueId) {
      inspectedValue = findValueAction(valueId);
      if (inspectedValue?.expandable && inspectedValue?.objectId && !inspectedValue.children) void deps.session.expand?.(inspectedValue.objectId).catch?.(notifyActionError);
      render(lastState);
    }

    function collapseValueChildren(values, objectId) {
      const targetId = String(objectId || "");
      return (values || []).map((item) => {
        if (String(item?.objectId || "") === targetId) return { ...item, expanded: false };
        return item?.children ? { ...item, children: collapseValueChildren(item.children, targetId) } : item;
      });
    }

    function collapseValueItem(value, objectId) {
      if (!value) return value;
      if (String(value.objectId || "") === String(objectId || "")) return { ...value, expanded: false };
      return value.children ? { ...value, children: collapseValueChildren(value.children, objectId) } : value;
    }

    function collapseRuntimeValue(objectId) {
      lastState = {
        ...lastState,
        variables: collapseValueChildren(lastState.variables, objectId),
        watches: (lastState.watches || []).map((watch) => ({ ...watch, result: collapseValueItem(watch.result, objectId) })),
        lastEvaluation: collapseValueItem(lastState.lastEvaluation, objectId)
      };
      inspectedValue = collapseValueItem(inspectedValue, objectId);
      render(lastState);
    }

    async function toggleValueExpansionForItemId(valueId) {
      const item = findValueAction(valueId);
      if (!item?.expandable || !item.objectId) return false;
      if (item.expanded && item.children) {
        collapseRuntimeValue(item.objectId);
        return true;
      }
      await deps.session.expand?.(item.objectId);
      return true;
    }

    function findWatchResultByObjectId(objectId) {
      const targetId = String(objectId || "");
      if (!targetId) return null;
      for (const watch of lastState.watches || []) {
        if (String(watch?.result?.objectId || "") === targetId) return watch.result;
      }
      return null;
    }

    async function toggleWatchExpansionForObjectId(objectId) {
      const result = findWatchResultByObjectId(objectId);
      if (!result?.expandable || !objectId) return false;
      if (result.expanded && result.children) {
        collapseRuntimeValue(objectId);
        return true;
      }
      await deps.session.expandWatch?.(objectId);
      return true;
    }

    function hideContextMenu(options = {}) {
      contextMenu?.classList.add("hidden");
      const returnFocus = contextMenuReturnFocus;
      contextMenuReturnFocus = null;
      if (options.restoreFocus === true && returnFocus?.isConnected) returnFocus.focus?.();
    }

    function ensureContextMenu() {
      if (contextMenu) return contextMenu;
      contextMenu = document.createElement("div");
      contextMenu.className = "java-debug-context-menu hidden";
      contextMenu.setAttribute("role", "menu");
      contextMenu.setAttribute("aria-label", "Debugger context menu");
      contextMenu.addEventListener("contextmenu", (event) => event.preventDefault());
      contextMenu.addEventListener("keydown", handleContextMenuKeydown);
      document.body.appendChild(contextMenu);
      document.addEventListener("click", (event) => {
        if (contextMenu?.contains?.(event.target)) return;
        hideContextMenu();
      }, true);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideContextMenu({ restoreFocus: true });
      });
      window.addEventListener("resize", hideContextMenu);
      return contextMenu;
    }

    function positionContextMenu(menu, clientX, clientY) {
      const padding = 8;
      const rect = menu.getBoundingClientRect();
      const left = Math.min(Math.max(padding, clientX), Math.max(padding, window.innerWidth - rect.width - padding));
      const top = Math.min(Math.max(padding, clientY), Math.max(padding, window.innerHeight - rect.height - padding));
      menu.style.left = `${left}px`;
      menu.style.top = `${top}px`;
    }

    function createContextMenuItem(label, icon, disabled, run) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "java-debug-context-menu-item";
      button.disabled = disabled === true;
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<i class="bi ${icon}" aria-hidden="true"></i><span>${escapeHtml(label)}</span>`;
      button.addEventListener("click", async () => {
        hideContextMenu();
        if (button.disabled) return;
        try { await run?.(); }
        catch (error) { await notifyActionError(error); }
      });
      return button;
    }

    function enabledContextMenuItems(menu = contextMenu) {
      return Array.from(menu?.querySelectorAll?.(".java-debug-context-menu-item:not(:disabled)") || []);
    }

    function focusContextMenuItem(menu, index) {
      const items = enabledContextMenuItems(menu);
      if (!items.length) return false;
      const boundedIndex = Math.max(0, Math.min(items.length - 1, index));
      items[boundedIndex]?.focus?.();
      return true;
    }

    function handleContextMenuKeydown(event) {
      if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
      const items = enabledContextMenuItems(event.currentTarget);
      if (!items.length) return;
      const currentIndex = Math.max(0, items.indexOf(document.activeElement));
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
      event.preventDefault();
      items[nextIndex]?.focus?.();
    }

    function showContextMenu(event, items) {
      const availableItems = items.filter(Boolean);
      if (!availableItems.length) return false;
      event.preventDefault();
      event.stopPropagation();
      const menu = ensureContextMenu();
      contextMenuReturnFocus = event.keyboard === true ? event.returnFocus || null : null;
      menu.innerHTML = "";
      availableItems.forEach((item) => menu.appendChild(createContextMenuItem(item.label, item.icon, item.disabled, item.run)));
      menu.classList.remove("hidden");
      positionContextMenu(menu, event.clientX, event.clientY);
      if (event.keyboard === true) window.setTimeout(() => focusContextMenuItem(menu, 0), 0);
      return true;
    }

    function showFrameContextMenu(event, frameId) {
      const frame = findFrame(frameId);
      return showContextMenu(event, [
        { label: "Navigate to Source", icon: "bi-box-arrow-up-right", run: () => navigateFrameToSource(frameId) },
        { label: "Inspect Variables", icon: "bi-diagram-3", run: () => selectFrameAndShowVariables(frameId) },
        { label: "Evaluate Expression", icon: "bi-terminal", run: () => evaluateFrame(frameId) },
        { label: "Drop to Frame", icon: "bi-arrow-counterclockwise", disabled: !canDropFrame(frame), run: async () => { await deps.session.selectFrame?.(frameId); await deps.session.dropToFrame?.(frameId); } },
        { label: "Copy Stack", icon: "bi-clipboard", run: () => copyDebugText(formatStackForFrame(frameId)) }
      ]);
    }

    function showBreakpointContextMenu(event, row) {
      const file = row?.dataset?.breakpointFile;
      const line = row?.dataset?.breakpointLine;
      const breakpoint = findBreakpoint(file, line) || {};
      const enabled = breakpoint.enabled !== false;
      const lineLabel = `Line ${line}`;
      return showContextMenu(event, [
        { label: "Navigate to Source", icon: "bi-box-arrow-up-right", run: () => navigateToBreakpoint(row) },
        { label: enabled ? `Disable Breakpoint at ${lineLabel}` : `Enable Breakpoint at ${lineLabel}`, icon: enabled ? "bi-slash-circle" : "bi-record-circle", run: () => deps.session.setBreakpointEnabled?.(file, line, !enabled) },
        { label: "Breakpoint Properties...", icon: "bi-sliders", run: () => editBreakpointProperties(file, line) },
        { label: "Edit Condition", icon: "bi-filter", run: () => editBreakpointField({ dataset: { breakpointFile: file, breakpointLine: line, breakpointEdit: "condition" } }) },
        { label: "Edit Hit Count", icon: "bi-123", run: () => editBreakpointField({ dataset: { breakpointFile: file, breakpointLine: line, breakpointEdit: "hitCount" } }) },
        { label: "Edit Logpoint", icon: "bi-chat-left-text", run: () => editBreakpointField({ dataset: { breakpointFile: file, breakpointLine: line, breakpointEdit: "logMessage" } }) },
        { label: `Remove Breakpoint at ${lineLabel}`, icon: "bi-x", run: () => deps.session.removeBreakpoint?.(file, line) }
      ]);
    }

    function showValueContextMenu(event, valueId) {
      const item = findValueAction(valueId);
      const hasExpression = !!getValueExpression(item);
      const canUseSelectedFrame = canEvaluateExpressions();
      const canAddWatch = hasOpenProject();
      return showContextMenu(event, [
        { label: "Set Value...", icon: "bi-pencil", disabled: !hasExpression || !canUseSelectedFrame, run: () => setValueForItemId(valueId) },
        { label: "Copy Value", icon: "bi-copy", run: () => copyValueForItemId(valueId) },
        { label: "Copy Name", icon: "bi-fonts", run: () => copyNameForItemId(valueId) },
        { label: "Copy Expression", icon: "bi-braces", disabled: !hasExpression, run: () => copyExpressionForItemId(valueId) },
        { label: "Add to Watches", icon: "bi-eye", disabled: !hasExpression || !canAddWatch, run: () => addWatchForItemId(valueId) },
        { label: "Inspect", icon: "bi-search", run: () => inspectValueForItemId(valueId) }
      ]);
    }

    function showThreadContextMenu(event, threadId) {
      const thread = findThread(threadId);
      const collapsed = isThreadCollapsed(thread);
      return showContextMenu(event, [
        { label: "Select Thread", icon: "bi-list-nested", disabled: !thread?.frames?.length, run: () => selectThreadTopFrame(threadId) },
        { label: "Show Call Stack", icon: "bi-layers", disabled: !thread?.frames?.length, run: () => selectThreadTopFrame(threadId, true) },
        { label: collapsed ? "Expand Stack" : "Collapse Stack", icon: collapsed ? "bi-caret-right-fill" : "bi-caret-down-fill", disabled: !threadId, run: () => toggleThread(threadId) },
        { label: "Copy Stack", icon: "bi-clipboard", run: () => copyDebugText(formatThreadStack(thread)) }
      ]);
    }

    function showWatchContextMenu(event, watchId) {
      const watch = findWatch(watchId);
      const enabled = watch?.enabled !== false;
      const resultValueId = registerWatchResultAction(watch);
      return showContextMenu(event, [
        { label: "Evaluate Now", icon: "bi-terminal", disabled: !watch?.expression || !canEvaluateExpressions(), run: () => deps.session.evaluate?.(watch.expression) },
        { label: enabled ? "Disable Watch" : "Enable Watch", icon: enabled ? "bi-eye-slash" : "bi-eye", run: () => deps.session.updateWatch?.(watchId, { enabled: !enabled }) },
        { label: "Edit Watch", icon: "bi-pencil", run: () => editWatchExpression(watchId) },
        { label: "Copy Expression", icon: "bi-braces", disabled: !watch?.expression, run: () => copyDebugText(watch.expression || "") },
        { label: "Copy Result", icon: "bi-copy", disabled: !watch?.result, run: () => copyDebugText(formatWatchResult(watch)) },
        { label: "Inspect Result", icon: "bi-search", disabled: !resultValueId, run: () => inspectValueForItemId(resultValueId) },
        { label: "Remove Watch", icon: "bi-x", run: () => deps.session.removeWatch?.(watchId) }
      ]);
    }

    function showMethodBreakpointContextMenu(event, id) {
      const breakpoint = findMethodBreakpoint(id);
      const enabled = breakpoint?.enabled !== false;
      return showContextMenu(event, [
        { label: enabled ? "Disable Method Breakpoint" : "Enable Method Breakpoint", icon: enabled ? "bi-slash-circle" : "bi-record-circle", run: () => deps.session.setMethodBreakpointEnabled?.(id, !enabled) },
        { label: "Edit Method Breakpoint", icon: "bi-pencil", run: () => editMethodBreakpoint(id) },
        { label: "Copy Method", icon: "bi-clipboard", run: () => copyMethodBreakpoint(id) },
        { label: "Remove Method Breakpoint", icon: "bi-x", run: () => deps.session.removeMethodBreakpoint?.(id) }
      ]);
    }

    function showExceptionBreakpointContextMenu(event) {
      const exceptionBreakpoint = lastState.exceptionBreakpoint || { enabled: false, caught: true, uncaught: true };
      const enabled = exceptionBreakpoint.enabled !== false;
      return showContextMenu(event, [
        { label: enabled ? "Disable Exception Breakpoint" : "Enable Exception Breakpoint", icon: enabled ? "bi-slash-circle" : "bi-exclamation-octagon", run: () => deps.session.updateExceptionBreakpoint?.({ enabled: !enabled }) },
        { label: "Exception Breakpoint Properties", icon: "bi-sliders", run: () => editExceptionBreakpointProperties() },
        { label: exceptionBreakpoint.caught !== false ? "Disable Caught Exceptions" : "Enable Caught Exceptions", icon: "bi-box-arrow-in-down-right", run: () => deps.session.updateExceptionBreakpoint?.({ caught: exceptionBreakpoint.caught === false }) },
        { label: exceptionBreakpoint.uncaught !== false ? "Disable Uncaught Exceptions" : "Enable Uncaught Exceptions", icon: "bi-exclamation-triangle", run: () => deps.session.updateExceptionBreakpoint?.({ uncaught: exceptionBreakpoint.uncaught === false }) }
      ]);
    }

    function debuggerKeyboardContextMenuEvent(event, row) {
      const rect = row?.getBoundingClientRect?.();
      const clientX = rect ? rect.left + Math.min(32, Math.max(8, rect.width / 2)) : 0;
      const clientY = rect ? rect.top + Math.min(28, Math.max(8, rect.height / 2)) : 0;
      return {
        clientX,
        clientY,
        preventDefault: () => event.preventDefault(),
        stopPropagation: () => event.stopPropagation(),
        keyboard: true,
        returnFocus: row
      };
    }

    function showDebuggerRowContextMenuFromKeyboard(event) {
      if (event.key !== "ContextMenu" && !(event.key === "F10" && event.shiftKey)) return false;
      if (isDebuggerRowNavigationBlockedTarget(event.target)) return false;
      const sourceEvent = (row) => debuggerKeyboardContextMenuEvent(event, row);
      const valueRow = event.target?.closest?.(".java-debug-value[data-value-id]");
      if (valueRow) return showValueContextMenu(sourceEvent(valueRow), valueRow.dataset.valueId);
      const watchRow = event.target?.closest?.(".java-debug-watch[data-watch-row-id]");
      if (watchRow) return showWatchContextMenu(sourceEvent(watchRow), watchRow.dataset.watchRowId);
      const frameRow = event.target?.closest?.(".java-debug-frame[data-frame-row-id], .java-debug-thread-frame[data-frame-id]");
      if (frameRow) return showFrameContextMenu(sourceEvent(frameRow), frameRow.dataset.frameRowId || frameRow.dataset.frameId);
      const threadRow = event.target?.closest?.(".java-debug-thread-card[data-thread-row-id]");
      if (threadRow) return showThreadContextMenu(sourceEvent(threadRow), threadRow.dataset.threadRowId);
      const breakpointRow = event.target?.closest?.(".java-debug-breakpoint[data-breakpoint-file][data-breakpoint-line]");
      if (breakpointRow) return showBreakpointContextMenu(sourceEvent(breakpointRow), breakpointRow);
      const methodBreakpointRow = event.target?.closest?.(".java-debug-method-breakpoint[data-method-breakpoint-row-id]");
      if (methodBreakpointRow) return showMethodBreakpointContextMenu(sourceEvent(methodBreakpointRow), methodBreakpointRow.dataset.methodBreakpointRowId);
      const exceptionBreakpointRow = event.target?.closest?.(".java-debug-exception-breakpoint[data-exception-breakpoint-row]");
      if (exceptionBreakpointRow) return showExceptionBreakpointContextMenu(sourceEvent(exceptionBreakpointRow));
      return false;
    }

    function updateWorkspaceSplit(axis, index, deltaPixels, totalPixels, startValues) {
      const values = [...startValues];
      const total = values.reduce((sum, value) => sum + value, 0) || 1;
      const rawDelta = totalPixels > 0 ? deltaPixels / totalPixels * total : 0;
      const minSize = 0.35;
      const delta = Math.min(Math.max(rawDelta, minSize - values[index]), values[index + 1] - minSize);
      values[index] += delta;
      values[index + 1] -= delta;
      workspaceSplit = axis === "columns" ? { ...workspaceSplit, columns: values } : { ...workspaceSplit, rows: values };
      markWorkspaceLayoutCustom();
      views.forEach((view) => view.querySelectorAll?.(".java-debug-workspace-grid").forEach((grid) => {
        grid.setAttribute("style", renderWorkspaceSplitStyle().slice(8, -1));
      }));
    }

    function startWorkspaceSplitDrag(event, splitter) {
      const kind = splitter.dataset.debugWorkspaceSplitter || "";
      const isColumn = kind.startsWith("column-");
      const index = Math.max(0, Number(kind.split("-")[1]) - 1);
      const grid = splitter.closest?.(".java-debug-workspace-grid");
      const rect = grid?.getBoundingClientRect?.();
      if (!rect || index < 0 || index > 1) return false;
      event.preventDefault();
      const startX = event.clientX;
      const startY = event.clientY;
      const startValues = [...(isColumn ? workspaceSplit.columns : workspaceSplit.rows)];
      const move = (moveEvent) => updateWorkspaceSplit(isColumn ? "columns" : "rows", index, isColumn ? moveEvent.clientX - startX : moveEvent.clientY - startY, isColumn ? rect.width : rect.height, startValues);
      const stop = () => {
        document.removeEventListener("pointermove", move, true);
        document.removeEventListener("pointerup", stop, true);
        saveWorkspaceSplit();
      };
      document.addEventListener("pointermove", move, true);
      document.addEventListener("pointerup", stop, true);
      return true;
    }

    function handlePointerdown(event) {
      const splitter = event.target.closest?.("[data-debug-workspace-splitter]");
      if (splitter) startWorkspaceSplitDrag(event, splitter);
    }

    function nudgeWorkspaceSplit(splitter, direction) {
      const kind = splitter?.dataset?.debugWorkspaceSplitter || "";
      const isColumn = kind.startsWith("column-");
      const index = Math.max(0, Number(kind.split("-")[1]) - 1);
      if (index < 0 || index > 1) return false;
      const values = [...(isColumn ? workspaceSplit.columns : workspaceSplit.rows)];
      const minSize = 0.35;
      const requestedStep = direction * 0.08;
      const step = Math.min(Math.max(requestedStep, minSize - values[index]), values[index + 1] - minSize);
      values[index] += step;
      values[index + 1] -= step;
      workspaceSplit = isColumn ? { ...workspaceSplit, columns: values } : { ...workspaceSplit, rows: values };
      markWorkspaceLayoutCustom();
      saveWorkspaceSplit();
      render(lastState);
      return true;
    }

    function handleDoubleClick(event) {
      void handlePanelDoubleClick(event).catch?.(notifyActionError);
    }

    function isDebuggerInteractiveTarget(target) {
      return Boolean(target?.closest?.("button, input, select, textarea, a"));
    }

    function isDebuggerRowNavigationBlockedTarget(target) {
      return Boolean(target?.closest?.("input, select, textarea, a, .java-debug-inline, .java-debug-expander"));
    }

    function focusDebuggerAdjacentRow(event) {
      if (!["ArrowUp", "ArrowDown", "Home", "End"].includes(event.key)) return false;
      if (isDebuggerRowNavigationBlockedTarget(event.target)) return false;
      const currentRow = event.target?.closest?.(DEBUG_ROW_NAVIGATION_SELECTOR);
      if (!currentRow) return false;
      const scope = currentRow.closest?.(DEBUG_ROW_NAVIGATION_SCOPE_SELECTOR) || currentRow.parentElement;
      const rows = Array.from(scope?.querySelectorAll?.(DEBUG_ROW_NAVIGATION_SELECTOR) || []);
      const currentIndex = rows.indexOf(currentRow);
      if (currentIndex < 0 || rows.length < 2) return false;
      const nextIndex = event.key === "Home" ? 0
        : event.key === "End" ? rows.length - 1
        : Math.max(0, Math.min(rows.length - 1, currentIndex + (event.key === "ArrowDown" ? 1 : -1)));
      event.preventDefault();
      rows[nextIndex]?.focus?.();
      return true;
    }

    async function handlePanelDoubleClick(event) {
      if (isDebuggerInteractiveTarget(event.target)) return false;
      const frameRow = event.target.closest?.(".java-debug-frame[data-frame-row-id], .java-debug-thread-frame[data-frame-id]");
      if (frameRow) {
        event.preventDefault();
        return navigateFrameToSource(frameRow.dataset.frameRowId || frameRow.dataset.frameId);
      }
      const valueRow = event.target.closest?.(".java-debug-value[data-value-id]");
      if (valueRow) {
        event.preventDefault();
        return toggleValueExpansionForItemId(valueRow.dataset.valueId);
      }
      const methodBreakpointRow = event.target.closest?.(".java-debug-method-breakpoint[data-method-breakpoint-row-id]");
      if (methodBreakpointRow) {
        event.preventDefault();
        return editMethodBreakpoint(methodBreakpointRow.dataset.methodBreakpointRowId);
      }
      const exceptionBreakpointRow = event.target.closest?.(".java-debug-exception-breakpoint[data-exception-breakpoint-row]");
      if (exceptionBreakpointRow) {
        event.preventDefault();
        return editExceptionBreakpointProperties();
      }
      const watchRow = event.target.closest?.(".java-debug-watch[data-watch-object-id]");
      if (!watchRow) return false;
      event.preventDefault();
      return toggleWatchExpansionForObjectId(watchRow.dataset.watchObjectId);
    }

    function handleContextMenu(event) {
      const valueRow = event.target.closest?.(".java-debug-value[data-value-id]");
      if (valueRow && showValueContextMenu(event, valueRow.dataset.valueId)) return;
      const watchRow = event.target.closest?.(".java-debug-watch[data-watch-row-id]");
      if (watchRow && showWatchContextMenu(event, watchRow.dataset.watchRowId)) return;
      const frameRow = event.target.closest?.(".java-debug-frame[data-frame-row-id], .java-debug-thread-frame[data-frame-id]");
      if (frameRow && showFrameContextMenu(event, frameRow.dataset.frameRowId || frameRow.dataset.frameId)) return;
      const threadRow = event.target.closest?.(".java-debug-thread-card[data-thread-row-id]");
      if (threadRow && showThreadContextMenu(event, threadRow.dataset.threadRowId)) return;
      const breakpointRow = event.target.closest?.(".java-debug-breakpoint[data-breakpoint-file][data-breakpoint-line]");
      if (breakpointRow && showBreakpointContextMenu(event, breakpointRow)) return;
      const methodBreakpointRow = event.target.closest?.(".java-debug-method-breakpoint[data-method-breakpoint-row-id]");
      if (methodBreakpointRow && showMethodBreakpointContextMenu(event, methodBreakpointRow.dataset.methodBreakpointRowId)) return;
      const exceptionBreakpointRow = event.target.closest?.(".java-debug-exception-breakpoint[data-exception-breakpoint-row]");
      if (exceptionBreakpointRow && showExceptionBreakpointContextMenu(event)) return;
      hideContextMenu();
    }

    async function handleClick(event) {
      try { await handlePanelClick(event); }
      catch (error) { await notifyActionError(error); }
    }

    async function handlePanelClick(event) {
      const actionButton = event.target.closest?.("[data-debug-action]");
      const action = actionButton?.dataset.debugAction;
      if (action) {
        if (actionButton.disabled) return;
        if (action === "start") { if (isActive(lastState.state)) return; await startDebugging(); }
        else if (action === "attach") { if (isActive(lastState.state)) return; await attachToJvm(); }
        else if (action === "resume") await deps.session.resume();
        else if (action === "pause") await deps.session.pause();
        else if (action === "stop") await deps.session.stop();
        else if (action === "restart") await deps.session.restart();
        else if (action === "step-over") { if (!canEvaluateExpressions()) return; await deps.session.stepOver(); }
        else if (action === "step-into") { if (!canEvaluateExpressions()) return; await deps.session.stepInto(); }
        else if (action === "step-out") { if (!canEvaluateExpressions()) return; await deps.session.stepOut(); }
        else if (action === "drop-frame") { if (!canDropSelectedFrame(lastState)) return; await deps.session.dropToFrame(); }
        else if (action === "run-to-cursor") { if (!canEvaluateExpressions()) return; await deps.runToCursor?.(); }
        else if (action === "toggle-line-breakpoint") await addLineBreakpoint();
        else if (action === "disable-breakpoints") await deps.session.setBreakpointsEnabled?.(!hasEnabledBreakpointState(lastState));
        else if (action === "mute-breakpoints") await deps.session.setBreakpointsMuted?.(!lastState.breakpointsMuted);
        else if (action === "view-threads") await openView("threads");
        else if (action === "view-stack") await openView("stack");
        else if (action === "view-variables") await openView("variables");
        else if (action === "view-watches") await openView("watches");
        else if (action === "view-expressions") await openView("expressions");
        else if (action === "view-breakpoints") await openView("breakpoints");
        else if (action === "view-console") await openView("console");
        else if (action === "reset-layout") resetDebugWorkspaceLayout();
        else if (action === "enable-all-breakpoints") await deps.session.setBreakpointsEnabled?.(true);
        else if (action === "disable-all-breakpoints") await deps.session.setBreakpointsEnabled?.(false);
        else if (action === "clear-breakpoints") await clearBreakpointsWithConfirmation();
        else if (action === "add-line-breakpoint") await addLineBreakpoint();
        else if (action === "configure-line-breakpoint") await configureActiveLineBreakpoint();
        else if (action === "configure-conditional-breakpoint") await configureActiveLineBreakpointField("condition");
        else if (action === "configure-hit-count-breakpoint") await configureActiveLineBreakpointField("hitCount");
        else if (action === "configure-logpoint") await configureActiveLineBreakpointField("logMessage");
        else if (action === "add-method-breakpoint") await addMethodBreakpoint();
        else if (action === "clear-console") await deps.session.clearConsole?.();
        else if (action === "copy-console") {
          const entries = lastState.consoleEntries || [];
          await copyDebugText(entries.length ? formatConsoleEntries(filteredConsoleEntries(entries)) : (lastState.console || ""));
        }
        else if (action === "select-console") selectConsoleOutput(actionButton);
        else if (action === "send-stdin") await sendConsoleInput(actionButton);
        else if (action === "focus-expression") focusExpressionInput();
        else if (action === "evaluate") { if (!canEvaluateExpressions()) return; const value = findExpressionInput(actionButton)?.value || ""; await deps.session.evaluate(value); }
        else if (action === "add-watch") { const value = findExpressionInput(actionButton)?.value || ""; if (value) { await deps.session.addWatch(value); await openView("watches"); } else await addWatchExpression(); }
        else if (action === "add-watch-expression") { if (!await submitWatchAddInput(actionButton)) await addWatchExpression(); }
        else if (action === "refresh-variables") { if (!canEvaluateExpressions()) return; await deps.session.requestVariables?.(); }
        else if (action === "copy-variables") { if (!lastState.variables?.length) return; await copyDebugText(formatVariableTree(lastState.variables).join("\n")); }
        else if (action === "refresh-watches") { if (!canEvaluateExpressions()) return; await deps.session.refreshWatches?.(); }
        return;
      }
      const watchAddSubmit = event.target.closest?.("[data-watch-add-submit]");
      if (watchAddSubmit) { await submitWatchAddInput(watchAddSubmit); return; }
      const expressionHistoryRun = event.target.closest?.("[data-expression-history-run]")?.dataset.expressionHistoryRun;
      if (expressionHistoryRun) { if (canEvaluateExpressions()) await deps.session.evaluate(expressionHistoryRun); return; }
      const expressionHistoryWatch = event.target.closest?.("[data-expression-history-watch]")?.dataset.expressionHistoryWatch;
      if (expressionHistoryWatch) { await deps.session.addWatch?.(expressionHistoryWatch); await openView("watches"); return; }
      const expressionHistoryCopy = event.target.closest?.("[data-expression-history-copy]")?.dataset.expressionHistoryCopy;
      if (expressionHistoryCopy) { await copyDebugText(expressionHistoryCopy); return; }
      const evaluationExpandObject = event.target.closest?.("[data-evaluation-expand-object]")?.dataset.evaluationExpandObject;
      if (evaluationExpandObject) { await deps.session.expand?.(evaluationExpandObject); return; }
      const consoleFilter = event.target.closest?.("[data-debug-console-filter]")?.dataset.debugConsoleFilter;
      if (consoleFilter && toggleConsoleFilter(consoleFilter)) return;
      const perspectiveView = event.target.closest?.("[data-debug-perspective-view]")?.dataset.debugPerspectiveView;
      if (perspectiveView) { await openView(perspectiveView); return; }
      const perspectiveRightView = event.target.closest?.("[data-debug-perspective-right-view]")?.dataset.debugPerspectiveRightView;
      if (perspectiveRightView) { showRightPerspectiveView(perspectiveRightView); return; }
      const debugView = event.target.closest?.("[data-debug-view]")?.dataset.debugView;
      if (debugView) { await openView(debugView); return; }
      const paneToggle = event.target.closest?.("[data-debug-pane-toggle]")?.dataset.debugPaneToggle;
      if (paneToggle) { toggleWorkspacePane(paneToggle); return; }
      const paneMaximize = event.target.closest?.("[data-debug-pane-maximize]")?.dataset.debugPaneMaximize;
      if (paneMaximize) { toggleMaximizedWorkspacePane(paneMaximize); return; }
      const threadToggle = event.target.closest?.("[data-thread-toggle]")?.dataset.threadToggle;
      if (threadToggle) { toggleThread(threadToggle); return; }
      const copyAllThreadStacks = event.target.closest?.("[data-copy-all-thread-stacks]");
      if (copyAllThreadStacks) { await copyDebugText(formatAllThreadStacks()); return; }
      if (event.target.closest?.("[data-expand-all-thread-stacks]")) { setAllThreadsCollapsed(false); return; }
      if (event.target.closest?.("[data-collapse-all-thread-stacks]")) { setAllThreadsCollapsed(true); return; }
      const copyThreadStack = event.target.closest?.("[data-copy-thread-stack]")?.dataset.copyThreadStack;
      if (copyThreadStack) { await copyDebugText(formatThreadStack(findThread(copyThreadStack))); return; }
      const threadSelect = event.target.closest?.("[data-thread-select]")?.dataset.threadSelect;
      if (threadSelect) { await selectThreadTopFrame(threadSelect); return; }
      const frameNavigate = event.target.closest?.("[data-frame-navigate]")?.dataset.frameNavigate;
      if (frameNavigate) { await navigateFrameToSource(frameNavigate); return; }
      const frameEvaluate = event.target.closest?.("[data-frame-evaluate]")?.dataset.frameEvaluate;
      if (frameEvaluate) { await evaluateFrame(frameEvaluate); return; }
      const frameDrop = event.target.closest?.("[data-frame-drop]")?.dataset.frameDrop;
      if (frameDrop) { if (!canDropFrame(findFrame(frameDrop))) return; await deps.session.selectFrame?.(frameDrop); await deps.session.dropToFrame?.(frameDrop); return; }
      const frameCopy = event.target.closest?.("[data-frame-copy]")?.dataset.frameCopy;
      if (frameCopy) { await copyDebugText(formatStackForFrame(frameCopy)); return; }
      const frame = event.target.closest?.("[data-frame-id]")?.dataset.frameId;
      if (frame) { await selectFrameContext(frame); return; }
      const watchToggle = event.target.closest?.("[data-watch-toggle]");
      if (watchToggle) { await deps.session.updateWatch?.(watchToggle.dataset.watchToggle, { enabled: watchToggle.dataset.watchEnabled !== "true" }); return; }
      const watchEdit = event.target.closest?.("[data-watch-edit]")?.dataset.watchEdit;
      if (watchEdit) { await editWatchExpression(watchEdit); return; }
      const watchExpand = event.target.closest?.("[data-watch-expand]")?.dataset.watchExpand;
      if (watchExpand) { await toggleWatchExpansionForObjectId(watchExpand); return; }
      const objectButton = event.target.closest?.("[data-object-id]");
      const objectId = objectButton?.dataset.objectId;
      if (objectId) {
        const valueRow = objectButton.closest?.(".java-debug-value[data-value-id]");
        if (valueRow) await toggleValueExpansionForItemId(valueRow.dataset.valueId);
        else await deps.session.expand(objectId);
        return;
      }
            const exceptionToggle = event.target.closest?.("[data-exception-breakpoint-toggle]");
      if (exceptionToggle) { await deps.session.updateExceptionBreakpoint?.({ enabled: exceptionToggle.dataset.exceptionBreakpointEnabled !== "true" }); return; }
      const exceptionProperties = event.target.closest?.("[data-exception-breakpoint-properties]");
      if (exceptionProperties) { await editExceptionBreakpointProperties(); return; }
      const exceptionKind = event.target.closest?.("[data-exception-breakpoint-kind]");
      if (exceptionKind) { await deps.session.updateExceptionBreakpoint?.({ [exceptionKind.dataset.exceptionBreakpointKind]: exceptionKind.dataset.exceptionBreakpointEnabled !== "true" }); return; }
      const methodToggle = event.target.closest?.("[data-method-breakpoint-toggle]");
      if (methodToggle) { await deps.session.setMethodBreakpointEnabled?.(methodToggle.dataset.methodBreakpointToggle, methodToggle.dataset.methodBreakpointEnabled !== "true"); return; }
      const methodEdit = event.target.closest?.("[data-method-breakpoint-edit]")?.dataset.methodBreakpointEdit;
      if (methodEdit) { await editMethodBreakpoint(methodEdit); return; }
      const methodCopy = event.target.closest?.("[data-method-breakpoint-copy]")?.dataset.methodBreakpointCopy;
      if (methodCopy) { await copyMethodBreakpoint(methodCopy); return; }
      const methodRemove = event.target.closest?.("[data-method-breakpoint-remove]")?.dataset.methodBreakpointRemove;
      if (methodRemove) { await deps.session.removeMethodBreakpoint?.(methodRemove); return; }
      const breakpointToggle = event.target.closest?.("[data-breakpoint-toggle]");
      if (breakpointToggle) { await deps.session.setBreakpointEnabled?.(breakpointToggle.dataset.breakpointFile, breakpointToggle.dataset.breakpointLine, breakpointToggle.dataset.breakpointEnabled !== "true"); return; }
      const breakpointNavigate = event.target.closest?.("[data-breakpoint-navigate]");
      if (breakpointNavigate) { await navigateToBreakpoint(breakpointNavigate); return; }
      const breakpointProperties = event.target.closest?.("[data-breakpoint-properties]");
      if (breakpointProperties) { await editBreakpointProperties(breakpointProperties.dataset.breakpointFile, breakpointProperties.dataset.breakpointLine); return; }
      const breakpointEdit = event.target.closest?.("[data-breakpoint-edit]");
      if (breakpointEdit) { await editBreakpointField(breakpointEdit); return; }
      const breakpointRow = event.target.closest?.(".java-debug-breakpoint[data-breakpoint-file][data-breakpoint-line]");
      if (breakpointRow && !event.target.closest?.("button, input, select, textarea")) { await navigateToBreakpoint(breakpointRow); return; }
      const breakpointRemove = event.target.closest?.("[data-breakpoint-remove]");
      if (breakpointRemove) { await deps.session.removeBreakpoint?.(breakpointRemove.dataset.breakpointFile, breakpointRemove.dataset.breakpointLine); return; }
      const setValueButton = event.target.closest?.("[data-set-value-id]");
      if (setValueButton) { await setValueForItemId(setValueButton.dataset.setValueId); return; }
      const copyValueButton = event.target.closest?.("[data-copy-value-id]");
      if (copyValueButton) { await copyValueForItemId(copyValueButton.dataset.copyValueId); return; }
      const copyNameButton = event.target.closest?.("[data-copy-name-id]");
      if (copyNameButton) { await copyNameForItemId(copyNameButton.dataset.copyNameId); return; }
      const copyExpressionButton = event.target.closest?.("[data-copy-expression-id]");
      if (copyExpressionButton) { await copyExpressionForItemId(copyExpressionButton.dataset.copyExpressionId); return; }
      const addWatchValueButton = event.target.closest?.("[data-add-watch-value-id]");
      if (addWatchValueButton) { await addWatchForItemId(addWatchValueButton.dataset.addWatchValueId); return; }
      const inspectValueButton = event.target.closest?.("[data-inspect-value-id]");
      if (inspectValueButton) { inspectValueForItemId(inspectValueButton.dataset.inspectValueId); return; }
      const inspectExpandObject = event.target.closest?.("[data-inspect-expand-object]")?.dataset.inspectExpandObject;
      if (inspectExpandObject) { await deps.session.expand?.(inspectExpandObject); return; }
      if (event.target.closest?.("[data-close-inspector]")) { inspectedValue = null; render(lastState); return; }
      const removeWatch = event.target.closest?.("[data-remove-watch]")?.dataset.removeWatch;
      if (removeWatch) await deps.session.removeWatch(removeWatch);
    }

    function restoreSearchInput(selector, value, selectionStart = value.length, selectionEnd = selectionStart) {
      const input = queryDebugPanel(selector);
      if (!input) return;
      input.value = value;
      input.focus?.();
      input.setSelectionRange?.(selectionStart, selectionEnd);
    }

    function renderAndRestoreSearchInput(selector, value, selectionStart = value.length, selectionEnd = selectionStart) {
      render(lastState);
      restoreSearchInput(selector, value, selectionStart, selectionEnd);
      window.setTimeout(() => restoreSearchInput(selector, value, selectionStart, selectionEnd), 0);
    }

    function handleInput(event) {
      if (event.target?.matches?.("[data-debug-console-search]")) {
        consoleSearchQuery = event.target.value || "";
        renderAndRestoreSearchInput("[data-debug-console-search]", consoleSearchQuery, event.target.selectionStart ?? consoleSearchQuery.length, event.target.selectionEnd ?? consoleSearchQuery.length);
      } else if (event.target?.matches?.("[data-debug-breakpoint-search]")) {
        breakpointSearchQuery = event.target.value || "";
        renderAndRestoreSearchInput("[data-debug-breakpoint-search]", breakpointSearchQuery, event.target.selectionStart ?? breakpointSearchQuery.length, event.target.selectionEnd ?? breakpointSearchQuery.length);
      } else if (event.target?.matches?.("[data-debug-console-autoscroll]")) {
        consoleAutoScroll = event.target.checked === true;
        if (consoleAutoScroll) syncConsoleScroll();
      }
    }

    function handleChange(event) {
      if (event.target?.matches?.("[data-debug-workspace-layout]")) {
        applyDebugWorkspaceLayoutPreset(event.target.value || "eclipse");
        return;
      }
      if (event.target?.matches?.("[data-debug-session-select]")) {
        const sessionId = event.target.value || "";
        if (sessionId) void deps.session.selectSession?.(sessionId);
        return;
      }
      if (!event.target?.matches?.("[data-call-stack-thread-select]")) return;
      const threadId = event.target.value || "";
      if (threadId) void selectThreadTopFrame(threadId).catch?.(notifyActionError);
    }

    function handleFocusout(event) {
      if (!event.target?.matches?.("[data-watch-expression-input]")) return;
      void commitWatchExpressionInput(event.target).catch?.(notifyActionError);
    }

    function handleKeydown(event) {
      const splitter = event.target?.closest?.("[data-debug-workspace-splitter]");
      if (splitter && ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(event.key)) {
        const isColumn = String(splitter.dataset.debugWorkspaceSplitter || "").startsWith("column-");
        const direction = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : -1;
        if ((isColumn && ["ArrowLeft", "ArrowRight"].includes(event.key)) || (!isColumn && ["ArrowUp", "ArrowDown"].includes(event.key))) {
          event.preventDefault();
          nudgeWorkspaceSplit(splitter, direction);
          return;
        }
      }
      if (showDebuggerRowContextMenuFromKeyboard(event)) return;
      if (focusDebuggerAdjacentRow(event)) return;
      const valueRow = event.target?.closest?.(".java-debug-value[data-value-id]");
      if (valueRow && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        void toggleValueExpansionForItemId(valueRow.dataset.valueId).catch?.(notifyActionError);
        return;
      }
      if (event.target?.matches?.("[data-watch-add-input]")) {
        if (event.key === "Enter") {
          event.preventDefault();
          void submitWatchAddInput(event.target).catch?.(notifyActionError);
        }
        return;
      }
      if (event.target?.matches?.("[data-watch-expression-input]")) {
        if (event.key === "Enter") {
          event.preventDefault();
          event.target.blur?.();
        } else if (event.key === "Escape") {
          event.preventDefault();
          event.target.value = event.target.dataset.watchExpressionOriginal || "";
          event.target.blur?.();
        }
        return;
      }
      const watchRow = event.target?.closest?.(".java-debug-watch[data-watch-object-id]");
      if (watchRow && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        void toggleWatchExpansionForObjectId(watchRow.dataset.watchObjectId).catch?.(notifyActionError);
        return;
      }
      const threadRow = event.target?.closest?.(".java-debug-thread-card[data-thread-row-id]");
      if (threadRow && !isDebuggerInteractiveTarget(event.target)) {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          void selectThreadTopFrame(threadRow.dataset.threadRowId).catch?.(notifyActionError);
          return;
        }
        if (event.key === "ArrowRight" || event.key === "ArrowLeft") {
          event.preventDefault();
          setThreadCollapsed(threadRow.dataset.threadRowId, event.key === "ArrowLeft");
          return;
        }
      }
      const breakpointRow = event.target?.closest?.(".java-debug-breakpoint[data-breakpoint-file][data-breakpoint-line]");
      if (breakpointRow && !isDebuggerInteractiveTarget(event.target) && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        void navigateToBreakpoint(breakpointRow).catch?.(notifyActionError);
        return;
      }
      const methodBreakpointRow = event.target?.closest?.(".java-debug-method-breakpoint[data-method-breakpoint-row-id]");
      if (methodBreakpointRow && !isDebuggerInteractiveTarget(event.target) && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        void editMethodBreakpoint(methodBreakpointRow.dataset.methodBreakpointRowId).catch?.(notifyActionError);
        return;
      }
      const exceptionBreakpointRow = event.target?.closest?.(".java-debug-exception-breakpoint[data-exception-breakpoint-row]");
      if (exceptionBreakpointRow && !isDebuggerInteractiveTarget(event.target) && (event.key === "Enter" || event.key === " ")) {
        event.preventDefault();
        void editExceptionBreakpointProperties().catch?.(notifyActionError);
        return;
      }
      if (event.target?.matches?.("[data-debug-expression]")) {
        if (event.key === "Enter") {
          event.preventDefault();
          if (!canEvaluateExpressions()) return;
          expressionHistoryIndex = -1;
          void deps.session.evaluate(event.target.value || "").catch?.(notifyActionError);
        } else if (event.key === "ArrowUp" || event.key === "ArrowDown") {
          if (navigateExpressionHistory(event.target, event.key === "ArrowUp" ? -1 : 1)) event.preventDefault();
        }
        return;
      }
      if (event.key !== "Enter" || !event.target?.matches?.("[data-debug-stdin]")) return;
      event.preventDefault();
      void sendConsoleInput(event.target).catch?.(notifyActionError);
    }

    function navigateExpressionHistory(input, direction) {
      const history = lastState.expressionHistory || [];
      if (!history.length) return false;
      if (expressionHistoryIndex < 0) expressionHistoryIndex = direction < 0 ? 0 : history.length - 1;
      else expressionHistoryIndex = Math.max(0, Math.min(history.length - 1, expressionHistoryIndex + direction));
      input.value = history[expressionHistoryIndex] || "";
      input.setSelectionRange?.(input.value.length, input.value.length);
      return true;
    }

    function findConsoleElement(source, selector) {
      return source?.closest?.(".java-debug-console")?.querySelector?.(selector) || queryDebugPanel(selector);
    }

    async function sendConsoleInput(source) {
      const input = findConsoleElement(source, "[data-debug-stdin]");
      if (lastState.canAcceptStdin !== true || !isActive(lastState.state)) return false;
      const value = input?.value || "";
      if (!value) return false;
      const sent = await deps.session.sendStdin?.(`${value}\n`);
      if (sent !== false) input.value = "";
      return sent !== false;
    }

    function selectConsoleOutput(source) {
      const output = findConsoleElement(source, "[data-debug-console-output]");
      if (!output) return false;
      const selection = window.getSelection?.();
      const range = document.createRange();
      range.selectNodeContents(output);
      selection?.removeAllRanges?.();
      selection?.addRange?.(range);
      return true;
    }
    function focusExpressionInput() {
      ensureViews();
      activeRightView = "expressions";
      setPerspectiveOpen(true);
      render(lastState);
      const input = queryDebugPanel("[data-debug-expression]");
      input?.focus?.();
      input?.select?.();
      return !!input;
    }
    deps.session.subscribe?.(followDebugSessionLifecycle);

    const api = { open, openView, openPerspective, closePerspective, showRightSidebar, openAiCompanionRightSidebar, hideRightSidebar, isRightSidebarVisible, isLayoutTabVisible, hideLayoutTab, captureCurrentLayout: captureCurrentDebugLayout, captureCurrentLayoutSizes, isPerspectiveOpen: () => perspectiveOpen, restoreForProject, getLayoutPath: getDebugLayoutPath, render, focusExpressionInput, addWatchExpression, addMethodBreakpoint, configureActiveLineBreakpoint, configureActiveLineBreakpointField, editExceptionBreakpointProperties, resetLayout: resetDebugWorkspaceLayout, applyLayoutPreset: applyDebugWorkspaceLayoutPreset, getActiveView: () => activeDebugView };
    app.registerModule?.("javaDebugPanel", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugPanel = registerMarkdownViewerJavaDebugPanel;
})(typeof window !== "undefined" ? window : globalThis);
