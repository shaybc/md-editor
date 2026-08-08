/** Defines deterministic extension roots for bundled, user, and workspace scopes. */

"use strict";

const path = require("node:path");

/** Return extension roots in stable discovery order. */
function getExtensionRoots(request) {
  const roots = [{ scope: "bundled", root: path.resolve(__dirname, "../../../extensions/bundled"), trustedByDefault: true }];
  if (request.profileRoot) roots.push({ scope: "user", root: path.resolve(request.profileRoot, "companion", "extensions"), trustedByDefault: false });
  if (request.workspaceRoot) roots.push({ scope: "workspace", root: path.resolve(request.workspaceRoot, ".md-editor", "companion", "extensions"), trustedByDefault: false });
  return roots;
}

module.exports = { getExtensionRoots };
