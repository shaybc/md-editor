/**
 * Autocomplete mode for inline editor suggestions.
 */

"use strict";

const runtime = require("../../core/agent-runtime");
const { DEFAULT_AI_COMPANION_PROMPTS, loadAiCompanionPrompts } = require("../../config/prompts");
const { createProviderDebugEmitter } = require("../../core/provider-debug");

// Reasoning-locked chat models (the kind that reject custom `temperature`/`stop` values) spend
// part of their token budget on internal reasoning that never reaches `content` — with a small
// budget that can consume the whole allowance and leave the visible completion empty. These are
// the FIM-path defaults (see completeWithFimTemplate) and the fallback for an unrecognized scope;
// the per-scope chat-prompt path below (SCOPE_CONFIG) picks its own budget/effort per scope
// instead of using one fixed pair for every request.
const AUTOCOMPLETE_MAX_TOKENS = 384;

// Confirmed via the ai-companion debug log (finish_reason "length", contentLength 0): raising
// AUTOCOMPLETE_MAX_TOKENS alone doesn't fix reasoning-locked models, because they can spend an
// effectively unbounded share of *any* budget on hidden reasoning tokens before touching visible
// content. Asking for minimal reasoning effort is the actual fix for that case. Providers that
// don't support this field either ignore it or reject it with an "unsupported parameter" error,
// which the provider's retry logic already knows how to strip automatically — so this is safe to
// send unconditionally rather than only for models detected as reasoning-locked.
//
// "minimal" isn't universally accepted — confirmed via the debug log that gpt-5.5-2026-04-23
// rejects it ("Supported values are: 'none', 'low', 'medium', 'high', and 'xhigh'"). When that
// happens the retry logic drops the field entirely, leaving the request on the model's *default*
// reasoning level — enough to still intermittently exhaust the token budget. "none" is the
// lowest value this model (and the OpenAI reasoning_effort spec generally) actually accepts, so
// it closes that gap instead of just falling back to default. Still safe to send unconditionally:
// providers that reject "none" too will have it stripped by the same fixup.
const AUTOCOMPLETE_REASONING_EFFORT = "none";

/**
 * Per-scope request shaping for the chat-prompt path (see scope-classifier.js on the client
 * for how a request gets classified). Three deliberately different asks instead of one
 * generic "complete the next small span" instruction for everything:
 *
 *   - "line": today's original behavior — cheap, fast, small span, no added reasoning.
 *   - "block": the cursor is at an empty function/method body (or right after a comment
 *     describing one). Explicitly asked to write the *complete* implementation instead of a
 *     fragment, with more budget and a bumped reasoning effort — it's a harder synthesis
 *     task and a comparatively rare one (only fires on a real empty-stub pattern per the
 *     classifier), so the extra cost is worth it where it actually applies.
 *   - "comment": the cursor is inside an unfinished comment. Asked for prose continuation in
 *     the same comment style, explicitly not code.
 */
const SCOPE_CONFIG = {
  line: {
    maxTokens: 384,
    reasoningEffort: "none"
  },
  block: {
    maxTokens: 900,
    reasoningEffort: "low"
  },
  comment: {
    maxTokens: 220,
    reasoningEffort: "none"
  }
};

function getScopeConfig(scope, prompts = DEFAULT_AI_COMPANION_PROMPTS) {
  const key = SCOPE_CONFIG[scope] ? scope : "line";
  return {
    ...SCOPE_CONFIG[key],
    ...(prompts.autocomplete?.[key] || DEFAULT_AI_COMPANION_PROMPTS.autocomplete[key])
  };
}

/**
 * Build a raw fill-in-the-middle prompt and call the provider's raw-completion endpoint.
 * Used for infill-trained models (StarCoder/DeepSeek Coder/Code Llama-style) when the
 * client has already resolved which FIM tokens that model family expects. Scope-blind by
 * design: a real FIM-trained completion model already has its own learned sense of how much
 * to generate from the prefix/suffix shape alone, which is the whole reason FIM models don't
 * need this kind of client-driven scope hinting the way a general chat model does.
 */
async function completeWithFimTemplate(provider, fimTemplate, prefix, suffix, stopSequences, signal, onDebug) {
  const prompt = `${fimTemplate.prefixToken || ""}${prefix}${fimTemplate.suffixToken || ""}${suffix}${fimTemplate.middleToken || ""}`;
  return provider.completeRaw(prompt, {
    temperature: 0.1,
    maxTokens: AUTOCOMPLETE_MAX_TOKENS,
    stop: stopSequences,
    reasoningEffort: AUTOCOMPLETE_REASONING_EFFORT,
    signal,
    onDebug
  });
}

/**
 * Build the chat-message prompt for the given scope, folding in extra context snippets
 * (from the client's recent-files provider, if enabled) and language-specific stop
 * sequences. This is the path used for instruct/chat models — i.e. every request from a
 * general chat model like the ones this app is actually configured against, since those
 * don't expose a FIM-style raw-completion endpoint.
 */
async function completeWithChatPrompt(provider, path, prefix, suffix, extraContext, stopSequences, scope, promptProfile, signal, onDebug) {
  const scopeConfig = getScopeConfig(scope, promptProfile);
  const extraContextBlock = extraContext ? `Related context from other open files:\n${extraContext}\n\n` : "";
  return provider.complete([
    {
      role: "system",
      content: scopeConfig.systemPrompt
    },
    {
      role: "user",
      content: `File: ${path}\n\n${extraContextBlock}Before cursor:\n${prefix}\n\nAfter cursor:\n${suffix}\n\n${scopeConfig.taskInstruction}`
    }
  ], {
    temperature: 0.1,
    maxTokens: scopeConfig.maxTokens,
    stop: stopSequences,
    reasoningEffort: scopeConfig.reasoningEffort,
    signal,
    onDebug
  });
}

async function runAutocompleteMode(request, emit) {
  const settings = runtime.normalizeAiCompanionSettings(request.settings);
  if (!settings.enabled || !settings.autocompleteEnabled) return { completion: "" };
  const provider = runtime.createProvider(settings);
  const prefix = String(request.prefix || "").slice(-5000);
  const suffix = String(request.suffix || "").slice(0, 1200);
  const path = String(request.path || "current file");
  const stopSequences = Array.isArray(request.stopSequences) ? request.stopSequences.filter(Boolean) : [];
  const extraContext = String(request.extraContext || "").trim();
  const scope = ["line", "block", "comment"].includes(request.scope) ? request.scope : "line";
  runtime.throwIfAborted(request.signal);
  emit({ type: "context", estimatedTokens: runtime.estimateTokens(prefix + suffix + extraContext) });
  const onDebug = createProviderDebugEmitter(emit);
  const prompts = await loadAiCompanionPrompts({ profileRoot: request.profileRoot });

  // FIM only applies when the client resolved a template AND the active provider exposes
  // a raw-completion method. Anything else (no template, chat-only provider, or explicit
  // "instruct" mode) keeps using the scope-aware chat-message prompt so behavior is
  // unchanged for requests that don't opt into FIM shaping.
  const useFim = request.mode === "fim" && request.fimTemplate && typeof provider.completeRaw === "function";
  const completion = useFim
    ? await completeWithFimTemplate(provider, request.fimTemplate, prefix, suffix, stopSequences, request.signal, onDebug)
    : await completeWithChatPrompt(provider, path, prefix, suffix, extraContext, stopSequences, scope, prompts, request.signal, onDebug);

  return { completion: String(completion || "").replace(/^```[^\n]*\n?|\n?```$/g, "") };
}

module.exports = {
  getScopeConfig,
  runAutocompleteMode
};
