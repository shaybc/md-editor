// WSDL 1.1 parser for the SOAP Client railbar tool.
(function(root) {
  "use strict";

  const SOAP11_BINDING_NS = "http://schemas.xmlsoap.org/wsdl/soap/";
  const SOAP12_BINDING_NS = "http://schemas.xmlsoap.org/wsdl/soap12/";
  const XSD_NS = "http://www.w3.org/2001/XMLSchema";

  function parseAttributes(source) {
    const attrs = {};
    const attrPattern = /([^\s=]+)\s*=\s*(["'])(.*?)\2/g;
    let match = attrPattern.exec(source);
    while (match) {
      attrs[match[1]] = match[3];
      match = attrPattern.exec(source);
    }
    return attrs;
  }

  function localName(name) {
    return String(name || "").split(":").pop();
  }

  function parseXmlTree(source) {
    const rootNode = { name: "#document", localName: "#document", attrs: {}, children: [], parent: null };
    const stack = [rootNode];
    const tokenPattern = /<[^>]+>/g;
    let match = tokenPattern.exec(String(source || ""));
    while (match) {
      const token = match[0];
      if (/^<\?/.test(token) || /^<!--/.test(token) || /^<!/.test(token)) {
        match = tokenPattern.exec(source);
        continue;
      }
      if (/^<\//.test(token)) {
        if (stack.length > 1) stack.pop();
        match = tokenPattern.exec(source);
        continue;
      }
      const selfClosing = /\/>$/.test(token);
      const body = token.slice(1, token.length - (selfClosing ? 2 : 1)).trim();
      const name = body.split(/\s+/, 1)[0];
      const node = {
        name,
        localName: localName(name),
        attrs: parseAttributes(body),
        children: [],
        parent: stack[stack.length - 1]
      };
      node.parent.children.push(node);
      if (!selfClosing) stack.push(node);
      match = tokenPattern.exec(source);
    }
    return rootNode;
  }

  function childElements(node, name) {
    return (node?.children || []).filter((child) => !name || child.localName === name);
  }

  function descendants(node, name) {
    const results = [];
    function visit(current) {
      childElements(current).forEach((child) => {
        if (!name || child.localName === name) results.push(child);
        visit(child);
      });
    }
    visit(node);
    return results;
  }

  function getAttr(node, localAttrName) {
    const wanted = String(localAttrName || "");
    const key = Object.keys(node?.attrs || {}).find((attrName) => localName(attrName) === wanted);
    return key ? node.attrs[key] : "";
  }

  function splitQName(value) {
    const text = String(value || "").trim();
    const parts = text.split(":");
    return {
      raw: text,
      prefix: parts.length > 1 ? parts[0] : "",
      localName: parts.length > 1 ? parts.slice(1).join(":") : text
    };
  }

  function normalizeId(value) {
    return String(value || "soap").replace(/[^a-zA-Z0-9_-]+/g, "_").replace(/^_+|_+$/g, "") || "soap";
  }

  function readMessages(definitions) {
    const messages = new Map();
    childElements(definitions, "message").forEach((messageNode) => {
      const name = getAttr(messageNode, "name");
      if (!name) return;
      messages.set(name, {
        name,
        parts: childElements(messageNode, "part").map((part) => ({
          name: getAttr(part, "name"),
          element: splitQName(getAttr(part, "element")),
          type: splitQName(getAttr(part, "type"))
        }))
      });
    });
    return messages;
  }

  function readPortTypes(definitions) {
    const portTypes = new Map();
    childElements(definitions, "portType").forEach((portTypeNode) => {
      const name = getAttr(portTypeNode, "name");
      if (!name) return;
      const operations = new Map();
      childElements(portTypeNode, "operation").forEach((operationNode) => {
        const operationName = getAttr(operationNode, "name");
        if (!operationName) return;
        operations.set(operationName, {
          name: operationName,
          inputMessage: splitQName(getAttr(childElements(operationNode, "input")[0], "message")),
          outputMessage: splitQName(getAttr(childElements(operationNode, "output")[0], "message"))
        });
      });
      portTypes.set(name, { name, operations });
    });
    return portTypes;
  }

  function readSchemas(definitions) {
    const schemas = new Map();
    descendants(definitions, "schema").forEach((schemaNode) => {
      const targetNamespace = getAttr(schemaNode, "targetNamespace");
      childElements(schemaNode, "element").forEach((elementNode) => {
        const name = getAttr(elementNode, "name");
        if (!name) return;
        const sequence = descendants(elementNode, "sequence")[0];
        const children = childElements(sequence, "element").map((child) => ({
          name: getAttr(child, "name"),
          type: splitQName(getAttr(child, "type")).localName || "string",
          minOccurs: getAttr(child, "minOccurs") || "1",
          maxOccurs: getAttr(child, "maxOccurs") || "1"
        })).filter((child) => child.name);
        schemas.set(name, { name, targetNamespace, children });
      });
    });
    return schemas;
  }

  function readBindings(definitions, portTypes) {
    const bindings = new Map();
    childElements(definitions, "binding").forEach((bindingNode) => {
      const name = getAttr(bindingNode, "name");
      if (!name) return;
      const type = splitQName(getAttr(bindingNode, "type"));
      const soapBinding = childElements(bindingNode).find((child) => child.localName === "binding");
      const soapVersion = soapBinding?.name?.toLowerCase().includes("soap12") ? "1.2" : "1.1";
      const operations = new Map();
      childElements(bindingNode, "operation").forEach((bindingOperationNode) => {
        const operationName = getAttr(bindingOperationNode, "name");
        if (!operationName) return;
        const soapOperation = childElements(bindingOperationNode).find((child) => child.localName === "operation");
        const portTypeOperation = portTypes.get(type.localName)?.operations.get(operationName) || {};
        operations.set(operationName, {
          ...portTypeOperation,
          name: operationName,
          bindingName: name,
          portTypeName: type.localName,
          soapAction: getAttr(soapOperation, "soapAction"),
          soapVersion
        });
      });
      bindings.set(name, { name, type: type.localName, soapVersion, operations });
    });
    return bindings;
  }

  function readServices(definitions, bindings, messages, schemas, documentBase) {
    const services = [];
    const operations = [];
    childElements(definitions, "service").forEach((serviceNode) => {
      const serviceName = getAttr(serviceNode, "name") || "Service";
      const service = { name: serviceName, ports: [] };
      childElements(serviceNode, "port").forEach((portNode) => {
        const portName = getAttr(portNode, "name") || "Port";
        const bindingName = splitQName(getAttr(portNode, "binding")).localName;
        const binding = bindings.get(bindingName);
        const addressNode = childElements(portNode).find((child) => child.localName === "address");
        const endpointUrl = getAttr(addressNode, "location");
        const port = { name: portName, bindingName, endpointUrl, operations: [] };
        binding?.operations.forEach((bindingOperation) => {
          const inputMessage = messages.get(bindingOperation.inputMessage?.localName || "");
          const inputPart = inputMessage?.parts?.[0] || null;
          const inputElementName = inputPart?.element?.localName || "";
          const schemaElement = inputElementName ? schemas.get(inputElementName) || null : null;
          const operation = {
            id: `${documentBase}:${normalizeId(serviceName)}:${normalizeId(portName)}:${normalizeId(bindingOperation.name)}`,
            name: bindingOperation.name,
            serviceName,
            portName,
            bindingName,
            portTypeName: bindingOperation.portTypeName || "",
            endpointUrl,
            soapAction: bindingOperation.soapAction || "",
            soapVersion: bindingOperation.soapVersion || binding?.soapVersion || "1.1",
            inputMessageName: bindingOperation.inputMessage?.localName || "",
            outputMessageName: bindingOperation.outputMessage?.localName || "",
            inputElementName,
            inputElement: schemaElement,
            targetNamespace: schemaElement?.targetNamespace || getAttr(definitions, "targetNamespace") || ""
          };
          operations.push(operation);
          port.operations.push(operation);
        });
        service.ports.push(port);
      });
      services.push(service);
    });
    return { services, operations };
  }

  /**
   * Parses a WSDL 1.1 document into the SOAP Client's normalized model.
   * @param {string} source WSDL XML source.
   * @param {string} sourceLabel URL or file label used for diagnostics and display.
   * @returns {object} Normalized WSDL document.
   */
  function parseWsdl(source, sourceLabel) {
    const diagnostics = [];
    const tree = parseXmlTree(source);
    const definitions = childElements(tree).find((child) => child.localName === "definitions");
    if (!definitions) {
      return { id: "", name: sourceLabel || "WSDL", sourceLabel: sourceLabel || "", targetNamespace: "", services: [], bindings: [], operations: [], diagnostics: ["Only WSDL 1.1 documents with a definitions root are supported."] };
    }
    const targetNamespace = getAttr(definitions, "targetNamespace");
    const name = getAttr(definitions, "name") || sourceLabel || "WSDL";
    const id = normalizeId(`${sourceLabel || name}_${targetNamespace || ""}`);
    const messages = readMessages(definitions);
    const portTypes = readPortTypes(definitions);
    const schemas = readSchemas(definitions);
    const bindingsByName = readBindings(definitions, portTypes);
    const { services, operations } = readServices(definitions, bindingsByName, messages, schemas, id);
    if (!services.length) diagnostics.push("No WSDL services were found.");
    if (!operations.length) diagnostics.push("No SOAP operations were found.");
    return {
      id,
      name,
      sourceLabel: sourceLabel || name,
      targetNamespace,
      services,
      bindings: Array.from(bindingsByName.values()),
      operations,
      diagnostics
    };
  }

  const api = { parseWsdl, _parseXmlTree: parseXmlTree, SOAP11_BINDING_NS, SOAP12_BINDING_NS, XSD_NS };
  root.markdownViewerSoapWsdlParser = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
