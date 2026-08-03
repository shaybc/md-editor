/** Canonical field-reference grammar shared by intent validation and merging. */
"use strict";

const FIELD_REF_PATTERN = /^(goal|expectedOutcome|(?:requestedAction|prohibitedAction|outOfScope|criterion|target|assumption|decision):[^:]+)$/;

function collectCanonicalFieldRefs(contract) {
  if (!contract || typeof contract !== "object") return [];
  const refs = ["goal", "expectedOutcome"];
  const groups = [
    ["requestedAction", contract.requestedActions],
    ["prohibitedAction", contract.prohibitedActions],
    ["outOfScope", contract.outOfScope],
    ["criterion", contract.acceptanceCriteria],
    ["assumption", contract.assumptions],
    ["decision", contract.unresolvedDecisions]
  ];
  for (const [prefix, entries] of groups) {
    for (const entry of entries || []) if (entry?.id) refs.push(`${prefix}:${entry.id}`);
  }
  for (const entries of Object.values(contract.namedTargets || {})) {
    for (const entry of entries || []) if (entry?.id) refs.push(`target:${entry.id}`);
  }
  return [...new Set(refs)].filter(isCanonicalFieldRef);
}

function isCanonicalFieldRef(value) {
  return FIELD_REF_PATTERN.test(String(value || ""));
}

module.exports = { FIELD_REF_PATTERN, collectCanonicalFieldRefs, isCanonicalFieldRef };
