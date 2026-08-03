#!/usr/bin/env node
/**
 * Local paired experiment runner and per-task-type rollout report for intent contracts.
 */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const experimentApi = require("../../resources/js/ai-companion/intent-experiment");

const DEFAULT_CONFIGURATIONS = Object.freeze([
  { id: "off", experiment: { ...experimentApi.ALL_OFF } },
  { id: "extraction", experiment: { intentExtraction: true, intentClarification: false, intentRevision: false, intentCompletionAssessment: false } },
  { id: "clarification", experiment: { intentExtraction: true, intentClarification: true, intentRevision: false, intentCompletionAssessment: false } },
  { id: "revision", experiment: { intentExtraction: true, intentClarification: false, intentRevision: true, intentCompletionAssessment: false } },
  { id: "completion", experiment: { intentExtraction: true, intentClarification: false, intentRevision: false, intentCompletionAssessment: true } },
  { id: "all-on", experiment: { ...experimentApi.ALL_ON } }
]);

const ROLLOUT_GATES = Object.freeze({
  falseMetRelativeReduction: 0.30,
  clarificationOverAskMaximum: 0.20,
  extraProviderCallsMaximum: 2,
  addedPromptTokensMaximumRatio: 0.25,
  latency: {
    answer: { medianMs: 2000, p95Ms: 5000 },
    diagnostic: { medianMs: 6000, p95Ms: 12000 },
    implementation: { medianMs: 6000, p95Ms: 12000 },
    planning: { medianMs: 6000, p95Ms: 12000 }
  }
});

function ratio(numerator, denominator) {
  return denominator > 0 ? numerator / denominator : null;
}

function percentile(values, percentileValue) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.min(sorted.length - 1, Math.ceil(percentileValue * sorted.length) - 1)];
}

function setMetrics(actual = [], expected = []) {
  const actualSet = new Set(actual.map(String));
  const expectedSet = new Set(expected.map(String));
  const intersection = [...actualSet].filter((value) => expectedSet.has(value)).length;
  return {
    precision: ratio(intersection, actualSet.size),
    recall: ratio(intersection, expectedSet.size)
  };
}

/** Summarize scored records without averaging different task types together. */
function summarizeByTaskType(records = []) {
  const groups = new Map();
  for (const record of records) {
    const key = String(record.taskType || "answer");
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(record);
  }
  return Object.fromEntries([...groups.entries()].map(([taskType, entries]) => {
    let falseMet = 0;
    let assessedMet = 0;
    let notUseful = 0;
    let clarificationRatings = 0;
    let usefulRevisions = 0;
    let scoredRevisions = 0;
    const localization = [];
    for (const entry of entries) {
      const judgments = entry.human?.criterionJudgments || {};
      for (const criterion of entry.assessment?.criteria || []) {
        if (criterion.status !== "met") continue;
        assessedMet += 1;
        if (judgments[criterion.id] === "unmet") falseMet += 1;
      }
      for (const rating of entry.human?.clarificationRatings || []) {
        clarificationRatings += 1;
        if (rating === "not-useful") notUseful += 1;
      }
      if (typeof entry.human?.revisionUseful === "boolean") {
        scoredRevisions += 1;
        if (entry.human.revisionUseful) usefulRevisions += 1;
      }
      localization.push(setMetrics(entry.actualFiles || [], entry.rubric?.expectedFiles || []));
    }
    const average = (key) => {
      const values = localization.map((item) => item[key]).filter((value) => value !== null);
      return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    };
    return [taskType, {
      runs: entries.length,
      taskSuccessRate: ratio(entries.filter((entry) => entry.human?.taskSuccess === true).length, entries.filter((entry) => typeof entry.human?.taskSuccess === "boolean").length),
      falseMetRate: ratio(falseMet, assessedMet),
      falseMetCount: falseMet,
      assessedMetCount: assessedMet,
      localizationPrecision: average("precision"),
      localizationRecall: average("recall"),
      clarificationOverAskRate: ratio(notUseful, clarificationRatings),
      revisionUsefulnessRate: ratio(usefulRevisions, scoredRevisions),
      medianLatencyMs: percentile(entries.map((entry) => Number(entry.durationMs) || 0), 0.5),
      p95LatencyMs: percentile(entries.map((entry) => Number(entry.durationMs) || 0), 0.95),
      meanProviderCalls: entries.reduce((sum, entry) => sum + (Number(entry.providerCalls) || 0), 0) / entries.length,
      meanPromptTokens: entries.reduce((sum, entry) => sum + (Number(entry.promptTokens) || 0), 0) / entries.length
    }];
  }));
}

