// OpenAPI document parsing, detection, and validation helpers.
(function(root) {
  "use strict";

  const OPENAPI_NAME_PATTERN = /(?:^|[\\/])(?:openapi|swagger|api-docs?)(?:[-_.][^\\/]*)?\.(?:ya?ml|json)$/i;
  const YAML_JSON_PATH_PATTERN = /\.(?:ya?ml|json)$/i;

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function parseJsonOrYaml(content, path = "", yamlLibrary = root.jsyaml) {
    const text = String(content || "");
    if (/\.json$/i.test(String(path || ""))) return JSON.parse(text);
    if (yamlLibrary?.load) return yamlLibrary.load(text);
    return JSON.parse(text);
  }

  function isOpenApiDocument(value) {
    if (!isObject(value) || !isObject(value.info) || !isObject(value.paths)) return false;
    if (typeof value.openapi === "string" && /^3\.\d+(?:\.\d+)?(?:[-+].*)?$/.test(value.openapi.trim())) return true;
    return typeof value.swagger === "string" && value.swagger.trim() === "2.0";
  }

  function isLikelyOpenApiPath(path) {
    return OPENAPI_NAME_PATTERN.test(String(path || ""));
  }

  function isOpenApiCandidatePath(path) {
    return YAML_JSON_PATH_PATTERN.test(String(path || ""));
  }

  function detectOpenApiDocument(content, path = "", options = {}) {
    if (!isOpenApiCandidatePath(path)) return { openapi: false, reason: "unsupported-extension" };
    try {
      const document = parseJsonOrYaml(content, path, options.yamlLibrary);
      const openapi = isOpenApiDocument(document);
      return {
        openapi,
        document: openapi ? document : null,
        reason: openapi ? "matched-root-fields" : (isLikelyOpenApiPath(path) ? "likely-name-invalid-root" : "not-openapi"),
        likely: isLikelyOpenApiPath(path)
      };
    } catch (error) {
      return {
        openapi: false,
        document: null,
        reason: "parse-error",
        likely: isLikelyOpenApiPath(path),
        error
      };
    }
  }

  function normalizePathKey(value) {
    return String(value || "").trim() || "$";
  }

  function findLineColumnForPath(content, path) {
    const text = String(content || "");
    const key = normalizePathKey(path).split(".").filter(Boolean).pop();
    if (!key || key === "$") return { line: 1, column: 1 };
    const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const pattern = new RegExp(`(^|\\n)(\\s*)(["'']?${escaped}["'']?\\s*:|"${escaped}"\\s*:)`);
    const match = pattern.exec(text);
    if (!match) return { line: 1, column: 1 };
    const before = text.slice(0, match.index + match[1].length);
    const lines = before.split(/\r?\n/);
    return { line: lines.length, column: (lines[lines.length - 1] || "").length + match[2].length + 1 };
  }

  function createDiagnosticFromIssue(issue, content, filePath) {
    const location = findLineColumnForPath(content, issue?.path || "$", filePath);
    return {
      severity: issue?.severity === "error" ? "error" : (issue?.severity === "info" ? "info" : "warning"),
      message: String(issue?.message || "OpenAPI validation issue."),
      filePath: String(filePath || ""),
      line: location.line || 1,
      column: location.column || 1,
      source: "openapi",
      code: issue?.code || "",
      openApiPath: issue?.path || "$",
      openApiPointer: issue?.pointer || ""
    };
  }

  function createParseDiagnostic(error, filePath) {
    const line = Number(error?.linePos?.[0]?.line || error?.lineNumber || error?.mark?.line || 0) + (error?.mark?.line !== undefined ? 1 : 0);
    const column = Number(error?.linePos?.[0]?.col || error?.columnNumber || error?.mark?.column || 0) + (error?.mark?.column !== undefined ? 1 : 0);
    return {
      severity: "error",
      message: `Unable to parse OpenAPI document: ${String(error?.message || error || "Unknown parse error")}`,
      filePath: String(filePath || ""),
      line: line || 1,
      column: column || 1,
      source: "openapi",
      code: "openapi.parseError",
      openApiPath: "$",
      openApiPointer: ""
    };
  }

  function createDiagnosticsFromIssues(issues, content, filePath) {
    return (Array.isArray(issues) ? issues : []).map((issue) => createDiagnosticFromIssue(issue, content, filePath));
  }

  function validateOpenApiText(content, path = "", options = {}) {
    try {
      const document = parseJsonOrYaml(content, path, options.yamlLibrary);
      const issues = collectValidationIssues(document);
      const diagnostics = createDiagnosticsFromIssues(issues, content, path);
      return {
        status: diagnostics.some((item) => item.severity === "error") ? "issues" : (diagnostics.length ? "warnings" : "ok"),
        document,
        issues,
        diagnostics
      };
    } catch (error) {
      const diagnostic = createParseDiagnostic(error, path);
      return { status: "parse-error", document: null, issues: [], diagnostics: [diagnostic], error };
    }
  }

  function collectValidationIssues(document) {
    const issues = [];
    if (!isObject(document)) {
      issues.push({ severity: "error", code: "openapi.rootNotObject", path: "$", pointer: "", message: "Document root must be an object." });
      return issues;
    }
    const hasOpenApiVersion = typeof document.openapi === "string" && /^3\.\d+(?:\.\d+)?(?:[-+].*)?$/.test(document.openapi.trim());
    const hasSwaggerVersion = typeof document.swagger === "string" && document.swagger.trim() === "2.0";
    if (!isOpenApiDocument(document)) {
      issues.push({ severity: "error", code: "openapi.missingRootFields", path: "$", pointer: "", message: "Expected OpenAPI 3.x or Swagger 2.0 root fields with info and paths." });
    }
    if (!hasOpenApiVersion && !hasSwaggerVersion) issues.push({ severity: "error", code: "openapi.missingVersionField", path: "openapi", pointer: "/openapi", message: "Missing OpenAPI version field." });
    if (!isObject(document.info)) issues.push({ severity: "error", code: "openapi.missingInfo", path: "info", pointer: "/info", message: "Missing info object." });
    if (!document.info?.title) issues.push({ severity: "warning", code: "openapi.missingInfoTitle", path: "info.title", pointer: "/info/title", message: "Missing API title." });
    if (!document.info?.version) issues.push({ severity: "warning", code: "openapi.missingInfoVersion", path: "info.version", pointer: "/info/version", message: "Missing API version." });
    if (!isObject(document.paths)) issues.push({ severity: "error", code: "openapi.missingPaths", path: "paths", pointer: "/paths", message: "Missing paths object." });
    Object.entries(document.paths || {}).forEach(([pathKey, pathItem]) => {
      if (!isObject(pathItem)) {
        issues.push({ severity: "error", code: "openapi.pathItemNotObject", path: `paths.${pathKey}`, pointer: `/paths/${pathKey.replace(/~/g, "~0").replace(/\//g, "~1")}`, message: "Path item must be an object." });
        return;
      }
      Object.entries(pathItem).forEach(([method, operation]) => {
        if (!/^(get|put|post|delete|options|head|patch|trace)$/i.test(method)) return;
        const operationPointer = `/paths/${pathKey.replace(/~/g, "~0").replace(/\//g, "~1")}/${method}`;
        if (!isObject(operation.responses)) issues.push({ severity: "warning", code: "openapi.missingOperationResponses", path: `paths.${pathKey}.${method}.responses`, pointer: `${operationPointer}/responses`, message: "Operation has no responses object." });
        if (!operation.operationId) issues.push({ severity: "warning", code: "openapi.missingOperationId", path: `paths.${pathKey}.${method}.operationId`, pointer: `${operationPointer}/operationId`, message: "Operation has no operationId." });
      });
    });
    return issues;
  }

  const api = {
    detectOpenApiDocument,
    isLikelyOpenApiPath,
    isOpenApiCandidatePath,
    isOpenApiDocument,
    parseJsonOrYaml,
    collectValidationIssues,
    createDiagnosticsFromIssues,
    createParseDiagnostic,
    findLineColumnForPath,
    validateOpenApiText
  };
  root.markdownViewerOpenApiDetector = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
