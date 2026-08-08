const assert = require("node:assert/strict");
const test = require("node:test");

const {
  GeminiConnectorClient,
  buildToolConfig,
  createGeminiConnectorProvider,
  extractGeminiParts,
  loadGeminiConnectorSettings,
  normalizeGeminiTools,
  toGeminiContents,
  usageFromGemini
} = require("../resources/ai-companion/providers/gemini-connector");
const { formatProviderDebugEvent } = require("../resources/ai-companion/core/provider-debug");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");

test("AI Companion settings preserve Gemini connector providers and fields", () => {
  const settings = normalizeAiCompanionSettings({
    providerMode: "gemini-connector-raw",
    geminiConnectorBaseUrl: " https://connector.example.com ",
    geminiConnectorId: " docs ",
    geminiConnectorApiKey: "secret",
    trustedCertificates: [{ host: "CONNECTOR.EXAMPLE.COM", port: "443", fingerprint256: "AA:BB", pem: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----" }]
  });

  assert.equal(settings.providerMode, "gemini-connector-raw");
  assert.equal(settings.geminiConnectorBaseUrl, "https://connector.example.com");
  assert.equal(settings.geminiConnectorId, "docs");
  assert.equal(settings.geminiConnectorApiKey, "secret");
  assert.equal(settings.trustedCertificates[0].host, "connector.example.com");
  assert.equal(settings.trustedCertificates[0].fingerprint256, "AA:BB");
  assert.equal(normalizeAiCompanionSettings({ providerMode: "unknown" }).providerMode, "openai-compatible");
});
test("Gemini connector settings map provider modes to connector modes", () => {
  const regular = loadGeminiConnectorSettings({
    providerMode: "gemini-connector",
    model: "models/gemini-2.5-flash",
    geminiConnectorBaseUrl: " https://connector.example.com/ ",
    geminiConnectorId: " docs ",
    geminiConnectorApiKey: "secret",
    trustedCertificates: [{ host: "CONNECTOR.EXAMPLE.COM", port: "443", fingerprint256: "AA:BB", pem: "-----BEGIN CERTIFICATE-----\\nabc\\n-----END CERTIFICATE-----" }]
  });
  assert.equal(regular.mode, "regular");
  assert.equal(regular.model, "gemini-2.5-flash");
  assert.equal(regular.baseUrl, "https://connector.example.com/");
  assert.equal(regular.connectorId, "docs");
  assert.equal(regular.apiKey, "secret");

  const raw = loadGeminiConnectorSettings({
    providerMode: "gemini-connector-raw",
    geminiConnectorBaseUrl: "https://connector.example.com",
    geminiConnectorId: "docs"
  });
  assert.equal(raw.mode, "raw");
});

test("Gemini connector client builds regular and raw connector URLs", () => {
  const client = new GeminiConnectorClient({
    baseUrl: "https://connector.example.com/",
    connectorId: "my connector",
    model: "models/gemini-2.5-flash",
    mode: "raw"
  });

  assert.equal(
    client.connectorUrl("regular"),
    "https://connector.example.com/api/connectors/my%20connector"
  );
  assert.equal(
    client.connectorUrl("raw"),
    "https://connector.example.com/api/connectors/my%20connector/v1beta/models/gemini-2.5-flash:generateContent"
  );
});

test("Gemini connector maps OpenAI-style tool turns to Gemini contents", () => {
  const { contents, system } = toGeminiContents([
    { role: "system", content: "Use tools carefully." },
    { role: "user", content: "Read package.json" },
    {
      role: "assistant",
      content: "",
      tool_calls: [{
        id: "call_read_file_0",
        type: "function",
        function: { name: "read_file", arguments: "{\"path\":\"package.json\"}" }
      }]
    },
    { role: "tool", tool_call_id: "call_read_file_0", content: "{\"ok\":true}" }
  ]);

  assert.equal(system, "Use tools carefully.");
  assert.deepEqual(contents[0], { role: "user", parts: [{ text: "Read package.json" }] });
  assert.deepEqual(contents[1], {
    role: "model",
    parts: [{ functionCall: { name: "read_file", args: { path: "package.json" } } }]
  });
  assert.deepEqual(contents[2], {
    role: "user",
    parts: [{ functionResponse: { name: "read_file", response: { ok: true } } }]
  });
});

test("Gemini connector round-trips thought signatures on their matching calls only", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      candidates: [{
        content: {
          role: "model",
          parts: [
            { functionCall: { name: "list_files", args: { maxFiles: 25 } }, thoughtSignature: "opaque-signature" },
            { functionCall: { name: "read_open_tabs", args: {} } }
          ]
        }
      }]
    })
  });

  try {
    const provider = createGeminiConnectorProvider({
      providerMode: "gemini-connector-raw",
      model: "gemini-3.5-flash-lite",
      geminiConnectorBaseUrl: "https://connector.example.com",
      geminiConnectorId: "docs"
    });
    const message = await provider.completeMessage([{ role: "user", content: "Inspect the workspace" }]);
    assert.equal(message.toolCalls[0].extra_content.google.thought_signature, "opaque-signature");
    assert.equal(Object.prototype.hasOwnProperty.call(message.toolCalls[1], "extra_content"), false);

    const { contents } = toGeminiContents([{
      role: "assistant",
      content: "",
      tool_calls: message.toolCalls
    }]);
    assert.equal(contents[0].parts[0].thoughtSignature, "opaque-signature");
    assert.equal(Object.prototype.hasOwnProperty.call(contents[0].parts[1], "thoughtSignature"), false);

    const extracted = extractGeminiParts({ parts: contents[0].parts });
    assert.equal(extracted.functionCalls[0].thoughtSignature, "opaque-signature");
  } finally {
    global.fetch = originalFetch;
  }
});

