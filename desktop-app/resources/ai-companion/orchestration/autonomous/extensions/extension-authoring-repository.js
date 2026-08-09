/** Transactional repository for profile and workspace extension authoring. */

"use strict";

const crypto = require("node:crypto");
const fs = require("node:fs/promises");
const path = require("node:path");
const YAML = require("yaml");
const { getExtensionRoots } = require("./extension-roots");
const { parseMarkdownDefinition } = require("./markdown-definition");
const { readBundle } = require("./bundle-discovery");
const { migrateExtensionState, updateExtensionState } = require("./extension-state-store");
const { validateAuthoredExtension } = require("./extension-authoring-validator");

const rootQueues = new Map();

class ExtensionAuthoringRepository {
  constructor(request) { this.request = request; }

  async read(scope, id) {
    const rootInfo = this.root(scope, true);
    const bundle = await readBundle(path.join(rootInfo.root, String(id || "")), rootInfo);
    const draft = { manifest: pickManifest(bundle), skills: [], agents: [], hooks: [], mcpServers: [] };
    for (const item of bundle.contributions) {
      const relative = path.relative(bundle.root, item.filePath).replace(/\\/g, "/");
      if (item.kind === "skill" || item.kind === "agent") {
        const parsed = parseMarkdownDefinition(await fs.readFile(item.filePath, "utf8"), { source: item.filePath });
        draft[item.kind === "skill" ? "skills" : "agents"].push({ path: relative, metadata: parsed.metadata, body: parsed.body });
      } else {
        draft[item.kind === "hook" ? "hooks" : "mcpServers"].push({ path: relative, definition: item.metadata });
      }
    }
    return { scope, id: bundle.id, digest: bundle.digest, editable: scope !== "bundled", draft };
  }

  validate(draft) { return publicValidation(validateAuthoredExtension(draft)); }

  async save(input) {
    const scope = normalizeWritableScope(input?.scope);
    const rootInfo = this.root(scope, true);
    const validation = validateAuthoredExtension(input?.draft);
    if (!validation.valid) throw new Error(validation.errors.join(" "));
    const id = validation.normalized.manifest.id;
    const originalId = String(input?.originalId || id);
    return serialize(rootInfo.root, async () => {
      await fs.mkdir(rootInfo.root, { recursive: true });
      if (input?.expectedDigest) await this.assertDigest(rootInfo, originalId, input.expectedDigest);
      else if (await exists(path.join(rootInfo.root, originalId))) throw new Error(`Extension '${originalId}' already exists.`);
      const workRoot = path.join(path.dirname(rootInfo.root), ".extensions-authoring");
      const token = `${Date.now()}-${process.pid}-${crypto.randomBytes(4).toString("hex")}`;
      const stage = path.join(workRoot, `stage-${token}`, id);
      await writeDraft(stage, validation.normalized);
      await readBundle(stage, rootInfo);
      const target = path.join(rootInfo.root, id);
      const original = path.join(rootInfo.root, originalId);
      const backup = path.join(workRoot, `backup-${token}`);
      await fs.mkdir(workRoot, { recursive: true });
      let movedOriginal = false;
      try {
        if (await exists(original)) { await fs.rename(original, backup); movedOriginal = true; }
        if (id !== originalId && await exists(target)) throw new Error(`Extension '${id}' already exists.`);
        await fs.rename(stage, target);
        await fs.rm(path.dirname(stage), { recursive: true, force: true });
        await fs.rm(backup, { recursive: true, force: true });
      } catch (error) {
        if (await exists(target)) await fs.rm(target, { recursive: true, force: true });
        if (movedOriginal && await exists(backup)) await fs.rename(backup, original);
        throw error;
      }
      if (originalId !== id) await migrateExtensionState(this.request.profileRoot, this.request.workspaceRoot, originalId, id);
      if (!input?.expectedDigest) await updateExtensionState(this.request.profileRoot, this.request.workspaceRoot, { id, enabled: false, trusted: false });
      if (scope === "workspace") await updateExtensionState(this.request.profileRoot, this.request.workspaceRoot, { id, trusted: false });
      return this.read(scope, id);
    });
  }

  async duplicate(input) {
    const source = await this.read(input.scope, input.id);
    source.draft.manifest.id = String(input.newId || "");
    source.draft.manifest.name = String(input.newName || `${source.draft.manifest.name} Copy`);
    for (const group of ["skills", "agents", "hooks", "mcpServers"]) for (const entry of source.draft[group]) delete entry.path;
    return this.save({ scope: normalizeWritableScope(input.targetScope || input.scope), draft: source.draft });
  }

