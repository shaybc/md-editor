"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { evaluateActionReadiness, revalidateReadiness, READINESS } = require("../resources/ai-companion/core/action-readiness");

const sixKeys = ["a", "b", "c", "d", "e", "f"];
const allTrue = Object.fromEntries(sixKeys.map((k) => [k, true]));

function baseInput(overrides = {}) {
  return {
    requestedTargets: sixKeys,
    resolvedTargets: sixKeys,
    desiredValues: allTrue,
    capableToolAvailable: true,
    requiredAction: "preferences_update",
    taskAuthorized: true,
    approvalRequired: false,
    stateVersion: 7,
    ...overrides
  };
}

test("fully resolved, no approval required => ready_for_action with a stamp", () => {
  const r = evaluateActionReadiness(baseInput());
  assert.equal(r.status, READINESS.READY_FOR_ACTION);
  assert.equal(r.missingFacts.length, 0);
  assert.equal(r.readiness.basedOnStateVersion, 7);
  assert.equal(r.readiness.readinessId, "ready-7");
  assert.equal(r.readiness.requiredAction, "preferences_update");
  assert.deepEqual(r.resolution, { requestedKeys: 6, resolvedKeys: 6, unresolvedKeys: 0 });
});

test("approval required but not granted => ready_for_approval (never bypasses approval)", () => {
  const r = evaluateActionReadiness(baseInput({ approvalRequired: true, approvalGranted: false }));
  assert.equal(r.status, READINESS.READY_FOR_APPROVAL);
  assert.equal(r.approvalRequired, true);
});

test("approval required and granted => ready_for_action", () => {
  const r = evaluateActionReadiness(baseInput({ approvalRequired: true, approvalGranted: true }));
  assert.equal(r.status, READINESS.READY_FOR_ACTION);
});

test("partial resolution is all-or-nothing (one key unresolved => incomplete)", () => {
  const r = evaluateActionReadiness(baseInput({ resolvedTargets: ["a", "b", "c", "d", "e"] }));
  assert.equal(r.status, READINESS.INCOMPLETE);
  assert.ok(r.missingFacts.includes("unresolved:f"));
  assert.equal(r.resolution.resolvedKeys, 5);
  assert.equal(r.resolution.unresolvedKeys, 1);
  assert.equal(r.readiness, null);
});

test("a missing desired value blocks readiness", () => {
  const partial = { a: true, b: true, c: true, d: true, e: true }; // missing f
  const r = evaluateActionReadiness(baseInput({ desiredValues: partial }));
  assert.equal(r.status, READINESS.INCOMPLETE);
  assert.ok(r.missingFacts.includes("no-desired-value:f"));
});

test("no capable tool blocks readiness", () => {
  const r = evaluateActionReadiness(baseInput({ capableToolAvailable: false }));
  assert.equal(r.status, READINESS.INCOMPLETE);
  assert.ok(r.missingFacts.includes("no-capable-tool"));
});

test("unauthorized task is never ready", () => {
  const r = evaluateActionReadiness(baseInput({ taskAuthorized: false }));
  assert.equal(r.status, READINESS.INCOMPLETE);
  assert.ok(r.missingFacts.includes("not-authorized"));
});

// --- stale-readiness protection --------------------------------------------

test("a fresh stamp revalidates against unchanged state", () => {
  const r = evaluateActionReadiness(baseInput());
  const check = revalidateReadiness(r.readiness, {
    stateVersion: 7, resolvedTargets: sixKeys, desiredValues: allTrue, requiredAction: "preferences_update"
  });
  assert.equal(check.valid, true);
  assert.equal(check.stale, false);
});

test("steering after readiness: changed desired values make the stamp stale", () => {
  const r = evaluateActionReadiness(baseInput());
  // User: "leave durable recovery disabled" -> one value flips, state advances.
  const steered = { ...allTrue, f: false };
  const check = revalidateReadiness(r.readiness, {
    stateVersion: 8, resolvedTargets: sixKeys, desiredValues: steered, requiredAction: "preferences_update"
  });
  assert.equal(check.valid, false);
  assert.ok(check.reasons.includes("state-version-changed"));
  assert.ok(check.reasons.includes("desired-values-changed"));
});

test("a changed required action invalidates the stamp", () => {
  const r = evaluateActionReadiness(baseInput());
  const check = revalidateReadiness(r.readiness, {
    stateVersion: 7, resolvedTargets: sixKeys, desiredValues: allTrue, requiredAction: "preferences_reset"
  });
  assert.equal(check.stale, true);
  assert.ok(check.reasons.includes("required-action-changed"));
});
