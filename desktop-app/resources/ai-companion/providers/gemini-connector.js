/**
 * Gemini Connector provider adapter.
 */

"use strict";

const https = require("node:https");
const { getTrustedCertificatesForUrl, normalizeTrustedCertificates } = require("../core/tls-certificate");

let UndiciAgent = null;
try {
  UndiciAgent = require("undici").Agent;
} catch (_error) {
  UndiciAgent = null;
}

function normalizeConnectorMode(value) {
  return String(value || "").trim().toLowerCase() === "raw" ? "raw" : "regular";
}

function normalizeModelName(value, fallback = "gemini-2.5-flash") {
  const model = String(value || "").trim() || fallback;
  return model.startsWith("models/") ? model.slice("models/".length) : model;
}

function createProviderError(status, bodyText, prefix) {
  let message = bodyText || `${prefix} failed with HTTP ${status}.`;
  try {
    const parsed = JSON.parse(bodyText || "{}");
    message = parsed?.error?.message || parsed?.error || parsed?.message || message;
  } catch (_error) {
    // Keep the raw body text when the connector returns non-JSON errors.
  }
  const error = new Error(`${prefix} failed: ${status} ${message}`);
  error.providerStatus = status;
  error.providerBody = bodyText;
  return error;
}

function serializeFetchErrorCause(cause) {
  if (!cause) return undefined;
  if (typeof cause !== "object") return String(cause);
  const details = {};
  for (const key of ["name", "message", "code", "errno", "syscall", "hostname", "address", "port"]) {
    if (typeof cause[key] !== "undefined") details[key] = cause[key];
  }
  return Object.keys(details).length ? details : String(cause);
}

function getTrustedCertificateCa(trustedCertificates) {
  const certificates = normalizeTrustedCertificates(trustedCertificates);
  return certificates.length ? certificates.map((certificate) => certificate.pem).join("\n") : "";
}

function sendTrustedHttpsRequest(url, options, ca) {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:") throw new Error("Trusted certificate requests require HTTPS.");
  return new Promise((resolve, reject) => {
    const chunks = [];
    const requestBody = String(options.body || "");
    const requestOptions = {
      method: options.method || "POST",
      headers: options.headers || {},
      timeout: 60000,
      ca,
      servername: parsed.hostname
    };
    const request = https.request(parsed, requestOptions, (response) => {
      response.on("data", (chunk) => chunks.push(Buffer.from(chunk)));
      response.on("end", () => {
        const bodyText = Buffer.concat(chunks).toString("utf8");
        const status = Number(response.statusCode || 0);
        resolve({
          ok: status >= 200 && status < 300,
          status,
          text: async () => bodyText
        });
      });
    });
    const abort = () => request.destroy(new Error("AI Companion request cancelled."));
    options.signal?.addEventListener?.("abort", abort, { once: true });
    request.on("error", reject);
    request.on("close", () => options.signal?.removeEventListener?.("abort", abort));
    if (requestBody) request.write(requestBody);
    request.end();
  });
}

function fetchWithTrustedCertificates(url, options, trustedCertificates) {
  const ca = getTrustedCertificateCa(trustedCertificates);
  if (!ca) return fetch(url, options);
  if (UndiciAgent) {
    return fetch(url, {
      ...options,
      dispatcher: new UndiciAgent({ connect: { ca } })
    });
  }
  return sendTrustedHttpsRequest(url, options, ca);
}

function buildRawGeminiBody({ prompt, contents, generationConfig, system, tools, toolConfig }) {
  const resolvedContents = Array.isArray(contents) && contents.length
    ? contents
    : [{ role: "user", parts: [{ text: String(prompt || "") }] }];

  return {
    contents: resolvedContents,
    ...(system && String(system).trim() ? { systemInstruction: { parts: [{ text: String(system) }] } } : {}),
    ...(generationConfig ? { generationConfig } : {}),
    ...(tools ? { tools } : {}),
    ...(toolConfig ? { toolConfig } : {})
  };
}

