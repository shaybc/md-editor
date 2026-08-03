/**
 * OpenAI-compatible chat-completions provider adapter.
 */

"use strict";

const { TextDecoder } = require("node:util");
const { createRateLimitRetryPlan } = require("./rate-limit-retry");

function joinEndpoint(baseUrl, path) {
  const base = String(baseUrl || "").replace(/\/+$/, "");
  return `${base}${path}`;
}

function parseProviderError(status, body) {
  try {
    const parsed = JSON.parse(body || "{}");
    const value = Array.isArray(parsed) ? parsed[0] : parsed;
    return value?.error?.message || value?.message || `Provider request failed with HTTP ${status}.`;
  } catch (_error) {
    return body || `Provider request failed with HTTP ${status}.`;
  }
}

function isProviderTokenLimitMessage(message) {
  return /max[_\s-]*tokens?|output limit|token limit|context length|finish(?:ed)? the message/i.test(String(message || ""));
}

function createProviderRequestError(status, body) {
  const message = parseProviderError(status, body);
  const error = new Error(message);
  error.providerStatus = status;
  if (isProviderTokenLimitMessage(message)) error.aiStopReason = "max_tokens";
  return error;
}

/**
 * Normalize the OpenAI-style `usage` block found on chat/completions responses (and on the
 * final streamed chunk when `stream_options.include_usage` is honored). Returns null when the
 * payload has no usable numbers so callers can fall back to the chars/4 estimate instead of
 * reporting a bogus zero.
 */
function parseUsagePayload(usage) {
  if (!usage || typeof usage !== "object") return null;
  const promptTokens = Number(usage.prompt_tokens);
  const completionTokens = Number(usage.completion_tokens);
  const totalTokens = Number(usage.total_tokens);
  if (!Number.isFinite(promptTokens) && !Number.isFinite(completionTokens) && !Number.isFinite(totalTokens)) return null;
  const prompt = Number.isFinite(promptTokens) ? promptTokens : 0;
  const completion = Number.isFinite(completionTokens) ? completionTokens : 0;
  return {
    promptTokens: prompt,
    completionTokens: completion,
    totalTokens: Number.isFinite(totalTokens) ? totalTokens : prompt + completion
  };
}

const MAX_PROVIDER_REQUEST_DELAY_MS = 60000;
let providerRequestQueue = Promise.resolve();
let nextProviderRequestAt = 0;

function clampDelayMs(value, fallback, min = 0, max = MAX_PROVIDER_REQUEST_DELAY_MS) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function sleep(ms, signal) {
  const delayMs = Math.max(0, Math.floor(Number(ms) || 0));
  if (!delayMs) return Promise.resolve();
  if (signal?.aborted) return Promise.reject(new Error("AI Companion request cancelled."));
  return new Promise((resolve, reject) => {
    const timer = setTimeout(resolve, delayMs);
    const abort = () => {
      clearTimeout(timer);
      reject(new Error("AI Companion request cancelled."));
    };
    signal?.addEventListener?.("abort", abort, { once: true });
  });
}

async function waitForProviderPace(delayMs, signal, onDebug, pathname) {
  const spacingMs = clampDelayMs(delayMs, 0);
  if (!spacingMs) return;
  const previous = providerRequestQueue.catch(() => {});
  const current = previous.then(async () => {
    const waitMs = Math.max(0, nextProviderRequestAt - Date.now());
    if (waitMs > 0) {
      onDebug?.({ kind: "pace", pathname, delayMs: waitMs });
      await sleep(waitMs, signal);
    }
    nextProviderRequestAt = Date.now() + spacingMs;
  });
  providerRequestQueue = current;
  await current;
}

/**
 * Reasoning models expose their chain-of-thought on a separate streamed field rather than
 * mixing it into the visible answer. There is no single standard name for it yet, so we accept
 * the two shapes seen in the wild: OpenAI-style `delta.reasoning` and the DeepSeek/vLLM/Ollama
 * `delta.reasoning_content`. Whichever one a given server emits is forwarded verbatim through
 * `onReasoning`, kept strictly apart from the `delta.content` answer tokens.
 */
