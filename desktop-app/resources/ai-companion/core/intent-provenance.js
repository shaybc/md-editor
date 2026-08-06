/**
 * Intent provenance boundary (M11.1).
 *
 * Ambient editor context — the active file, open tabs, and selection — is supporting
 * evidence, never a requirement. Left unchecked, an extractor will happily copy the
 * incidental active file into a criterion's `mustInspect` or into `namedTargets`,
 * turning "what happened to be open" into mandatory coverage the verifier then
 * enforces. That is exactly how a "set six preferences" request acquired a mandatory
 * source-file inspection it never needed.
 *
 * This module is a pure, deterministic post-extraction pass. Given a normalized intent
 * contract, the raw prompt, and the ambient descriptors, it demotes ambient-only
 * targets: an ambient path that the user did not name (and that no observation has yet
 * proven necessary) is removed from the contract's *required* structures. It remains
 * available to the model as context (the editor read context / extraction envelope
 * still carry it) — it simply is not coverage the contract demands.
 *
 * Rule, stated once:
 *   user-referenced target  -> may be required
 *   ambient-only target     -> supporting only (never mustInspect / namedTargets)
 *
 * Pure: no IO, no provider calls, no mutation of the input contract.
 */

"use strict";

/** Provenance tags a candidate target may carry. */
const PROVENANCE = Object.freeze({
  USER: "user",
  AMBIENT: "ambient",
  OBSERVATION: "observation"
});

/** namedTargets sources that mark a target as ambient editor context. */
const AMBIENT_SOURCES = Object.freeze(new Set(["active-editor", "open-tab", "open-tabs", "ambient", "editor"]));

function toText(value) {
  return String(value == null ? "" : value);
}

/** Basename of a path-like string, without directory or trailing slash. */
function basename(value) {
  const cleaned = toText(value).replace(/[\\/]+$/, "");
  const parts = cleaned.split(/[\\/]/);
  return parts[parts.length - 1] || cleaned;
}

/** Basename with a single trailing extension removed (foo.test.js -> foo.test). */
function stripExtension(name) {
  return name.replace(/\.[^.]+$/, "");
}

/**
 * Tokenize prompt text into a lowercase set for user-reference matching. Splits on any
 * character that is not part of a path/identifier so that "defaults.js" and
 * "aiCompanionSettings.enabled" survive as tokens.
 *
 * @param {string} prompt
 * @returns {{ tokens: Set<string>, text: string }}
 */
function buildPromptIndex(prompt) {
  const text = toText(prompt).toLowerCase();
  const tokens = new Set(text.split(/[^a-z0-9._/\\-]+/i).filter(Boolean));
  return { tokens, text };
}

/**
 * Whether the user's prompt explicitly refers to a path/target value. A value is
 * user-referenced when its full text appears in the prompt, or its basename (with or
 * without extension) appears as a discrete prompt token. Generic bare words shorter
 * than three characters never count.
 *
 * @param {string} value
 * @param {{ tokens: Set<string>, text: string }} promptIndex
 * @returns {boolean}
 */
function isUserReferenced(value, promptIndex) {
  const raw = toText(value).trim().toLowerCase();
  if (!raw) return false;
  if (raw.length >= 3 && promptIndex.text.includes(raw)) return true;
  const base = basename(raw);
  if (base.length >= 3 && promptIndex.tokens.has(base)) return true;
  const stem = stripExtension(base);
  if (stem.length >= 3 && promptIndex.tokens.has(stem)) return true;
  return false;
}

/**
 * Normalize the ambient descriptor set into comparable path + basename forms.
 *
 * @param {object} ambient - { activeFilePath, openTabPaths }
 * @returns {{ paths: Set<string>, basenames: Set<string> }}
 */
