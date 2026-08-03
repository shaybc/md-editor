"use strict";

const { createHash } = require("node:crypto");
const { statSync } = require("node:fs");

const MAX_STORED_PROBLEMS = 5000;
const MAX_PROBLEM_SNAPSHOTS = 4;
const JDT_TASK_PROBLEM_ID = 536871362;

/** Keep the newest JDT diagnostic snapshot per document and expose bounded queries. */
class JdtDiagnosticStore {
  constructor(options = {}) {
    this.maximumProblems = Math.max(1, Number(options.maximumProblems) || MAX_STORED_PROBLEMS);
    this.publicationsByUri = new Map();
    this.authoritativePublicationsByUri = new Map();
    this.authoritativeScopeUris = [];
    this.activeUri = "";
    this.revision = 0;
    this.sequence = 0;
    this.problemSnapshots = new Map();
    this.nextProblemSnapshotId = 1;
    this.projectAnalysisFailure = null;
    this.lastPublication = null;
  }

  setMaximumProblems(value) {
    const nextMaximum = Math.max(1, Number(value) || MAX_STORED_PROBLEMS);
    if (nextMaximum === this.maximumProblems) return this.getSummary();
    this.maximumProblems = nextMaximum;
    this.problemSnapshots.clear();
    this.revision += 1;
    return this.getSummary();
  }

  setActiveDocument(uri) {
    this.activeUri = String(uri || "");
    return this.getActiveDiagnostics();
  }

  updatePublication(params = {}) {
    if (this.projectAnalysisFailure) return { activeDiagnostics: null, summary: this.getSummary() };
    const uri = String(params.uri || "");
    if (!uri) return { activeDiagnostics: null, summary: this.getSummary() };
    const diagnostics = Array.isArray(params.diagnostics) ? params.diagnostics : [];
    const counts = countProblemDiagnostics(diagnostics);
    const taskCount = diagnostics.filter(isJavaTaskDiagnostic).length;
    const publicationSequence = ++this.sequence;
    this.publicationsByUri.set(uri, {
      uri,
      version: params.version,
      diagnostics,
      counts,
      taskCount,
      sequence: publicationSequence
    });
    this.lastPublication = {
      uri,
      version: params.version,
      sequence: publicationSequence,
      timestamp: Date.now(),
      counts,
      taskCount
    };
    this.revision += 1;
    return {
      activeDiagnostics: uri === this.activeUri ? {
        uri,
        version: params.version,
        diagnostics,
        revision: this.revision
      } : null,
      summary: this.getSummary()
    };
  }

  /** Atomically make AJDT authoritative for the supplied AspectJ project scopes. */
  replaceAuthoritativeSnapshot(snapshot = {}) {
    const publications = Array.isArray(snapshot.publications) ? snapshot.publications : [];
    this.authoritativeScopeUris = (snapshot.scopeUris || []).map(normalizeScopeUri).filter(Boolean);
    this.authoritativePublicationsByUri = new Map(publications.map((params) => {
      const uri = String(params?.uri || "");
      const diagnostics = Array.isArray(params?.diagnostics) ? params.diagnostics : [];
      return [uri, {
        uri,
        version: params?.version,
        diagnostics,
        counts: countProblemDiagnostics(diagnostics),
        taskCount: diagnostics.filter(isJavaTaskDiagnostic).length,
        sequence: ++this.sequence
      }];
    }).filter(([uri]) => uri));
    this.problemSnapshots.clear();
    this.revision += 1;
    return { activeDiagnostics: this.getActiveDiagnostics(), summary: this.getSummary() };
  }

  /** Restore JDT diagnostics when the optional AJDT authority is disabled or unavailable. */
  clearAuthoritativeSnapshot() {
    if (!this.authoritativeScopeUris.length && !this.authoritativePublicationsByUri.size) {
      return { activeDiagnostics: this.getActiveDiagnostics(), summary: this.getSummary() };
    }
    this.authoritativeScopeUris = [];
    this.authoritativePublicationsByUri.clear();
    this.problemSnapshots.clear();
    this.revision += 1;
    return { activeDiagnostics: this.getActiveDiagnostics(), summary: this.getSummary() };
  }

  /** Quarantine all project diagnostics produced by a failed import generation. */
  failProjectAnalysis(failure = {}) {
    this.projectAnalysisFailure = Object.assign({}, failure);
    this.publicationsByUri.clear();
    this.authoritativePublicationsByUri.clear();
    this.authoritativeScopeUris = [];
    this.problemSnapshots.clear();
    this.revision += 1;
    return {
      activeDiagnostics: this.activeUri ? { uri: this.activeUri, diagnostics: [], revision: this.revision } : null,
      summary: this.getSummary()
    };
  }

