(function(window) {
  "use strict";

  /**
   * AI Companion model registry: maps configured model names to context-window metadata so the
   * composer's context indicator can turn "tokens used" into "% of window used".
   *
   * Builtin entries are seeded from the provider docs (OpenAI / Anthropic / Google, July 2026)
   * plus common local families. The user-visible copy lives in a JSON file
   * (<profile>/companion/model-registry.json on desktop, localStorage on web) that the Models
   * settings table and the "Edit json" tab both edit; builtins baked here make "Restore
   * defaults" work and self-heal a corrupt or deleted registry file.
   */

  const REGISTRY_STORAGE_KEY = "ai-companion-model-registry";
  const REGISTRY_FILE_NAME = "model-registry.json";

  const BUILTIN_MODELS = Object.freeze([
    { id: "gpt-5.5", provider: "openai", label: "GPT-5.5", match: "^gpt-5\\.5(?!-pro)", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
    { id: "gpt-5.5-pro", provider: "openai", label: "GPT-5.5 Pro", match: "^gpt-5\\.5-pro", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
    { id: "gpt-5.4", provider: "openai", label: "GPT-5.4", match: "^gpt-5\\.4", contextWindow: 1050000, maxOutputTokens: 128000, isReasoning: true },
    { id: "claude-fable-5", provider: "anthropic", label: "Claude Fable 5", match: "^claude-fable-5", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
    { id: "claude-opus-4-8", provider: "anthropic", label: "Claude Opus 4.8", match: "^claude-opus-4-8", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
    { id: "claude-sonnet-5", provider: "anthropic", label: "Claude Sonnet 5", match: "^claude-sonnet-5", contextWindow: 1000000, maxOutputTokens: 128000, isReasoning: true },
    { id: "claude-haiku-4-5", provider: "anthropic", label: "Claude Haiku 4.5", match: "^claude-haiku-4-5", contextWindow: 200000, maxOutputTokens: 64000, isReasoning: true },
    { id: "gemini-3.1-pro", provider: "google", label: "Gemini 3.1 Pro", match: "^gemini-3\\.1-pro", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
    { id: "gemini-3.5-flash", provider: "google", label: "Gemini 3.5 Flash", match: "^gemini-3\\.5-flash", contextWindow: 1048576, maxOutputTokens: 65535, isReasoning: true },
    { id: "gemini-3.1-flash-lite", provider: "google", label: "Gemini 3.1 Flash-Lite", match: "^gemini-3\\.1-flash-lite", contextWindow: 1048576, maxOutputTokens: 65535, isReasoning: false },
    { id: "gemini-2.5-pro", provider: "google", label: "Gemini 2.5 Pro", match: "^gemini-2\\.5-pro", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
    { id: "gemini-2.5-flash", provider: "google", label: "Gemini 2.5 Flash", match: "^gemini-2\\.5-flash(?!-lite)", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: true },
    { id: "gemini-2.5-flash-lite", provider: "google", label: "Gemini 2.5 Flash-Lite", match: "^gemini-2\\.5-flash-lite", contextWindow: 1048576, maxOutputTokens: 65536, isReasoning: false },
    { id: "llama3.1", provider: "meta (local)", label: "Llama 3.1 (Ollama)", match: "^llama3\\.1", contextWindow: 131072, maxOutputTokens: 8192, isReasoning: false },
    { id: "qwen2.5-coder", provider: "alibaba (local)", label: "Qwen 2.5 Coder", match: "^qwen2\\.5-coder", contextWindow: 131072, maxOutputTokens: 8192, isReasoning: false },
    { id: "deepseek-r1", provider: "deepseek (local)", label: "DeepSeek R1", match: "^deepseek-r1", contextWindow: 131072, maxOutputTokens: 32768, isReasoning: true }
  ]);

  function clampPositiveInteger(value, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number) || number <= 0) return fallback;
    return Math.floor(number);
  }

  function normalizeModelEntry(entry) {
    if (!entry || typeof entry !== "object") return null;
    const id = String(entry.id || "").trim();
    if (!id) return null;
    return {
      id,
      provider: String(entry.provider || "").trim(),
      label: String(entry.label || id).trim(),
      match: String(entry.match || "").trim(),
      contextWindow: clampPositiveInteger(entry.contextWindow, 0),
      maxOutputTokens: clampPositiveInteger(entry.maxOutputTokens, 0),
      isReasoning: entry.isReasoning === true,
      builtin: entry.builtin === true
    };
  }

  function createDefaultRegistry() {
    return {
      version: 1,
      models: BUILTIN_MODELS.map((model) => ({ ...model, builtin: true }))
    };
  }

  function normalizeRegistryPayload(payload) {
    const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
    const models = (Array.isArray(source.models) ? source.models : [])
      .map(normalizeModelEntry)
      .filter(Boolean);
    if (!models.length) return createDefaultRegistry();
    return { version: 1, models };
  }

  function registerMarkdownViewerAiCompanionModelRegistry(app, deps = {}) {
    let cachedRegistry = null;

    async function getRegistryFilePath() {
      if (!deps.isNeutralinoRuntime?.() || typeof deps.getProfileDataDirPath !== "function") return "";
      const profileDir = await deps.getProfileDataDirPath();
      if (!profileDir) return "";
      const companionDir = deps.joinPath(profileDir, "companion");
      try {
        await deps.Neutralino?.filesystem?.createDirectory?.(companionDir);
      } catch (_error) {
        // Existing folder is fine.
      }
      return deps.joinPath(companionDir, REGISTRY_FILE_NAME);
    }

    /**
     * Load the registry, self-healing on first run or when the JSON file is missing/corrupt.
     * A corrupt file never blanks the registry: the last valid in-memory copy (or the builtin
     * defaults) stays active and is written back.
     */
    async function loadRegistry() {
      let rawText = "";
      const filePath = await getRegistryFilePath();
      if (filePath && deps.Neutralino?.filesystem?.readFile) {
        try {
          rawText = await deps.Neutralino.filesystem.readFile(filePath);
        } catch (_error) {
          rawText = "";
        }
      } else {
        rawText = window.localStorage?.getItem(REGISTRY_STORAGE_KEY) || "";
      }
      if (rawText) {
        try {
          cachedRegistry = normalizeRegistryPayload(JSON.parse(rawText));
          return cachedRegistry;
        } catch (_error) {
          // Corrupt JSON: fall through to last valid/defaults and rewrite the file below.
        }
      }
      cachedRegistry = cachedRegistry || createDefaultRegistry();
      await saveRegistry(cachedRegistry);
      return cachedRegistry;
    }

    async function saveRegistry(registry) {
      cachedRegistry = normalizeRegistryPayload(registry);
      const serialized = JSON.stringify(cachedRegistry, null, 2);
      const filePath = await getRegistryFilePath();
      if (filePath && deps.Neutralino?.filesystem?.writeFile) {
        await deps.Neutralino.filesystem.writeFile(filePath, serialized);
      } else {
        window.localStorage?.setItem(REGISTRY_STORAGE_KEY, serialized);
      }
      return cachedRegistry;
    }

    function getCachedModels() {
      return cachedRegistry ? cachedRegistry.models : createDefaultRegistry().models;
    }

    /**
     * Resolve a configured model name to registry metadata: exact id match first, then the
     * longest `match` pattern so tagged variants (`llama3.1:8b-instruct-q4`) hit their family.
     * Returns null when the model is unknown — callers must treat the window as unknown rather
     * than guessing.
     */
    function resolveModelInfo(modelName) {
      const name = String(modelName || "").trim();
      if (!name) return null;
      const models = getCachedModels();
      const exact = models.find((model) => model.id === name);
      if (exact) return exact;
      const patternMatches = models.filter((model) => {
        if (!model.match) return false;
        try {
          return new RegExp(model.match, "i").test(name);
        } catch (_error) {
          return false;
        }
      });
      if (!patternMatches.length) return null;
      return patternMatches.sort((a, b) => b.match.length - a.match.length)[0];
    }

    const api = {
      builtinModels: BUILTIN_MODELS,
      createDefaultRegistry,
      normalizeRegistryPayload,
      normalizeModelEntry,
      getRegistryFilePath,
      loadRegistry,
      saveRegistry,
      getCachedModels,
      resolveModelInfo
    };
    app.registerModule("aiCompanionModelRegistry", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionModelRegistry = registerMarkdownViewerAiCompanionModelRegistry;
})(window);
