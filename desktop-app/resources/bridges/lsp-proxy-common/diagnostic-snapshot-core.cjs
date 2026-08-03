"use strict";

/** Creates stable, severity-first diagnostic snapshots shared by project providers. */
function createDiagnosticSnapshotCore(options = {}) {
  const maximumProblems = Math.max(1, Number(options.maximumProblems) || 5000);
  let revision = 0;
  let snapshot = Object.freeze({ id: "0", total: 0, counts: { error: 0, warning: 0, information: 0 }, problems: [] });

  function severityRank(problem) {
    const value = String(problem?.severity || "information").toLowerCase();
    return value === "error" ? 0 : value === "warning" ? 1 : 2;
  }

  function stableId(problem) {
    return problem.id || [problem.source, problem.file, problem.line, problem.column, problem.message].join("|");
  }

  function publish(problems) {
    const normalized = (Array.isArray(problems) ? problems : []).map((problem) => Object.freeze({
      ...problem,
      id: stableId(problem),
      severity: ["error", "warning"].includes(String(problem.severity).toLowerCase())
        ? String(problem.severity).toLowerCase()
        : "information"
    }));
    normalized.sort((left, right) => severityRank(left) - severityRank(right) || left.id.localeCompare(right.id));
    const retained = Object.freeze(normalized.slice(0, maximumProblems));
    const counts = normalized.reduce((result, problem) => {
      result[problem.severity] += 1;
      return result;
    }, { error: 0, warning: 0, information: 0 });
    revision += 1;
    snapshot = Object.freeze({ id: String(revision), total: normalized.length, counts, problems: retained });
    return snapshot;
  }

  function getSummary() {
    const { problems, ...summary } = snapshot;
    return summary;
  }

  function getProblems(query = {}) {
    if (query.snapshotId && query.snapshotId !== snapshot.id) return { stale: true, ...getSummary(), problems: [] };
    const offset = Math.max(0, Number(query.offset) || 0);
    const limit = Math.max(0, Number(query.limit) || 100);
    const filtered = query.severity ? snapshot.problems.filter((problem) => problem.severity === query.severity) : snapshot.problems;
    return { stale: false, ...getSummary(), problems: filtered.slice(offset, offset + limit) };
  }

  return { publish, getSummary, getProblems };
}

module.exports = { createDiagnosticSnapshotCore };

