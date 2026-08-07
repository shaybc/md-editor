"use strict";

const assert = require("node:assert/strict");
const test = require("node:test");

const gemini = require("../resources/ai-companion/providers/gemini-connector");
const { GeminiConnectorClient, loadGeminiConnectorSettings, buildToolConfig } = gemini;

test("native mode loads settings from baseUrl/apiKey (no connector id required)", () => {
  const s = loadGeminiConnectorSettings({
    providerMode: "google-gemini-native",
    baseUrl: "https://generativelanguage.googleapis.com",
    apiKey: "KEY123",
    model: "gemini-3.5-flash-lite"
  });
  assert.equal(s.publicNative, true);
  assert.equal(s.baseUrl, "https://generativelanguage.googleapis.com");
  assert.equal(s.apiKey, "KEY123");
  assert.equal(s.mode, "raw");
});

test("native client builds the public generateContent URL and x-goog-api-key auth", () => {
  const client = new GeminiConnectorClient({ publicNative: true, baseUrl: "https://generativelanguage.googleapis.com", model: "gemini-3.5-flash-lite", apiKey: "KEY123" });
  assert.equal(client.connectorUrl(), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
  const headers = client.headers();
  assert.equal(headers["x-goog-api-key"], "KEY123");
  assert.equal(headers.Authorization, undefined, "native uses x-goog-api-key, not Bearer");
});

test("native client tolerates a base URL that still has the openai-compat suffix", () => {
  const client = new GeminiConnectorClient({ publicNative: true, baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai", model: "gemini-3.5-flash-lite", apiKey: "K" });
  assert.equal(client.connectorUrl(), "https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash-lite:generateContent");
});

test("native mode does NOT require a connector id (unlike the enterprise connector)", () => {
  assert.doesNotThrow(() => new GeminiConnectorClient({ publicNative: true, baseUrl: "https://x", model: "m", apiKey: "k" }));
  assert.throws(() => new GeminiConnectorClient({ publicNative: false, baseUrl: "https://x", model: "m", apiKey: "k" }), /connector ID is required/);
});

async function capturedToolConfig(nTools) {
  let captured;
  const originalFetch = global.fetch;
  global.fetch = async (_url, options) => { captured = JSON.parse(options.body); return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: "ok" }] } }] }) }; };
  try {
    const tools = Array.from({ length: nTools }, (_v, i) => ({ type: "function", function: { name: `t${i}`, parameters: { type: "object", properties: { a: { type: "string" } } } } }));
    const p = gemini.createGeminiConnectorProvider({ providerMode: "google-gemini-native", baseUrl: "https://x", apiKey: "k", model: "gemini-3.5-flash-lite" });
    await p.completeMessage([{ role: "user", content: "hi" }], { tools, toolChoice: "required" });
    return captured.toolConfig.functionCallingConfig.mode;
  } finally { global.fetch = originalFetch; }
}

test("forcing over a small tool set stays ANY; over a large roster falls back to AUTO", async () => {
  assert.equal(await capturedToolConfig(3), "ANY", "small set -> forced");
  assert.equal(await capturedToolConfig(31), "AUTO", "large roster -> fallback (flash-lite can't force so many)");
});

test("native mode supports forced tool calls (required -> functionCallingConfig ANY)", () => {
  assert.deepEqual(buildToolConfig("required"), { functionCallingConfig: { mode: "ANY" } });
});

test("forced tool calls pass allowedFunctionNames (flash-lite rejects bare mode ANY)", () => {
  // The real fix: mode ANY WITH allowedFunctionNames = all sent tools. Preserves forcing
  // (model must call one of them) while satisfying flash-lite, which 400s on bare ANY.
  assert.deepEqual(
    buildToolConfig("required", ["glob", "read_file", "git_status"]),
    { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["glob", "read_file", "git_status"] } }
  );
  // A specific forced function still works.
  assert.deepEqual(
    buildToolConfig({ type: "function", function: { name: "capture_intent_contract" } }),
    { functionCallingConfig: { mode: "ANY", allowedFunctionNames: ["capture_intent_contract"] } }
  );
});
