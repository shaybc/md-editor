"use strict";

const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const test = require("node:test");

const { runAgentToolLoop, _test: toolLoopTest } = require("../resources/ai-companion/core/agent-tool-loop");
const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { createResumeAction } = require("../resources/ai-companion/core/interrupted-task-resume");
const { extractContract } = require("../resources/ai-companion/core/intent-analysis");
const { normalizeIntentContract } = require("../resources/ai-companion/core/intent-contract");

const VALID_CONTRACT = {
  taskType: "implementation",
  relationshipToPrior: "independent",
  goal: { value: "Add retry to the uploader", provenance: "explicit" },
  expectedOutcome: { value: "Uploads retry up to three times", provenance: "inferred" },
  requestedActions: [{ value: "Add retry handling", provenance: "explicit" }],
  prohibitedActions: [],
  outOfScope: [],
  acceptanceCriteria: [{ description: "The uploader retry behavior on HTTP 500 is verified by tests", verification: "Exercise the HTTP 500 path", provenance: "inferred" }],
  namedTargets: { files: [], symbols: [], errors: [], uiAreas: [] },
  assumptions: [],
  unresolvedDecisions: [],
  ambiguities: [],
  relationshipEvidence: [],
  carriedFieldRefs: [],
  correctedFieldRefs: []
};

test("tool reliability note uses a strict greater-than-forty-percent threshold", () => {
  assert.equal(toolLoopTest.appendToolReliabilityNote("answer", { executed: 5, failed: 2, partial: 1 }), "answer");
  assert.equal(
    toolLoopTest.appendToolReliabilityNote("answer", { executed: 7, failed: 3, partial: 2 }),
    "answer\n\nTool execution note: 3 of 7 tool calls failed (43%). 2 additional tool calls returned partial results."
  );
});

test("an unchanged non-retryable tool failure is not executed twice", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    let round = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ kind: "completeMessage", messages, toolChoice: opts.toolChoice, tools: opts.tools });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(VALID_CONTRACT) } }] };
      }
      if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") {
        return validAssessmentMessage("unmet");
      }
      round += 1;
      if (round <= 2) {
        return {
          content: "",
          toolCalls: [{ id: `pref-${round}`, function: { name: "preferences_get", arguments: JSON.stringify({ keys: ["missingPreference"] }) } }]
        };
      }
      return { content: "answer", toolCalls: [] };
    };
    let executions = 0;
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    const content = await runAgentToolLoop(provider, settings, root, "read a missing preference", "agent", () => {}, runtime, {
      prompts,
      requestAppAction: async () => {
        executions += 1;
        return {
          status: "failed",
          entries: [],
          page: { returned: 0, hasMore: false, nextCursor: null },
          errors: [{ code: "unknown-preference", path: ["missingPreference"], retryable: false, message: "The requested preference does not exist." }],
          complete: false
        };
      }
    });

    assert.equal(executions, 1);
    assert.match(content, /Tool execution note: 1 of 2 tool calls failed \(50%\)\./);
    const toolResult = roundCalls(provider)
      .flatMap((call) => call.messages)
      .find((message) => message.role === "tool" && message.tool_call_id === "pref-1");
    assert.equal(JSON.parse(toolResult.content).status, "failed");
    assert.equal(JSON.parse(toolResult.content).truncated, undefined);
  });
});

test("equivalent intent-blocked mutations share a semantic non-retryable cache entry", async () => {
  await withTempRoot(async (root) => {
    const blockedContract = {
      ...VALID_CONTRACT,
      unresolvedDecisions: [{
        id: "D1",
        description: "The destination is unresolved.",
        controlsMutation: true,
        controlledCapabilities: [],
        controlledTargets: ["help/developer/example.md"]
      }]
    };
    const provider = { complete: async () => "streamed final answer" };
    let round = 0;
    provider.completeMessage = async (_messages, opts = {}) => {
      const forcedTool = opts.toolChoice?.function?.name;
      if (forcedTool === "capture_intent_contract") {
        return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(blockedContract) } }] };
      }
      if (forcedTool === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
      if (forcedTool === "rewrite_assessed_candidate") {
        return {
          content: "",
          toolCalls: [{
            id: "rewrite",
            function: {
              name: "rewrite_assessed_candidate",
              arguments: JSON.stringify({ content: "The mutation remained blocked by the unresolved destination.", acknowledgedUnmetCriterionIds: ["AC1"] })
            }
          }]
        };
      }
      round += 1;
      if (round === 1) {
        return {
          content: "",
          toolCalls: [{
            id: "blocked-create",
            function: {
              name: "create_document_tab",
              arguments: JSON.stringify({ path: "help/developer/example.md", content: "one", approvalReason: "Create the document." })
            }
          }]
        };
      }
      if (round === 2) {
        return {
          content: "",
          toolCalls: [{
            id: "blocked-write",
            function: {
              name: "write_file",
              arguments: JSON.stringify({ path: "help/developer/other.md", content: "two", approvalReason: "Write the document." })
            }
          }]
        };
      }
      return { content: "The file was written.", toolCalls: [] };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "off" });
    await runAgentToolLoop(provider, settings, root, "write the developer document", "agent", emit, runtime, { prompts });

    const blockedEvents = events.filter((event) => event.structuredResult?.error?.code === "intent-mutation-blocked");
    assert.equal(blockedEvents.length, 2);
    assert.equal(blockedEvents[0].structuredResult.error.retryable, false);
    assert.equal(blockedEvents[0].structuredResult.error.decisionId, "D1");
    assert.equal(blockedEvents[0].structuredResult.error.capability, "workspace.file.write");
    assert.equal(blockedEvents[0].structuredResult.error.resource, "help/developer/example.md");
    assert.equal(blockedEvents[1].structuredResult.repeatedWithoutExecution, true);
    assert.equal(blockedEvents[1].structuredResult.error.resource, "help/developer/other.md");
    const summary = events.find((event) => event.type === "agent-summary");
    assert.deepEqual(summary.attemptedChanges, []);
    assert.equal(summary.blockedChanges.length, 1);
    assert.equal(summary.blockedChanges[0].count, 2);
  });
});

/** Minimal runtime shim matching the two helpers runAgentToolLoop uses. */
const runtime = {
  throwIfAborted() {},
  estimateTokens: (value) => Math.ceil(String(value || "").length / 4)
};

const prompts = {
  intentExtractionSystem: "You are the intent-analysis stage.",
  toolLoopFinalAnswer: "Provide the final answer.",
  chatSystem: "chat",
  agentSystem: "agent"
};

function validAssessmentMessage(status = "unmet", evidenceIds = []) {
  return {
    content: "",
    toolCalls: [{
      id: "assessment-1",
      function: {
        name: "assess_acceptance_criteria",
        arguments: JSON.stringify({
          overallStatus: status === "met" ? "complete" : "incomplete",
          criteria: [{ id: "AC1", status, evidenceIds, explanation: status === "met" ? "Verified." : "Not verified.", claimType: "workspace-state" }],
          unmetSummary: status === "met" ? "" : "The requested workspace change was not verified."
        })
      }
    }]
  };
}

function toolCallMessage(id, name, args) {
  return {
    content: "",
    toolCalls: [{ id, function: { name, arguments: JSON.stringify(args) } }]
  };
}

/**
 * Build a provider stub that records every call and answers extraction calls (forced
 * capture_intent_contract) with a valid contract and round calls with no tool calls.
 */
