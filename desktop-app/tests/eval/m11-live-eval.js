/**
 * M11 live same-model A/B eval (objective, no hand-scoring).
 *
 * Runs each agent-mode case twice against the SAME model — baseline (all M11/controller
 * flags off) and candidate (Tier-1 flags on: decision controller + progress
 * evaluation/control + intent provenance boundary + task-profile routing) — and reports
 * the objective deltas: provider calls, tokens, tool calls, duration, completion, and
 * deterministic pass/fail. No blind human scoring required.
 *
 * This is the confidence-builder to run alongside the offline `eval:m11:characterization`
 * decision-surface gate before promoting the Tier-1 flags to default-on.
 *
 * Usage (on a machine with the provider key):
 *   set AI_COMPANION_EVAL_API_KEY, then
 *   node tests/eval/m11-live-eval.js --config tests/eval/eval-config.local.json --suite smoke --repetitions 1
 */

"use strict";

const fs = require("node:fs");
const path = require("node:path");

const { runEvaluationCase, validateEvaluationConfig, validateEvaluationDataset } = require("./ai-companion-mode-runner");

const DEFAULT_DATASET_PATH = path.join(__dirname, "ai-companion-baseline-cases.json");
const DEFAULT_OUTPUT_PATH = path.join(__dirname, "results", "m11-live");

// Candidate flags overlaid onto the provider settings (controller is toggled via the
// runEvaluationCase controllerEnabled param; progress cascades on with the controller).
const CANDIDATE_FLAGS = Object.freeze({
  taskProfileRoutingEnabled: true,
  intentProvenanceBoundaryEnabled: true
});

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "dry-run") parsed.dryRun = true;
    else { parsed[key] = values[index + 1]; index += 1; }
  }
  return parsed;
}

/** Reduce one variant's per-turn records for a case into objective totals. */
function summarizeVariant(records) {
  const list = Array.isArray(records) ? records : [];
  const sum = (field) => list.reduce((total, record) => total + (Number(record[field]) || 0), 0);
  return {
    providerCalls: sum("providerCalls"),
    totalTokens: sum("totalTokens"),
    promptTokens: sum("promptTokens"),
    completionTokens: sum("completionTokens"),
    toolCalls: list.reduce((total, record) => total + (Array.isArray(record.toolCalls) ? record.toolCalls.length : 0), 0),
    durationMs: sum("durationMs"),
    completed: list.length > 0 && list.every((record) => !record.error),
    deterministicPassed: list.length > 0 && list.every((record) => record.deterministic?.passed !== false && !record.error),
    errors: [...new Set(list.map((record) => String(record.error || "")).filter(Boolean))]
  };
}

/**
 * A case is inconclusive when the BASELINE arm did not actually run — no successful
 * completion, or zero tokens (a provider/auth/config failure). We cannot judge the
 * candidate against a baseline that never produced a result.
 */
function isCaseInconclusive(baseline) {
  return !baseline.completed || baseline.totalTokens === 0;
}

/** Objective delta (candidate − baseline) for the headline metrics. */
function variantDelta(baseline, candidate) {
  return {
    providerCalls: candidate.providerCalls - baseline.providerCalls,
    totalTokens: candidate.totalTokens - baseline.totalTokens,
    toolCalls: candidate.toolCalls - baseline.toolCalls,
    durationMs: candidate.durationMs - baseline.durationMs,
    completedChange: Number(candidate.completed) - Number(baseline.completed),
    deterministicChange: Number(candidate.deterministicPassed) - Number(baseline.deterministicPassed)
  };
}

/** Aggregate case comparisons into run-level totals. */
function aggregateComparisons(comparisons) {
  const totals = { cases: comparisons.length, scoredCases: 0, inconclusive: 0, toolCallsDelta: 0, totalTokensDelta: 0, providerCallsDelta: 0, completionRegressions: 0, deterministicRegressions: 0 };
  for (const comparison of comparisons) {
    if (comparison.inconclusive) { totals.inconclusive += 1; continue; }
    totals.scoredCases += 1;
    totals.toolCallsDelta += comparison.delta.toolCalls;
    totals.totalTokensDelta += comparison.delta.totalTokens;
    totals.providerCallsDelta += comparison.delta.providerCalls;
    if (comparison.delta.completedChange < 0) totals.completionRegressions += 1;
    if (comparison.delta.deterministicChange < 0) totals.deterministicRegressions += 1;
  }
  return totals;
}

