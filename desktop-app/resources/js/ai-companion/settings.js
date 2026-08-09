(function(window) {
  "use strict";

  function registerMarkdownViewerAiCompanionSettings(app) {
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
      agentMaxResponseTokens: 0,
      showReasoning: true,
      debugLogFullAiPayloads: false,
      inputSubmitMode: "ctrl-enter",
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
      permissionMode: "guided",
      connectionProfiles: [],
      providerRoutes: [],
      internetSearchEndpoint: "",
      workspaceStructureAutoInclude: false,
      toolScopes: toolScopeRegistry ? toolScopeRegistry.defaultToolScopes() : {},
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

    function normalize(settings) {
      const source = settings && typeof settings === "object" && !Array.isArray(settings) ? settings : {};
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
        permissionMode: ["guided", "observe-only", "edit-trusted", "risk-routed", "preauthorized-only", "sandbox-unattended"].includes(source.permissionMode) ? source.permissionMode : "guided",
        connectionProfiles: Array.isArray(source.connectionProfiles) ? source.connectionProfiles.map(function(entry) { return Object.assign({}, entry, { id: String(entry && entry.id || "").trim(), providerMode: String(entry && entry.providerMode || "openai-compatible"), model: String(entry && entry.model || "").trim() }); }).filter(function(entry) { return entry.id; }).slice(0, 30) : [],
        providerRoutes: Array.isArray(source.providerRoutes) ? source.providerRoutes.map(function(entry) { return { id: String(entry && entry.id || "").trim(), profileId: String(entry && entry.profileId || "default").trim(), model: String(entry && entry.model || "").trim(), purposes: Array.isArray(entry && entry.purposes) ? entry.purposes.map(String).slice(0, 10) : ["primary"], fallbacks: Array.isArray(entry && entry.fallbacks) ? entry.fallbacks.map(String).filter(Boolean).slice(0, 8) : [], allowProviderChange: entry && entry.allowProviderChange === true, dataScopes: entry && entry.dataScopes && typeof entry.dataScopes === "object" ? Object.assign({}, entry.dataScopes) : {}, contextWindow: clampInteger(entry && entry.contextWindow, 0, 0, 10000000), maxOutputTokens: clampInteger(entry && entry.maxOutputTokens, 0, 0, 1000000), capabilities: entry && entry.capabilities && typeof entry.capabilities === "object" ? Object.assign({}, entry.capabilities) : {} }; }).filter(function(entry) { return entry.id; }).slice(0, 50) : [],
        internetSearchEndpoint: String(source.internetSearchEndpoint || "").trim(),
        workspaceStructureAutoInclude: source.workspaceStructureAutoInclude === true,
        toolScopes: toolScopeRegistry ? toolScopeRegistry.normalizeToolScopes(source.toolScopes) : (source.toolScopes || {}),
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