function makeProvider() {
  const calls = [];
  return {
    calls,
    completeMessage: async (messages, opts = {}) => {
      calls.push({ kind: "completeMessage", messages, toolChoice: opts.toolChoice, tools: opts.tools });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(VALID_CONTRACT) } }] };
      }
      if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
      return { content: "answer", toolCalls: [] };
    },
    complete: async (messages) => {
      calls.push({ kind: "complete", messages });
      return "streamed final answer";
    }
  };
}

test("intent extraction always receives the harness-owned explicit location coverage rule", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "Link it from the developer help pages", "agent", () => {}, runtime, { prompts });

    const extraction = extractionCalls(provider)[0];
    const userMessage = extraction.messages.find((message) => message.role === "user");
    assert.match(userMessage.content, /every explicitly named file, symbol, error, guide, page, section, panel, settings area, tab, or other UI area/);
    assert.match(userMessage.content, /must appear in namedTargets\.uiAreas/);
  });
});

test("an under-decomposed conformance contract triggers the bounded extraction repair path", async () => {
  let calls = 0;
  const messagesByCall = [];
  const provider = {
    completeMessage: async (messages) => {
      messagesByCall.push(messages);
      calls += 1;
      // First attempt: a conformance task with only an inspection criterion (no comparison)
      // must fail the Task 3 decomposition gate and trigger one repair attempt.
      const value = calls === 1
        ? {
          ...VALID_CONTRACT,
          taskType: "conformance",
          goal: { value: "Check whether the doc matches the code", provenance: "explicit" },
          expectedOutcome: { value: "Documentation gaps are known", provenance: "inferred" },
          acceptanceCriteria: [{ shape: "conformance-inspection", statement: "The code modules were read", mustInspect: ["core/x.js"], provenance: "inferred" }]
        }
        : VALID_CONTRACT;
      return { content: "", toolCalls: [{ id: `capture-${calls}`, function: { name: "capture_intent_contract", arguments: JSON.stringify(value) } }] };
    }
  };

  const result = await extractContract({
    provider,
    settings: { intentMaxOutputTokens: 2000 },
    prompts,
    prompt: "check whether the doc matches the code",
    mode: "agent"
  });

  assert.equal(calls, 2);
  assert.equal(result.source, "extracted");
  assert.match(messagesByCall[1].at(-1).content, /conformance-missing-comparison-criterion/);
});

async function withTempRoot(run) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "md-editor-intent-phase-"));
  await fs.writeFile(path.join(root, "readme.md"), "# temp\n", "utf8");
  try {
    return await run(root);
  } finally {
    await fs.rm(root, { recursive: true, force: true });
  }
}

function collectEvents() {
  const events = [];
  return { emit: (event) => events.push(event), events };
}

function roundCalls(provider) {
  return provider.calls.filter((call) => call.kind === "completeMessage" && call.toolChoice?.function?.name !== "capture_intent_contract");
}

function extractionCalls(provider) {
  return provider.calls.filter((call) => call.kind === "completeMessage" && call.toolChoice?.function?.name === "capture_intent_contract");
}

function hasContractSystemMessage(messages) {
  return messages.some((message) => message.role === "system" && String(message.content || "").includes("Authoritative task contract"));
}

test("off-arm leaves behavior unchanged: no contract event, no injected contract message", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: false });
    await runAgentToolLoop(provider, settings, root, "what is this project", "chat", emit, runtime, { prompts });

    assert.equal(events.some((event) => event.type === "intent-contract"), false);
    assert.equal(extractionCalls(provider).length, 0);
    for (const call of roundCalls(provider)) assert.equal(hasContractSystemMessage(call.messages), false);
    const afterForcedDiscovery = roundCalls(provider).find((call) => call.messages.some((message) => String(message.content || "").includes("harness-tool-observation")));
    assert.ok(afterForcedDiscovery, "forced discovery is returned as a harness observation");
    assert.equal(afterForcedDiscovery.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((toolCall) => /_discovery$/.test(toolCall.id))), false);
  });
});

test("master-on experiment with every dimension off preserves the legacy loop", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({
      enabled: true,
      intentContractsEnabled: true,
      intentExperiment: { intentExtraction: false, intentClarification: false, intentRevision: false, intentCompletionAssessment: false }
    });
    await runAgentToolLoop(provider, settings, root, "what is this project", "chat", emit, runtime, { prompts });
    assert.equal(extractionCalls(provider).length, 0);
    assert.equal(events.some((event) => event.type === "intent-contract"), false);
    assert.equal(events.some((event) => event.type === "completion-assessment"), false);
    assert.equal(roundCalls(provider).some((call) => call.tools?.some((tool) => tool.function?.name === "report_intent_conflict")), false);
  });
});

test("completion assessment and revision can be disabled independently of extraction", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({
      enabled: true,
      agentEnabled: true,
      intentContractsEnabled: true,
      intentFastPathEnabled: false,
      intentExperiment: { intentExtraction: true, intentClarification: false, intentRevision: false, intentCompletionAssessment: false }
    });
    await runAgentToolLoop(provider, settings, root, "add retry handling", "agent", emit, runtime, { prompts });
    assert.equal(extractionCalls(provider).length, 1);
    assert.ok(events.some((event) => event.type === "intent-contract"));
    assert.equal(provider.calls.some((call) => call.toolChoice?.function?.name === "assess_acceptance_criteria"), false);
    assert.equal(events.some((event) => event.type === "completion-assessment"), false);
    assert.equal(roundCalls(provider).some((call) => call.tools?.some((tool) => tool.function?.name === "report_intent_conflict")), false);
  });
});

test("clarification dimension suppresses questions while retaining extracted ambiguities", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ kind: "completeMessage", messages, toolChoice: opts.toolChoice, tools: opts.tools });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        const contract = { ...VALID_CONTRACT, ambiguities: [{ id: "AMB1", question: "Which client?", blocking: true, impact: "high" }] };
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
      }
      return { content: "answer", toolCalls: [] };
    };
    let questions = 0;
    const settings = normalizeAiCompanionSettings({
      enabled: true,
      agentEnabled: true,
      intentContractsEnabled: true,
      intentFastPathEnabled: false,
      intentClarificationMode: "ask",
      intentExperiment: { intentExtraction: true, intentClarification: false, intentRevision: false, intentCompletionAssessment: false }
    });
    const { emit, events } = collectEvents();
    await runAgentToolLoop(provider, settings, root, "add the client", "agent", emit, runtime, { prompts, requestClarification: async () => { questions += 1; return "axios"; } });
    assert.equal(questions, 0);
    assert.equal(events.find((event) => event.type === "intent-contract").contract.ambiguities[0].id, "AMB1");
  });
});

test("chat fast path injects a contract without an extraction call", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true });
    await runAgentToolLoop(provider, settings, root, "what is this project", "chat", emit, runtime, { prompts });

    const contractEvent = events.find((event) => event.type === "intent-contract");
    assert.ok(contractEvent, "an intent-contract event is emitted");
    assert.equal(contractEvent.source, "fast-path");
    assert.equal(extractionCalls(provider).length, 0, "fast path makes no extraction call");
    assert.equal(provider.calls.filter((call) => call.toolChoice?.function?.name === "assess_acceptance_criteria").length, 0, "answer tasks do not enter M3 assessment");
    assert.equal(events.some((event) => event.type === "completion-assessment"), false);
    assert.ok(roundCalls(provider).some((call) => hasContractSystemMessage(call.messages)), "the contract is injected into the round");
  });
});

test("an edited chat rerun bypasses the fast path and extracts a fresh contract", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true });
    await runAgentToolLoop(provider, settings, root, "what is this project", "chat", emit, runtime, {
      prompts,
      executionKind: "edited-rerun",
      executionGeneration: 2
    });

    assert.equal(extractionCalls(provider).length, 1);
    assert.equal(events.find((event) => event.type === "intent-contract")?.source, "extracted");
  });
});

