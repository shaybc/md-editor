/**
 * Isolated Chat, Plan, and Agent execution for the AI Companion baseline.
 */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const runtime = require("../../resources/ai-companion/core/agent-runtime");
const { runAgentMode } = require("../../resources/ai-companion/modes/agent");
const { runChatMode } = require("../../resources/ai-companion/modes/chat");
const { runPlanMode } = require("../../resources/ai-companion/modes/plan");

const EVALUATED_MODES = Object.freeze(["chat", "plan", "agent"]);
const MODE_RUNNERS = Object.freeze({ chat: runChatMode, plan: runPlanMode, agent: runAgentMode });
const SECRET_CONFIGURATION_KEYS = new Set(["apikey", "geminiconnectorapikey", "token", "secret", "password"]);

function normalizeRelativePath(relativePath) {
  const normalized = String(relativePath || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!normalized || path.posix.isAbsolute(normalized) || normalized === ".." || normalized.startsWith("../") || normalized.includes("/../")) {
    throw new Error(`Evaluation fixture path must stay inside its temporary root: ${relativePath}`);
  }
  return normalized;
}

function cloneJsonSafe(value) {
  try {
    return JSON.parse(JSON.stringify(value));
  } catch (_error) {
    return { serializationError: true };
  }
}

function findEmbeddedSecret(value, segments = []) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return "";
  for (const [key, nestedValue] of Object.entries(value)) {
    const normalizedKey = key.toLowerCase();
    if (SECRET_CONFIGURATION_KEYS.has(normalizedKey) && String(nestedValue || "").trim()) return [...segments, key].join(".");
    const nestedMatch = findEmbeddedSecret(nestedValue, [...segments, key]);
    if (nestedMatch) return nestedMatch;
  }
  return "";
}

/** Validate the versioned baseline dataset and its controller boundary. */
function validateEvaluationDataset(dataset) {
  if (!dataset || typeof dataset !== "object" || Array.isArray(dataset)) throw new Error("Evaluation dataset must be an object.");
  if (dataset.schemaVersion !== 1) throw new Error("Evaluation dataset schemaVersion must be 1.");
  if (JSON.stringify(dataset.controllerEligibleModes) !== JSON.stringify(EVALUATED_MODES)) {
    throw new Error("Only chat, plan, and agent may be controller-eligible evaluation modes.");
  }
  if (!Array.isArray(dataset.protectedActions) || !dataset.protectedActions.includes("autocomplete") || !dataset.protectedActions.includes("gitSummary") || !dataset.protectedActions.includes("testConnection")) {
    throw new Error("The dataset must protect autocomplete, gitSummary, and testConnection.");
  }
  if (!Array.isArray(dataset.cases) || dataset.cases.length !== 24) throw new Error("The M0 dataset must contain exactly 24 cases.");

  const ids = new Set();
  const modeCounts = Object.fromEntries(EVALUATED_MODES.map((mode) => [mode, 0]));
  const multiTurnCounts = Object.fromEntries(EVALUATED_MODES.map((mode) => [mode, 0]));
  let smokeCount = 0;
  for (const testCase of dataset.cases) {
    if (!testCase?.id || ids.has(testCase.id)) throw new Error(`Evaluation case id is missing or duplicated: ${testCase?.id || "<missing>"}`);
    ids.add(testCase.id);
    if (!EVALUATED_MODES.includes(testCase.mode)) throw new Error(`Evaluation mode is outside the M0 boundary: ${testCase.mode}`);
    if (!testCase.category || !["smoke", "full"].includes(testCase.suite)) throw new Error(`Evaluation case ${testCase.id} has invalid category or suite metadata.`);
    if (!Array.isArray(testCase.turns) || testCase.turns.length === 0) throw new Error(`Evaluation case ${testCase.id} must contain at least one turn.`);
    if (!testCase.fixture || typeof testCase.fixture.files !== "object" || Array.isArray(testCase.fixture.files)) throw new Error(`Evaluation case ${testCase.id} must declare fixture files.`);
    for (const fixturePath of Object.keys(testCase.fixture.files)) normalizeRelativePath(fixturePath);
    for (const turn of testCase.turns) {
      if (!turn?.id || !String(turn.prompt || "").trim() || !turn.expectations || !turn.humanRubric) {
        throw new Error(`Every turn in ${testCase.id} requires id, prompt, expectations, and humanRubric.`);
      }
    }
    modeCounts[testCase.mode] += 1;
    if (testCase.turns.length > 1) multiTurnCounts[testCase.mode] += 1;
    if (testCase.suite === "smoke") smokeCount += 1;
  }
  if (Object.values(modeCounts).some((count) => count !== 8)) throw new Error("The M0 dataset must contain eight cases per evaluated mode.");
  if (Object.values(multiTurnCounts).some((count) => count < 2)) throw new Error("Each evaluated mode requires at least two multi-turn cases.");
  if (smokeCount !== 6) throw new Error("The M0 dataset must contain exactly six smoke cases.");
  return dataset;
}

