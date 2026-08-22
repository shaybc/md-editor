const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerXmlStubGenerator } = require("../resources/js/editor/xml-stub-generator.js");

function attribute(name, value) {
  return { nodeName: name, localName: name, value };
}

function element(name, attributes = {}, children = []) {
  const attributeList = Object.entries(attributes).map(([key, value]) => attribute(key, value));
  return {
    nodeType: 1,
    nodeName: name,
    localName: name.replace(/^.*:/, ""),
    attributes: attributeList,
    childNodes: children,
    getAttribute(attributeName) {
      return attributes[attributeName] || "";
    }
  };
}

function createSchemaDocument() {
  const schema = element("xs:schema", {}, [
    element("xs:element", { name: "customers" }, [
      element("xs:complexType", {}, [
        element("xs:sequence", {}, [
          element("xs:element", { name: "customer" }, [
            element("xs:complexType", {}, [
              element("xs:sequence", {}, [
                element("xs:element", { name: "name", type: "xs:string" }),
                element("xs:element", { name: "active", type: "xs:boolean" }),
                element("xs:element", { name: "age", type: "xs:integer" })
              ]),
              element("xs:attribute", { name: "id", type: "xs:int" })
            ])
          ])
        ])
      ])
    ])
  ]);
  return {
    documentElement: schema,
    querySelector() {
      return null;
    }
  };
}

test("XML stub generator creates demo XML from XSD elements", () => {
  class FakeDOMParser {
    parseFromString() {
      return createSchemaDocument();
    }
  }
  const generator = registerMarkdownViewerXmlStubGenerator({ registerModule() {} }, { DOMParser: FakeDOMParser });

  assert.equal(generator.createXmlStubFromXsd("<xs:schema/>"), [
    '<?xml version="1.0" encoding="UTF-8"?>',
    "<customers>",
    '  <customer id="123">',
    "    <name>sample name</name>",
    "    <active>true</active>",
    "    <age>123</age>",
    "  </customer>",
    "</customers>"
  ].join("\n"));
});