/** The overall verdict, honest about inconclusive baselines. */
function verdict(totals) {
  if (totals.scoredCases === 0) return { code: "inconclusive", ok: false, message: "INCONCLUSIVE — no case had a successfully-completing baseline (provider/auth/config failure). Nothing was measured; check the error column and your API key." };
  if (totals.inconclusive > 0) return { code: "partial", ok: false, message: `INCONCLUSIVE for ${totals.inconclusive}/${totals.cases} case(s) whose baseline did not complete; the rest showed ${totals.completionRegressions + totals.deterministicRegressions} regression(s). Resolve the failing baselines before deciding.` };
  if (totals.completionRegressions + totals.deterministicRegressions > 0) return { code: "regressed", ok: false, message: "REGRESSIONS DETECTED — do not promote until resolved." };
  return { code: "clean", ok: true, message: "No regressions across successfully-measured cases — Tier-1 candidate is safe to promote by this measure." };
}

/** Run the live A/B comparison. `providerFactory` is injectable for offline tests. */
async function runComparison({ configPath, datasetPath = DEFAULT_DATASET_PATH, suite = "full", repetitions = 1, providerFactory } = {}) {
  const configuration = validateEvaluationConfig(JSON.parse(fs.readFileSync(path.resolve(configPath), "utf8")));
  const dataset = validateEvaluationDataset(JSON.parse(fs.readFileSync(path.resolve(datasetPath), "utf8")));
  const target = configuration.providers.find((provider) => provider.role === "target") || configuration.providers[0];
  const baselineProvider = target;
  const candidateProvider = { ...target, id: `${target.id}-candidate`, settings: { ...target.settings, ...CANDIDATE_FLAGS } };

  const cases = dataset.cases.filter((testCase) => testCase.mode === "agent" && (suite === "full" || testCase.suite === suite));
  const comparisons = [];
  for (const testCase of cases) {
    const baselineRecords = [];
    const candidateRecords = [];
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      baselineRecords.push(...await runEvaluationCase({ testCase, providerConfiguration: baselineProvider, repetition, providerFactory, controllerEnabled: false }));
      // Candidate = full valid stateful stack: the controller + verifier variant enables
      // intent contracts + completion assessment, which in turn lets progress
      // evaluation/control cascade on (progress control requires the verifier).
      candidateRecords.push(...await runEvaluationCase({ testCase, providerConfiguration: candidateProvider, repetition, providerFactory, controllerEnabled: true, verifierCompletionEnabled: true }));
    }
    const baseline = summarizeVariant(baselineRecords);
    const candidate = summarizeVariant(candidateRecords);
    comparisons.push({ caseId: testCase.id, category: testCase.category, baseline, candidate, delta: variantDelta(baseline, candidate), inconclusive: isCaseInconclusive(baseline) });
  }
  const totals = aggregateComparisons(comparisons);
  return { comparisons, totals, verdict: verdict(totals) };
}

function printReport(result) {
  console.log("case | status | tools(base→cand) | tokens(base→cand) | calls(base→cand) | completed(b/c) | error");
  for (const c of result.comparisons) {
    const status = c.inconclusive ? "INCONCLUSIVE" : "scored";
    const err = (c.baseline.errors[0] || c.candidate.errors[0] || "").slice(0, 80);
    console.log(`${c.caseId} | ${status} | ${c.baseline.toolCalls}→${c.candidate.toolCalls} | ${c.baseline.totalTokens}→${c.candidate.totalTokens} | ${c.baseline.providerCalls}→${c.candidate.providerCalls} | ${c.baseline.completed}/${c.candidate.completed} | ${err}`);
  }
  const t = result.totals;
  console.log(`\nScored ${t.scoredCases}/${t.cases} cases (${t.inconclusive} inconclusive). Δtools=${t.toolCallsDelta} Δtokens=${t.totalTokensDelta} Δcalls=${t.providerCallsDelta}`);
  console.log(`Completion regressions: ${t.completionRegressions} | Deterministic regressions: ${t.deterministicRegressions}`);
  console.log(result.verdict.message);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (!options.config) throw new Error("Provide --config with a local evaluation configuration.");
  if (options.dryRun) { console.log(JSON.stringify({ dryRun: true, config: options.config, suite: options.suite || "full" })); return; }
  const result = await runComparison({
    configPath: options.config,
    datasetPath: options.dataset,
    suite: options.suite || "full",
    repetitions: Math.max(1, Number.parseInt(options.repetitions || "1", 10))
  });
  fs.mkdirSync(DEFAULT_OUTPUT_PATH, { recursive: true });
  fs.writeFileSync(path.join(DEFAULT_OUTPUT_PATH, "m11-live-report.json"), `${JSON.stringify(result, null, 2)}\n`, "utf8");
  printReport(result);
  process.exit(result.verdict.ok ? 0 : 1);
}

if (require.main === module) main().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });

module.exports = { summarizeVariant, variantDelta, aggregateComparisons, isCaseInconclusive, verdict, runComparison, CANDIDATE_FLAGS };
