/** Generic three-way migration for profile-backed AI Companion prompts. */
"use strict";

const crypto = require("node:crypto");

const clone = (value) => JSON.parse(JSON.stringify(value == null ? {} : value));

function flattenPrompts(value, prefix = "", result = {}) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return result;
  for (const [key, entry] of Object.entries(value)) {
    const keyPath = prefix ? `${prefix}.${key}` : key;
    if (typeof entry === "string") result[keyPath] = entry;
    else flattenPrompts(entry, keyPath, result);
  }
  return result;
}

function inflatePrompts(values) {
  const result = {};
  for (const keyPath of Object.keys(values || {}).sort()) {
    const segments = keyPath.split(".");
    let target = result;
    for (const segment of segments.slice(0, -1)) target = target[segment] ||= {};
    target[segments.at(-1)] = String(values[keyPath]);
  }
  return result;
}

function tokenFor(profile, revision) {
  return crypto.createHash("sha256").update(JSON.stringify({ profile, revision })).digest("base64url");
}

function renamed(values, renameMap = {}) {
  const result = Object.assign({}, values);
  for (const [from, to] of Object.entries(renameMap)) {
    if (Object.hasOwn(result, from) && !Object.hasOwn(result, to)) {
      result[to] = result[from];
      delete result[from];
    }
  }
  return result;
}

function conflictEntry(keyPath, kind, base, mine, theirs, definitions) {
  const definition = definitions.find((entry) => entry.keyPath === keyPath) || {};
  return { keyPath, name: definition.name || keyPath, description: definition.description || "", kind,
    previousDefault: base, userValue: mine, newDefault: theirs, removed: theirs === undefined };
}

/** Compare and safely migrate one prompt profile without performing IO. */
function migratePromptProfile(options) {
  const source = clone(options.profile);
  const currentShape = source.schemaVersion === options.schemaVersion && source.basePrompts && typeof source.basePrompts === "object";
  const legacyBase = currentShape ? source.basePrompts : options.legacyDefaultsBySchema[source.schemaVersion];
  const renameMap = options.renamesByRevision[source.resolvedDefaultRevision || source.schemaVersion] || {};
  const mine = renamed(flattenPrompts(source.prompts), renameMap);
  const base = renamed(flattenPrompts(legacyBase), renameMap);
  const theirs = flattenPrompts(options.currentDefaults);
  const nextMine = {};
  const nextBase = {};
  const conflicts = [];
  const keys = [...new Set([...Object.keys(mine), ...Object.keys(base), ...Object.keys(theirs)])].sort();

  for (const key of keys) {
    const hasMine = Object.hasOwn(mine, key);
    const hasBase = Object.hasOwn(base, key);
    const hasTheirs = Object.hasOwn(theirs, key);
    const userValue = hasMine ? mine[key] : base[key];
    if (!hasTheirs) {
      if (!hasMine || (hasBase && userValue === base[key])) continue;
      conflicts.push(conflictEntry(key, hasBase ? "removed" : "unknown-baseline", base[key], userValue, undefined, options.definitions));
      nextMine[key] = userValue;
      if (hasBase) nextBase[key] = base[key];
    } else if (!hasBase) {
      if (!hasMine || userValue === theirs[key]) {
        nextMine[key] = theirs[key]; nextBase[key] = theirs[key];
      } else {
        conflicts.push(conflictEntry(key, "unknown-baseline", undefined, userValue, theirs[key], options.definitions));
        nextMine[key] = userValue;
      }
    } else if (userValue === base[key]) {
      nextMine[key] = theirs[key]; nextBase[key] = theirs[key];
    } else if (theirs[key] === base[key] || userValue === theirs[key]) {
      nextMine[key] = userValue; nextBase[key] = theirs[key];
    } else {
      conflicts.push(conflictEntry(key, "changed", base[key], userValue, theirs[key], options.definitions));
      nextMine[key] = userValue; nextBase[key] = base[key];
    }
  }

  const fromRevision = Number(source.resolvedDefaultRevision || source.schemaVersion || 0);
  const profile = { documentType: options.documentType, schemaVersion: options.schemaVersion,
    resolvedDefaultRevision: conflicts.length ? fromRevision : options.defaultRevision,
    prompts: inflatePrompts(nextMine), basePrompts: inflatePrompts(nextBase),
    retiredPrompts: clone(source.retiredPrompts),
    pendingUpgrade: conflicts.length ? { fromRevision, toRevision: options.defaultRevision, conflictKeys: conflicts.map((entry) => entry.keyPath) } : null };
  const changed = JSON.stringify(source) !== JSON.stringify(profile);
  return { profile, conflicts, changed, status: conflicts.length ? "conflicts" : (changed ? "migrated" : "current"),
    fromRevision, toRevision: options.defaultRevision, upgradeToken: tokenFor(profile, options.defaultRevision) };
}

/** Resolve all conflicts from a previously analyzed profile. */
function resolvePromptUpgrade(options) {
  const analysis = migratePromptProfile(options);
  if (options.upgradeToken && options.upgradeToken !== analysis.upgradeToken) {
    const error = new Error("The prompt profile changed while the upgrade was being reviewed.");
    error.code = "stale-upgrade";
    throw error;
  }
  const strategy = String(options.strategy || "");
  const resolutions = new Map((options.resolutions || []).map((entry) => [entry.keyPath, entry]));
  if (strategy === "manual" && analysis.conflicts.some((entry) => !resolutions.has(entry.keyPath))) {
    const error = new Error("Every prompt conflict must have a resolution.");
    error.code = "incomplete-resolution";
    throw error;
  }
  const mine = flattenPrompts(analysis.profile.prompts);
  const base = flattenPrompts(analysis.profile.basePrompts);
  const theirs = flattenPrompts(options.currentDefaults);
  const retired = Object.assign({}, analysis.profile.retiredPrompts);
  for (const conflict of analysis.conflicts) {
    const resolution = strategy === "keep-user" ? { choice: "mine" }
      : strategy === "use-defaults" ? { choice: "theirs" } : resolutions.get(conflict.keyPath);
    if (!resolution || !["mine", "theirs", "merged"].includes(resolution.choice)) {
      const error = new Error(`Invalid resolution for ${conflict.keyPath}.`);
      error.code = "invalid-resolution";
      throw error;
    }
    if (conflict.removed) {
      if (resolution.choice !== "theirs") retired[conflict.keyPath] = resolution.choice === "merged"
        ? String(resolution.value || "") : String(conflict.userValue || "");
      else delete retired[conflict.keyPath];
      delete mine[conflict.keyPath];
      delete base[conflict.keyPath];
    } else {
      mine[conflict.keyPath] = resolution.choice === "theirs" ? theirs[conflict.keyPath]
        : resolution.choice === "merged" ? String(resolution.value || "") : String(conflict.userValue || "");
      base[conflict.keyPath] = theirs[conflict.keyPath];
    }
  }
  if (strategy === "use-defaults") {
    const defaults = clone(options.currentDefaults);
    return { documentType: options.documentType, schemaVersion: options.schemaVersion,
      resolvedDefaultRevision: options.defaultRevision, prompts: defaults, basePrompts: clone(defaults), retiredPrompts: {}, pendingUpgrade: null };
  }
  return { documentType: options.documentType, schemaVersion: options.schemaVersion,
    resolvedDefaultRevision: options.defaultRevision, prompts: inflatePrompts(mine), basePrompts: inflatePrompts(base),
    retiredPrompts: retired, pendingUpgrade: null };
}

module.exports = { flattenPrompts, inflatePrompts, migratePromptProfile, resolvePromptUpgrade };