function buildAmbientIndex(ambient = {}) {
  const paths = new Set();
  const basenames = new Set();
  const add = (value) => {
    const raw = toText(value).trim().toLowerCase();
    if (!raw) return;
    paths.add(raw);
    const base = basename(raw);
    if (base) basenames.add(base);
  };
  add(ambient.activeFilePath || ambient.activeFile?.path);
  const tabs = Array.isArray(ambient.openTabPaths) ? ambient.openTabPaths : [];
  tabs.forEach(add);
  return { paths, basenames };
}

/** Whether a value matches an ambient descriptor (by full path or basename). */
function matchesAmbient(value, ambientIndex) {
  const raw = toText(value).trim().toLowerCase();
  if (!raw) return false;
  if (ambientIndex.paths.has(raw)) return true;
  return ambientIndex.basenames.has(basename(raw));
}

/**
 * A named-target entry is ambient-only when it is ambient context (by source label or
 * by matching a descriptor) AND the user did not name it AND an observation has not yet
 * confirmed it. Confirmed targets are kept — an observation proved necessity.
 */
function isAmbientOnlyTarget(entry, ambientIndex, promptIndex) {
  if (!entry || typeof entry !== "object") return false;
  if (entry.status === "confirmed") return false;
  const source = toText(entry.source).toLowerCase();
  const ambient = AMBIENT_SOURCES.has(source) || matchesAmbient(entry.value, ambientIndex);
  if (!ambient) return false;
  return !isUserReferenced(entry.value, promptIndex);
}

function cloneContract(contract) {
  return JSON.parse(JSON.stringify(contract));
}

/**
 * Apply the provenance boundary to a normalized intent contract.
 *
 * Removes ambient-only file targets from `namedTargets.files` and ambient-only inspect
 * entries from every criterion's `mustInspect`. Returns a new contract plus a report of
 * what was demoted (for telemetry and tests). Never mutates the input.
 *
 * @param {object} contract - Normalized intent contract.
 * @param {object} options - { prompt, ambient: { activeFilePath, openTabPaths } }
 * @returns {{ contract: object, report: { demotedTargets: string[], strippedMustInspect: Array<{criterionId:string,value:string}>, changed: boolean } }}
 */
function applyIntentProvenanceBoundary(contract, options = {}) {
  const report = { demotedTargets: [], strippedMustInspect: [], changed: false };
  if (!contract || typeof contract !== "object") return { contract, report };

  const promptIndex = buildPromptIndex(options.prompt);
  const ambientIndex = buildAmbientIndex(options.ambient || {});
  // No ambient context means nothing can be demoted.
  if (ambientIndex.paths.size === 0) return { contract, report };

  const next = cloneContract(contract);

  const files = Array.isArray(next.namedTargets?.files) ? next.namedTargets.files : [];
  if (files.length) {
    const kept = files.filter((entry) => {
      if (isAmbientOnlyTarget(entry, ambientIndex, promptIndex)) {
        report.demotedTargets.push(toText(entry.value));
        return false;
      }
      return true;
    });
    if (kept.length !== files.length) {
      next.namedTargets.files = kept;
      report.changed = true;
    }
  }

  const criteria = Array.isArray(next.acceptanceCriteria) ? next.acceptanceCriteria : [];
  criteria.forEach((criterion) => {
    const inspect = Array.isArray(criterion.mustInspect) ? criterion.mustInspect : [];
    if (!inspect.length) return;
    const kept = inspect.filter((value) => {
      const ambient = matchesAmbient(value, ambientIndex);
      if (ambient && !isUserReferenced(value, promptIndex)) {
        report.strippedMustInspect.push({ criterionId: toText(criterion.id), value: toText(value) });
        return false;
      }
      return true;
    });
    if (kept.length !== inspect.length) {
      criterion.mustInspect = kept;
      report.changed = true;
    }
  });

  return { contract: report.changed ? next : contract, report };
}

module.exports = {
  PROVENANCE,
  AMBIENT_SOURCES,
  isUserReferenced,
  matchesAmbient,
  isAmbientOnlyTarget,
  applyIntentProvenanceBoundary
};
