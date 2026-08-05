"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { buildPlanContext, mapPlanProjectionToBuilderState } = require("../resources/ai-companion/core/plan-context-policy");
const { normalizePlanObservation, planActionSignature } = require("../resources/ai-companion/core/plan-observation-policy");
const { createInitialPlanProjection, applyPlanEvent, PLAN_EVENT_TYPES } = require("../resources/ai-companion/core/plan-state-projection");

function projectionWith(events, prompt = "Add a logout button") {
  let p = createInitialPlanProjection({ prompt });
  for (const event of events) {
    const res = applyPlanEvent(p, event);
    assert.equal(res.accepted, true, `event ${event.type} rejected: ${res.reasonCodes.join(",")}`);
    p = res.projection;
  }
  return p;
}

test("plan context includes mandatory sources and delegates to the shared builder", () => {
  const p = projectionWith([
    { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [{ id: "R1", statement: "logout button", required: true }], provenance: "fallback", provisional: false }
  ]);
  const ctx = buildPlanContext({ planProjection: p, systemPrompt: "PLAN SYS" });
  assert.equal(ctx.mode, "plan");
  const joined = ctx.messages.map((m) => String(m.content)).join("\n");
  assert.ok(joined.includes("PLAN SYS"), "system prompt is mandatory");
  assert.ok(joined.includes("logout button"), "requirements appear in the state projection");
  assert.equal(ctx.messages[ctx.messages.length - 1].role, "user", "current prompt is the final user message");
});

test("verbatim clarifications are preserved as authoritative user instructions", () => {
  const p = projectionWith([
    { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [{ id: "R1", statement: "logout", required: true }], provenance: "fallback", provisional: false },
    { type: PLAN_EVENT_TYPES.CLARIFICATION_RECORDED, text: "Place it in the top-right navbar." }
  ]);
  const ctx = buildPlanContext({ planProjection: p, systemPrompt: "SYS" });
  const joined = ctx.messages.map((m) => String(m.content)).join("\n");
  assert.ok(joined.includes("Place it in the top-right navbar."), "clarification is verbatim");
});

test("live editor buffer takes precedence and is flagged as newer", () => {
  const p = projectionWith([
    { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [{ id: "R1", statement: "x", required: true }], provenance: "fallback", provisional: false }
  ]);
  const ctx = buildPlanContext({ planProjection: p, systemPrompt: "SYS", activeFile: { path: "src/nav.js", content: "export const Nav = 1;" } });
  const joined = ctx.messages.map((m) => String(m.content)).join("\n");
  assert.ok(joined.includes("Live editor buffer: src/nav.js"));
  assert.ok(/newer than saved-file reads/.test(joined));
});

test("intent contract is reported missing when Plan has none", () => {
  const p = projectionWith([
    { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [{ id: "R1", statement: "x", required: true }], provenance: "fallback", provisional: false }
  ]);
  const ctx = buildPlanContext({ planProjection: p, systemPrompt: "SYS" });
  assert.ok(ctx.manifest.requiredSourcesMissing.includes("intent-contract"));
});

test("intent-contract requirements map into acceptance criteria in state", () => {
  const p = projectionWith([
    { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [{ id: "AC1", statement: "login works", source: "intent-contract", required: true }], provenance: "intent-contract", provisional: false }
  ]);
  const state = mapPlanProjectionToBuilderState(p, {});
  assert.equal(state.criteria[0].id, "AC1");
  assert.equal(state.criteria[0].description, "login works");
  assert.equal(state.schemaVersion, 3);
});

test("context building is deterministic for identical inputs", () => {
  const p = projectionWith([
    { type: PLAN_EVENT_TYPES.REQUIREMENTS_DERIVED, requirements: [{ id: "R1", statement: "x", required: true }], provenance: "fallback", provisional: false }
  ]);
  const a = buildPlanContext({ planProjection: p, systemPrompt: "SYS", requestId: "req-1" });
  const b = buildPlanContext({ planProjection: p, systemPrompt: "SYS", requestId: "req-1" });
  assert.deepEqual(a.manifest.sourceDecisions, b.manifest.sourceDecisions);
  assert.equal(a.manifest.totalChars, b.manifest.totalChars);
});

test("read-only observations pass the guard; mutating results are flagged violations", () => {
  const readObs = normalizePlanObservation({ tool: "read_file", args: { path: "a.js" }, result: "body", evidenceEntry: { summary: "read a.js", files: ["a.js"] } });
  assert.equal(readObs.readOnly, true);
  assert.equal(readObs.observation.effect, "read");

  const writeObs = normalizePlanObservation({ tool: "write_file", args: { path: "a.js" }, result: "ok", evidenceEntry: { summary: "wrote" } });
  assert.equal(writeObs.readOnly, false);
  assert.ok(writeObs.violationReason.startsWith("plan_mode_mutation"));
});

test("repeated equivalent reads share an action signature", () => {
  assert.equal(
    planActionSignature("search_text", { pattern: "auth" }),
    planActionSignature("search_text", { pattern: "auth" })
  );
  assert.notEqual(
    planActionSignature("search_text", { pattern: "auth" }),
    planActionSignature("search_text", { pattern: "router" })
  );
});