function extractGeminiParts(content) {
  const parts = Array.isArray(content?.parts) ? content.parts : [];
  let text = "";
  const functionCalls = [];

  for (const part of parts) {
    if (part?.text) text += part.text;
    if (part?.functionCall?.name) {
      functionCalls.push({
        ...part.functionCall,
        ...(part.thoughtSignature ? { thoughtSignature: part.thoughtSignature } : {})
      });
    }
  }

  return { text, functionCalls };
}

class GeminiConnectorClient {
  constructor({
    apiKey,
    model,
    connectorId,
    baseUrl,
    mode = "raw",
    textParam = "text",
    trustedCertificates = [],
    onDebug
  } = {}) {
    if (!connectorId) throw new Error("Gemini connector ID is required.");
    if (!baseUrl) throw new Error("Gemini connector base URL is required.");

    this.apiKey = String(apiKey || "");
    this.model = normalizeModelName(model);
    this.connectorId = String(connectorId || "").trim();
    this.baseUrl = String(baseUrl || "").replace(/\/+$/, "");
    this.mode = normalizeConnectorMode(mode);
    this.textParam = textParam;
    this.trustedCertificates = normalizeTrustedCertificates(trustedCertificates);
    this.onDebug = typeof onDebug === "function" ? onDebug : null;
  }

  connectorUrl(mode = this.mode) {
    const connectorPath = `/api/connectors/${encodeURIComponent(this.connectorId)}`;
    const rawSuffix = `/v1beta/models/${encodeURIComponent(this.model)}:generateContent`;
    return `${this.baseUrl}${connectorPath}${mode === "raw" ? rawSuffix : ""}`;
  }

  headers() {
    return {
      "Content-Type": "application/json",
      ...(this.apiKey ? { Authorization: `Bearer ${this.apiKey}` } : {})
    };
  }

  async generateText({ prompt, contents, generationConfig, system, tools, toolConfig } = {}, options = {}) {
    if (typeof fetch !== "function") {
      throw new Error("This Node.js runtime does not provide fetch.");
    }

    const url = this.connectorUrl();
    const body = this.mode === "raw"
      ? buildRawGeminiBody({ prompt, contents, generationConfig, system, tools, toolConfig })
      : this.buildRegularBody({ prompt, contents, system, generationConfig });
    const requestHeaders = this.headers();
    const trustedCertificates = getTrustedCertificatesForUrl(this.trustedCertificates, url);

    this.onDebug?.({
      kind: "request",
      provider: "gemini-connector",
      url,
      method: "POST",
      mode: this.mode,
      model: this.model,
      bodyKeys: Object.keys(body),
      trustedCertificateFingerprints: trustedCertificates.map((certificate) => certificate.fingerprint256),
      requestHeaders,
      requestBody: body
    });

    let response;
    try {
      response = await fetchWithTrustedCertificates(url, {
        method: "POST",
        signal: options.signal,
        headers: requestHeaders,
        body: JSON.stringify(body)
      }, trustedCertificates);
    } catch (error) {
      this.onDebug?.({
        kind: "error",
        provider: "gemini-connector",
        url,
        method: "POST",
        mode: this.mode,
        model: this.model,
        message: error?.message || String(error),
        errorName: error?.name,
        errorCode: error?.code || error?.cause?.code,
        errorCause: serializeFetchErrorCause(error?.cause),
        bodyKeys: Object.keys(body),
        requestHeaders,
        requestBody: body
      });
      throw error;
    }

    const bodyText = await response.text();
    this.onDebug?.({
      kind: "response",
      provider: "gemini-connector",
      url,
      mode: this.mode,
      status: response.status,
      ok: response.ok,
      responseBody: bodyText
    });

    if (!response.ok) {
      throw createProviderError(response.status, bodyText, "Gemini connector generateContent");
    }

    const parsed = JSON.parse(bodyText || "{}");
    return this.normalizeToGeminiResponse(parsed);
  }

  async *streamGenerateText(request = {}, options = {}) {
    const response = await this.generateText(request, options);
    const { text, functionCalls } = extractGeminiParts(response?.candidates?.[0]?.content);
    if (text || functionCalls.length) yield { text, functionCalls };
  }

  async listModels() {
    return {
      models: [{
        name: `models/${this.model}`,
        displayName: this.model,
        description: "Model served through Gemini Connector",
        supportedGenerationMethods: ["generateContent"]
      }]
    };
  }

