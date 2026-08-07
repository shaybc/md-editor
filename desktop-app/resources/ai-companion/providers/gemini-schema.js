/**
 * Shared Gemini function-declaration schema sanitizer.
 *
 * Gemini's function-calling schema (native API *and* the OpenAI-compat endpoint) accepts
 * only an OpenAPI-3 subset. Fields outside that set — pattern, minLength/maxLength,
 * minItems/maxItems, minimum/maximum, default, examples, $schema, additionalProperties,
 * title, … — cause an INVALID_ARGUMENT rejection of the whole request, and every schema
 * node must carry a `type`. We allow-list the supported keys and guarantee a type rather
 * than forwarding raw JSON Schema.
 *
 * Both providers use this: the native gemini-connector, and the openai-compatible
 * provider when it targets a Gemini endpoint (providerMode "google-gemini").
 *
 * Pure module: no IO, no side effects.
 */

"use strict";

const GEMINI_SCHEMA_KEYS = new Set(["type", "description", "enum", "items", "properties", "required", "nullable"]);

function inferGeminiSchemaType(node) {
  if (node.properties && typeof node.properties === "object") return "object";
  if (node.items) return "array";
  // A typeless leaf (e.g. a polymorphic value) has no Gemini representation for "any";
  // string is the safe carrier. Preference writers coerce string values back.
  return "string";
}

/** Sanitize a JSON-Schema node into a Gemini-acceptable one. */
function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (!GEMINI_SCHEMA_KEYS.has(key)) continue;
    if (key === "properties" && value && typeof value === "object") {
      const properties = {};
      for (const [propName, propSchema] of Object.entries(value)) properties[propName] = sanitizeGeminiSchema(propSchema);
      result.properties = properties;
    } else if (key === "items") {
      result.items = sanitizeGeminiSchema(value);
    } else {
      result[key] = value;
    }
  }
  if (!result.type) result.type = inferGeminiSchemaType(result);
  return result;
}

const GEMINI_TYPE_MAP = Object.freeze({
  string: "STRING", number: "NUMBER", integer: "INTEGER",
  boolean: "BOOLEAN", array: "ARRAY", object: "OBJECT"
});

/**
 * The NATIVE Gemini generateContent Schema requires UPPERCASE `type` enum values
 * (STRING, OBJECT, ARRAY, …). OpenAI-style lowercase ("string") is rejected with
 * INVALID_ARGUMENT. Deep-map every `type` value to its uppercase enum. Used for the
 * native connector only — the OpenAI-compat shim keeps lowercase. Returns a new object.
 */
function uppercaseGeminiSchemaTypes(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(uppercaseGeminiSchemaTypes);
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "type" && typeof value === "string") {
      result.type = GEMINI_TYPE_MAP[value.toLowerCase()] || value.toUpperCase();
    } else if (value && typeof value === "object") {
      result[key] = uppercaseGeminiSchemaTypes(value);
    } else {
      result[key] = value;
    }
  }
  // Native Gemini rejects an OBJECT with no properties and an ARRAY with no items.
  // Represent a freeform object as a JSON string, and an untyped array as string items.
  if (result.type === "OBJECT" && (!result.properties || Object.keys(result.properties).length === 0)) {
    const description = result.description ? `${result.description} (provide as a JSON string)` : "A JSON object, provided as a string.";
    return { type: "STRING", description };
  }
  if (result.type === "ARRAY" && !result.items) {
    result.items = { type: "STRING" };
  }
  return result;
}

/** True when a base URL points at a Gemini (Generative Language) endpoint. */
function isGeminiEndpoint(baseUrl, providerMode) {
  if (String(providerMode || "").toLowerCase().includes("gemini") || String(providerMode || "").toLowerCase().includes("google")) return true;
  return /generativelanguage\.googleapis\.com/i.test(String(baseUrl || ""));
}

/**
 * Sanitize an array of OpenAI-format tool definitions for a Gemini endpoint, rewriting
 * each function's `parameters` schema. Returns a new array; input is not mutated.
 */
function sanitizeOpenAiToolsForGemini(tools) {
  if (!Array.isArray(tools)) return tools;
  return tools.map((tool) => {
    if (!tool || tool.type !== "function" || !tool.function) return tool;
    return {
      ...tool,
      function: {
        ...tool.function,
        parameters: sanitizeGeminiSchema(tool.function.parameters)
      }
    };
  });
}

const NATIVE_TYPES = new Set(["STRING", "NUMBER", "INTEGER", "BOOLEAN", "ARRAY", "OBJECT"]);
const NATIVE_SCHEMA_KEYS = new Set(["type", "description", "enum", "items", "properties", "required", "nullable", "format"]);

/**
 * Lint a native (uppercased) Gemini schema node, returning human-readable issues. Used
 * only to diagnose opaque INVALID_ARGUMENT rejections — not on the hot path.
 */
function lintGeminiNativeSchema(node, path, issues) {
  if (!node || typeof node !== "object") return issues;
  for (const key of Object.keys(node)) {
    if (!NATIVE_SCHEMA_KEYS.has(key)) issues.push(`${path}: unexpected key '${key}'`);
  }
  if (node.type !== undefined && !NATIVE_TYPES.has(node.type)) issues.push(`${path}: bad type '${node.type}'`);
  if (node.type === "ARRAY" && !node.items) issues.push(`${path}: ARRAY without items`);
  if (node.type === "OBJECT" && (!node.properties || Object.keys(node.properties).length === 0)) issues.push(`${path}: OBJECT without properties`);
  if (node.enum && node.type !== "STRING") issues.push(`${path}: enum on non-STRING type '${node.type}'`);
  if (node.properties) for (const [k, v] of Object.entries(node.properties)) lintGeminiNativeSchema(v, `${path}.${k}`, issues);
  if (node.items) lintGeminiNativeSchema(node.items, `${path}[]`, issues);
  return issues;
}

/** Lint an array of native functionDeclarations; returns { name, issues } for offenders. */
function lintGeminiNativeTools(toolsArray) {
  const out = [];
  for (const tool of (Array.isArray(toolsArray) ? toolsArray : [])) {
    for (const decl of (tool?.functionDeclarations || [])) {
      const issues = lintGeminiNativeSchema(decl.parameters, decl.name, []);
      if (issues.length) out.push({ name: decl.name, issues });
    }
  }
  return out;
}

/**
 * Gemini's OpenAI-compat endpoint accepts "auto"/"none"/a specific function for
 * tool_choice, but not the newer "required" value (it 400s with INVALID_ARGUMENT).
 * Map "required" -> "auto"; the caller's controller still validates that a function was
 * actually called, so forcing semantics are preserved. Everything else passes through.
 */
function coerceGeminiToolChoice(toolChoice) {
  return toolChoice === "required" ? "auto" : toolChoice;
}

module.exports = { sanitizeGeminiSchema, uppercaseGeminiSchemaTypes, isGeminiEndpoint, sanitizeOpenAiToolsForGemini, coerceGeminiToolChoice, lintGeminiNativeTools, lintGeminiNativeSchema };