test("agent mode extracts a contract and injects its goal into the round", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "please add retry with backoff to the uploader", "agent", emit, runtime, { prompts });

    const contractEvent = events.find((event) => event.type === "intent-contract");
    assert.ok(contractEvent);
    assert.equal(contractEvent.source, "extracted");
    assert.equal(extractionCalls(provider).length, 1, "exactly one extraction call");
    const injected = roundCalls(provider).find((call) => hasContractSystemMessage(call.messages));
    assert.ok(injected, "the contract is injected into a round");
    const contractMessage = injected.messages.find((message) => message.role === "system" && String(message.content || "").includes("Authoritative task contract"));
    assert.ok(contractMessage.content.includes("Add retry to the uploader"), "the extracted goal is present in the injected contract");
    assert.ok(injected.messages.some((message) => message.role === "user" && String(message.content || "").includes("harness-tool-observation")));
    assert.equal(injected.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((call) => String(call.id).startsWith("seed_"))), false);
    const extraction = extractionCalls(provider)[0];
    assert.equal(extraction.toolChoice.function.name, "capture_intent_contract");
    assert.equal(extraction.tools.length, 1);
    assert.ok(extraction.tools[0].function.parameters.required.includes("namedTargets"));
    assert.deepEqual(extraction.tools[0].function.parameters.properties.namedTargets.required, ["files", "symbols", "errors", "uiAreas"]);
  });
});

test("chat extraction uses the bounded repair attempt before falling back", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    let attempt = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ kind: "completeMessage", messages, toolChoice: opts.toolChoice });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        attempt += 1;
        const contract = attempt === 1
          ? { ...VALID_CONTRACT, goal: { value: "Missing provenance" } }
          : VALID_CONTRACT;
        return {
          content: "",
          toolCalls: [{ id: `capture-${attempt}`, function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }]
        };
      }
      return { content: "answer", toolCalls: [] };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, intentFastPathEnabled: false });

    await runAgentToolLoop(provider, settings, root, "explain the uploader behavior", "chat", emit, runtime, { prompts });

    assert.equal(extractionCalls(provider).length, 2);
    assert.equal(events.find((event) => event.type === "intent-contract")?.source, "extracted");
  });
});

test("relationship-only failure preserves the repaired current intent through the degraded route", async () => {
  const priorContract = normalizeIntentContract({
    taskType: "implementation",
    goal: { value: "Prior unrelated goal", provenance: "explicit" },
    expectedOutcome: { value: "Prior unrelated outcome", provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC1", description: "Prior unrelated criterion", provenance: "inferred" }]
  });
  const relationshipInvalid = {
    ...VALID_CONTRACT,
    relationshipToPrior: "extends",
    goal: { value: "Add current retry handling", provenance: "explicit" },
    expectedOutcome: { value: "Current retries are implemented", provenance: "inferred" },
    acceptanceCriteria: [{ id: "AC2", description: "Current retries are verified", provenance: "inferred" }],
    relationshipEvidence: [{ quote: "also add current retry handling", explanation: "The wording refers to prior context." }],
    carriedFieldRefs: []
  };
  let calls = 0;
  const provider = {
    completeMessage: async () => {
      calls += 1;
      return {
        content: "",
        toolCalls: [{ id: `capture-${calls}`, function: { name: "capture_intent_contract", arguments: JSON.stringify(relationshipInvalid) } }]
      };
    }
  };

  const result = await extractContract({
    provider,
    settings: { intentMaxOutputTokens: 2000 },
    prompts,
    prompt: "also add current retry handling",
    mode: "agent",
    priorContract
  });

  assert.equal(calls, 2, "relationship salvage uses no additional provider call");
  assert.equal(result.source, "extracted-relationship-degraded");
  assert.equal(result.contract.source, "extracted-relationship-degraded");
  assert.equal(result.contract.verifiability, "verified");
  assert.equal(result.contract.relationshipToPrior, "uncertain");
  assert.equal(result.contract.goal.value, "Add current retry handling");
  assert.deepEqual(result.contract.acceptanceCriteria.map((entry) => entry.description), ["Current retries are verified"]);
  assert.equal(result.contract.ambiguities.at(-1).blocking, false);
  assert.equal(result.diagnostics.degradation.priorFieldsMerged, false);
});

test("non-relationship extraction failures can recover a provisional reduced contract", async () => {
  let calls = 0;
  const provider = {
    completeMessage: async (_messages, options) => {
      calls += 1;
      const required = options.tools[0].function.parameters.required;
      const value = required.includes("acceptanceCriterion")
        ? { taskType: "implementation", goal: "Add uploader retries", acceptanceCriterion: "The uploader retry behavior for HTTP 500 responses is verified" }
        : { ...VALID_CONTRACT, goal: { value: "missing provenance" } };
      return {
        content: "",
        toolCalls: [{ id: `capture-${calls}`, function: { name: "capture_intent_contract", arguments: JSON.stringify(value) } }]
      };
    }
  };

  const result = await extractContract({
    provider,
    settings: { intentMaxOutputTokens: 2000 },
    prompts,
    prompt: "add uploader retries",
    mode: "agent"
  });

  assert.equal(calls, 3);
  assert.equal(result.source, "extracted-reduced");
  assert.equal(result.contract.verifiability, "provisional");
  assert.equal(result.contract.acceptanceCriteria[0].description, "The uploader retry behavior for HTTP 500 responses is verified");
});

test("provisional intent reuses approval only for the same resource", async () => {
  await withTempRoot(async (root) => {
    let captureCalls = 0;
    let round = 0;
    const provider = {
      complete: async () => "final",
      completeMessage: async (_messages, options = {}) => {
        const forced = options.toolChoice?.function?.name;
        if (forced === "capture_intent_contract") {
          captureCalls += 1;
          const required = options.tools[0].function.parameters.required;
          const value = required.includes("acceptanceCriterion")
            ? { taskType: "implementation", goal: "Write two files", acceptanceCriterion: "The requested files exist" }
            : { ...VALID_CONTRACT, goal: { value: "missing provenance" } };
          return { content: "", toolCalls: [{ id: `capture-${captureCalls}`, function: { name: "capture_intent_contract", arguments: JSON.stringify(value) } }] };
        }
        if (forced === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
        round += 1;
        if (round === 1) return toolCallMessage("write-1", "write_file", { path: "same.md", content: "one", approvalReason: "Write the first version." });
        if (round === 2) return toolCallMessage("write-2", "write_file", { path: "same.md", content: "two", approvalReason: "Update the same resource." });
        if (round === 3) return toolCallMessage("write-3", "write_file", { path: "different.md", content: "three", approvalReason: "Write a different resource." });
        return { content: "done", toolCalls: [] };
      }
    };
    let approvals = 0;
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "write two files", "agent", () => {}, runtime, {
      prompts,
      requestApproval: async () => { approvals += 1; return { approved: true }; }
    });

    assert.equal(approvals, 2, "the second action on the exact same resource reuses its request-local grant");
  });
});

test("unverified intent requires fresh approval for every mutation", async () => {
  await withTempRoot(async (root) => {
    let round = 0;
    const provider = {
      complete: async () => "final",
      completeMessage: async (_messages, options = {}) => {
        if (options.toolChoice?.function?.name === "capture_intent_contract") throw new Error("provider unavailable");
        round += 1;
        if (round === 1) return toolCallMessage("write-1", "write_file", { path: "same.md", content: "one", approvalReason: "Write once." });
        if (round === 2) return toolCallMessage("write-2", "write_file", { path: "same.md", content: "two", approvalReason: "Write again." });
        return { content: "done", toolCalls: [] };
      }
    };
    let approvals = 0;
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "write a file", "agent", () => {}, runtime, {
      prompts,
      requestApproval: async () => { approvals += 1; return { approved: true }; }
    });

    assert.equal(approvals, 2);
  });
});

