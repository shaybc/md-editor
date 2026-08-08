/**
 * Profile-backed prompt defaults for AI Companion.
 */

"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { migratePromptProfile, resolvePromptUpgrade } = require("./prompt-profile-migration");

const PROFILE_DIR = ".md-editor";
const PROMPTS_PROFILE_FILE = "companion/prompts.json";
const PROMPTS_DOCUMENT_TYPE = "md-editor-ai-companion-prompts";
const PROMPTS_SCHEMA_VERSION = 3;
// Increment whenever any bundled prompt key or default text changes.
const PROMPTS_DEFAULT_REVISION = 13;

const PROMPT_ENTRY_DEFINITIONS = Object.freeze([
  { keyPath: "chatSystem", name: "Chat instructions", description: "Application instructions for autonomous read-oriented conversation." },
  { keyPath: "agentSystem", name: "Agent instructions", description: "Application instructions for autonomous workspace work." },
  { keyPath: "planSystem", name: "Plan instructions", description: "Application instructions for autonomous plan research and repository persistence." },
  { keyPath: "gitSummarySystem", name: "Git summary system prompt", description: "System instructions for summarizing Git panel change digests and commit messages." },
  { keyPath: "gitSummaryFinalAnswer", name: "Git summary final answer prompt", description: "Final-answer instruction requiring Git summary output as a single JSON object." },
  { keyPath: "autocomplete.line.systemPrompt", name: "Autocomplete line system prompt", description: "System instructions for small inline completions at the cursor." },
  { keyPath: "autocomplete.line.taskInstruction", name: "Autocomplete line task instruction", description: "User-task instruction paired with line autocomplete context." },
  { keyPath: "autocomplete.block.systemPrompt", name: "Autocomplete block system prompt", description: "System instructions for completing an empty function, method, or block." },
  { keyPath: "autocomplete.block.taskInstruction", name: "Autocomplete block task instruction", description: "User-task instruction paired with block autocomplete context." },
  { keyPath: "autocomplete.comment.systemPrompt", name: "Autocomplete comment system prompt", description: "System instructions for continuing an unfinished comment." },
  { keyPath: "autocomplete.comment.taskInstruction", name: "Autocomplete comment task instruction", description: "User-task instruction paired with comment autocomplete context." }
]);

