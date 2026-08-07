/**
 * Gemini tool-budget probe.
 *
 * Gemini (esp. flash-lite) rejects a generateContent request with too many / too large
 * function declarations ("Request contains an invalid argument"). This probe grows the
 * tool set group-by-group (core, then each domain scope) and reports, for each step, the
 * cumulative tool count, the serialized tool-schema byte size, and whether the call
 * succeeded — pinpointing whether the limit is by count or by size.
 *
 * Usage (needs the provider key):
 *   set AI_COMPANION_EVAL_API_KEY, then
 *   node tests/eval/gemini-tool-budget-probe.js --config tests/eval/eval-config.native.json
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const runtime = require("../../resources/ai-companion/core/agent-runtime");
const loop = require("../../resources/ai-companion/core/agent-tool-loop");
const controller = require("../../resources/ai-companion/core/agent-decision-controller");
const toolScopes = require("../../resources/ai-companion/core/tool-scope-registry");
const { validateEvaluationConfig, resolveProviderSettings } = require("./ai-companion-mode-runner");
const { normalizeGeminiTools } = require("../../resources/ai-companion/providers/gemini-connector");

function parseArguments(values) {
  const parsed = {};
  for (let i = 0; i < values.length; i += 1) {
    if (!values[i].startsWith("--")) continue;
    parsed[values[i].slice(2)] = values[i + 1]; i += 1;
  }
  return parsed;
}

// Cumulative scope groups, smallest first.
const GROUPS = [
  { label: "core only", scopes: [] },
  { label: "+git.read", scopes: ["git.read"] },
  { label: "+plan.read", scopes: ["git.read", "plan.read"] },
  { label: "+apiclient.read", scopes: ["git.read", "plan.read", "apiclient.read"] },
  { label: "+graph.read", scopes: ["git.read", "plan.read", "apiclient.read", "graph.read"] },
  { label: "+settings.read", scopes: ["git.read", "plan.read", "apiclient.read", "graph.read", "settings.read"] },
  { label: "+conversion.read", scopes: ["git.read", "plan.read", "apiclient.read", "graph.read", "settings.read", "conversion.read"] },
  { label: "+all writes+exec", scopes: null } // all domain tools
];

function toolsForGroup(scopes) {
  const enabled = scopes === null
    ? Object.fromEntries(toolScopes.allDomainTools().map((t) => [t, true]))
    : Object.fromEntries(scopes.flatMap((s) => toolScopes.DOMAIN_SCOPES[s]).map((t) => [t, true]));
  const defs = loop.getAgentToolDefinitions("agent", { enabledScopes: enabled });
  return controller.createControllerToolDefinitions(defs);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const configuration = validateEvaluationConfig(JSON.parse(fs.readFileSync(path.resolve(options.config), "utf8")));
  const target = configuration.providers.find((p) => p.role === "target") || configuration.providers[0];
  const settings = resolveProviderSettings(target);
  const provider = runtime.createProvider({ ...settings, enabled: true, agentEnabled: true });

  // Test BOTH tool_choice modes: "auto" (mode AUTO) and "required" (mode ANY, what the
  // controller actually uses). The real failure is tied to ANY, not tool count.
  async function tryCall(defs, toolChoice) {
    try {
      await provider.completeMessage(
        [{ role: "user", content: "Reply with the single word: ready." }],
        { tools: defs, toolChoice, temperature: 0, maxTokens: 32 }
      );
      return "ok";
    } catch (error) {
      return `FAIL: ${String(error?.message || error).slice(0, 70)}`;
    }
  }

  console.log("group | tools | bytes | auto | required(ANY)");
  for (const group of GROUPS) {
    const defs = toolsForGroup(group.scopes);
    const bytes = JSON.stringify(normalizeGeminiTools(defs)).length;
    const autoResult = await tryCall(defs, "auto");
    const requiredResult = await tryCall(defs, "required");
    console.log(`${group.label} | ${defs.length} | ${bytes} | ${autoResult} | ${requiredResult}`);
  }
}

if (require.main === module) main().catch((e) => { process.stderr.write(`${e.stack || e}\n`); process.exitCode = 1; });

module.exports = { toolsForGroup, GROUPS };
