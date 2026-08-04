/**
 * Builtin model registry shared by the AI Companion bridge.
 *
 * Mirrors web-app/js/ai-companion/model-registry.js (the same way defaults.js mirrors
 * settings.js). Values seeded from provider docs (OpenAI / Anthropic / Google, July 2026)
 * plus common local model families. contextWindow is the model's maximum input window in
 * tokens; the UI reserves output headroom separately.
 */

"use strict";

const BUILTIN_MODELS = Object.freeze([
  { id: "gpt-5.6-sol", provider: "openai", label: "GPT-5.6 Sol", match: "^gpt-5\\.6-sol", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
  { id: "gpt-5.6-terra", provider: "openai", label: "GPT-5.6 Terra", match: "^gpt-5\\.6-terra", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
  { id: "gpt-5.6-luna", provider: "openai", label: "GPT-5.6 Luna", match: "^gpt-5\\.6-luna", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
  { id: "gpt-5.5", provider: "openai", label: "GPT-5.5", match: "^gpt-5\\.5(?!-pro)", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
  { id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", match: "^gpt-5\\.5-pro", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
  { id: "gpt-5.4", provider: "openai", label: "GPT-5.4", match: "^gpt-5\\.4", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
  { id: "claude-fable-5", provider: "anthropic", label: "Claude Fable 5", match: "^claude-fable-5", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
  { id: "claude-opus-5", provider: "anthropic", label: "Claude Opus 5", match: "^claude-opus-5", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
  { id: "claude-opus-4-8", provider: "anthropic", label: "Claude Opus 4.8", match: "^claude-opus-4-8", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
  { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5", match: "^claude-sonnet-5", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
  { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", match: "^claude-haiku-4-5", contextWindow: 200000, maxOutputTokens: 64000, isReasoning: true },
  { id: "gemini-3.6-flash", provider: "google", label: "Gemini 3.6 Flash", match: "^gemini-3\\.6-flash", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
  { id: "gemini-3.1-pro", provider: "google", label: "Gemini 3.1 Pro", match: "^gemini-3\\.1-pro", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
  { id: "gemini-3.5-flash", provider: "google", label: "Gemini 3.5 Flash", match: "^gemini-3\\.5-flash", contextWindow: 1048576, maxOutputTokens: 65535, isReasoning: true },
  { id: "gemini-3.5-flash-lite", provider: "google", label: "Gemini 3.5 Flash-Lite", match: "^gemini-3\\.5-flash-lite", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
  { id: "gemini-3.1-flash-lite", provider: "google", label: "Gemini 3.1 Flash-Lite", match: "^gemini-3\\.1-flash-lite", contextWindow: 1048576, maxOutputTokens: 65535, isReasoning: false },
  { id: "gemini-3.1-pro-preview", provider: "google", label: "Gemini 3.1 Pro Preview", match: "^gemini-3\\.1-pro-preview", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
  { id: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro", match: "^gemini-2\\.5-pro", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
  { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash", match: "^gemini-2\\.5-flash(?!-lite)", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
  { id: "gemini-2.5-flash-lite", provider: "google", label: "Gemini 2.5 Flash-Lite", match: "^gemini-2\\.5-flash-lite", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: false },
  { id: "grok-4.5", provider: "xai", label: "Grok 4.5", match: "^grok-4\\.5", contextWindow: 500000, maxOutputTokens: 0, isReasoning: true },
  { id: "grok-4.3", provider: "xai", label: "Grok 4.3", match: "^grok-4\\.3", contextWindow: 1000000, maxOutputTokens: 0, isReasoning: true },
  { id: "grok-4.20-reasoning", provider: "xai", label: "Grok 4.20 Reasoning", match: "^grok-4\\.20-reasoning", contextWindow: 1000000, maxOutputTokens: 0, isReasoning: true },
  { id: "grok-4.20", provider: "xai", label: "Grok 4.20", match: "^grok-4\\.20", contextWindow: 1000000, maxOutputTokens: 0, isReasoning: true },
  { id: "grok-4.1-fast-reasoning", provider: "xai", label: "Grok 4.1 Fast Reasoning", match: "^grok-4\\.1-fast-reasoning", contextWindow: 1000000, maxOutputTokens: 0, isReasoning: true },
  { id: "grok-4.1-fast", provider: "xai", label: "Grok 4.1 Fast", match: "^grok-4\\.1-fast", contextWindow: 1000000, maxOutputTokens: 0, isReasoning: false },
  { id: "qwen3.5", provider: "ollama", label: "Qwen 3.5 (Ollama)", match: "^qwen3\\.5(?::|$)", contextWindow: 262144, maxOutputTokens: 0, isReasoning: true },
  { id: "gpt-oss:20b", provider: "ollama", label: "GPT-OSS 20B (Ollama)", match: "^gpt-oss:20b(?:-|$)", contextWindow: 131072, maxOutputTokens: 0, isReasoning: true },
  { id: "qwen3:8b", provider: "ollama", label: "Qwen 3 8B (Ollama)", match: "^qwen3:8b(?:-|$)", contextWindow: 40960, maxOutputTokens: 0, isReasoning: true },
  { id: "llama3.2", provider: "ollama", label: "Llama 3.2 (Ollama)", match: "^llama3\\.2(?::|$)", contextWindow: 131072, maxOutputTokens: 0, isReasoning: false },
  { id: "gemma3", provider: "ollama", label: "Gemma 3 (Ollama)", match: "^gemma3(?::|$)", contextWindow: 131072, maxOutputTokens: 0, isReasoning: false },
  { id: "llama3.1", provider: "meta (local)", label: "Llama 3.1 (Ollama)", match: "^llama3\\.1", contextWindow: 131072, maxOutputTokens: 8192, isReasoning: false },
  { id: "qwen2.5-coder", provider: "alibaba (local)", label: "Qwen 2.5 Coder", match: "^qwen2\\.5-coder", contextWindow: 131072, maxOutputTokens: 8192, isReasoning: false },
  { id: "deepseek-r1", provider: "deepseek (local)", label: "DeepSeek R1", match: "^deepseek-r1", contextWindow: 131072, maxOutputTokens: 32768, isReasoning: true }
]);

/**
 * Resolve a configured model name against a model list: exact id match first, then the longest
 * `match` pattern so tagged variants (`llama3.1:8b-instruct-q4`) resolve to their family entry.
 * Returns null for unknown models so callers surface "unknown window" instead of guessing.
 */
function resolveModelInfo(modelName, models = BUILTIN_MODELS) {
  const name = String(modelName || "").trim();
  if (!name) return null;
  const exact = models.find((model) => model.id === name);
  if (exact) return exact;
  const matches = models.filter((model) => {
    if (!model.match) return false;
    try {
      return new RegExp(model.match, "i").test(name);
    } catch (_error) {
      return false;
    }
  });
  if (!matches.length) return null;
  return matches.slice().sort((a, b) => b.match.length - a.match.length)[0];
}

module.exports = {
  BUILTIN_MODELS,
  resolveModelInfo
};
