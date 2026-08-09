/** Validation policy for persistent user-command definitions. */

"use strict";

const { normalizeId } = require("./markdown-definition");

const COMMAND_TYPES = new Set(["workflow", "tool", "prompt", "application-action"]);
const MODES = new Set(["chat", "plan", "agent"]);

/** Validate and normalize one persistent command definition. */
function normalizeExtensionCommand(entry) {
  const source = entry?.metadata || entry || {};
  const id = normalizeId(source.id);
  const name = String(source.name || "").trim();
  const description = String(source.description || "").trim();
  const type = String(source.type || "prompt").trim();
  if (!id || !name || !description) throw new Error("Extension commands require id, name, and description.");
  if (!COMMAND_TYPES.has(type)) throw new Error(`Extension command '${id}' uses unsupported type '${type}'.`);
  const target = String(source.target || "").trim();
  if (type !== "prompt" && !target) throw new Error(`Extension command '${id}' requires a target.`);
  return {
    id, name, description, type, target,
    aliases: list(source.aliases).map((alias) => normalizeId(alias)).filter(Boolean),
    argumentHint: String(source.argumentHint || "").trim(),
    allowedModes: normalizeModes(source.allowedModes),
    requiredCapability: String(source.requiredCapability || "").trim(),
    modelInvocable: source.modelInvocable === true
  };
}

function normalizeModes(value) { const modes = list(value).filter((mode) => MODES.has(mode)); return modes.length ? modes : ["chat", "plan", "agent"]; }
function list(value) { return Array.isArray(value) ? value.map(String).map((item) => item.trim()).filter(Boolean) : []; }

module.exports = { COMMAND_TYPES, normalizeExtensionCommand };