  getActiveDiagnostics() {
    if (!this.activeUri) return null;
    if (this.projectAnalysisFailure) return { uri: this.activeUri, diagnostics: [], revision: this.revision };
    const publication = this.getEffectivePublication(this.activeUri);
    return {
      uri: this.activeUri,
      version: publication?.version,
      diagnostics: publication?.diagnostics || [],
      revision: this.revision
    };
  }

  getSummary() {
    if (this.projectAnalysisFailure) {
      return {
        revision: this.revision,
        counts: { error: 0, warning: 0, info: 0, total: 0 },
        totalCount: 0,
        availableCount: 0,
        taskCount: 0,
        availableTaskCount: 0,
        maximumProblems: this.maximumProblems,
        analysisAvailable: false,
        failure: Object.assign({}, this.projectAnalysisFailure)
      };
    }
    const counts = { error: 0, warning: 0, info: 0, total: 0 };
    let storedCount = 0;
    this.getEffectivePublications().forEach((publication) => {
      counts.error += publication.counts.error;
      counts.warning += publication.counts.warning;
      counts.info += publication.counts.info;
      counts.total += publication.counts.total;
      storedCount += publication.diagnostics.filter((diagnostic) => !isJavaTaskDiagnostic(diagnostic)).length;
    });
    const taskCount = Array.from(this.publicationsByUri.values()).reduce((total, publication) => {
      return total + (Number(publication.taskCount) || 0);
    }, 0);
    return {
      revision: this.revision,
      counts,
      totalCount: counts.total,
      availableCount: Math.min(storedCount, this.maximumProblems),
      taskCount,
      availableTaskCount: taskCount,
      maximumProblems: this.maximumProblems,
      lastPublication: this.lastPublication ? Object.assign({}, this.lastPublication) : null
    };
  }

  collectCurrentProblems() {
    const publications = this.getEffectivePublications()
      .sort((left, right) => right.sequence - left.sequence);
    const diagnosticsBySeverity = [[], [], []];
    for (const publication of publications) {
      for (let index = 0; index < publication.diagnostics.length; index += 1) {
        const diagnostic = publication.diagnostics[index];
        if (isJavaTaskDiagnostic(diagnostic)) continue;
        diagnosticsBySeverity[severityPriority(diagnostic.severity)].push({ publication, diagnostic, index });
      }
    }
    const problems = [];
    for (const diagnostics of diagnosticsBySeverity) {
      for (const entry of diagnostics) {
        if (problems.length >= this.maximumProblems) break;
        problems.push(this.toProblem(entry.publication, entry.diagnostic, entry.index));
      }
      if (problems.length >= this.maximumProblems) break;
    }
    return problems;
  }

  /** Return source-owned Java task markers without applying AJDT problem authority. */
  collectCurrentTasks() {
    const tasks = [];
    const publications = Array.from(this.publicationsByUri.values())
      .sort((left, right) => right.sequence - left.sequence);
    for (const publication of publications) {
      for (let index = 0; index < publication.diagnostics.length; index += 1) {
        const diagnostic = publication.diagnostics[index];
        if (!isJavaTaskDiagnostic(diagnostic)) continue;
        tasks.push(this.toTask(publication, diagnostic, index));
      }
    }
    return tasks;
  }

  getEffectivePublication(uri) {
    if (this.isAuthoritativeUri(uri)) return this.authoritativePublicationsByUri.get(uri) || null;
    return this.publicationsByUri.get(uri) || null;
  }

  getEffectivePublications() {
    const publications = Array.from(this.publicationsByUri.values())
      .filter((publication) => !this.isAuthoritativeUri(publication.uri));
    publications.push(...this.authoritativePublicationsByUri.values());
    return publications;
  }

  isAuthoritativeUri(uri) {
    const normalizedUri = normalizeScopeUri(uri);
    return this.authoritativeScopeUris.some((scopeUri) => normalizedUri === scopeUri || normalizedUri.startsWith(`${scopeUri}/`));
  }

  createProblemSnapshot() {
    const snapshot = {
      id: `jdt-problems-${this.nextProblemSnapshotId++}`,
      problems: [],
      problemIds: new Set(),
      targetCount: 0,
      targetReached: false,
      revision: this.revision
    };
    this.problemSnapshots.set(snapshot.id, snapshot);
    while (this.problemSnapshots.size > MAX_PROBLEM_SNAPSHOTS) {
      this.problemSnapshots.delete(this.problemSnapshots.keys().next().value);
    }
    return snapshot;
  }

