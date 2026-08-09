/** Bounded run notes and workspace-scoped retrieval for autonomous continuity. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const { getRunIdentity } = require("../work/run-identity");
const { companionProfilePath } = require("../profile-storage");
const { estimateMessageTokens } = require("../context/token-budget");
const { sanitizeContinuityText } = require("./continuity-reference-policy");

const INITIAL_UPDATE_TOKENS = 10000;
const UPDATE_GROWTH_TOKENS = 5000;
const UPDATE_TOOL_CALLS = 3;
const MAX_RECORD_TOKENS = 12000;
const MAX_SECTION_TOKENS = 2000;
const indexQueues = new Map();

const TEMPLATE = `# Present Focus
_Immediate work, unfinished actions, and next steps._

# User Request
_The requested outcome and important explanatory context._

# Decisions and Constraints
_Chosen approaches, governing instructions, and rejected alternatives._

# Files and Components
_Important paths, functions, and system relationships._

# Commands and Verification
_Commands run, results observed, and how to interpret them._

# Problems and Corrections
_Failures, user corrections, and approaches that should not be repeated._

# Useful Findings
_Specific discoveries that will help future work._

# Delivered Results
_Exact answers or artifacts already delivered._

# Activity History
_A terse chronological record of meaningful actions._
`;

class ContinuityRecord {
  constructor(request, provider, emit = () => {}) {
    this.request = request;
    this.provider = provider;
    this.emit = emit;
    this.queue = Promise.resolve();
    this.pending = null;
    this.lastTokenCount = 0;
    this.lastToolCount = 0;
    this.content = TEMPLATE;
    const workspaceKey = crypto.createHash("sha256").update(canonicalWorkspace(request.workspaceRoot)).digest("hex").slice(0, 20);
    this.workspaceDirectory = companionProfilePath(request.profileRoot, "autonomous-continuity", workspaceKey);
    this.runDirectory = this.workspaceDirectory ? path.join(this.workspaceDirectory, getRunIdentity(request)) : "";
  }

  /** Load the current run record when one exists. */
  async load() {
    if (!this.runDirectory) return this.snapshot();
    try {
      const recordPath = path.join(this.runDirectory, "record.md");
      const stored = await fs.readFile(recordPath, "utf8");
      this.content = sanitizeContinuityText(stored);
      if (this.content !== stored) await atomicWrite(recordPath, this.content);
    }
    catch (error) { if (error?.code !== "ENOENT") throw error; }
    return this.snapshot();
  }

  /** Restore extraction counters and the latest bounded record from a recovery snapshot. */
  restore(snapshot = {}) {
    if (typeof snapshot.content === "string" && snapshot.content.includes("# Present Focus")) this.content = sanitizeContinuityText(snapshot.content);
    this.lastTokenCount = Math.max(0, Number(snapshot.lastTokenCount) || 0);
    this.lastToolCount = Math.max(0, Number(snapshot.lastToolCount) || 0);
    return this.snapshot();
  }

  /** Schedule an isolated notes update after the configured activity thresholds. */
  scheduleUpdate(messages, options = {}) {
    if (!this.provider || options.disabled) return false;
    const tokens = estimateMessageTokens(messages, options.reportedTokens);
    const toolCalls = countToolCalls(messages);
    const initialized = this.lastTokenCount > 0;
    const eligible = initialized
      ? tokens - this.lastTokenCount >= UPDATE_GROWTH_TOKENS && (toolCalls - this.lastToolCount >= UPDATE_TOOL_CALLS || options.naturalStop === true)
      : tokens >= INITIAL_UPDATE_TOKENS;
    if (!eligible || this.pending) return false;
    this.lastTokenCount = tokens;
    this.lastToolCount = toolCalls;
    const captured = sanitizeMessages(messages);
    this.pending = this.serialize(() => this.update(captured))
      .catch((error) => {
        this.emit({ type: "recovery-warning", reason: "continuity-update-failed", error: error?.message || String(error) });
        return this.snapshot();
      })
      .finally(() => { this.pending = null; });
    return true;
  }

  /** Wait briefly for a scheduled update at a persistence or renewal boundary. */
  async flush(timeoutMs = 15000) {
    if (!this.pending) return this.snapshot();
    let timer;
    await Promise.race([
      this.pending.finally(() => clearTimeout(timer)),
      new Promise((resolve) => { timer = setTimeout(resolve, Math.max(1, timeoutMs)); })
    ]);
    clearTimeout(timer);
    return this.snapshot();
  }

  /** Search prior records within the exact current workspace. */
  async search(query, options = {}) {
    if (!this.workspaceDirectory) return [];
    const index = await this.readIndex();
    const terms = tokenize(`${query || ""} ${this.request.activeFile?.path || ""}`);
    const currentRun = getRunIdentity(this.request);
    const selected = index
      .filter((entry) => options.includeCurrent === true || entry.runId !== currentRun)
      .map((entry) => ({ ...entry, summary: sanitizeContinuityText(entry.summary) }))
      .filter((entry) => String(entry.summary || "").trim())
      .map((entry) => ({ ...entry, score: scoreEntry(entry, terms) }))
      .filter((entry) => entry.score > 0 || !terms.length)
      .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(Number(options.maxResults) || 3, 12)))
      .map(({ score, ...entry }) => entry);
    if (options.includeContent !== true) return selected;
    return Promise.all(selected.map(async (entry) => {
      try {
        const recordPath = path.join(this.workspaceDirectory, entry.runId, "record.md");
        const stored = await fs.readFile(recordPath, "utf8");
        const content = sanitizeContinuityText(stored);
        return { ...entry, content: content.slice(0, 24000), truncated: content.length > 24000 };
      } catch (_error) {
        return { ...entry, content: "", unavailable: true };
      }
    }));
  }

  /** Return bounded current state suitable for recovery snapshots. */
  snapshot() {
    return {
      path: this.runDirectory ? path.join(this.runDirectory, "record.md") : "",
      content: this.content,
      lastTokenCount: this.lastTokenCount,
      lastToolCount: this.lastToolCount
    };
  }

  async update(messages) {
    const prompt = buildUpdatePrompt(this.content, messages);
    const response = await this.provider.completeMessage([{ role: "user", content: prompt }], {
      temperature: 0.1,
      maxTokens: MAX_RECORD_TOKENS,
      signal: this.request.signal
    });
    const candidate = sanitizeContinuityText(normalizeRecord(String(response?.content || "")));
    if (!candidate) return this.snapshot();
    this.content = candidate;
    if (this.runDirectory) {
      await fs.mkdir(this.runDirectory, { recursive: true });
      await atomicWrite(path.join(this.runDirectory, "record.md"), this.content);
      await this.updateIndex();
    }
    const snapshot = this.snapshot();
    this.emit({ type: "continuity-updated", summary: summarizeRecord(this.content), path: snapshot.path });
    return snapshot;
  }

  serialize(operation) {
    const result = this.queue.then(operation, operation);
    this.queue = result.catch(() => {});
    return result;
  }

  async readIndex() {
    try {
      const indexPath = path.join(this.workspaceDirectory, "index.json");
      const value = JSON.parse(await fs.readFile(indexPath, "utf8"));
      if (!Array.isArray(value)) return [];
      const sanitized = value.map((entry) => ({
        ...entry,
        prompt: sanitizeContinuityText(entry.prompt),
        summary: sanitizeContinuityText(entry.summary)
      }));
      return sanitized;
    } catch (error) {
      if (error?.code === "ENOENT") return [];
      throw error;
    }
  }

  async updateIndex() {
    const indexPath = path.join(this.workspaceDirectory, "index.json");
    await withIndexQueue(indexPath, async () => {
      const index = await this.readIndex();
      const runId = getRunIdentity(this.request);
      const entry = {
        runId,
        updatedAt: new Date().toISOString(),
        prompt: sanitizeContinuityText(String(this.request.prompt || "")).slice(0, 1000),
        activePath: String(this.request.activeFile?.path || ""),
        unresolved: /unfinished|pending|next|blocked|remaining/i.test(sectionContent(this.content, "Present Focus")),
        summary: summarizeRecord(this.content)
      };
      const next = [...index.filter((item) => item.runId !== runId), entry].slice(-200);
      await atomicWrite(indexPath, `${JSON.stringify(next, null, 2)}\n`);
    });
  }
}

