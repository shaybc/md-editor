/** Produce bounded approval and audit views from internal command analysis. */

"use strict";

/** Create model/UI-safe metadata without the unredacted command. */
function publicCommandImpact(analysis = {}) {
  return {
    version: analysis.version,
    dialect: analysis.dialect,
    commandDigest: analysis.commandDigest,
    analysisDigest: analysis.analysisDigest,
    preview: analysis.preview,
    impact: analysis.impact,
    confidence: analysis.confidence,
    reversibility: analysis.reversibility,
    authorization: analysis.authorization,
    canAutoRun: analysis.canAutoRun === true,
    reasons: (analysis.reasons || []).slice(0, 12),
    subcommands: (analysis.subcommands || []).slice(0, 20),
    operators: (analysis.operators || []).slice(0, 20),
    redirections: (analysis.redirections || []).slice(0, 20),
    affectedPaths: (analysis.affectedPaths || []).slice(0, 20).map((entry) => ({ path: entry.path, relativePath: entry.relativePath, access: entry.access, outsideWorkspace: entry.outsideWorkspace, protected: entry.protected })),
    externalTargets: (analysis.externalTargets || []).slice(0, 12)
  };
}

/** Build the existing approval-card contract for a command request. */
function commandApprovalAnalysis(analysis = {}, taskGoal = "") {
  const publicImpact = publicCommandImpact(analysis);
  return {
    operation: "command",
    operationLabel: `${String(analysis.impact || "unknown").replace(/-/g, " ")} command`,
    resourcePath: analysis.preview || "run command",
    taskGoal: String(taskGoal || "").trim(),
    actionDescription: `Run a ${analysis.dialect || "system"} shell command classified as ${analysis.impact || "unknown"}.`,
    outcomeDescription: summarizeOutcome(publicImpact),
    limitations: analysis.canAutoRun ? [] : (analysis.reasons || []).slice(0, 3),
    canApprove: true,
    blockingCode: ""
  };
}

function summarizeOutcome(impact) {
  const paths = impact.affectedPaths?.length ? ` Affected paths: ${impact.affectedPaths.map((entry) => entry.relativePath || entry.path).slice(0, 4).join(", ")}.` : "";
  const commands = impact.subcommands?.length ? ` ${impact.subcommands.length} parsed operation${impact.subcommands.length === 1 ? "" : "s"}.` : "";
  return `${String(impact.impact || "unknown").replace(/-/g, " ")} impact.${commands}${paths}`;
}

module.exports = { commandApprovalAnalysis, publicCommandImpact };