test("two invalid extraction attempts fall back with bounded validation diagnostics", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ kind: "completeMessage", messages, toolChoice: opts.toolChoice });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        return {
          content: "",
          toolCalls: [{
            id: "invalid",
            function: {
              name: "capture_intent_contract",
              arguments: JSON.stringify({ ...VALID_CONTRACT, goal: { value: "sensitive goal text" } })
            }
          }]
        };
      }
      return { content: "answer", toolCalls: [] };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "implement uploader retries", "agent", emit, runtime, { prompts });

    const fallback = events.find((event) => event.type === "intent-contract");
    assert.equal(fallback.variant, "fallback");
    assert.equal(extractionCalls(provider).length, 3);
    assert.deepEqual(fallback.diagnostics.attempts.map((attempt) => attempt.stage), ["raw-validation", "raw-validation", "reduced-validation"]);
    assert.ok(fallback.diagnostics.attempts.slice(0, 2).every((attempt) => attempt.errorCodes.includes("missing-or-unsupported-goal-provenance")));
    assert.equal(JSON.stringify(fallback.diagnostics).includes("sensitive goal text"), false);
    assert.equal(events.find((event) => event.type === "intent-uninterpreted")?.verifiability, "unverified");
  });
});

test("automatic filename fallback is recorded as a harness observation", async () => {
  await withTempRoot(async (root) => {
    let round = 0;
    const calls = [];
    const provider = {
      completeMessage: async (messages, opts = {}) => {
        calls.push({ messages, toolChoice: opts.toolChoice });
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(VALID_CONTRACT) } }] };
        }
        round += 1;
        if (round === 1) {
          return { content: "searching", toolCalls: [{ id: "model-glob", function: { name: "glob", arguments: JSON.stringify({ pattern: "missing.js" }) } }] };
        }
        return { content: "answer", toolCalls: [] };
      },
      complete: async () => "done"
    };
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "inspect the missing file", "agent", () => {}, runtime, { prompts });

    const afterFallback = calls.find((call) => call.messages.some((message) => /call_glob_\d+_filename/.test(String(message.content || ""))));
    assert.ok(afterFallback);
    assert.ok(afterFallback.messages.some((message) => message.role === "user" && String(message.content || "").includes("harness-tool-observation")));
    assert.equal(afterFallback.messages.some((message) => message.role === "assistant" && message.tool_calls?.some((toolCall) => /call_glob_\d+_filename/.test(toolCall.id))), false);
  });
});

test("a semantic conflict report may cite the discovery seed observation id", async () => {
  await withTempRoot(async (root) => {
    let round = 0;
    const provider = {
      completeMessage: async (_messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          const contract = {
            ...VALID_CONTRACT,
            namedTargets: {
              files: [{ id: "T1", value: "readme.md", kind: "filename" }],
              symbols: [],
              errors: [],
              uiAreas: []
            }
          };
          return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
        }
        round += 1;
        if (round === 1) {
          return {
            content: "reporting",
            toolCalls: [{
              id: "conflict",
              function: {
                name: "report_intent_conflict",
                arguments: JSON.stringify({
                  fieldRef: "target:T1",
                  conflictType: "target-relocated",
                  evidenceToolCallIds: ["seed_seed-evidence_list_files"],
                  explanation: "The discovery observation is relevant."
                })
              }
            }]
          };
        }
        return { content: "answer", toolCalls: [] };
      },
      complete: async () => "done"
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "inspect the project overview", "agent", emit, runtime, { prompts, requestId: "seed-evidence" });

    assert.ok(events.some((event) => event.type === "intent-contract" && event.source === "conflict"));
  });
});

test("a mutation gated by a controlling decision is blocked as a tool error", async () => {
  await withTempRoot(async (root) => {
    const provider = { calls: [], complete: async () => "streamed final answer" };
    let round = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ toolChoice: opts.toolChoice });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        const contract = { ...VALID_CONTRACT, unresolvedDecisions: [{ description: "Which retry policy?", controlsMutation: true, controlledCapabilities: ["workspace.file.write"] }] };
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
      }
      if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
      round += 1;
      if (round === 1) return { content: "editing", toolCalls: [{ id: "t1", function: { name: "apply_edit", arguments: JSON.stringify({ path: "src/a.js", search: "a", replacement: "b" }) } }] };
      return { content: "answer", toolCalls: [] };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    const result = await runAgentToolLoop(provider, settings, root, "please add retry to the uploader", "agent", emit, runtime, { prompts });

    const toolError = events.find((event) => event.type === "tool-error" && event.tool === "apply_edit");
    assert.ok(toolError, "the blocked mutation surfaces a tool-error");
    assert.match(toolError.error, /blocked by an unresolved decision/);
    assert.doesNotMatch(result, /streamed final answer/, "an invalid rewrite does not restore the unverified candidate");
    assert.match(result, /^## Acceptance criteria[\s\S]*Task incomplete:[\s\S]*Tool execution note: 1 of 2 tool calls failed \(50%\)\.$/, "the assessed run keeps the factual failure-rate note after the deterministic verdict");
  });
});

test("agent pre-work clarification asks blocking ambiguities and refreshes the contract", async () => {
  await withTempRoot(async (root) => {
    const provider = { calls: [], complete: async () => "streamed final answer" };
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ toolChoice: opts.toolChoice });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        const last = String(messages[messages.length - 1]?.content || "");
        if (/Authoritative user input/.test(last)) {
          const refreshed = {
            ...VALID_CONTRACT,
            relationshipToPrior: "corrects",
            correctedFieldRefs: ["expectedOutcome"],
            expectedOutcome: { value: "Use axios as the HTTP client", provenance: "clarified" },
            ambiguities: [{ id: "AMB1", question: "Which HTTP client?", blocking: true, impact: "high" }]
          };
          return { content: "", toolCalls: [{ id: "ref1", function: { name: "capture_intent_contract", arguments: JSON.stringify(refreshed) } }] };
        }
        const contract = { ...VALID_CONTRACT, ambiguities: [{ id: "AMB1", question: "Which HTTP client?", blocking: true, impact: "high" }] };
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
      }
      return { content: "answer", toolCalls: [] };
    };
    const asked = [];
    const requestClarification = async (details) => { asked.push(details); return "axios"; };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "ask" });
    await runAgentToolLoop(provider, settings, root, "please add an http client to the uploader", "agent", emit, runtime, { prompts, requestClarification });

    assert.equal(asked.length, 1);
    assert.equal(asked[0].ambiguityId, "AMB1");
    const refreshed = events.find((event) => event.type === "intent-contract" && event.variant === "refreshed");
    assert.ok(refreshed, "a refreshed contract event is emitted after clarification");
    assert.equal(refreshed.contract.ambiguities.find((ambiguity) => ambiguity.id === "AMB1").status, "resolved");
  });
});

