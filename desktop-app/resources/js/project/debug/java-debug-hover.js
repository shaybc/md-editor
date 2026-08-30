// Source editor hover inspection for paused Java debug sessions.
(function(global) {
  "use strict";

  function registerMarkdownViewerJavaDebugHover(app, deps = {}) {
    const editorElement = deps.editorElement;
    const session = deps.session;
    const editor = deps.editor;
    const JAVA_NON_VALUE_TOKENS = new Set([
      "abstract", "assert", "boolean", "break", "byte", "case", "catch", "char", "class", "const", "continue",
      "default", "do", "double", "else", "enum", "extends", "false", "final", "finally", "float", "for",
      "goto", "if", "implements", "import", "instanceof", "int", "interface", "long", "native", "new",
      "null", "package", "private", "protected", "public", "return", "short", "static", "strictfp", "super",
      "switch", "synchronized", "throw", "throws", "transient", "true", "try", "void", "volatile", "while"
    ]);
    let tooltip = null;
    let hoverTimer = null;
    let lastHoverKey = "";

    function isSuspended(state) {
      return state?.state === "paused" || state?.state === "stopped-at-breakpoint";
    }

    function isJavaEditor() {
      const activePath = deps.getActiveEditorPath?.() || "";
      if (deps.isJavaSourcePath?.(activePath) === true) return true;
      const activeEditor = document.querySelector(".codemirror-editor[data-language=\"java\"] .cm-editor");
      return !!activeEditor;
    }

    function getActiveCodeMirrorView() {
      return editor?.getView?.() || editor?.getActiveCodeMirrorEditor?.()?.getView?.() || null;
    }

    function getEditorOffset(event) {
      if (Number.isFinite(event?.markdownViewerCodeMirrorOffset)) return event.markdownViewerCodeMirrorOffset;
      const view = getActiveCodeMirrorView();
      const position = view?.posAtCoords?.({ x: event.clientX, y: event.clientY });
      return Number.isFinite(position) ? position : -1;
    }

    function isActiveEditorHoverEvent(event) {
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return false;
      const view = getActiveCodeMirrorView();
      if (view?.dom?.contains?.(target) || view?.scrollDOM?.contains?.(target)) return true;
      const activeEditor = editor?.getActiveEditor?.();
      if (activeEditor?.contains?.(target)) return true;
      return !!editorElement?.contains?.(target);
    }


    function getHoverExpression(source, offset) {
      const text = String(source || "");
      const cursor = Math.max(0, Math.min(text.length, Number(offset) || 0));
      const lineStart = text.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
      const nextLine = text.indexOf("\n", cursor);
      const lineEnd = nextLine < 0 ? text.length : nextLine;
      const line = text.slice(lineStart, lineEnd);
      const lineOffset = cursor - lineStart;
      const pathPattern = /[A-Za-z_$][\w$]*(?:\s*(?:\.\s*[A-Za-z_$][\w$]*|\[[^\]\r\n]+\]))*/g;
      let match;
      while ((match = pathPattern.exec(line))) {
        const start = match.index;
        const end = start + match[0].length;
        if (lineOffset < start || lineOffset > end) continue;
        const expression = match[0].trim().replace(/\s*\.\s*/g, ".").replace(/\s*\[\s*/g, "[").replace(/\s*\]\s*/g, "]");
        if (!expression || !/[A-Za-z_$]/.test(expression[0])) return null;
        if (JAVA_NON_VALUE_TOKENS.has(expression)) return null;
        const segments = expression.split(".").filter(Boolean);
        const name = segments[segments.length - 1] || expression;
        if (JAVA_NON_VALUE_TOKENS.has(name)) return null;
        return { expression, name };
      }
      return null;
    }

    function flattenValues(values, result = []) {
      for (const item of values || []) {
        result.push(item);
        if (Array.isArray(item.children)) flattenValues(item.children, result);
      }
      return result;
    }

    function findValue(state, hoverExpression) {
      const values = flattenValues(state?.variables || []);
      const expression = hoverExpression?.expression || "";
      const name = hoverExpression?.name || expression;
      return values.find((item) => item.expression === expression)
        || values.find((item) => item.name === expression)
        || values.find((item) => item.expression === name)
        || values.find((item) => item.name === name)
        || null;
    }

    async function resolveHoverValue(state, hoverExpression) {
      const cached = findValue(state, hoverExpression);
      if (cached) return cached;
      if (typeof session?.evaluateForInspection !== "function") return null;
      const result = await session.evaluateForInspection(hoverExpression.expression, state?.selectedFrameId);
      return result && !result.error ? result : null;
    }

    function ensureTooltip() {
      if (tooltip) return tooltip;
      tooltip = document.createElement("div");
      tooltip.className = "java-debug-hover-tooltip";
      tooltip.hidden = true;
      document.body.appendChild(tooltip);
      return tooltip;
    }

    function hide() {
      lastHoverKey = "";
      if (hoverTimer) window.clearTimeout(hoverTimer);
      hoverTimer = null;
      if (tooltip) tooltip.hidden = true;
    }

    function positionTooltip(event) {
      if (!tooltip) return;
      const margin = 10;
      const bounds = tooltip.getBoundingClientRect();
      const left = Math.min(Math.max(event.clientX + 12, margin), Math.max(margin, window.innerWidth - bounds.width - margin));
      const top = Math.min(Math.max(event.clientY + 14, margin), Math.max(margin, window.innerHeight - bounds.height - margin));
      tooltip.style.left = `${left}px`;
      tooltip.style.top = `${top}px`;
    }

    function show(event, hoverExpression, value) {
      const element = ensureTooltip();
      element.textContent = "";
      const title = document.createElement("div");
      title.className = "java-debug-hover-title";
      title.textContent = hoverExpression.expression;
      const detail = document.createElement("div");
      detail.className = "java-debug-hover-value";
      detail.textContent = `${value.type || "value"} = ${value.value ?? ""}`;
      element.append(title, detail);
      element.hidden = false;
      positionTooltip(event);
    }

    function handleMouseMove(event) {
      const state = session?.getState?.() || {};
      if (!isSuspended(state) || !isJavaEditor()) { hide(); return; }
      const offset = getEditorOffset(event);
      const hoverExpression = getHoverExpression(deps.getActiveEditorValue?.() || "", offset);
      if (!hoverExpression) { hide(); return; }
      const selectedFrameId = state?.selectedFrameId || "";
      const hoverKey = `${deps.getActiveEditorPath?.() || ""}:${selectedFrameId}:${hoverExpression.expression}`;
      if (hoverKey === lastHoverKey) { positionTooltip(event); return; }
      lastHoverKey = hoverKey;
      if (hoverTimer) window.clearTimeout(hoverTimer);
      hoverTimer = window.setTimeout(async () => {
        const latestState = session?.getState?.() || {};
        if (!isSuspended(latestState) || latestState.selectedFrameId !== selectedFrameId) { hide(); return; }
        const value = await resolveHoverValue(latestState, hoverExpression).catch(() => null);
        if (hoverKey !== lastHoverKey) return;
        if (!value) { hide(); return; }
        show(event, hoverExpression, value);
      }, 180);
    }

    function handleDocumentMouseMove(event) {
      if (!isActiveEditorHoverEvent(event)) { hide(); return; }
      handleMouseMove(event);
    }

    document.addEventListener("mousemove", handleDocumentMouseMove, true);
    document.addEventListener("mouseleave", hide);
    window.addEventListener("blur", hide);
    const unsubscribeSession = session?.subscribe?.((state) => { if (!isSuspended(state) && state?.state !== "evaluating") hide(); }) || function() {};

    function destroy() {
      document.removeEventListener("mousemove", handleDocumentMouseMove, true);
      document.removeEventListener("mouseleave", hide);
      window.removeEventListener("blur", hide);
      unsubscribeSession();
      hide();
      tooltip?.remove?.();
      tooltip = null;
    }

    const api = { hide, destroy };
    app.registerModule?.("javaDebugHover", api);
    return api;
  }

  global.registerMarkdownViewerJavaDebugHover = registerMarkdownViewerJavaDebugHover;
})(typeof window !== "undefined" ? window : globalThis);
