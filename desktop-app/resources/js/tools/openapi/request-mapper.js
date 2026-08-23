// OpenAPI operation to API Client request mapping.
(function(root) {
  "use strict";

  function decodePointerSegment(segment) {
    return String(segment || "").replace(/~1/g, "/").replace(/~0/g, "~");
  }

  function resolveLocalRef(document, ref) {
    const value = String(ref || "");
    if (!value.startsWith("#/")) return null;
    let current = document;
    for (const segment of value.slice(2).split("/").map(decodePointerSegment)) {
      if (current == null) return null;
      current = Array.isArray(current) ? current[Number(segment)] : current[segment];
    }
    return current && typeof current === "object" ? current : null;
  }

  function resolveOpenApiValue(document, value, seen = new Set()) {
    if (!value || typeof value !== "object" || !value.$ref) return value;
    const ref = String(value.$ref || "");
    if (seen.has(ref)) return value;
    const resolved = resolveLocalRef(document, ref);
    if (!resolved) return value;
    seen.add(ref);
    return resolveOpenApiValue(document, resolved, seen);
  }

  function firstJsonExample(schema, document, seen) {
    schema = resolveOpenApiValue(document, schema, seen);
    if (!schema || typeof schema !== "object") return "";
    if (schema.example !== undefined) return JSON.stringify(schema.example, null, 2);
    if (schema.default !== undefined) return JSON.stringify(schema.default, null, 2);
    if (schema.type === "object" || schema.properties) {
      const object = {};
      Object.entries(schema.properties || {}).forEach(([name, property]) => {
        object[name] = sampleForSchema(property, document, seen);
      });
      return JSON.stringify(object, null, 2);
    }
    return JSON.stringify(sampleForSchema(schema, document, seen), null, 2);
  }

  function sampleForSchema(schema, document, seen = new Set()) {
    schema = resolveOpenApiValue(document, schema, seen);
    if (!schema || typeof schema !== "object") return "string";
    if (schema.example !== undefined) return schema.example;
    if (schema.default !== undefined) return schema.default;
    if (Array.isArray(schema.enum) && schema.enum.length) return schema.enum[0];
    if (schema.type === "integer" || schema.type === "number") return 0;
    if (schema.type === "boolean") return false;
    if (schema.type === "array") return [sampleForSchema(schema.items, document, seen)];
    if (schema.type === "object" || schema.properties) {
      const value = {};
      Object.entries(schema.properties || {}).forEach(([name, property]) => { value[name] = sampleForSchema(property, document, seen); });
      return value;
    }
    return "string";
  }

  function resolveServerUrl(document, selectedServerUrl) {
    const explicit = String(selectedServerUrl || "").trim();
    if (explicit) return explicit.replace(/\/+$/, "");
    const firstServer = Array.isArray(document?.servers) ? document.servers[0] : null;
    return String(firstServer?.url || "").replace(/\/+$/, "");
  }

  function collectParameters(document, pathItem, operation) {
    return []
      .concat(Array.isArray(pathItem?.parameters) ? pathItem.parameters : [])
      .concat(Array.isArray(operation?.parameters) ? operation.parameters : [])
      .map((parameter) => resolveOpenApiValue(document, parameter))
      .filter((parameter) => parameter && typeof parameter === "object");
  }

  function getParameterExample(document, parameter) {
    return parameter?.example ?? parameter?.schema?.example ?? sampleForSchema(parameter?.schema, document);
  }

  function getMediaTypeExample(document, mediaType) {
    const resolved = resolveOpenApiValue(document, mediaType);
    if (!resolved || typeof resolved !== "object") return "";
    if (resolved.example !== undefined) return JSON.stringify(resolved.example, null, 2);
    const examples = resolved.examples && typeof resolved.examples === "object" ? Object.values(resolved.examples) : [];
    const firstExample = examples.length ? resolveOpenApiValue(document, examples[0]) : null;
    if (firstExample?.value !== undefined) return JSON.stringify(firstExample.value, null, 2);
    return resolved.schema ? firstJsonExample(resolved.schema, document) : "";
  }

  function selectRequestBodyMediaType(content) {
    if (!content || typeof content !== "object") return null;
    return content["application/json"] || content["application/*+json"] || Object.values(content)[0] || null;
  }

  function createOpenApiClientRequest(document, operationRef, options = {}) {
    const method = String(operationRef?.method || "").toUpperCase();
    const path = String(operationRef?.path || "");
    const pathItem = document?.paths?.[path] || {};
    const operation = operationRef?.operation || pathItem[method.toLowerCase()] || {};
    const serverUrl = resolveServerUrl(document, options.serverUrl);
    const parameters = collectParameters(document, pathItem, operation);
    let urlPath = path.replace(/\{([^}]+)\}/g, (_match, name) => {
      const parameter = parameters.find((item) => item?.in === "path" && item.name === name);
      return encodeURIComponent(String(getParameterExample(document, parameter)));
    });
    const queryPairs = parameters
      .filter((item) => item?.in === "query")
      .map((item) => `${encodeURIComponent(item.name)}=${encodeURIComponent(String(getParameterExample(document, item)))}`);
    const paramsText = parameters
      .filter((item) => item?.in === "query")
      .map((item) => `${item.name}: ${String(getParameterExample(document, item))}`)
      .join("\n");
    const headerLines = parameters
      .filter((item) => item?.in === "header")
      .map((item) => `${item.name}: ${String(getParameterExample(document, item))}`);
    const requestBody = resolveOpenApiValue(document, operation.requestBody);
    const bodyMediaType = selectRequestBodyMediaType(requestBody?.content);
    const bodyText = bodyMediaType ? getMediaTypeExample(document, bodyMediaType) : "";
    if (queryPairs.length) urlPath += `${urlPath.includes("?") ? "&" : "?"}${queryPairs.join("&")}`;
    const headersText = ["Content-Type: application/json"].concat(headerLines).join("\n");
    return {
      method: method || "GET",
      url: `${serverUrl}${urlPath}`,
      paramsText,
      headersText,
      bodyText,
      bodyMode: bodyText ? "json" : "none",
      formDataText: "",
      name: operation.summary || operation.operationId || `${method} ${path}`
    };
  }

  const api = { createOpenApiClientRequest, sampleForSchema };
  root.markdownViewerOpenApiRequestMapper = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