test("a rejected approval with instructions amends the contract in place", async () => {
  await withTempRoot(async (root) => {
    await fs.mkdir(path.join(root, "src"), { recursive: true });
    await fs.writeFile(path.join(root, "src", "a.js"), "a", "utf8");
    const provider = { complete: async () => "streamed final answer" };
    let round = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        const last = String(messages[messages.length - 1]?.content || "");
        if (/Authoritative user input/.test(last)) {
          return { content: "", toolCalls: [{ id: "ref", function: { name: "capture_intent_contract", arguments: JSON.stringify({ ...VALID_CONTRACT, taskType: "implementation", relationshipToPrior: "corrects", relationshipEvidence: [{ quote: "use axios instead", explanation: "The user corrects the requested implementation." }], correctedFieldRefs: ["goal", "criterion:AC1"], goal: { value: "Use axios", provenance: "clarified" }, expectedOutcome: { value: "x", provenance: "inferred" }, acceptanceCriteria: [{ id: "AC1", description: "axios used", provenance: "clarified" }] }) } }] };
        }
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(VALID_CONTRACT) } }] };
      }
      round += 1;
      if (round === 1) return { content: "editing", toolCalls: [{ id: "t1", function: { name: "apply_edit", arguments: JSON.stringify({ path: "src/a.js", search: "a", replacement: "b" }) } }] };
      return { content: "answer", toolCalls: [] };
    };
    const requestApproval = async () => ({ approved: false, decision: "instruct", instructions: "use axios instead" });
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "off" });
    await runAgentToolLoop(provider, settings, root, "please add retry to the uploader", "agent", emit, runtime, { prompts, requestApproval });

    const amended = events.find((event) => event.type === "intent-contract" && event.variant === "amended");
    assert.ok(amended, "an amended contract event is emitted");
    assert.equal(amended.applied, true);
    assert.equal(amended.contract.goal.value, "Use axios");
  });
});

test("approval steering skips stale proposals and routes a corrected mutation through fresh approval", async () => {
  await withTempRoot(async (root) => {
    await fs.mkdir(path.join(root, "help", "user"), { recursive: true });
    await fs.mkdir(path.join(root, "help", "developer"), { recursive: true });
    const provider = { complete: async () => "streamed final answer" };
    let round = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      const forcedTool = opts.toolChoice?.function?.name;
      if (forcedTool === "capture_intent_contract") {
        const last = String(messages[messages.length - 1]?.content || "");
        const contract = /Authoritative user input/.test(last)
          ? {
              ...VALID_CONTRACT,
              relationshipToPrior: "corrects",
              relationshipEvidence: [{ quote: "use the developer guide", explanation: "The user corrects the destination." }],
              correctedFieldRefs: ["goal", "criterion:AC1"],
              goal: { value: "Save the summary in the developer guide", provenance: "clarified" },
              expectedOutcome: { value: "A developer-guide document is created", provenance: "clarified" },
              acceptanceCriteria: [{ id: "AC1", description: "The summary is saved in the developer guide", provenance: "clarified" }],
              namedTargets: { files: [], symbols: [], errors: [], uiAreas: [{ id: "T1", value: "developer guide", kind: "ui-area" }] }
            }
          : VALID_CONTRACT;
        return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
      }
      if (forcedTool === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
      if (forcedTool === "rewrite_assessed_candidate") {
        return {
          content: "",
          toolCalls: [{
            id: "rewrite",
            function: {
              name: "rewrite_assessed_candidate",
              arguments: JSON.stringify({
                content: "The corrected developer-guide file was written, but the acceptance check did not verify the requested outcome.",
                acknowledgedUnmetCriterionIds: ["AC1"]
              })
            }
          }]
        };
      }
      round += 1;
      if (round === 1) {
        return {
          content: "Saving the summary.",
          toolCalls: [
            {
              id: "wrong-write",
              function: {
                name: "write_file",
                arguments: JSON.stringify({ path: "help/user/summary.md", content: "summary", approvalReason: "Save the summary." })
              }
            },
            {
              id: "stale-write",
              function: {
                name: "write_file",
                arguments: JSON.stringify({ path: "help/user/index.md", content: "link", approvalReason: "Link the summary." })
              }
            }
          ]
        };
      }
      if (round === 2) {
        assert.ok(messages.some((message) => message.role === "system" && /Replan from the updated contract/.test(String(message.content || ""))));
        return {
          content: "Saving to the corrected location.",
          toolCalls: [{
            id: "corrected-write",
            function: {
              name: "write_file",
              arguments: JSON.stringify({ path: "help/developer/summary.md", content: "summary", approvalReason: "Save the summary in the developer guide." })
            }
          }]
        };
      }
      return { content: "The developer guide file was written.", toolCalls: [] };
    };

    let approvalCount = 0;
    const requestApproval = async () => {
      approvalCount += 1;
      return approvalCount === 1
        ? { approved: false, decision: "instruct", instructions: "use the developer guide" }
        : { approved: true, decision: "approve" };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "off" });
    await runAgentToolLoop(provider, settings, root, "save the summary", "agent", emit, runtime, { prompts, requestApproval });

    assert.equal(approvalCount, 2);
    assert.equal(await fs.readFile(path.join(root, "help", "developer", "summary.md"), "utf8"), "summary");
    await assert.rejects(() => fs.readFile(path.join(root, "help", "user", "summary.md"), "utf8"), /ENOENT/);
    const stale = events.find((event) => event.structuredResult?.error?.code === "approval-instruction-stale-proposal");
    assert.equal(stale?.structuredResult?.executed, false);
    const amended = events.find((event) => event.type === "intent-contract" && event.variant === "amended");
    assert.equal(amended?.applied, true);
    assert.deepEqual(amended?.diagnostics, []);
  });
});

test("accepted resource steering blocks later stale effects before approval", async () => {
  await withTempRoot(async (root) => {
    await fs.mkdir(path.join(root, "help", "developer"), { recursive: true });
    const initialContract = {
      ...VALID_CONTRACT,
      goal: { value: "Create the guide", provenance: "explicit" },
      expectedOutcome: { value: "The corrected guide exists", provenance: "explicit" },
      acceptanceCriteria: [{ id: "AC1", description: "The corrected guide exists", provenance: "explicit" }],
      namedTargets: {
        files: [{ id: "T1", value: "help/developer/old.md", kind: "file-path", provenance: "inferred" }],
        symbols: [], errors: [], uiAreas: []
      }
    };
    const correctedContract = {
      ...initialContract,
      relationshipToPrior: "corrects",
      relationshipEvidence: [{ quote: "use new.md", explanation: "The user corrects the file target." }],
      carriedFieldRefs: [],
      correctedFieldRefs: ["target:T1"],
      namedTargets: {
        files: [{ id: "T1", value: "help/developer/new.md", kind: "file-path", provenance: "clarified" }],
        symbols: [], errors: [], uiAreas: []
      }
    };
    let round = 0;
    const provider = { complete: async () => "streamed final answer" };
    provider.completeMessage = async (messages, opts = {}) => {
      const forcedTool = opts.toolChoice?.function?.name;
      if (forcedTool === "capture_intent_contract") {
        const isRefresh = messages.some((message) => /Authoritative user input/.test(String(message.content || "")));
        const contractValue = isRefresh ? correctedContract : initialContract;
        return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(contractValue) } }] };
      }
      if (forcedTool === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
      if (forcedTool === "rewrite_assessed_candidate") {
        return { content: "", toolCalls: [{ id: "rewrite", function: { name: "rewrite_assessed_candidate", arguments: JSON.stringify({
          content: "The corrected file was created, but completion was not fully verified.", acknowledgedUnmetCriterionIds: ["AC1"]
        }) } }] };
      }
      round += 1;
      if (round === 1) return { content: "", toolCalls: [{ id: "old-write", function: { name: "write_file", arguments: JSON.stringify({
        path: "help/developer/old.md", content: "guide", approvalReason: "Create the guide."
      }) } }] };
      if (round === 2) {
        const injected = messages.find((message) => message.role === "system" && /Authoritative task contract/.test(String(message.content || "")));
        assert.match(String(injected?.content || ""), /activeCorrections/);
        assert.ok(String(injected?.content || "").includes("help/developer/old.md"));
        assert.ok(String(injected?.content || "").includes("help/developer/new.md"));
        return { content: "", toolCalls: [{ id: "stale-dependent-write", function: { name: "write_file", arguments: JSON.stringify({
          path: "help/developer/index.md", content: "[Guide](old.md)", approvalReason: "Link the guide."
        }) } }] };
      }
      if (round === 3) return { content: "", toolCalls: [{ id: "new-write", function: { name: "write_file", arguments: JSON.stringify({
        path: "help/developer/new.md", content: "guide", approvalReason: "Create the corrected guide."
      }) } }] };
      return { content: "Done.", toolCalls: [] };
    };
    let approvals = 0;
    const requestApproval = async () => {
      approvals += 1;
      return approvals === 1
        ? { approved: false, decision: "instruct", instructions: "use new.md" }
        : { approved: true, decision: "approve" };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "off" });

    await runAgentToolLoop(provider, settings, root, "create the guide", "agent", emit, runtime, { prompts, requestApproval });

    assert.equal(approvals, 2, "the stale dependent proposal never reaches approval");
    assert.equal(await fs.readFile(path.join(root, "help", "developer", "new.md"), "utf8"), "guide");
    const stale = events.find((event) => event.structuredResult?.error?.code === "stale-intent-reference");
    assert.equal(stale?.structuredResult?.executed, false);
    assert.deepEqual(stale?.structuredResult?.error?.argumentPaths, ["content"]);
  });
});