test("Gemini connector wraps array tool results for function responses", () => {
  const { contents } = toGeminiContents([
    {
      role: "assistant",
      content: "",
      tool_calls: [{
        id: "call_list_files_0",
        type: "function",
        function: { name: "list_files", arguments: "{}" }
      }]
    },
    { role: "tool", tool_call_id: "call_list_files_0", content: "[\"a.java\",\"b.java\"]" }
  ]);

  assert.deepEqual(contents[1], {
    role: "user",
    parts: [{ functionResponse: { name: "list_files", response: { content: ["a.java", "b.java"] } } }]
  });
});

test("Gemini connector normalizes tool schemas and usage metadata", () => {
  assert.deepEqual(buildToolConfig("required"), { functionCallingConfig: { mode: "ANY" } });
  const tools = normalizeGeminiTools([{
    type: "function",
    function: {
      name: "search",
      description: "Search files",
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          query: { type: "string", additionalProperties: false }
        }
      }
    }
  }]);

  // Native generateContent requires UPPERCASE type enums.
  assert.deepEqual(tools, [{
    functionDeclarations: [{
      name: "search",
      description: "Search files",
      parameters: {
        type: "OBJECT",
        properties: {
          query: { type: "STRING" }
        }
      }
    }]
  }]);

  assert.deepEqual(usageFromGemini({
    usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 }
  }), {
    promptTokens: 10,
    completionTokens: 5,
    totalTokens: 15
  });
});

test("Gemini connector drops unsupported schema keywords and guarantees a type", () => {
  const [tool] = normalizeGeminiTools([{
    type: "function",
    function: {
      name: "preferences_update",
      description: "Update prefs",
      parameters: {
        type: "object",
        required: ["changes"],
        properties: {
          changes: {
            type: "array",
            items: {
              type: "object",
              properties: {
                // pattern/minLength are unsupported by Gemini and must be dropped.
                key: { type: "string", pattern: "^[a-z.]+$", minLength: 1, maxLength: 200 },
                // A typeless polymorphic value must gain a type (string carrier).
                value: { description: "New JSON value for the preference." }
              }
            }
          }
        }
      }
    }
  }]);

  const decl = tool.functionDeclarations[0];
  const change = decl.parameters.properties.changes.items;
  assert.equal(change.properties.key.type, "STRING");
  assert.equal("pattern" in change.properties.key, false, "pattern dropped");
  assert.equal("minLength" in change.properties.key, false, "minLength dropped");
  assert.equal("maxLength" in change.properties.key, false, "maxLength dropped");
  assert.equal(change.properties.value.type, "STRING", "typeless value gains a type");
});

test("Gemini connector drops numeric/array constraint keywords from _decision-style schemas", () => {
  const [tool] = normalizeGeminiTools([{
    type: "function",
    function: {
      name: "act",
      parameters: {
        type: "object",
        properties: {
          strategyRevision: { type: "integer", minimum: 0 },
          triggerIds: { type: "array", minItems: 1, maxItems: 20, items: { type: "string" } }
        }
      }
    }
  }]);
  const props = tool.functionDeclarations[0].parameters.properties;
  assert.equal("minimum" in props.strategyRevision, false);
  assert.equal("minItems" in props.triggerIds, false);
  assert.equal("maxItems" in props.triggerIds, false);
  assert.equal(props.triggerIds.items.type, "STRING");
});