  /** Freeze the current effective diagnostics for one completed analysis generation. */
  freezeGenerationSnapshot(generationId) {
    const summary = this.getSummary();
    const snapshot = {
      id: `jdt-generation-${Number(generationId) || 0}-${this.nextProblemSnapshotId++}`,
      generationId: Number(generationId) || 0,
      frozen: true,
      problems: Object.freeze(this.collectCurrentProblems().map((problem) => Object.freeze({ ...problem }))),
      tasks: Object.freeze(this.collectCurrentTasks().map((task) => Object.freeze({ ...task }))),
      revision: this.revision,
      summary: Object.freeze({
        ...summary,
        generationId: Number(generationId) || 0
      })
    };
    Object.freeze(snapshot);
    this.problemSnapshots.set(snapshot.id, snapshot);
    while (this.problemSnapshots.size > MAX_PROBLEM_SNAPSHOTS) {
      this.problemSnapshots.delete(this.problemSnapshots.keys().next().value);
    }
    return {
      ...snapshot.summary,
      snapshotId: snapshot.id,
      snapshotRevision: snapshot.revision,
      generationId: snapshot.generationId
    };
  }

  /** Reconcile one viewing snapshot while retaining stable rows within each severity. */
  reconcileProblemSnapshot(snapshot, requestedCount) {
    const nextTargetCount = Math.min(this.maximumProblems, Math.max(snapshot.targetCount, requestedCount));
    if (nextTargetCount > snapshot.targetCount) {
      snapshot.targetCount = nextTargetCount;
      snapshot.targetReached = false;
    }
    const currentProblems = this.collectCurrentProblems();
    const currentProblemsById = new Map(currentProblems.map((problem) => [problem.problemId, problem]));
    const retainedProblems = snapshot.problems
      .filter((problem) => currentProblemsById.has(problem.problemId))
      .map((problem) => currentProblemsById.get(problem.problemId));
    const desiredProblems = currentProblems.slice(0, snapshot.targetCount);
    const severityOrder = ["error", "warning", "info"];
    snapshot.problems = [];
    snapshot.problemIds = new Set();
    for (const severity of severityOrder) {
      const desiredCount = desiredProblems.filter((problem) => problem.severity === severity).length;
      const retained = retainedProblems.filter((problem) => problem.severity === severity).slice(0, desiredCount);
      let selectedCount = retained.length;
      for (const problem of retained) {
        snapshot.problemIds.add(problem.problemId);
        snapshot.problems.push(problem);
      }
      for (const problem of currentProblems) {
        if (problem.severity !== severity || snapshot.problemIds.has(problem.problemId)) continue;
        if (selectedCount >= desiredCount) break;
        snapshot.problemIds.add(problem.problemId);
        snapshot.problems.push(problem);
        selectedCount += 1;
      }
    }
    snapshot.targetReached = snapshot.problems.length >= snapshot.targetCount;
    snapshot.revision = this.revision;
    return snapshot;
  }

  /** Return a stable bounded page that retains visible problems until JDT retracts them. */
  getProblems(offset = 0, limit = 100, snapshotId = "") {
    if (this.projectAnalysisFailure) {
      const summary = this.getSummary();
      return {
        revision: this.revision,
        snapshotId: "",
        snapshotRevision: this.revision,
        offset: 0,
        problems: [],
        totalCount: 0,
        availableCount: 0,
        maximumProblems: this.maximumProblems,
        analysisAvailable: false,
        failure: summary.failure
      };
    }
    const start = Math.max(0, Number(offset) || 0);
    const requestedLimit = Math.max(0, Number(limit) || 0);
    const requestedSnapshot = this.problemSnapshots.get(String(snapshotId || ""));
    if (requestedSnapshot?.frozen === true) {
      const summary = requestedSnapshot.summary;
      return {
        revision: requestedSnapshot.revision,
        snapshotId: requestedSnapshot.id,
        snapshotRevision: requestedSnapshot.revision,
        generationId: requestedSnapshot.generationId,
        offset: start,
        problems: requestedSnapshot.problems.slice(start, start + requestedLimit),
        totalCount: summary.totalCount,
        availableCount: summary.availableCount,
        maximumProblems: summary.maximumProblems
      };
    }
    const snapshot = this.reconcileProblemSnapshot(requestedSnapshot || this.createProblemSnapshot(), start + requestedLimit);
    const summary = this.getSummary();
    return {
      revision: this.revision,
      snapshotId: snapshot.id,
      snapshotRevision: snapshot.revision,
      offset: start,
      problems: snapshot.problems.slice(start, start + requestedLimit),
      totalCount: summary.totalCount,
      availableCount: summary.availableCount,
      maximumProblems: this.maximumProblems
    };
  }

