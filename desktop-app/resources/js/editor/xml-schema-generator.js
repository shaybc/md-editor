(function(global) {
  "use strict";

  const XML_SCHEMA_NAMESPACE = "http://www.w3.org/2001/XMLSchema";

  /**
   * Create inferred XML Schema documents from sample XML text.
   * @param {object} app Shared MD-Editor application object.
   * @param {object} deps Optional parser and serializer overrides.
   * @returns {object} XML schema generator API.
   */
  function registerMarkdownViewerXmlSchemaGenerator(app, deps = {}) {
    const DOMParserRef = deps.DOMParser || global.DOMParser;

    function escapeXmlAttribute(value) {
      return String(value)
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function getNodeLocalName(node) {
      return String(node?.localName || node?.nodeName || "element").replace(/^[^:]+:/, "");
    }

    function toXmlSchemaName(name) {
      const cleanName = String(name || "element").replace(/[^A-Za-z0-9_.-]/g, "_");
      return /^[A-Za-z_]/.test(cleanName) ? cleanName : "_" + cleanName;
    }

    function inferXmlSchemaType(values) {
      const candidates = (Array.isArray(values) ? values : [])
        .map((value) => String(value || "").trim())
        .filter(Boolean);
      if (!candidates.length) return "xs:string";
      if (candidates.every((value) => /^(true|false|0|1)$/i.test(value))) return "xs:boolean";
      if (candidates.every((value) => /^[+-]?\d+$/.test(value))) return "xs:integer";
      if (candidates.every((value) => /^[+-]?(?:\d+\.\d+|\d+|\.\d+)$/.test(value))) return "xs:decimal";
      if (candidates.every((value) => /^\d{4}-\d{2}-\d{2}$/.test(value))) return "xs:date";
      if (candidates.every((value) => /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})?$/.test(value))) return "xs:dateTime";
      return "xs:string";
    }

    function createElementModel(element) {
      const childElements = Array.from(element.children || []);
      const model = {
        name: toXmlSchemaName(getNodeLocalName(element)),
        attributes: new Map(),
        children: new Map(),
        childOrder: [],
        textValues: []
      };

      Array.from(element.attributes || []).forEach((attribute) => {
        const name = toXmlSchemaName(getNodeLocalName(attribute));
        if (!model.attributes.has(name)) model.attributes.set(name, []);
        model.attributes.get(name).push(attribute.value);
      });

      Array.from(element.childNodes || []).forEach((child) => {
        if (child.nodeType === global.Node?.TEXT_NODE) {
          const text = String(child.nodeValue || "").trim();
          if (text) model.textValues.push(text);
        }
      });

      childElements.forEach((child) => {
        const childModel = createElementModel(child);
        const childName = childModel.name;
        if (!model.children.has(childName)) {
          model.children.set(childName, { model: childModel, count: 0 });
          model.childOrder.push(childName);
        } else {
          mergeElementModel(model.children.get(childName).model, childModel);
        }
        model.children.get(childName).count += 1;
      });

      return model;
    }

    function mergeElementModel(target, source) {
      source.attributes.forEach((values, name) => {
        if (!target.attributes.has(name)) target.attributes.set(name, []);
        target.attributes.get(name).push(...values);
      });
      target.textValues.push(...source.textValues);
      source.childOrder.forEach((childName) => {
        const sourceChild = source.children.get(childName);
        if (!target.children.has(childName)) {
          target.children.set(childName, { model: sourceChild.model, count: sourceChild.count });
          target.childOrder.push(childName);
          return;
        }
        const targetChild = target.children.get(childName);
        targetChild.count += sourceChild.count;
        mergeElementModel(targetChild.model, sourceChild.model);
      });
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

    function indent(level) {
      return "  ".repeat(level);
    }

    function renderAttribute(name, values, level) {
      const type = inferXmlSchemaType(values);
      return `${indent(level)}<xs:attribute name="${escapeXmlAttribute(name)}" type="${type}" use="optional"/>`;
    }

    function renderElement(model, level, occurrenceAttributes) {
      const attributes = Array.from(model.attributes.entries());
      const hasChildren = model.childOrder.length > 0;
      const type = inferXmlSchemaType(model.textValues);
      const openElement = `<xs:element name="${escapeXmlAttribute(model.name)}"${occurrenceAttributes || ""}`;

      if (!hasChildren && !attributes.length) {
        return [`${indent(level)}${openElement} type="${type}"/>`];
      }

      const lines = [`${indent(level)}${openElement}>`];
      if (!hasChildren && attributes.length) {
        lines.push(`${indent(level + 1)}<xs:complexType>`);
        lines.push(`${indent(level + 2)}<xs:simpleContent>`);
        lines.push(`${indent(level + 3)}<xs:extension base="${type}">`);
        attributes.forEach(([name, values]) => lines.push(renderAttribute(name, values, level + 4)));
        lines.push(`${indent(level + 3)}</xs:extension>`);
        lines.push(`${indent(level + 2)}</xs:simpleContent>`);
        lines.push(`${indent(level + 1)}</xs:complexType>`);
      } else {
        lines.push(`${indent(level + 1)}<xs:complexType${model.textValues.length ? ' mixed="true"' : ""}>`);
        lines.push(`${indent(level + 2)}<xs:sequence>`);
        model.childOrder.forEach((childName) => {
          const child = model.children.get(childName);
          const childOccurrence = child.count > 1 ? ' maxOccurs="unbounded"' : "";
          lines.push(...renderElement(child.model, level + 3, childOccurrence));
        });
        lines.push(`${indent(level + 2)}</xs:sequence>`);
        attributes.forEach(([name, values]) => lines.push(renderAttribute(name, values, level + 2)));
        lines.push(`${indent(level + 1)}</xs:complexType>`);
      }
      lines.push(`${indent(level)}</xs:element>`);
      return lines;
    }

    /**
     * Infer an XML Schema document from one sample XML document.
     * @param {string} source XML content to inspect.
     * @returns {string} Generated XSD document.
     * @throws When the XML cannot be parsed.
     */
    function createXmlSchemaFromXml(source) {
      const xmlDocument = parseXmlDocument(source);
      const rootModel = createElementModel(xmlDocument.documentElement);
      return [
        '<?xml version="1.0" encoding="UTF-8"?>',
        `<xs:schema xmlns:xs="${XML_SCHEMA_NAMESPACE}" elementFormDefault="qualified">`,
        ...renderElement(rootModel, 1, ""),
        "</xs:schema>"
      ].join("\n");
    }

    const api = { createXmlSchemaFromXml, _test: { inferXmlSchemaType, toXmlSchemaName } };
    app?.registerModule?.("xmlSchemaGenerator", api);
    return api;
  }

  global.registerMarkdownViewerXmlSchemaGenerator = registerMarkdownViewerXmlSchemaGenerator;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerXmlSchemaGenerator };
  }
})(typeof window !== "undefined" ? window : globalThis);
