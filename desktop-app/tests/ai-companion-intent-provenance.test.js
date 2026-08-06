"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const {
  isUserReferenced,
  matchesAmbient,
  isAmbientOnlyTarget,
  applyIntentProvenanceBoundary
} = require("../resources/ai-companion/core/intent-provenance");

const promptIndex = (prompt) => prompt; // applyIntentProvenanceBoundary builds its own index

// --- user-reference detection ----------------------------------------------

test("a file named in the prompt is user-referenced", () => {
  const idx = require("../resources/ai-companion/core/intent-provenance");
  // basename token
  assert.equal(
    idx.isUserReferenced("resources/config/defaults.js", { tokens: new Set(["defaults.js"]), text: "edit defaults.js" }),
    true
  );
});

test("full path substring counts as user-referenced", () => {
  assert.equal(
    isUserReferenced("resources/config/defaults.js", { tokens: new Set(), text: "look at resources/config/defaults.js please" }),
    true
  );
});

test("an unmentioned file is not user-referenced", () => {
  assert.equal(
    isUserReferenced("conversation-export-tools.js", { tokens: new Set(["set", "autocompleteenabled", "true"]), text: "set autocompleteenabled to true" }),
    false
  );
});

// --- ambient matching -------------------------------------------------------

test("matchesAmbient matches by full path and by basename", () => {
  const ambient = { paths: new Set(["src/payment-service.js"]), basenames: new Set(["payment-service.js"]) };
  assert.equal(matchesAmbient("src/payment-service.js", ambient), true);
  assert.equal(matchesAmbient("other/payment-service.js", ambient), true);
  assert.equal(matchesAmbient("unrelated.js", ambient), false);
});

test("a confirmed target is never ambient-only", () => {
  const ambient = { paths: new Set(["a.js"]), basenames: new Set(["a.js"]) };
  const idx = { tokens: new Set(), text: "" };
  assert.equal(isAmbientOnlyTarget({ value: "a.js", source: "active-editor", status: "confirmed" }, ambient, idx), false);
  assert.equal(isAmbientOnlyTarget({ value: "a.js", source: "active-editor", status: "unverified" }, ambient, idx), true);
});

// --- the boundary (golden case) --------------------------------------------

test("polluted-context: incidental active file is stripped from mustInspect and namedTargets", () => {
  const contract = {
    acceptanceCriteria: [
      { id: "AC1", statement: "autocompleteEnabled is true", mustInspect: ["conversation-export-tools.js"] }
    ],
    namedTargets: {
      files: [{ id: "T1", value: "conversation-export-tools.js", source: "active-editor", status: "unverified" }],
      symbols: [], errors: [], uiAreas: []
    }
  };
  const { contract: out, report } = applyIntentProvenanceBoundary(contract, {
    prompt: "Set autocompleteEnabled to true",
    ambient: { activeFilePath: "resources/js/conversation-export-tools.js" }
  });
  assert.equal(report.changed, true);
  assert.deepEqual(out.namedTargets.files, []);
  assert.deepEqual(out.acceptanceCriteria[0].mustInspect, []);
  assert.ok(report.demotedTargets.includes("conversation-export-tools.js"));
});

test("a user-referenced target survives even when it is also the active file", () => {
  const contract = {
    acceptanceCriteria: [{ id: "AC1", statement: "x", mustInspect: ["defaults.js"] }],
    namedTargets: { files: [{ id: "T1", value: "defaults.js", source: "active-editor", status: "unverified" }], symbols: [], errors: [], uiAreas: [] }
  };
  const { contract: out, report } = applyIntentProvenanceBoundary(contract, {
    prompt: "Fix the bug in defaults.js",
    ambient: { activeFilePath: "resources/config/defaults.js" }
  });
  assert.equal(report.changed, false);
  assert.equal(out.namedTargets.files.length, 1);
  assert.deepEqual(out.acceptanceCriteria[0].mustInspect, ["defaults.js"]);
});

test("no ambient context is a no-op", () => {
  const contract = {
    acceptanceCriteria: [{ id: "AC1", statement: "x", mustInspect: ["a.js"] }],
    namedTargets: { files: [{ id: "T1", value: "a.js", source: "prompt", status: "unverified" }], symbols: [], errors: [], uiAreas: [] }
  };
  const { contract: out, report } = applyIntentProvenanceBoundary(contract, { prompt: "do a thing", ambient: {} });
  assert.equal(report.changed, false);
  assert.equal(out, contract, "returns the same object unchanged");
});

test("the input contract is never mutated", () => {
  const contract = {
    acceptanceCriteria: [{ id: "AC1", statement: "x", mustInspect: ["ambient.js"] }],
    namedTargets: { files: [{ id: "T1", value: "ambient.js", source: "active-editor", status: "unverified" }], symbols: [], errors: [], uiAreas: [] }
  };
  const snapshot = JSON.stringify(contract);
  applyIntentProvenanceBoundary(contract, { prompt: "unrelated", ambient: { activeFilePath: "x/ambient.js" } });
  assert.equal(JSON.stringify(contract), snapshot, "input untouched");
});
