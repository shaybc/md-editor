(function(global) {
  "use strict";

  /** Own live Java language-server diagnostics and expose stable problem identities. */
  function registerMarkdownViewerQuickFixDiagnosticStore(app, deps = {}) {
    const diagnosticsByUri = new Map();
    const listeners = new Set();
    const bridge = deps.bridge;
    const registry = deps.registry;
    const problemsPanel = deps.problemsPanel;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    function severityName(value) {
      if (Number(value) === 1) return "error";
      if (Number(value) === 2) return "warning";
      return "info";
    }

    function getCodeValue(code) {
      return typeof code === "object" && code !== null ? code.value : code;
    }

    function createFingerprint(diagnostic) {
      const raw = diagnostic?.lspDiagnostic || diagnostic || {};
      const range = raw.range || diagnostic?.range || {};
      return [
        normalizePath(diagnostic?.filePath || registry?.fromFileUri?.(diagnostic?.uri || "") || ""),
        Number(range.start?.line) || 0,
        Number(range.start?.character) || 0,
        Number(range.end?.line) || 0,
        Number(range.end?.character) || 0,
        String(getCodeValue(raw.code) ?? ""),
        String(raw.message || diagnostic?.message || "")
      ].join("|");
    }

    function mapDiagnostic(uri, version, diagnostic, index) {
      const filePath = registry?.fromFileUri?.(uri) || "";
      const range = diagnostic?.range || {};
      return {
        severity: severityName(diagnostic?.severity),
        message: String(diagnostic?.message || "Unknown Java problem"),
        filePath,
        line: Math.max(1, (Number(range.start?.line) || 0) + 1),
        column: Math.max(1, (Number(range.start?.character) || 0) + 1),
        source: "jdt",
        uri,
        range,
        version: Number.isFinite(Number(version)) ? Number(version) : null,
        code: diagnostic?.code,
        data: diagnostic?.data,
        tags: diagnostic?.tags,
        relatedInformation: diagnostic?.relatedInformation,
        lspDiagnostic: diagnostic,
        diagnosticIndex: index,
        isLiveDiagnostic: true
      };
    }

    function notify(uri) {
      const current = getDiagnosticsForUri(uri);
      listeners.forEach((listener) => listener({ uri, diagnostics: current }));
    }

    function handleServerMessage(event) {
      if (event?.serverId !== "java") return;
      let message;
      try {
        message = JSON.parse(String(event.message || ""));
      } catch (_error) {
        return;
      }
      if (message?.method !== "textDocument/publishDiagnostics") return;
      const uri = String(message.params?.uri || "");
      if (!uri || !registry?.fromFileUri?.(uri)) return;
      const mapped = (Array.isArray(message.params?.diagnostics) ? message.params.diagnostics : [])
        .map((diagnostic, index) => mapDiagnostic(uri, message.params?.version, diagnostic, index));
      diagnosticsByUri.set(uri, mapped);
      notify(uri);
    }

    function getDiagnosticsForUri(uri) {
      return (diagnosticsByUri.get(String(uri || "")) || []).slice();
    }

    function getAllDiagnostics() {
      return Array.from(diagnosticsByUri.values()).flat().slice();
    }

    function findMatchingDiagnostic(problem) {
      if (!problem) return null;
      if (problem.isLiveDiagnostic && problem.lspDiagnostic) return problem;
      const exact = getAllDiagnostics().find((candidate) => createFingerprint(candidate) === createFingerprint(problem));
      if (exact) return exact;
      return getAllDiagnostics().find((candidate) =>
        normalizePath(candidate.filePath).toLowerCase() === normalizePath(problem.filePath).toLowerCase()
        && candidate.line === problem.line
        && candidate.message === problem.message
      ) || null;
    }

    /**
     * Match a CodeMirror diagnostic range to the live JDT diagnostic that produced it.
     * @param {object} request Active editor URI, LSP range, and diagnostic message.
     * @returns {object|null} The matching live diagnostic, or null when it is stale.
     */
    function findEditorDiagnostic(request) {
      const uri = String(request?.uri || "");
      const range = request?.range || {};
      const message = String(request?.message || "");
      if (!uri || !range.start || !range.end || !message) return null;
      return getDiagnosticsForUri(uri).find((candidate) => {
        const candidateRange = candidate.range || {};
        return Number(candidateRange.start?.line) === Number(range.start.line)
          && Number(candidateRange.start?.character) === Number(range.start.character)
          && Number(candidateRange.end?.line) === Number(range.end.line)
          && Number(candidateRange.end?.character) === Number(range.end.character)
          && candidate.message === message;
      }) || null;
    }

    function subscribe(listener) {
      if (typeof listener !== "function") return function() {};
      listeners.add(listener);
      return function unsubscribe() {
        listeners.delete(listener);
      };
    }

    function waitForChange(uri, previousFingerprint, timeoutMs = 8000) {
      return new Promise((resolve) => {
        let settled = false;
        const unsubscribe = subscribe((event) => {
          if (event.uri !== uri) return;
          const match = event.diagnostics.find((item) => createFingerprint(item) === previousFingerprint) || null;
          finish({ changed: true, match, diagnostics: event.diagnostics });
        });
        const timer = global.setTimeout(() => finish({ changed: false, match: null, diagnostics: getDiagnosticsForUri(uri) }), timeoutMs);
        function finish(result) {
          if (settled) return;
          settled = true;
          global.clearTimeout(timer);
          unsubscribe();
          resolve(result);
        }
      });
    }

    bridge?.subscribeServerMessages?.(handleServerMessage);

    const api = {
      createFingerprint,
      findEditorDiagnostic,
      findMatchingDiagnostic,
      getAllDiagnostics,
      getDiagnosticsForUri,
      subscribe,
      waitForChange
    };
    app.registerModule?.("quickFixDiagnosticStore", api);
    return api;
  }

  global.registerMarkdownViewerQuickFixDiagnosticStore = registerMarkdownViewerQuickFixDiagnosticStore;
})(typeof window !== "undefined" ? window : globalThis);
