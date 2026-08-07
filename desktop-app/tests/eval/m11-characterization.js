/**
 * M11.4b characterization harness (offline, deterministic).
 *
 * Before promoting the Tier-1 M11 flags (agent decision controller, progress
 * evaluation/control, intent provenance boundary, task-profile routing) to default-on,
 * this proves the change does not regress the routing / tool-surface decisions:
 *
 *   - a clearly-typed task (e.g. a preferences mutation) is restricted to its profile's
 *     tools under the candidate config, and to the full surface under baseline;
 *   - a question, a compound request, or open-ended work is NOT narrowed;
 *   - a mutation in a read-only mode is rejected, not engaged.
 *
 * It compares the baseline (flags off) and candidate (Tier-1 flags on) tool surface for
 * each corpus case, checks the expected invariants, writes a snapshot for diffing, and
 * exits non-zero on any violation. This is the deterministic decision-surface gate; the
 * end-to-end live-model comparison uses the existing `eval:ai-companion:baseline` harness
 * run once with the flags off and once on.
 *
 * Usage: node tests/eval/m11-characterization.js [--write-snapshot]
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { normalizeAiCompanionSettings } = require("../../resources/ai-companion/config/defaults");
const toolScopes = require("../../resources/ai-companion/core/tool-scope-registry");
const { classifyTask } = require("../../resources/ai-companion/core/task-classifier");
const { resolveTaskProfile } = require("../../resources/ai-companion/core/task-routing");
const { getAgentToolDefinitions } = require("../../resources/ai-companion/core/agent-tool-loop");

const DISCOVERY_TOOLS = ["glob", "read_file", "search_text", "list_files"];
const CASES_PATH = path.join(__dirname, "m11-characterization-cases.json");
const SNAPSHOT_PATH = path.join(__dirname, "baselines", "m11-characterization.json");

/** Tool scopes with the preferences write capability enabled (so profiles can engage). */
function candidateToolScopes() {
  const scopes = toolScopes.defaultToolScopes();
  scopes.preferences_update = true;
  return scopes;
}

function baselineSettings(enabledScopes) {
  return normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: false,
    taskProfileRoutingEnabled: false,
    intentProvenanceBoundaryEnabled: false,
    toolScopes: enabledScopes
  });
}

function candidateSettings(enabledScopes) {
  return normalizeAiCompanionSettings({
    enabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: true,
    taskProfileRoutingEnabled: true,
    intentProvenanceBoundaryEnabled: true,
    toolScopes: enabledScopes
  });
}

function hasDiscovery(toolNames) {
  return DISCOVERY_TOOLS.some((name) => toolNames.includes(name));
}

/** Compute the exposed tool surface for one case under a config. */
function toolSurface(testCase, settings, engageProfile) {
  const options = { enabledScopes: settings.toolScopes };
  if (engageProfile) {
    const routed = resolveTaskProfile({
      prompt: testCase.prompt,
      mode: testCase.mode,
      settings,
      enabledScopes: settings.toolScopes
    });
    if (routed.engaged) options.taskProfileToolNames = routed.toolNames;
  }
  // Task profiles only apply in agent mode; a read-only mode uses that mode's surface.
  const mode = testCase.mode === "chat" || testCase.mode === "plan" ? testCase.mode : "agent";
  return getAgentToolDefinitions(mode, options).map((definition) => definition.function.name);
}

/** Characterize a single case: classification + baseline/candidate surfaces + verdicts. */
function characterizeCase(testCase) {
  const scopes = candidateToolScopes();
  const candSettings = candidateSettings(scopes);
  const baseSettings = baselineSettings(scopes);

  const classification = classifyTask({
    prompt: testCase.prompt,
    mode: testCase.mode,
    context: { enabledScopes: scopes }
  });
  const routed = resolveTaskProfile({ prompt: testCase.prompt, mode: testCase.mode, settings: candSettings, enabledScopes: scopes });

  const baselineTools = toolSurface(testCase, baseSettings, false);
  const candidateTools = toolSurface(testCase, candSettings, true);

  const restricted = !hasDiscovery(candidateTools);
  const signature = {
    id: testCase.id,
    applicability: classification.applicability,
    taskType: classification.taskType,
    engaged: routed.engaged,
    baselineToolCount: baselineTools.length,
    candidateToolCount: candidateTools.length,
    baselineHasDiscovery: hasDiscovery(baselineTools),
    candidateRestricted: restricted
  };

  const violations = [];
  const expect = testCase.expect || {};
  if (expect.applicability && classification.applicability !== expect.applicability) {
    violations.push(`applicability=${classification.applicability} (expected ${expect.applicability})`);
  }
  if (typeof expect.engaged === "boolean" && routed.engaged !== expect.engaged) {
    violations.push(`engaged=${routed.engaged} (expected ${expect.engaged})`);
  }
  if (typeof expect.restricted === "boolean" && restricted !== expect.restricted) {
    violations.push(`restricted=${restricted} (expected ${expect.restricted})`);
  }
  // Global invariant: baseline must always expose the full discovery surface in agent mode.
  if (testCase.mode === "agent" && !signature.baselineHasDiscovery) {
    violations.push("baseline unexpectedly lacks discovery tools");
  }

  return { signature, violations };
}

function run({ writeSnapshot = false } = {}) {
  const dataset = JSON.parse(fs.readFileSync(CASES_PATH, "utf8"));
  const results = dataset.cases.map(characterizeCase);
  const signatures = results.map((result) => result.signature);
  const failures = results.filter((result) => result.violations.length);

  for (const result of results) {
    const mark = result.violations.length ? "FAIL" : "ok  ";
    const s = result.signature;
    console.log(`${mark} ${s.id}: applicability=${s.applicability} engaged=${s.engaged} candidateTools=${s.candidateToolCount} restricted=${s.candidateRestricted}`);
    for (const violation of result.violations) console.log(`       - ${violation}`);
  }
  console.log(`\n${results.length - failures.length}/${results.length} cases passed the characterization.`);

  if (writeSnapshot) {
    fs.mkdirSync(path.dirname(SNAPSHOT_PATH), { recursive: true });
    fs.writeFileSync(SNAPSHOT_PATH, `${JSON.stringify({ generatedAt: new Date().toISOString(), signatures }, null, 2)}\n`, "utf8");
    console.log(`Snapshot written to ${path.relative(process.cwd(), SNAPSHOT_PATH)}`);
  }

  return { signatures, failures };
}

if (require.main === module) {
  const writeSnapshot = process.argv.includes("--write-snapshot");
  const { failures } = run({ writeSnapshot });
  process.exit(failures.length ? 1 : 0);
}

module.exports = { run, characterizeCase };
