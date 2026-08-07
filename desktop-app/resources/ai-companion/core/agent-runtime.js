/**
 * Headless AI Companion runtime.
 */

"use strict";

const { normalizeAiCompanionSettings } = require("../config/defaults");
const { loadAiCompanionPrompts } = require("../config/prompts");
const { createOpenAiCompatibleProvider } = require("../providers/openai-compatible");
const { createLiteLlmProvider } = require("../providers/litellm");
const { createGeminiConnectorProvider } = require("../providers/gemini-connector");
const { runAgentToolLoop } = require("./agent-tool-loop");
const tools = require("../tools/workspace-tools");

function estimateTokens(value) {
  return Math.ceil(String(value || "").length / 4);
}

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function createProvider(settings) {
  if (settings.providerMode === "gemini-connector" || settings.providerMode === "gemini-connector-raw"
    || settings.providerMode === "google-gemini-native") {
    return createGeminiConnectorProvider(settings);
  }
  return settings.providerMode === "litellm"
    ? createLiteLlmProvider(settings)
    : createOpenAiCompatibleProvider(settings);
}

function extractSearchTerms(prompt) {
  const words = String(prompt || "").match(/[A-Za-z0-9_.#:-]{4,}/g) || [];
  return Array.from(new Set(words.filter((word) => !/^(what|which|where|when|with|from|does|that|this|about|project)$/i.test(word)))).slice(0, 5);
}

async function gatherWorkspaceContext(root, prompt, emit, options = {}) {
  throwIfAborted(options.signal);
  const files = await tools.listFiles(root, { maxFiles: 160, signal: options.signal });
  emit({ type: "tool", tool: "list_files", summary: `${files.length} files listed`, result: files.slice(0, 30) });

  const terms = extractSearchTerms(prompt);
  const matches = [];
  for (const term of terms) {
    throwIfAborted(options.signal);
    const termMatches = await tools.searchGrep(root, term, { maxMatches: 20, signal: options.signal });
    emit({ type: "tool", tool: "search_text", input: term, summary: `${termMatches.length} matches` });
    matches.push(...termMatches);
  }

  const uniquePaths = Array.from(new Set(matches.map((match) => match.path).filter(Boolean))).slice(0, 6);
  const slices = [];
  for (const filePath of uniquePaths) {
    throwIfAborted(options.signal);
    try {
      const slice = await tools.readFile(root, filePath, { startLine: 1, endLine: 160, signal: options.signal });
      emit({ type: "tool", tool: "read_file", input: filePath, summary: `${slice.startLine}-${slice.endLine}` });
      slices.push(slice);
    } catch (error) {
      emit({ type: "tool-error", tool: "read_file", input: filePath, error: error?.message || String(error) });
    }
  }

  return {
    files,
    matches: matches.slice(0, 80),
    slices
  };
}

async function answerWithContext(settings, root, prompt, mode, emit, options = {}) {
  const provider = createProvider(settings);
  const prompts = options.prompts || await loadAiCompanionPrompts({ profileRoot: options.profileRoot });
  const context = await gatherWorkspaceContext(root, prompt, emit, options);
  throwIfAborted(options.signal);
  const contextText = [
    `Workspace files:\n${context.files.slice(0, 120).join("\n")}`,
    `Search matches:\n${context.matches.map((match) => `${match.path}:${match.line}:${match.column}: ${match.text}`).join("\n")}`,
    ...context.slices.map((slice) => `File: ${slice.path}\n${slice.content}`)
  ].join("\n\n");

  emit({ type: "context", estimatedTokens: estimateTokens(contextText) });
  const content = await provider.complete([
    {
      role: "system",
      content: (options.prompts?.workspaceContextSystem || prompts.workspaceContextSystem)
    },
    {
      role: "user",
      content: `Mode: ${mode}\n\nQuestion:\n${prompt}\n\nWorkspace context:\n${contextText}`
    }
  ], {
    temperature: 0.2,
    maxTokens: 1800,
    signal: options.signal,
    onToken: (token) => emit({ type: "content-delta", content: token }),
    onUsage: (usage) => emit({ type: "usage", ...usage, reported: true })
  });
  return content;
}

async function testConnection(settings, options = {}) {
  return createProvider(settings).testConnection({ signal: options.signal, onDebug: options.onDebug });
}

module.exports = {
  answerWithContext,
  createProvider,
  estimateTokens,
  gatherWorkspaceContext,
  normalizeAiCompanionSettings,
  runAgentToolLoop,
  testConnection,
  throwIfAborted,
  tools
};