/**
 * AI Companion settings defaults shared by the bridge and UI.
 */

"use strict";

const intentExperiment = require("../../js/ai-companion/intent-experiment");
const toolScopeRegistry = require("../core/tool-scope-registry");

const DEFAULT_AI_COMPANION_SETTINGS = Object.freeze({
  enabled: false,
  providerMode: "openai-compatible",
  baseUrl: "http://localhost:11434/v1",
  apiKey: "",
  model: "llama3.1",
  litellmModelAlias: "",
  litellmRoutingConfig: "",
  geminiConnectorBaseUrl: "",
  geminiConnectorId: "",
  geminiConnectorApiKey: "",
  trustedCertificates: [],
  chatEnabled: true,
  autocompleteEnabled: false,
  agentEnabled: false,
  gitSummaryEnabled: true,
  providerRequestDelayMs: 1000,
  maxTokensPerChatMinute: 0,
  maxTasksPerChat: 30,
  // Per-request response cap (max_tokens) for agent tool rounds. 0 disables the cap entirely
  // and also auto-continues response-limit stops without asking for approval.
  agentMaxResponseTokens: 0,
  showReasoning: true,
  debugLogFullAiPayloads: false,
  autocompleteIdleMs: 700,
  autocompleteRejectCharacters: 24,
  autocompleteRejectDelayMs: 2500,
  agentAutoRunCommands: false,
  agentConfirmBeforeWrite: true,
  chatRequestRoutingEnabled: true,
  agentDecisionControllerEnabled: false,
  agentDurableRecoveryEnabled: false,
  agentVerifierCompletionEnabled: false,
  agentProgressEvaluationEnabled: false,
  agentProgressControlEnabled: false,
  agentNoProgressActionLimit: 3,
  agentMaxStrategyReplans: 2,
  // Plan-mode stateful controller (M8). Internal, default-off; no visible Settings control.
  // When false, Plan mode uses the legacy direct-prompting path. When true, Plan mode runs
  // through the shared M2–M7 controller under a read-only policy resolved by companion-mode-policy.
  planStatefulControllerEnabled: false,
  // Chat-mode stateful controller (M9). Internal, default-off; no visible Settings control.
  // When false, Chat uses its legacy routing/one-shot path. When true, Chat runs through the
  // shared controller under a read-only, routed policy resolved by companion-mode-policy.
  // Peer capability flags follow the same dependency cascade as agent/plan.
  chatStatefulControllerEnabled: false,
  chatVerifierCompletionEnabled: false,
  chatProgressEvaluationEnabled: false,
  chatProgressControlEnabled: false,
  chatDurableRecoveryEnabled: false,
  // Intent provenance boundary (M11.1). Internal, default-off; no visible Settings control.
  // When true, ambient editor context (active file / open tabs) is demoted to supporting
  // evidence and never enters a criterion's mustInspect or namedTargets unless the user
  // named it or an observation confirmed it.
  intentProvenanceBoundaryEnabled: false,
  // Task-profile routing (M11.2). Internal, default-off; no visible Settings control.
  // When true, a deterministically-certain task profile (e.g. preferences-update)
  // restricts the exposed tool surface to the profile's allow-list.
  taskProfileRoutingEnabled: false,
  // Plan-mode reliability fixes (internal, default-off; enable independently to test each).
  // Fix 2: stop or ask when required data is unreachable in Plan mode, instead of inventing it.
  planCapabilityGateEnabled: true,
  // Fix 1: only save a plan when the run's completion assessment is successful.
  planRequireSuccessToSaveEnabled: true,
  // Fix 3: expose read-only git tools (status/diff/branches) to Plan mode.
  planGitReadToolsEnabled: true,
  // Per-domain tool availability allow-list (Settings -> AI). Read scopes default
  // on, write/execution scopes default off. Core readers and edit tools are not
  // governed here. See core/tool-scope-registry.js.
  toolScopes: toolScopeRegistry.defaultToolScopes(),
  // Intent-contract feature (M1). `intentContractsEnabled` is the user-facing master
  // switch; when off, the intent phase is fully disabled. The remaining keys are
  // thresholds shared by the headless and browser normalizers.
  intentContractsEnabled: false,
  intentExperiment: { ...intentExperiment.ALL_ON },
  // Pre-work clarification policy: "ask" (ask blocking questions), "assume" (proceed on
  // visible assumptions, ask only safety/scope-critical), or "off" (never ask).
  intentClarificationMode: "assume",
  intentFastPathEnabled: true,
  intentFastPathMaxPromptChars: 240,
  intentExtractionDeadlineMs: 12000,
  intentMaxOutputTokens: 1200,
  intentInjectedMaxChars: 3500,
  // When true, completion assessment sends one model call per acceptance criterion (each
  // with only that criterion's narrowed evidence) instead of one call for all criteria.
  // Reduces the choices a weaker model must make; costs one call per criterion. Roll back
  // by setting this false to return to the single-call narrowed assessment.
  intentPerCriterionAssessment: true,
  // Closed-loop steering: when a run is incomplete, route the failure by arbiter class and
  // steer the agent toward the unmet criteria for up to intentMaxCompletionRevisions extra
  // passes. Roll back by setting intentCompletionSteeringEnabled false (verify once, report).
  intentCompletionSteeringEnabled: true,
  intentMaxCompletionRevisions: 3,
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
  return ["openai", "google-gemini", "anthropic", "xai", "ollama", "openai-compatible", "litellm", "gemini-connector", "gemini-connector-raw"].includes(value) ? value : "openai-compatible";
}
function normalizeTrustedCertificates(value) {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
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
    })
    .filter((entry) => entry.host && entry.fingerprint256 && entry.pem);
}