test("two invalid approval amendments halt further mutations and finish with grounded fallback", async () => {
  await withTempRoot(async (root) => {
    const provider = { complete: async () => "streamed final answer" };
    let normalRound = 0;
    let refreshAttempt = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      const forcedTool = opts.toolChoice?.function?.name;
      if (forcedTool === "capture_intent_contract") {
        const isRefresh = messages.some((message) => /Authoritative user input/.test(String(message.content || "")));
        if (isRefresh) {
          refreshAttempt += 1;
          return { content: "", toolCalls: [] };
        }
        return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(VALID_CONTRACT) } }] };
      }
      if (forcedTool === "assess_acceptance_criteria") return validAssessmentMessage("unmet");
      if (forcedTool === "rewrite_assessed_candidate") return { content: "", toolCalls: [] };
      normalRound += 1;
      return {
        content: "I successfully wrote the file.",
        toolCalls: [{
          id: "rejected-write",
          function: {
            name: "write_file",
            arguments: JSON.stringify({ path: "wrong/summary.md", content: "summary", approvalReason: "Save the summary." })
          }
        }]
      };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "off" });
    const content = await runAgentToolLoop(provider, settings, root, "save the summary", "agent", emit, runtime, {
      prompts,
      requestApproval: async () => ({ approved: false, decision: "instruct", instructions: "use the developer guide" })
    });

    assert.equal(refreshAttempt, 2);
    assert.equal(normalRound, 1);
    const amended = events.find((event) => event.type === "intent-contract" && event.variant === "amended");
    assert.equal(amended?.state, "blocked");
    assert.equal(amended?.applied, false);
    assert.equal(amended?.diagnostics?.length, 2);
    assert.doesNotMatch(content, /successfully wrote/);
    assert.match(content, /Acceptance criteria/);
    assert.match(content, /Task incomplete/);
  });
});