async function readStreamingContent(response, onToken, onReasoning, onFinishReason, onUsage) {
  const decoder = new TextDecoder();
  let buffer = "";
  let content = "";
  const collectAnswer = (answerText) => {
    content += answerText;
    onToken?.(answerText);
  };

  async function readChunk(chunk) {
    buffer += decoder.decode(chunk, { stream: true });
    const blocks = buffer.split(/\r?\n\r?\n/);
    buffer = blocks.pop() || "";
    for (const block of blocks) {
      for (const line of block.split(/\r?\n/)) {
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (!data || data === "[DONE]") continue;
        const parsed = JSON.parse(data);
        // With `stream_options.include_usage`, the last data chunk (empty `choices`) carries the
        // token accounting for the whole request; some servers attach it to the final delta instead.
        const usage = parseUsagePayload(parsed?.usage);
        if (usage) onUsage?.(usage);
        const finishReason = parsed?.choices?.[0]?.finish_reason || "";
        if (finishReason) onFinishReason?.(finishReason);
        const delta = parsed?.choices?.[0]?.delta || {};
        const reasoning = delta.reasoning_content || delta.reasoning || "";
        if (reasoning) onReasoning?.(reasoning);
        const token = delta.content || "";
        if (!token) continue;
        collectAnswer(token);
      }
    }
  }

  for await (const chunk of response.body) {
    await readChunk(chunk);
  }
  if (buffer.trim()) await readChunk(Buffer.from("\n\n"));
  return content.trim();
}

/**
 * Extract the offending field name from an OpenAI-style "unsupported parameter/value" error,
 * e.g. `Unsupported parameter: 'stop' is not supported with this model.` or
 * `Unsupported value: 'temperature' does not support 0 with this model. Only the default (1)
 * value is supported.` Both shapes quote the field name the same way, so one pattern covers both.
 */
function extractUnsupportedParamName(errorText) {
  const match = String(errorText || "").match(/unsupported (?:parameter|value)s?:?\s*'([a-zA-Z0-9_]+)'/i);
  return match ? match[1] : null;
}

/**
 * Known "this model doesn't accept that request field the way you sent it" errors, each with a
 * matcher for the provider's error text and a fixup that adjusts the request body so the retry
 * has a chance of succeeding. Newer OpenAI reasoning/chat-locked models are the main source of
 * these (fixed `max_completion_tokens` naming, `temperature`/`stop`/etc. locked to defaults, and
 * likely others not yet seen); most self-hosted OpenAI-compatible servers (Ollama, vLLM, LM
 * Studio, ...) never trigger any of them. `max_tokens` gets a dedicated rename because dropping
 * it would silently remove the token limit rather than fix the request; every other rejected
 * field just gets parsed out of the error text and dropped — that generic fixup is what makes
 * this resilient to whichever specific parameter a given locked-down model objects to next,
 * without needing a new named fixup added by hand each time one is discovered.
 */
const PARAM_FIXUPS = [
  {
    name: "max_tokens-to-max_completion_tokens",
    matches: (errorText) => /max_tokens/i.test(errorText) && /max_completion_tokens/i.test(errorText),
    apply: (body) => {
      if (typeof body.max_tokens === "undefined") return null;
      const { max_tokens, ...rest } = body;
      return { ...rest, max_completion_tokens: max_tokens };
    }
  },
  {
    name: "drop-unsupported-parameter",
    matches: (errorText) => !!extractUnsupportedParamName(errorText),
    apply: (body, errorText) => {
      const paramName = extractUnsupportedParamName(errorText);
      if (!paramName || typeof body[paramName] === "undefined") return null;
      const nextBody = { ...body };
      delete nextBody[paramName];
      return nextBody;
    }
  }
];

