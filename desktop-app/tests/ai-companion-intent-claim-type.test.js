"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  deriveCriterionClaimType
} = require("../resources/ai-companion/core/intent-claim-type");

test("answer criteria without workspace claims remain response-content", () => {
  assert.equal(deriveCriterionClaimType(
    { description: "The response explains exponential backoff" },
    { taskType: "answer", namedTargets: {} }
  ), "response-content");
});

test("task type and named targets override a model-style response claim", () => {
  assert.equal(deriveCriterionClaimType(
    { description: "The response summarizes the latest Git changes" },
    { taskType: "diagnostic", namedTargets: {} }
  ), "mixed");
  assert.equal(deriveCriterionClaimType(
    { description: "The answer states what src/parser.js contains" },
    { taskType: "answer", namedTargets: { files: [{ value: "src/parser.js" }] } }
  ), "mixed");
});

test("planning criteria are mixed because the plan also needs workspace grounding", () => {
  assert.equal(deriveCriterionClaimType(
    { description: "The plan lists the implementation milestones" },
    { taskType: "planning", namedTargets: {} }
  ), "mixed");
});