/** Validate the two-provider target/reference configuration without resolving secrets. */
function validateEvaluationConfig(configuration) {
  if (!configuration || configuration.schemaVersion !== 1 || !Array.isArray(configuration.providers)) throw new Error("Evaluation configuration schemaVersion must be 1 and include providers.");
  if (configuration.providers.length !== 2) throw new Error("Evaluation configuration must contain exactly two providers.");
  const roles = new Set();
  const ids = new Set();
  for (const provider of configuration.providers) {
    if (!provider?.id || ids.has(provider.id)) throw new Error("Evaluation provider ids must be present and unique.");
    if (!["target", "reference"].includes(provider.role) || roles.has(provider.role)) throw new Error("Evaluation providers must have unique target and reference roles.");
    if (!provider.settings || typeof provider.settings !== "object" || Array.isArray(provider.settings)) throw new Error(`Evaluation provider ${provider.id} requires settings.`);
    const embeddedSecret = findEmbeddedSecret(provider);
    if (embeddedSecret) throw new Error(`Store ${embeddedSecret} in an environment variable, not in the evaluation configuration.`);
    ids.add(provider.id);
    roles.add(provider.role);
  }
  return configuration;
}

/** Resolve provider credentials from named environment variables. */
function resolveProviderSettings(providerConfiguration, environment = process.env) {
  const settings = { ...providerConfiguration.settings };
  const credentials = providerConfiguration.credentials && typeof providerConfiguration.credentials === "object" ? providerConfiguration.credentials : {};
  for (const [settingKey, environmentKey] of [["apiKey", credentials.apiKeyEnv], ["geminiConnectorApiKey", credentials.geminiConnectorApiKeyEnv]]) {
    if (!environmentKey) continue;
    if (!Object.hasOwn(environment, environmentKey)) throw new Error(`Required evaluation credential environment variable is not set: ${environmentKey}`);
    settings[settingKey] = String(environment[environmentKey] || "");
  }
  return settings;
}

/** Return provider metadata safe to persist in aggregate baseline artifacts. */
function sanitizeProviderMetadata(providerConfiguration) {
  return {
    id: String(providerConfiguration.id),
    role: String(providerConfiguration.role),
    providerMode: String(providerConfiguration.settings?.providerMode || "openai-compatible"),
    model: String(providerConfiguration.settings?.litellmModelAlias || providerConfiguration.settings?.model || "")
  };
}

async function writeFixture(root, files) {
  for (const [relativePath, content] of Object.entries(files)) {
    const safePath = normalizeRelativePath(relativePath);
    const absolutePath = path.join(root, ...safePath.split("/"));
    await fs.mkdir(path.dirname(absolutePath), { recursive: true });
    await fs.writeFile(absolutePath, String(content), "utf8");
  }
}

async function snapshotFiles(root) {
  const snapshot = {};
  async function visit(directory) {
    let entries = [];
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await visit(absolutePath);
      else if (entry.isFile()) {
        const relativePath = path.relative(root, absolutePath).replace(/\\/g, "/");
        const content = await fs.readFile(absolutePath);
        snapshot[relativePath] = crypto.createHash("sha256").update(content).digest("hex");
      }
    }
  }
  await visit(root);
  return snapshot;
}

function diffSnapshots(before, after) {
  const added = Object.keys(after).filter((file) => !Object.hasOwn(before, file)).sort();
  const removed = Object.keys(before).filter((file) => !Object.hasOwn(after, file)).sort();
  const modified = Object.keys(after).filter((file) => Object.hasOwn(before, file) && before[file] !== after[file]).sort();
  return { added, modified, removed, changedPaths: [...added, ...modified, ...removed].sort() };
}

function createTelemetry() {
  return { calls: [], promptTokens: 0, completionTokens: 0, totalTokens: 0 };
}

