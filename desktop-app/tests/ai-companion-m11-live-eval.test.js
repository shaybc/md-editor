"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { summarizeVariant, variantDelta, aggregateComparisons, isCaseInconclusive, verdict } = require("./eval/m11-live-eval");

function record(over = {}) {
  return { providerCalls: 1, totalTokens: 100, promptTokens: 80, completionTokens: 20, durationMs: 500, toolCalls: [], deterministic: { passed: true }, error: "", ...over };
}

test("summarizeVariant sums objective metrics across turns", () => {
  const s = summarizeVariant([
    record({ providerCalls: 3, totalTokens: 300, toolCalls: [{}, {}] }),
    record({ providerCalls: 2, totalTokens: 150, toolCalls: [{}] })
  ]);
  assert.equal(s.providerCalls, 5);
  assert.equal(s.totalTokens, 450);
  assert.equal(s.toolCalls, 3);
  assert.equal(s.completed, true);
  assert.equal(s.deterministicPassed, true);
});

test("an errored turn marks the variant incomplete and failed", () => {
  const s = summarizeVariant([record(), record({ error: "boom" })]);
  assert.equal(s.completed, false);
  assert.equal(s.deterministicPassed, false);
});

test("variantDelta reports candidate minus baseline", () => {
  const baseline = summarizeVariant([record({ providerCalls: 10, totalTokens: 5000, toolCalls: new Array(32).fill({}) })]);
  const candidate = summarizeVariant([record({ providerCalls: 3, totalTokens: 1200, toolCalls: new Array(4).fill({}) })]);
  const d = variantDelta(baseline, candidate);
  assert.equal(d.toolCalls, -28, "candidate does fewer tool calls (less wandering)");
  assert.equal(d.totalTokens, -3800);
  assert.equal(d.providerCalls, -7);
  assert.equal(d.completedChange, 0);
});

test("aggregate flags a completion regression", () => {
  const good = { delta: variantDelta(summarizeVariant([record()]), summarizeVariant([record({ toolCalls: [] })])) };
  const regressed = { delta: variantDelta(summarizeVariant([record()]), summarizeVariant([record({ error: "fail" })])) };
  const totals = aggregateComparisons([good, regressed]);
  assert.equal(totals.cases, 2);
  assert.equal(totals.completionRegressions, 1);
  assert.equal(totals.deterministicRegressions, 1);
});

test("no regressions when candidate matches or improves", () => {
  const b = summarizeVariant([record()]);
  const cand = summarizeVariant([record({ toolCalls: [] })]);
  const c = { inconclusive: isCaseInconclusive(b), delta: variantDelta(b, cand) };
  const totals = aggregateComparisons([c]);
  assert.equal(totals.completionRegressions, 0);
  assert.equal(totals.scoredCases, 1);
  assert.equal(verdict(totals).ok, true);
});

test("a failed baseline (0 tokens / not completed) is inconclusive, never a false green", () => {
  // Both arms fail — the exact false-green that slipped through before.
  const b = summarizeVariant([record({ error: "auth failed", totalTokens: 0, providerCalls: 1 })]);
  const cand = summarizeVariant([record({ error: "auth failed", totalTokens: 0, providerCalls: 0 })]);
  assert.equal(isCaseInconclusive(b), true);
  const totals = aggregateComparisons([{ inconclusive: isCaseInconclusive(b), delta: variantDelta(b, cand) }]);
  assert.equal(totals.scoredCases, 0);
  assert.equal(totals.inconclusive, 1);
  const v = verdict(totals);
  assert.equal(v.ok, false, "must NOT declare safe-to-promote when nothing ran");
  assert.equal(v.code, "inconclusive");
});

test("zero-token baseline is inconclusive even without an explicit error", () => {
  assert.equal(isCaseInconclusive(summarizeVariant([record({ totalTokens: 0 })])), true);
  assert.equal(isCaseInconclusive(summarizeVariant([record({ totalTokens: 500 })])), false);
});
