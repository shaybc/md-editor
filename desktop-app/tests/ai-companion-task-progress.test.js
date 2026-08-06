"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { classifyTaskProgress, recordLookup, taskActionSignature, BATCH_LOOKUP_BUDGET } = require("../resources/ai-companion/core/task-progress");

test("source-searching an already-resolved preference is no-progress", () => {
  const r = classifyTaskProgress({
    tool: "search_text",
    targetKeys: ["aiCompanionSettings.x"],
    resolvedKeys: ["aiCompanionSettings.x"]
  });
  assert.equal(r.progress, false);
  assert.equal(r.reasonCode, "rederiving_resolved_target");
});

test("re-running preferences_search over resolved keys is no-progress", () => {
  const r = classifyTaskProgress({ tool: "preferences_search", targetKeys: ["a", "b"], resolvedKeys: ["a", "b"] });
  assert.equal(r.progress, false);
});

test("a first resolution attempt makes progress", () => {
  const r = classifyTaskProgress({ tool: "preferences_search", targetKeys: ["a", "b"], resolvedKeys: [] });
  assert.equal(r.progress, true);
});

test("exceeding the batch-lookup budget is no-progress", () => {
  const counts = { a: BATCH_LOOKUP_BUDGET };
  const r = classifyTaskProgress({ tool: "preferences_search", targetKeys: ["a"], resolvedKeys: [], lookupCounts: counts });
  assert.equal(r.progress, false);
  assert.equal(r.reasonCode, "lookup_budget_exceeded");
  assert.deepEqual(r.overBudgetKeys, ["a"]);
});

test("a non-resolution tool over resolved keys is not penalized", () => {
  const r = classifyTaskProgress({ tool: "preferences_update", targetKeys: ["a"], resolvedKeys: ["a"] });
  assert.equal(r.progress, true);
});

test("recordLookup increments per key immutably", () => {
  const c0 = {};
  const c1 = recordLookup(c0, ["a", "b"]);
  const c2 = recordLookup(c1, ["a"]);
  assert.deepEqual(c0, {});
  assert.deepEqual(c1, { a: 1, b: 1 });
  assert.deepEqual(c2, { a: 2, b: 1 });
});

test("task action signature is order-independent", () => {
  assert.equal(taskActionSignature({ tool: "preferences_search", targetKeys: ["b", "a"] }), "preferences_search(a,b)");
  assert.equal(
    taskActionSignature({ tool: "preferences_search", targetKeys: ["a", "b"] }),
    taskActionSignature({ tool: "preferences_search", targetKeys: ["b", "a"] })
  );
});
