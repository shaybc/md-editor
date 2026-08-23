// OpenAPI explorer tree model builder.
(function(root) {
  "use strict";

  const HTTP_METHODS = new Set(["get", "put", "post", "delete", "options", "head", "patch", "trace"]);
  const COMPONENT_GROUP_KINDS = {
    schemas: "schema",
    responses: "response",
    parameters: "parameter",
    examples: "example",
    requestBodies: "requestBody",
    headers: "header",
    securitySchemes: "security",
    links: "link",
    callbacks: "callback",
    pathItems: "pathItem"
  };

  function isObject(value) {
    return !!value && typeof value === "object" && !Array.isArray(value);
  }

  function getReferenceLabel(value, fallback) {
    const ref = String(value?.$ref || "");
    if (!ref) return fallback;
    const parts = ref.split("/").filter(Boolean);
    return parts.length ? parts[parts.length - 1].replace(/~1/g, "/").replace(/~0/g, "~") : fallback;
  }

  function createParameterNode(parameter, index, pointer, idPrefix) {
    const name = getReferenceLabel(parameter, `Parameter ${index + 1}`);
    const location = parameter?.in ? `${parameter.in} ` : "";
    return {
      id: `${idPrefix}:parameter:${index}`,
      label: `${location}${parameter?.name || name}`.trim(),
      value: parameter?.required ? "required" : "",
      kind: "parameter",
      pointer: `${pointer}/${index}`
    };
  }

  function createResponseNode(statusCode, response, pointer, idPrefix) {
    return {
      id: `${idPrefix}:response:${statusCode}`,
      label: statusCode,
      value: getReferenceLabel(response, response?.description || ""),
      kind: "response",
      pointer: `${pointer}/${escapePointer(statusCode)}`
    };
  }

  function createTagNode(tagName, index, pointer, idPrefix) {
    return {
      id: `${idPrefix}:tag:${tagName || index}`,
      label: String(tagName || `Tag ${index + 1}`),
      kind: "tag",
      pointer: `${pointer}/${index}`
    };
  }

  function createFolderNode(id, label, pointer, children) {
    return { id, label, kind: "folder", pointer, children };
  }

  function createComponentFolderNode(document, key) {
    const values = document?.components?.[key] || {};
    const pointer = `/components/${escapePointer(key)}`;
    return createFolderNode(`components:${key}`, key, pointer, Object.keys(values).map((name) => ({
      id: `component:${key}:${name}`,
      label: name,
      kind: COMPONENT_GROUP_KINDS[key],
      pointer: `${pointer}/${escapePointer(name)}`
    })));
  }

  function buildComponentNodes(document) {
    return Object.keys(document?.components || {}).filter((key) => COMPONENT_GROUP_KINDS[key] && isObject(document?.components?.[key])).map((key) => createComponentFolderNode(document, key));
  }

  function buildOperationChildren(path, normalizedMethod, operation, operationPointer) {
    const idPrefix = `operation:${normalizedMethod}:${path}`;
    const children = [];
    Object.keys(operation || {}).forEach((key) => {
      if (key === "parameters" && Array.isArray(operation.parameters) && operation.parameters.length) {
        const pointer = `${operationPointer}/parameters`;
        children.push(createFolderNode(`${idPrefix}:parameters`, "Parameters", pointer, operation.parameters.map((parameter, index) => createParameterNode(parameter, index, pointer, idPrefix))));
      } else if (key === "responses" && isObject(operation.responses) && Object.keys(operation.responses).length) {
        const pointer = `${operationPointer}/responses`;
        children.push(createFolderNode(`${idPrefix}:responses`, "Responses", pointer, Object.entries(operation.responses).map(([statusCode, response]) => createResponseNode(statusCode, response, pointer, idPrefix))));
      } else if (key === "tags" && Array.isArray(operation.tags) && operation.tags.length) {
        const pointer = `${operationPointer}/tags`;
        children.push(createFolderNode(`${idPrefix}:tags`, "Tags", pointer, operation.tags.map((tagName, index) => createTagNode(tagName, index, pointer, idPrefix))));
      }
    });
    return children;
  }

  function operationLabel(method, path, operation) {
    return `${method.toUpperCase()} ${path}${operation?.summary ? ` - ${operation.summary}` : ""}`;
  }

  function buildGeneralNode(document) {
    const children = [];
    Object.keys(document || {}).forEach((key) => {
      if (key === "info") children.push({ id: "info", label: "info", kind: "property", pointer: "/info" });
      else if (key === "openapi" || key === "swagger") children.push({ id: "version", label: key, value: document?.[key] || "", kind: "property", pointer: `/${key}` });
    });
    return { id: "general", label: "General", kind: "section", children };
  }

  function buildPathsNode(document) {
    const pathsNode = { id: "paths", label: "Paths", kind: "section", pointer: "/paths", children: [] };
    Object.entries(document?.paths || {}).forEach(([path, pathItem]) => {
      const pathPointer = `/paths/${escapePointer(path)}`;
      const pathNode = { id: `path:${path}`, label: path, kind: "path", pointer: pathPointer, children: [] };
      Object.entries(pathItem || {}).forEach(([key, value]) => {
        if (key === "parameters" && Array.isArray(value) && value.length) {
          const pointer = `${pathPointer}/parameters`;
          pathNode.children.push(createFolderNode(`path:${path}:parameters`, "Parameters", pointer, value.map((parameter, index) => createParameterNode(parameter, index, pointer, `path:${path}`))));
          return;
        }
        const normalizedMethod = key.toLowerCase();
        if (!HTTP_METHODS.has(normalizedMethod)) return;
        const operationPointer = `${pathPointer}/${normalizedMethod}`;
        pathNode.children.push({
          id: `operation:${normalizedMethod}:${path}`,
          label: value?.summary || value?.operationId || normalizedMethod.toUpperCase(),
          kind: "operation",
          method: normalizedMethod.toUpperCase(),
          path,
          operation: value,
          pointer: operationPointer,
          children: buildOperationChildren(path, normalizedMethod, value, operationPointer)
        });
      });
      pathsNode.children.push(pathNode);
    });
    return pathsNode;
  }

  function buildServersNode(document) {
    return { id: "servers", label: "Servers", kind: "section", pointer: "/servers", children: (document?.servers || []).map((server, index) => ({
      id: `server-${index}`,
      label: server?.url || `Server ${index + 1}`,
      kind: "server",
      pointer: `/servers/${index}`
    })) };
  }

  function buildComponentsNode(document) {
    return { id: "components", label: "Components", kind: "section", pointer: "/components", children: buildComponentNodes(document) };
  }

  function buildSecurityNode(document) {
    if (Array.isArray(document?.security)) {
      const children = [];
      document.security.forEach((requirement, index) => {
        Object.keys(requirement || {}).forEach((name) => {
          children.push({
            id: `security:${index}:${name}`,
            label: name,
            kind: "security",
            pointer: `/security/${index}`
          });
        });
      });
      return { id: "security", label: "Security", kind: "section", pointer: "/security", children };
    }
    const definitions = document?.securityDefinitions || document?.components?.securitySchemes || {};
    const basePointer = document?.securityDefinitions ? "/securityDefinitions" : "/components/securitySchemes";
    return { id: "security", label: "Security", kind: "section", pointer: basePointer, children: Object.keys(definitions).map((name) => ({
      id: `security:${name}`,
      label: name,
      kind: "security",
      pointer: `${basePointer}/${escapePointer(name)}`
    })) };
  }

  function buildTagsNode(document) {
    return { id: "tags", label: "Tags", kind: "section", pointer: "/tags", children: (document?.tags || []).map((tag, index) => ({
      id: `tag:${tag?.name || index}`,
      label: tag?.name || `Tag ${index + 1}`,
      kind: "tag",
      pointer: `/tags/${index}`
    })) };
  }

  function buildOpenApiExplorer(document) {
    const rootNode = { id: "root", label: document?.info?.title || "OpenAPI", kind: "root", children: [] };
    const addedSections = new Set();
    const appendSection = (id, builder) => {
      if (addedSections.has(id)) return;
      rootNode.children.push(builder(document));
      addedSections.add(id);
    };
    Object.keys(document || {}).forEach((key) => {
      if (key === "info" || key === "openapi" || key === "swagger") appendSection("general", buildGeneralNode);
      else if (key === "servers") appendSection("servers", buildServersNode);
      else if (key === "paths") appendSection("paths", buildPathsNode);
      else if (key === "components") appendSection("components", buildComponentsNode);
      else if (key === "security" || key === "securityDefinitions") appendSection("security", buildSecurityNode);
      else if (key === "tags") appendSection("tags", buildTagsNode);
    });
    if (!addedSections.has("general") && (document?.info || document?.openapi || document?.swagger)) appendSection("general", buildGeneralNode);
    appendSection("paths", buildPathsNode);
    appendSection("servers", buildServersNode);
    appendSection("components", buildComponentsNode);
    appendSection("security", buildSecurityNode);
    appendSection("tags", buildTagsNode);
    return rootNode;
  }

  function escapePointer(value) {
    return String(value || "").replace(/~/g, "~0").replace(/\//g, "~1");
  }

  const api = { buildOpenApiExplorer, escapePointer };
  root.markdownViewerOpenApiExplorer = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
