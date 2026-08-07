"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { sanitizeGeminiSchema, uppercaseGeminiSchemaTypes, isGeminiEndpoint, sanitizeOpenAiToolsForGemini, coerceGeminiToolChoice } = require("../resources/ai-companion/providers/gemini-schema");

test("uppercaseGeminiSchemaTypes maps type values to the native enum, recursively", () => {
  const out = uppercaseGeminiSchemaTypes({
    type: "object",
    properties: {
      s: { type: "string" },
      n: { type: "integer" },
      list: { type: "array", items: { type: "number" } },
      nested: { type: "object", properties: { b: { type: "boolean" } } }
    }
  });
  assert.equal(out.type, "OBJECT");
  assert.equal(out.properties.s.type, "STRING");
  assert.equal(out.properties.n.type, "INTEGER");
  assert.equal(out.properties.list.type, "ARRAY");
  assert.equal(out.properties.list.items.type, "NUMBER");
  assert.equal(out.properties.nested.properties.b.type, "BOOLEAN");
  // Field names (description, properties, items, required) are untouched.
  assert.equal("properties" in out, true);
});

test("a propertyless OBJECT becomes a STRING (native rejects empty objects)", () => {
  const out = uppercaseGeminiSchemaTypes({ type: "object", description: "The API response" });
  assert.equal(out.type, "STRING");
  assert.match(out.description, /JSON string/);
});

test("an itemless ARRAY gains string items (native requires items)", () => {
  const out = uppercaseGeminiSchemaTypes({ type: "array" });
  assert.equal(out.type, "ARRAY");
  assert.equal(out.items.type, "STRING");
});

test("a nested freeform-object property is fixed up in place", () => {
  const out = uppercaseGeminiSchemaTypes({ type: "object", properties: { response: { type: "object" }, name: { type: "string" } } });
  assert.equal(out.type, "OBJECT");
  assert.equal(out.properties.response.type, "STRING", "freeform object -> string");
  assert.equal(out.properties.name.type, "STRING");
});

test("openai-compat sanitizer keeps lowercase types (shim needs OpenAI style)", () => {
  const out = sanitizeOpenAiToolsForGemini([{ type: "function", function: { name: "t", parameters: { type: "object", properties: { a: { type: "string" } } } } }]);
  assert.equal(out[0].function.parameters.type, "object");
  assert.equal(out[0].function.parameters.properties.a.type, "string");
});

test("coerceGeminiToolChoice maps 'required' to 'auto' and leaves others alone", () => {
  assert.equal(coerceGeminiToolChoice("required"), "auto");
  assert.equal(coerceGeminiToolChoice("auto"), "auto");
  assert.equal(coerceGeminiToolChoice("none"), "none");
  const fn = { type: "function", function: { name: "glob" } };
  assert.equal(coerceGeminiToolChoice(fn), fn);
});

test("isGeminiEndpoint detects google-gemini mode and the generative-language host", () => {
  assert.equal(isGeminiEndpoint("https://generativelanguage.googleapis.com/v1beta/openai", "google-gemini"), true);
  assert.equal(isGeminiEndpoint("https://generativelanguage.googleapis.com/v1beta/openai", "openai-compatible"), true);
  assert.equal(isGeminiEndpoint("https://api.openai.com/v1", "openai-compatible"), false);
  assert.equal(isGeminiEndpoint("http://localhost:11434/v1", "litellm"), false);
});

test("sanitizeGeminiSchema drops unsupported keywords and guarantees a type", () => {
  const out = sanitizeGeminiSchema({
    type: "object",
    additionalProperties: false,
    required: ["k"],
    properties: {
      k: { type: "string", pattern: "^x", minLength: 1, maxLength: 5 },
      n: { type: "integer", minimum: 0, maximum: 9 },
      list: { type: "array", minItems: 1, maxItems: 3, items: { type: "string" } },
      any: { description: "polymorphic" }
    }
  });
  assert.equal("additionalProperties" in out, false);
  assert.equal("pattern" in out.properties.k, false);
  assert.equal("minLength" in out.properties.k, false);
  assert.equal("minimum" in out.properties.n, false);
  assert.equal("minItems" in out.properties.list, false);
  assert.equal(out.properties.any.type, "string", "typeless node gains a type");
  assert.equal(out.properties.list.items.type, "string");
});

test("sanitizeOpenAiToolsForGemini rewrites each function's parameters, leaving non-functions alone", () => {
  const tools = [
    { type: "function", function: { name: "act", parameters: { type: "object", properties: { r: { type: "integer", minimum: 0 } } } } },
    { type: "other", note: "kept" }
  ];
  const out = sanitizeOpenAiToolsForGemini(tools);
  assert.equal("minimum" in out[0].function.parameters.properties.r, false);
  assert.equal(out[1].note, "kept");
  // Input is not mutated.
  assert.equal(tools[0].function.parameters.properties.r.minimum, 0);
});

test("the _decision-style controller metadata schema is accepted after sanitizing", () => {
  // Mirrors agent-decision-controller DECISION_METADATA_SCHEMA (the candidate-only delta
  // that triggered Gemini's INVALID_ARGUMENT on the openai-compat endpoint).
  const decision = {
    type: "object",
    additionalProperties: false,
    required: ["intentId", "rationale", "expectedObservation"],
    properties: {
      intentId: { type: "string" },
      rationale: { type: "string" },
      expectedObservation: { type: "string" },
      strategyRevision: { type: "integer", minimum: 0 },
      replan: {
        type: "object",
        required: ["triggerAssessmentIds", "abandonedApproach", "revisedApproach"],
        properties: {
          triggerAssessmentIds: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } },
          abandonedApproach: { type: "string", minLength: 1, maxLength: 1000 },
          revisedApproach: { type: "string", minLength: 1, maxLength: 1000 }
        }
      }
    }
  };
  const out = sanitizeGeminiSchema(decision);
  assert.equal("additionalProperties" in out, false);
  assert.equal("minimum" in out.properties.strategyRevision, false);
  assert.equal("minItems" in out.properties.replan.properties.triggerAssessmentIds, false);
  assert.equal("minLength" in out.properties.replan.properties.abandonedApproach, false);
  assert.equal(out.type, "object");
});