test("Gemini connector test connection emits full request debug payloads", async () => {
  const previousFetch = globalThis.fetch;
  const events = [];
  const requests = [];
  globalThis.fetch = async (url, options = {}) => {
    requests.push({ url, options });
    return {
      ok: true,
      status: 200,
      text: async () => JSON.stringify({ response: "ok" })
    };
  };

  try {
    const provider = createGeminiConnectorProvider({
      providerMode: "gemini-connector-raw",
      model: "models/gemini-2.5-flash",
      geminiConnectorBaseUrl: "https://connector.example.com",
      geminiConnectorId: "docs",
      geminiConnectorApiKey: "secret",
      debugLogFullAiPayloads: true
    });

    const result = await provider.testConnection({ onDebug: (event) => events.push(event) });

    assert.deepEqual(result, { ok: true, content: "ok" });
    assert.equal(requests.length, 1);
    assert.equal(requests[0].url, "https://connector.example.com/api/connectors/docs/v1beta/models/gemini-2.5-flash:generateContent");
    assert.equal(requests[0].options.method, "POST");
    assert.equal(requests[0].options.headers.Authorization, "Bearer secret");

    const requestEvent = events.find((event) => event.kind === "request");
    assert.equal(requestEvent.url, requests[0].url);
    assert.equal(requestEvent.method, "POST");
    assert.equal(requestEvent.requestHeaders.Authorization, "Bearer secret");
    assert.deepEqual(requestEvent.bodyKeys, ["contents", "systemInstruction", "generationConfig"]);
    assert.deepEqual(requestEvent.requestBody, JSON.parse(requests[0].options.body));

    const formattedRequest = formatProviderDebugEvent(requestEvent);
    assert.equal(formattedRequest.details.url, requests[0].url);
    assert.deepEqual(formattedRequest.details.requestBody, requestEvent.requestBody);
    assert.equal(formattedRequest.details.requestHeaders.Authorization, "[redacted]");

    const responseEvent = events.find((event) => event.kind === "response");
    assert.equal(responseEvent.responseBody, JSON.stringify({ response: "ok" }));
  } finally {
    globalThis.fetch = previousFetch;
  }
});
test("Gemini connector logs attempted request when fetch fails before response", async () => {
  const previousFetch = globalThis.fetch;
  const events = [];
  globalThis.fetch = async () => {
    const error = new TypeError("fetch failed");
    error.cause = Object.assign(new Error("getaddrinfo ENOTFOUND connector.example.com"), {
      code: "ENOTFOUND",
      errno: -3008,
      syscall: "getaddrinfo",
      hostname: "connector.example.com"
    });
    throw error;
  };

  try {
    const provider = createGeminiConnectorProvider({
      providerMode: "gemini-connector-raw",
      model: "models/gemini-2.5-flash",
      geminiConnectorBaseUrl: "https://connector.example.com",
      geminiConnectorId: "docs",
      geminiConnectorApiKey: "secret",
      debugLogFullAiPayloads: true
    });

    await assert.rejects(
      () => provider.testConnection({ onDebug: (event) => events.push(event) }),
      /fetch failed/
    );

    const errorEvent = events.find((event) => event.kind === "error");
    assert.equal(errorEvent.url, "https://connector.example.com/api/connectors/docs/v1beta/models/gemini-2.5-flash:generateContent");
    assert.equal(errorEvent.method, "POST");
    assert.equal(errorEvent.requestHeaders.Authorization, "Bearer secret");
    assert.deepEqual(errorEvent.bodyKeys, ["contents", "systemInstruction", "generationConfig"]);
    assert.equal(errorEvent.message, "fetch failed");
    assert.equal(errorEvent.errorName, "TypeError");
    assert.equal(errorEvent.errorCode, "ENOTFOUND");
    assert.equal(errorEvent.errorCause.code, "ENOTFOUND");
    assert.equal(errorEvent.errorCause.hostname, "connector.example.com");
    assert.equal(errorEvent.requestBody.contents[0].role, "user");

    const formattedError = formatProviderDebugEvent(errorEvent);
    assert.equal(formattedError.level, "error");
    assert.equal(formattedError.details.url, errorEvent.url);
    assert.equal(formattedError.details.errorCause.code, "ENOTFOUND");
    assert.deepEqual(formattedError.details.requestBody, errorEvent.requestBody);
    assert.equal(formattedError.details.requestHeaders.Authorization, "[redacted]");
  } finally {
    globalThis.fetch = previousFetch;
  }
});

test("provider debug formatting redacts native API keys and nested credentials", () => {
  const formatted = formatProviderDebugEvent({
    kind: "request",
    provider: "gemini-connector",
    requestHeaders: { "Content-Type": "application/json", "x-goog-api-key": "native-secret" },
    requestBody: { prompt: "safe", apiKey: "nested-secret", nested: { Authorization: "Bearer token-value" } }
  });
  assert.equal(formatted.details.requestHeaders["x-goog-api-key"], "[redacted]");
  assert.equal(formatted.details.requestHeaders["Content-Type"], "application/json");
  assert.equal(formatted.details.requestBody.apiKey, "[redacted]");
  assert.equal(formatted.details.requestBody.nested.Authorization, "[redacted]");
});
