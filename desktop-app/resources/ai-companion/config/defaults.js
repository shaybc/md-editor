/** AI Companion settings defaults shared by the bridge and UI. */

"use strict";

const toolScopeRegistry = require("../core/tool-scope-registry");

const DEFAULT_AI_COMPANION_SETTINGS = Object.freeze({
  enabled: false,
  providerMode: "openai-compatible",
  baseUrl: "http://localhost:11434/v1",
  apiKeyCredentialId: "",
  model: "llama3.1",
  litellmModelAlias: "",
  litellmRoutingConfig: "",
  geminiConnectorBaseUrl: "",
  geminiConnectorId: "",
  geminiConnectorApiKeyCredentialId: "",
  trustedCertificates: [],
  chatEnabled: true,
  autocompleteEnabled: false,
  agentEnabled: false,
  gitSummaryEnabled: true,
  providerRequestDelayMs: 1000,
  maxTokensPerChatMinute: 0,
  maxTasksPerChat: 30,
  agentMaxResponseTokens: 0,
  showReasoning: true,
  debugLogFullAiPayloads: false,
  autocompleteIdleMs: 700,
  autocompleteRejectCharacters: 24,
  autocompleteRejectDelayMs: 2500,
  agentAutoRunCommands: false,
  agentConfirmBeforeWrite: true,
  permissionMode: "guided",
  connectionProfiles: [],
  providerRoutes: [],
  internetSearchEndpoint: "",
  workspaceStructureAutoInclude: false,
  trustWorkspaceHooks: false,
  allowHookManagedApprovals: false,
  lifecycleHooks: [],
  toolScopes: toolScopeRegistry.defaultToolScopes(),
  aiSecurityPolicy: {
    version: 1,
    shell: { mode: "deny-and-audit" },
    packages: {
      rules: ["npm", "yarn", "pnpm", "maven", "gradle"].map((ecosystem) => ({ ecosystem, packageId: "*", version: "*", action: "*", registry: "*" }))
    },
    packageBinaries: { npx: false, yarnDlx: false, pnpmDlx: false }
  }
});

function clampInteger(value, fallback, min, max) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(number)));
}

function normalizeProviderMode(value) {
  return ["openai", "google-gemini", "google-gemini-native", "anthropic", "xai", "ollama", "openai-compatible", "litellm", "gemini-connector", "gemini-connector-raw"].includes(value) ? value : "openai-compatible";
}

function normalizeTrustedCertificates(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    return {
      host: String(source.host || "").trim().toLowerCase(),
      port: String(source.port || "").trim(),
      subject: String(source.subject || ""),
      issuer: String(source.issuer || ""),
      validFrom: String(source.validFrom || ""),
      validTo: String(source.validTo || ""),
      fingerprint256: String(source.fingerprint256 || "").trim(),
      pem: String(source.pem || ""),
      trustedAt: String(source.trustedAt || "")
    };
  }).filter((entry) => entry.host && entry.fingerprint256 && entry.pem);
}

function normalizeConnectionProfiles(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    const normalized = { ...source, id: String(source.id || "").trim(), providerMode: normalizeProviderMode(source.providerMode), model: String(source.model || "").trim() };
    delete normalized.apiKey;
    delete normalized.geminiConnectorApiKey;
    return normalized;
  }).filter((entry) => entry.id).slice(0, 30);
}

function normalizeProviderRoutes(value) {
  if (!Array.isArray(value)) return [];
  return value.map((entry) => {
    const source = entry && typeof entry === "object" && !Array.isArray(entry) ? entry : {};
    return {
      id: String(source.id || "").trim(), profileId: String(source.profileId || "default").trim(), model: String(source.model || "").trim(),
      purposes: Array.isArray(source.purposes) ? source.purposes.map(String).slice(0, 10) : ["primary"],
      fallbacks: Array.isArray(source.fallbacks) ? source.fallbacks.map(String).filter(Boolean).slice(0, 8) : [],
      allowProviderChange: source.allowProviderChange === true,
      dataScopes: source.dataScopes && typeof source.dataScopes === "object" ? { ...source.dataScopes } : {},
      contextWindow: clampInteger(source.contextWindow, 0, 0, 10000000),
      maxOutputTokens: clampInteger(source.maxOutputTokens, 0, 0, 1000000),
      capabilities: source.capabilities && typeof source.capabilities === "object" ? { ...source.capabilities } : {}
    };
  }).filter((entry) => entry.id).slice(0, 50);
}

