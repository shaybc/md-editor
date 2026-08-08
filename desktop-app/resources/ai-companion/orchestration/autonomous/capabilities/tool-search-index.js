/** Provider-independent exact and keyword search over deferred tool metadata. */

"use strict";

const DEFAULT_RESULTS = 5;
const MAX_RESULTS = 20;

class ToolSearchIndex {
  /** Search records without exposing their complete schemas. */
  search(query, records, options = {}) {
    const input = String(query || "").trim();
    const maxResults = Math.max(1, Math.min(Number(options.maxResults || DEFAULT_RESULTS), MAX_RESULTS));
    const selected = input.match(/^select:(.+)$/i);
    if (selected) return exactSelection(selected[1], records);
    const bare = records.find((record) => record.name.toLowerCase() === input.toLowerCase());
    if (bare) return { matches: [bare], missing: [], queryType: "exact" };
    return { matches: keywordMatches(input, records, maxResults), missing: [], queryType: "keyword" };
  }
}

function exactSelection(value, records) {
  const byName = new Map(records.map((record) => [record.name.toLowerCase(), record]));
  const matches = [];
  const missing = [];
  for (const requested of String(value || "").split(",").map((item) => item.trim()).filter(Boolean)) {
    const record = byName.get(requested.toLowerCase());
    if (!record) missing.push(requested);
    else if (!matches.includes(record)) matches.push(record);
  }
  return { matches, missing, queryType: "select" };
}

function keywordMatches(query, records, maxResults) {
  const terms = String(query || "").toLowerCase().split(/\s+/).filter(Boolean);
  const required = terms.filter((term) => term.startsWith("+") && term.length > 1).map((term) => term.slice(1));
  const scoring = terms.map((term) => term.replace(/^\+/, "")).filter(Boolean);
  return records
    .map((record) => ({ record, score: scoreRecord(record, scoring, required) }))
    .filter((entry) => entry.score > 0)
    .sort((left, right) => right.score - left.score || left.record.name.localeCompare(right.record.name))
    .slice(0, maxResults)
    .map((entry) => entry.record);
}

function scoreRecord(record, terms, required) {
  const name = record.name.toLowerCase();
  const parts = name.replace(/^mcp__/, "").split(/__|_/).map((part) => part.toLowerCase()).filter(Boolean);
  const domain = record.domain.toLowerCase();
  const description = record.description.toLowerCase();
  const hint = record.searchHint.toLowerCase();
  if (required.some((term) => !parts.some((part) => part.includes(term)) && !domain.includes(term) && !description.includes(term) && !hint.includes(term))) return 0;
  let score = 0;
  for (const term of terms) {
    if (domain === term) score += 11;
    else if (domain.includes(term)) score += 7;
    if (parts.includes(term)) score += record.external ? 12 : 10;
    else if (parts.some((part) => part.includes(term))) score += record.external ? 6 : 5;
    if (hint.includes(term)) score += 4;
    if (description.includes(term)) score += 2;
    if (!score && name.includes(term)) score += 3;
  }
  return score;
}

module.exports = { DEFAULT_RESULTS, MAX_RESULTS, ToolSearchIndex };
