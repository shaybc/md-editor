/** Validates declarative external capability server configurations. */

"use strict";

const path = require("node:path");

/** Normalize one stdio or Streamable HTTP server definition. */
function normalizeServerConfiguration(entry) {
  const source = entry?.metadata || entry || {};
  const id = String(source.id || entry?.localId || "").trim().toLowerCase();
  if (!/^[a-z0-9][a-z0-9._-]{1,79}$/.test(id)) throw new Error("External server id is invalid.");
  const transport = source.transport === "http" ? "http" : (source.transport === "stdio" ? "stdio" : "");
  if (!transport) throw new Error(`External server '${id}' requires transport stdio or http.`);
  const common = { id, extensionId: entry?.extensionId || "", name: String(source.name || id), description: String(source.description || ""), transport };
  if (transport === "http") {
    const url = new URL(String(source.url || ""));
    const isLocal = ["localhost", "127.0.0.1", "::1"].includes(url.hostname);
    if (url.protocol !== "https:" && !(url.protocol === "http:" && isLocal)) throw new Error(`External server '${id}' must use HTTPS unless it is local.`);
    return { ...common, url: url.href, headers: normalizeRecord(source.headers) };
  }
  const command = String(source.command || "").trim();
  if (!command) throw new Error(`External server '${id}' requires a command.`);
  return { ...common, command, args: normalizeArray(source.args), cwd: String(source.cwd || ""), env: normalizeRecord(source.env) };
}

function normalizeArray(value) { return Array.isArray(value) ? value.map(String) : []; }
function normalizeRecord(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [String(key), String(item)]));
}

/** Resolve a configured working directory inside the workspace. */
function resolveServerCwd(configuration, workspaceRoot) {
  return path.resolve(workspaceRoot, configuration.cwd || ".");
}

module.exports = { normalizeServerConfiguration, resolveServerCwd };