test("a validated model-reported conflict revises the inferred target", async () => {
  await withTempRoot(async (root) => {
    const provider = { complete: async () => "streamed final answer" };
    let round = 0;
    provider.completeMessage = async (messages, opts = {}) => {
      if (opts.toolChoice?.function?.name === "capture_intent_contract") {
        const contract = { ...VALID_CONTRACT, goal: { value: "Fix the parser", provenance: "inferred" }, namedTargets: { files: [{ id: "T1", value: "src/parser.js", kind: "file-path" }] } };
        return { content: "", toolCalls: [{ id: "cap1", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
      }
      round += 1;
      if (round === 1) return { content: "looking", toolCalls: [{ id: "g1", function: { name: "glob", arguments: JSON.stringify({ pattern: "**/*.md" }) } }] };
      if (round === 2) return { content: "conflict", toolCalls: [{ id: "c1", function: { name: "report_intent_conflict", arguments: JSON.stringify({ fieldRef: "target:T1", conflictType: "target-relocated", evidenceToolCallIds: ["g1"], explanation: "parser is in lib" }) } }] };
      return { content: "answer", toolCalls: [] };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "off" });
    await runAgentToolLoop(provider, settings, root, "fix the parser bug", "agent", emit, runtime, { prompts });

    const revised = events.find((event) => event.type === "intent-contract" && event.variant === "revised");
    assert.ok(revised, "a revised contract event is emitted");
    assert.equal(revised.contract.namedTargets.files.find((file) => file.id === "T1").status, "absent");
  });
});

test("extraction failure falls back without aborting the run", async () => {
  await withTempRoot(async (root) => {
    const provider = makeProvider();
    provider.completeMessage = async (messages, opts = {}) => {
      provider.calls.push({ kind: "completeMessage", messages, toolChoice: opts.toolChoice });
      if (opts.toolChoice?.function?.name === "capture_intent_contract") throw new Error("provider unavailable");
      return { content: "answer", toolCalls: [] };
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    const result = await runAgentToolLoop(provider, settings, root, "please refactor the uploader module", "agent", emit, runtime, { prompts });

    const contractEvent = events.find((event) => event.type === "intent-contract");
    assert.equal(contractEvent.variant, "fallback");
    assert.equal(contractEvent.source, "raw-prompt-fallback");
    assert.match(result, /^streamed final answer/, "the run still completes");
    assert.match(result, /Unverified result:/);
  });
});

test("the extraction deadline discards a provider call that ignores abort", async () => {
  await withTempRoot(async (root) => {
    const provider = {
      completeMessage: async (_messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") return new Promise(() => {});
        return { content: "answer", toolCalls: [] };
      },
      complete: async () => "streamed final answer"
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    settings.intentExtractionDeadlineMs = 25;
    const startedAt = Date.now();
    await runAgentToolLoop(provider, settings, root, "implement uploader retries", "agent", emit, runtime, { prompts, requestId: "deadline-test" });
    assert.ok(Date.now() - startedAt < 500, "the ignored abort does not hold the agent loop open");
    const fallback = events.find((event) => event.type === "intent-contract");
    assert.equal(fallback.variant, "fallback");
    assert.equal(fallback.contract.fallbackReason, "extraction-timeout");
  });
});

test("a resumed mutation is checked against the intent contract before replay", async () => {
  await withTempRoot(async (root) => {
    const before = await fs.readFile(path.join(root, "readme.md"), "utf8");
    const args = { path: "readme.md", content: "mutated", approvalReason: "Resume the saved write." };
    const pendingAction = await createResumeAction(root, { tool: "write_file", args, compare: { path: args.path, beforeContent: before } });
    const provider = {
      completeMessage: async (_messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          const contract = { ...VALID_CONTRACT, unresolvedDecisions: [{ description: "Confirm the write", controlsMutation: true, controlledCapabilities: ["workspace.file.write"] }] };
          return { content: "", toolCalls: [{ id: "cap", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
        }
        return { content: "answer", toolCalls: [] };
      },
      complete: async () => "done"
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "implement uploader retries", "agent", emit, runtime, {
      prompts,
      resumeCheckpoint: { workspaceRoot: root, rootPrompt: "implement uploader retries", pendingAction },
      requestApproval: async () => ({ approved: true })
    });
    assert.equal(await fs.readFile(path.join(root, "readme.md"), "utf8"), before);
    const contractIndex = events.findIndex((event) => event.type === "intent-contract");
    const replayErrorIndex = events.findIndex((event) => event.type === "tool-error" && event.tool === "write_file");
    assert.ok(contractIndex >= 0 && replayErrorIndex > contractIndex);
    assert.match(events[replayErrorIndex].error, /blocked by an unresolved decision/);
  });
});

test("semantic conflict ask route refreshes the contract from the user's correction", async () => {
  await withTempRoot(async (root) => {
    let round = 0;
    const provider = {
      completeMessage: async (messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          const isRefresh = /Authoritative user input/.test(String(messages.at(-1)?.content || ""));
          const contract = isRefresh
            ? { ...VALID_CONTRACT, relationshipToPrior: "corrects", relationshipEvidence: [{ quote: "Explain it; do not edit it.", explanation: "The user corrects the goal." }], correctedFieldRefs: ["goal"], goal: { value: "Explain the temp file", provenance: "clarified" } }
            : { ...VALID_CONTRACT, goal: { value: "Change the temp file", provenance: "inferred" } };
          return { content: "", toolCalls: [{ id: isRefresh ? "refresh" : "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
        }
        round += 1;
        if (round === 1) return { content: "searching", toolCalls: [{ id: "g1", function: { name: "search_text", arguments: JSON.stringify({ pattern: "temp" }) } }] };
        if (round === 2) return { content: "conflict", toolCalls: [{ id: "c1", function: { name: "report_intent_conflict", arguments: JSON.stringify({ fieldRef: "goal", conflictType: "goal-misread", evidenceToolCallIds: ["g1"], explanation: "The user wants an explanation." }) } }] };
        return { content: "answer", toolCalls: [] };
      },
      complete: async () => "done"
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "ask" });
    await runAgentToolLoop(provider, settings, root, "work with the temp file", "agent", emit, runtime, { prompts, requestClarification: async () => "Explain it; do not edit it." });
    const clarified = events.find((event) => event.type === "intent-contract" && event.source === "conflict-clarification");
    assert.ok(clarified);
    assert.equal(clarified.contract.goal.value, "Explain the temp file");
  });
});

test("a caught read_file ENOENT feeds automatic absence revision", async () => {
  await withTempRoot(async (root) => {
    let round = 0;
    const provider = {
      completeMessage: async (_messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          const contract = { ...VALID_CONTRACT, namedTargets: { files: [{ id: "T1", value: "missing.js", kind: "file-path" }] } };
          return { content: "", toolCalls: [{ id: "capture", function: { name: "capture_intent_contract", arguments: JSON.stringify(contract) } }] };
        }
        round += 1;
        if (round === 1) return { content: "reading", toolCalls: [{ id: "r1", function: { name: "read_file", arguments: JSON.stringify({ path: "missing.js" }) } }] };
        return { content: "answer", toolCalls: [] };
      },
      complete: async () => "done"
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true });
    await runAgentToolLoop(provider, settings, root, "inspect missing.js", "agent", emit, runtime, { prompts });
    const revised = events.find((event) => event.type === "intent-contract" && event.source === "harness-auto");
    assert.ok(revised);
    assert.equal(revised.contract.namedTargets.files[0].status, "absent");
  });
});

test("diagnostic runs hide the candidate until the harness appends the assessed criteria table", async () => {
  await withTempRoot(async (root) => {
    const diagnosticContract = {
      ...VALID_CONTRACT,
      taskType: "diagnostic",
      goal: { value: "Explain the uploader failure", provenance: "explicit" },
      expectedOutcome: { value: "A grounded diagnosis", provenance: "inferred" },
      requestedActions: [{ value: "Diagnose the failure", provenance: "explicit" }],
      acceptanceCriteria: [{ description: "The uploader failure root cause is identified from inspected evidence", verification: "Inspect the failure evidence", provenance: "inferred" }]
    };
    const calls = [];
    const provider = {
      completeMessage: async (messages, opts = {}) => {
        calls.push({ messages, opts });
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          return { content: "", toolCalls: [{ id: "cap-diagnostic", function: { name: "capture_intent_contract", arguments: JSON.stringify(diagnosticContract) } }] };
        }
        if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") {
          return {
            content: "",
            toolCalls: [{ id: "assess-diagnostic", function: { name: "assess_acceptance_criteria", arguments: JSON.stringify({
              overallStatus: "complete",
              criteria: [{ id: "AC1", status: "met", evidenceIds: ["EV-CANDIDATE-1"], explanation: "The candidate explains the failure.", claimType: "response-content" }],
              unmetSummary: ""
            }) } }]
          };
        }
        if (opts.toolChoice?.function?.name === "rewrite_assessed_candidate") {
          return {
            content: "",
            toolCalls: [{ id: "rewrite-diagnostic", function: { name: "rewrite_assessed_candidate", arguments: JSON.stringify({
              content: "The diagnosis is incomplete because no workspace evidence was inspected.",
              acknowledgedUnmetCriterionIds: ["AC1"]
            }) } }]
          };
        }
        return { content: "draft response that must not be shown", toolCalls: [] };
      },
      complete: async () => "The uploader fails because the retry state is reset too early."
    };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentCompletionSteeringEnabled: false });
    const result = await runAgentToolLoop(provider, settings, root, "diagnose why the uploader fails", "agent", emit, runtime, { prompts });

    assert.doesNotMatch(result, /draft response that must not be shown/);
    assert.match(result, /diagnosis is incomplete/);
    assert.match(result, /\| AC1: The uploader failure root cause is identified from inspected evidence \| Unmet \| EV-CANDIDATE-1 \|/);
    assert.equal(calls.filter((call) => call.opts.toolChoice?.function?.name === "assess_acceptance_criteria").length, 1);
    const assessmentEvent = events.find((event) => event.type === "completion-assessment");
    assert.ok(assessmentEvent);
    assert.ok(assessmentEvent.evidenceLedger.some((entry) => entry.id === "EV-CANDIDATE-1"));
    const summary = events.find((event) => event.type === "agent-summary");
    assert.equal(summary.completionAssessment.overallStatus, "incomplete");
    assert.deepEqual(summary.evidenceLedger, assessmentEvent.evidenceLedger);
  });
});

test("closed-loop steering re-enters on incomplete and stops at the revision budget", async () => {
  await withTempRoot(async (root) => {
    const steeringContract = {
      ...VALID_CONTRACT,
      taskType: "diagnostic",
      goal: { value: "Fix the uploader retry", provenance: "explicit" },
      expectedOutcome: { value: "Retries work", provenance: "inferred" },
      requestedActions: [{ value: "Fix the retry", provenance: "explicit" }],
      acceptanceCriteria: [{ shape: "ears-event", description: "When the uploader retries, the retry root cause is fixed and verified", sourceSpan: "fix the uploader retry", verification: "verify the fix", provenance: "explicit" }]
    };
    let assessCalls = 0;
    const provider = {
      completeMessage: async (messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          return { content: "", toolCalls: [{ id: "cap", function: { name: "capture_intent_contract", arguments: JSON.stringify(steeringContract) } }] };
        }
        if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") {
          assessCalls += 1;
          // Always unmet -> incomplete -> arbiter "unsatisfied" -> steer, until budget runs out.
          return { content: "", toolCalls: [{ id: `assess-${assessCalls}`, function: { name: "assess_acceptance_criteria", arguments: JSON.stringify({
            overallStatus: "incomplete",
            criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], evidenceQuote: "", explanation: "not fixed yet", claimType: "workspace-state" }],
            unmetSummary: "The retry is still not fixed."
          }) } }] };
        }
        if (opts.toolChoice?.function?.name === "rewrite_assessed_candidate") {
          return { content: "", toolCalls: [{ id: "rw", function: { name: "rewrite_assessed_candidate", arguments: JSON.stringify({ content: "The fix is incomplete.", acknowledgedUnmetCriterionIds: ["AC1"] }) } }] };
        }
        return { content: "draft answer", toolCalls: [] };
      },
      complete: async () => "The uploader retry is not yet fixed."
    };

    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentCompletionSteeringEnabled: true, intentMaxCompletionRevisions: 2, intentPerCriterionAssessment: false });
    await runAgentToolLoop(provider, settings, root, "fix the uploader retry", "agent", emit, runtime, { prompts });

    // initial assessment + 2 steered revisions = 3 assessments, then honest stop.
    assert.equal(assessCalls, 3, "one initial assessment plus two steered revisions");
    const evalRecord = events.find((event) => event.type === "intent-evaluation")?.record;
    assert.ok(evalRecord, "an intent-evaluation record is emitted");
    assert.equal(evalRecord.revisionIterations, 2, "steered exactly up to the budget");
    assert.equal(evalRecord.converged, false);
    assert.equal(evalRecord.finalReason, "budget-exhausted");
    const steeringEvents = events.filter((event) => event.type === "steering");
    assert.equal(steeringEvents.length, 2, "each revision emits a visible steering event");
    assert.equal(steeringEvents[0].reason, "unsatisfied");
    assert.ok(Array.isArray(steeringEvents[0].unmet) && steeringEvents[0].unmet.length >= 1, "steering event lists the unmet criteria");
  });
});

