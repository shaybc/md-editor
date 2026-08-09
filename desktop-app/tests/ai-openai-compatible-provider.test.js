const assert = require("node:assert/strict");
const test = require("node:test");

const { formatProviderDebugEvent } = require("../resources/ai-companion/core/provider-debug");
const { createOpenAiCompatibleProvider } = require("../resources/ai-companion/providers/openai-compatible");
const { createProvider } = require("../resources/ai-companion/orchestration/shared/provider-factory");
const { withProviderRateLimitGuard } = require("../resources/ai-companion/providers/provider-rate-limit-guard");
const {
  calculateAdaptiveRequestPaceMs,
  createRateLimitRetryPlan
} = require("../resources/ai-companion/providers/rate-limit-retry");

function createGeminiRateLimitBody() {
  return JSON.stringify([{
    error: {
      code: 429,
      message: "Quota exceeded. Please retry in 11.825721344s.",
      status: "RESOURCE_EXHAUSTED",
      details: [
        {
          "@type": "type.googleapis.com/google.rpc.QuotaFailure",
          violations: [{
            quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
            quotaId: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
            quotaDimensions: {
              location: "global",
              model: "gemini-3.5-flash-lite"
            },
            quotaValue: "15"
          }]
        },
        {
          "@type": "type.googleapis.com/google.rpc.RetryInfo",
          retryDelay: "11s"
        }
      ]
    }
  }]);
}

function createGeminiDailyQuotaBody() {
  return JSON.stringify([{
    error: {
      code: 429,
      message: "Daily quota exhausted. Please retry in 3s.",
      details: [{
        "@type": "type.googleapis.com/google.rpc.QuotaFailure",
        violations: [{
          quotaMetric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
          quotaId: "GenerateRequestsPerDayPerProjectPerModel-FreeTier",
          quotaValue: "20"
        }]
      }]
    }
  }]);
}

function createHeaders(retryAfter = "") {
  return {
    get(name) {
      return String(name || "").toLowerCase() === "retry-after" ? retryAfter : null;
    }
  };
}

test("Gemini rate-limit metadata uses the longest provider wait and derives safe RPM pacing", () => {
  const plan = createRateLimitRetryPlan({
    response: { headers: createHeaders("10") },
    errorText: createGeminiRateLimitBody(),
    retryNumber: 1
  });

  assert.equal(plan.providerDelayMs, 11826);
  assert.equal(plan.delayMs, 12826);
  assert.equal(plan.delaySource, "error-message");
  assert.deepEqual(plan.quota, {
    metric: "generativelanguage.googleapis.com/generate_content_free_tier_requests",
    id: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier",
    value: 15,
    model: "gemini-3.5-flash-lite",
    location: "global"
  });
  assert.equal(plan.adaptivePaceMs, 4500);
});

test("Retry-After wins when it requests a longer wait", () => {
  const plan = createRateLimitRetryPlan({
    response: { headers: createHeaders("20") },
    errorText: createGeminiRateLimitBody(),
    retryNumber: 1
  });

  assert.equal(plan.providerDelayMs, 20000);
  assert.equal(plan.delayMs, 21000);
  assert.equal(plan.delaySource, "retry-after");
});

test("missing provider hints use buffered exponential fallback waits", () => {
  const response = { headers: createHeaders() };

  assert.equal(createRateLimitRetryPlan({ response, errorText: "rate limited", retryNumber: 1 }).delayMs, 6000);
  assert.equal(createRateLimitRetryPlan({ response, errorText: "rate limited", retryNumber: 2 }).delayMs, 11000);
  assert.equal(createRateLimitRetryPlan({ response, errorText: "rate limited", retryNumber: 3 }).delayMs, 21000);
});