  buildRegularBody({ prompt, contents, system, generationConfig }) {
    const text = this.flattenContents({ prompt, contents, system });
    const body = { [this.textParam]: text };
    if (generationConfig && typeof generationConfig === "object") {
      if (generationConfig.temperature !== undefined) body.temperature = generationConfig.temperature;
      if (generationConfig.topP !== undefined) body.topP = generationConfig.topP;
      if (generationConfig.topK !== undefined) body.topK = generationConfig.topK;
      if (generationConfig.maxOutputTokens !== undefined) body.maxOutputTokens = generationConfig.maxOutputTokens;
    }
    return body;
  }

  flattenContents({ prompt, contents, system }) {
    const parts = [];
    if (system && String(system).trim()) parts.push(`[System]: ${String(system).trim()}`);
    if (Array.isArray(contents) && contents.length) {
      for (const turn of contents) {
        const role = turn.role === "model" ? "assistant" : (turn.role || "user");
        const text = (Array.isArray(turn.parts) ? turn.parts : [])
          .map((part) => typeof part?.text === "string" ? part.text : "")
          .join("");
        if (text.trim()) parts.push(contents.length === 1 ? text : `${role}: ${text}`);
      }
    } else if (prompt) {
      parts.push(String(prompt));
    }
    return parts.join("\n\n");
  }

  normalizeToGeminiResponse(payload) {
    if (Array.isArray(payload?.candidates)) return payload;
    if (payload?.response && typeof payload.response === "object" && Array.isArray(payload.response.candidates)) {
      return payload.response;
    }

    const text = typeof payload?.response === "string" ? payload.response : String(payload?.response ?? "");
    return {
      candidates: [{
        content: { role: "model", parts: [{ text }] },
        finishReason: "STOP",
        safetyRatings: []
      }],
      usageMetadata: {
        promptTokenCount: 0,
        candidatesTokenCount: 0,
        totalTokenCount: 0
      }
    };
  }
}

function isGeminiProviderMode(settings) {
  return settings?.providerMode === "gemini-connector" || settings?.providerMode === "gemini-connector-raw";
}

function resolveConnectorBaseUrl(settings) {
  const connectorBaseUrl = String(settings?.geminiConnectorBaseUrl || "").trim();
  if (connectorBaseUrl) return connectorBaseUrl;
  return isGeminiProviderMode(settings) ? "" : String(settings?.baseUrl || "").trim();
}

function resolveConnectorApiKey(settings) {
  const connectorApiKey = String(settings?.geminiConnectorApiKey || "");
  if (connectorApiKey) return connectorApiKey;
  return isGeminiProviderMode(settings) ? "" : String(settings?.apiKey || "");
}
function resolveConnectorMode(settings) {
  if (settings?.providerMode === "gemini-connector-raw") return "raw";
  if (settings?.providerMode === "gemini-connector") return "regular";
  return normalizeConnectorMode(settings?.geminiConnectorMode || settings?.mode || "raw");
}

function loadGeminiConnectorSettings(source = {}) {
  const settings = source && typeof source === "object" && !Array.isArray(source) ? source : {};
  return {
    model: normalizeModelName(settings.model || settings.geminiConnectorModel),
    connectorId: String(settings.geminiConnectorId || settings.connectorId || "").trim(),
    baseUrl: resolveConnectorBaseUrl(settings),
    apiKey: resolveConnectorApiKey(settings),
    mode: resolveConnectorMode(settings),
    temperature: Number.isFinite(Number(settings.temperature)) ? Number(settings.temperature) : 0.2,
    maxTokens: Number.isFinite(Number(settings.maxTokens)) ? Number(settings.maxTokens) : 2000,
    debugLogFullAiPayloads: settings.debugLogFullAiPayloads === true,
    trustedCertificates: normalizeTrustedCertificates(settings.trustedCertificates)
  };
}

function cleanUndefined(value) {
  return Object.fromEntries(Object.entries(value).filter(([, entry]) => entry !== undefined));
}

function normalizeContentText(content) {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((part) => {
      if (typeof part === "string") return part;
      if (typeof part?.text === "string") return part.text;
      return JSON.stringify(part);
    }).join("\n");
  }
  if (content == null) return "";
  return String(content);
}

