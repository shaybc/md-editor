"use strict";

const fs = require("fs");
const path = require("path");

/**
 * Owns ABI revision durability across producer generations and asynchronous JDT consumers.
 * A revision is removable only after every owner releases it and a newer revision is verified.
 */
function createKotlinAbiRevisionLeases(options = {}) {
  const revisions = new Map();
  let verifiedRevision = "";

  function ensure(revision, revisionPath) {
    const id = String(revision || "");
    if (!revisions.has(id)) revisions.set(id, { revision: id, path: revisionPath, owners: new Map(), verified: false });
    return revisions.get(id);
  }

  function acquire(revision, revisionPath, owner, count = 1) {
    const record = ensure(revision, revisionPath);
    const ownerId = String(owner || "");
    record.owners.set(ownerId, (record.owners.get(ownerId) || 0) + Math.max(1, Number(count) || 1));
    trace("acquire", record, { owner: ownerId });
    return total(record);
  }

  function release(revision, owner, count = 1) {
    const record = revisions.get(String(revision || ""));
    if (!record) return 0;
    const ownerId = String(owner || "");
    const remaining = Math.max(0, (record.owners.get(ownerId) || 0) - Math.max(1, Number(count) || 1));
    if (remaining) record.owners.set(ownerId, remaining);
    else record.owners.delete(ownerId);
    trace("release", record, { owner: ownerId });
    cleanupEligible();
    return total(record);
  }

  function markVerified(revision, revisionPath) {
    const record = ensure(revision, revisionPath);
    record.verified = true;
    verifiedRevision = record.revision;
    trace("verified", record);
  }

  function replaceJdtRevision(previousSnapshot, nextSnapshot) {
    const nextRevision = String(nextSnapshot?.workspaceRevision || "");
    const nextPath = revisionPath(nextSnapshot);
    markVerified(nextRevision, nextPath);
    acquire(nextRevision, nextPath, "jdt");
    acquireProjectOwners(nextSnapshot);
    release(nextRevision, "generation");
    const previousRevision = String(previousSnapshot?.workspaceRevision || "");
    if (previousRevision && previousRevision !== nextRevision) {
      releaseProjectOwners(previousSnapshot);
      release(previousRevision, "jdt");
    }
    cleanupEligible();
  }

  function hydrateVerifiedSnapshot(snapshot) {
    if (!snapshot?.workspaceRevision) return;
    const revision = String(snapshot.workspaceRevision);
    const root = revisionPath(snapshot);
    markVerified(revision, root);
    acquire(revision, root, "jdt");
    acquireProjectOwners(snapshot);
  }

  function acquireProjectOwners(snapshot) {
    const counts = projectReferenceCounts(snapshot);
    for (const [projectUri, count] of counts) {
      acquire(snapshot.workspaceRevision, revisionPath(snapshot), `project:${projectUri}`, count);
    }
  }

  function releaseProjectOwners(snapshot) {
    const counts = projectReferenceCounts(snapshot);
    for (const [projectUri, count] of counts) release(snapshot.workspaceRevision, `project:${projectUri}`, count);
  }

  function cleanupEligible() {
    for (const [revision, record] of revisions) {
      if (revision === verifiedRevision || total(record) !== 0 || !verifiedRevision) continue;
      if (!record.path || !isRevisionPath(record.path)) continue;
      trace("delete", record, { deletionReason: "unreferenced-after-newer-verified" });
      try {
        fs.rmSync(record.path, { recursive: true, force: true, maxRetries: 5, retryDelay: 100 });
        revisions.delete(revision);
      } catch (error) {
        trace("delete-failed", record, { deletionReason: error?.message || String(error) });
      }
    }
  }

  function isRevisionPath(candidate) {
    const abiRoot = path.resolve(options.cacheRoot, "abi");
    const resolved = path.resolve(String(candidate || ""));
    return resolved !== abiRoot && resolved.startsWith(`${abiRoot}${path.sep}`);
  }

  function trace(operation, record, details = {}) {
    options.onLifecycle?.({
      operation,
      revision: record.revision,
      revisionPath: record.path || "",
      leaseOwner: details.owner || "",
      leaseCount: total(record),
      owners: Object.fromEntries(record.owners),
      verified: record.verified,
      deletionReason: details.deletionReason || "",
      timestamp: new Date().toISOString()
    });
  }

  function getState() {
    return {
      verifiedRevision,
      revisions: Array.from(revisions.values()).map((record) => ({
        revision: record.revision,
        path: record.path,
        owners: Object.fromEntries(record.owners),
        verified: record.verified
      }))
    };
  }

  function revisionPath(snapshot) {
    const jarPath = snapshot?.entries?.[0]?.jarPath;
    return jarPath ? path.dirname(jarPath) : path.join(options.cacheRoot, "abi", String(snapshot?.workspaceRevision || ""));
  }

  function projectReferenceCounts(snapshot) {
    const counts = new Map();
    for (const entry of snapshot?.entries || []) {
      const projectUri = String(entry.projectUri || "");
      counts.set(projectUri, (counts.get(projectUri) || 0) + 1);
    }
    return counts;
  }

  function total(record) {
    return Array.from(record.owners.values()).reduce((sum, count) => sum + count, 0);
  }

  return { acquire, release, markVerified, replaceJdtRevision, hydrateVerifiedSnapshot, cleanupEligible, getState };
}

module.exports = { createKotlinAbiRevisionLeases };
