(function(global, document) {
  "use strict";

  const STORAGE_KEY = "md-editor:last-startup-crash";
  let lastCrashSignature = "";

  function normalizeError(error) {
    const source = error?.error || error?.reason || error;
    if (!source) return { name: "Error", message: "Unknown startup error", stack: "" };
    return {
      name: source.name || "Error",
      message: source.message || String(source),
      stack: source.stack || "",
      filename: error?.filename || "",
      lineno: error?.lineno || "",
      colno: error?.colno || ""
    };
  }

  function getCrashLine(error, context) {
    const details = normalizeError(error);
    const payload = {
      timestamp: new Date().toISOString(),
      context: context || "startup",
      url: global.location?.href || "",
      userAgent: global.navigator?.userAgent || "",
      ...details
    };
    return {
      payload,
      text: `[${payload.timestamp}] [ERROR] [startup-crash] ${payload.context}: ${payload.name}: ${payload.message}`
    };
  }

  function persistCrash(payload) {
    try {
      global.localStorage?.setItem(STORAGE_KEY, JSON.stringify(payload, null, 2));
    } catch (_) {
      // localStorage may be unavailable during early WebView failures.
    }
  }

  function getSavedDebugPreferences() {
    try {
      const state = JSON.parse(global.localStorage?.getItem("markdownViewerGlobalState") || "{}");
      return {
        enabled: state.debugEnabled === true,
        logPath: String(state.debugLogPath || "").trim(),
        writeToFile: state.debugWriteToFile === true
      };
    } catch (_) {
      return { enabled: false, logPath: "", writeToFile: false };
    }
  }

  async function writeNativeCrashLog(line, payload) {
    const neutralino = global.Neutralino;
    if (!neutralino) return;
    const preferences = getSavedDebugPreferences();
    if (!preferences.enabled || !preferences.writeToFile || !preferences.logPath) return;
    try {
      if (neutralino.filesystem?.appendFile) {
        await neutralino.filesystem.appendFile(preferences.logPath, `${line}\n${payload.stack || ""}\n`);
      }
    } catch (logError) {
      console.warn("[md-editor] Failed to write startup crash log", logError);
    }
  }

  function isRecoverableRuntimeRejection(error, context) {
    if (context !== "unhandled rejection") return false;
    const details = normalizeError(error);
    return details.message === "Request timed out"
      && /LSPClient\.timeoutRequest/.test(details.stack || "")
      && /codemirror\.bundle\.js/.test(details.stack || "");
  }

  function ensureCrashOverlay(payload) {
    let overlay = document.getElementById("startup-crash-overlay");
    if (!overlay) {
      overlay = document.createElement("div");
      overlay.id = "startup-crash-overlay";
      overlay.className = "startup-crash-overlay";
      document.body.appendChild(overlay);
    }
    overlay.innerHTML = "";

    const panel = document.createElement("section");
    panel.className = "startup-crash-panel";
    const title = document.createElement("h1");
    title.textContent = /startup/i.test(payload.context || "") ? "MD-Editor could not launch" : "MD-Editor hit an error";
    const message = document.createElement("p");
    message.textContent = /startup/i.test(payload.context || "") ? "A startup error stopped the app before it could bind the interface." : "An unexpected app error interrupted the current action.";
    const summary = document.createElement("pre");
    summary.textContent = [
      `${payload.name}: ${payload.message}`,
      payload.filename ? `${payload.filename}:${payload.lineno || "?"}:${payload.colno || "?"}` : "",
      payload.stack || ""
    ].filter(Boolean).join("\n");
    const actions = document.createElement("div");
    actions.className = "startup-crash-actions";
    const reloadButton = document.createElement("button");
    reloadButton.type = "button";
    reloadButton.textContent = "Reload";
    reloadButton.addEventListener("click", () => global.location?.reload());
    const copyButton = document.createElement("button");
    copyButton.type = "button";
    copyButton.textContent = "Copy details";
    copyButton.addEventListener("click", () => {
      void global.navigator?.clipboard?.writeText?.(JSON.stringify(payload, null, 2));
    });
    actions.append(reloadButton, copyButton);
    panel.append(title, message, summary, actions);
    overlay.appendChild(panel);
  }

  function reportStartupCrash(error, context) {
    if (isRecoverableRuntimeRejection(error, context)) {
      console.warn("[md-editor] Ignored recoverable CodeMirror LSP timeout", normalizeError(error));
      return null;
    }
    const { payload, text } = getCrashLine(error, context);
    const signature = `${payload.context}:${payload.name}:${payload.message}:${payload.filename}:${payload.lineno}`;
    if (signature === lastCrashSignature) return payload;
    lastCrashSignature = signature;
    global.markdownViewerBootScreen?.markFailed?.(payload);
    persistCrash(payload);
    console.error(text, payload);
    if (document.body) ensureCrashOverlay(payload);
    else document.addEventListener("DOMContentLoaded", () => ensureCrashOverlay(payload), { once: true });
    void writeNativeCrashLog(text, payload);
    return payload;
  }

  function guardStartup(startup) {
    async function guardedStartup() {
      try {
        await startup();
      } catch (error) {
        reportStartupCrash(error, "DOMContentLoaded startup");
      }
    }

    if (document.readyState === "loading") {
      document.addEventListener("DOMContentLoaded", guardedStartup, { once: true });
    } else {
      void guardedStartup();
    }
  }

  global.addEventListener("error", (event) => reportStartupCrash(event, "window error"));
  global.addEventListener("unhandledrejection", (event) => reportStartupCrash(event, "unhandled rejection"));
  global.markdownViewerStartupErrors = {
    guardStartup,
    reportStartupCrash
  };
})(window, document);
