/** Assemble structural, semantic, and path findings into one command authorization verdict. */

"use strict";

const crypto = require("node:crypto");
const path = require("node:path");
const { classifyCommandEffect } = require("./command-effect-catalog");
const { inspectPathImpact } = require("./path-impact-inspector");
const { nestedShellCommand, resolveShellDialect } = require("./shell-dialect");
const { readShellStructure } = require("./shell-structure-reader");

const IMPACT_RANK = Object.freeze({ "read-only": 0, "workspace-write": 1, unknown: 2, "sensitive-read": 3, "external-impact": 4, destructive: 5 });
const MAX_RECURSION = 2;

class CommandImpactInspector {
  /** Inspect one command without executing it. */
  async inspect(input = {}) { return Object.freeze(inspectCommand(input, 0)); }
}

function inspectCommand(input, depth) {
  const command = String(input.command || "");
  const workspaceRoot = path.resolve(String(input.workspaceRoot || input.workingDirectory || "."));
  const workingDirectory = path.resolve(String(input.workingDirectory || workspaceRoot));
  const dialect = input.dialect || resolveShellDialect({ platform: input.platform, configuredShell: input.configuredShell });
  const structure = readShellStructure(command, dialect);
  const effects = structure.subcommands.map((subcommand) => classifyCommandEffect(subcommand));
  const nestedAnalyses = [];
  if (depth < MAX_RECURSION) {
    for (const subcommand of structure.subcommands) {
      const nested = nestedShellCommand(subcommand.argv);
      if (nested?.encoded) nestedAnalyses.push({ impact: "unknown", reasons: ["Encoded nested shell content cannot be inspected."], canAutoRun: false });
      else if (nested?.command) nestedAnalyses.push(inspectCommand({ ...input, command: nested.command, dialect: nested.dialect }, depth + 1));
    }
  }
  const paths = inspectPathImpact(structure, { workspaceRoot, workingDirectory });
  const reasons = [structure.reason, ...structure.dynamicReasons, ...effects.map((entry) => entry.reason), ...nestedAnalyses.flatMap((entry) => entry.reasons || []), ...paths.reasons].filter(Boolean);
  let impact = highestImpact([...effects.map((entry) => entry.impact), ...nestedAnalyses.map((entry) => entry.impact)]);
  if (!structure.parseable || structure.hasDynamicSyntax || paths.unknownPath) impact = highestImpact([impact, "unknown"]);
  if (paths.sensitiveBoundary) impact = highestImpact([impact, "sensitive-read"]);
  if (paths.destructiveBoundary) impact = "destructive";
  if ((structure.redirections || []).some((entry) => entry.writesFile)) impact = highestImpact([impact, "workspace-write"]);
  const canAutoRun = structure.parseable && !structure.hasDynamicSyntax && impact === "read-only" && paths.affectedPaths.every((entry) => !entry.outsideWorkspace && !entry.protected) && nestedAnalyses.every((entry) => entry.canAutoRun);
  const normalizedCommand = normalizeCommand(command);
  const analysis = {
    version: 1,
    dialect,
    commandDigest: digest(normalizedCommand),
    normalizedCommand,
    preview: redactCommand(command).slice(0, 4000),
    subcommands: structure.subcommands.map((entry, index) => ({ executable: String(entry.argv[0] || ""), arguments: entry.argv.slice(1, 40), precedingOperator: entry.precedingOperator, redirections: entry.redirections, impact: effects[index]?.impact || "unknown" })),
    operators: structure.operators.slice(0, 50),
    redirections: structure.redirections.slice(0, 50),
    affectedPaths: paths.affectedPaths,
    externalTargets: effects.map((entry) => entry.externalTarget).filter(Boolean).slice(0, 12),
    impact,
    confidence: canAutoRun ? "high" : (structure.parseable ? "medium" : "low"),
    reversibility: impact === "read-only" ? "no-change" : (impact === "workspace-write" ? "likely-reversible" : "not-assumed"),
    authorization: canAutoRun ? "automatic-eligible" : "confirmation-required",
    reasons: Array.from(new Set(reasons)).slice(0, 24).map((reason) => String(reason).slice(0, 300)),
    canAutoRun,
    grantBoundary: commandGrantBoundary(structure, effects, normalizedCommand),
    parseable: structure.parseable
  };
  analysis.analysisDigest = digest(JSON.stringify({
    dialect: analysis.dialect,
    commandDigest: analysis.commandDigest,
    subcommands: analysis.subcommands,
    affectedPaths: analysis.affectedPaths,
    impact: analysis.impact,
    reasons: analysis.reasons
  }));
  return analysis;
}

function commandGrantBoundary(structure, effects, normalizedCommand) {
  const exact = { type: "command-exact", value: normalizedCommand };
  if (structure.subcommands.length !== 1 || structure.operators.length || structure.redirections.length || structure.hasDynamicSyntax) return { exact };
  const command = structure.subcommands[0];
  if (effects[0]?.impact !== "read-only") return { exact };
  const prefixParts = command.argv.slice(0, command.argv[1] && !String(command.argv[1]).startsWith("-") ? 2 : 1);
  return { exact, prefix: { type: "command-prefix", value: prefixParts.join(" ") } };
}

function highestImpact(impacts) { return impacts.reduce((current, candidate) => (IMPACT_RANK[candidate] ?? 2) > (IMPACT_RANK[current] ?? -1) ? candidate : current, "read-only"); }
function normalizeCommand(command) { return String(command || "").replace(/\r\n/g, "\n").trim(); }
function digest(command) { return crypto.createHash("sha256").update(String(command || "")).digest("hex"); }
function redactCommand(command) {
  return String(command || "")
    .replace(/((?:password|passwd|token|secret|api[_-]?key|authorization)\s*(?:=|:)\s*)([^\s"']+|"[^"]*"|'[^']*')/gi, "$1[redacted]")
    .replace(/(https?:\/\/)[^\s/@:]+:[^\s/@]+@/gi, "$1[redacted]@");
}

module.exports = { CommandImpactInspector, digestCommand: digest, normalizeCommand, redactCommand };
