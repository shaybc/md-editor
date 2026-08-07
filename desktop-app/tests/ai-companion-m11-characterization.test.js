"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { run } = require("./eval/m11-characterization");

test("M11.4b characterization: no routing/tool-surface regressions across the corpus", () => {
  const { failures } = run({ writeSnapshot: false });
  assert.equal(failures.length, 0, `characterization violations: ${failures.map((f) => `${f.signature.id}[${f.violations.join("; ")}]`).join(", ")}`);
});

test("M11.4b characterization: typed tasks restrict, questions do not", () => {
  const { signatures } = run({ writeSnapshot: false });
  const byId = Object.fromEntries(signatures.map((s) => [s.id, s]));
  // A typed preferences mutation is narrowed to the profile's tools.
  assert.equal(byId["typed-explicit-mutation"].candidateRestricted, true);
  assert.ok(byId["typed-explicit-mutation"].candidateToolCount < byId["typed-explicit-mutation"].baselineToolCount);
  // Questions, compound requests, and open work keep the full surface.
  assert.equal(byId["question-which-flags"].candidateRestricted, false);
  assert.equal(byId["compound-investigate-and-change"].engaged, false);
  assert.equal(byId["open-refactor"].candidateRestricted, false);
});
