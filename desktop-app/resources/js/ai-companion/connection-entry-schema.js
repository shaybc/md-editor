/** Connection profile and provider route shapes used by the structured settings editor. */
(function(window) {
  "use strict";

  const PROVIDER_MODES = Object.freeze(["openai", "google-gemini", "google-gemini-native", "anthropic", "xai", "ollama", "openai-compatible", "litellm", "gemini-connector", "gemini-connector-raw"]);
  const ROUTE_PURPOSES = Object.freeze(["primary", "quick", "renewal", "memory", "worker", "review", "testing", "risk"]);
  const PROFILE_KEYS = new Set(["id", "providerMode", "model", "baseUrl", "apiKeyCredentialId", "providerRequestDelayMs", "litellmModelAlias", "litellmRoutingConfig", "geminiConnectorBaseUrl", "geminiConnectorId", "geminiConnectorApiKeyCredentialId", "isPrimary"]);
  const ROUTE_KEYS = new Set(["id", "profileId", "model", "purposes", "fallbacks", "allowProviderChange", "dataScopes", "contextWindow", "maxOutputTokens", "capabilities"]);

  function clone(value) { return value == null ? value : JSON.parse(JSON.stringify(value)); }
  function text(value) { return String(value == null ? "" : value).trim(); }
  function positiveInteger(value) { return Math.max(0, Math.floor(Number(value) || 0)); }
  function uniqueList(value, allowed = null) {
    const items = Array.isArray(value) ? value : String(value || "").split(",");
    return Array.from(new Set(items.map(text).filter((item) => item && (!allowed || allowed.includes(item)))));
  }

  function normalizeProfile(source = {}) {
    const entry = { ...clone(source), id: text(source.id), providerMode: text(source.providerMode) || "openai-compatible", model: text(source.model) };
    delete entry.apiKey;
    delete entry.geminiConnectorApiKey;
    for (const key of ["baseUrl", "apiKeyCredentialId", "litellmModelAlias", "litellmRoutingConfig", "geminiConnectorBaseUrl", "geminiConnectorId", "geminiConnectorApiKeyCredentialId"]) {
      if (source[key] != null) entry[key] = String(source[key]);
    }
    for (const key of ["apiKeyCredentialId", "geminiConnectorApiKeyCredentialId"]) {
      if (!text(entry[key])) delete entry[key];
    }
    if (source.providerRequestDelayMs != null) entry.providerRequestDelayMs = positiveInteger(source.providerRequestDelayMs);
    if (source.isPrimary === true) entry.isPrimary = true;
    else delete entry.isPrimary;
    return entry;
  }

  function normalizeRoute(source = {}) {
    return {
      ...clone(source), id: text(source.id), profileId: text(source.profileId) || "default", model: text(source.model),
      purposes: uniqueList(Array.isArray(source.purposes) ? source.purposes : ["primary"], ROUTE_PURPOSES), fallbacks: uniqueList(source.fallbacks).slice(0, 8),
      allowProviderChange: source.allowProviderChange === true,
      dataScopes: { workspace: source.dataScopes?.workspace !== false, personalMemory: source.dataScopes?.personalMemory !== false, teamMemory: source.dataScopes?.teamMemory !== false, externalContent: source.dataScopes?.externalContent === true },
      contextWindow: positiveInteger(source.contextWindow), maxOutputTokens: positiveInteger(source.maxOutputTokens),
      capabilities: { tools: source.capabilities?.tools !== false, vision: source.capabilities?.vision === true, reasoning: source.capabilities?.reasoning === true }
    };
  }

  function additionalProperties(source, knownKeys) { return Object.fromEntries(Object.entries(source || {}).filter(([key]) => !knownKeys.has(key) && key !== "apiKey" && key !== "geminiConnectorApiKey")); }

  /** Create an editable draft while keeping properties not represented by wizard fields. */
  function createDraft(kind, source = {}) {
    const entry = kind === "profile" ? normalizeProfile(source) : normalizeRoute(source);
    const extras = additionalProperties(source, kind === "profile" ? PROFILE_KEYS : ROUTE_KEYS);
    return { ...entry, _additionalProperties: JSON.stringify(extras, null, 2) };
  }

  /** Convert a wizard draft into the exact array entry written to settings. */
  function finalizeDraft(kind, draft) {
    let extras = {};
    try { extras = JSON.parse(String(draft?._additionalProperties || "{}").trim() || "{}"); }
    catch (error) { throw new Error(`Additional properties must be a JSON object: ${error?.message || String(error)}`); }
    if (!extras || typeof extras !== "object" || Array.isArray(extras)) throw new Error("Additional properties must be a JSON object.");
    if (kind === "profile" && (Object.hasOwn(extras, "apiKey") || Object.hasOwn(extras, "geminiConnectorApiKey"))) throw new Error("Plaintext credential properties are not supported.");
    const source = { ...clone(draft) };
    delete source._additionalProperties;
    const normalized = kind === "profile" ? normalizeProfile(source) : normalizeRoute(source);
    const entry = { ...extras, ...normalized };
    if (kind === "profile") {
      for (const key of ["baseUrl", "apiKeyCredentialId", "litellmModelAlias", "litellmRoutingConfig", "geminiConnectorBaseUrl", "geminiConnectorId", "geminiConnectorApiKeyCredentialId"]) if (!String(entry[key] || "").trim()) delete entry[key];
    }
    return entry;
  }

  /** Validate one entry against its sibling collection and the available profiles. */
  function validateEntry(kind, entry, entries, index, profiles = []) {
    if (!entry.id) return "ID is required.";
    if (kind === "profile" && !/^[^\u0000-\u001F\u007F]{1,80}$/.test(entry.id)) return "Profile name must be 80 characters or fewer and cannot contain control characters.";
    if (kind !== "profile" && !/^[A-Za-z0-9][A-Za-z0-9._-]{0,79}$/.test(entry.id)) return "ID may contain letters, numbers, dots, underscores, and hyphens.";
    if (entries.some((candidate, candidateIndex) => candidateIndex !== index && text(candidate.id) === entry.id)) return `ID '${entry.id}' is already in use.`;
    if (kind === "profile" && !PROVIDER_MODES.includes(entry.providerMode)) return "Choose a supported provider mode.";
    if (kind === "route") {
      const profileIds = new Set(["default", ...profiles.map((profile) => text(profile.id))]);
      if (!profileIds.has(entry.profileId)) return `Connection profile '${entry.profileId}' does not exist.`;
      if (!entry.purposes.length) return "Select at least one route purpose.";
      if (entry.fallbacks.includes(entry.id)) return "A route cannot use itself as a fallback.";
    }
    return "";
  }

  function summarize(kind, entry) {
    if (kind === "profile") return { primary: entry.id || "Untitled profile", secondary: entry.providerMode || "not set", tertiary: entry.model || "Default model" };
    return { primary: entry.id || "Untitled route", secondary: entry.profileId || "default", tertiary: (entry.purposes || []).join(", ") || "No purposes" };
  }

  function redactForDisplay(value, key = "") {
    if (/api.?key|token|secret|password/i.test(key)) return value ? "••••••" : "";
    if (Array.isArray(value)) return value.map((item) => redactForDisplay(item));
    if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([childKey, childValue]) => [childKey, redactForDisplay(childValue, childKey)]));
    return value;
  }

  /** Produce a complete credential-masked entry for the details preview. */
  function previewDraft(kind, draft) {
    try { return redactForDisplay(finalizeDraft(kind, draft)); }
    catch (_error) {
      const fallback = clone(draft) || {};
      delete fallback._additionalProperties;
      return redactForDisplay(fallback);
    }
  }

  window.MarkdownViewerAiConnectionEntries = Object.freeze({ PROVIDER_MODES, ROUTE_PURPOSES, createDraft, finalizeDraft, normalizeProfile, normalizeRoute, previewDraft, summarize, validateEntry });
})(window);
