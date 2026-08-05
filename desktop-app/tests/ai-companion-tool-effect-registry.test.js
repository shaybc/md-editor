"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const { getAgentToolDefinitions } = require("../resources/ai-companion/core/agent-tool-loop");
const approvalCapabilities = require("../resources/ai-companion/core/approval-capability-registry");
const {
  EFFECT_CATEGORIES,
  getToolEffect,
  isEffectfulTool,
  resolveToolResource,
  describeToolEffect,
  getCriterionEvidenceFamilies,
  isToolInEvidenceFamily,
  listCoveredTools
} = require("../resources/ai-companion/core/agent-tool-effect-registry");
const { toCanonicalName } = require("../resources/ai-companion/core/tool-scope-registry");

// Definitions expose model-facing names (consolidation renames); the registry is
// keyed on canonical names, so compare after canonicalizing.
function everyExposedToolName() {
  const names = new Set();
  for (const mode of ["chat", "plan", "agent"]) {
    for (const definition of getAgentToolDefinitions(mode)) names.add(toCanonicalName(definition.function.name));
  }
  return [...names];
}

test("every exposed tool has a registry entry with a valid effect category", () => {
  const missing = [];
  for (const name of everyExposedToolName()) {
    const entry = getToolEffect(name);
    if (!entry) missing.push(name);
    else assert.ok(EFFECT_CATEGORIES.includes(entry.effect), `${name} has invalid effect ${entry.effect}`);
  }
  assert.deepEqual(missing, [], `tools missing from the effect registry: ${missing.join(", ")}`);
});

test("registry has no entries for tools that are not exposed (no drift the other way)", () => {
  const exposed = new Set(everyExposedToolName());
  const stale = listCoveredTools().filter((name) => !exposed.has(name));
  assert.deepEqual(stale, [], `registry entries with no matching exposed tool: ${stale.join(", ")}`);
});

test("registry capability matches the approval registry for every approval-covered tool", () => {
  const mismatches = [];
  for (const name of everyExposedToolName()) {
    const approval = approvalCapabilities.describe(name, {}, {});
    if (!approval) continue; // not approval-covered -> uses a registry-only canonical capability
    const entry = getToolEffect(name);
    if (entry.capability !== approval.capability) mismatches.push(`${name}: registry=${entry.capability} approval=${approval.capability}`);
  }
  assert.deepEqual(mismatches, [], mismatches.join("; "));
});

test("git commit uses the canonical git.commit.create capability", () => {
  assert.equal(getToolEffect("git_commit").capability, "git.commit.create");
});

test("effectful predicate distinguishes mutations from reads and ui-state", () => {
  assert.equal(isEffectfulTool("apply_edit"), true);
  assert.equal(isEffectfulTool("write_file"), true);
  assert.equal(isEffectfulTool("git_commit"), true);
  assert.equal(isEffectfulTool("request_send"), true);
  assert.equal(isEffectfulTool("preferences_update"), true);
  assert.equal(isEffectfulTool("run_tests"), true);

  assert.equal(isEffectfulTool("read_file"), false);
  assert.equal(isEffectfulTool("search_text"), false);
  assert.equal(isEffectfulTool("graph_apply_filter"), false, "ui-state is not a mutation");
  assert.equal(isEffectfulTool("open_file_in_tab"), false);

  assert.equal(isEffectfulTool("some_unknown_tool"), true, "unknown tools are conservatively effectful");
});

test("resource resolver normalizes paths and identities", () => {
  assert.equal(resolveToolResource("apply_edit", { path: "./src/parser.js" }), "src/parser.js");
  assert.equal(resolveToolResource("write_file", { path: "/notes/a.md" }), "notes/a.md");
  assert.equal(resolveToolResource("git_branch_switch", { branch: "feature/x" }), "feature/x");
  assert.equal(resolveToolResource("start_code_conversion", { sourceRoot: "src", destinationRoot: "out" }), "src -> out");
  assert.equal(resolveToolResource("plan_update", { planId: "P-42" }), "P-42");
  assert.equal(resolveToolResource("request_send", { requestId: "req-1" }), "req-1");
  assert.equal(resolveToolResource("run_tests", {}), "", "tools without a discrete resource resolve to empty");
});

test("describeToolEffect returns a complete description for the control-scope matcher", () => {
  const description = describeToolEffect("apply_edit", { path: "src/a.js" });
  assert.deepEqual(description, {
    tool: "apply_edit",
    effect: "workspace-write",
    capability: "workspace.file.write",
    effectful: true,
    resource: "src/a.js"
  });
  assert.equal(describeToolEffect("not_a_tool"), null);
});

test("criterion evidence families distinguish Git status from change content", () => {
  const families = getCriterionEvidenceFamilies(
    { description: "The actual Git changes are inspected" },
    { namedTargets: {} }
  );
  assert.deepEqual(families, ["git-change-content"]);
  assert.equal(isToolInEvidenceFamily("git_changes_digest", "git-change-content"), true);
  assert.equal(isToolInEvidenceFamily("git_diff", "git-change-content"), true);
  assert.equal(isToolInEvidenceFamily("git_status", "git-change-content"), false);
});

test("criterion evidence families derive named-file writes and verification reads", () => {
  const contract = { namedTargets: { files: [{ value: "README.md" }] } };
  assert.deepEqual(
    getCriterionEvidenceFamilies({ description: "README.md was updated" }, contract),
    ["file-write"]
  );
  assert.deepEqual(
    getCriterionEvidenceFamilies({ description: "README.md contains the new guidance" }, contract),
    ["file-read"]
  );
});
