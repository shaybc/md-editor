"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { coerceToolChoiceToTools } = require("../resources/ai-companion/providers/openai-compatible");

const tools = [{ type: "function", function: { name: "glob" } }, { type: "function", function: { name: "read_file" } }];

test("string tool choices pass through unchanged", () => {
  for (const choice of ["auto", "none", "required", undefined]) {
    assert.equal(coerceToolChoiceToTools(choice, tools), choice);
  }
});

test("a forced name present in the tools is kept", () => {
  const choice = { type: "function", function: { name: "glob" } };
  assert.equal(coerceToolChoiceToTools(choice, tools), choice);
});

test("a forced name NOT in the tools downgrades to auto (prevents the Gemini subset error)", () => {
  // list_files was removed by the consolidation — forcing it must not be sent as-is.
  assert.equal(coerceToolChoiceToTools({ type: "function", function: { name: "list_files" } }, tools), "auto");
  assert.equal(coerceToolChoiceToTools({ type: "function", function: { name: "read_open_tabs" } }, tools), "auto");
});

test("a forced name with no tools at all downgrades to auto", () => {
  assert.equal(coerceToolChoiceToTools({ type: "function", function: { name: "glob" } }, undefined), "auto");
});
