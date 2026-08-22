const assert = require("node:assert/strict");
const test = require("node:test");

const codec = require("../resources/js/tools/json-array-table/json-array-table-codec.js");

test("converts a JSON array of objects to flattened table rows", () => {
  const table = codec.convertJsonArrayToTable(JSON.stringify([
    { name: { type: "string" }, price: { type: "number", minimum: 0 } },
    { name: { type: "string" }, price: { type: "number", minimum: 10 }, active: true }
  ]));

  assert.deepEqual(table.columns, ["name_type", "price_type", "price_minimum", "active"]);
  assert.deepEqual(table.rows, [
    ["string", "number", "0", ""],
    ["string", "number", "10", "true"]
  ]);
});

test("exports table as CSV, TSV, and semicolon-separated CSV", () => {
  const table = {
    columns: ["name", "note"],
    rows: [["alpha", "hello, world"], ["beta", "two\twords"]]
  };

  assert.equal(codec.tableToDelimited(table, "csv"), "name,note\r\nalpha,\"hello, world\"\r\nbeta,two\twords");
  assert.equal(codec.tableToDelimited(table, "tsv"), "name\tnote\r\nalpha\thello, world\r\nbeta\t\"two\twords\"");
  assert.equal(codec.tableToDelimited(table, "semicolon"), "name;note\r\nalpha;hello, world\r\nbeta;two\twords");
});

test("rejects non-array JSON", () => {
  assert.throws(
    () => codec.convertJsonArrayToTable("{\"name\":\"alpha\"}"),
    /valid JSON array of objects/
  );
});

test("rejects arrays with primitive items", () => {
  assert.throws(
    () => codec.convertJsonArrayToTable("[1, 2, 3]"),
    /valid JSON array of objects/
  );
});
