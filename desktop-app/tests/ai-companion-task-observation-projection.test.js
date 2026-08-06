"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { createTaskState, projectObservation, buildTaskContext, contextSize } = require("../resources/ai-companion/core/task-observation-projection");

function sixKeyState() {
  const keys = ["k1", "k2", "k3", "k4", "k5", "k6"];
  return createTaskState({ requestedKeys: keys, desiredValues: Object.fromEntries(keys.map((k) => [k, true])), requiredActionTool: "preferences_update" });
}

test("projecting a search resolves requested keys and drops raw payload", () => {
  const s0 = sixKeyState();
  const s1 = projectObservation(s0, {
    tool: "preferences_search",
    matches: [{ key: "k1", descriptor: "Enable X" }, { key: "k2", descriptor: "Enable Y" }],
    rawPayload: "x".repeat(50000) // must not be retained
  });
  assert.deepEqual(s1.resolvedKeys.sort(), ["k1", "k2"]);
  assert.equal(s1.requestedKeysResolved, false);
  assert.equal(JSON.stringify(s1).includes("xxxxx"), false, "raw payload dropped");
});

test("all requested keys resolved flips requestedKeysResolved", () => {
  let s = sixKeyState();
  s = projectObservation(s, { tool: "preferences_search", matches: s.requestedKeys.map((key) => ({ key, descriptor: "d" })) });
  assert.equal(s.requestedKeysResolved, true);
});

test("ambient (non-requested) hits are dropped", () => {
  let s = sixKeyState();
  s = projectObservation(s, { tool: "preferences_search", matches: [{ key: "unrelatedKey", descriptor: "junk" }] });
  assert.deepEqual(s.resolvedKeys, []);
  assert.equal(s.descriptors.unrelatedKey, undefined);
});

test("projection is idempotent — repeated no-op observations do not grow state", () => {
  let s = sixKeyState();
  s = projectObservation(s, { tool: "preferences_search", matches: s.requestedKeys.map((key) => ({ key, descriptor: "d" })) });
  const sizeAfterFirst = contextSize(s);
  for (let i = 0; i < 10; i += 1) {
    s = projectObservation(s, { tool: "preferences_search", matches: s.requestedKeys.map((key) => ({ key, descriptor: "d" })) });
  }
  assert.equal(contextSize(s), sizeAfterFirst, "no growth across repeated observations");
});

test("read-back values are captured for verification", () => {
  let s = sixKeyState();
  s = projectObservation(s, { tool: "preferences_get", matches: [{ key: "k1", value: true }, { key: "k2", value: false }] });
  assert.equal(s.observedValues.k1, true);
  assert.equal(s.observedValues.k2, false);
});

test("built context is bounded and rebuilt from typed state only", () => {
  let s = sixKeyState();
  s = projectObservation(s, { tool: "preferences_search", matches: [{ key: "k1", descriptor: "y".repeat(5000) }] });
  const ctx = buildTaskContext(s);
  assert.ok(ctx.resolvedDescriptors.k1.length <= 160, "descriptor is truncated");
  assert.ok(!("rawPayload" in ctx));
});