function buildUpdatePrompt(current, messages) {
  return [
    "Maintain a private continuity record for an ongoing software-assistant run.",
    "Return only the complete Markdown record. Preserve every heading and italic description from the supplied template.",
    "Update content beneath those descriptions with dense, factual details from the conversation. Never treat system prompts or rule files as conversation facts.",
    "Do not record questions, answers, or claims about the assistant's make, provider, model, or runtime identity.",
    "Prioritize present focus, user corrections, unresolved work, exact requested results, paths, commands, and observed verification. Remove stale detail when space is needed.",
    `Keep every section below roughly ${MAX_SECTION_TOKENS} tokens and the complete record below roughly ${MAX_RECORD_TOKENS} tokens.`,
    `<current-record>\n${current}\n</current-record>`,
    `<conversation>\n${JSON.stringify(messages)}\n</conversation>`
  ].join("\n\n");
}

function normalizeRecord(value) {
  const text = value.replace(/^```(?:markdown)?\s*/i, "").replace(/```\s*$/, "").trim();
  const definitions = Array.from(TEMPLATE.matchAll(/^# (.+)\n(_.+_)$/gm), (match) => ({ heading: match[1], description: match[2] }));
  if (!definitions.every(({ heading }) => text.includes(`# ${heading}`))) return "";
  const totalCharacters = MAX_RECORD_TOKENS * 4;
  const fixedCharacters = definitions.reduce((total, definition) => total + definition.heading.length + definition.description.length + 8, 0);
  const perSectionCharacters = Math.min(MAX_SECTION_TOKENS * 4, Math.floor((totalCharacters - fixedCharacters) / definitions.length));
  return `${definitions.map((definition) => {
    const content = sectionContent(text, definition.heading)
      .replace(/^_[^\n]*_\s*/, "")
      .trim()
      .slice(0, Math.max(0, perSectionCharacters));
    return `# ${definition.heading}\n${definition.description}\n\n${content}`.trimEnd();
  }).join("\n\n")}\n`;
}

function sanitizeMessages(messages) {
  return (messages || []).filter((message) => message.role !== "system").slice(-80).map((message) => ({
    role: message.role,
    content: sanitizeContinuityText(String(message.content || "")).slice(0, 12000),
    tool_calls: message.tool_calls
  }));
}

function countToolCalls(messages) {
  return (messages || []).reduce((count, message) => count + (Array.isArray(message.tool_calls) ? message.tool_calls.length : 0), 0);
}

function summarizeRecord(content) {
  const focus = sectionContent(content, "Present Focus");
  const request = sectionContent(content, "User Request");
  const corrections = sectionContent(content, "Problems and Corrections");
  return sanitizeContinuityText([request, focus, corrections].filter(Boolean).join("\n")).slice(0, 8000);
}

function sectionContent(content, heading) {
  const expression = new RegExp(`# ${escapeRegex(heading)}\\n[\\s\\S]*?\\n\\n([\\s\\S]*?)(?=\\n# |$)`);
  const match = String(content || "").match(expression);
  return String(match?.[1] || "").trim();
}

