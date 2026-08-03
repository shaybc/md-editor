"use strict";

/* Analysis-only Kotlin ABI classpath mapping for private AJDT module models. */
const fs = require("node:fs");
const path = require("node:path");

/**
 * Add ABI JARs only to the AJDT model whose project root owns each Kotlin source set.
 * @param {Array<object>} models - Gradle-derived AJDT module models.
 * @param {object|null} snapshot - Current sanitized Kotlin ABI snapshot.
 * @returns {Array<object>} New models whose Gradle classpaths remain otherwise unchanged.
 */
function mergeKotlinAbiClasspaths(models, snapshot) {
  const entries = Array.isArray(snapshot?.entries) ? snapshot.entries : [];
  return (models || []).map((model) => {
    const projectRoot = path.resolve(model.projectRoot);
    const abiJars = entries.filter((entry) => {
      try { return path.resolve(fileUriToPath(entry.projectUri)) === projectRoot; }
      catch (_error) { return false; }
    }).map((entry) => fileUriToPath(entry.jarUri)).filter((entry) => fs.existsSync(entry));
    return { ...model, classpath: Array.from(new Set([...(model.classpath || []), ...abiJars])) };
  });
}

/** Convert a file URI into the local path consumed by the private Eclipse process. */
function fileUriToPath(uri) {
  const url = new URL(String(uri || ""));
  let filePath = decodeURIComponent(url.pathname || "");
  if (/^\/[A-Za-z]:/.test(filePath)) filePath = filePath.slice(1);
  return path.resolve(filePath);
}

module.exports = { mergeKotlinAbiClasspaths, fileUriToPath };