  async trash(input) {
    const scope = normalizeWritableScope(input.scope);
    const rootInfo = this.root(scope, true);
    return serialize(rootInfo.root, async () => {
      const source = path.join(rootInfo.root, String(input.id || ""));
      if (!await exists(source)) throw new Error("Extension bundle was not found.");
      const trashRoot = path.join(path.dirname(rootInfo.root), "extensions-trash");
      const recoveryId = `${Date.now()}-${path.basename(source)}`;
      await fs.mkdir(trashRoot, { recursive: true });
      await fs.rename(source, path.join(trashRoot, recoveryId));
      await migrateExtensionState(this.request.profileRoot, this.request.workspaceRoot, input.id, "");
      return { recoveryId, id: input.id, scope };
    });
  }

  async listTrash(scope) {
    const rootInfo = this.root(normalizeWritableScope(scope), true);
    const trashRoot = path.join(path.dirname(rootInfo.root), "extensions-trash");
    try { return (await fs.readdir(trashRoot, { withFileTypes: true })).filter((entry) => entry.isDirectory()).map((entry) => ({ recoveryId: entry.name, id: entry.name.replace(/^\d+-/, ""), scope })); }
    catch (error) { if (error.code === "ENOENT") return []; throw error; }
  }

  async restore(input) {
    const scope = normalizeWritableScope(input.scope);
    const rootInfo = this.root(scope, true);
    return serialize(rootInfo.root, async () => {
      const trashRoot = path.join(path.dirname(rootInfo.root), "extensions-trash");
      const source = path.join(trashRoot, path.basename(String(input.recoveryId || "")));
      const id = path.basename(source).replace(/^\d+-/, "");
      const target = path.join(rootInfo.root, id);
      if (await exists(target)) throw new Error(`Extension '${id}' already exists.`);
      await fs.mkdir(rootInfo.root, { recursive: true });
      await fs.rename(source, target);
      await updateExtensionState(this.request.profileRoot, this.request.workspaceRoot, { id, enabled: false, trusted: false });
      return this.read(scope, id);
    });
  }

  async export(input) {
    const source = await this.read(input.scope, input.id);
    const sourceRoot = path.join(this.root(input.scope, true).root, source.id);
    const destination = path.resolve(String(input.destination || ""), source.id);
    if (!input.destination) throw new Error("An export destination is required.");
    if (await exists(destination)) throw new Error(`Export destination already contains '${source.id}'.`);
    await fs.cp(sourceRoot, destination, { recursive: true, errorOnExist: true });
    return { path: destination, id: source.id };
  }

  root(scope, required) {
    const root = getExtensionRoots(this.request).find((entry) => entry.scope === scope);
    if (!root && required) throw new Error(`Extension scope '${scope}' is unavailable.`);
    return root;
  }

  async assertDigest(rootInfo, id, expected) {
    const current = await readBundle(path.join(rootInfo.root, id), rootInfo);
    if (current.digest !== expected) throw new Error("This extension changed after it was opened. Reload it before saving.");
  }
}

async function writeDraft(directory, normalized) {
  const contributions = { skills: [], agents: [], hooks: [], mcpServers: [] };
  await fs.mkdir(directory, { recursive: true });
  for (const group of Object.keys(contributions)) {
    for (const entry of normalized[group]) {
      contributions[group].push(entry.path);
      const target = path.join(directory, entry.path);
      await fs.mkdir(path.dirname(target), { recursive: true });
      const content = entry.metadata ? `---\n${YAML.stringify(entry.metadata).trim()}\n---\n\n${entry.body || ""}\n` : `${JSON.stringify(entry.definition, null, 2)}\n`;
      await fs.writeFile(target, content, "utf8");
    }
  }
  await fs.writeFile(path.join(directory, "extension.json"), `${JSON.stringify({ ...normalized.manifest, contributions }, null, 2)}\n`, "utf8");
}

function pickManifest(bundle) { return { schemaVersion: 1, id: bundle.id, name: bundle.name, version: bundle.version, description: bundle.description }; }
function normalizeWritableScope(scope) { if (!new Set(["user", "workspace"]).has(scope)) throw new Error("Only profile and workspace extensions can be changed."); return scope; }
function publicValidation(result) { return { valid: result.valid, errors: result.errors, warnings: result.warnings }; }
async function exists(filePath) { try { await fs.access(filePath); return true; } catch (error) { if (error.code === "ENOENT") return false; throw error; } }
function serialize(root, operation) {
  const previous = rootQueues.get(root) || Promise.resolve();
  const next = previous.then(operation, operation);
  const tracked = next.then(() => undefined, () => undefined).finally(() => { if (rootQueues.get(root) === tracked) rootQueues.delete(root); });
  rootQueues.set(root, tracked);
  return next;
}

module.exports = { ExtensionAuthoringRepository };