function parseToolResponseContent(content) {
  if (content && typeof content === "object" && !Array.isArray(content)) return content;
  const text = normalizeContentText(content);
  try {
    const parsed = JSON.parse(text);
    return parsed && typeof parsed === "object" && !Array.isArray(parsed) ? parsed : { content: parsed };
  } catch (_error) {
    return { content: text };
  }
}

function parseToolCallName(message) {
  if (message.name) return String(message.name);
  const toolCallId = String(message.tool_call_id || "");
  const match = /^call_(.+)_\d+$/.exec(toolCallId);
  return match ? match[1] : "tool";
}

function toGeminiContents(messages = []) {
  const contents = [];
  let system = "";

  for (const message of messages) {
    if (!message || typeof message !== "object") continue;
    if (message.role === "system") {
      const text = normalizeContentText(message.content).trim();
      if (text) system = system ? `${system}\n\n${text}` : text;
      continue;
    }

    if (message.role === "tool") {
      contents.push({
        role: "user",
        parts: [{
          functionResponse: {
            name: parseToolCallName(message),
            response: parseToolResponseContent(message.content)
          }
        }]
      });
      continue;
    }

    if (message.role === "assistant" && Array.isArray(message.tool_calls) && message.tool_calls.length) {
      const parts = [];
      const text = normalizeContentText(message.content);
      if (text.trim()) parts.push({ text });
      for (const call of message.tool_calls) {
        if (call?.type !== "function" || !call.function?.name) continue;
        let args = {};
        try {
          args = typeof call.function.arguments === "string"
            ? JSON.parse(call.function.arguments || "{}")
            : (call.function.arguments || {});
        } catch (_error) {
          args = { __raw: String(call.function.arguments ?? "") };
        }
        const thoughtSignature = call?.extra_content?.google?.thought_signature;
        parts.push({
          functionCall: { name: call.function.name, args },
          ...(thoughtSignature ? { thoughtSignature } : {})
        });
      }
      if (parts.length) contents.push({ role: "model", parts });
      continue;
    }

    const text = normalizeContentText(message.content);
    if (!text.trim()) continue;
    contents.push({
      role: message.role === "assistant" ? "model" : "user",
      parts: [{ text }]
    });
  }

  return { contents, system };
}

function sanitizeGeminiSchema(schema) {
  if (!schema || typeof schema !== "object") return schema;
  if (Array.isArray(schema)) return schema.map(sanitizeGeminiSchema);
  const result = {};
  for (const [key, value] of Object.entries(schema)) {
    if (key === "additionalProperties") continue;
    result[key] = sanitizeGeminiSchema(value);
  }
  return result;
}

function normalizeGeminiTools(tools) {
  if (!Array.isArray(tools) || !tools.length) return undefined;
  const functionDeclarations = tools
    .map((tool) => {
      if (tool?.type !== "function" || !tool.function?.name) return null;
      return {
        name: tool.function.name,
        description: tool.function.description,
        parameters: sanitizeGeminiSchema(tool.function.parameters)
      };
    })
    .filter(Boolean);
  return functionDeclarations.length ? [{ functionDeclarations }] : undefined;
}

function buildToolConfig(toolChoice) {
  if (!toolChoice) return undefined;
  if (toolChoice === "none") return { functionCallingConfig: { mode: "NONE" } };
  if (toolChoice === "auto") return { functionCallingConfig: { mode: "AUTO" } };
  if (toolChoice === "required") return { functionCallingConfig: { mode: "ANY" } };
  if (toolChoice?.type === "function" && toolChoice?.function?.name) {
    return {
      functionCallingConfig: {
        mode: "ANY",
        allowedFunctionNames: [toolChoice.function.name]
      }
    };
  }
  return undefined;
}

function toOpenAiToolCalls(functionCalls) {
  return functionCalls.map((call, index) => ({
    id: `call_${call.name}_${index}`,
    type: "function",
    function: {
      name: call.name,
      arguments: JSON.stringify(call.args ?? {})
    },
    ...(call.thoughtSignature ? {
      extra_content: {
        google: { thought_signature: call.thoughtSignature }
      }
    } : {})
  }));
}

