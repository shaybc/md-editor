(function(global) {
  "use strict";

  /**
   * Create demo XML documents from sample XML structure.
   * @param {object} app Shared MD-Editor application object.
   * @param {object} deps Optional parser overrides.
   * @returns {object} XML stub generator API.
   */
  function registerMarkdownViewerXmlStubGenerator(app, deps = {}) {
    const DOMParserRef = deps.DOMParser || global.DOMParser;
    const XML_TEXT_NODE = 3;
    const XML_ELEMENT_NODE = 1;

    function escapeXmlText(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function escapeXmlAttribute(value) {
      return escapeXmlText(value).replace(/"/g, "&quot;");
    }

    function getNodeName(node) {
      return String(node?.nodeName || node?.localName || "element");
    }

    function parseXmlDocument(source) {
      if (typeof DOMParserRef !== "function") {
        throw new Error("XML parsing is not available in this runtime.");
      }
      const xmlDocument = new DOMParserRef().parseFromString(String(source || ""), "application/xml");
      const parserError = xmlDocument.querySelector("parsererror");
      if (parserError) {
        throw new Error(parserError.textContent?.trim() || "The selected content does not contain valid XML.");
      }
      if (!xmlDocument.documentElement) {
        throw new Error("The selected content does not contain an XML document element.");
      }
      return xmlDocument;
    }

    function inferDemoValue(name, sampleValue) {
      const fieldName = String(name || "").toLowerCase();
      const sample = String(sampleValue || "").trim();
      if (fieldName.includes("email")) return "user@example.com";
      if (fieldName.includes("url") || fieldName.includes("uri") || fieldName.includes("link")) return "https://example.com";
      if (fieldName.includes("date")) return "2026-01-01";
      if (fieldName.includes("time")) return "12:00:00";
      if (fieldName === "id" || fieldName.endsWith("id") || /^[+-]?\d+$/.test(sample)) return "123";
      if (/^[+-]?(?:\d+\.\d+|\d+|\.\d+)$/.test(sample)) return "123.45";
      if (/^(true|false|0|1)$/i.test(sample)) return "true";
      if (/^\d{4}-\d{2}-\d{2}$/.test(sample)) return "2026-01-01";
      if (/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(sample)) return "2026-01-01T12:00:00Z";
      return "sample " + (name || "value");
    }

    function getElementText(element) {
      return Array.from(element.childNodes || [])
        .filter((child) => child.nodeType === XML_TEXT_NODE)
        .map((child) => String(child.nodeValue || "").trim())
        .filter(Boolean)
        .join(" ");
    }

    function getUniqueChildElements(element) {
      const seenNames = new Set();
      return Array.from(element.childNodes || []).filter((child) => {
        if (child.nodeType !== XML_ELEMENT_NODE) return false;
        const name = getNodeName(child);
        if (seenNames.has(name)) return false;
        seenNames.add(name);
        return true;
      });
    }

    function indent(level) {
      return "  ".repeat(level);
    }

    function renderElementStub(element, level) {
      const name = getNodeName(element);
      const attributes = Array.from(element.attributes || []).map((attribute) => {
        const attributeName = getNodeName(attribute);
        const value = inferDemoValue(attributeName, attribute.value);
        return `${attributeName}="${escapeXmlAttribute(value)}"`;
      });
      const attributeText = attributes.length ? " " + attributes.join(" ") : "";
      const children = getUniqueChildElements(element);

      if (!children.length) {
        const demoValue = inferDemoValue(name, getElementText(element));
        return [`${indent(level)}<${name}${attributeText}>${escapeXmlText(demoValue)}</${name}>`];
      }

      const lines = [`${indent(level)}<${name}${attributeText}>`];
      children.forEach((child) => {
        lines.push(...renderElementStub(child, level + 1));
      });
      lines.push(`${indent(level)}</${name}>`);
      return lines;
    }

    function getSchemaLocalName(node) {
      return String(node?.localName || node?.nodeName || "").replace(/^.*:/, "");
    }

    function isSchemaElement(node, localName) {
      return node?.nodeType === XML_ELEMENT_NODE && getSchemaLocalName(node) === localName;
    }

    function getSchemaAttribute(node, name) {
      if (typeof node?.getAttribute === "function") return node.getAttribute(name) || "";
      const attribute = Array.from(node?.attributes || []).find((item) => getNodeName(item) === name || getSchemaLocalName(item) === name);
      return attribute?.value || "";
    }

    function stripNamespacePrefix(value) {
      return String(value || "").replace(/^.*:/, "");
    }

    function getDirectSchemaChildren(node, localNames) {
      const allowed = new Set(Array.isArray(localNames) ? localNames : [localNames]);
      return Array.from(node?.childNodes || []).filter((child) => isSchemaElement(child, getSchemaLocalName(child)) && allowed.has(getSchemaLocalName(child)));
    }

    function getFirstDirectSchemaChild(node, localName) {
      return getDirectSchemaChildren(node, localName)[0] || null;
    }

    function indexGlobalSchemaDeclarations(schemaElement) {
      const index = { elements: new Map(), complexTypes: new Map(), simpleTypes: new Map() };
      getDirectSchemaChildren(schemaElement, ["element", "complexType", "simpleType"]).forEach((child) => {
        const name = getSchemaAttribute(child, "name");
        if (!name) return;
        if (isSchemaElement(child, "element")) index.elements.set(name, child);
        if (isSchemaElement(child, "complexType")) index.complexTypes.set(name, child);
        if (isSchemaElement(child, "simpleType")) index.simpleTypes.set(name, child);
      });
      return index;
    }

    function getXsdDemoValue(name, typeName) {
      const type = stripNamespacePrefix(typeName).toLowerCase();
      if (["boolean"].includes(type)) return "true";
      if (["byte", "decimal", "double", "float"].includes(type)) return "123.45";
      if (["int", "integer", "long", "negativeinteger", "nonnegativeinteger", "nonpositiveinteger", "positiveinteger", "short", "unsignedbyte", "unsignedint", "unsignedlong", "unsignedshort"].includes(type)) return "123";
      if (["date"].includes(type)) return "2026-01-01";
      if (["datetime"].includes(type)) return "2026-01-01T12:00:00Z";
      if (["time"].includes(type)) return "12:00:00";
      return inferDemoValue(name, "");
    }

    function resolveSchemaElement(element, schemaIndex) {
      const refName = stripNamespacePrefix(getSchemaAttribute(element, "ref"));
      return refName && schemaIndex.elements.has(refName) ? schemaIndex.elements.get(refName) : element;
    }

    function resolveComplexType(element, schemaIndex) {
      const inlineType = getFirstDirectSchemaChild(element, "complexType");
      if (inlineType) return inlineType;
      const typeName = stripNamespacePrefix(getSchemaAttribute(element, "type"));
      return typeName ? schemaIndex.complexTypes.get(typeName) || null : null;
    }

    function getSchemaElementChildren(complexType) {
      const compositors = getDirectSchemaChildren(complexType, ["sequence", "choice", "all"]);
      const childElements = compositors.flatMap((compositor) => getDirectSchemaChildren(compositor, "element"));
      return childElements.length ? childElements : getDirectSchemaChildren(complexType, "element");
    }

    function getSchemaAttributeStubs(complexType) {
      return getDirectSchemaChildren(complexType, "attribute")
        .map((attribute) => {
          const name = getSchemaAttribute(attribute, "name") || stripNamespacePrefix(getSchemaAttribute(attribute, "ref"));
          if (!name) return "";
          return `${name}="${escapeXmlAttribute(getXsdDemoValue(name, getSchemaAttribute(attribute, "type")))}"`;
        })
        .filter(Boolean);
    }

    function renderXsdElementStub(element, schemaIndex, level, seenElements = new Set()) {
      const resolvedElement = resolveSchemaElement(element, schemaIndex);
      const name = getSchemaAttribute(resolvedElement, "name") || stripNamespacePrefix(getSchemaAttribute(resolvedElement, "ref")) || "element";
      if (seenElements.has(resolvedElement)) {
        return [`${indent(level)}<${name}/>`];
      }
      const nextSeen = new Set(seenElements);
      nextSeen.add(resolvedElement);
      const complexType = resolveComplexType(resolvedElement, schemaIndex);
      const attributes = complexType ? getSchemaAttributeStubs(complexType) : [];
      const attributeText = attributes.length ? " " + attributes.join(" ") : "";
      const children = complexType ? getSchemaElementChildren(complexType) : [];

      if (!children.length) {
        const demoValue = getXsdDemoValue(name, getSchemaAttribute(resolvedElement, "type"));
        return [`${indent(level)}<${name}${attributeText}>${escapeXmlText(demoValue)}</${name}>`];
      }

      const lines = [`${indent(level)}<${name}${attributeText}>`];
      children.forEach((child) => {
        lines.push(...renderXsdElementStub(child, schemaIndex, level + 1, nextSeen));
      });
      lines.push(`${indent(level)}</${name}>`);
      return lines;
    }

    /**
     * Generate demo XML values while preserving the selected XML structure.
     * @param {string} source XML content to inspect.
     * @returns {string} Generated XML stub document.
     * @throws When the XML cannot be parsed.
     */
    function createXmlStubFromXml(source) {
      const xmlDocument = parseXmlDocument(source);
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        ...renderElementStub(xmlDocument.documentElement, 0)
      ].join("\n");
    }

    /**
     * Generate a demo XML document from an XML Schema root element.
     * @param {string} source XSD content to inspect.
     * @returns {string} Generated XML stub document.
     * @throws When the XSD cannot be parsed or has no root element.
     */
    function createXmlStubFromXsd(source) {
      const xsdDocument = parseXmlDocument(source);
      const schemaElement = xsdDocument.documentElement;
      if (!isSchemaElement(schemaElement, "schema")) {
        throw new Error("The selected content does not contain an XML Schema document.");
      }
      const schemaIndex = indexGlobalSchemaDeclarations(schemaElement);
      const rootElement = getDirectSchemaChildren(schemaElement, "element")[0] || null;
      if (!rootElement) {
        throw new Error("The XML Schema does not declare a root element.");
      }
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        ...renderXsdElementStub(rootElement, schemaIndex, 0)
      ].join("\n");
    }

    const api = { createXmlStubFromXml, createXmlStubFromXsd, _test: { inferDemoValue, getXsdDemoValue } };
    app?.registerModule?.("xmlStubGenerator", api);
    return api;
  }

  global.registerMarkdownViewerXmlStubGenerator = registerMarkdownViewerXmlStubGenerator;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerXmlStubGenerator };
  }
})(typeof window !== "undefined" ? window : globalThis);