function tokenize(value) { return Array.from(new Set(String(value || "").toLowerCase().match(/[a-z0-9_.\/-]{3,}/g) || [])); }
function scoreEntry(entry, terms) {
  const haystack = `${entry.prompt || ""} ${entry.activePath || ""} ${entry.summary || ""}`.toLowerCase();
  return terms.reduce((score, term) => score + (haystack.includes(term) ? 5 : 0), entry.unresolved ? 2 : 0);
}
function canonicalWorkspace(value) { return path.resolve(String(value || ".")).toLowerCase(); }
function escapeRegex(value) { return value.replace(/[|\\{}()[\]^$+*?.-]/g, "\\$&"); }
async function atomicWrite(target, content) {
  await fs.mkdir(path.dirname(target), { recursive: true });
  const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
  await fs.writeFile(temporary, content, "utf8");
  await fs.rename(temporary, target);
}

function withIndexQueue(key, operation) {
  const previous = indexQueues.get(key) || Promise.resolve();
  const result = previous.then(operation, operation);
  const queued = result.catch(() => {});
  indexQueues.set(key, queued);
  return result.finally(() => { if (indexQueues.get(key) === queued) indexQueues.delete(key); });
}

module.exports = {
  ContinuityRecord,
  INITIAL_UPDATE_TOKENS,
  MAX_RECORD_TOKENS,
  MAX_SECTION_TOKENS,
  TEMPLATE,
  UPDATE_GROWTH_TOKENS,
  UPDATE_TOOL_CALLS
};