function usageFromGemini(response) {
  const usage = response?.usageMetadata || {};
  const promptTokens = Number(usage.promptTokenCount);
  const completionTokens = Number(usage.candidatesTokenCount);
  const totalTokens = Number(usage.totalTokenCount);
  if (!Number.isFinite(promptTokens) && !Number.isFinite(completionTokens) && !Number.isFinite(totalTokens)) return null;
  const prompt = Number.isFinite(promptTokens) ? promptTokens : 0;
  const completion = Number.isFinite(completionTokens) ? completionTokens : 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : prompt + completion
  };
}

function createGeminiConnectorProvider(settingsSource = {}) {
  const settings = loadGeminiConnectorSettings(settingsSource);

  function createClient(onDebug) {
    return new GeminiConnectorClient({
      apiKey: settings.apiKey,
      model: settings.model,
      connectorId: settings.connectorId,
      baseUrl: settings.baseUrl,
      mode: settings.mode,
      trustedCertificates: settings.trustedCertificates,
      onDebug: settings.debugLogFullAiPayloads ? onDebug : (event) => {
        if (!onDebug) return;
        const safeEvent = { ...event };
        if (safeEvent.requestBody && typeof safeEvent.requestBody === "object") safeEvent.bodyKeys = Object.keys(safeEvent.requestBody);
        if (typeof safeEvent.responseBody === "string" && safeEvent.ok === false) safeEvent.error = safeEvent.responseBody.slice(0, 300);
        delete safeEvent.requestBody;
        delete safeEvent.responseBody;
        delete safeEvent.requestHeaders;
        onDebug(safeEvent);
      }
    });
  }

  async function completeMessage(messages, options = {}) {
    const { contents, system } = toGeminiContents(messages);
    const client = createClient(options.onDebug);
    const response = await client.generateText({
      contents,
      system,
      generationConfig: cleanUndefined({
        temperature: Number.isFinite(options.temperature) ? options.temperature : settings.temperature,
        maxOutputTokens: Number.isFinite(options.maxTokens) ? options.maxTokens : settings.maxTokens
      }),
      tools: normalizeGeminiTools(options.tools),
      toolConfig: buildToolConfig(options.toolChoice)
    }, { signal: options.signal });

    const { text, functionCalls } = extractGeminiParts(response?.candidates?.[0]?.content);
    const usage = usageFromGemini(response);
    if (usage) options.onUsage?.(usage);
    const finishReason = functionCalls.length ? "tool_calls" : "stop";
    options.onFinishReason?.(finishReason);

    return {
      role: "assistant",
      content: text,
      reasoning: "",
      finishReason,
      toolCalls: toOpenAiToolCalls(functionCalls)
    };
  }

  async function complete(messages, options = {}) {
    const message = await completeMessage(messages, options);
    if (message.content && typeof options.onToken === "function") options.onToken(message.content);
    return String(message.content || "").trim();
  }

  async function completeRaw(prompt, options = {}) {
    const client = createClient(options.onDebug);
    const response = await client.generateText({
      prompt,
      generationConfig: cleanUndefined({
        temperature: Number.isFinite(options.temperature) ? options.temperature : settings.temperature,
        maxOutputTokens: Number.isFinite(options.maxTokens) ? options.maxTokens : settings.maxTokens
      })
    }, { signal: options.signal });
    const { text } = extractGeminiParts(response?.candidates?.[0]?.content);
    options.onFinishReason?.("stop");
    return String(text || "").trim();
  }

  async function testConnection(options = {}) {
    const content = await complete([
      { role: "system", content: "Reply with exactly: ok" },
      { role: "user", content: "Connection test." }
    ], { maxTokens: 8, temperature: 0, signal: options.signal, onDebug: options.onDebug });
    return { ok: true, content };
  }

  return {
    complete,
    completeMessage,
    completeRaw,
    testConnection
  };
}

module.exports = {
  GeminiConnectorClient,
  buildRawGeminiBody,
  buildToolConfig,
  createGeminiConnectorProvider,
  extractGeminiParts,
  loadGeminiConnectorSettings,
  normalizeConnectorMode,
  normalizeGeminiTools,
  normalizeModelName,
  toGeminiContents,
  usageFromGemini
};
