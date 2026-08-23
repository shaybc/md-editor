// Java REST endpoint scanning for OpenAPI generation.
(function(root) {
  "use strict";

  const MAPPING_PATTERN = /@(GetMapping|PostMapping|PutMapping|PatchMapping|DeleteMapping|RequestMapping|GET|POST|PUT|PATCH|DELETE|Path)\s*(?:\(([^)]*)\))?/g;
  const METHOD_BY_ANNOTATION = {
    GetMapping: "GET",
    PostMapping: "POST",
    PutMapping: "PUT",
    PatchMapping: "PATCH",
    DeleteMapping: "DELETE",
    GET: "GET",
    POST: "POST",
    PUT: "PUT",
    PATCH: "PATCH",
    DELETE: "DELETE"
  };

  function normalizeRoute(value) {
    const path = String(value || "").trim();
    if (!path) return "";
    return `/${path.replace(/^\/+|\/+$/g, "")}`.replace(/\/+/g, "/");
  }

  function extractQuotedPath(args) {
    const text = String(args || "");
    const match = text.match(/(?:value\s*=\s*|path\s*=\s*)?["']([^"']+)["']/);
    return match ? match[1] : "";
  }

  function extractRequestMappingMethod(args) {
    const text = String(args || "");
    const match = text.match(/RequestMethod\.([A-Z]+)/);
    return match ? match[1] : "";
  }

  function findFollowingJaxRsPath(source, index) {
    const after = source.slice(index, index + 260);
    const match = after.match(/^\s*@Path\s*\(\s*["']([^"']+)["']\s*\)/m);
    return match ? match[1] : "";
  }

  function findNearestMethodName(source, index) {
    const after = source.slice(index, index + 800);
    const match = after.match(/\b(?:public|protected|private)?\s*(?:[\w<>\[\], ?]+\s+)+([a-zA-Z_$][\w$]*)\s*\(/);
    return match ? match[1] : "";
  }

  function scanJavaEndpoints(content, sourcePath = "") {
    const endpoints = [];
    const source = String(content || "");
    let classBasePath = "";
    let match;
    MAPPING_PATTERN.lastIndex = 0;
    while ((match = MAPPING_PATTERN.exec(source))) {
      const annotation = match[1];
      const args = match[2] || "";
      const before = source.slice(Math.max(0, match.index - 220), match.index);
      let route = normalizeRoute(extractQuotedPath(args));
      if (annotation === "Path" && /\bclass\s+[A-Z]/.test(source.slice(match.index, match.index + 500))) {
        classBasePath = route;
        continue;
      }
      if (annotation === "RequestMapping" && /\bclass\s+[A-Z]/.test(source.slice(match.index, match.index + 500))) {
        classBasePath = route;
        continue;
      }
      const method = METHOD_BY_ANNOTATION[annotation] || extractRequestMappingMethod(args);
      if (!method) continue;
      if (!route && /^(GET|POST|PUT|PATCH|DELETE)$/.test(annotation)) {
        route = normalizeRoute(findFollowingJaxRsPath(source, MAPPING_PATTERN.lastIndex));
      }
      const path = normalizeRoute(`${classBasePath}/${route || ""}`);
      endpoints.push({
        method,
        path: path || "/",
        operationId: findNearestMethodName(source, match.index) || `${method.toLowerCase()}${path.replace(/[^a-zA-Z0-9]+(.)/g, (_m, c) => c.toUpperCase())}`,
        sourcePath,
        line: before.split(/\r?\n/).length
      });
    }
    return endpoints;
  }

  const api = { scanJavaEndpoints, normalizeRoute };
  root.markdownViewerOpenApiEndpointScanner = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
