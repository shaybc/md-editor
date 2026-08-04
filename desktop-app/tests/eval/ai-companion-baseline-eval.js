/**
 * Local-only orchestration and reporting for the M0 AI Companion baseline.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { execFile } = require("node:child_process");
const { promisify } = require("node:util");

const {
  runEvaluationCase,
  sanitizeProviderMetadata,
  validateEvaluationConfig,
  validateEvaluationDataset
} = require("./ai-companion-mode-runner");

const execFileAsync = promisify(execFile);
const DEFAULT_DATASET_PATH = path.join(__dirname, "ai-companion-baseline-cases.json");
const DEFAULT_OUTPUT_PATH = path.join(__dirname, "results", "m0-baseline");

function parseArguments(values) {
  const parsed = {};
  for (let index = 0; index < values.length; index += 1) {
    const value = values[index];
    if (!value.startsWith("--")) continue;
    const key = value.slice(2);
    if (key === "dry-run") parsed.dryRun = true;
    else parsed[key] = values[index + 1], index += 1;
  }
  return parsed;
}

async function readJson(filePath) {
  return JSON.parse(await fs.readFile(path.resolve(filePath), "utf8"));
}

async function writeJson(filePath, value) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function readJsonLines(filePath) {
  const text = await fs.readFile(path.resolve(filePath), "utf8");
  return text.split(/\r?\n/).filter(Boolean).map((line) => JSON.parse(line));
}

async function appendJsonLine(filePath, value) {
  await fs.appendFile(filePath, `${JSON.stringify(value)}\n`, "utf8");
}

function selectCases(dataset, suite) {
  if (!suite || suite === "full") return dataset.cases;
  if (suite === "smoke") return dataset.cases.filter((testCase) => testCase.suite === "smoke");
  throw new Error("Evaluation suite must be smoke or full.");
}

/** Create provider-blind scoring rows plus a separate lookup key. */
function createBlindScoringPacket(records, idFactory = () => crypto.randomUUID()) {
  const paired = records.map((record) => {
    const scoringId = idFactory();
    return {
      scoring: {
        scoringId,
        caseId: record.caseId,
        turnId: record.turnId,
        mode: record.mode,
        category: record.category,
        prompt: record.prompt,
        response: record.response,
        error: record.error,
        rubric: record.rubric,
        deterministic: record.deterministic,
        human: {
          taskSuccess: null,
          answerCorrectness: null,
          planUsefulness: null,
          completionHonesty: null,
          criterionJudgments: {}
        }
      },
      key: { scoringId, runId: record.runId },
      order: crypto.randomBytes(8).toString("hex")
    };
  }).sort((left, right) => left.order.localeCompare(right.order));
  return { scoring: paired.map((entry) => entry.scoring), key: paired.map((entry) => entry.key) };
}

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function percentile(values, fraction) {
  const sorted = values.map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (!sorted.length) return 0;
  return sorted[Math.min(sorted.length - 1, Math.max(0, Math.ceil(sorted.length * fraction) - 1))];
}

function average(records, field) {
  return records.length ? records.reduce((sum, record) => sum + (Number(record[field]) || 0), 0) / records.length : 0;
}

function averageHumanScore(records, field) {
  const values = records.map((record) => record.human?.[field]).filter(Number.isFinite);
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
}

function isHumanScoringComplete(record) {
  if (typeof record.human?.taskSuccess !== "boolean") return false;
  if (record.mode === "chat") return Number.isFinite(record.human.answerCorrectness);
  if (record.mode === "plan") return Number.isFinite(record.human.planUsefulness);
  if (record.mode === "agent") return typeof record.human.completionHonesty === "boolean";
  return false;
}

