const assert = require("node:assert/strict");
const test = require("node:test");

const { registerMarkdownViewerXmlValidation } = require("../resources/js/editor/xml-validation.js");

function createDocument(attributes = {}) {
  const root = {
    nodeName: "root",
    getAttribute(name) {
      return attributes[name] || "";
    },
    getAttributeNS(namespace, name) {
      return attributes["xsi:" + name] || attributes[name] || "";
    }
  };
  return {
    documentElement: root,
    querySelector() {
      return null;
    }
  };
}

function createParser(documents) {
  return class FakeDOMParser {
    parseFromString(source) {
      if (String(source).includes("mismatch")) {
        return {
          documentElement: { nodeName: "parsererror", textContent: "line 3 column 9: mismatched tag" },
          querySelector() {
            return { textContent: "line 3 column 9: mismatched tag" };
          }
        };
      }
      const next = documents.shift() || {};
      return createDocument(next.attributes || {});
    }
  };
}

test("XML validation returns no diagnostics for valid XML", async () => {
  const validator = registerMarkdownViewerXmlValidation({ registerModule() {} }, {
    DOMParser: createParser([{}])
  });

  const result = await validator.validateText({ text: "<root/>", filePath: "C:/work/document.xml" });

  assert.equal(result.status, "ok");
  assert.deepEqual(result.diagnostics, []);
});

test("XML validation reports mismatched tags with line and column", async () => {
  const validator = registerMarkdownViewerXmlValidation({ registerModule() {} }, {
    DOMParser: createParser([])
  });

  const result = await validator.validateText({ text: "<mismatch>", filePath: "C:/work/document.xml" });

  assert.equal(result.status, "issues");
  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].severity, "error");
  assert.equal(result.diagnostics[0].line, 3);
  assert.equal(result.diagnostics[0].column, 9);
  assert.equal(result.diagnostics[0].source, "xml");
});

test("XML validation treats empty input as empty without crashing", async () => {
  const validator = registerMarkdownViewerXmlValidation({ registerModule() {} }, {
    DOMParser: createParser([])
  });

  const result = await validator.validateText({ text: "", filePath: "C:/work/document.xml" });

  assert.equal(result.status, "empty");
  assert.deepEqual(result.diagnostics, []);
});

test("XML validation resolves namespace and no-namespace schema paths", async () => {
  const validator = registerMarkdownViewerXmlValidation({ registerModule() {} }, {
    DOMParser: createParser([
      {
        attributes: {
          "xsi:noNamespaceSchemaLocation": "schema/main.xsd",
          "xsi:schemaLocation": "urn:one one.xsd urn:two nested/two.xsd"
        }
      },
      {
        attributes: {
          "xsi:noNamespaceSchemaLocation": "schema/main.xsd",
          "xsi:schemaLocation": "urn:one one.xsd urn:two nested/two.xsd"
        }
      }
    ])
  });

  const result = await validator.validateText({ text: "<root/>", filePath: "C:/work/documents/input.xml" });

  assert.deepEqual(result.schemaReferences.map((item) => item.resolvedPath), [
    "C:/work/documents/schema/main.xsd",
    "C:/work/documents/one.xsd",
    "C:/work/documents/nested/two.xsd"
  ]);
});

test("XML validation warns when a local schema reference is missing", async () => {
  const validator = registerMarkdownViewerXmlValidation({ registerModule() {} }, {
    DOMParser: createParser([
      { attributes: { "xsi:noNamespaceSchemaLocation": "missing.xsd" } },
      { attributes: { "xsi:noNamespaceSchemaLocation": "missing.xsd" } }
    ]),
    Neutralino: {
      filesystem: {
        async readFile() {
          throw new Error("missing");
        }
      }
    }
  });

  const result = await validator.validateText({ text: "<root/>", filePath: "C:/work/input.xml" });

  assert.equal(result.diagnostics.length, 1);
  assert.equal(result.diagnostics[0].severity, "warning");
  assert.equal(result.diagnostics[0].message, "Referenced XML schema was not found: missing.xsd");
});

test("XML validation publishes and clears Problems panel diagnostics", async () => {
  const calls = [];
  const problemsPanel = {
    setDiagnosticCollection(owner, diagnostics) {
      calls.push({ type: "set", owner, diagnostics });
    },
    clearDiagnosticCollection(owner) {
      calls.push({ type: "clear", owner });
    }
  };
  const validator = registerMarkdownViewerXmlValidation({ registerModule() {} }, {
    DOMParser: createParser([]),
    getActiveEditorValue() {
      return "<mismatch>";
    },
    getActiveEditorPath() {
      return "C:/work/input.xml";
    },
    getProblemsPanel() {
      return problemsPanel;
    }
  });

  await validator.validateActiveEditor();
  validator.clearDiagnosticsForPath("C:/work/input.xml");

  assert.equal(calls[0].type, "set");
  assert.equal(calls[0].owner, "xml-validation:c:/work/input.xml");
  assert.equal(calls[0].diagnostics[0].source, "xml");
  assert.deepEqual(calls[1], { type: "clear", owner: "xml-validation:c:/work/input.xml" });
});