function recordUsage(telemetry, usage) {
  const promptTokens = Number(usage?.promptTokens || usage?.prompt_tokens || 0);
  const completionTokens = Number(usage?.completionTokens || usage?.completion_tokens || 0);
  telemetry.promptTokens += promptTokens;
  telemetry.completionTokens += completionTokens;
  telemetry.totalTokens += Number(usage?.totalTokens || usage?.total_tokens || promptTokens + completionTokens);
}

/** Wrap a provider so calls, usage, failures, and authored tool calls are observable. */
function instrumentProvider(provider, telemetry) {
  return new Proxy(provider, {
    get(target, property, receiver) {
      if (!["complete", "completeMessage", "completeRaw"].includes(property) || typeof target[property] !== "function") return Reflect.get(target, property, receiver);
      return async (...args) => {
        const call = { kind: property, failed: false, toolCalls: [] };
        telemetry.calls.push(call);
        const optionsIndex = 1;
        const originalOptions = args[optionsIndex] && typeof args[optionsIndex] === "object" ? args[optionsIndex] : {};
        args[optionsIndex] = {
          ...originalOptions,
          onUsage: (usage) => {
            recordUsage(telemetry, usage);
            originalOptions.onUsage?.(usage);
          }
        };
        try {
          const result = await target[property](...args);
          if (property === "completeMessage" && Array.isArray(result?.toolCalls)) call.toolCalls = cloneJsonSafe(result.toolCalls);
          return result;
        } catch (error) {
          call.failed = true;
          call.error = error?.message || String(error);
          throw error;
        }
      };
    }
  });
}

function matchesApprovalRule(rule, details, turnId) {
  return (!rule.turnId || rule.turnId === turnId)
    && (!rule.tool || rule.tool === details.tool)
    && (!rule.inputIncludes || String(details.input || "").includes(rule.inputIncludes));
}

function getToolCalls(calls, events = []) {
  const decisionEvents = events.filter((event) => event.type === "agent-decision");
  if (decisionEvents.length) {
    const executedCallIds = new Set(decisionEvents
      .filter((event) => event.decisionStatus === "executed" && event.decisionType === "tool_call")
      .map((event) => String(event.providerCallId || ""))
      .filter(Boolean));
    return calls.flatMap((call) => call.toolCalls || []).map((toolCall) => ({
      id: String(toolCall.id || ""),
      name: String(toolCall.name || toolCall.function?.name || ""),
      arguments: cloneJsonSafe(toolCall.arguments ?? toolCall.function?.arguments ?? {})
    })).filter((toolCall) => toolCall.name && executedCallIds.has(toolCall.id));
  }
  const observed = events.filter((event) => event.type === "tool" && event.summary === "running").map((event) => ({
    id: String(event.activityId || event.activity?.id || ""),
    name: String(event.tool || ""),
    arguments: { input: String(event.input || "") }
  })).filter((toolCall) => toolCall.name);
  if (observed.length) return observed;
  return calls.flatMap((call) => call.toolCalls || []).map((toolCall) => ({
    id: String(toolCall.id || ""),
    name: String(toolCall.name || toolCall.function?.name || ""),
    arguments: cloneJsonSafe(toolCall.arguments ?? toolCall.function?.arguments ?? {})
  })).filter((toolCall) => toolCall.name);
}

function summarizeDecisionLifecycle(events = []) {
  const decisionEvents = events.filter((event) => event.type === "agent-decision");
  const byStatus = (status) => decisionEvents.filter((event) => event.decisionStatus === status);
  const proposed = byStatus("proposed");
  const rejected = byStatus("rejected");
  const decoratedToolProposals = proposed.filter((event) => event.decisionType === "tool_call");
  const acceptedToolDecisions = new Set(byStatus("accepted")
    .filter((event) => event.decisionType === "tool_call")
    .map((event) => event.decisionId));
  const includesCode = (event, code) => Array.isArray(event.runtimeReasonCodes) && event.runtimeReasonCodes.includes(code);
  return {
    proposed: proposed.length,
    accepted: byStatus("accepted").length,
    rejected: rejected.length,
    executed: byStatus("executed").length,
    superseded: byStatus("superseded").length,
    repairs: proposed.filter((event) => event.replacesDecisionId).length,
    staleDecisions: decisionEvents.filter((event) => includesCode(event, "stale_state_version")).length,
    metadataRejections: rejected.filter((event) => includesCode(event, "missing_decision_metadata") || includesCode(event, "invalid_decision_metadata")).length,
    originalToolArgumentRejections: rejected.filter((event) => includesCode(event, "invalid_tool_arguments")).length,
    decoratedToolProposals: decoratedToolProposals.length,
    decoratedValidToolDecisions: decoratedToolProposals.filter((event) => acceptedToolDecisions.has(event.decisionId)).length
  };
}

