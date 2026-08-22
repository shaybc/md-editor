(function(global) {
  "use strict";

  const XML_SCHEMA_INSTANCE_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";
  const COLLECTION_OWNER_PREFIX = "xml-validation";

  function registerMarkdownViewerXmlValidation(app, deps = {}) {
    const DOMParserRef = deps.DOMParser || global.DOMParser;
    const NeutralinoRef = deps.Neutralino || global.Neutralino || null;

    function normalizeSlashes(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    function isRemotePath(value) {
      const text = String(value || "");
      if (/^[A-Za-z]:[\\/]/.test(text)) return false;
      return /^[a-z][a-z0-9+.-]*:/i.test(text);
    }

    function isAbsolutePath(value) {
      return /^[A-Za-z]:\//.test(normalizeSlashes(value)) || normalizeSlashes(value).startsWith("/");
    }

    function dirname(filePath) {
      const normalized = normalizeSlashes(filePath);
      const index = normalized.lastIndexOf("/");
      return index >= 0 ? normalized.slice(0, index) : "";
    }

    function normalizeLocalPath(path) {
      const normalized = normalizeSlashes(path);
      const driveMatch = normalized.match(/^([A-Za-z]:)(\/.*)?$/);
      const prefix = driveMatch ? driveMatch[1] : normalized.startsWith("/") ? "" : "";
      const body = driveMatch ? (driveMatch[2] || "") : normalized;
      const absolute = driveMatch || body.startsWith("/");
      const parts = body.split("/").filter(Boolean);
      const stack = [];
      parts.forEach(function(part) {
        if (part === ".") return;
        if (part === "..") {
          if (stack.length && stack[stack.length - 1] !== "..") stack.pop();
          else if (!absolute) stack.push(part);
          return;
        }
        stack.push(part);
      });
      const joined = stack.join("/");
      if (driveMatch) return prefix + (joined ? "/" + joined : "/");
      if (absolute) return "/" + joined;
      return joined;
    }

    function resolveLocalPath(reference, filePath) {
      const value = String(reference || "").trim();
      if (!value || isRemotePath(value) || isAbsolutePath(value)) return normalizeSlashes(value);
      const base = dirname(filePath);
      return normalizeLocalPath(base ? base + "/" + value : value);
    }

    function extractParserLocation(message) {
      const text = String(message || "");
      const lineMatch = text.match(/\bline(?:\s+number)?\s*[:=]?\s*(\d+)/i);
      const columnMatch = text.match(/\bcol(?:umn)?(?:\s+number)?\s*[:=]?\s*(\d+)/i);
      return {
        line: lineMatch ? Number(lineMatch[1]) : 1,
        column: columnMatch ? Number(columnMatch[1]) : 1
      };
    }

    function createDiagnostic(severity, message, filePath, line = 1, column = 1) {
      return {
        severity,
        message,
        filePath: filePath || "",
        line,
        column,
        source: "xml"
      };
    }
    function normalizeSeverity(severity) {
      const value = String(severity || "").toLowerCase();
      if (value === "error" || value === "warning" || value === "info" || value === "hint") return value;
      return "error";
    }

    function normalizeActiveEditorDiagnostics(entries, filePath) {
      if (!Array.isArray(entries)) return [];
      return entries
        .map(function(entry) {
          const diagnostic = entry?.diagnostic || entry;
          const message = String(diagnostic?.message || entry?.message || "").trim();
          if (!message) return null;
          return createDiagnostic(
            normalizeSeverity(diagnostic?.severity || entry?.severity),
            message,
            filePath,
            Number(entry?.line || diagnostic?.line || 1) || 1,
            Number(entry?.column || diagnostic?.column || 1) || 1
          );
        })
        .filter(Boolean);
    }

    function readRootAttribute(root, localName) {
      return root?.getAttributeNS?.(XML_SCHEMA_INSTANCE_NAMESPACE, localName)
        || root?.getAttribute?.("xsi:" + localName)
        || root?.getAttribute?.(localName)
        || "";
    }

    function parseXml(text, filePath) {
      if (typeof DOMParserRef !== "function") {
        return {
          document: null,
          diagnostics: [createDiagnostic("warning", "XML parser is not available.", filePath)]
        };
      }
      const xmlDocument = new DOMParserRef().parseFromString(String(text || ""), "application/xml");
      const parserError = xmlDocument.querySelector?.("parsererror")
        || (xmlDocument.documentElement?.nodeName === "parsererror" ? xmlDocument.documentElement : null);
      if (!parserError) return { document: xmlDocument, diagnostics: [] };
      const message = parserError.textContent?.trim() || "XML is not well formed.";
      const location = extractParserLocation(message);
      return {
        document: null,
        diagnostics: [createDiagnostic("error", "XML is not well formed: " + message, filePath, location.line, location.column)]
      };
    }

    function resolveSchemaReferences(text, filePath, schemaPath) {
      const parsed = parseXml(text, filePath);
      if (!parsed.document?.documentElement) return { references: [], diagnostics: parsed.diagnostics };
      const references = [];
      const diagnostics = parsed.diagnostics.slice();
      if (schemaPath) {
        references.push({
          originalPath: String(schemaPath),
          resolvedPath: resolveLocalPath(schemaPath, filePath),
          manual: true
        });
      }
      const root = parsed.document.documentElement;
      String(readRootAttribute(root, "noNamespaceSchemaLocation") || "")
        .split(/\s+/)
        .filter(Boolean)
        .forEach(function(value) {
          references.push({ originalPath: value, resolvedPath: resolveLocalPath(value, filePath), manual: false });
        });
      const schemaLocationTokens = String(readRootAttribute(root, "schemaLocation") || "").split(/\s+/).filter(Boolean);
      if (schemaLocationTokens.length % 2 === 1) {
        diagnostics.push(createDiagnostic("warning", "XML schemaLocation should contain namespace and schema path pairs.", filePath));
      }
      for (let index = 1; index < schemaLocationTokens.length; index += 2) {
        const value = schemaLocationTokens[index];
        references.push({ namespace: schemaLocationTokens[index - 1], originalPath: value, resolvedPath: resolveLocalPath(value, filePath), manual: false });
      }
      return { references, diagnostics };
    }

    async function schemaExists(reference) {
      if (!reference?.resolvedPath || isRemotePath(reference.resolvedPath)) return true;
      if (!NeutralinoRef?.filesystem?.readFile) return true;
      try {
        await NeutralinoRef.filesystem.readFile(reference.resolvedPath);
        return true;
      } catch (error) {
        return false;
      }
    }

    function getCollectionOwner(filePath) {
      const key = normalizeSlashes(filePath || "active").toLowerCase();
      return COLLECTION_OWNER_PREFIX + ":" + key;
    }

    function getProblemsPanel() {
      return typeof deps.getProblemsPanel === "function" ? deps.getProblemsPanel() : deps.problemsPanel || app?.modules?.problemsPanel || null;
    }

    function publishDiagnostics(filePath, diagnostics) {
      const problemsPanel = getProblemsPanel();
      if (typeof problemsPanel?.setDiagnosticCollection === "function") {
        problemsPanel.setDiagnosticCollection(getCollectionOwner(filePath), diagnostics, { persistent: false, revealErrors: true });
      }
    }

    function notifyValidationResult(result) {
      const notify = deps.notify || app?.services?.notify || app?.modules?.notificationModal;
      if (typeof notify?.alert !== "function") return;
      const diagnostics = result?.diagnostics || [];
      if (result?.status === "empty") {
        void notify.alert({ title: "XML Validation", message: "Nothing to validate." });
        return;
      }
      if (!diagnostics.length) {
        void notify.alert({ title: "XML Validation", message: "No validation issues found." });
        return;
      }
      const errors = diagnostics.filter((item) => item.severity === "error").length;
      const warnings = diagnostics.filter((item) => item.severity === "warning").length;
      const parts = [];
      if (errors) parts.push(errors + " error" + (errors === 1 ? "" : "s"));
      if (warnings) parts.push(warnings + " warning" + (warnings === 1 ? "" : "s"));
      void notify.alert({ title: "XML Validation", message: parts.join(" and ") + " found. Open Problems for details." });
    }

    async function validateText(options = {}) {
      const text = String(options.text || "");
      const filePath = options.filePath || "";
      if (!text.trim()) {
        return { status: "empty", diagnostics: [], schemaReferences: [] };
      }
      const parsed = parseXml(text, filePath);
      const diagnostics = parsed.diagnostics.slice();
      const schemaResult = parsed.document ? resolveSchemaReferences(text, filePath, options.schemaPath) : { references: [], diagnostics: [] };
      diagnostics.push(...schemaResult.diagnostics);
      for (const reference of schemaResult.references) {
        if (!(await schemaExists(reference))) {
          diagnostics.push(createDiagnostic("warning", "Referenced XML schema was not found: " + reference.originalPath, filePath));
        }
      }
      return { status: diagnostics.length ? "issues" : "ok", diagnostics, schemaReferences: schemaResult.references };
    }

    async function validateActiveEditor(options = {}) {
      const text = typeof deps.getActiveEditorValue === "function" ? deps.getActiveEditorValue() : "";
      const activeTab = typeof deps.getActiveTab === "function" ? deps.getActiveTab() : null;
      const filePath = options.filePath || (typeof deps.getActiveEditorPath === "function" ? deps.getActiveEditorPath() : "") || activeTab?.sourceFilePath || activeTab?.sourceFileName || activeTab?.title || "";
      const result = await validateText({
        text,
        filePath,
        languageId: options.languageId || activeTab?.parseAsLanguageId || "",
        schemaPath: options.schemaPath
      });
      const editorDiagnostics = normalizeActiveEditorDiagnostics(
        typeof deps.getActiveEditorDiagnostics === "function" ? deps.getActiveEditorDiagnostics() : [],
        filePath
      );
      const languageServerDiagnostics = normalizeActiveEditorDiagnostics(
        typeof deps.getLanguageServerDiagnostics === "function" ? deps.getLanguageServerDiagnostics(filePath) : [],
        filePath
      );
      const liveDiagnostics = editorDiagnostics.concat(languageServerDiagnostics);
      if (liveDiagnostics.length) {
        result.diagnostics = result.diagnostics.concat(liveDiagnostics);
        result.status = "issues";
      }
      publishDiagnostics(filePath, result.diagnostics);
      notifyValidationResult(result);
      return result;
    }

    function clearDiagnosticsForPath(filePath) {
      const problemsPanel = getProblemsPanel();
      if (typeof problemsPanel?.clearDiagnosticCollection === "function") {
        problemsPanel.clearDiagnosticCollection(getCollectionOwner(filePath), { revealErrors: false });
      }
    }

    const api = {
      validateActiveEditor,
      validateText,
      clearDiagnosticsForPath,
      _test: {
        extractParserLocation,
        resolveLocalPath,
        resolveSchemaReferences,
        normalizeActiveEditorDiagnostics,
        getCollectionOwner
      }
    };
    app?.registerModule?.("xmlValidation", api);
    return api;
  }

  global.registerMarkdownViewerXmlValidation = registerMarkdownViewerXmlValidation;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerXmlValidation };
  }
})(typeof window !== "undefined" ? window : globalThis);
