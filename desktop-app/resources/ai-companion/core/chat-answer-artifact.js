/**
 * Chat answer artifact + answer/artifact consistency (M9.4).
 *
 * The chat controller's deliverable is a typed answer artifact whose claims are
 * traceable to evidence. This module builds/normalizes the artifact and reconciles
 * the rendered `answerMarkdown` against the declared `claims`, so the model cannot
 * omit an inconvenient statement from `claims` to dodge evidence checks.
 *
 * Pure module: no IO, no provider calls, no side effects.
 */

"use strict";

const { classifyAnswerText, CLAIM_LEVELS } = require("./chat-claim-classifier");

const CLAIM_KINDS = Object.freeze(["workspace-fact", "general-knowledge", "assumption"]);

function str(value) { return typeof value === "string" ? value : String(value == null ? "" : value); }
function arr(value) { return Array.isArray(value) ? value : []; }

/**
 * Normalize a loose model artifact into the schema-versioned answer artifact.
 */
function createAnswerArtifact(input = {}) {
  return {
    schemaVersion: 1,
    answerMarkdown: str(input.answerMarkdown || input.answer || ""),
    claims: arr(input.claims).map((claim, index) => ({
      id: str(claim && claim.id) || `C${index + 1}`,
      statement: str(claim && claim.statement),
      kind: CLAIM_KINDS.includes(claim && claim.kind) ? claim.kind : "general-knowledge",
      evidenceRefs: arr(claim && claim.evidenceRefs).map(str).filter(Boolean)
    })),
    citations: arr(input.citations).map((c, index) => ({
      id: str(c && c.id) || `cite${index + 1}`,
      label: str(c && c.label),
      ref: str(c && c.ref)
    })),
    assumptions: arr(input.assumptions).map((a, index) => ({ id: str(a && a.id) || `A${index + 1}`, statement: str(a && a.statement) })),
    unresolvedQuestions: arr(input.unresolvedQuestions).map((q, index) => ({ id: str(q && q.id) || `Q${index + 1}`, question: str(q && q.question), blocking: q && q.blocking === true })),
    followUps: arr(input.followUps).map(str).filter(Boolean)
  };
}

/** Split answer prose into candidate factual statements. */
function splitStatements(markdown) {
  return str(markdown)
    .replace(/```[\s\S]*?```/g, " ")            // drop fenced code
    .split(/(?<=[.!?])\s+|\n+/)
    .map((s) => s.replace(/^[\s>*\-#\d.)]+/, "").trim())
    .filter((s) => s.length >= 12);
}

function normalize(text) { return str(text).toLowerCase().replace(/[`*_]/g, "").replace(/\s+/g, " ").trim(); }

function overlaps(statement, claimStatement) {
  const a = normalize(statement);
  const b = normalize(claimStatement);
  if (!a || !b) return false;
  if (a.includes(b) || b.includes(a)) return true;
  // token overlap fallback
  const at = new Set(a.split(" ").filter((w) => w.length > 3));
  const bt = b.split(" ").filter((w) => w.length > 3);
  if (!bt.length) return false;
  const hits = bt.filter((w) => at.has(w)).length;
  return hits / bt.length >= 0.6;
}

/**
 * Reconcile the rendered answer against the declared claims.
 *
 * @param {object} artifact - Normalized answer artifact.
 * @param {object} [context] - Optional classifier context (namedTargets).
 * @returns {{ consistent: boolean, issues: object[] }}
 *   Issues include material prose statements missing a claim, workspace-fact claims
 *   without evidence, and citations that do not resolve.
 */
function reconcileArtifact(artifact, context = {}) {
  const issues = [];
  const claims = arr(artifact && artifact.claims);
  const citationIds = new Set(arr(artifact && artifact.citations).map((c) => c.id));

  // 1) Every material (workspace/ambiguous) prose statement must be represented by a claim.
  for (const statement of splitStatements(artifact && artifact.answerMarkdown)) {
    const scan = classifyAnswerText(statement, context);
    if (scan.level === CLAIM_LEVELS.GENERIC) continue;
    const represented = claims.some((claim) => overlaps(statement, claim.statement));
    if (!represented) {
      issues.push({ type: "unclassified-statement", statement, level: scan.level });
    }
  }

  // 2) Workspace-fact claims must carry evidence.
  for (const claim of claims) {
    if (claim.kind === "workspace-fact" && claim.evidenceRefs.length === 0) {
      issues.push({ type: "workspace-claim-without-evidence", claimId: claim.id, statement: claim.statement });
    }
    // 3) Cited evidence refs that look like citation ids must resolve.
    for (const ref of claim.evidenceRefs) {
      if (/^cite/i.test(ref) && !citationIds.has(ref)) {
        issues.push({ type: "unresolved-citation", claimId: claim.id, ref });
      }
    }
  }

  return { consistent: issues.length === 0, issues };
}

module.exports = {
  CLAIM_KINDS,
  createAnswerArtifact,
  splitStatements,
  reconcileArtifact
};