function normalizeAiCompanionSettings(settings = {}) {
  const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
  const intentContractsEnabled = source.intentContractsEnabled === true;
  return {
    enabled: source.enabled === true,
    providerMode: normalizeProviderMode(source.providerMode),
    baseUrl: String(source.baseUrl || DEFAULT_AI_COMPANION_SETTINGS.baseUrl).trim(),
    apiKey: String(source.apiKey || ""),
    model: String(source.model || DEFAULT_AI_COMPANION_SETTINGS.model).trim(),
    litellmModelAlias: String(source.litellmModelAlias || "").trim(),
    litellmRoutingConfig: String(source.litellmRoutingConfig || ""),
    geminiConnectorBaseUrl: String(source.geminiConnectorBaseUrl || "").trim(),
    geminiConnectorId: String(source.geminiConnectorId || "").trim(),
    geminiConnectorApiKey: String(source.geminiConnectorApiKey || ""),
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
    chatRequestRoutingEnabled: source.chatRequestRoutingEnabled !== false,
    agentDecisionControllerEnabled: source.agentDecisionControllerEnabled === true,
    agentDurableRecoveryEnabled: source.agentDurableRecoveryEnabled === true,
    agentVerifierCompletionEnabled: source.agentVerifierCompletionEnabled === true,
    agentProgressEvaluationEnabled: source.agentProgressEvaluationEnabled === true,
    agentProgressControlEnabled: source.agentProgressControlEnabled === true,
    agentNoProgressActionLimit: clampInteger(source.agentNoProgressActionLimit, DEFAULT_AI_COMPANION_SETTINGS.agentNoProgressActionLimit, 1, 10),
    agentMaxStrategyReplans: clampInteger(source.agentMaxStrategyReplans, DEFAULT_AI_COMPANION_SETTINGS.agentMaxStrategyReplans, 0, 10),
    planStatefulControllerEnabled: source.planStatefulControllerEnabled === true,
    chatStatefulControllerEnabled: source.chatStatefulControllerEnabled === true,
    chatVerifierCompletionEnabled: source.chatVerifierCompletionEnabled === true,
    chatProgressEvaluationEnabled: source.chatProgressEvaluationEnabled === true,
    chatProgressControlEnabled: source.chatProgressControlEnabled === true,
    chatDurableRecoveryEnabled: source.chatDurableRecoveryEnabled === true,
    intentProvenanceBoundaryEnabled: source.intentProvenanceBoundaryEnabled === true,
    taskProfileRoutingEnabled: source.taskProfileRoutingEnabled === true,
    planCapabilityGateEnabled: source.planCapabilityGateEnabled !== false,
    planRequireSuccessToSaveEnabled: source.planRequireSuccessToSaveEnabled !== false,
    planGitReadToolsEnabled: source.planGitReadToolsEnabled !== false,
    toolScopes: toolScopeRegistry.normalizeToolScopes(source.toolScopes),
    intentContractsEnabled,
    intentExperiment: intentExperiment.resolveIntentExperiment(source.intentExperiment, intentContractsEnabled, { rejectInvalid: true }),
    intentClarificationMode: ["ask", "assume", "off"].includes(source.intentClarificationMode) ? source.intentClarificationMode : "assume",
    intentFastPathEnabled: source.intentFastPathEnabled !== false,
    intentFastPathMaxPromptChars: clampInteger(source.intentFastPathMaxPromptChars, DEFAULT_AI_COMPANION_SETTINGS.intentFastPathMaxPromptChars, 0, 4000),
    intentExtractionDeadlineMs: clampInteger(source.intentExtractionDeadlineMs, DEFAULT_AI_COMPANION_SETTINGS.intentExtractionDeadlineMs, 1000, 120000),
    intentMaxOutputTokens: clampInteger(source.intentMaxOutputTokens, DEFAULT_AI_COMPANION_SETTINGS.intentMaxOutputTokens, 256, 8000),
    intentInjectedMaxChars: clampInteger(source.intentInjectedMaxChars, DEFAULT_AI_COMPANION_SETTINGS.intentInjectedMaxChars, 500, 6000),
    intentPerCriterionAssessment: source.intentPerCriterionAssessment !== false,
    intentCompletionSteeringEnabled: source.intentCompletionSteeringEnabled !== false,
    intentMaxCompletionRevisions: clampInteger(source.intentMaxCompletionRevisions, DEFAULT_AI_COMPANION_SETTINGS.intentMaxCompletionRevisions, 0, 10),
    aiSecurityPolicy: source.aiSecurityPolicy && typeof source.aiSecurityPolicy === "object" && !Array.isArray(source.aiSecurityPolicy)
      ? JSON.parse(JSON.stringify(source.aiSecurityPolicy))
      : JSON.parse(JSON.stringify(DEFAULT_AI_COMPANION_SETTINGS.aiSecurityPolicy))
  };
}

module.exports = {
  DEFAULT_AI_COMPANION_SETTINGS,
  normalizeAiCompanionSettings
};
