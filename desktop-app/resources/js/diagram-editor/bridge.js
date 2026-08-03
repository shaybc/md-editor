(function(global) {
  "use strict";

  const EDITOR_PATH = "/vendor/diagram-editor/index.html";
  const DEFAULT_STARTUP_TIMEOUT_MS = 15000;
  const MAX_STARTUP_ATTEMPTS = 2;

  function createEditorUrl(startupAttempt = 1) {
    const params = new URLSearchParams({
      embed: "1",
      proto: "json",
      spin: "1",
      offline: "1",
      stealth: "1",
      plugins: "0",
      pwa: "0",
      rt: "0",
      noExitBtn: "1",
      saveAndExit: "0",
      libraries: "1"
    });
    if (startupAttempt > 1) params.set("mdEditorStartupAttempt", String(startupAttempt));
    return `${EDITOR_PATH}?${params}`;
  }

  /**
   * Connect an embedded draw.io frame to an MD-Editor diagram tab.
   * @param {HTMLIFrameElement} iframe - Hosted draw.io frame.
   * @param {object} options - Diagram data and lifecycle callbacks.
   * @returns {object} Bridge controller.
   */
  function createBridge(iframe, options) {
    let disposed = false;
    let initialized = false;
    let pendingExport = null;
    let startupAttempt = 0;
    let startupTimer = null;
    let terminalStartupFailure = false;
    let xml = String(options.xml || "");
    const configuredStartupTimeout = Number(options.startupTimeoutMs);
    const startupTimeoutMs = Number.isFinite(configuredStartupTimeout) && configuredStartupTimeout > 0
      ? configuredStartupTimeout
      : DEFAULT_STARTUP_TIMEOUT_MS;

    function post(message) {
      if (!disposed && iframe.contentWindow) iframe.contentWindow.postMessage(JSON.stringify(message), "*");
    }

    function clearStartupTimer() {
      if (!startupTimer) return;
      clearTimeout(startupTimer);
      startupTimer = null;
    }

    function notifyLifecycle(phase, level, details = {}) {
      options.onLifecycle?.({
        phase,
        level,
        attempt: startupAttempt,
        maximumAttempts: MAX_STARTUP_ATTEMPTS,
        startupTimeoutMs,
        ...details
      });
    }

    function retryOrFailStartup(reason) {
      if (disposed || initialized || terminalStartupFailure) return;
      clearStartupTimer();
      notifyLifecycle(reason === "timeout" ? "startup-timeout" : "startup-frame-error", "warning", { reason });
      if (startupAttempt < MAX_STARTUP_ATTEMPTS) {
        notifyLifecycle("startup-retry", "warning", { reason, nextAttempt: startupAttempt + 1 });
        startStartupAttempt();
        return;
      }
      terminalStartupFailure = true;
      const error = new Error(`The Diagram Editor could not initialize after ${MAX_STARTUP_ATTEMPTS} attempts. Close and reopen the diagram to try again.`);
      notifyLifecycle("startup-failed", "error", { reason, message: error.message });
      options.onFailure?.(error);
    }

    function startStartupAttempt() {
      if (disposed || terminalStartupFailure) return;
      clearStartupTimer();
      initialized = false;
      startupAttempt += 1;
      const url = createEditorUrl(startupAttempt);
      notifyLifecycle("startup-attempt", "info", { url });
      iframe.src = url;
      startupTimer = setTimeout(() => retryOrFailStartup("timeout"), startupTimeoutMs);
    }

    function handleFrameError() {
      retryOrFailStartup("frame-error");
    }

    function handleMessage(event) {
      if (disposed || event.source !== iframe.contentWindow) return;
      let message = event.data;
      if (typeof message === "string") {
        try { message = JSON.parse(message); } catch (_error) { return; }
      }
      if (!message || typeof message !== "object") return;
      if (message.event === "init") {
        if (initialized || terminalStartupFailure) return;
        clearStartupTimer();
        initialized = true;
        notifyLifecycle("startup-ready", "info");
        post({
          action: "load",
          xml,
          autosave: 1,
          title: options.title || "Untitled Diagram",
          noExitBtn: 1,
          saveAndExit: 0,
          dark: document.documentElement.dataset.theme === "dark" ? "1" : "0"
        });
        options.onReady?.();
      } else if ((message.event === "autosave" || message.event === "save") && typeof message.xml === "string") {
        xml = message.xml;
        options.onChange?.(xml, message.event);
        if (message.event === "save") options.onSave?.(xml);
      } else if (message.event === "export" && pendingExport) {
        const pending = pendingExport;
        pendingExport = null;
        clearTimeout(pending.timeout);
        pending.resolve(message);
      } else if (message.event === "exit") {
        options.onExit?.();
      }
    }

    global.addEventListener("message", handleMessage);
    iframe.addEventListener?.("error", handleFrameError);
    startStartupAttempt();

    return {
      isReady() { return initialized; },
      getXml() { return xml; },
      load(nextXml) {
        xml = String(nextXml || "");
        if (initialized) post({ action: "load", xml, autosave: 1, title: options.title || "Untitled Diagram" });
      },
      exportImage(exportOptions = {}) {
        if (!initialized) return Promise.reject(new Error("The Diagram Editor is still loading."));
        if (pendingExport) return Promise.reject(new Error("A diagram export is already running."));
        return new Promise((resolve, reject) => {
          const timeout = setTimeout(() => {
            pendingExport = null;
            reject(new Error("The Diagram Editor export timed out."));
          }, 30000);
          pendingExport = { resolve, reject, timeout };
          post({ action: "export", format: "png", spin: "1", scale: 1, border: 0, ...exportOptions });
        });
      },
      dispose() {
        if (disposed) return;
        disposed = true;
        clearStartupTimer();
        global.removeEventListener("message", handleMessage);
        iframe.removeEventListener?.("error", handleFrameError);
        if (pendingExport) {
          clearTimeout(pendingExport.timeout);
          pendingExport.reject(new Error("The Diagram Editor was closed."));
          pendingExport = null;
        }
        notifyLifecycle("disposed", "debug");
        iframe.src = "about:blank";
      }
    };
  }

  global.MarkdownViewerDiagramBridge = { createBridge, createEditorUrl };
})(typeof window !== "undefined" ? window : globalThis);