function summarizeRecords(records) {
  const groups = new Map();
  for (const record of records) {
    const key = [record.provider.role, record.mode, record.category, record.controllerVariant || "legacy"].join("\u0000");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return [...groups.entries()].map(([key, entries]) => {
    const [providerRole, mode, category, controllerVariant] = key.split("\u0000");
    const scored = entries.filter((entry) => typeof entry.human?.taskSuccess === "boolean");
    const falseCompletions = entries.filter((entry) => entry.deterministic?.falseCompletion === true).length;
    return {
      providerRole,
      mode,
      category,
      controllerVariant,
      runs: entries.length,
      scoredRuns: scored.length,
      taskSuccessRate: ratio(scored.filter((entry) => entry.human.taskSuccess).length, scored.length),
      meanAnswerCorrectness: averageHumanScore(entries.filter((entry) => entry.mode === "chat"), "answerCorrectness"),
      meanPlanUsefulness: averageHumanScore(entries.filter((entry) => entry.mode === "plan"), "planUsefulness"),
      completionHonestyRate: ratio(entries.filter((entry) => entry.human?.completionHonesty === true).length, entries.filter((entry) => typeof entry.human?.completionHonesty === "boolean").length),
      falseCompletionRate: ratio(falseCompletions, entries.length),
      unnecessaryToolRate: ratio(entries.filter((entry) => entry.deterministic?.unnecessaryToolUse).length, entries.length),
      mutationViolationRate: ratio(entries.filter((entry) => entry.deterministic?.workspaceMutationViolation).length, entries.length),
      evidenceFailureRate: ratio(entries.filter((entry) => entry.deterministic?.evidenceFailure).length, entries.length),
      deterministicPassRate: ratio(entries.filter((entry) => entry.deterministic?.passed).length, entries.length),
      duplicateToolCalls: entries.reduce((sum, entry) => sum + (Number(entry.deterministic?.duplicateToolCalls) || 0), 0),
      medianLatencyMs: percentile(entries.map((entry) => entry.durationMs), 0.5),
      p95LatencyMs: percentile(entries.map((entry) => entry.durationMs), 0.95),
      meanProviderCalls: average(entries, "providerCalls"),
      p95ProviderCalls: percentile(entries.map((entry) => entry.providerCalls), 0.95),
      meanPromptTokens: average(entries, "promptTokens"),
      p95PromptTokens: percentile(entries.map((entry) => entry.promptTokens), 0.95),
      meanTotalTokens: average(entries, "totalTokens"),
      p95TotalTokens: percentile(entries.map((entry) => entry.totalTokens), 0.95),
      clarificationCount: entries.reduce((sum, entry) => sum + (entry.clarifications?.length || 0), 0),
      approvalCount: entries.reduce((sum, entry) => sum + (entry.approvals?.length || 0), 0),
      decisionProposed: entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.proposed || 0), 0),
      decisionAccepted: entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.accepted || 0), 0),
      decisionRejected: entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.rejected || 0), 0),
      decisionExecuted: entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.executed || 0), 0),
      decisionSuperseded: entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.superseded || 0), 0),
      repairRate: ratio(entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.repairs || 0), 0), entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.proposed || 0), 0)),
      staleDecisionRate: ratio(entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.staleDecisions || 0), 0), entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.proposed || 0), 0)),
      decisionMetadataRejectionRate: ratio(entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.metadataRejections || 0), 0), entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.proposed || 0), 0)),
      originalToolArgumentRejectionRate: ratio(entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.originalToolArgumentRejections || 0), 0), entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.decoratedToolProposals || 0), 0)),
      legacyToolArgumentValidity: ratio(entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.legacyValidToolDecisions || 0), 0), entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.legacyToolProposals || 0), 0)),
      decoratedToolArgumentValidity: ratio(entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.decoratedValidToolDecisions || 0), 0), entries.reduce((sum, entry) => sum + (entry.decisionMetrics?.decoratedToolProposals || 0), 0))
    };
  }).sort((left, right) => `${left.providerRole}:${left.mode}:${left.category}:${left.controllerVariant}`.localeCompare(`${right.providerRole}:${right.mode}:${right.category}:${right.controllerVariant}`));
}

function mergeBlindScores(records, scores, key) {
  const runByScoringId = new Map(key.map((entry) => [entry.scoringId, entry.runId]));
  const humanByRunId = new Map();
  for (const score of scores) {
    if (Object.hasOwn(score, "provider") || Object.hasOwn(score, "providerRole")) throw new Error("Blind scoring rows must not contain provider identity.");
    const runId = runByScoringId.get(score.scoringId);
    if (!runId) throw new Error(`Blind score has no matching private key: ${score.scoringId}`);
    humanByRunId.set(runId, score.human || {});
  }
  return records.map((record) => ({ ...record, human: humanByRunId.get(record.runId) || null }));
}

async function getRepositoryCommit() {
  try {
    const { stdout } = await execFileAsync("git", ["rev-parse", "HEAD"], { cwd: path.resolve(__dirname, "../../..") });
    return stdout.trim();
  } catch (_error) {
    return "";
  }
}

function createAggregateBaseline(records, datasetVersion, repositoryCommit) {
  const providers = [...new Map(records.map((record) => [record.provider.id, record.provider])).values()];
  const repetitions = Math.max(0, ...records.map((record) => Number(record.repetition) || 0));
  return {
    schemaVersion: 1,
    datasetVersion,
    status: records.some((record) => !isHumanScoringComplete(record)) ? "awaiting-human-scoring" : "complete",
    repositoryCommit,
    generatedAt: new Date().toISOString(),
    repetitions,
    providers,
    groups: summarizeRecords(records)
  };
}

