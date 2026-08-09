/** Profile-private and workspace-shared storage for confirmed memory topics. */

"use strict";

const fs = require("node:fs/promises");
const path = require("node:path");
const { companionProfilePath } = require("../profile-storage");
const { assertMemoryContentSafe, normalizeMemoryTopic } = require("./memory-topic-policy");

const MAX_INDEX_TOPICS = 200;
const MAX_INDEX_CHARACTERS = 32000;
const writeQueues = new Map();

class CuratedMemoryRepository {
  constructor(request, emit = () => {}) {
    this.request = request;
    this.emit = emit;
  }

  /** Search bounded topic metadata without loading topic bodies. */
  async search(query, options = {}) {
    const terms = tokenize(query);
    const scopes = options.scope ? [options.scope] : ["personal", "team"];
    const entries = (await Promise.all(scopes.map((scope) => this.readIndex(scope)))).flat();
    return entries
      .map((entry) => ({ ...entry, score: score(entry, terms) }))
      .filter((entry) => !terms.length || entry.score > 0)
      .sort((a, b) => b.score - a.score || String(b.updatedAt).localeCompare(String(a.updatedAt)))
      .slice(0, Math.max(1, Math.min(Number(options.maxResults) || 8, 30)))
      .map(({ score: _score, ...entry }) => entry);
  }

  /** Read one confirmed topic body by stable identifier. */
  async read(id, scope = "") {
    const scopes = scope ? [scope, ...["personal", "team"].filter((candidate) => candidate !== scope)] : ["personal", "team"];
    const entries = (await Promise.all(scopes.map((candidate) => this.readIndex(candidate)))).flat();
    const entry = entries.find((item) => item.id === String(id || ""));
    if (!entry) throw memoryNotFound(id);
    const filePath = path.join(this.scopeRoot(entry.scope), entry.file);
    const content = await fs.readFile(filePath, "utf8");
    return { ...entry, content: parseBody(content) };
  }

  /** Persist a user-confirmed new or revised topic atomically. */
  async confirm(proposal) {
    const existing = proposal.id ? await this.readOptional(proposal.id, proposal.scope) : null;
    const topic = normalizeMemoryTopic(proposal, existing);
    assertMemoryContentSafe(topic);
    const root = this.scopeRoot(topic.scope);
    if (!root) throw new Error(`The ${topic.scope} memory scope is unavailable.`);
    return queueWrite(root, async () => {
      await fs.mkdir(root, { recursive: true });
      const file = `${safeName(topic.title)}-${topic.id}.md`;
      if (existing?.file && (existing.file !== file || existing.scope !== topic.scope)) await fs.rm(path.join(this.scopeRoot(existing.scope), existing.file), { force: true });
      if (existing?.scope && existing.scope !== topic.scope) await this.writeIndex(existing.scope, (await this.readIndex(existing.scope)).filter((entry) => entry.id !== topic.id));
      await atomicWrite(path.join(root, file), serializeTopic(topic));
      const index = await this.readIndex(topic.scope);
      const metadata = metadataFor(topic, file);
      await this.writeIndex(topic.scope, [...index.filter((entry) => entry.id !== topic.id), metadata]);
      this.emit({ type: existing ? "memory-confirmed" : "memory-confirmed", operation: existing ? "update" : "create", memory: metadata, summary: `${existing ? "Updated" : "Saved"} ${topic.scope} memory: ${topic.title}` });
      return { ...metadata, content: topic.content };
    });
  }

  /** Delete one topic after a separate user confirmation. */
  async forget(id, scope = "") {
    const topic = await this.read(id, scope);
    const root = this.scopeRoot(topic.scope);
    return queueWrite(root, async () => {
      await fs.rm(path.join(root, topic.file), { force: true });
      await this.writeIndex(topic.scope, (await this.readIndex(topic.scope)).filter((entry) => entry.id !== topic.id));
      this.emit({ type: "memory-forgotten", memory: metadataFor(topic, topic.file), summary: `Removed ${topic.scope} memory: ${topic.title}` });
      return { forgotten: true, id: topic.id, scope: topic.scope };
    });
  }

