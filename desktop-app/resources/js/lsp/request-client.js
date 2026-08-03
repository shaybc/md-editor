(function(global) {
  "use strict";

  /**
   * Register the shared JSON-RPC request helper used by language-server features.
   * @param {object} app Application module registry.
   * @param {object} deps Timing dependencies.
   * @returns {object} LSP request client API.
   */
  function registerMarkdownViewerLspRequestClient(app, deps = {}) {
    const defaultTimeoutMs = Number.isFinite(Number(deps.requestTimeoutMs))
      ? Math.max(1, Number(deps.requestTimeoutMs))
      : 15000;
    let nextRequestId = 1;

    /**
     * Send one JSON-RPC request through an existing LSP transport.
     * @param {object} transport Connected language-server transport.
     * @param {string} method LSP method name.
     * @param {object} params LSP request parameters.
     * @param {object} options Request inactivity, maximum timeout, keep-alive, and error-label options.
     * @returns {Promise<*>} Server result.
     */
    function request(transport, method, params, options = {}) {
      if (!transport?.send || !transport?.subscribe) {
        return Promise.reject(new Error("The language server transport is unavailable."));
      }
      const transportTimeoutMs = Number(transport.getRequestTimeoutMs?.(method));
      const timeoutMs = transportTimeoutMs > 0
        ? transportTimeoutMs
        : (Number.isFinite(Number(options.timeoutMs)) ? Math.max(1, Number(options.timeoutMs)) : defaultTimeoutMs);
      const label = String(options.label || method || "request");
      const id = `md-editor-lsp-${Date.now()}-${nextRequestId++}`;
      return new Promise((resolve, reject) => {
        let settled = false;
        let inactivityTimer = null;
        let maximumTimer = null;

        function armInactivityTimer() {
          global.clearTimeout(inactivityTimer);
          inactivityTimer = global.setTimeout(() => {
            finish(reject, new Error(`The language server did not respond to ${label}.`));
          }, timeoutMs);
        }

        const maximumTimeoutMs = Number.isFinite(Number(options.maximumTimeoutMs))
          ? Math.max(timeoutMs, Number(options.maximumTimeoutMs))
          : 0;
        if (maximumTimeoutMs > 0) {
          maximumTimer = global.setTimeout(() => {
            finish(reject, new Error(`The language server did not respond to ${label}.`));
          }, maximumTimeoutMs);
        }
        armInactivityTimer();

        function finish(callback, value) {
          if (settled) return;
          settled = true;
          global.clearTimeout(inactivityTimer);
          global.clearTimeout(maximumTimer);
          transport.unsubscribe?.(handleMessage);
          callback(value);
        }

        function handleMessage(message) {
          let parsed;
          try {
            parsed = JSON.parse(String(message || ""));
          } catch (_error) {
            return;
          }
          if (options.resetTimeoutOnMessage === true) armInactivityTimer();
          if (String(parsed.id ?? "") !== String(id)) return;
          if (parsed.error) {
            finish(reject, new Error(parsed.error.message || `The language server rejected ${label}.`));
            return;
          }
          finish(resolve, parsed.result);
        }

        transport.subscribe(handleMessage);
        try {
          transport.send(JSON.stringify({ jsonrpc: "2.0", id, method, params }));
        } catch (error) {
          finish(reject, error);
        }
      });
    }

    const api = { request };
    app.registerModule?.("lspRequestClient", api);
    return api;
  }

  global.registerMarkdownViewerLspRequestClient = registerMarkdownViewerLspRequestClient;
})(typeof window !== "undefined" ? window : globalThis);