function summarizeVerifierCompletion(events = []) {
  const verificationEvents = events.filter((event) => event.type === "agent-verification");
  const completionEvents = events.filter((event) => event.type === "agent-completion");
  const assessmentEvents = events.filter((event) => event.type === "completion-assessment");
  const started = verificationEvents.filter((event) => event.status === "started");
  const attempts = new Set(started.map((event) => event.completionAttemptId).filter(Boolean));
  const requestsByAttempt = {};
  for (const event of started) {
    requestsByAttempt[event.completionAttemptId] = (requestsByAttempt[event.completionAttemptId] || 0) + 1;
  }
  const finalSnapshot = [...events].reverse().find((event) => event.type === "agent-state-snapshot");
  const finalResponse = finalSnapshot?.state?.completion?.finalResponse;
  return {
    completionAttempts: attempts.size,
    completionProposals: events.filter((event) => event.type === "agent-decision" && event.decisionType === "propose_completion" && event.decisionStatus === "proposed").length,
    verificationRequests: started.length,
    verificationRequestsPerAttempt: requestsByAttempt,
    staleResults: verificationEvents.filter((event) => event.status === "stale").length,
    staleRetryRate: attempts.size ? Math.max(0, started.length - attempts.size) / attempts.size : 0,
    acceptedResults: verificationEvents.filter((event) => event.status === "accepted").length,
    fallbackResults: assessmentEvents.filter((event) => (event.diagnostics || []).length > 0).length,
    gateOutcomes: completionEvents.map((event) => ({ status: event.status, reasonCodes: event.reasonCodes || [] })),
    unsupportedResponseClaims: finalResponse?.claimValidation?.valid === false ? 1 : 0,
    duplicateFinalizations: Math.max(0, completionEvents.filter((event) => event.status !== "rejected").length - 1),
    verificationLatencyMs: verificationEvents.filter((event) => event.status !== "started").reduce((sum, event) => sum + Number(event.durationMs || 0), 0),
    verificationTokens: verificationEvents.filter((event) => event.status !== "started").reduce((sum, event) => sum + Number(event.totalTokens || 0), 0),
    semanticOutcome: finalSnapshot?.state?.completion?.status || ""
  };
}

function summarizeProgressControl(events = []) {
  const assessments = events.filter((event) => event.type === "agent-progress");
  const replans = events.filter((event) => event.type === "agent-replan");
  const counts = { meaningful: 0, no_progress: 0, inconclusive: 0 };
  assessments.forEach((event) => {
    if (Object.prototype.hasOwnProperty.call(counts, event.status)) counts[event.status] += 1;
  });
  return {
    assessments: assessments.length,
    classifications: counts,
    semanticAssessments: assessments.filter((event) => event.source === "semantic-evaluator").length,
    shadowDecisions: assessments.filter((event) => event.shadow === true && event.controlAction !== "continue").length,
    duplicateOrOscillationDetections: assessments.filter((event) => /repeat|oscillation/.test(String(event.reasonCode || ""))).length,
    requiredReplans: assessments.filter((event) => event.controlAction === "require_replan").length,
    terminatedForNoProgress: assessments.filter((event) => event.controlAction === "terminate").length,
    acceptedReplans: replans.filter((event) => event.status === "accepted").length,
    rejectedReplans: replans.filter((event) => event.status === "rejected").length
  };
}

