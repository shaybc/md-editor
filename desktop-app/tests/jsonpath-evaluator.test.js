const assert = require("node:assert/strict");
const test = require("node:test");

const evaluator = require("../resources/js/tools/jsonpath/jsonpath-evaluator.js");

const sample = JSON.stringify({
  properties: {
    name: { type: "string" },
    shipTo: {
      properties: {
        zip: { type: "string" }
      }
    }
  },
  items: [
    { name: "first", active: true, price: 10 },
    { name: "second", active: false, price: 20 },
    { name: "third", active: true, price: 30 }
  ]
});

test("evaluates dot-notated paths from the root", () => {
  const result = evaluator.evaluateJsonPath(sample, "properties.shipTo.properties.zip");

  assert.deepEqual(result, [{ type: "string" }]);
});

test("evaluates recursive descent and wildcards", () => {
  const result = evaluator.evaluateJsonPath(sample, "$..zip");

  assert.deepEqual(result, [{ type: "string" }]);
});

test("evaluates array index unions and slices", () => {
  assert.deepEqual(evaluator.evaluateJsonPath(sample, "items[1]").map((item) => item.name), ["second"]);
  assert.deepEqual(evaluator.evaluateJsonPath(sample, "items[0,2]").map((item) => item.name), ["first", "third"]);
  assert.deepEqual(evaluator.evaluateJsonPath(sample, "items[1:3]").map((item) => item.name), ["second", "third"]);
});

test("evaluates simple filter expressions", () => {
  const result = evaluator.evaluateJsonPath(sample, "items[?(@.price >= 20)]");

  assert.deepEqual(result.map((item) => item.name), ["second", "third"]);
});

test("formats matches as json", () => {
  assert.equal(evaluator.formatJsonPathResult([{ type: "string" }]), '[\n  {\n    "type": "string"\n  }\n]');
});

test("reports invalid json", () => {
  assert.throws(() => evaluator.evaluateJsonPath("{", "$"), /Invalid JSON/);
});
