// Persistent Java debugger breakpoint and watch storage.
(function(global) {
  "use strict";

  function registerMarkdownViewerJavaDebugBreakpointStore(app, deps = {}) {
    const FILE_NAME = "java-debugger.json";
    let projectPath = "";
    let document = { schemaVersion: 1, breakpoints: [], methodBreakpoints: [], watches: [], expressionHistory: [], exceptionBreakpoint: null };

    function normalizePath(value) { return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, ""); }
    function joinPath(parent, child) { return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`; }
    function getPath(root = projectPath) { return joinPath(joinPath(root, ".md-editor"), FILE_NAME); }
    function filesystem() { return (deps.Neutralino || global.Neutralino)?.filesystem || null; }
    function normalizeInteger(value, fallback, minimum) {
      const text = String(value ?? "").trim();
      const number = typeof value === "number" ? value : Number(text);
      if (text && /^\d+$/.test(text)) return Math.max(minimum, number);
      if (Number.isInteger(number)) return Math.max(minimum, number);
      return fallback;
    }

    function normalizePositiveInteger(value, fallback = 1) { return normalizeInteger(value, fallback, 1); }
    function normalizeNonNegativeInteger(value, fallback = 0) { return normalizeInteger(value, fallback, 0); }
    function createId(file, line) { return `${normalizePath(file)}:${normalizePositiveInteger(line)}`; }
    function createMethodId(className, methodName) { return `${String(className || "").trim()}#${String(methodName || "").trim()}`; }
    function hashText(value) {
      let hash = 0;
      for (let index = 0; index < value.length; index++) hash = ((hash << 5) - hash + value.charCodeAt(index)) | 0;
      return Math.abs(hash).toString(36);
    }
    function createWatchId(expression, index) { return `watch-${index + 1}-${hashText(expression)}`; }

    function normalizeBreakpoint(input) {
      const file = normalizePath(input?.file);
      const line = normalizePositiveInteger(input?.line);
      return {
        id: createId(file, line),
        file,
        line,
        enabled: input?.enabled !== false,
        condition: String(input?.condition || ""),
        hitCount: normalizeNonNegativeInteger(input?.hitCount),
        logMessage: String(input?.logMessage || ""),
        sourcePreview: String(input?.sourcePreview || ""),
        sourceName: String(input?.sourceName || ""),
        className: String(input?.className || ""),
        method: String(input?.method || ""),
        resolvedFile: normalizePath(input?.resolvedFile),
        hits: normalizeNonNegativeInteger(input?.hits),
        verified: input?.verified === true,
        message: String(input?.message || "")
      };
    }

    function normalizeExceptionBreakpoint(input) {
      const source = input && typeof input === "object" ? input : {};
      const hasSavedPreference = input && typeof input === "object" && Object.prototype.hasOwnProperty.call(source, "enabled");
      return {
        id: "java-exceptions",
        enabled: hasSavedPreference ? source.enabled !== false : false,
        caught: source.caught !== false,
        uncaught: source.uncaught !== false,
        disabledByBulkAction: source.disabledByBulkAction === true
      };
    }

    function normalizeMethodBreakpoint(input) {
      const className = String(input?.className || "").trim();
      const methodName = String(input?.methodName || "").trim();
      return {
        id: createMethodId(className, methodName),
        className,
        methodName,
        enabled: input?.enabled !== false,
        verified: input?.verified === true,
        message: String(input?.message || ""),
        hits: normalizeNonNegativeInteger(input?.hits)
      };
    }

    function getBreakpoints() { return document.breakpoints.map(normalizeBreakpoint); }
    function getMethodBreakpoints() { return (document.methodBreakpoints || []).map(normalizeMethodBreakpoint).filter((item) => item.className && item.methodName); }
    function getWatches() { return (document.watches || []).map((watch, index) => { const expression = String(watch.expression || "").trim(); return { id: String(watch.id || createWatchId(expression, index)), expression, enabled: watch.enabled !== false }; }).filter((watch) => watch.expression); }
    function getExpressionHistory() { return (document.expressionHistory || []).map((item) => String(item || "").trim()).filter(Boolean).slice(0, 50); }
    function getExceptionBreakpoint() { return normalizeExceptionBreakpoint(document.exceptionBreakpoint); }

    async function save() {
      if (!projectPath || !filesystem()?.writeFile) return false;
      try { await filesystem().createDirectory(joinPath(projectPath, ".md-editor")); } catch (_error) {}
      await filesystem().writeFile(getPath(), JSON.stringify({ schemaVersion: 1, breakpoints: getBreakpoints(), methodBreakpoints: getMethodBreakpoints(), watches: getWatches(), expressionHistory: getExpressionHistory(), exceptionBreakpoint: getExceptionBreakpoint() }, null, 2) + "\n");
      return true;
    }

    async function load(root) {
      projectPath = normalizePath(root);
      document = { schemaVersion: 1, breakpoints: [], methodBreakpoints: [], watches: [], expressionHistory: [], exceptionBreakpoint: null };
      if (!projectPath || !filesystem()?.readFile) return document;
      try {
        const parsed = JSON.parse(await filesystem().readFile(getPath()));
        document = { schemaVersion: 1, breakpoints: (parsed.breakpoints || []).map(normalizeBreakpoint), methodBreakpoints: parsed.methodBreakpoints || [], watches: parsed.watches || [], expressionHistory: parsed.expressionHistory || [], exceptionBreakpoint: parsed.exceptionBreakpoint || null };
      } catch (_error) {}
      return document;
    }

    async function upsertBreakpoint(input) {
      const breakpoint = normalizeBreakpoint(input);
      document.breakpoints = getBreakpoints().filter((item) => item.id !== breakpoint.id).concat(breakpoint).sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
      await save();
      return breakpoint;
    }

    async function removeBreakpoint(file, line) {
      const id = createId(file, line);
      document.breakpoints = getBreakpoints().filter((item) => item.id !== id);
      await save();
      return true;
    }

    async function clearBreakpoints() {
      document.breakpoints = [];
      document.methodBreakpoints = [];
      document.exceptionBreakpoint = null;
      await save();
      return [];
    }

    async function updateBreakpoint(file, line, patch = {}) {
      const id = createId(file, line);
      const existing = getBreakpoints().find((item) => item.id === id) || { file, line };
      return upsertBreakpoint({ ...existing, ...patch, file: existing.file || file, line: existing.line || line });
    }

    async function toggleBreakpoint(file, line, patch = {}) {
      const id = createId(file, line);
      const existing = getBreakpoints().find((item) => item.id === id);
      if (existing) { await removeBreakpoint(file, line); return { removed: true, breakpoint: existing }; }
      return { removed: false, breakpoint: await upsertBreakpoint({ file, line, ...patch }) };
    }

    async function setBreakpointsEnabled(enabled) {
      document.breakpoints = getBreakpoints().map((item) => ({ ...item, enabled: enabled === true }));
      document.methodBreakpoints = getMethodBreakpoints().map((item) => ({ ...item, enabled: enabled === true }));
      await save();
      return getBreakpoints();
    }

    async function updateBreakpointStatus(status) {
      if (!status?.id) return null;
      document.breakpoints = getBreakpoints().map((item) => item.id === status.id ? { ...item, ...status } : item);
      await save();
      return getBreakpoints().find((item) => item.id === status.id) || null;
    }

    async function upsertMethodBreakpoint(input) {
      const breakpoint = normalizeMethodBreakpoint(input);
      if (!breakpoint.className || !breakpoint.methodName) return null;
      document.methodBreakpoints = getMethodBreakpoints().filter((item) => item.id !== breakpoint.id).concat(breakpoint).sort((a, b) => a.className.localeCompare(b.className) || a.methodName.localeCompare(b.methodName));
      await save();
      return breakpoint;
    }

    async function addMethodBreakpoint(className, methodName) {
      return upsertMethodBreakpoint({ className, methodName });
    }

    async function updateMethodBreakpoint(id, patch = {}) {
      const existing = getMethodBreakpoints().find((item) => item.id === id);
      if (!existing) return null;
      const nextClassName = Object.prototype.hasOwnProperty.call(patch, "className") ? String(patch.className || "").trim() : existing.className;
      const nextMethodName = Object.prototype.hasOwnProperty.call(patch, "methodName") ? String(patch.methodName || "").trim() : existing.methodName;
      const identityChanged = nextClassName !== existing.className || nextMethodName !== existing.methodName;
      const updated = normalizeMethodBreakpoint({ ...existing, ...patch, className: nextClassName, methodName: nextMethodName, verified: identityChanged ? false : existing.verified, message: identityChanged ? "Pending class load" : existing.message, hits: identityChanged ? 0 : existing.hits });
      if (!updated.className || !updated.methodName) return null;
      document.methodBreakpoints = getMethodBreakpoints()
        .filter((item) => item.id !== id && item.id !== updated.id)
        .concat(updated)
        .sort((a, b) => a.className.localeCompare(b.className) || a.methodName.localeCompare(b.methodName));
      await save();
      return updated;
    }

    async function removeMethodBreakpoint(id) {
      document.methodBreakpoints = getMethodBreakpoints().filter((item) => item.id !== id);
      await save();
      return true;
    }

    async function updateMethodBreakpointStatus(status) {
      if (!status?.id) return null;
      document.methodBreakpoints = getMethodBreakpoints().map((item) => item.id === status.id ? normalizeMethodBreakpoint({ ...item, ...status }) : item);
      await save();
      return getMethodBreakpoints().find((item) => item.id === status.id) || null;
    }

    async function addWatch(expression) {
      const watch = { id: `watch-${Date.now()}-${Math.random().toString(16).slice(2)}`, expression: String(expression || "").trim(), enabled: true };
      if (!watch.expression) return null;
      document.watches = getWatches().concat(watch);
      await save();
      return watch;
    }

    async function updateWatch(id, patch = {}) {
      let updated = null;
      document.watches = getWatches().map((watch) => {
        if (watch.id !== id) return watch;
        updated = {
          ...watch,
          expression: Object.prototype.hasOwnProperty.call(patch, "expression") ? String(patch.expression || "").trim() : watch.expression,
          enabled: Object.prototype.hasOwnProperty.call(patch, "enabled") ? patch.enabled !== false : watch.enabled !== false
        };
        return updated;
      }).filter((watch) => watch.expression);
      await save();
      return updated;
    }

    async function removeWatch(id) {
      document.watches = getWatches().filter((watch) => watch.id !== id);
      await save();
      return true;
    }

    async function addExpressionHistory(expression) {
      const text = String(expression || "").trim();
      if (!text) return getExpressionHistory();
      document.expressionHistory = [text].concat(getExpressionHistory().filter((item) => item !== text)).slice(0, 50);
      await save();
      return getExpressionHistory();
    }

    async function updateExceptionBreakpoint(patch = {}) {
      document.exceptionBreakpoint = normalizeExceptionBreakpoint({ ...getExceptionBreakpoint(), ...patch });
      await save();
      return getExceptionBreakpoint();
    }

    const api = { load, save, getPath, getBreakpoints, getMethodBreakpoints, getWatches, getExpressionHistory, getExceptionBreakpoint, upsertBreakpoint, updateBreakpoint, removeBreakpoint, clearBreakpoints, toggleBreakpoint, setBreakpointsEnabled, updateBreakpointStatus, addMethodBreakpoint, upsertMethodBreakpoint, updateMethodBreakpoint, removeMethodBreakpoint, updateMethodBreakpointStatus, addWatch, updateWatch, removeWatch, addExpressionHistory, updateExceptionBreakpoint };
    app.registerModule?.("javaDebugBreakpointStore", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugBreakpointStore = registerMarkdownViewerJavaDebugBreakpointStore;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerJavaDebugBreakpointStore };
})(typeof window !== "undefined" ? window : globalThis);