  /** Return relevant bounded summaries for prompt injection. */
  async promptIndex(query, maxCharacters = 16000) {
    const results = await this.search(query, { maxResults: 20 });
    let used = 0;
    const selected = [];
    for (const entry of results) {
      const line = `[${entry.scope}/${entry.type}] ${entry.title}: ${entry.summary} (memory:${entry.id})`;
      if (used + line.length > maxCharacters) break;
      selected.push(line);
      used += line.length;
    }
    return selected;
  }

  /** Return storage-safe index state for diagnostics and recovery references. */
  async indexSnapshot() {
    return { personal: await this.readIndex("personal"), team: await this.readIndex("team") };
  }

  scopeRoot(scope) {
    if (scope === "personal") return companionProfilePath(this.request.profileRoot, "memory", "personal");
    if (scope === "team") return this.request.workspaceRoot ? path.join(this.request.workspaceRoot, ".md-editor", "companion", "memory", "team") : "";
    return "";
  }

  async readOptional(id, scope) {
    try { return await this.read(id, scope); } catch (error) { if (error?.code === "MEMORY_NOT_FOUND") return null; throw error; }
  }

  async readIndex(scope) {
    const root = this.scopeRoot(scope);
    if (!root) return [];
    try {
      const value = JSON.parse(await fs.readFile(path.join(root, "index.json"), "utf8"));
      return Array.isArray(value?.topics) ? value.topics.slice(-MAX_INDEX_TOPICS).map((entry) => ({ ...entry, scope })) : [];
    } catch (error) {
      if (error?.code === "ENOENT" || error instanceof SyntaxError) return [];
      throw error;
    }
  }

  async writeIndex(scope, entries) {
    const root = this.scopeRoot(scope);
    const topics = entries.sort((a, b) => String(a.updatedAt).localeCompare(String(b.updatedAt))).slice(-MAX_INDEX_TOPICS);
    while (JSON.stringify(topics).length > MAX_INDEX_CHARACTERS && topics.length > 1) topics.shift();
    await fs.mkdir(root, { recursive: true });
    await atomicWrite(path.join(root, "index.json"), `${JSON.stringify({ version: 1, scope, topics }, null, 2)}\n`);
  }
}

function metadataFor(topic, file) {
  const { content: _content, ...metadata } = topic;
  return { ...metadata, file };
}

function serializeTopic(topic) {
  return `---\nid: ${JSON.stringify(topic.id)}\nscope: ${JSON.stringify(topic.scope)}\ntype: ${JSON.stringify(topic.type)}\ntitle: ${JSON.stringify(topic.title)}\ntags: ${JSON.stringify(topic.tags)}\nsummary: ${JSON.stringify(topic.summary)}\ncreatedAt: ${JSON.stringify(topic.createdAt)}\nupdatedAt: ${JSON.stringify(topic.updatedAt)}\nconfirmedAt: ${JSON.stringify(topic.confirmedAt)}\ndigest: ${JSON.stringify(topic.digest)}\n---\n\n${topic.content}\n`;
}

function parseBody(value) { return String(value || "").replace(/^---\s*[\s\S]*?\s*---\s*/m, "").trim(); }
function safeName(value) { return String(value || "memory").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 60) || "memory"; }
function tokenize(value) { return Array.from(new Set(String(value || "").toLowerCase().match(/[a-z0-9_.-]{2,}/g) || [])); }
function score(entry, terms) { const haystack = `${entry.title} ${entry.summary} ${(entry.tags || []).join(" ")} ${entry.type}`.toLowerCase(); return terms.reduce((total, term) => total + (haystack.includes(term) ? 3 : 0), 0); }
function memoryNotFound(id) { const error = new Error(`Memory topic not found: ${id}`); error.code = "MEMORY_NOT_FOUND"; error.retryable = false; error.doNotRetry = true; return error; }
function queueWrite(key, operation) { const previous = writeQueues.get(key) || Promise.resolve(); const next = previous.then(operation, operation).finally(() => { if (writeQueues.get(key) === next) writeQueues.delete(key); }); writeQueues.set(key, next); return next; }
async function atomicWrite(filePath, content) { const temporary = `${filePath}.${process.pid}.${Date.now()}.tmp`; await fs.writeFile(temporary, content, "utf8"); await fs.rename(temporary, filePath); }

module.exports = { CuratedMemoryRepository, MAX_INDEX_CHARACTERS, MAX_INDEX_TOPICS };