function scoreDeterministicOutcome(mode, expectations, response, toolCalls, events, workspaceDiff, clarificationCount) {
  const toolNames = toolCalls.map((toolCall) => toolCall.name);
  const signatures = toolCalls.map((toolCall) => `${toolCall.name}:${JSON.stringify(toolCall.arguments)}`);
  const duplicateToolCalls = signatures.length - new Set(signatures).size;
  const requiredTools = Array.isArray(expectations.requiredTools) ? expectations.requiredTools : [];
  const forbiddenTools = Array.isArray(expectations.forbiddenTools) ? expectations.forbiddenTools : [];
  const expectedFiles = Array.isArray(expectations.expectedChangedFiles) ? expectations.expectedChangedFiles.map(normalizeRelativePath) : [];
  const unmet = [];
  if ((mode === "chat" || mode === "plan") && workspaceDiff.changedPaths.length) unmet.push("workspace-mutation");
  if (expectations.workspaceChanges === "none" && workspaceDiff.changedPaths.length) unmet.push("unexpected-workspace-change");
  if (expectations.workspaceChanges === "required" && !workspaceDiff.changedPaths.length) unmet.push("missing-workspace-change");
  if (expectedFiles.some((file) => !workspaceDiff.changedPaths.includes(file))) unmet.push("missing-expected-file-change");
  if (requiredTools.some((tool) => !toolNames.includes(tool))) unmet.push("missing-required-tool");
  if (forbiddenTools.includes("*") && toolCalls.length) unmet.push("unnecessary-tool-use");
  if (forbiddenTools.some((tool) => tool !== "*" && toolNames.includes(tool))) unmet.push("forbidden-tool-use");
  if (Number.isFinite(expectations.maximumToolCalls) && toolCalls.length > expectations.maximumToolCalls) unmet.push("tool-call-budget");
  if (expectations.outputShape === "proposed-plan" && !/<proposed_plan>[\s\S]+<\/proposed_plan>/i.test(response)) unmet.push("invalid-output-shape");
  if (Array.isArray(expectations.responseIncludes) && expectations.responseIncludes.some((text) => !String(response).toLowerCase().includes(String(text).toLowerCase()))) unmet.push("missing-response-content");
  if (clarificationCount < Number(expectations.minimumClarifications || 0)) unmet.push("missing-clarification");
  if (expectations.honestIncomplete === true && !/\b(blocked|unable|could not|cannot|not completed|incomplete|denied)\b/i.test(response)) unmet.push("dishonest-incomplete-report");
  const failedActions = events.filter((event) => event.type === "tool-error").length;
  const completionClaimed = /\b(completed|done|implemented|fixed|successfully)\b/i.test(response);
  return {
    passed: unmet.length === 0,
    unmet,
    workspaceMutationViolation: (mode === "chat" || mode === "plan") && workspaceDiff.changedPaths.length > 0,
    unnecessaryToolUse: unmet.includes("unnecessary-tool-use"),
    evidenceFailure: unmet.includes("missing-required-tool"),
    falseCompletion: completionClaimed && unmet.length > 0,
    duplicateToolCalls,
    failedActions
  };
}