test("steering revise-contract auto-asks a clarification for an inferred (spec-gap) criterion", async () => {
  await withTempRoot(async (root) => {
    const specGapContract = {
      ...VALID_CONTRACT,
      taskType: "diagnostic",
      goal: { value: "Look into the uploader", provenance: "explicit" },
      expectedOutcome: { value: "Understood", provenance: "inferred" },
      requestedActions: [{ value: "Investigate", provenance: "explicit" }],
      // An INFERRED criterion -> arbiter classifies spec-gap -> revise-contract -> auto-ask.
      acceptanceCriteria: [{ shape: "ears-event", description: "When the uploader runs, it is verified working", verification: "verify", provenance: "inferred" }]
    };
    let clarifyCalls = 0;
    const provider = {
      completeMessage: async (messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          return { content: "", toolCalls: [{ id: "cap", function: { name: "capture_intent_contract", arguments: JSON.stringify(specGapContract) } }] };
        }
        if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") {
          return { content: "", toolCalls: [{ id: "assess", function: { name: "assess_acceptance_criteria", arguments: JSON.stringify({
            overallStatus: "incomplete",
            criteria: [{ id: "AC1", status: "unmet", evidenceIds: [], evidenceQuote: "", explanation: "not verified", claimType: "workspace-state" }],
            unmetSummary: "Not verified."
          }) } }] };
        }
        if (opts.toolChoice?.function?.name === "rewrite_assessed_candidate") {
          return { content: "", toolCalls: [{ id: "rw", function: { name: "rewrite_assessed_candidate", arguments: JSON.stringify({ content: "Incomplete.", acknowledgedUnmetCriterionIds: ["AC1"] }) } }] };
        }
        return { content: "draft", toolCalls: [] };
      },
      complete: async () => "Looking into it."
    };
    const requestClarification = async () => { clarifyCalls += 1; return "Yes, it is required."; };

    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, agentEnabled: true, intentClarificationMode: "ask", intentCompletionSteeringEnabled: true, intentMaxCompletionRevisions: 1, intentPerCriterionAssessment: false });
    await runAgentToolLoop(provider, settings, root, "look into the uploader", "agent", emit, runtime, { prompts, requestClarification });

    assert.ok(clarifyCalls >= 1, "spec-gap steering auto-asks a clarification");
    const evalRecord = events.find((event) => event.type === "intent-evaluation")?.record;
    assert.equal(evalRecord.revisionIterations, 1, "the clarification revision counts against the budget");
    assert.equal(evalRecord.finalReason, "budget-exhausted");
  });
});

test("Plan finalization asks one blocking batch then assesses the normalized plan", async () => {
  await withTempRoot(async (root) => {
    const planContract = {
      ...VALID_CONTRACT,
      taskType: "planning",
      goal: { value: "Plan uploader retries", provenance: "explicit" },
      expectedOutcome: { value: "A reviewable retry plan", provenance: "inferred" },
      requestedActions: [{ value: "Create a plan", provenance: "explicit" }],
      acceptanceCriteria: [{ description: "The plan identifies implementation steps verified against inspected workspace evidence", verification: "Review the saved plan", provenance: "inferred" }],
      ambiguities: [{ id: "AMB1", question: "Which HTTP client should the plan target?", blocking: true, impact: "high" }]
    };
    let planningRounds = 0;
    const provider = {
      completeMessage: async (messages, opts = {}) => {
        if (opts.toolChoice?.function?.name === "capture_intent_contract") {
          const refreshing = String(messages[messages.length - 1]?.content || "").includes("Authoritative user input");
          const value = refreshing
            ? { ...planContract, relationshipToPrior: "corrects", correctedFieldRefs: ["expectedOutcome"], expectedOutcome: { value: "Target axios", provenance: "clarified" } }
            : planContract;
          return { content: "", toolCalls: [{ id: refreshing ? "refresh-plan" : "capture-plan", function: { name: "capture_intent_contract", arguments: JSON.stringify(value) } }] };
        }
        if (opts.toolChoice?.function?.name === "assess_acceptance_criteria") {
          return {
            content: "",
            toolCalls: [{ id: "assess-plan", function: { name: "assess_acceptance_criteria", arguments: JSON.stringify({
              overallStatus: "complete",
              criteria: [{ id: "AC1", status: "met", evidenceIds: ["EV-CANDIDATE-1"], explanation: "The normalized plan has concrete steps.", claimType: "response-content" }],
              unmetSummary: ""
            }) } }]
          };
        }
        if (opts.toolChoice?.function?.name === "rewrite_assessed_candidate") {
          return {
            content: "",
            toolCalls: [{ id: "rewrite-plan", function: { name: "rewrite_assessed_candidate", arguments: JSON.stringify({
              content: "<proposed_plan>\n# Retry plan\n\nWorkspace grounding remains incomplete.\n</proposed_plan>",
              acknowledgedUnmetCriterionIds: ["AC1"]
            }) } }]
          };
        }
        planningRounds += 1;
        return { content: "draft plan", toolCalls: [] };
      },
      complete: async () => "prefix <proposed_plan>\n# Retry plan\n\n1. Add retry state.\n</proposed_plan> suffix <proposed_plan>duplicate</proposed_plan>"
    };
    const questions = [];
    const requestClarification = async (details) => { questions.push(details); return "axios"; };
    const { emit, events } = collectEvents();
    const settings = normalizeAiCompanionSettings({ enabled: true, intentContractsEnabled: true, intentClarificationMode: "ask", intentCompletionSteeringEnabled: false });
    const result = await runAgentToolLoop(provider, settings, root, "plan uploader retries", "plan", emit, runtime, { prompts, requestClarification });

    assert.equal(questions.length, 1);
    assert.equal(planningRounds, 2, "planning runs once before and once after the finalization clarification");
    assert.equal((result.match(/<proposed_plan>/g) || []).length, 1);
    assert.equal((result.match(/<\/proposed_plan>/g) || []).length, 1);
    assert.ok(result.indexOf("## Acceptance criteria") < result.indexOf("</proposed_plan>"));
    assert.ok(events.some((event) => event.type === "intent-contract" && event.source === "plan-finalization-clarification"));
  });
});
