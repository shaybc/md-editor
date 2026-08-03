"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { normalizeIntentContract } = require("../resources/ai-companion/core/intent-contract");
const { evaluateMutationControl } = require("../resources/ai-companion/core/intent-mutation-control");
const {
  createSearchTracker,
  detectAbsentTargets,
  resolveFieldRef,
  validateConflictReport,
  routeConflict,
  reviseContractForConflict,
  recordConflictAsDecision
} = require("../resources/ai-companion/core/intent-conflict");

function contractWithTargets() {
  return normalizeIntentContract({
    goal: { value: "Fix parsing", provenance: "inferred" },
    expectedOutcome: "o",
    acceptanceCriteria: [{ description: "c" }],
    namedTargets: { files: [{ id: "T1", value: "src/missing.js" }], symbols: [{ id: "T2", value: "doThing" }] },
    assumptions: [{ id: "A1", statement: "parser lives in src", kind: "locational", keywords: ["parser"], relatedTargets: ["T1"] }]
  });
}

test("a direct read miss proves file absence; a single empty grep does not", () => {
  const tracker = createSearchTracker();
  tracker.add({ toolCallId: "r1", tool: "read_file", query: "src/missing.js", notFound: true });
  tracker.add({ toolCallId: "g1", tool: "search_grep", query: "doThing", empty: true, exhaustive: true });
  const absent = detectAbsentTargets(contractWithTargets(), tracker).map((entry) => entry.id);
  assert.ok(absent.includes("T1"), "read miss proves file absence");
  assert.ok(absent.includes("T2"), "exhaustive empty symbol grep proves symbol absence");

  const onlyGrepForFile = createSearchTracker();
  onlyGrepForFile.add({ toolCallId: "g9", tool: "search_grep", query: "src/missing.js", empty: true });
  assert.equal(detectAbsentTargets(contractWithTargets(), onlyGrepForFile).some((entry) => entry.id === "T1"), false);
});

test("a truncated search never proves absence and an open tab defeats a disk miss", () => {
  const truncated = createSearchTracker();
  truncated.add({ toolCallId: "g1", tool: "search_grep", query: "doThing", empty: true, truncated: true });
  assert.equal(detectAbsentTargets(contractWithTargets(), truncated).some((entry) => entry.id === "T2"), false);

  const openTab = createSearchTracker();
  openTab.add({ toolCallId: "r1", tool: "read_file", query: "src/missing.js", notFound: true });
  openTab.add({ toolCallId: "g2", tool: "glob", query: "src/missing.js", empty: true, exhaustive: true });
  openTab.add({ toolCallId: "t1", tool: "read_open_tabs", query: "src/missing.js" });
  assert.equal(detectAbsentTargets(contractWithTargets(), openTab).some((entry) => entry.id === "T1"), false);
});

test("filename absence requires an exhaustive exact-basename glob and no matching open tab", () => {
  const contract = normalizeIntentContract({
    goal: "g",
    expectedOutcome: "o",
    acceptanceCriteria: [{ description: "c" }],
    namedTargets: { files: [{ id: "T1", value: "parser.js", kind: "filename" }] }
  });
  const broad = createSearchTracker();
  broad.add({ toolCallId: "g1", tool: "glob", query: "**/*parser.js*", empty: true, exhaustive: true });
  assert.equal(detectAbsentTargets(contract, broad).length, 0);

  const exact = createSearchTracker();
  exact.add({ toolCallId: "g2", tool: "glob", query: "**/parser.js", empty: true, exhaustive: true });
  assert.equal(detectAbsentTargets(contract, exact)[0].id, "T1");

  exact.add({ toolCallId: "tabs", tool: "read_open_tabs", query: "scratch/parser.js" });
  assert.equal(detectAbsentTargets(contract, exact).length, 0);
});

