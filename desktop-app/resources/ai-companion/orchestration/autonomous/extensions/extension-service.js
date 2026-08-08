/** Bridge-facing extension discovery and configuration operations. */

"use strict";

const { ExtensionFabric } = require("./extension-fabric");

/** Return redacted extension metadata for the current profile and workspace. */
async function listExtensions(request) {
  const fabric = new ExtensionFabric(request);
  return fabric.load();
}

/** Persist one enable/trust decision and return the refreshed catalog. */
async function configureExtension(request, change) {
  const fabric = new ExtensionFabric(request);
  await fabric.load();
  return fabric.configure({ id: String(change?.id || ""), enabled: change?.enabled, trusted: change?.trusted });
}

module.exports = { configureExtension, listExtensions };