const DEFAULT_AI_COMPANION_PROMPTS = Object.freeze({
  chatSystem: [
    "You are AI Companion inside MD-Editor.",
    "Answer ordinary conversation directly. Use read-only tools when the answer depends on workspace or editor state.",
    "Do not invent workspace facts. If the available evidence is insufficient, say what information is missing.",
    "For longer tool-assisted work, you may inspect and release older tool observations that are no longer useful while preserving recent or unresolved evidence.",
    "Finish naturally with a useful text response; tools are optional."
  ].join(" "),
  agentSystem: [
    "You are AI Companion inside MD-Editor.",
    "Choose your own approach and use available tools when they help complete the user's request.",
    "Inspect relevant state before changing it, honor the approval system, and report blockers honestly.",
    "For large work, you may create work items or delegate bounded independent tasks. Decomposition remains your decision.",
    "For longer tool-assisted work, you may inspect and release older tool observations that are no longer useful while preserving recent or unresolved evidence.",
    "Do not claim an action succeeded unless its tool result supports that statement."
  ].join(" "),
  planSystem: [
    "You are AI Companion inside MD-Editor in Plan mode.",
    "Research the workspace with read-only tools and create a decision-complete Markdown implementation plan.",
    "Persist a new plan with plan_create. When revising an identified plan, read it and preserve its identity with plan_update.",
    "Do not create duplicate plans for the same task. Persist the complete Markdown body before finishing.",
    "For longer research, you may inspect and release older tool observations that are no longer useful while preserving recent or unresolved evidence.",
    "Plan mode may write only to the plan repository; do not modify workspace files or run commands."
  ].join(" "),  gitSummarySystem: [
    "You are the md-editor Git assistant. You are given a digest of the repository's",
    "local Git state: branch/upstream status, unpushed commits, and diffs of staged,",
    "unstaged, and untracked changes. Your job is to summarize what changed in",
    "business/product terms and to propose a commit message.",
    "",
    "Rules:",
    "- Describe product behavior, workflow impact, user-facing changes, compatibility",
    "  changes, and validation/test coverage - NOT file counts, line counts, renames,",
    "  or code mechanics. Mention identifiers (function/option/setting names) only",
    "  when they clarify behavior.",
    "- Base every statement on evidence in the digest. If a diff hunk is ambiguous,",
    "  use the read_file / search_text / glob tools to inspect the surrounding code",
    "  before describing it. Never invent changes.",
    "- You are read-only. Do not attempt to edit files or run commands.",
    "- Some patches may be truncated (listed in \"truncated\"); their --stat lines are",
    "  still present - read those files with tools if they matter to the summary.",
    "- The commit message must cover ONLY the changes indicated by commitScope",
    "  (\"staged\" = staged changes only; \"all\" = all uncommitted changes). The summary",
    "  covers everything, including unpushed commits.",
    "- Commit subject: imperative mood, at most 72 characters, behavior-level (for",
    "  example \"Support async confirmation modal when restoring default preferences\"),",
    "  no file lists, no conventional-commit prefix unless the unpushed commits in the",
    "  digest use one (then match their style).",
    "- Commit body: short markdown bullets, each a distinct behavior change.",
    "",
    "Respond with ONLY a JSON object, no markdown fences, in this shape:",
    "{",
    "  \"commitSubject\": \"string\",",
    "  \"commitBody\": \"markdown bullets or empty string\",",
    "  \"summaryMarkdown\": \"markdown with these sections, omitting empty ones:",
    "     '## Git State' (1-3 bullets: ahead/behind, unpushed commit count, dirty or",
    "     clean), '## Unpushed Commits' (behavior-level bullets), '## What Changed",
    "     Locally' (behavior-level bullets, nested bullets for sub-details),",
    "     '## Validation / Tests' (test coverage added or affected)\"",
    "}",
    "If there are no pending changes and no unpushed commits, say so in",
    "summaryMarkdown and return empty commit fields."
  ].join("\n"),
  gitSummaryFinalAnswer: "Provide the final answer now as the single JSON object described in the system message, with no markdown fences and no extra prose.",
  autocomplete: Object.freeze({
    line: Object.freeze({
      systemPrompt: "Return only the exact code or prose that should be inserted at the cursor. No markdown fences, no explanation. " +
        "If the cursor sits inside an unfinished line comment (e.g. after `//` or `#`), do not append code onto that same line " +
        "- finish the comment text naturally if needed, then start your reply with a newline and put any code on the line(s) " +
        "after it, matching the surrounding indentation. Never repeat text that is already present immediately before or after the cursor.",
      taskInstruction: "Complete the next small span at the cursor."
    }),
    block: Object.freeze({
      systemPrompt: "Return only the exact code that should be inserted at the cursor to complete the current function, method, or " +
        "block. No markdown fences, no explanation. Write the complete, working implementation - not a fragment - matching the " +
        "naming, error handling, and comment conventions already used elsewhere in this file. Stop once the block you're completing " +
        "is syntactically closed; do not continue into unrelated code after it. Never repeat text already present immediately " +
        "before or after the cursor.",
      taskInstruction: "The cursor is at the start of an empty function/method/block body (or on a blank line right after a comment " +
        "describing one that hasn't been implemented yet). Write its complete implementation."
    }),
    comment: Object.freeze({
      systemPrompt: "Return only the plain-text continuation of the comment the user is currently writing, in the same comment style " +
        "(e.g. continuing a `//`/`#` line, or continuing inside an open block comment). No markdown fences, no explanation, and no " +
        "code. Continue naturally from exactly where the cursor is - that might be finishing a word, the rest of the sentence, or, " +
        "if it clearly reads as an unfinished multi-line explanation, a few more comment lines. Stop once the thought is complete; " +
        "don't drift into describing a new unrelated topic. Never repeat text already present immediately before or after the cursor.",
      taskInstruction: "Continue the comment at the cursor."
    })
  })
});

const LEGACY_PROMPT_DEFAULTS_BY_SCHEMA = Object.freeze({
  1: JSON.parse(JSON.stringify(DEFAULT_AI_COMPANION_PROMPTS)),
  2: JSON.parse(JSON.stringify(DEFAULT_AI_COMPANION_PROMPTS)),
  3: JSON.parse(JSON.stringify(DEFAULT_AI_COMPANION_PROMPTS))
});
const PROMPT_RENAMES_BY_REVISION = Object.freeze({});

function getProfileRoot(options = {}) {
  return path.resolve(String(options.profileRoot || path.join(os.homedir(), PROFILE_DIR)));
}

function getPromptProfilePath(options = {}) {
  return path.join(getProfileRoot(options), ...PROMPTS_PROFILE_FILE.split("/"));
}

