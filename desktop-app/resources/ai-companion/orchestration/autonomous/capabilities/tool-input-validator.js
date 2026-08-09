/** Minimal structural validation for model tool arguments after lifecycle rewriting. */

"use strict";

/** Validate a value against the bounded JSON-schema subset used by tool definitions. */
function validateToolInput(schema, value, location = "input") {
  if (!schema || typeof schema !== "object") return;
  if (Array.isArray(schema.anyOf) && !schema.anyOf.some((candidate) => accepts(candidate, value))) throw invalid(location, "does not match any allowed schema");
  if (Array.isArray(schema.oneOf) && schema.oneOf.filter((candidate) => accepts(candidate, value)).length !== 1) throw invalid(location, "must match exactly one allowed schema");
  if (Array.isArray(schema.enum) && !schema.enum.some((candidate) => Object.is(candidate, value))) throw invalid(location, "uses a value outside the allowed set");
  const type = schema.type;
  if (type && !matchesType(type, value)) throw invalid(location, `must be ${Array.isArray(type) ? type.join(" or ") : type}`);
  if ((type === "object" || schema.properties) && value && typeof value === "object" && !Array.isArray(value)) {
    for (const required of schema.required || []) if (!Object.prototype.hasOwnProperty.call(value, required)) throw invalid(`${location}.${required}`, "is required");
    for (const [key, item] of Object.entries(value)) {
      if (schema.properties?.[key]) validateToolInput(schema.properties[key], item, `${location}.${key}`);
      else if (schema.additionalProperties === false) throw invalid(`${location}.${key}`, "is not an allowed field");
    }
  }
  if ((type === "array" || schema.items) && Array.isArray(value) && schema.items) {
    value.forEach((item, index) => validateToolInput(schema.items, item, `${location}[${index}]`));
  }
}

function accepts(schema, value) {
  try { validateToolInput(schema, value); return true; }
  catch (_error) { return false; }
}

function matchesType(type, value) {
  const types = Array.isArray(type) ? type : [type];
  return types.some((candidate) => {
    if (candidate === "null") return value === null;
    if (candidate === "array") return Array.isArray(value);
    if (candidate === "object") return Boolean(value) && typeof value === "object" && !Array.isArray(value);
    if (candidate === "integer") return Number.isInteger(value);
    if (candidate === "number") return typeof value === "number" && Number.isFinite(value);
    return typeof value === candidate;
  });
}

function invalid(location, reason) {
  const error = new Error(`Rewritten tool ${location} ${reason}.`);
  error.code = "LIFECYCLE_TOOL_INPUT_INVALID";
  error.retryable = false;
  error.doNotRetry = true;
  return error;
}

module.exports = { validateToolInput };
