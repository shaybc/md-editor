/**
 * Isolated acceptance-criteria assessment and deterministic final rendering.
 */

"use strict";

const { isEvidenceAdmissible, CANDIDATE_EVIDENCE_ID } = require("./completion-evidence-ledger");
const { arbitrateAssessment } = require("./completion-arbiter");
const correctionConsistency = require("./intent-correction-consistency");
const { deriveCriterionClaimType, hasChangeAction } = require("./intent-claim-type");
const {
  getCriterionEvidenceFamilies,
  getCriterionFileTargets,
  isToolInEvidenceFamily
} = require("./agent-tool-effect-registry");

const ASSESS_ACCEPTANCE_CRITERIA_TOOL = Object.freeze({
  type: "function",
  function: {
    name: "assess_acceptance_criteria",
    description: "Assess every stored acceptance criterion against the exact normalized candidate and supplied evidence ledger.",
    parameters: {
      type: "object",
      additionalProperties: false,
      required: ["overallStatus", "criteria", "unmetSummary"],
      properties: {
        overallStatus: { type: "string", enum: ["complete", "incomplete"] },
        criteria: {
          type: "array",
          items: {
            type: "object",
            additionalProperties: false,
            required: ["id", "status", "evidenceIds", "evidenceQuote", "explanation", "claimType"],
            properties: {
              id: { type: "string" },
              status: { type: "string", enum: ["met", "unmet"] },
              evidenceIds: { type: "array", items: { type: "string" } },
              evidenceQuote: { type: "string", description: "For a met criterion: the verbatim span copied from the cited evidence (a tool-result summary, or the candidate for response-content) that establishes the outcome. Empty for unmet. A tool merely succeeding is NOT a quote." },
              explanation: { type: "string" },
              claimType: { type: "string", enum: ["response-content", "workspace-state", "mixed"] }
            }
          }
        },
        unmetSummary: { type: "string" }
      }
    }
  }
});

function boundedText(value, maximum = 1000) {
  const text = String(value || "").trim();
  return text.length > maximum ? `${text.slice(0, maximum)}...[truncated]` : text;
}

function parseAssessmentCall(message) {
  const calls = Array.isArray(message?.toolCalls) ? message.toolCalls : [];
  const matching = calls.filter((call) => (call.function?.name || call.name) === "assess_acceptance_criteria");
  if (matching.length !== 1) return { error: "missing-forced-assessment-call" };
  try {
    const raw = matching[0].function?.arguments ?? matching[0].arguments ?? "{}";
    return { value: typeof raw === "object" ? raw : JSON.parse(String(raw)) };
  } catch (_error) {
    return { error: "malformed-assessment-arguments" };
  }
}

function validateRawAssessment(raw, contract, evidenceLedger, candidate = "") {
  const errors = [];
  const criteria = Array.isArray(contract?.acceptanceCriteria) ? contract.acceptanceCriteria : [];
  const expectedIds = criteria.map((criterion) => criterion.id);
  const evidenceIds = new Set((evidenceLedger || []).map((entry) => entry.id));
  const evidenceById = new Map((evidenceLedger || []).map((entry) => [entry.id, entry]));
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return { valid: false, errors: ["invalid-assessment-shape"] };
  if (!["complete", "incomplete"].includes(raw.overallStatus)) errors.push("invalid-overall-status");
  if (!Array.isArray(raw.criteria)) errors.push("invalid-criteria");
  else {
    const actualIds = raw.criteria.map((criterion) => String(criterion?.id || ""));
    if (new Set(actualIds).size !== actualIds.length) errors.push("duplicate-criterion-id");
    if (expectedIds.some((id) => !actualIds.includes(id))) errors.push("missing-criterion");
    if (actualIds.some((id) => !expectedIds.includes(id))) errors.push("unexpected-criterion");
    for (const criterion of raw.criteria) {
      if (!criterion || !["met", "unmet"].includes(criterion.status)) errors.push("invalid-criterion-status");
      if (!criterion || !["response-content", "workspace-state", "mixed"].includes(criterion.claimType)) errors.push("invalid-claim-type");
      if (!Array.isArray(criterion?.evidenceIds)) errors.push("invalid-evidence-ids");
      else if (criterion.evidenceIds.some((id) => !evidenceIds.has(id))) errors.push("unknown-evidence-id");
      else if (criterion.status === "met" && criterion.evidenceIds.some((id) =>
        (evidenceById.get(id)?.referenceChecks || []).some((check) => check?.supersededFound === true)
      )) errors.push("superseded-reference-evidence");
      if (typeof criterion?.explanation !== "string") errors.push("invalid-explanation");
    }
  }
  if (correctionConsistency.findSupersededReferencesInText(candidate, contract).length) errors.push("candidate-contains-superseded-reference");
  if (typeof raw.unmetSummary !== "string") errors.push("invalid-unmet-summary");
  return { valid: errors.length === 0, errors: [...new Set(errors)] };
}