function createDefaultPromptProfile() {
  const prompts = JSON.parse(JSON.stringify(DEFAULT_AI_COMPANION_PROMPTS));
  return {
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: PROMPTS_SCHEMA_VERSION,
    resolvedDefaultRevision: PROMPTS_DEFAULT_REVISION,
    prompts,
    basePrompts: JSON.parse(JSON.stringify(prompts)),
    retiredPrompts: {},
    pendingUpgrade: null
  };
}

function getStringOverride(value, fallback) {
  return typeof value === "string" && value ? value : fallback;
}

function getPromptValue(prompts, keyPath) {
  return String(keyPath || "").split(".").reduce((value, segment) => {
    if (!value || typeof value !== "object") return undefined;
    return value[segment];
  }, prompts);
}

function setPromptValue(prompts, keyPath, value) {
  const definition = PROMPT_ENTRY_DEFINITIONS.find((entry) => entry.keyPath === keyPath);
  if (!definition) throw new Error("AI Companion prompt entry is not supported.");
  const segments = keyPath.split(".");
  let target = prompts;
  for (const segment of segments.slice(0, -1)) {
    if (!target[segment] || typeof target[segment] !== "object" || Array.isArray(target[segment])) target[segment] = {};
    target = target[segment];
  }
  target[segments[segments.length - 1]] = String(value || "");
}

function listPromptEntries(prompts = DEFAULT_AI_COMPANION_PROMPTS, profile = null) {
  const normalized = normalizePromptStrings(prompts);
  return PROMPT_ENTRY_DEFINITIONS.map((definition) => {
    const value = String(getPromptValue(normalized, definition.keyPath) || "");
    const baseValue = profile ? getPromptValue(profile.basePrompts, definition.keyPath) : value;
    return {
      keyPath: definition.keyPath,
      name: definition.name,
      description: definition.description,
      value,
      customized: typeof baseValue === "string" && value !== baseValue,
      upgradeConflict: !!profile?.pendingUpgrade?.conflictKeys?.includes(definition.keyPath),
      retired: false
    };
  });
}

function normalizeAutocompletePrompts(value) {
  const source = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  return Object.fromEntries(Object.entries(DEFAULT_AI_COMPANION_PROMPTS.autocomplete).map(([scope, defaults]) => {
    const override = source[scope] && typeof source[scope] === "object" && !Array.isArray(source[scope]) ? source[scope] : {};
    return [scope, {
      systemPrompt: getStringOverride(override.systemPrompt, defaults.systemPrompt),
      taskInstruction: getStringOverride(override.taskInstruction, defaults.taskInstruction)
    }];
  }));
}

function normalizePromptStrings(prompts) {
  const source = prompts && typeof prompts === "object" && !Array.isArray(prompts) ? prompts : {};
  const normalized = {};
  for (const definition of PROMPT_ENTRY_DEFINITIONS) {
    setPromptValue(normalized, definition.keyPath, getStringOverride(getPromptValue(source, definition.keyPath), getPromptValue(DEFAULT_AI_COMPANION_PROMPTS, definition.keyPath)));
  }
  normalized.autocomplete = normalizeAutocompletePrompts(source.autocomplete);
  return normalized;
}

function normalizePromptProfile(payload) {
  const source = payload && typeof payload === "object" && !Array.isArray(payload) ? payload : {};
  const prompts = normalizePromptStrings(source.prompts);
  const basePrompts = source.basePrompts && typeof source.basePrompts === "object"
    ? normalizePromptStrings(source.basePrompts) : JSON.parse(JSON.stringify(prompts));
  return {
    documentType: PROMPTS_DOCUMENT_TYPE,
    schemaVersion: Number(source.schemaVersion || 1),
    resolvedDefaultRevision: Number(source.resolvedDefaultRevision || source.schemaVersion || 1),
    prompts,
    basePrompts,
    retiredPrompts: source.retiredPrompts && typeof source.retiredPrompts === "object" ? JSON.parse(JSON.stringify(source.retiredPrompts)) : {},
    pendingUpgrade: source.pendingUpgrade && typeof source.pendingUpgrade === "object" ? JSON.parse(JSON.stringify(source.pendingUpgrade)) : null
  };
}

function migrationOptions(profile) {
  return { profile, documentType: PROMPTS_DOCUMENT_TYPE, schemaVersion: PROMPTS_SCHEMA_VERSION,
    defaultRevision: PROMPTS_DEFAULT_REVISION, currentDefaults: DEFAULT_AI_COMPANION_PROMPTS,
    legacyDefaultsBySchema: LEGACY_PROMPT_DEFAULTS_BY_SCHEMA, renamesByRevision: PROMPT_RENAMES_BY_REVISION,
    definitions: PROMPT_ENTRY_DEFINITIONS };
}

