/**
 * Structured Plan artifact schema, validation, and Markdown rendering (M8.4).
 *
 * Plan completion must produce a typed, schema-versioned artifact rather than
 * only free-form prose. The rendered Markdown plan is DERIVED from this artifact,
 * so the saved plan and the displayed response cannot disagree.
 */

"use strict";

const PLAN_ARTIFACT_SCHEMA_VERSION = 1;

function asArray(value) {
  return Array.isArray(value) ? value : [];
}

function text(value) {
  return String(value == null ? "" : value).trim();
}

/**
 * Validate the structured Plan artifact.
 * @param {object} artifact
 * @returns {{ valid: boolean, issues: string[] }}
 */
function validatePlanArtifact(artifact) {
  const issues = [];
  if (!artifact || typeof artifact !== "object" || Array.isArray(artifact)) {
    return { valid: false, issues: ["artifact_not_object"] };
  }
  if (artifact.schemaVersion !== PLAN_ARTIFACT_SCHEMA_VERSION) issues.push("bad_schema_version");
  if (!text(artifact.title)) issues.push("missing_title");
  if (!text(artifact.goal)) issues.push("missing_goal");

  const requirements = asArray(artifact.requirements);
  if (requirements.length === 0) issues.push("no_requirements");
  const requirementIds = new Set();
  for (const requirement of requirements) {
    const id = text(requirement && requirement.id);
    if (!id) issues.push("requirement_missing_id");
    else if (requirementIds.has(id)) issues.push(`duplicate_requirement:${id}`);
    else requirementIds.add(id);
    if (!text(requirement && requirement.statement)) issues.push("requirement_missing_statement");
  }

  const steps = asArray(artifact.steps);
  if (steps.length === 0) issues.push("no_steps");
  const stepIds = new Set();
  for (const step of steps) {
    const id = text(step && step.id);
    if (!id) issues.push("step_missing_id");
    else if (stepIds.has(id)) issues.push(`duplicate_step:${id}`);
    else stepIds.add(id);
    if (!text(step && step.objective) && !text(step && step.description)) issues.push("step_missing_body");
  }

  // Sequencing must reference only real steps.
  const sequencing = artifact.sequencing || {};
  for (const id of asArray(sequencing.orderedStepIds)) {
    if (!stepIds.has(text(id))) issues.push(`sequencing_unknown_step:${text(id)}`);
  }
  for (const group of asArray(sequencing.parallelGroups)) {
    for (const id of asArray(group)) {
      if (!stepIds.has(text(id))) issues.push(`parallel_unknown_step:${text(id)}`);
    }
  }

  // requirementsCovered on each step must reference declared requirements.
  for (const step of steps) {
    for (const requirementId of asArray(step && step.requirementsCovered)) {
      if (!requirementIds.has(text(requirementId))) issues.push(`step_covers_unknown_requirement:${text(requirementId)}`);
    }
  }

  return { valid: issues.length === 0, issues: [...new Set(issues)] };
}

function renderList(title, items, renderItem) {
  const rendered = asArray(items).map(renderItem).filter(Boolean);
  if (rendered.length === 0) return "";
  return `## ${title}\n\n${rendered.join("\n")}\n`;
}

/**
 * Render the Markdown plan deterministically from the artifact.
 * @param {object} artifact
 * @returns {string}
 */
function renderPlanArtifactMarkdown(artifact) {
  if (!artifact || typeof artifact !== "object") return "";
  const lines = [];
  lines.push(`# ${text(artifact.title) || "Plan"}`);
  lines.push("");
  if (text(artifact.goal)) {
    lines.push(text(artifact.goal));
    lines.push("");
  }

  const requirements = renderList("Requirements", artifact.requirements, (requirement) => {
    const id = text(requirement.id);
    const statement = text(requirement.statement);
    if (!statement) return "";
    const source = text(requirement.source);
    return `- ${id ? `**${id}** ` : ""}${statement}${source ? ` _(${source})_` : ""}`;
  });
  if (requirements) lines.push(requirements);

  const orderedIds = asArray(artifact.sequencing && artifact.sequencing.orderedStepIds).map(text);
  const stepsById = new Map(asArray(artifact.steps).map((step) => [text(step.id), step]));
  const orderedSteps = orderedIds.length
    ? orderedIds.map((id) => stepsById.get(id)).filter(Boolean)
    : asArray(artifact.steps);
  if (orderedSteps.length) {
    lines.push("## Steps");
    lines.push("");
    orderedSteps.forEach((step, index) => {
      const heading = text(step.objective) || text(step.description) || `Step ${index + 1}`;
      lines.push(`### ${index + 1}. ${heading}`);
      if (text(step.description) && text(step.description) !== heading) lines.push(text(step.description));
      const covered = asArray(step.requirementsCovered).map(text).filter(Boolean);
      if (covered.length) lines.push(`- Covers: ${covered.join(", ")}`);
      const areas = asArray(step.affectedAreas).map(text).filter(Boolean);
      const files = asArray(step.filesOrComponents).map(text).filter(Boolean);
      if (areas.length) lines.push(`- Affected areas: ${areas.join(", ")}`);
      if (files.length) lines.push(`- Files/components: ${files.join(", ")}`);
      const deps = asArray(step.dependencies).map(text).filter(Boolean);
      if (deps.length) lines.push(`- Depends on: ${deps.join(", ")}`);
      const validations = asArray(step.validations).map(text).filter(Boolean);
      if (validations.length) lines.push(`- Validation: ${validations.join("; ")}`);
      lines.push("");
    });
  }

  const parallelGroups = asArray(artifact.sequencing && artifact.sequencing.parallelGroups).filter((group) => asArray(group).length > 1);
  if (parallelGroups.length) {
    lines.push("## Parallelizable groups");
    lines.push("");
    parallelGroups.forEach((group) => lines.push(`- ${asArray(group).map(text).join(", ")}`));
    lines.push("");
  }

  const risks = renderList("Risks", artifact.risks, (risk) => {
    const description = text(risk.description);
    if (!description) return "";
    const mitigation = text(risk.mitigation);
    return `- ${description}${mitigation ? ` — _Mitigation:_ ${mitigation}` : ""}`;
  });
  if (risks) lines.push(risks);

  const assumptions = renderList("Assumptions", artifact.assumptions, (assumption) => {
    const statement = text(assumption.statement);
    return statement ? `- ${statement}` : "";
  });
  if (assumptions) lines.push(assumptions);

  const questions = renderList("Unresolved questions", artifact.unresolvedQuestions, (question) => {
    const q = text(question.question);
    if (!q) return "";
    return `- ${question.blocking ? "**(blocking)** " : ""}${q}`;
  });
  if (questions) lines.push(questions);

  const exclusions = renderList("Out of scope", artifact.exclusions, (exclusion) => {
    const value = text(exclusion);
    return value ? `- ${value}` : "";
  });
  if (exclusions) lines.push(exclusions);

  return lines.join("\n").replace(/\n{3,}/g, "\n\n").trim() + "\n";
}

module.exports = {
  PLAN_ARTIFACT_SCHEMA_VERSION,
  validatePlanArtifact,
  renderPlanArtifactMarkdown
};