test("adaptive pacing applies only to positive requests-per-minute quotas", () => {
  assert.equal(calculateAdaptiveRequestPaceMs({ id: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", value: 15 }), 4500);
  assert.equal(calculateAdaptiveRequestPaceMs({ id: "GenerateRequestsPerDayPerProject", value: 100 }), null);
  assert.equal(calculateAdaptiveRequestPaceMs({ id: "GenerateRequestsPerMinutePerProject", value: 0 }), null);
});

test("provider retry events expose the selected delay source and quota details", () => {
  const formatted = formatProviderDebugEvent({
    kind: "rate-limit-retry",
    delayMs: 12826,
    delaySource: "error-message",
    quota: { id: "GenerateRequestsPerMinutePerProjectPerModel-FreeTier", value: 15 }
  });

  assert.equal(formatted.level, "warning");
  assert.match(formatted.message, /12826ms, source: error-message/);
  assert.equal(formatted.details.quota.value, 15);
});

test("daily quota exhaustion is classified as non-retryable", () => {
  const plan = createRateLimitRetryPlan({ errorText: createGeminiDailyQuotaBody(), retryNumber: 1 });
  assert.equal(plan.retryable, false);
  assert.equal(plan.retrySuppressedReason, "daily-quota");
});

test("shared provider guard waits and repeats the same connector operation", async () => {
  let attempts = 0;
  const waits = [];
  const provider = withProviderRateLimitGuard({
    async completeMessage() {
      attempts += 1;
      if (attempts === 1) {
        const error = new Error("Please retry in 2s.");
        error.providerStatus = 429;
        error.providerBody = error.message;
        throw error;
      }
      return { role: "assistant", content: "recovered", toolCalls: [] };
    }
  }, {
    wait: async (delayMs) => waits.push(delayMs)
  });

  const result = await provider.completeMessage([{ role: "user", content: "test" }]);
  assert.equal(result.content, "recovered");
  assert.equal(attempts, 2);
  assert.deepEqual(waits, [3000]);
});

test("shared provider guard skips waits for daily quota exhaustion", async () => {
  let attempts = 0;
  const waits = [];
  const events = [];
  const provider = withProviderRateLimitGuard({
    async completeMessage() {
      attempts += 1;
      const error = new Error("Daily quota exhausted");
      error.providerStatus = 429;
      error.providerBody = createGeminiDailyQuotaBody();
      throw error;
    }
  }, { wait: async (delayMs) => waits.push(delayMs) });

  await assert.rejects(provider.completeMessage([], { onDebug: (event) => events.push(event) }), /Daily quota/);
  assert.equal(attempts, 1);
  assert.deepEqual(waits, []);
  assert.equal(events.some((event) => event.kind === "rate-limit-stopped" && event.reason === "daily-quota"), true);
});

test("request retry override limits a transient connector error to one retry", async () => {
  let attempts = 0;
  const waits = [];
  const provider = withProviderRateLimitGuard({
    async completeMessage() {
      attempts += 1;
      const error = new Error("Please retry in 1s.");
      error.providerStatus = 429;
      error.providerBody = error.message;
      throw error;
    }
  }, { wait: async (delayMs) => waits.push(delayMs) });

  await assert.rejects(provider.completeMessage([], { rateLimitMaxRetries: 1 }), /retry/i);
  assert.equal(attempts, 2);
  assert.equal(waits.length, 1);
});

test("shared provider guard applies the parsed retry plan to OpenAI-compatible connectors", async () => {
  const originalFetch = global.fetch;
  const controller = new AbortController();
  const debugEvents = [];
  global.fetch = async () => ({
    ok: false,
    status: 429,
    headers: createHeaders(),
    text: async () => createGeminiRateLimitBody()
  });

  try {
    const provider = createProvider({
      providerMode: "openai-compatible",
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.5-flash-lite",
      providerRequestDelayMs: 0
    });
    await assert.rejects(provider.completeMessage([{ role: "user", content: "test" }], {
      signal: controller.signal,
      onDebug(event) {
        debugEvents.push(event);
        if (event.kind === "rate-limit-retry") controller.abort();
      }
    }), /cancelled/i);
  } finally {
    global.fetch = originalFetch;
  }

  const retryEvent = debugEvents.find((event) => event.kind === "rate-limit-retry");
  assert.equal(retryEvent.delayMs, 12826);
  assert.equal(retryEvent.delaySource, "error-message");
  assert.equal(retryEvent.adaptivePaceMs, 4500);
  assert.equal(retryEvent.quota.value, 15);
});

test("OpenAI-compatible provider preserves raw Gemini thought-signature extensions", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => ({
    ok: true,
    status: 200,
    text: async () => JSON.stringify({
      choices: [{
        finish_reason: "tool_calls",
        message: {
          role: "assistant",
          content: "",
          tool_calls: [{
            id: "call_list_files_0",
            type: "function",
            function: { name: "list_files", arguments: "{}" },
            extra_content: { google: { thought_signature: "opaque-signature" } }
          }]
        }
      }]
    })
  });

  try {
    const provider = createOpenAiCompatibleProvider({
      baseUrl: "https://generativelanguage.googleapis.com/v1beta/openai",
      model: "gemini-3.5-flash-lite",
      providerRequestDelayMs: 0
    });
    const message = await provider.completeMessage([{ role: "user", content: "List files" }]);
    assert.equal(message.toolCalls[0].raw.extra_content.google.thought_signature, "opaque-signature");
  } finally {
    global.fetch = originalFetch;
  }
});