async function writePromptProfile(filePath, profile) {
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp-${process.pid}-${Date.now()}`;
  await fs.writeFile(temporaryPath, `${JSON.stringify(profile, null, 2)}\n`, "utf8");
  await fs.rename(temporaryPath, filePath);
}

async function analyzePromptUpgrade(options = {}) {
  if (!options.profileRoot) return migratePromptProfile(migrationOptions(createDefaultPromptProfile()));
  const filePath = getPromptProfilePath(options);
  let rawProfile;
  try {
    rawProfile = JSON.parse(await fs.readFile(filePath, "utf8") || "{}");
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
    const defaults = createDefaultPromptProfile();
    await writePromptProfile(filePath, defaults);
    return migratePromptProfile(migrationOptions(defaults));
  }
  const analysis = migratePromptProfile(migrationOptions(rawProfile));
  if (analysis.changed) await writePromptProfile(filePath, analysis.profile);
  return analysis;
}

async function loadPromptProfile(options = {}) {
  if (!options.profileRoot) return createDefaultPromptProfile();
  try {
    return (await analyzePromptUpgrade(options)).profile;
  } catch (_) {
    return createDefaultPromptProfile();
  }
}

/** Load the effective prompt strings, including unresolved user customizations. */
async function loadAiCompanionPrompts(options = {}) {
  return (await loadPromptProfile(options)).prompts;
}

async function listProfilePromptEntries(options = {}) {
  const profile = await loadPromptProfile(options);
  const entries = listPromptEntries(profile.prompts, profile);
  for (const [keyPath, value] of Object.entries(profile.retiredPrompts || {})) {
    entries.push({ keyPath, name: keyPath, description: "Retired customized prompt", value: String(value), customized: true, upgradeConflict: false, retired: true });
  }
  return entries;
}

async function updateProfilePromptEntry(options = {}, keyPath, value) {
  const profile = await loadPromptProfile(options);
  setPromptValue(profile.prompts, keyPath, value);
  if (options.profileRoot) await writePromptProfile(getPromptProfilePath(options), profile);
  return listPromptEntries(profile.prompts, profile);
}

async function checkPromptProfileUpgrade(options = {}) {
  const analysis = await analyzePromptUpgrade(options);
  return { status: analysis.status, fromRevision: analysis.fromRevision, toRevision: analysis.toRevision,
    conflictCount: analysis.conflicts.length, upgradeToken: analysis.upgradeToken };
}

async function getPromptProfileUpgradeConflicts(options = {}, upgradeToken) {
  const analysis = await analyzePromptUpgrade(options);
  if (upgradeToken && upgradeToken !== analysis.upgradeToken) {
    const error = new Error("The prompt profile changed while the upgrade was being reviewed.");
    error.code = "stale-upgrade";
    throw error;
  }
  return { status: analysis.conflicts.length ? "conflicts" : "current", fromRevision: analysis.fromRevision,
    toRevision: analysis.toRevision, upgradeToken: analysis.upgradeToken, conflicts: analysis.conflicts };
}

async function resolvePromptProfileUpgrade(options = {}, request = {}) {
  const analysis = await analyzePromptUpgrade(options);
  const resolved = resolvePromptUpgrade(Object.assign(migrationOptions(analysis.profile), request));
  const filePath = getPromptProfilePath(options);
  if (request.strategy === "use-defaults") {
    const backupPath = `${filePath}.backup`;
    await fs.copyFile(filePath, backupPath);
  }
  await writePromptProfile(filePath, resolved);
  return { status: "resolved", entries: listPromptEntries(resolved.prompts, resolved) };
}

module.exports = {
  DEFAULT_AI_COMPANION_PROMPTS,
  PROMPTS_DOCUMENT_TYPE,
  PROMPTS_PROFILE_FILE,
  PROMPTS_SCHEMA_VERSION,
  PROMPTS_DEFAULT_REVISION,
  createDefaultPromptProfile,
  checkPromptProfileUpgrade,
  getPromptProfileUpgradeConflicts,
  resolvePromptProfileUpgrade,
  getPromptProfilePath,
  listProfilePromptEntries,
  listPromptEntries,
  loadAiCompanionPrompts,
  loadPromptProfile,
  normalizePromptProfile,
  updateProfilePromptEntry
};
