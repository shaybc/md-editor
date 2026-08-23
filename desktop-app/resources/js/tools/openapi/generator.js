// OpenAPI document generation and endpoint merge helpers.
(function(root) {
  "use strict";

  function createBaseDocument(title = "Generated API") {
    return {
      openapi: "3.0.3",
      info: { title, version: "1.0.0" },
      servers: [{ url: "http://localhost:8080" }],
      paths: {}
    };
  }

  function createOperation(endpoint) {
    return {
      operationId: endpoint.operationId || `${String(endpoint.method || "get").toLowerCase()}Operation`,
      tags: [endpoint.sourcePath ? endpoint.sourcePath.split(/[\\/]/).pop().replace(/\.[^.]+$/, "") : "default"],
      responses: {
        "200": {
          description: "Successful response"
        }
      }
    };
  }

  const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);

  function isHttpMethodKey(key) {
    return HTTP_METHODS.has(String(key || "").toLowerCase());
  }

  function removeMovedOperation(next, endpoint) {
    const operationId = endpoint?.operationId;
    if (!operationId || !next?.paths || typeof next.paths !== "object") return;
    const targetPath = endpoint.path || "/";
    const targetMethod = String(endpoint.method || "GET").toLowerCase();
    Object.entries(next.paths).forEach(([path, pathItem]) => {
      if (!pathItem || typeof pathItem !== "object") return;
      Object.keys(pathItem).forEach((methodKey) => {
        const method = String(methodKey || "").toLowerCase();
        if (!isHttpMethodKey(method) || (path === targetPath && method === targetMethod)) return;
        const operation = pathItem[methodKey];
        if (operation && typeof operation === "object" && operation.operationId === operationId) delete pathItem[methodKey];
      });
      if (!Object.keys(pathItem).length) delete next.paths[path];
    });
  }

  function mergeEndpointsIntoOpenApi(document, endpoints) {
    const next = document && typeof document === "object" ? JSON.parse(JSON.stringify(document)) : createBaseDocument();
    if (!next.openapi && !next.swagger) next.openapi = "3.0.3";
    if (!next.info) next.info = { title: "Generated API", version: "1.0.0" };
    if (!next.paths) next.paths = {};
    (endpoints || []).forEach((endpoint) => {
      removeMovedOperation(next, endpoint);
      const path = endpoint.path || "/";
      const method = String(endpoint.method || "GET").toLowerCase();
      if (!next.paths[path]) next.paths[path] = {};
      next.paths[path][method] = {
        ...createOperation(endpoint),
        ...(next.paths[path][method] || {})
      };
    });
    return next;
  }

  function stringifyOpenApi(document, path = "") {
    if (/\.json$/i.test(String(path || ""))) return `${JSON.stringify(document, null, 2)}\n`;
    const yaml = root.jsyaml;
    if (yaml?.dump) return yaml.dump(document, { lineWidth: 120 });
    return `${JSON.stringify(document, null, 2)}\n`;
  }

  const api = { createBaseDocument, mergeEndpointsIntoOpenApi, stringifyOpenApi };
  root.markdownViewerOpenApiGenerator = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
