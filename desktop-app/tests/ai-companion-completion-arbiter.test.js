"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyUnmetCriterion, arbitrateAssessment, ARBITER_CLASSES } = require("../resources/ai-companion/core/completion-arbiter");

const emptyContract = { acceptanceCriteria: [] };

test("classifies a clear user-stated unmet criterion as unsatisfied (bug)", () => {
  const result = classifyUnmetCriterion({ provenance: "explicit", description: "the documentation file was updated" }, emptyContract, []);
  assert.equal(result.class, "unsatisfied");
  assert.ok(result.guidance.length > 0);
});

test("classifies an inferred unmet criterion as a spec-gap", () => {
  const result = classifyUnmetCriterion({ provenance: "inferred", description: "the doc was updated" }, emptyContract, []);
  assert.equal(result.class, "spec-gap");
});

test("classifies a denied/failed required tool as blocked (environmental)", () => {
  const ledger = [{ source: "tool", tool: "write_file", outcome: "denied" }];
  const result = classifyUnmetCriterion({ provenance: "explicit", description: "the file was written" }, emptyContract, ledger);
  assert.equal(result.class, "blocked");
  assert.match(result.reason, /write_file/);
});

test("a no-op write is NOT classified as blocked", () => {
  const ledger = [{ source: "tool", tool: "write_file", outcome: "no-op" }];
  const result = classifyUnmetCriterion({ provenance: "explicit", description: "the doc.md file was updated" }, emptyContract, ledger);
  assert.notEqual(result.class, "blocked", "a no-op is not an environmental blocker");
});

test("classifies a blocking contract ambiguity as ambiguity", () => {
  const contract = { acceptanceCriteria: [], ambiguities: [{ blocking: true }] };
  const result = classifyUnmetCriterion({ provenance: "explicit", description: "x" }, contract, []);
  assert.equal(result.class, "ambiguity");
});

test("blocked takes priority over spec-gap and ambiguity", () => {
  const contract = { acceptanceCriteria: [], ambiguities: [{ blocking: true }] };
  const ledger = [{ source: "tool", tool: "apply_edit", outcome: "failed" }];
  const result = classifyUnmetCriterion({ provenance: "inferred", description: "the edit applied" }, contract, ledger);
  assert.equal(result.class, "blocked");
});

test("every class is a known arbiter class", () => {
  for (const cls of ["unsatisfied", "spec-gap", "blocked", "ambiguity"]) {
    assert.ok(ARBITER_CLASSES.includes(cls));
  }
});

test("arbitrateAssessment attaches arbitration to unmet criteria only", () => {
  const contract = { acceptanceCriteria: [
    { id: "AC1", provenance: "explicit", description: "done" },
    { id: "AC2", provenance: "inferred", description: "maybe" }
  ] };
  const assessment = { overallStatus: "incomplete", criteria: [
    { id: "AC1", status: "met" },
    { id: "AC2", status: "unmet" }
  ] };
  arbitrateAssessment(assessment, contract, []);
  assert.equal(assessment.criteria[0].arbitration, undefined, "met criteria carry no arbitration");
  assert.equal(assessment.criteria[1].arbitration.class, "spec-gap");
});