test("resolveFieldRef resolves singletons and id-addressed nodes", () => {
  const contract = contractWithTargets();
  assert.equal(resolveFieldRef(contract, "goal").kind, "goal");
  assert.equal(resolveFieldRef(contract, "target:T1").node.value, "src/missing.js");
  assert.equal(resolveFieldRef(contract, "assumption:A1").kind, "assumption");
  assert.equal(resolveFieldRef(contract, "criterion:AC1").node.description, "c");
  assert.equal(resolveFieldRef(contract, "target:T9"), null);
  assert.equal(resolveFieldRef(contract, "not-a-ref"), null);
});

test("validateConflictReport enforces evidence existence and per-type admissibility", () => {
  const contract = contractWithTargets();
  const tracker = createSearchTracker();
  tracker.add({ toolCallId: "e1", tool: "search_grep", query: "parser found in lib", empty: false });

  assert.deepEqual(validateConflictReport({ fieldRef: "target:T9", conflictType: "target-relocated", evidenceToolCallIds: ["e1"] }, { contract, tracker }).errors, ["unresolvable-fieldRef"]);
  assert.ok(validateConflictReport({ fieldRef: "target:T1", conflictType: "target-relocated", evidenceToolCallIds: ["nope"] }, { contract, tracker }).errors.includes("unknown-evidence"));

  const relocated = validateConflictReport({ fieldRef: "target:T1", conflictType: "target-relocated", evidenceToolCallIds: ["e1"] }, { contract, tracker });
  assert.equal(relocated.valid, true);

  const emptyOnly = createSearchTracker();
  emptyOnly.add({ toolCallId: "e2", tool: "search_grep", query: "x", empty: true });
  assert.ok(validateConflictReport({ fieldRef: "target:T1", conflictType: "target-relocated", evidenceToolCallIds: ["e2"] }, { contract, tracker: emptyOnly }).errors.includes("no-positive-match"));

  const assumptionOk = validateConflictReport({ fieldRef: "assumption:A1", conflictType: "assumption-contradicted", evidenceToolCallIds: ["e1"] }, { contract, tracker });
  assert.equal(assumptionOk.valid, true, "evidence query mentions the assumption keyword 'parser'");
});

test("routeConflict follows provenance and clarification mode", () => {
  const inferred = contractWithTargets();
  assert.equal(routeConflict(resolveFieldRef(inferred, "target:T1"), { intentClarificationMode: "ask" }).action, "revise");
  assert.equal(routeConflict(resolveFieldRef(inferred, "goal"), { intentClarificationMode: "ask" }).action, "ask");
  assert.equal(routeConflict(resolveFieldRef(inferred, "goal"), { intentClarificationMode: "off" }).action, "record");

  const explicit = normalizeIntentContract({ goal: { value: "g", provenance: "explicit" }, expectedOutcome: "o", acceptanceCriteria: [{ description: "c" }] });
  assert.equal(routeConflict(resolveFieldRef(explicit, "goal"), { intentClarificationMode: "ask" }).reason, "immutable");
});

test("reviseContractForConflict marks targets absent and raises assumption risk, never touching the goal", () => {
  const contract = contractWithTargets();
  const revisedTarget = reviseContractForConflict(contract, { resolved: resolveFieldRef(contract, "target:T1"), conflictType: "target-relocated" });
  assert.equal(revisedTarget.namedTargets.files.find((file) => file.id === "T1").status, "absent");
  assert.equal(revisedTarget.revisions.length, 1);
  assert.equal(revisedTarget.goal.value, "Fix parsing");

  const revisedAssumption = reviseContractForConflict(contract, { resolved: resolveFieldRef(contract, "assumption:A1"), conflictType: "assumption-contradicted" });
  assert.equal(revisedAssumption.assumptions.find((assumption) => assumption.id === "A1").risk, "high");
});

test("recordConflictAsDecision installs a mutation-blocking decision", () => {
  const contract = contractWithTargets();
  const recorded = recordConflictAsDecision(contract, { resolved: resolveFieldRef(contract, "goal"), conflictType: "goal-misread", explanation: "cause is elsewhere" });
  assert.equal(recorded.unresolvedDecisions.at(-1).controlsMutation, true);
  assert.equal(evaluateMutationControl("apply_edit", { path: "x.js" }, recorded).blocked, true);
});