function pairedCostDeltas(records, taskType, candidateConfiguration) {
  const scoped = records.filter((record) => String(record.taskType || "answer") === taskType);
  const baselines = new Map(scoped.filter((record) => record.configurationId === "off").map((record) => [`${record.caseId || ""}\u0000${record.repetition || 1}`, record]));
  return scoped.filter((record) => record.configurationId === candidateConfiguration).map((record) => {
    const baseline = baselines.get(`${record.caseId || ""}\u0000${record.repetition || 1}`);
    if (!baseline) return null;
    const baselineTokens = Number(baseline.promptTokens) || 0;
    return {
      addedCalls: (Number(record.providerCalls) || 0) - (Number(baseline.providerCalls) || 0),
      addedTokenRatio: baselineTokens > 0 ? ((Number(record.promptTokens) || 0) - baselineTokens) / baselineTokens : 0
    };
  }).filter(Boolean);
}

/** Compare an experiment arm to off, applying every rollout gate separately per task type. */
function evaluateRollout(records = [], candidateConfiguration = "all-on") {
  const off = summarizeByTaskType(records.filter((record) => record.configurationId === "off"));
  const candidate = summarizeByTaskType(records.filter((record) => record.configurationId === candidateConfiguration));
  const report = {};
  for (const taskType of new Set([...Object.keys(off), ...Object.keys(candidate)])) {
    const baseline = off[taskType] || {};
    const current = candidate[taskType] || {};
    const latencyGate = ROLLOUT_GATES.latency[taskType] || ROLLOUT_GATES.latency.diagnostic;
    const medianAdded = (current.medianLatencyMs || 0) - (baseline.medianLatencyMs || 0);
    const p95Added = (current.p95LatencyMs || 0) - (baseline.p95LatencyMs || 0);
    const falseMetReduction = baseline.falseMetRate > 0 && current.falseMetRate !== null
      ? (baseline.falseMetRate - current.falseMetRate) / baseline.falseMetRate
      : null;
    const addedCalls = (current.meanProviderCalls || 0) - (baseline.meanProviderCalls || 0);
    const addedTokenRatio = baseline.meanPromptTokens > 0 ? ((current.meanPromptTokens || 0) - baseline.meanPromptTokens) / baseline.meanPromptTokens : 0;
    const pairedCosts = pairedCostDeltas(records, taskType, candidateConfiguration);
    const maximumAddedCalls = pairedCosts.length ? Math.max(...pairedCosts.map((entry) => entry.addedCalls)) : addedCalls;
    const maximumAddedTokenRatio = pairedCosts.length ? Math.max(...pairedCosts.map((entry) => entry.addedTokenRatio)) : addedTokenRatio;
    const gates = {
      falseMetNoRegression: baseline.falseMetRate == null || current.falseMetRate == null || current.falseMetRate <= baseline.falseMetRate,
      falseMetTarget: falseMetReduction == null || falseMetReduction >= ROLLOUT_GATES.falseMetRelativeReduction,
      latency: medianAdded <= latencyGate.medianMs && p95Added <= latencyGate.p95Ms,
      clarificationOverAsk: current.clarificationOverAskRate == null || current.clarificationOverAskRate <= ROLLOUT_GATES.clarificationOverAskMaximum,
      providerCalls: maximumAddedCalls <= ROLLOUT_GATES.extraProviderCallsMaximum,
      promptTokens: maximumAddedTokenRatio <= ROLLOUT_GATES.addedPromptTokensMaximumRatio
    };
    report[taskType] = { baseline, candidate: current, deltas: { falseMetReduction, medianAdded, p95Added, addedCalls, addedTokenRatio, maximumAddedCalls, maximumAddedTokenRatio }, gates, pass: Object.values(gates).every(Boolean) };
  }
  return report;
}

/** Create configuration-blind scoring rows and a separate private lookup key. */
function createBlindScoringPacket(records = []) {
  const scoring = [];
  const key = [];
  records.forEach((record, index) => {
    const scoringId = `S${String(index + 1).padStart(5, "0")}`;
    scoring.push({ scoringId, caseId: record.caseId, taskType: record.taskType, prompt: record.prompt, response: record.response, rubric: record.rubric });
    key.push({ scoringId, configurationId: record.configurationId, repetition: record.repetition });
  });
  return { scoring, key };
}

