/** Resolves extension-owned files without allowing bundle-root escapes. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");

/** Resolve an existing contribution and reject traversal or symlink escape. */
async function resolveBundleFile(bundleRoot, relativePath) {
  const root = await fs.realpath(path.resolve(bundleRoot));
  const unresolved = path.resolve(root, String(relativePath || ""));
  if (unresolved !== root && !unresolved.startsWith(root + path.sep)) throw new Error(`Extension contribution escapes its bundle: ${relativePath}`);
  const candidate = await fs.realpath(unresolved);
  if (candidate !== root && !candidate.startsWith(root + path.sep)) throw new Error(`Extension contribution escapes its bundle: ${relativePath}`);
  const stat = await fs.stat(candidate);
  if (!stat.isFile()) throw new Error(`Extension contribution is not a file: ${relativePath}`);
  return candidate;
}

module.exports = { resolveBundleFile };