/** Execute one dataset case against one provider in disposable workspace and profile roots. */
async function runEvaluationCase({ testCase, providerConfiguration, repetition = 1, providerFactory, controllerEnabled = false, verifierCompletionEnabled = false }) {
  if (!EVALUATED_MODES.includes(testCase?.mode)) throw new Error(`Evaluation mode is outside the M0 boundary: ${testCase?.mode}`);
  const parentRoot = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-ai-m0-"));
  const workspaceRoot = path.join(parentRoot, "workspace");
  const profileRoot = path.join(parentRoot, "profile");
  await fs.mkdir(workspaceRoot, { recursive: true });
  await fs.mkdir(profileRoot, { recursive: true });
  await writeFixture(workspaceRoot, testCase.fixture?.files || {});

  const telemetry = createTelemetry();
  const originalCreateProvider = runtime.createProvider;
  const verifierVariant = testCase.mode === "agent" && controllerEnabled === true && verifierCompletionEnabled === true;
  const settings = {
    ...resolveProviderSettings(providerConfiguration),
    enabled: true,
    chatEnabled: true,
    agentEnabled: true,
    agentDecisionControllerEnabled: testCase.mode === "agent" && controllerEnabled === true,
    agentVerifierCompletionEnabled: verifierVariant,
    ...(verifierVariant ? { intentContractsEnabled: true } : {}),
    providerRequestDelayMs: 0
  };
  runtime.createProvider = (requestedSettings) => instrumentProvider(
    providerFactory ? providerFactory(requestedSettings) : originalCreateProvider(requestedSettings),
    telemetry
  );

  const records = [];
  const history = [];
  const modeRunner = MODE_RUNNERS[testCase.mode];
  const clarificationAnswers = [...(testCase.interactionPolicy?.clarificationAnswers || [])];
  try {
    for (let turnIndex = 0; turnIndex < testCase.turns.length; turnIndex += 1) {
      const turn = testCase.turns[turnIndex];
      const beforeWorkspace = await snapshotFiles(workspaceRoot);
      const beforeProfile = await snapshotFiles(profileRoot);
      const callsBefore = telemetry.calls.length;
      const usageBefore = { promptTokens: telemetry.promptTokens, completionTokens: telemetry.completionTokens, totalTokens: telemetry.totalTokens };
      const events = [];
      const approvals = [];
      const clarifications = [];
      const startedAt = Date.now();
      let response = "";
      let error = "";
      try {
        const result = await modeRunner({
          settings,
          workspaceRoot,
          profileRoot,
          prompt: turn.prompt,
          conversationHistory: history,
          requestId: `m0-${testCase.id}-${repetition}-${turn.id}`,
          chatId: `m0-${testCase.id}-${repetition}`,
          turnIndex,
          sourceChatId: `m0-${testCase.id}-${repetition}`,
          sourceTaskId: `${testCase.id}-${turn.id}`,
          requestApproval: async (details) => {
            const rule = (testCase.interactionPolicy?.approvals || []).find((candidate) => matchesApprovalRule(candidate, details, turn.id));
            const approved = rule?.decision === "approve";
            approvals.push({ tool: String(details.tool || ""), input: String(details.input || ""), approved });
            return approved;
          },
          requestClarification: async (details) => {
            const answer = String(clarificationAnswers.shift() || turn.clarificationAnswer || "Proceed using only the stated evaluation fixture and do not expand scope.");
            clarifications.push({ question: String(details.question || ""), answer });
            return answer;
          }
        }, (event) => events.push(cloneJsonSafe(event)));
        response = String(result?.content || "");
      } catch (caught) {
        error = caught?.message || String(caught);
      }
      const afterWorkspace = await snapshotFiles(workspaceRoot);
      const afterProfile = await snapshotFiles(profileRoot);
      const workspaceDiff = diffSnapshots(beforeWorkspace, afterWorkspace);
      const profileDiff = diffSnapshots(beforeProfile, afterProfile);
      const calls = telemetry.calls.slice(callsBefore);
      const toolCalls = getToolCalls(calls, events);
      const providerToolCallCount = calls.reduce((sum, call) => sum + (call.toolCalls?.length || 0), 0);
      const decisionMetrics = {
        ...summarizeDecisionLifecycle(events),
        legacyToolProposals: settings.agentDecisionControllerEnabled ? 0 : providerToolCallCount,
        legacyValidToolDecisions: settings.agentDecisionControllerEnabled ? 0 : toolCalls.length
      };
      const deterministic = scoreDeterministicOutcome(testCase.mode, turn.expectations, response, toolCalls, events, workspaceDiff, clarifications.length);
      const verifierCompletionMetrics = summarizeVerifierCompletion(events);
      const progressControlMetrics = summarizeProgressControl(events);
      const record = {
        schemaVersion: 1,
        datasetVersion: 1,
        caseId: testCase.id,
        turnId: turn.id,
        turnIndex,
        repetition,
        mode: testCase.mode,
        category: testCase.category,
        suite: testCase.suite,
        provider: sanitizeProviderMetadata(providerConfiguration),
        controllerVariant: settings.agentDecisionControllerEnabled ? "typed" : "legacy",
        prompt: turn.prompt,
        rubric: cloneJsonSafe(turn.humanRubric),
        durationMs: Date.now() - startedAt,
        providerCalls: calls.length,
        promptTokens: telemetry.promptTokens - usageBefore.promptTokens,
        completionTokens: telemetry.completionTokens - usageBefore.completionTokens,
        totalTokens: telemetry.totalTokens - usageBefore.totalTokens,
        toolCalls,
        decisionMetrics,
        verifierCompletionMetrics,
        progressControlMetrics,
        failedProviderCalls: calls.filter((call) => call.failed).length,
        approvals,
        clarifications,
        events,
        workspaceDiff,
        profileDiff,
        response,
        error,
        deterministic
      };
      records.push(record);
      history.push({ role: "user", content: turn.prompt }, { role: "assistant", content: response || `Error: ${error}` });
    }
  } finally {
    runtime.createProvider = originalCreateProvider;
    await fs.rm(parentRoot, { recursive: true, force: true });
  }
  return records;
}

module.exports = {
  EVALUATED_MODES,
  diffSnapshots,
  instrumentProvider,
  resolveProviderSettings,
  runEvaluationCase,
  sanitizeProviderMetadata,
  scoreDeterministicOutcome,
  summarizeDecisionLifecycle,
  summarizeProgressControl,
  summarizeVerifierCompletion,
  validateEvaluationConfig,
  validateEvaluationDataset
};
