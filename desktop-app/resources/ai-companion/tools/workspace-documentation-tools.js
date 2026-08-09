/** Focused, bounded discovery of workspace documentation entry points. */

"use strict";

const path = require("node:path");

const DOCUMENT_PATTERNS = Object.freeze([
  "README*",
  "**/README*",
  "docs/**/*",
  "**/docs/**/*",
  "documentation/**/*",
  "**/documentation/**/*",
  "help/**/*",
  "**/help/**/*",
  "wiki/**/*",
  "**/wiki/**/*",
  "guides/**/*",
  "**/guides/**/*",
  "manual/**/*",
  "**/manual/**/*"
]);
const DOCUMENT_EXTENSIONS = new Set([".adoc", ".htm", ".html", ".md", ".mdx", ".rst", ".txt"]);
const LOW_VALUE_PATH_SEGMENTS = new Set([".downloads", ".git", ".gradle", "bin", "build", "coverage", "dist", "node_modules", "out", "target", "vendor"]);
const QUERY_STOP_WORDS = new Set(["are", "can", "documentation", "docs", "find", "for", "help", "located", "show", "the", "there", "where", "wiki"]);

/** Find likely documentation files without enumerating the whole workspace. */
async function findDocumentation(root, query, options = {}, dependencies = {}) {
  const globFiles = dependencies.globFiles;
  if (typeof globFiles !== "function") throw new Error("Documentation discovery requires workspace glob support.");
  const limit = Math.max(1, Math.min(Number(options.maxResults) || 20, 50));
  const candidates = new Set();
  for (const pattern of DOCUMENT_PATTERNS) {
    const matches = await globFiles(root, pattern, { signal: options.signal, maxFiles: 500 });
    for (const file of matches) candidates.add(String(file).replace(/\\/g, "/"));
  }
  const terms = queryTerms(query);
  const ranked = Array.from(candidates)
    .filter(isDocumentationFile)
    .map((file) => ({ path: file, category: categoryFor(file), score: scorePath(file, terms) }))
    .sort((left, right) => right.score - left.score || left.path.localeCompare(right.path));
  return {
    results: ranked.slice(0, limit),
    returned: Math.min(ranked.length, limit),
    truncated: ranked.length > limit,
    searchedLocations: ["README files", "docs", "documentation", "help", "wiki", "guides", "manual"]
  };
}

function isDocumentationFile(file) {
  const segments = String(file).toLowerCase().split("/");
  if (segments.some((segment) => LOW_VALUE_PATH_SEGMENTS.has(segment))) return false;
  return /^readme(?:\.|$)/i.test(path.posix.basename(file)) || DOCUMENT_EXTENSIONS.has(path.posix.extname(file).toLowerCase());
}

function categoryFor(file) {
  const normalized = `/${file.toLowerCase()}`;
  for (const category of ["wiki", "help", "docs", "documentation", "guides", "manual"]) {
    if (normalized.includes(`/${category}/`)) return category;
  }
  return /^readme(?:\.|$)/i.test(path.posix.basename(file)) ? "readme" : "documentation";
}

function queryTerms(query) {
  return Array.from(new Set(String(query || "").toLowerCase().match(/[a-z0-9_.-]{3,}/g) || []))
    .filter((term) => !QUERY_STOP_WORDS.has(term));
}

function scorePath(file, terms) {
  const normalized = file.toLowerCase();
  const baseName = path.posix.basename(normalized);
  let score = /^readme(?:\.|$)/i.test(baseName) ? 10 : 0;
  if (/(^|\/)index\.(md|mdx|html?|txt|rst|adoc)$/i.test(normalized)) score += 8;
  if (/\/(help|docs|documentation|wiki|guides|manual)\//i.test(`/${normalized}`)) score += 6;
  for (const term of terms) if (normalized.includes(term)) score += 12;
  return score;
}

module.exports = { DOCUMENT_PATTERNS, findDocumentation };
