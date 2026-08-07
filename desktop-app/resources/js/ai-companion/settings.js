(function(window) {
  "use strict";

  function registerMarkdownViewerAiCompanionSettings(app) {
    const intentExperiment = window.MarkdownViewerIntentExperiment;
    const toolScopeRegistry = window.MarkdownViewerAiCompanionToolScopes;
    const defaults = Object.freeze({
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
      // Per-request response cap (max_tokens) for agent tool rounds. 0 disables the cap and
      // auto-continues response-limit stops without asking for approval.
      agentMaxResponseTokens: 0,
      showReasoning: true,
      debugLogFullAiPayloads: false,
      inputSubmitMode: "ctrl-enter",
      // Per-scope enable toggles and idle-trigger timings. "Line" reuses the original
      // autocompleteIdleMs field (unchanged name, to avoid touching every existing
      // reference to it) so it now specifically means "line scope's idle wait." Block and
      // comment scopes are new and get their own timing: block defaults slower because it's
      // the expensive, rarer case (only fires on an empty-stub/intent-comment pattern, not
      // every keystroke) and a longer pause is a better "ready for a suggestion" signal for
      // it; comment defaults close to line since finishing a sentence and pausing briefly is
      // the natural rhythm of writing prose. Block started at 1600ms but that read as "nothing
      // is happening" during real testing — 1000ms is still meaningfully slower than line's
      // 700ms (this is the heavier, full-implementation request) without feeling broken.
      autocompleteLineEnabled: true,
      autocompleteBlockEnabled: true,
      autocompleteCommentEnabled: true,
      autocompleteIdleMs: 700,
      autocompleteBlockIdleMs: 1000,
      autocompleteCommentIdleMs: 800,
      autocompleteRejectCharacters: 24,
      autocompleteRejectDelayMs: 2500,
      autocompletePrefixLines: 60,
      autocompleteSuffixLines: 20,
      autocompleteContextProvidersEnabled: false,
      autocompleteModelFamily: "auto",
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
      // Plan-mode stateful controller (M8). Internal, default-off; no visible control.
      planStatefulControllerEnabled: false,
      // Chat-mode stateful controller (M9). Internal, default-off; no visible control.
      chatStatefulControllerEnabled: false,
      chatVerifierCompletionEnabled: false,
      chatProgressEvaluationEnabled: false,
      chatProgressControlEnabled: false,
      chatDurableRecoveryEnabled: false,
      // Intent provenance boundary (M11.1). Internal, default-off; no visible control.
      intentProvenanceBoundaryEnabled: false,
      // Task-profile routing (M11.2). Internal, default-off; no visible control.
      taskProfileRoutingEnabled: false,
      // Plan-mode reliability fixes (internal, default-on; disable independently).
      planCapabilityGateEnabled: true,
      planRequireSuccessToSaveEnabled: true,
      planGitReadToolsEnabled: true,
      // Per-domain tool availability allow-list (Settings -> AI). Read scopes on,
      // write/execution off. Core readers and edit tools are not governed here.
      toolScopes: toolScopeRegistry ? toolScopeRegistry.defaultToolScopes() : {},
      // Intent-contract feature (M1). Keep in sync with the headless defaults in
      // ai-companion/config/defaults.js so headless and browser runs behave identically.
      intentContractsEnabled: false,
      intentExperiment: { ...intentExperiment.ALL_ON },
      intentClarificationMode: "assume",
      intentFastPathEnabled: true,
      intentFastPathMaxPromptChars: 240,
      intentExtractionDeadlineMs: 12000,
      intentMaxOutputTokens: 1200,
      intentInjectedMaxChars: 3500,
      intentPerCriterionAssessment: true,
      intentCompletionSteeringEnabled: true,
      intentMaxCompletionRevisions: 3,
      aiSecurityPolicy: {
        version: 1,
        shell: { mode: "deny-and-audit" },
        packages: { rules: ["npm", "yarn", "pnpm", "maven", "gradle"].map(function(ecosystem) { return { ecosystem, packageId: "*", version: "*", action: "*", registry: "*" }; }) },
        packageBinaries: { npx: false, yarnDlx: false, pnpmDlx: false }
      }
    });

    function clampInteger(value, fallback, min, max) {
      const number = Number(value);
      if (!Number.isFinite(number)) return fallback;
      return Math.max(min, Math.min(max, Math.floor(number)));
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

    function normalize(settings) {
      const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
      const intentContractsEnabled = source.intentContractsEnabled === true;
      return {
        enabled: source.enabled === true,
        providerMode: ["openai", "google-gemini", "google-gemini-native", "anthropic", "xai", "ollama", "openai-compatible", "litellm", "gemini-connector", "gemini-connector-raw"].includes(source.providerMode) ? source.providerMode : "openai-compatible",
        baseUrl: String(source.baseUrl || defaults.baseUrl).trim(),
        apiKey: String(source.apiKey || ""),
        model: String(source.model || defaults.model).trim(),
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
        providerRequestDelayMs: clampInteger(source.providerRequestDelayMs, defaults.providerRequestDelayMs, 0, 60000),
        maxTokensPerChatMinute: clampInteger(source.maxTokensPerChatMinute, defaults.maxTokensPerChatMinute, 0, 1000000),
        maxTasksPerChat: clampInteger(source.maxTasksPerChat, defaults.maxTasksPerChat, 1, 200),
        agentMaxResponseTokens: clampInteger(source.agentMaxResponseTokens, defaults.agentMaxResponseTokens, 0, 128000),
        showReasoning: source.showReasoning !== false,
        debugLogFullAiPayloads: source.debugLogFullAiPayloads === true,
        inputSubmitMode: source.inputSubmitMode === "enter" ? "enter" : defaults.inputSubmitMode,
        autocompleteLineEnabled: source.autocompleteLineEnabled !== false,
        autocompleteBlockEnabled: source.autocompleteBlockEnabled !== false,
        autocompleteCommentEnabled: source.autocompleteCommentEnabled !== false,
        autocompleteIdleMs: clampInteger(source.autocompleteIdleMs, defaults.autocompleteIdleMs, 100, 10000),
        autocompleteBlockIdleMs: clampInteger(source.autocompleteBlockIdleMs, defaults.autocompleteBlockIdleMs, 100, 20000),
        autocompleteCommentIdleMs: clampInteger(source.autocompleteCommentIdleMs, defaults.autocompleteCommentIdleMs, 100, 10000),
        autocompleteRejectCharacters: clampInteger(source.autocompleteRejectCharacters, defaults.autocompleteRejectCharacters, 1, 1000),
        autocompleteRejectDelayMs: clampInteger(source.autocompleteRejectDelayMs, defaults.autocompleteRejectDelayMs, 0, 60000),
        autocompletePrefixLines: clampInteger(source.autocompletePrefixLines, defaults.autocompletePrefixLines, 5, 500),
        autocompleteSuffixLines: clampInteger(source.autocompleteSuffixLines, defaults.autocompleteSuffixLines, 1, 200),
        autocompleteContextProvidersEnabled: source.autocompleteContextProvidersEnabled === true,
        autocompleteModelFamily: ["auto", "starcoder", "deepseek-coder", "codellama", "codegemma", "instruct"].includes(source.autocompleteModelFamily)
          ? source.autocompleteModelFamily
          : defaults.autocompleteModelFamily,
        agentAutoRunCommands: source.agentAutoRunCommands === true,
        agentConfirmBeforeWrite: source.agentConfirmBeforeWrite !== false,
        chatRequestRoutingEnabled: source.chatRequestRoutingEnabled !== false,
        agentDecisionControllerEnabled: source.agentDecisionControllerEnabled === true,
        agentDurableRecoveryEnabled: source.agentDurableRecoveryEnabled === true,
        agentVerifierCompletionEnabled: source.agentVerifierCompletionEnabled === true,
        agentProgressEvaluationEnabled: source.agentProgressEvaluationEnabled === true
          || (source.agentDecisionControllerEnabled === true && source.intentContractsEnabled === true && source.agentProgressEvaluationEnabled !== false),
        agentProgressControlEnabled: source.agentProgressControlEnabled === true
          || (source.agentDecisionControllerEnabled === true && source.intentContractsEnabled === true && source.agentVerifierCompletionEnabled === true && source.agentProgressEvaluationEnabled !== false && source.agentProgressControlEnabled !== false),
        agentNoProgressActionLimit: clampInteger(source.agentNoProgressActionLimit, defaults.agentNoProgressActionLimit, 1, 10),
        agentMaxStrategyReplans: clampInteger(source.agentMaxStrategyReplans, defaults.agentMaxStrategyReplans, 0, 10),
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
        toolScopes: toolScopeRegistry ? toolScopeRegistry.normalizeToolScopes(source.toolScopes) : (source.toolScopes || {}),
        intentContractsEnabled,
        intentExperiment: intentExperiment.resolveIntentExperiment(source.intentExperiment, intentContractsEnabled, { rejectInvalid: true }),
        intentClarificationMode: ["ask", "assume", "off"].includes(source.intentClarificationMode) ? source.intentClarificationMode : "assume",
        intentFastPathEnabled: source.intentFastPathEnabled !== false,
        intentFastPathMaxPromptChars: clampInteger(source.intentFastPathMaxPromptChars, defaults.intentFastPathMaxPromptChars, 0, 4000),
        intentExtractionDeadlineMs: clampInteger(source.intentExtractionDeadlineMs, defaults.intentExtractionDeadlineMs, 1000, 120000),
        intentMaxOutputTokens: clampInteger(source.intentMaxOutputTokens, defaults.intentMaxOutputTokens, 256, 8000),
        intentInjectedMaxChars: clampInteger(source.intentInjectedMaxChars, defaults.intentInjectedMaxChars, 500, 6000),
        intentPerCriterionAssessment: source.intentPerCriterionAssessment !== false,
        intentCompletionSteeringEnabled: source.intentCompletionSteeringEnabled !== false,
        intentMaxCompletionRevisions: clampInteger(source.intentMaxCompletionRevisions, defaults.intentMaxCompletionRevisions, 0, 10),
        aiSecurityPolicy: source.aiSecurityPolicy && typeof source.aiSecurityPolicy === "object" && !Array.isArray(source.aiSecurityPolicy)
          ? JSON.parse(JSON.stringify(source.aiSecurityPolicy))
          : JSON.parse(JSON.stringify(defaults.aiSecurityPolicy))
      };
    }

    const api = { defaults, normalize };
    app.registerModule("aiCompanionSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionSettings = registerMarkdownViewerAiCompanionSettings;
})(window);