function createOpenAiCompatibleProvider(settings) {
  const baseUrl = settings.baseUrl;
  const model = settings.model;
  const apiKey = settings.apiKey;
  const extraBody = settings.extraBody && typeof settings.extraBody === "object" && !Array.isArray(settings.extraBody) ? settings.extraBody : {};
  const providerRequestDelayMs = clampDelayMs(settings.providerRequestDelayMs, 1000);
  let effectiveProviderRequestDelayMs = providerRequestDelayMs;
  const debugLogFullAiPayloads = settings.debugLogFullAiPayloads === true;

  async function postJson(pathname, body, options = {}) {
    return fetch(joinEndpoint(baseUrl, pathname), {
      method: "POST",
      signal: options.signal,
      headers: {
        "Content-Type": "application/json",
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {})
      },
      body: JSON.stringify(body)
    });
  }

  /**
   * POST a completions-style request, retrying with an adjusted body when the provider rejects
   * a request field in a way matched by `PARAM_FIXUPS` (see there for why). Unlike a one-shot
   * retry, this allows the generic "drop unsupported parameter" fixup to fire again on a later
   * attempt for a *different* field name — a model can reject `max_tokens`, then `temperature`,
   * then `stop` in three separate responses, each only visible after the previous one is fixed.
   * Each individual `apply` call is self-terminating (it returns null once the field it targets
   * is no longer in the body), so the fixed `maxAttempts` below exists only as a hard backstop
   * against a pathologically-erroring server, not as the primary loop-prevention mechanism.
   *
   * `options.onDebug`, when provided, is called with a `{kind, ...}` event at each attempt,
   * fixup, and response — this is the hook that feeds the `ai-companion` debug log category
   * (see core/provider-debug.js) so a stuck or empty request is diagnosable after the fact.
   * @returns {Promise<{ok: boolean, status: number, response?: Response, bodyText?: string}>}
   */
  async function postCompletionsRequest(pathname, body, options = {}) {
    const onDebug = typeof options.onDebug === "function" ? options.onDebug : null;
    let currentBody = body;
    let rateLimitRetries = 0;
    const maxAttempts = 8;
    const maxRateLimitRetries = 3;

    for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
      onDebug?.({
        kind: "request",
        pathname,
        attempt,
        model: currentBody.model,
        bodyKeys: Object.keys(currentBody),
        ...(debugLogFullAiPayloads ? { requestBody: currentBody } : {})
      });
      await waitForProviderPace(effectiveProviderRequestDelayMs, options.signal, onDebug, pathname);
      const response = await postJson(pathname, currentBody, options);
      if (response.ok) {
        onDebug?.({ kind: "response", pathname, attempt, status: response.status, ok: true });
        return { ok: true, status: response.status, response };
      }

      const errorText = await response.text();
      onDebug?.({
        kind: "response",
        pathname,
        attempt,
        status: response.status,
        ok: false,
        error: debugLogFullAiPayloads ? errorText : errorText.slice(0, 300),
        ...(debugLogFullAiPayloads ? { responseBody: errorText } : {})
      });
      if (response.status === 429 && rateLimitRetries < maxRateLimitRetries) {
        rateLimitRetries += 1;
        const retryPlan = createRateLimitRetryPlan({ response, errorText, retryNumber: rateLimitRetries });
        if (retryPlan.adaptivePaceMs !== null) {
          effectiveProviderRequestDelayMs = Math.max(effectiveProviderRequestDelayMs, retryPlan.adaptivePaceMs);
        }
        onDebug?.({
          kind: "rate-limit-retry",
          pathname,
          attempt,
          delayMs: retryPlan.delayMs,
          providerDelayMs: retryPlan.providerDelayMs,
          delaySource: retryPlan.delaySource,
          adaptivePaceMs: retryPlan.adaptivePaceMs,
          quota: retryPlan.quota,
          retry: rateLimitRetries,
          maxRetries: maxRateLimitRetries
        });
        await sleep(retryPlan.delayMs, options.signal);
        continue;
      }
      const fixup = PARAM_FIXUPS.find((candidate) => candidate.matches(errorText));
      const nextBody = fixup ? fixup.apply(currentBody, errorText) : null;
      if (!fixup || !nextBody) return { ok: false, status: response.status, bodyText: errorText };

      onDebug?.({ kind: "retry", pathname, attempt, fixup: fixup.name });
      currentBody = nextBody;
    }

    return { ok: false, status: 0, bodyText: "Provider request failed after exhausting known parameter fixups." };
  }

  async function complete(messages, options = {}) {
    if (!baseUrl) throw new Error("AI Companion base URL is required.");
    if (!model) throw new Error("AI Companion model is required.");
    if (typeof fetch !== "function") throw new Error("This Node.js runtime does not provide fetch.");

    const onDebug = typeof options.onDebug === "function" ? options.onDebug : null;
    const shouldStream = typeof options.onToken === "function";
    const stop = Array.isArray(options.stop) ? options.stop.filter(Boolean) : [];
    const result = await postCompletionsRequest("/chat/completions", {
      ...extraBody,
      model,
      messages,
      temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
      max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : undefined,
      stream: shouldStream,
      // Ask streaming servers to append a final usage chunk (OpenAI spec). Servers that reject
      // the field trigger the generic drop-unsupported-parameter fixup; servers that silently
      // ignore it simply never call onUsage, and callers fall back to estimates.
      ...(shouldStream ? { stream_options: { include_usage: true } } : {}),
      ...(stop.length ? { stop } : {}),
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {})
    }, { signal: options.signal, onDebug });

    if (!result.ok) {
      const error = createProviderRequestError(result.status, result.bodyText);
      onDebug?.({ kind: "error", pathname: "/chat/completions", status: result.status, message: error.message });
      throw error;
    }

    if (shouldStream && result.response.body) {
      let finishReason = "";
      const content = await readStreamingContent(result.response, options.onToken, options.onReasoningToken, (reason) => {
        finishReason = reason;
        options.onFinishReason?.(reason);
      }, options.onUsage);
      if (debugLogFullAiPayloads) {
        onDebug?.({
          kind: "result",
          pathname: "/chat/completions",
          contentLength: content.length,
          finishReason: finishReason || "stream",
          empty: content.length === 0,
          responseContent: content
        });
      }
      return content;
    }

    const bodyText = await result.response.text();
    const data = JSON.parse(bodyText || "{}");
    const content = String(data?.choices?.[0]?.message?.content || "").trim();
    const usage = parseUsagePayload(data?.usage);
    if (usage) options.onUsage?.(usage);
    options.onFinishReason?.(data?.choices?.[0]?.finish_reason || "");
    onDebug?.({
      kind: "result",
      pathname: "/chat/completions",
      contentLength: content.length,
      finishReason: data?.choices?.[0]?.finish_reason || "",
      empty: content.length === 0,
      ...(debugLogFullAiPayloads ? { responseBody: data } : {})
    });
    return content;
  }

  async function completeMessage(messages, options = {}) {
    if (!baseUrl) throw new Error("AI Companion base URL is required.");
    if (!model) throw new Error("AI Companion model is required.");
    if (typeof fetch !== "function") throw new Error("This Node.js runtime does not provide fetch.");

    const onDebug = typeof options.onDebug === "function" ? options.onDebug : null;
    const requestBody = {
      ...extraBody,
      model,
      messages,
      temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
      max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : undefined,
      stream: false,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {})
    };
    if (Array.isArray(options.tools) && options.tools.length) requestBody.tools = options.tools;
    if (options.toolChoice) requestBody.tool_choice = options.toolChoice;

    const result = await postCompletionsRequest("/chat/completions", requestBody, { signal: options.signal, onDebug });
    if (!result.ok) {
      const error = createProviderRequestError(result.status, result.bodyText);
      onDebug?.({ kind: "error", pathname: "/chat/completions", status: result.status, message: error.message });
      throw error;
    }
    const bodyText = await result.response.text();
    const data = JSON.parse(bodyText || "{}");
    const message = data?.choices?.[0]?.message || {};
    const usage = parseUsagePayload(data?.usage);
    if (usage) options.onUsage?.(usage);
    let content = String(message.content || "");
    // Non-streaming responses (agent mode's tool-loop rounds) carry the model's thinking on the
    // final message object rather than as incremental deltas; same two field names as the stream.
    let reasoning = String(message.reasoning_content || message.reasoning || "");
    onDebug?.({
      kind: "result",
      pathname: "/chat/completions",
      contentLength: content.length,
      // Surfaced so an empty Thinking block is diagnosable from the log: 0 here means the provider
      // returned no reasoning field at all (e.g. OpenAI chat-completions), which is the expected
      // reason nothing renders — as opposed to the UI dropping reasoning that did arrive.
      reasoningLength: reasoning.length,
      finishReason: data?.choices?.[0]?.finish_reason || "",
      empty: content.length === 0 && !(Array.isArray(message.tool_calls) && message.tool_calls.length),
      ...(debugLogFullAiPayloads ? { responseBody: data } : {})
    });
    return {
      role: message.role || "assistant",
      content,
      reasoning,
      finishReason: data?.choices?.[0]?.finish_reason || "",
      toolCalls: Array.isArray(message.tool_calls)
        ? message.tool_calls.map((call) => ({
            id: call.id,
            type: call.type,
            function: call.function,
            raw: call
          }))
        : []
    };
  }

  /**
   * Raw fill-in-the-middle completion for infill-trained models (e.g. StarCoder,
   * DeepSeek Coder, Code Llama). Hits the legacy /completions endpoint with a plain
   * prompt string instead of a chat messages array, and parses `choices[0].text`
   * instead of `choices[0].message.content` (the response shape differs between
   * /completions and /chat/completions). Only used when the caller has already
   * built a FIM-formatted prompt; general chat/instruct calls should keep using
   * `complete`/`completeMessage`.
   * @param {string} prompt Fully-formatted FIM prompt (prefix/suffix/middle tokens already applied).
   * @param {{temperature?: number, maxTokens?: number, stop?: string[], signal?: AbortSignal}=} options
   * @returns {Promise<string>} Raw completion text.
   */
  async function completeRaw(prompt, options = {}) {
    if (!baseUrl) throw new Error("AI Companion base URL is required.");
    if (!model) throw new Error("AI Companion model is required.");
    if (typeof fetch !== "function") throw new Error("This Node.js runtime does not provide fetch.");

    const onDebug = typeof options.onDebug === "function" ? options.onDebug : null;
    const requestBody = {
      ...extraBody,
      model,
      prompt,
      temperature: Number.isFinite(options.temperature) ? options.temperature : 0.2,
      max_tokens: Number.isFinite(options.maxTokens) ? options.maxTokens : undefined,
      stream: false,
      ...(options.reasoningEffort ? { reasoning_effort: options.reasoningEffort } : {})
    };
    const stop = Array.isArray(options.stop) ? options.stop.filter(Boolean) : [];
    if (stop.length) requestBody.stop = stop;

    const result = await postCompletionsRequest("/completions", requestBody, { signal: options.signal, onDebug });
    if (!result.ok) {
      const error = createProviderRequestError(result.status, result.bodyText);
      onDebug?.({ kind: "error", pathname: "/completions", status: result.status, message: error.message });
      throw error;
    }
    const bodyText = await result.response.text();
    const data = JSON.parse(bodyText || "{}");
    const content = String(data?.choices?.[0]?.text || "").trim();
    options.onFinishReason?.(data?.choices?.[0]?.finish_reason || "");
    onDebug?.({
      kind: "result",
      pathname: "/completions",
      contentLength: content.length,
      finishReason: data?.choices?.[0]?.finish_reason || "",
      empty: content.length === 0,
      ...(debugLogFullAiPayloads ? { responseBody: data } : {})
    });
    return content;
  }

  async function testConnection(options = {}) {
    const content = await complete([
      { role: "system", content: "Reply with exactly: ok" },
      { role: "user", content: "Connection test." }
    ], { maxTokens: 8, temperature: 0, signal: options.signal });
    return { ok: true, content };
  }

  return { complete, completeMessage, completeRaw, testConnection };
}

module.exports = {
  createOpenAiCompatibleProvider
};