function normalizeEvidencePath(value) {
  return String(value || "").replace(/\\/g, "/").replace(/^\.\//, "").replace(/^\/+/, "").toLowerCase().trim();
}

// Remove path-like tokens so verb detection (hasChangeAction) is not fooled by a change verb
// buried inside a file path, e.g. "md-editor" matching "edit" or a "/update/" folder segment.
function stripPathTokens(text) {
  return String(text || "")
    .replace(/[a-zA-Z]:[\\/][^\s]*/g, " ")
    .replace(/[^\s]*[\\/][^\s]*/g, " ");
}

function entryMatchesFileTargets(entry, targets) {
  if (!targets.length) return true;
  const files = (entry?.files || []).map(normalizeEvidencePath).filter(Boolean);
  return targets.every((targetValue) => {
    const target = normalizeEvidencePath(targetValue);
    return files.some((file) => file === target
      || (!target.includes("/") && file.split("/").at(-1) === target)
      // Absolute vs relative: match when one path is a segment-aligned suffix of the other
      // (e.g. C:/repo/desktop-app/x.md vs desktop-app/x.md), so an absolute criterion target
      // and a relative evidence path resolve to the same file.
      || target.endsWith(`/${file}`) || file.endsWith(`/${target}`));
  });
}

/** Require succeeded tool evidence from every family implied by the criterion. */
function evidenceEstablishesOutcome(criterion, contract, entries) {
  const succeededTools = entries.filter((entry) => entry?.source === "tool" && entry?.outcome === "succeeded");
  if (!succeededTools.length) return false;
  const families = getCriterionEvidenceFamilies(criterion, contract);
  if (!families.length) return true;
  const fileTargets = getCriterionFileTargets(criterion, contract);
  return families.every((family) => succeededTools.some((entry) =>
    isToolInEvidenceFamily(entry.tool, family)
      && (!["file-read", "file-write"].includes(family) || entryMatchesFileTargets(entry, fileTargets))
  ));
}

/** Criterion shapes whose "met" requires a prior finding/comparison to hold (coherence). */
const DEPENDENT_SHAPES = new Set(["conditional-action"]);
/** Criterion shapes that establish the finding a dependent action relies on. */
const FINDING_SHAPES = new Set(["diagnostic-finding", "conformance-inspection", "conformance-comparison"]);

/** Criterion shapes whose requirement is satisfied by an inspection/read having happened. */
const INSPECTION_SHAPES = new Set(["conformance-inspection", "diagnostic-finding"]);
/** Tool names that constitute an actual inspection/read action (used by the fallback). */
const INSPECTION_TOOL_PATTERN = /read|git_status|git_diff|git_branches|git_changes_digest|git_pr_notes|search|glob|list|inspect|open_tabs/i;

/**
 * Narrow the evidence a single criterion is allowed to cite. Returns admissible tool entries
 * whose family (and file target) match the criterion. The candidate response is offered ONLY
 * to response-content and mixed claims, so a workspace/conformance criterion has no
 * "cite the candidate" escape hatch. Falls back to all admissible tool entries when nothing
 * family-matches, so the model is never starved of evidence.
 */
function selectRelevantEvidence(criterion, contract, evidenceLedger) {
  const admissible = (evidenceLedger || []).filter((entry) => isEvidenceAdmissible(entry));
  const claimType = deriveCriterionClaimType(criterion, contract);
  const toolEntries = admissible.filter((entry) => entry.source === "tool");
  const candidateEntries = admissible.filter((entry) => entry.id === CANDIDATE_EVIDENCE_ID);
  const families = getCriterionEvidenceFamilies(criterion, contract);
  const fileTargets = getCriterionFileTargets(criterion, contract);
  let matched = toolEntries.filter((entry) => families.some((family) =>
    isToolInEvidenceFamily(entry.tool, family)
      && (!["file-read", "file-write"].includes(family) || entryMatchesFileTargets(entry, fileTargets))));
  if (!matched.length) matched = toolEntries; // never starve the model of evidence
  if (claimType === "response-content") return candidateEntries;
  if (claimType === "mixed") return matched.concat(candidateEntries);
  return matched; // workspace-state: tool evidence only, no candidate escape hatch
}

/** Derive the base per-criterion verdicts (content-grounded) from one raw model assessment. */
function deriveVerdicts(raw, contract, evidenceLedger) {
  const ledgerById = new Map((evidenceLedger || []).map((entry) => [entry.id, entry]));
  const rawById = new Map((raw.criteria || []).map((criterion) => [criterion.id, criterion]));
  return contract.acceptanceCriteria.map((criterion) => {
    const assessed = rawById.get(criterion.id) || { evidenceIds: [], status: "unmet", explanation: "", evidenceQuote: "", claimType: "" };
    const evidenceIds = [...new Set(assessed.evidenceIds || [])].filter((id) => isEvidenceAdmissible(ledgerById.get(id)));
    const admissibleEntries = evidenceIds.map((id) => ledgerById.get(id));
    const harnessClaimType = deriveCriterionClaimType(criterion, contract);
    const sourceRequirementMet = harnessClaimType === "response-content"
      ? true
      : evidenceEstablishesOutcome(criterion, contract, admissibleEntries);
    // Content grounding: a met verdict must cite a verbatim span from the evidence. A tool
    // merely succeeding (an evidence id with no quoted content) can never establish "met".
    const evidenceQuote = boundedText(assessed.evidenceQuote, 400);
    const hasQuote = evidenceQuote.length > 0;
    const status = assessed.status === "met" && evidenceIds.length > 0 && sourceRequirementMet && hasQuote
      ? "met"
      : "unmet";
    return {
      id: criterion.id,
      shape: criterion.shape || "",
      status,
      evidenceIds,
      evidenceQuote: status === "met" ? evidenceQuote : "",
      explanation: boundedText(assessed.explanation),
      claimType: harnessClaimType,
      harnessClaimType,
      modelClaimType: assessed.claimType
    };
  });
}

/**
 * Apply the harness-owned post-processing shared by single-call and per-criterion modes:
 * the deterministic inspection fallback (upgrade), cross-criterion coherence (downgrade),
 * and the overall status. Operates on an already-derived criteria array so it can run once
 * over the merged verdicts regardless of how many model calls produced them.
 */
function finalizeAssessment(criteria, contract, evidenceLedger, unmetSummary) {
  const criterionById = new Map(contract.acceptanceCriteria.map((criterion) => [criterion.id, criterion]));
  // Deterministic fallback: for a PURE inspection/read criterion the model failed to
  // establish, "inspection happened" is a plumbing fact the harness can confirm itself -- but
  // ONLY when (a) the criterion asserts inspection, not a change ("fixed"/"updated" is not
  // established by reading), and (b) the criterion implies a specific evidence family that is
  // actually covered by a succeeded, target-matching inspection tool (not merely any
  // inspection tool anywhere, e.g. an unrelated discovery-seed read).
  const admissibleTools = (evidenceLedger || []).filter((entry) => entry && entry.source === "tool" && isEvidenceAdmissible(entry));
  for (const verdict of criteria) {
    if (verdict.status === "met" || !INSPECTION_SHAPES.has(verdict.shape)) continue;
    const criterion = criterionById.get(verdict.id);
    const statement = String((criterion && (criterion.statement || criterion.description)) || "");
    if (hasChangeAction(stripPathTokens(statement))) continue; // a change claim is not satisfiable by inspection
    if (!getCriterionEvidenceFamilies(criterion, contract).length) continue; // no specific target to confirm
    if (!evidenceEstablishesOutcome(criterion, contract, admissibleTools)) continue; // family/target not covered
    const inspectionEvidence = selectRelevantEvidence(criterion, contract, evidenceLedger)
      .filter((entry) => entry.source === "tool" && INSPECTION_TOOL_PATTERN.test(entry.tool));
    if (inspectionEvidence.length) {
      verdict.status = "met";
      verdict.evidenceIds = inspectionEvidence.map((entry) => entry.id);
      verdict.evidenceQuote = boundedText(inspectionEvidence[0].summary || `${inspectionEvidence[0].tool} inspected the target`, 200);
      verdict.deterministicFallback = true;
    }
  }
  // Conditional-action "no update warranted": a no-op on the target (the tool determined the
  // content already matched) satisfies a conditional-action criterion -- no action was
  // warranted. Runs BEFORE coherence, so it is still downgraded if the finding it depends on
  // is unmet (you cannot claim "no update needed" without a verified comparison).
  for (const verdict of criteria) {
    if (verdict.status === "met" || verdict.shape !== "conditional-action") continue;
    const criterion = criterionById.get(verdict.id);
    const fileTargets = getCriterionFileTargets(criterion, contract);
    const noOp = (evidenceLedger || []).find((entry) => entry && entry.source === "tool" && entry.outcome === "no-op"
      && (!fileTargets.length || entryMatchesFileTargets(entry, fileTargets)));
    if (noOp) {
      verdict.status = "met";
      verdict.evidenceIds = [noOp.id];
      verdict.evidenceQuote = "No update was warranted: the target already matches the intended content.";
      verdict.noActionWarranted = true;
    }
  }
  // Cross-criterion coherence: a dependent action (e.g. "update X if warranted") cannot be
  // met while any finding/comparison it depends on is unmet. Downgrade such contradictions.
  const anyFindingUnmet = criteria.some((criterion) =>
    FINDING_SHAPES.has(criterion.shape) && criterion.status !== "met");
  if (anyFindingUnmet) {
    for (const criterion of criteria) {
      if (DEPENDENT_SHAPES.has(criterion.shape) && criterion.status === "met") {
        criterion.status = "unmet";
        criterion.evidenceQuote = "";
        criterion.incoherenceDowngrade = true;
      }
    }
  }
  const incomplete = criteria.some((criterion) => criterion.status !== "met");
  const verifiability = String(contract?.verifiability || "verified");
  const assessment = {
    overallStatus: incomplete ? "incomplete" : (verifiability === "provisional" ? "provisional" : "complete"),
    criteria,
    unmetSummary: incomplete
      ? (boundedText(unmetSummary) || "One or more acceptance criteria could not be verified.")
      : ""
  };
  // Four-way arbiter: classify each unmet criterion and attach routing guidance.
  return arbitrateAssessment(assessment, contract, evidenceLedger);
}

function normalizeAssessment(raw, contract, evidenceLedger) {
  return finalizeAssessment(deriveVerdicts(raw, contract, evidenceLedger), contract, evidenceLedger, raw.unmetSummary);
}

/** Build the harness-owned result used when no falsifiable contract was established. */
function createUnverifiedAssessment(contract) {
  return {
    overallStatus: "unverified",
    criteria: (contract?.acceptanceCriteria || []).map((criterion) => {
      const harnessClaimType = deriveCriterionClaimType(criterion, contract);
      return {
        id: criterion.id,
        status: "unverified",
        evidenceIds: [],
        explanation: "No verifiable acceptance criterion was established for this request.",
        claimType: harnessClaimType,
        harnessClaimType,
        modelClaimType: ""
      };
    }),
    unmetSummary: ""
  };
}

function createFallbackAssessment(contract, warning) {
  return {
    overallStatus: "incomplete",
    criteria: (contract.acceptanceCriteria || []).map((criterion) => {
      const harnessClaimType = deriveCriterionClaimType(criterion, contract);
      return {
        id: criterion.id,
        status: "unmet",
        evidenceIds: [],
        explanation: "The completion assessment could not be validated.",
        claimType: harnessClaimType,
        harnessClaimType,
        modelClaimType: ""
      };
    }),
    unmetSummary: "The task could not be verified because the completion assessment failed.",
    warning
  };
}

function createAssessmentMessages(prompts, contract, candidate, evidenceLedger, repairErrors = []) {
  const configuredSystem = String(prompts?.completionAssessmentSystem || "").trim()
    || [
      "You are the isolated completion-assessment stage.",
      "Assess every acceptance criterion exactly once against the exact candidate and evidence ledger.",
      "Failed, denied, not-executed, unknown, or omitted evidence establishes nothing.",
      "Candidate-response evidence may support only response-content claims such as an explanation or plan.",
      "Workspace-state and mixed claims require at least one semantically relevant tool evidence entry.",
      "Truncated reads or searches cannot establish full completeness or absence; judge semantic relevance conservatively.",
      "Applied intent corrections are authoritative. Pre-amendment, denied, or superseded-reference evidence cannot establish a corrected outcome.",
      "A successful edit proves only that a file changed; a corrected link or resource claim requires post-state evidence containing the replacement and no superseded reference.",
      "Call assess_acceptance_criteria exactly once and do not answer the user."
    ].join(" ");
  const system = [
    configuredSystem,
    "Harness evidence rule: a location-specific criterion is met only by evidence from that exact requested location.",
    "A successful action proves only the file, guide, page, section, panel, or UI area identified by its evidence; never treat a different location as equivalent.",
    "Opening a file directly proves only that it was opened, not that it was reached through a requested guide, page, link, or navigation path.",
    "When named targets identify a location, cite evidence matching that target or mark the criterion unmet.",
    "Content rule: for every criterion you mark met, copy into evidenceQuote the exact verbatim span from the cited evidence summary (or from the candidate for a response-content claim) that establishes the outcome. A tool that merely succeeded is not a quote. If you cannot supply such a span, the criterion is unmet.",
    "Independence rule: you did not do the work. Do not accept the candidate response's own assertion that something was done, compared, or updated as proof; a claim is not evidence.",
    "Conditional-action rule: a criterion of the form 'do X if warranted' is met only when the evidence shows EITHER that no action was warranted (an evidenced finding) OR that the action was actually performed. If the finding it depends on is unverified, the conditional action is unmet.",
    "Scoped-evidence rule: each acceptance criterion carries its own relevantEvidence list and a harness-assigned claimType. For that criterion, cite evidenceIds ONLY from its relevantEvidence list and quote from the cited entry's summary. A workspace-state criterion's list contains only tool evidence -- the candidate response is deliberately excluded and is not admissible for it."
  ].join(" ");
  // Per-criterion evidence narrowing: hand each criterion only the evidence it may cite, so
  // a weak model cannot fall back to citing the candidate for a workspace claim, and is not
  // forced to reason over the full evidence ledger for every criterion at once.
  const acceptanceCriteria = contract.acceptanceCriteria.map((criterion) => ({
    id: criterion.id,
    shape: criterion.shape || "",
    statement: criterion.statement || criterion.description || "",
    sourceSpan: criterion.sourceSpan || "",
    claimType: deriveCriterionClaimType(criterion, contract),
    relevantEvidence: selectRelevantEvidence(criterion, contract, evidenceLedger).map((entry) => ({
      id: entry.id,
      source: entry.source,
      tool: entry.tool || "",
      outcome: entry.outcome,
      summary: entry.summary || ""
    }))
  }));
  const payload = {
    contract: {
      taskType: contract.taskType,
      goal: contract.goal,
      expectedOutcome: contract.expectedOutcome,
      requestedActions: contract.requestedActions,
      acceptanceCriteria,
      namedTargets: contract.namedTargets,
      verifiability: contract.verifiability,
      activeCorrections: correctionConsistency.listActiveReferenceReplacements(contract)
    },
    candidate
  };
  const repair = repairErrors.length
    ? `The prior assessment was invalid: ${repairErrors.join(", ")}. Return a complete replacement assessment.`
    : "";
  return [
    { role: "system", content: system },
    { role: "user", content: [JSON.stringify(payload), repair].filter(Boolean).join("\n\n") }
  ];
}

async function requestAssessment(provider, params, repairErrors = []) {
  const message = await provider.completeMessage(
    createAssessmentMessages(params.prompts, params.contract, params.candidate, params.evidenceLedger, repairErrors),
    {
      temperature: 0,
      maxTokens: Math.max(800, Math.min(4000, Number(params.settings?.intentMaxOutputTokens) || 1200)),
      signal: params.signal,
      tools: [ASSESS_ACCEPTANCE_CRITERIA_TOOL],
      toolChoice: { type: "function", function: { name: "assess_acceptance_criteria" } },
      onUsage: params.onUsage,
      onDebug: params.onDebug
    }
  );
  const parsed = parseAssessmentCall(message);
  if (parsed.error) return { valid: false, errors: [parsed.error] };
  const validation = validateRawAssessment(parsed.value, params.contract, params.evidenceLedger, params.candidate);
  return validation.valid
    ? { valid: true, assessment: normalizeAssessment(parsed.value, params.contract, params.evidenceLedger) }
    : { valid: false, errors: validation.errors };
}

/**
 * Assess each criterion in its own model call. Every call sees only one criterion and that
 * criterion's narrowed evidence, minimizing the choices a weaker model must make. The base
 * verdicts are merged and the shared post-processing (fallback + coherence) runs once.
 */
async function assessPerCriterion(params) {
  const criteria = params.contract.acceptanceCriteria;
  const verdicts = [];
  const diagnostics = [];
  const summaries = [];
  for (const criterion of criteria) {
    const subParams = { ...params, contract: { ...params.contract, acceptanceCriteria: [criterion] } };
    let res;
    try {
      res = await requestAssessment(params.provider, subParams);
      if (!res.valid) res = await requestAssessment(params.provider, subParams, res.errors);
    } catch (_error) {
      res = { valid: false, errors: ["per-criterion-provider-failure"] };
    }
    if (res.valid && res.assessment?.criteria?.[0]) {
      verdicts.push(res.assessment.criteria[0]);
      if (res.assessment.unmetSummary) summaries.push(res.assessment.unmetSummary);
    } else {
      const harnessClaimType = deriveCriterionClaimType(criterion, params.contract);
      verdicts.push({
        id: criterion.id, shape: criterion.shape || "", status: "unmet", evidenceIds: [],
        evidenceQuote: "", explanation: "This criterion could not be assessed.",
        claimType: harnessClaimType, harnessClaimType, modelClaimType: ""
      });
      diagnostics.push({ criterionId: criterion.id, errorCodes: res.errors || ["per-criterion-failed"] });
    }
  }
  // Re-run the shared post-processing across the full merged set so the inspection fallback
  // and cross-criterion coherence see every criterion, not one call in isolation.
  const assessment = finalizeAssessment(verdicts, params.contract, params.evidenceLedger, summaries.join(" "));
  return { assessment, diagnostics };
}

async function assessAcceptanceCriteria(params) {
  if (params.contract?.verifiability === "unverified") {
    return { assessment: createUnverifiedAssessment(params.contract), diagnostics: [] };
  }
  // Per-criterion mode: one model call per criterion (opt-out via intentPerCriterionAssessment).
  if (params.settings?.intentPerCriterionAssessment === true
    && Array.isArray(params.contract?.acceptanceCriteria)
    && params.contract.acceptanceCriteria.length >= 2) {
    return assessPerCriterion(params);
  }
  let first;
  try {
    first = await requestAssessment(params.provider, params);
  } catch (_error) {
    first = { valid: false, errors: ["assessment-provider-failure"] };
  }
  if (first.valid) return { assessment: first.assessment, diagnostics: [] };
  let repaired;
  try {
    repaired = await requestAssessment(params.provider, params, first.errors);
  } catch (_error) {
    repaired = { valid: false, errors: ["assessment-repair-provider-failure"] };
  }
  if (repaired.valid) return { assessment: repaired.assessment, diagnostics: [{ attempt: 1, errorCodes: first.errors }] };
  const diagnostics = [
    { attempt: 1, errorCodes: first.errors },
    { attempt: 2, errorCodes: repaired.errors }
  ];
  return {
    assessment: createFallbackAssessment(params.contract, "Completion assessment failed validation after repair."),
    diagnostics
  };
}

function escapeTableCell(value) {
  return String(value || "").replace(/\|/g, "\\|").replace(/\r?\n/g, " ").trim();
}

function renderAssessmentSection(contract, assessment) {
  const criteriaById = new Map((contract.acceptanceCriteria || []).map((criterion) => [criterion.id, criterion]));
  const lines = [
    "## Acceptance criteria",
    "",
    "| Criterion | Status | Evidence |",
    "| --- | --- | --- |"
  ];
  for (const verdict of assessment.criteria || []) {
    const description = criteriaById.get(verdict.id)?.description || verdict.id;
    const status = verdict.status === "met" ? "Met" : (verdict.status === "unverified" ? "Unverified" : "Unmet");
    const ids = verdict.evidenceIds.length ? verdict.evidenceIds.join(", ") : "None";
    // Show the quoted content that establishes a met verdict, not just the evidence ids.
    const evidence = verdict.status === "met" && verdict.evidenceQuote
      ? `${ids} -- "${boundedText(verdict.evidenceQuote, 160)}"`
      : ids;
    lines.push(`| ${escapeTableCell(`${verdict.id}: ${description}`)} | ${status} | ${escapeTableCell(evidence)} |`);
  }
  if (assessment.warning) lines.push("", `Assessment warning: ${assessment.warning}`);
  if (assessment.overallStatus === "incomplete") {
    lines.push("", `Task incomplete: ${assessment.unmetSummary || "One or more acceptance criteria remain unmet."}`);
    // Arbiter: per-unmet-criterion classification and what to do about each.
    const arbitrated = (assessment.criteria || []).filter((verdict) => verdict.status === "unmet" && verdict.arbitration);
    if (arbitrated.length) {
      lines.push("", "### Why each criterion is unmet");
      for (const verdict of arbitrated) {
        lines.push(`- ${escapeTableCell(verdict.id)} [${verdict.arbitration.class}]: ${escapeTableCell(verdict.arbitration.reason)} ${escapeTableCell(verdict.arbitration.guidance)}`);
      }
    }
  } else if (assessment.overallStatus === "provisional") {
    const criterion = contract.acceptanceCriteria?.[0]?.description || "the reduced acceptance criterion";
    lines.push("", `Provisional result: I verified ${criterion}, but could not capture the full set of requirements or constraints for this request. Please confirm that nothing else was intended.`);
  } else if (assessment.overallStatus === "unverified") {
    lines.push("", "Unverified result: I could not establish verifiable acceptance criteria for this request, so I cannot confirm that it matches your intent. Here is what I did -- please confirm.");
  }
  return lines.join("\n");
}

module.exports = {
  ASSESS_ACCEPTANCE_CRITERIA_TOOL,
  assessAcceptanceCriteria,
  createUnverifiedAssessment,
  renderAssessmentSection,
  validateRawAssessment
};