function mergeBlindScores(records = [], scoringRows = [], keyRows = []) {
  const scoringById = new Map(scoringRows.map((row) => [String(row.scoringId || ""), row]));
  const scoreByRun = new Map();
  for (const key of keyRows) {
    const scored = scoringById.get(String(key.scoringId || ""));
    if (!scored || !scored.human || typeof scored.human !== "object") continue;
    scoreByRun.set(`${scored.caseId || ""}\u0000${key.configurationId || ""}\u0000${key.repetition || 1}`, scored.human);
  }
  return records.map((record) => {
    const human = scoreByRun.get(`${record.caseId || ""}\u0000${record.configurationId || ""}\u0000${record.repetition || 1}`);
    return human ? { ...record, human } : { ...record };
  });
}

function parseArguments(argv) {
  const values = {};
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) continue;
    values[value.slice(2)] = argv[index + 1] && !argv[index + 1].startsWith("--") ? argv[++index] : true;
  }
  return values;
}

async function runCli() {
  const args = parseArguments(process.argv.slice(2));
  const outputDir = path.resolve(args.output || path.join(__dirname, "results"));
  if (args.scores) {
    const records = JSON.parse(await fs.readFile(path.resolve(args.runs || path.join(outputDir, "runs.json")), "utf8"));
    const scoringRows = JSON.parse(await fs.readFile(path.resolve(args.scores), "utf8"));
    const keyRows = JSON.parse(await fs.readFile(path.resolve(args.key || path.join(outputDir, "scoring-key.json")), "utf8"));
    const scored = mergeBlindScores(records, scoringRows, keyRows);
    const report = evaluateRollout(scored, String(args.candidate || "all-on"));
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(path.join(outputDir, "scored-runs.json"), JSON.stringify(scored, null, 2));
    await fs.writeFile(path.join(outputDir, "rollout-report.json"), JSON.stringify(report, null, 2));
    process.stdout.write(`${JSON.stringify({ scoredRuns: scored.length, outputDir })}\n`);
    return;
  }
  if (!args.runner) throw new Error("Provide --runner with a module exporting runIntentEvalCase, or --scores with completed blind scoring rows.");
  const datasetPath = path.resolve(args.dataset || path.join(__dirname, "intent-eval-prompts.json"));
  const runner = require(path.resolve(args.runner));
  if (typeof runner.runIntentEvalCase !== "function") throw new Error("The runner must export runIntentEvalCase.");
  const dataset = JSON.parse(await fs.readFile(datasetPath, "utf8"));
  const repetitions = Math.max(1, Math.min(20, Number(args.repetitions) || 3));
  const records = [];
  for (const testCase of dataset.cases || []) {
    for (const configuration of DEFAULT_CONFIGURATIONS) {
      experimentApi.resolveIntentExperiment(configuration.experiment, true, { rejectInvalid: true });
      for (let repetition = 1; repetition <= repetitions; repetition += 1) {
        const result = await runner.runIntentEvalCase({ testCase, experiment: configuration.experiment, configurationId: configuration.id, repetition });
        records.push({ ...result, caseId: testCase.id, taskType: testCase.taskType, prompt: testCase.prompt, rubric: testCase.rubric, configurationId: configuration.id, repetition });
      }
    }
  }
  await fs.mkdir(outputDir, { recursive: true });
  await fs.writeFile(path.join(outputDir, "runs.json"), JSON.stringify(records, null, 2));
  const blind = createBlindScoringPacket(records);
  await fs.writeFile(path.join(outputDir, "blind-scoring.json"), JSON.stringify(blind.scoring, null, 2));
  await fs.writeFile(path.join(outputDir, "scoring-key.json"), JSON.stringify(blind.key, null, 2));
  process.stdout.write(`${JSON.stringify({ runs: records.length, outputDir })}\n`);
}

if (require.main === module) runCli().catch((error) => { process.stderr.write(`${error.stack || error}\n`); process.exitCode = 1; });

module.exports = { DEFAULT_CONFIGURATIONS, ROLLOUT_GATES, createBlindScoringPacket, evaluateRollout, mergeBlindScores, summarizeByTaskType };