  /** Return a generation-pinned page of Java task markers. */
  getTasks(offset = 0, limit = 100, snapshotId = "") {
    const start = Math.max(0, Number(offset) || 0);
    const requestedLimit = Math.max(0, Number(limit) || 0);
    const requestedSnapshot = this.problemSnapshots.get(String(snapshotId || ""));
    if (requestedSnapshot?.frozen === true) {
      const tasks = requestedSnapshot.tasks || [];
      return {
        revision: requestedSnapshot.revision,
        snapshotId: requestedSnapshot.id,
        snapshotRevision: requestedSnapshot.revision,
        generationId: requestedSnapshot.generationId,
        offset: start,
        tasks: tasks.slice(start, start + requestedLimit),
        totalCount: tasks.length,
        availableCount: tasks.length
      };
    }
    const tasks = this.projectAnalysisFailure ? [] : this.collectCurrentTasks();
    return {
      revision: this.revision,
      snapshotId: "",
      snapshotRevision: this.revision,
      generationId: 0,
      offset: start,
      tasks: tasks.slice(start, start + requestedLimit),
      totalCount: tasks.length,
      availableCount: tasks.length
    };
  }

  toProblem(publication, diagnostic = {}, diagnosticIndex) {
    const range = diagnostic.range || {};
    return {
      problemId: createProblemId(publication.uri, diagnostic),
      uri: publication.uri,
      filePath: fileUriToPath(publication.uri),
      targetKind: getTargetKind(fileUriToPath(publication.uri)),
      severity: severityName(diagnostic.severity),
      message: String(diagnostic.message || "Unknown Java problem"),
      line: Math.max(1, Number(range.start?.line) + 1 || 1),
      column: Math.max(1, Number(range.start?.character) + 1 || 1),
      source: String(diagnostic.source || "jdt"),
      code: diagnostic.code,
      data: diagnostic.data,
      tags: diagnostic.tags,
      relatedInformation: diagnostic.relatedInformation,
      range,
      version: publication.version,
      diagnosticIndex,
      lspDiagnostic: diagnostic
    };
  }

  /** Convert one compiler task diagnostic into a read-only Tasks row. */
  toTask(publication, diagnostic = {}, diagnosticIndex) {
    const range = diagnostic.range || {};
    return {
      id: createProblemId(publication.uri, diagnostic),
      origin: "jdt",
      readOnly: true,
      title: String(diagnostic.message || "Java task"),
      description: "",
      status: "open",
      priority: null,
      uri: publication.uri,
      filePath: fileUriToPath(publication.uri),
      line: Math.max(1, Number(range.start?.line) + 1 || 1),
      column: Math.max(1, Number(range.start?.character) + 1 || 1),
      source: String(diagnostic.source || "jdt"),
      code: diagnostic.code,
      range,
      version: publication.version,
      diagnosticIndex,
      lspDiagnostic: diagnostic
    };
  }
}

function getTargetKind(filePath) {
  try {
    return statSync(filePath).isDirectory() ? "project" : "file";
  } catch (_error) {
    return "file";
  }
}

function createProblemId(uri, diagnostic = {}) {
  return createHash("sha1").update(JSON.stringify([
    String(uri || ""),
    diagnostic.range || null,
    diagnostic.severity,
    diagnostic.code,
    diagnostic.source,
    diagnostic.message
  ])).digest("hex");
}

function severityName(value) {
  if (Number(value) === 1) return "error";
  if (Number(value) === 2) return "warning";
  return "info";
}

/** Rank LSP diagnostic severities for Problems pagination: errors, warnings, then information. */
function severityPriority(value) {
  if (Number(value) === 1) return 0;
  if (Number(value) === 2) return 1;
  return 2;
}

/** Identify the compiler's dedicated task-marker problem without message heuristics. */
function isJavaTaskDiagnostic(diagnostic = {}) {
  return Number(diagnostic.code) === JDT_TASK_PROBLEM_ID;
}

function countProblemDiagnostics(diagnostics) {
  const counts = { error: 0, warning: 0, info: 0, total: 0 };
  diagnostics.forEach((diagnostic) => {
    if (isJavaTaskDiagnostic(diagnostic)) return;
    counts.total += 1;
    if (Number(diagnostic?.severity) === 1) counts.error += 1;
    else if (Number(diagnostic?.severity) === 2) counts.warning += 1;
    else counts.info += 1;
  });
  return counts;
}

function fileUriToPath(uri) {
  const value = String(uri || "");
  if (!/^file:/i.test(value)) return value;
  try {
    const url = new URL(value);
    let filePath = decodeURIComponent(url.pathname || "");
    if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
    return filePath.replace(/\//g, process.platform === "win32" ? "\\" : "/");
  } catch (_error) {
    return value.replace(/^file:\/\/+/, "");
  }
}

function normalizeScopeUri(value) {
  const uri = String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
  return process.platform === "win32" ? uri.toLowerCase() : uri;
}

module.exports = {
  JdtDiagnosticStore,
  MAX_STORED_PROBLEMS,
  JDT_TASK_PROBLEM_ID,
  fileUriToPath,
  severityName,
  isJavaTaskDiagnostic
};
