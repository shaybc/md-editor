const assert = require("node:assert/strict");
const test = require("node:test");

const runner = require("../resources/js/tools/xslt/xslt-runner.js");

class Serializer {
  serializeToString(node) {
    return node.serialized || node.outerHTML || "";
  }
}

function createParser(errorBySource = new Set()) {
  return class DOMParser {
    parseFromString(source) {
      if (errorBySource.has(source)) {
        return { getElementsByTagName: () => [{ textContent: "bad xml" }] };
      }
      return { source, getElementsByTagName: () => [] };
    }
  };
}

test("transforms XML with native XSLT processor", () => {
  class XSLTProcessor {
    importStylesheet(stylesheet) {
      this.stylesheet = stylesheet;
    }
    setParameter() {}
    transformToDocument(xml) {
      assert.equal(xml.source, "<root />");
      assert.equal(this.stylesheet.source, "<xsl:stylesheet />");
      return { nodeType: 9, documentElement: { serialized: "<result>ok</result>" } };
    }
  }

  const result = runner.transform({ xmlText: "<root />", xsltText: "<xsl:stylesheet />" }, {
    DOMParser: createParser(),
    XMLSerializer: Serializer,
    XSLTProcessor
  });

  assert.equal(result.output, "<result>ok</result>");
});

test("reports invalid XML parse errors", () => {
  assert.throws(() => runner.transform({ xmlText: "bad", xsltText: "<xsl />" }, {
    DOMParser: createParser(new Set(["bad"])),
    XMLSerializer: Serializer,
    XSLTProcessor: class {}
  }), /XML parse error: bad xml/);
});


test("passes named parameters to the processor", () => {
  const parameters = [];
  class XSLTProcessor {
    importStylesheet() {}
    setParameter(namespaceUri, name, value) {
      parameters.push({ namespaceUri, name, value });
    }
    transformToDocument() {
      return { nodeType: 9, documentElement: { serialized: "<result />" } };
    }
  }

  runner.transform({
    xmlText: "<root />",
    xsltText: "<xsl />",
    parameters: [{ name: "who", value: "world" }, { name: "", value: "skip" }]
  }, {
    DOMParser: createParser(),
    XMLSerializer: Serializer,
    XSLTProcessor
  });

  assert.deepEqual(parameters, [{ namespaceUri: null, name: "who", value: "world" }]);
});

test("reports missing native XSLT support", () => {
  assert.throws(() => runner.transform({ xmlText: "<root />", xsltText: "<xsl />" }, {
    DOMParser: createParser(),
    XMLSerializer: Serializer
  }), /Native XSLT 1\.0 processing is unavailable/);
});