function normalizeAiCompanionSettings(settings = {}) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  return {
    enabled: source.enabled === true,
    providerMode: normalizeProviderMode(source.providerMode),
    baseUrl: String(source.baseUrl || DEFAULT_AI_COMPANION_SETTINGS.baseUrl).trim(),
    apiKeyCredentialId: String(source.apiKeyCredentialId || ""),
    model: String(source.model || DEFAULT_AI_COMPANION_SETTINGS.model).trim(),
    litellmModelAlias: String(source.litellmModelAlias || "").trim(),
    litellmRoutingConfig: String(source.litellmRoutingConfig || ""),
    geminiConnectorBaseUrl: String(source.geminiConnectorBaseUrl || "").trim(),
    geminiConnectorId: String(source.geminiConnectorId || "").trim(),
    geminiConnectorApiKeyCredentialId: String(source.geminiConnectorApiKeyCredentialId || ""),
    trustedCertificates: normalizeTrustedCertificates(source.trustedCertificates),
    chatEnabled: source.chatEnabled !== false,
    autocompleteEnabled: source.autocompleteEnabled === true,
    agentEnabled: source.agentEnabled === true,
    gitSummaryEnabled: source.gitSummaryEnabled !== false,
    providerRequestDelayMs: clampInteger(source.providerRequestDelayMs, DEFAULT_AI_COMPANION_SETTINGS.providerRequestDelayMs, 0, 60000),
    maxTokensPerChatMinute: clampInteger(source.maxTokensPerChatMinute, DEFAULT_AI_COMPANION_SETTINGS.maxTokensPerChatMinute, 0, 1000000),
    maxTasksPerChat: clampInteger(source.maxTasksPerChat, DEFAULT_AI_COMPANION_SETTINGS.maxTasksPerChat, 1, 200),
    agentMaxResponseTokens: clampInteger(source.agentMaxResponseTokens, DEFAULT_AI_COMPANION_SETTINGS.agentMaxResponseTokens, 0, 128000),
    showReasoning: source.showReasoning !== false,
    debugLogFullAiPayloads: source.debugLogFullAiPayloads === true,
    autocompleteIdleMs: clampInteger(source.autocompleteIdleMs, DEFAULT_AI_COMPANION_SETTINGS.autocompleteIdleMs, 100, 10000),
    autocompleteRejectCharacters: clampInteger(source.autocompleteRejectCharacters, DEFAULT_AI_COMPANION_SETTINGS.autocompleteRejectCharacters, 1, 1000),
    autocompleteRejectDelayMs: clampInteger(source.autocompleteRejectDelayMs, DEFAULT_AI_COMPANION_SETTINGS.autocompleteRejectDelayMs, 0, 60000),
    agentAutoRunCommands: source.agentAutoRunCommands === true,
    agentConfirmBeforeWrite: source.agentConfirmBeforeWrite !== false,
    permissionMode: ["guided", "observe-only", "edit-trusted", "risk-routed", "preauthorized-only", "sandbox-unattended"].includes(source.permissionMode) ? source.permissionMode : "guided",
    connectionProfiles: normalizeConnectionProfiles(source.connectionProfiles),
    providerRoutes: normalizeProviderRoutes(source.providerRoutes),
    internetSearchEndpoint: String(source.internetSearchEndpoint || "").trim(),
    workspaceStructureAutoInclude: source.workspaceStructureAutoInclude === true,
    trustWorkspaceHooks: source.trustWorkspaceHooks === true,
    allowHookManagedApprovals: source.allowHookManagedApprovals === true,
    lifecycleHooks: Array.isArray(source.lifecycleHooks) ? source.lifecycleHooks.slice(0, 100).map((entry) => JSON.parse(JSON.stringify(entry))) : [],
    toolScopes: toolScopeRegistry.normalizeToolScopes(source.toolScopes),
    aiSecurityPolicy: source.aiSecurityPolicy && typeof source.aiSecurityPolicy === "object" && !Array.isArray(source.aiSecurityPolicy)
      ? JSON.parse(JSON.stringify(source.aiSecurityPolicy))
      : JSON.parse(JSON.stringify(DEFAULT_AI_COMPANION_SETTINGS.aiSecurityPolicy))
  };
}

module.exports = { DEFAULT_AI_COMPANION_SETTINGS, normalizeAiCompanionSettings };
