// Java editor Source actions for debugger workflows.
(function(global) {
  "use strict";

  function registerMarkdownViewerJavaDebugEditorActions(app, deps = {}) {
    let contextMenu = null;
    const sourceContext = deps.sourceContext || global.MarkdownViewerJavaDebugSourceContext || {};

    function escapeHtml(value) {
      return String(value ?? "").replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
    }

    function getFilePath(context) { return String(context.activeTab?.sourceFilePath || context.activeTab?.sourceFileName || "").replace(/\\/g, "/"); }
    function getSelectionText(context) { const selection = context.selection || {}; return String(context.source || "").slice(selection.start || 0, selection.end || 0).trim(); }
    function getLine(context) { const source = String(context.source || ""); const offset = Number(context.selection?.start || 0); return source.slice(0, Math.max(0, offset)).split("\n").length; }
    function getOffset(context) {
      const source = String(context.source || "");
      return Math.max(0, Math.min(source.length, Number(context.selection?.start || 0)));
    }
    function isJava(context) { return /\.java$/i.test(getFilePath(context)); }
    function getMainClass(context) {
      const filePath = getFilePath(context);
      if (!/\.java$/i.test(filePath)) return null;
      return deps.mainClassFinder?.inspectSource?.(context.source || "", filePath) || null;
    }
    function isStopped() {
      const state = String(deps.session?.getState?.().state || "");
      return state === "paused" || state === "stopped-at-breakpoint";
    }
    function canEvaluate() {
      const state = deps.session?.getState?.() || {};
      return isStopped() && Boolean(state.selectedFrameId);
    }
    function normalizePath(path) { return String(path || "").replace(/\\/g, "/").replace(/\/+/g, "/").toLowerCase(); }
    function pathsMatch(left, right) {
      const normalizedLeft = normalizePath(left);
      const normalizedRight = normalizePath(right);
      if (!normalizedLeft || !normalizedRight) return false;
      return normalizedLeft === normalizedRight || normalizedLeft.endsWith(`/${normalizedRight}`) || normalizedRight.endsWith(`/${normalizedLeft}`);
    }

    function findBreakpoint(file, line) {
      const breakpoints = deps.session?.getState?.().breakpoints || [];
      return breakpoints.find((breakpoint) => pathsMatch(file, breakpoint.file) && Number(breakpoint.line) === Number(line)) || null;
    }

    function notifyError(error) {
      deps.alert?.(error?.message || error || "Java debugger command failed.");
    }

    async function toggleBreakpoint(file, line) {
      if (typeof deps.toggleBreakpoint === "function") return deps.toggleBreakpoint(file, line);
      return deps.session.toggleBreakpoint?.(file, line);
    }
    async function getPromptValue(title, value = "") {
      if (deps.prompt) return deps.prompt({ title, message: title, value, defaultValue: value, inputLabel: title });
      return null;
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

    async function promptBreakpointField(file, line, field, currentValue) {
      const value = await getPromptValue(getBreakpointFieldTitle(field), currentValue || "");
      if (value === null) return false;
      const patch = field === "hitCount" ? { hitCount: normalizeBreakpointHitCount(value) } : { [field]: String(value || "") };
      await deps.session.updateBreakpoint?.(file, line, patch);
      return true;
    }

    async function editBreakpointField(file, line, field, _title, currentValue) {
      const breakpoint = findBreakpoint(file, line);
      if (!breakpoint) return false;
      return editBreakpointProperties(file, line, { focusField: field, fallbackValue: currentValue });
    }

    async function addBreakpointWithField(file, line, field, _title) {
      return editBreakpointProperties(file, line, { focusField: field });
    }

    function findJavaMethodContext(context) {
      return sourceContext.findJavaMethodContext?.({ source: context.source, offset: getOffset(context), selection: context.selection }) || null;
    }

    function getBreakpointSourcePreview(context, line = getLine(context)) {
      return sourceContext.getJavaLinePreview?.({ source: context.source || "", line }) || "";
    }

    function getActiveBreakpointSourcePreview(file, line) {
      const activePath = String(deps.getActiveEditorPath?.() || "").replace(/\\/g, "/");
      if (!pathsMatch(activePath, file)) return "";
      return sourceContext.getJavaLinePreview?.({ source: deps.getActiveEditorValue?.() || "", line }) || "";
    }

    function withBreakpointSourcePreview(context, options = {}) {
      const sourcePreview = getBreakpointSourcePreview(context);
      return { ...options, ...(sourcePreview ? { sourcePreview } : {}) };
    }

    function withActiveBreakpointSourcePreview(file, line, options = {}) {
      const sourcePreview = getActiveBreakpointSourcePreview(file, line);
      return { ...options, ...(sourcePreview ? { sourcePreview } : {}) };
    }

    function isBreakpointLineAvailable(file, line, source = "") {
      if (findBreakpoint(file, line)) return true;
      if (typeof deps.isBreakpointLineAvailable === "function") return deps.isBreakpointLineAvailable(file, line) === true;
      const activeSource = source || (pathsMatch(String(deps.getActiveEditorPath?.() || ""), file) ? String(deps.getActiveEditorValue?.() || "") : "");
      if (!activeSource || typeof sourceContext.isJavaBreakpointLine !== "function") return true;
      return sourceContext.isJavaBreakpointLine({ source: activeSource, file, line }) === true;
    }

    async function addMethodBreakpointFromContext(context) {
      const methodContext = findJavaMethodContext(context);
      if (!methodContext) {
        deps.alert?.("Place the cursor inside a Java method before adding a method breakpoint.");
        return false;
      }
      await deps.session.addMethodBreakpoint?.(methodContext.className, methodContext.methodName);
      return true;
    }
    async function addSelectionToWatches(expression) {
      const value = String(expression || "").trim();
      if (!value) return false;
      await (deps.panel.openView?.("watches") || deps.panel.open());
      await deps.session.addWatch?.(value);
      return true;
    }
    async function debugJavaMain(filePath) {
      if (typeof deps.startDebuggingForFile === "function") return deps.startDebuggingForFile(filePath);
      if (typeof deps.startDebugging === "function") return deps.startDebugging();
      return deps.panel.open().then(() => deps.session.start());
    }
    function appendBreakpointField(body, label, control) {
      const field = document.createElement("label");
      field.className = "java-debug-breakpoint-properties-field";
      const title = document.createElement("span");
      title.textContent = label;
      field.append(title, control);
      body.appendChild(field);
      return control;
    }

    async function editBreakpointProperties(file, line, options = {}) {
      const breakpoint = findBreakpoint(file, line) || { enabled: true, condition: "", hitCount: 0, logMessage: "" };
      const notify = app.services?.notify || app.modules?.notificationModal;
      if (!notify?.show) {
        const fallbackField = options.focusField || "condition";
        return promptBreakpointField(file, line, fallbackField, options.fallbackValue ?? breakpoint[fallbackField] ?? "");
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
          appendBreakpointField(body, "Condition", conditionInput);

          const hitCountInput = document.createElement("input");
          hitCountInput.type = "number";
          hitCountInput.min = "0";
          hitCountInput.step = "1";
          hitCountInput.value = draft.hitCount;
          hitCountInput.placeholder = "Break after hit count";
          hitCountInput.dataset.javaDebugBreakpointHitCount = "true";
          hitCountInput.addEventListener("input", () => { draft.hitCount = hitCountInput.value; });
          appendBreakpointField(body, "Hit count", hitCountInput);

          const logpointInput = document.createElement("textarea");
          logpointInput.rows = 3;
          logpointInput.value = draft.logMessage;
          logpointInput.placeholder = "Log message instead of suspending";
          logpointInput.dataset.javaDebugBreakpointLogMessage = "true";
          logpointInput.addEventListener("input", () => { draft.logMessage = logpointInput.value; });
          appendBreakpointField(body, "Logpoint message", logpointInput);
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
        ...(options.sourcePreview ? { sourcePreview: options.sourcePreview } : {})
      });
      return true;
    }
    function hideContextMenu() {
      contextMenu?.classList.add("hidden");
    }

    function ensureContextMenu() {
      if (contextMenu) return contextMenu;
      contextMenu = document.createElement("div");
      contextMenu.className = "java-debug-context-menu hidden";
      contextMenu.setAttribute("role", "menu");
      contextMenu.setAttribute("aria-label", "Breakpoint context menu");
      contextMenu.addEventListener("contextmenu", (event) => event.preventDefault());
      document.body.appendChild(contextMenu);
      document.addEventListener("click", (event) => {
        if (contextMenu?.contains?.(event.target)) return;
        hideContextMenu();
      }, true);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideContextMenu();
      });
      window.addEventListener("resize", hideContextMenu);
      return contextMenu;
    }

    function positionContextMenu(menu, clientX, clientY) {
      const padding = 8;
      const rect = menu.getBoundingClientRect();
      menu.style.left = `${Math.min(Math.max(padding, clientX), Math.max(padding, window.innerWidth - rect.width - padding))}px`;
      menu.style.top = `${Math.min(Math.max(padding, clientY), Math.max(padding, window.innerHeight - rect.height - padding))}px`;
    }

    function createContextMenuItem(action) {
      if (action?.type === "separator") {
        const separator = document.createElement("div");
        separator.className = "java-debug-context-menu-separator";
        separator.setAttribute("role", "separator");
        return separator;
      }
      if (action?.type === "submenu") return createContextMenuSubmenu(action);
      const button = document.createElement("button");
      button.type = "button";
      button.className = "java-debug-context-menu-item";
      button.disabled = action.disabled === true;
      button.setAttribute("role", "menuitem");
      button.innerHTML = `<i class="bi ${action.icon}" aria-hidden="true"></i><span>${escapeHtml(action.label)}</span>`;
      button.addEventListener("click", async () => {
        hideContextMenu();
        if (button.disabled) return;
        try { await action.run?.(); }
        catch (error) { notifyError(error); }
      });
      return button;
    }

    function createContextMenuSubmenu(action) {
      const submenu = document.createElement("div");
      submenu.className = "java-debug-context-menu-submenu";
      submenu.setAttribute("role", "none");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "java-debug-context-menu-item java-debug-context-menu-submenu-button";
      button.disabled = action.disabled === true;
      button.setAttribute("role", "menuitem");
      button.setAttribute("aria-haspopup", "menu");
      button.innerHTML = `<i class="bi ${action.icon}" aria-hidden="true"></i><span>${escapeHtml(action.label)}</span><i class="bi bi-chevron-right java-debug-context-menu-submenu-arrow" aria-hidden="true"></i>`;
      const panel = document.createElement("div");
      panel.className = "java-debug-context-menu-submenu-panel";
      panel.setAttribute("role", "menu");
      (action.items || []).forEach((item) => panel.appendChild(createContextMenuItem(item)));
      submenu.append(button, panel);
      return submenu;
    }

    function showContextMenu(event, actions) {
      if (!event || !actions?.length) return false;
      event.preventDefault();
      event.stopPropagation();
      const menu = ensureContextMenu();
      menu.innerHTML = "";
      actions.forEach((action) => menu.appendChild(createContextMenuItem(action)));
      menu.classList.remove("hidden");
      positionContextMenu(menu, event.clientX, event.clientY);
      return true;
    }

    function showBreakpointContextMenu(file, line, event, gutter = {}) {
      const breakpoint = findBreakpoint(file, line);
      const enabled = breakpoint?.enabled !== false;
      const lineLabel = `Line ${line}`;
      const breakpointLineAvailable = Boolean(breakpoint || gutter.breakpointLineAvailable === true || isBreakpointLineAvailable(file, line));
      const hasBookmarks = gutter.hasBookmarks === true;
      const actions = [
        { type: "submenu", label: "Breakpoints", icon: "bi-record-circle", items: [
          { label: breakpoint ? `Remove Breakpoint at ${lineLabel}` : `Add Breakpoint at ${lineLabel}`, icon: breakpoint ? "bi-x" : "bi-record-circle", disabled: !breakpointLineAvailable, run: () => toggleBreakpoint(file, line) },
          { label: breakpoint ? "Edit Condition" : `Add Conditional Breakpoint at ${lineLabel}...`, icon: "bi-filter", disabled: !breakpointLineAvailable, run: () => editBreakpointProperties(file, line, withActiveBreakpointSourcePreview(file, line, { focusField: "condition" })) },
          { label: breakpoint ? "Edit Hit Count" : `Add Hit Count Breakpoint at ${lineLabel}...`, icon: "bi-123", disabled: !breakpointLineAvailable, run: () => editBreakpointProperties(file, line, withActiveBreakpointSourcePreview(file, line, { focusField: "hitCount" })) },
          { label: breakpoint ? "Edit Logpoint" : `Add Logpoint at ${lineLabel}...`, icon: "bi-chat-left-text", disabled: !breakpointLineAvailable, run: () => editBreakpointProperties(file, line, withActiveBreakpointSourcePreview(file, line, { focusField: "logMessage" })) },
          { label: "Breakpoint Properties...", icon: "bi-sliders", disabled: !breakpointLineAvailable, run: () => editBreakpointProperties(file, line, withActiveBreakpointSourcePreview(file, line)) },
          breakpoint ? { label: enabled ? "Disable Breakpoint" : "Enable Breakpoint", icon: enabled ? "bi-slash-circle" : "bi-record-circle", run: () => deps.session.setBreakpointEnabled?.(file, line, !enabled) } : null,
          { type: "separator" },
          { label: "Show Breakpoints", icon: "bi-list-check", run: () => deps.panel?.openView?.("breakpoints") || deps.panel?.open?.() }
        ].filter(Boolean) },
        { type: "submenu", label: "Bookmarks", icon: "bi-bookmark", items: [
          { label: gutter.isBookmarked ? "Remove Bookmark" : "Add Bookmark", icon: gutter.isBookmarked ? "bi-bookmark-x" : "bi-bookmark-plus", run: () => gutter.toggleBookmark?.() },
          { type: "separator" },
          { label: "Cut bookmarked lines", icon: "bi-scissors", disabled: !hasBookmarks, run: () => gutter.cutBookmarkedLines?.() },
          { label: "Copy bookmarked lines", icon: "bi-clipboard", disabled: !hasBookmarks, run: () => gutter.copyBookmarkedLines?.() },
          { label: "Delete bookmarked lines", icon: "bi-trash", disabled: !hasBookmarks, run: () => gutter.deleteBookmarkedLines?.() },
          { label: "Clear all bookmarks", icon: "bi-bookmark-x", disabled: !hasBookmarks, run: () => gutter.clearBookmarks?.() }
        ] },
        { type: "submenu", label: "Folding", icon: "bi-chevron-bar-contract", items: [
          { label: gutter.isFolded ? `Expand ${lineLabel}` : `Collapse ${lineLabel}`, icon: gutter.isFolded ? "bi-chevron-bar-expand" : "bi-chevron-bar-contract", disabled: !gutter.canFold, run: () => gutter.toggleFold?.() },
          { label: "Collapse All Folds", icon: "bi-chevron-bar-contract", run: () => gutter.collapseAllFolds?.() },
          { label: "Expand All Folds", icon: "bi-chevron-bar-expand", run: () => gutter.expandAllFolds?.() }
        ] },
        { type: "separator" },
        { label: `Run to Cursor at ${lineLabel}`, icon: "bi-cursor", disabled: !canEvaluate(), run: () => deps.session.runToCursor?.(file, line)?.catch?.(notifyError) }
      ].filter(Boolean);
      return showContextMenu(event, actions);
    }
    const provider = {
      showBreakpointContextMenu(file, line, event, gutter = {}) {
        if (!deps.getProjectPath?.() || !isJava({ activeTab: { sourceFilePath: file } })) return false;
        return showBreakpointContextMenu(file, line, event, gutter);
      },

      getAvailableActions(context = {}) {
        if (!deps.getProjectPath?.() || !isJava(context)) return [];
        const file = getFilePath(context);
        const line = getLine(context);
        const selected = getSelectionText(context);
        const breakpoint = findBreakpoint(file, line);
        const hasBreakpoint = !!breakpoint;
        const breakpointLineAvailable = hasBreakpoint || isBreakpointLineAvailable(file, line, context.source);
        const evaluatable = canEvaluate();
        const methodContext = findJavaMethodContext(context);
        const mainClass = getMainClass(context);
        const lineLabel = `Line ${line}`;
        return [
          mainClass ? { id: "debug-java-main", label: `Debug ${mainClass.simpleName}.main()`, icon: "bi-bug-fill", menu: "root", run() { void debugJavaMain(file).catch((error) => deps.alert?.(error?.message || "Java debugging could not start.")); return true; } } : null,
          { id: "debug-toggle-breakpoint", label: hasBreakpoint ? `Remove Breakpoint at ${lineLabel}` : `Add Breakpoint at ${lineLabel}`, icon: "bi-record-circle", menu: "debugger", disabled: !breakpointLineAvailable, run() { void toggleBreakpoint(file, line).catch(notifyError); return true; } },
          { id: "debug-add-conditional-breakpoint", label: hasBreakpoint ? `Edit Condition at ${lineLabel}` : `Add Conditional Breakpoint at ${lineLabel}...`, icon: "bi-filter", menu: "debugger", disabled: !breakpointLineAvailable, run() { void editBreakpointProperties(file, line, withBreakpointSourcePreview(context, { focusField: "condition" })).catch(notifyError); return true; } },
          { id: "debug-add-hit-count-breakpoint", label: hasBreakpoint ? `Edit Hit Count at ${lineLabel}` : `Add Hit Count Breakpoint at ${lineLabel}...`, icon: "bi-123", menu: "debugger", disabled: !breakpointLineAvailable, run() { void editBreakpointProperties(file, line, withBreakpointSourcePreview(context, { focusField: "hitCount" })).catch(notifyError); return true; } },
          { id: "debug-add-logpoint", label: hasBreakpoint ? `Edit Logpoint at ${lineLabel}` : `Add Logpoint at ${lineLabel}...`, icon: "bi-chat-left-text", menu: "debugger", disabled: !breakpointLineAvailable, run() { void editBreakpointProperties(file, line, withBreakpointSourcePreview(context, { focusField: "logMessage" })).catch(notifyError); return true; } },
          { id: "debug-edit-breakpoint", label: `Breakpoint Properties at ${lineLabel}...`, icon: "bi-sliders", menu: "debugger", disabled: !breakpointLineAvailable, run() { void editBreakpointProperties(file, line, withBreakpointSourcePreview(context)).catch(notifyError); return true; } },
          { id: "debug-add-method-breakpoint", label: methodContext ? `Add Method Breakpoint: ${methodContext.className}.${methodContext.methodName}()` : "Add Method Breakpoint at Current Method", icon: "bi-braces", menu: "debugger", disabled: !methodContext, run() { void addMethodBreakpointFromContext(context).catch(notifyError); return true; } },
          { id: "debug-run-to-cursor", label: `Run to Cursor at ${lineLabel}`, icon: "bi-cursor", menu: "debugger", disabled: !evaluatable, run() { void deps.session.runToCursor(file, line).catch?.(notifyError); return true; } },
          { id: "debug-evaluate-expression", label: "Evaluate Expression...", icon: "bi-terminal", menu: "debugger", disabled: !evaluatable, run() { void (deps.panel.openView?.("expressions") || deps.panel.open()).then(() => selected ? deps.session.evaluate(selected) : deps.panel.focusExpressionInput?.()).catch(notifyError); return true; } },
          { id: "debug-evaluate-selection", label: "Evaluate Selection", icon: "bi-terminal", menu: "debugger", disabled: !evaluatable || !selected, run() { void (deps.panel.openView?.("expressions") || deps.panel.open()).then(() => deps.session.evaluate(selected)).catch(notifyError); return true; } },
          { id: "debug-add-selection-watch", label: "Add Selection to Watches", icon: "bi-plus-circle", menu: "debugger", disabled: !selected, run() { void addSelectionToWatches(selected).catch(notifyError); return true; } }
        ].filter(Boolean);
      }
    };

    deps.sourceActions.registerProvider(provider);
    app.registerModule?.("javaDebugEditorActions", provider);
    return provider;
  }

  global.registerMarkdownViewerJavaDebugEditorActions = registerMarkdownViewerJavaDebugEditorActions;
})(typeof window !== "undefined" ? window : globalThis);