function createMarkdownReport(aggregate) {
  const rows = aggregate.groups.map((group) => [
    group.providerRole,
    group.mode,
    group.category,
    group.controllerVariant,
    group.runs,
    group.taskSuccessRate == null ? "unscored" : `${(group.taskSuccessRate * 100).toFixed(1)}%`,
    `${(group.falseCompletionRate * 100).toFixed(1)}%`,
    `${(group.unnecessaryToolRate * 100).toFixed(1)}%`,
    `${(group.mutationViolationRate * 100).toFixed(1)}%`,
    group.medianLatencyMs,
    group.p95LatencyMs,
    group.meanProviderCalls.toFixed(2),
    group.meanTotalTokens.toFixed(0)
  ].join(" | "));
  return [
    "# AI Companion M0 Baseline",
    "",
    `Status: ${aggregate.status}`,
    "",
    "Provider | Mode | Category | Controller | Runs | Success | False completion | Unnecessary tools | Mutation violation | Median ms | P95 ms | Mean calls | Mean tokens",
    "--- | --- | --- | --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---:",
    ...rows,
    ""
  ].join("\n");
}

/** Run the opt-in target/reference baseline and create local raw/scoring artifacts. */
async function runBaseline(options) {
  if (!options.config) throw new Error("Provide --config with a local target/reference evaluation configuration.");
  const dataset = validateEvaluationDataset(await readJson(options.dataset || DEFAULT_DATASET_PATH));
  const configuration = validateEvaluationConfig(await readJson(options.config));
  const suite = options.suite || "full";
  const cases = selectCases(dataset, suite);
  const repetitions = Math.max(1, Number.parseInt(options.repetitions || "3", 10));
  if (options.dryRun) return {
    dryRun: true,
    datasetVersion: dataset.datasetVersion,
    cases: cases.length,
    repetitions,
    providers: configuration.providers.map(sanitizeProviderMetadata)
  };

  const outputDirectory = path.resolve(options.output || DEFAULT_OUTPUT_PATH);
  const runsPath = path.join(outputDirectory, "runs.jsonl");
  await fs.mkdir(outputDirectory, { recursive: true });
  await fs.writeFile(runsPath, "", "utf8");
  const records = [];
  for (const providerConfiguration of configuration.providers) {
    for (let repetition = 1; repetition <= repetitions; repetition += 1) {
      for (const testCase of cases) {
        const variants = testCase.mode === "agent" ? [false, true] : [false];
        for (const controllerEnabled of variants) {
          const caseRecords = await runEvaluationCase({ testCase, providerConfiguration, repetition, controllerEnabled });
          for (const record of caseRecords) {
            const identified = { ...record, datasetVersion: dataset.datasetVersion, runId: crypto.randomUUID() };
            records.push(identified);
            await appendJsonLine(runsPath, identified);
          }
        }
      }
    }
  }
  const blind = createBlindScoringPacket(records);
  await writeJson(path.join(outputDirectory, "blind-scoring.json"), blind.scoring);
  await writeJson(path.join(outputDirectory, "scoring-key.json"), blind.key);
  return { dryRun: false, outputDirectory, runs: records.length };
}

/** Merge completed blind scores and write local detailed plus sanitized aggregate reports. */
async function runReport(options) {
  if (!options.runs || !options.scores || !options.key) throw new Error("Provide --runs, --scores, and --key for report generation.");
  const records = await readJsonLines(options.runs);
  const scores = await readJson(options.scores);
  const key = await readJson(options.key);
  const scoredRecords = mergeBlindScores(records, scores, key);
  const outputDirectory = path.resolve(options.output || DEFAULT_OUTPUT_PATH);
  const aggregate = createAggregateBaseline(scoredRecords, Math.max(0, ...scoredRecords.map((record) => Number(record.datasetVersion) || 0)), await getRepositoryCommit());
  await writeJson(path.join(outputDirectory, "scored-runs.json"), scoredRecords);
  await writeJson(path.join(outputDirectory, "baseline-report.json"), aggregate);
  await fs.writeFile(path.join(outputDirectory, "baseline-report.md"), createMarkdownReport(aggregate), "utf8");
  return { outputDirectory, runs: scoredRecords.length, status: aggregate.status };
}

async function runCli() {
  const [command = "baseline", ...values] = process.argv.slice(2);
  if (!["baseline", "report"].includes(command)) throw new Error("Evaluation command must be baseline or report.");
  const options = parseArguments(values);
  const result = command === "report" ? await runReport(options) : await runBaseline(options);
  process.stdout.write(`${JSON.stringify(result)}\n`);
}

if (require.main === module) runCli().catch((error) => {
  process.stderr.write(`${error.stack || error}\n`);
  process.exitCode = 1;
});

module.exports = {
  createAggregateBaseline,
  createBlindScoringPacket,
  createMarkdownReport,
  mergeBlindScores,
  parseArguments,
  runBaseline,
  runReport,
  selectCases,
  summarizeRecords
};
