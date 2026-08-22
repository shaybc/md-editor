const assert = require("node:assert/strict");
const test = require("node:test");

const evaluator = require("../resources/js/tools/xpath/xpath-evaluator.js");

const XPathResult = {
  ANY_TYPE: 0,
  NUMBER_TYPE: 1,
  STRING_TYPE: 2,
  BOOLEAN_TYPE: 3,
  UNORDERED_NODE_ITERATOR_TYPE: 4
};

function createNodeSetResult(nodes) {
  let index = 0;
  return {
    resultType: XPathResult.UNORDERED_NODE_ITERATOR_TYPE,
    iterateNext() {
      return nodes[index++] || null;
    }
  };
}

test("evaluates xpath node matches", () => {
  const result = evaluator.evaluateXPath("<root><name>demo</name></root>", "//name", {
    XPathResult,
    parseXmlDocument() {
      return { nodeType: 9 };
    },
    XMLSerializer: class {
      serializeToString(node) {
        return node.xml;
      }
    },
    evaluateExpression(_documentValue, expression) {
      assert.equal(expression, "//name");
      return createNodeSetResult([{ nodeType: 1, xml: "<name>demo</name>" }]);
    }
  });

  assert.deepEqual(result, { kind: "nodes", matches: ["<name>demo</name>"] });
});

test("evaluates scalar xpath results", () => {
  const deps = {
    XPathResult,
    parseXmlDocument() {
      return { nodeType: 9 };
    }
  };

  assert.deepEqual(evaluator.evaluateXPath("<root />", "string(/root)", {
    ...deps,
    evaluateExpression() {
      return { resultType: XPathResult.STRING_TYPE, stringValue: "demo" };
    }
  }), { kind: "string", matches: ["demo"] });
  assert.deepEqual(evaluator.evaluateXPath("<root />", "count(/root)", {
    ...deps,
    evaluateExpression() {
      return { resultType: XPathResult.NUMBER_TYPE, numberValue: 1 };
    }
  }), { kind: "number", matches: ["1"] });
  assert.deepEqual(evaluator.evaluateXPath("<root />", "boolean(/root)", {
    ...deps,
    evaluateExpression() {
      return { resultType: XPathResult.BOOLEAN_TYPE, booleanValue: true };
    }
  }), { kind: "boolean", matches: ["true"] });
});

test("formats xpath matches with spacing between nodes", () => {
  assert.equal(evaluator.formatXPathResult({ matches: ["<a />", "<b />"] }), "<a />\n\n<b />");
});

test("reports invalid xpath", () => {
  assert.throws(() => evaluator.evaluateXPath("<root />", "//[", {
    XPathResult,
    parseXmlDocument() {
      return { nodeType: 9 };
    },
    evaluateExpression() {
      throw new Error("Expression failed");
    }
  }), /Invalid XPath: Expression failed/);
});
