(function(global) {
  "use strict";

  function registerMarkdownViewerRegexTesterJavascriptEngine(app, deps = {}) {
    const workerUrl = deps.workerUrl || "js/tools/regex-tester/javascript-worker.js";
    const timeoutMs = Number(deps.timeoutMs || 750);
    let worker = null;
    let pending = null;

    function createWorker() {
      worker = new (deps.Worker || global.Worker)(workerUrl);
      worker.onmessage = function(event) {
        if (!pending || event.data?.requestId !== pending.requestId) return;
        const current = pending;
        pending = null;
        clearTimeout(current.timer);
        current.resolve(event.data);
      };
      worker.onerror = function(event) {
        failPending(event?.message || "JavaScript regular expression worker failed.", "worker");
        restartWorker();
      };
      return worker;
    }

    function failPending(message, type) {
      if (!pending) return;
      const current = pending;
      pending = null;
      clearTimeout(current.timer);
      current.resolve({
        requestId: current.requestId,
        engine: "javascript",
        ok: false,
        elapsedMs: timeoutMs,
        matches: [],
        replacementOutput: "",
        replacementRanges: [],
        truncated: false,
        error: { type, message }
      });
    }

    function restartWorker() {
      worker?.terminate?.();
      worker = null;
    }

    function evaluate(request) {
      if (pending) failPending("Evaluation was superseded by a newer request.", "cancelled");
      try {
        if (!worker) createWorker();
      } catch (error) {
        return Promise.resolve({
          requestId: request.requestId,
          engine: "javascript",
          ok: false,
          elapsedMs: 0,
          matches: [],
          replacementOutput: "",
          replacementRanges: [],
          truncated: false,
          error: { type: "worker", message: error?.message || "JavaScript regular expression worker is unavailable." }
        });
      }
      return new Promise((resolve) => {
        const timer = setTimeout(() => {
          failPending("Evaluation exceeded the 750 ms timeout.", "timeout");
          restartWorker();
        }, timeoutMs);
        pending = { requestId: request.requestId, resolve, timer };
        worker.postMessage(request);
      });
    }

    function dispose() {
      failPending("Evaluation was cancelled.", "cancelled");
      restartWorker();
    }

    const api = { evaluate, dispose };
    app?.registerModule?.("regexTesterJavascriptEngine", api);
    return api;
  }

  global.registerMarkdownViewerRegexTesterJavascriptEngine = registerMarkdownViewerRegexTesterJavascriptEngine;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerRegexTesterJavascriptEngine };
})(typeof window !== "undefined" ? window : globalThis);
