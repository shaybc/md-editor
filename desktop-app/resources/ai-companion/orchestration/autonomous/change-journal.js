/** Git-backed restore journal for AI-authored workspace mutations. */

"use strict";

const crypto = require("node:crypto");
const { execFile } = require("node:child_process");
const fs = require("node:fs/promises");
const path = require("node:path");
const { promisify } = require("node:util");
const { companionProfilePath } = require("./profile-storage");

const execFileAsync = promisify(execFile);
const SCHEMA_VERSION = 1;
const WORKSPACE_PREFIX = "workspace";
const JOURNAL_PREFIX = ".journal";
const COMMAND_SCAN_LIMITS = Object.freeze({ maxFiles: 1200, maxBytes: 512 * 1024, maxTotalBytes: 24 * 1024 * 1024 });
const IGNORED_DIRECTORIES = new Set([".cache", ".downloads", ".git", ".gradle", ".idea", ".md-editor", ".vscode", "build", "coverage", "dist", "node_modules", "out", "target", "vendor"]);

class CompanionChangeJournal {
  constructor(request = {}) {
    this.request = request || {};
    this.workspaceRoot = path.resolve(String(this.request.workspaceRoot || process.cwd()));
    this.workspaceFingerprint = workspaceFingerprint(this.workspaceRoot);
    this.root = companionProfilePath(this.request.profileRoot, "change-journals", this.workspaceFingerprint);
    this.repo = this.root ? path.join(this.root, "repo") : "";
    this.indexPath = this.root ? path.join(this.root, "index.json") : "";
    this.currentPath = this.root ? path.join(this.root, "current.json") : "";
    this.previewDirectory = this.root ? path.join(this.root, "previews") : "";
    this.index = createEmptyIndex(this.workspaceRoot, this.workspaceFingerprint);
    this.opened = false;
    this.available = Boolean(this.root);
  }

  /** Open or initialize the private shadow git repository for this workspace. */
  async open(snapshot = null) {
    if (!this.available) return this;
    await fs.mkdir(this.repo, { recursive: true });
    await fs.mkdir(this.previewDirectory, { recursive: true });
    await this.git(["init"]);
    await this.git(["config", "user.name", "MD-Editor AI Companion"]);
    await this.git(["config", "user.email", "md-editor-ai-companion@local"]);
    this.index = normalizeIndex((await readJsonOptional(this.indexPath)) || snapshot?.index, this.workspaceRoot, this.workspaceFingerprint);
    await this.persistIndex();
    this.opened = true;
    return this;
  }

  /** Persist a stable task/chat position, even when no files changed. */
  async createTaskCheckpoint(input = {}) {
    if (!this.opened) return null;
    const checkpoint = await this.commitCheckpoint({
      kind: normalizeCheckpointKind(input.kind || "task"),
      chatId: input.chatId,
      taskId: input.taskId,
      actionId: input.actionId,
      round: input.turnIndex,
      label: input.label
    }, currentStates(this.index));
    rememberTaskCheckpoint(this.index, checkpoint);
    await this.persistIndex();
    return publicCheckpoint(checkpoint);
  }

  /** Record an apply_edit/write_file mutation with before and after snapshots. */
  async recordFileMutation(input = {}) {
    if (!this.opened) return unavailableMutation(input);
    const relativePath = normalizeRelativePath(input.path, this.workspaceRoot);
    const restorable = isWorkspaceRelativePath(relativePath) && input.restorable !== false;
    const beforeState = createPathState(relativePath, input.beforeContent, input.beforeExists !== false, "before", restorable);
    const afterState = createPathState(relativePath, input.afterContent, input.afterExists !== false, inferAction(input.beforeExists !== false, input.afterExists !== false), restorable);
    if (!restorable) {
      const mutation = createMutation(input, relativePath, null, null, beforeState, afterState, false, true);
      this.index.mutations.push(mutation);
      await this.persistIndex();
      return publicMutation(mutation);
    }

    const beforeCheckpoint = await this.commitCheckpoint({
      kind: "before-action",
      tool: input.tool,
      chatId: input.chatId,
      taskId: input.taskId,
      actionId: input.actionId,
      round: input.round
    }, { ...currentStates(this.index), [relativePath]: beforeState });
    const afterCheckpoint = await this.commitCheckpoint({
      kind: "after-action",
      tool: input.tool,
      chatId: input.chatId,
      taskId: input.taskId,
      actionId: input.actionId,
      round: input.round
    }, { ...currentStates(this.index), [relativePath]: afterState });

    this.index.touchedPaths[relativePath] = afterState;
    const mutation = createMutation(input, relativePath, beforeCheckpoint, afterCheckpoint, beforeState, afterState, true, false);
    this.index.mutations.push(mutation);
    rememberTaskCheckpoint(this.index, afterCheckpoint);
    await this.persistIndex();
    return publicMutation(mutation);
  }

  /** Scan workspace files with bounded IO for run_command journaling. */
  async scanWorkspace(options = {}) {
    const limits = { ...COMMAND_SCAN_LIMITS, ...(options.limits || {}) };
    const result = { files: {}, truncated: false, totalFiles: 0, totalBytes: 0, warnings: [] };
    await scanDirectory(this.workspaceRoot, "", result, limits, options.signal || this.request.signal);
    return result;
  }

  /** Record changed files detected around a workspace-writing command. */
  async recordCommandMutation(input = {}) {
    if (!this.opened) return { restorable: false, partialRollback: true, mutations: [], warnings: ["Change journal is unavailable."] };
    const beforeFiles = input.beforeScan?.files || {};
    const afterFiles = input.afterScan?.files || {};
    const paths = Array.from(new Set([...Object.keys(beforeFiles), ...Object.keys(afterFiles)])).filter((entry) => {
      const before = beforeFiles[entry];
      const after = afterFiles[entry];
      return !before || !after || before.sha256 !== after.sha256;
    }).sort();
    const mutations = [];
    for (const entry of paths) {
      const before = beforeFiles[entry] || null;
      const after = afterFiles[entry] || null;
      const mutation = await this.recordFileMutation({
        tool: "run_command",
        chatId: input.chatId,
        taskId: input.taskId,
        actionId: input.actionId,
        round: input.round,
        path: entry,
        beforeExists: Boolean(before),
        afterExists: Boolean(after),
        beforeContent: before?.content || "",
        afterContent: after?.content || "",
        restorable: before?.restorable !== false && after?.restorable !== false
      });
      mutations.push(mutation);
    }
    const partialRollback = input.beforeScan?.truncated === true || input.afterScan?.truncated === true || input.commandImpact?.workspaceWrites !== true;
    return {
      restorable: mutations.some((entry) => entry.restorable === true),
      partialRollback,
      mutations,
      warnings: partialRollback ? ["Command rollback is partial because the command impact could not be fully bounded."] : []
    };
  }

  /** Build a restore preview and store target contents for a later apply. */
  async previewRestore(input = {}) {
    if (!this.opened) return { ok: false, error: "Change journal is unavailable." };
    const mode = normalizeRestoreMode(input.mode);
    const targets = await this.resolveRestoreTargets(mode, input);
    const previewId = createId("preview");
    const affectedFiles = [];
    const blockedFiles = [];
    for (const target of targets) {
      const current = await readWorkspaceFile(this.workspaceRoot, target.path);
      const hasConflict = target.expectedCurrentHash && current.exists && current.sha256 !== target.expectedCurrentHash;
      const entry = {
        path: target.path,
        action: hasConflict ? "conflict" : classifyRestoreAction(current.exists, target.exists),
        currentHash: current.exists ? current.sha256 : "",
        targetHash: target.exists ? target.sha256 : "",
        expectedCurrentHash: target.expectedCurrentHash || "",
        hasConflict,
        compare: createRestoreCompare(target.path, current, target)
      };
      if (hasConflict) blockedFiles.push({ path: target.path, reason: "The file changed since the journal checkpoint was recorded." });
      affectedFiles.push({ ...entry, targetContent: target.content || "" });
    }
    const preview = {
      ok: true,
      previewId,
      mode,
      title: restoreTitle(mode, input),
      checkpointId: input.checkpointId || targets[0]?.checkpointId || "",
      taskId: input.taskId || "",
      chatId: input.chatId || "",
      affectedFiles,
      blockedFiles,
      warnings: targets.some((target) => target.partialRollback === true) ? ["Some changes are only partially restorable."] : []
    };
    await fs.writeFile(path.join(this.previewDirectory, `${previewId}.json`), JSON.stringify(preview, null, 2), "utf8");
    return stripPreviewContent(preview);
  }

  /** Apply a previously generated restore preview to the real workspace. */
  async applyRestore(previewId, options = {}) {
    if (!this.opened) return { ok: false, error: "Change journal is unavailable." };
    const preview = await this.readPreview(previewId);
    const restoredFiles = [];
    const skippedFiles = [];
    for (const entry of preview.affectedFiles || []) {
      if (entry.hasConflict && options.includeConflicts !== true) {
        skippedFiles.push({ path: entry.path, reason: "conflict" });
        continue;
      }
      const resolved = resolveWorkspacePath(this.workspaceRoot, entry.path);
      if (!resolved) {
        skippedFiles.push({ path: entry.path, reason: "outside-workspace" });
        continue;
      }
      if (entry.action === "delete") {
        await fs.rm(resolved, { force: true });
      } else if (entry.action === "restore" || entry.action === "create" || entry.action === "conflict") {
        await fs.mkdir(path.dirname(resolved), { recursive: true });
        await fs.writeFile(resolved, entry.targetContent || "", "utf8");
      } else {
        skippedFiles.push({ path: entry.path, reason: "skipped" });
        continue;
      }
      restoredFiles.push(entry.path);
    }
    if (restoredFiles.length) {
      await this.createTaskCheckpoint({
        kind: "rollback-applied",
        chatId: preview.chatId,
        taskId: preview.taskId,
        label: `Rollback applied: ${preview.title}`
      });
    }
    return { ok: true, restoredFiles, skippedFiles, warnings: preview.warnings || [], checkpointId: preview.checkpointId };
  }

  /** List agent-created local history entries for one workspace path. */
  async listFileHistory(input = {}) {
    if (!this.opened) return { ok: false, error: "Change journal is unavailable.", entries: [] };
    const relativePath = normalizeRelativePath(input.path, this.workspaceRoot);
    const entries = this.index.checkpoints
      .filter((checkpoint) => (!input.chatId || checkpoint.chatId === input.chatId) && checkpoint.paths.some((entry) => entry.path === relativePath))
      .map((checkpoint) => {
        const file = checkpoint.paths.find((entry) => entry.path === relativePath);
        return {
          checkpointId: checkpoint.checkpointId,
          commit: checkpoint.commit,
          createdAt: checkpoint.createdAt,
          kind: checkpoint.kind,
          chatId: checkpoint.chatId,
          taskId: checkpoint.taskId,
          actionId: checkpoint.actionId,
          round: checkpoint.round,
          path: relativePath,
          exists: file?.exists === true,
          sha256: file?.sha256 || "",
          size: file?.size || 0,
          restorable: file?.restorable === true
        };
      });
    return { ok: true, path: relativePath, entries };
  }

  /** Return the compare payload for one file at a checkpoint against current disk state. */
  async compareCheckpoint(input = {}) {
    if (!this.opened) return { ok: false, error: "Change journal is unavailable." };
    const checkpoint = this.index.checkpointById[input.checkpointId];
    if (!checkpoint) return { ok: false, error: "Checkpoint was not found." };
    const relativePath = normalizeRelativePath(input.path, this.workspaceRoot);
    const target = await this.stateAtCheckpoint(checkpoint, relativePath);
    const current = await readWorkspaceFile(this.workspaceRoot, relativePath);
    return { ok: true, checkpointId: checkpoint.checkpointId, path: relativePath, compare: createRestoreCompare(relativePath, current, target) };
  }

  hasTaskChanges(taskId) {
    return this.index.mutations.some((entry) => entry.taskId === taskId && entry.restorable === true);
  }

  snapshot() {
    return {
      schemaVersion: SCHEMA_VERSION,
      workspaceFingerprint: this.workspaceFingerprint,
      headCheckpointId: this.index.headCheckpointId,
      headCommit: this.index.headCommit,
      touchedPaths: Object.keys(this.index.touchedPaths || {})
    };
  }

  async resolveRestoreTargets(mode, input) {
    if (mode === "task" || mode === "file") return this.resolveTaskTargets(input.taskId, input.path);
    const checkpoint = this.index.checkpointById[input.checkpointId];
    if (!checkpoint) return [];
    const paths = input.path ? [normalizeRelativePath(input.path, this.workspaceRoot)] : Array.from(new Set([...Object.keys(this.index.touchedPaths || {}), ...checkpoint.paths.map((entry) => entry.path)]));
    const targets = [];
    for (const entry of paths) targets.push(await this.stateAtCheckpoint(checkpoint, entry));
    return targets;
  }

  async resolveTaskTargets(taskId, requestedPath) {
    const requested = requestedPath ? normalizeRelativePath(requestedPath, this.workspaceRoot) : "";
    const paths = new Map();
    for (const mutation of this.index.mutations) {
      if (taskId && mutation.taskId !== taskId) continue;
      if (requested && mutation.path !== requested) continue;
      if (!mutation.restorable || paths.has(mutation.path)) continue;
      const checkpoint = this.index.checkpointById[mutation.beforeCheckpointId];
      if (checkpoint) paths.set(mutation.path, await this.stateAtCheckpoint(checkpoint, mutation.path, mutation.afterState?.sha256));
    }
    return Array.from(paths.values());
  }

  async stateAtCheckpoint(checkpoint, relativePath, expectedCurrentHash = "") {
    const state = checkpoint.paths.find((entry) => entry.path === relativePath) || createPathState(relativePath, "", false, "delete", true);
    const content = state.exists ? await this.gitShow(checkpoint.commit, path.posix.join(WORKSPACE_PREFIX, toPosix(relativePath))) : "";
    return { ...state, content, checkpointId: checkpoint.checkpointId, expectedCurrentHash };
  }

  async commitCheckpoint(metadata, states) {
    const parentCheckpointId = this.index.headCheckpointId || "";
    const checkpointId = createId("checkpoint");
    const createdAt = new Date().toISOString();
    await materializeStates(this.repo, states);
    const manifest = {
      schemaVersion: SCHEMA_VERSION,
      workspaceFingerprint: this.workspaceFingerprint,
      workspaceRoot: this.workspaceRoot,
      chatId: metadata.chatId || "",
      taskId: metadata.taskId || "",
      actionId: metadata.actionId || "",
      round: Number.isFinite(Number(metadata.round)) ? Number(metadata.round) : null,
      kind: metadata.kind || "checkpoint",
      parentCheckpointId,
      checkpointId,
      commit: "",
      createdAt,
      paths: Object.values(states).map(publicPathState).sort((a, b) => a.path.localeCompare(b.path))
    };
    await fs.mkdir(path.join(this.repo, JOURNAL_PREFIX), { recursive: true });
    await fs.writeFile(path.join(this.repo, JOURNAL_PREFIX, "manifest.json"), JSON.stringify(manifest, null, 2), "utf8");
    await this.git(["add", "-A"]);
    await this.git(["commit", "--allow-empty", "-m", `${manifest.kind}: ${checkpointId}`]);
    const commit = (await this.git(["rev-parse", "HEAD"])).trim();
    const checkpoint = { ...manifest, commit };
    this.index.checkpoints.push(checkpoint);
    this.index.checkpointById[checkpointId] = checkpoint;
    this.index.headCheckpointId = checkpointId;
    this.index.headCommit = commit;
    return checkpoint;
  }

  async persistIndex() {
    if (!this.root) return;
    await fs.mkdir(this.root, { recursive: true });
    await fs.writeFile(this.indexPath, JSON.stringify(this.index, null, 2), "utf8");
    await fs.writeFile(this.currentPath, JSON.stringify(this.snapshot(), null, 2), "utf8");
  }

  async readPreview(previewId) {
    const requested = String(previewId || "");
    if (!/^[a-z0-9_-]+$/i.test(requested)) throw new Error("Invalid restore preview id.");
    const preview = await readJsonOptional(path.join(this.previewDirectory, `${requested}.json`));
    if (!preview?.previewId) throw new Error("Restore preview was not found.");
    return preview;
  }

  async git(args) {
    const result = await execFileAsync("git", args, { cwd: this.repo, windowsHide: true, maxBuffer: 10 * 1024 * 1024 });
    return result.stdout || "";
  }

  async gitShow(commit, filePath) {
    try {
      const result = await execFileAsync("git", ["show", `${commit}:${filePath}`], { cwd: this.repo, windowsHide: true, maxBuffer: 32 * 1024 * 1024, encoding: "buffer" });
      return result.stdout.toString("utf8");
    } catch (_error) {
      return "";
    }
  }
}

function createEmptyIndex(workspaceRoot, fingerprint) {
  return { schemaVersion: SCHEMA_VERSION, workspaceRoot, workspaceFingerprint: fingerprint, headCheckpointId: "", headCommit: "", touchedPaths: {}, checkpoints: [], checkpointById: {}, mutations: [], tasks: {} };
}

function normalizeIndex(raw, workspaceRoot, fingerprint) {
  const index = createEmptyIndex(workspaceRoot, fingerprint);
  if (!raw || typeof raw !== "object") return index;
  index.headCheckpointId = String(raw.headCheckpointId || "");
  index.headCommit = String(raw.headCommit || "");
  index.touchedPaths = raw.touchedPaths && typeof raw.touchedPaths === "object" ? raw.touchedPaths : {};
  index.checkpoints = Array.isArray(raw.checkpoints) ? raw.checkpoints : [];
  index.checkpointById = index.checkpoints.reduce((map, checkpoint) => {
    if (checkpoint?.checkpointId) map[checkpoint.checkpointId] = checkpoint;
    return map;
  }, {});
  index.mutations = Array.isArray(raw.mutations) ? raw.mutations : [];
  index.tasks = raw.tasks && typeof raw.tasks === "object" ? raw.tasks : {};
  return index;
}

function currentStates(index) {
  return Object.fromEntries(Object.entries(index.touchedPaths || {}).filter((entry) => isWorkspaceRelativePath(entry[0])));
}

function rememberTaskCheckpoint(index, checkpoint) {
  if (!checkpoint?.taskId) return;
  const task = index.tasks[checkpoint.taskId] || { taskId: checkpoint.taskId, checkpoints: [] };
  task.checkpoints.push({ checkpointId: checkpoint.checkpointId, kind: checkpoint.kind, commit: checkpoint.commit, createdAt: checkpoint.createdAt });
  index.tasks[checkpoint.taskId] = task;
}

function createMutation(input, relativePath, beforeCheckpoint, afterCheckpoint, beforeState, afterState, restorable, partialRollback) {
  return {
    tool: input.tool || "",
    chatId: input.chatId || "",
    taskId: input.taskId || "",
    actionId: input.actionId || "",
    round: Number.isFinite(Number(input.round)) ? Number(input.round) : null,
    path: relativePath,
    action: afterState.action,
    restorable,
    partialRollback,
    beforeCheckpointId: beforeCheckpoint?.checkpointId || "",
    afterCheckpointId: afterCheckpoint?.checkpointId || "",
    checkpointId: afterCheckpoint?.checkpointId || "",
    commit: afterCheckpoint?.commit || "",
    beforeState: publicPathState(beforeState),
    afterState: publicPathState(afterState),
    createdAt: new Date().toISOString()
  };
}

function publicMutation(mutation) {
  return {
    restorable: mutation.restorable === true,
    partialRollback: mutation.partialRollback === true,
    checkpointId: mutation.checkpointId,
    beforeCheckpointId: mutation.beforeCheckpointId,
    commit: mutation.commit,
    path: mutation.path,
    action: mutation.action,
    taskId: mutation.taskId,
    actionId: mutation.actionId
  };
}

function unavailableMutation(input) {
  return { restorable: false, partialRollback: true, path: input.path || "", action: "skipped", warnings: ["Change journal is unavailable."] };
}

function publicCheckpoint(checkpoint) {
  return checkpoint ? {
    schemaVersion: checkpoint.schemaVersion,
    workspaceFingerprint: checkpoint.workspaceFingerprint,
    checkpointId: checkpoint.checkpointId,
    commit: checkpoint.commit,
    kind: checkpoint.kind,
    chatId: checkpoint.chatId,
    taskId: checkpoint.taskId,
    actionId: checkpoint.actionId,
    round: checkpoint.round,
    createdAt: checkpoint.createdAt,
    paths: checkpoint.paths
  } : null;
}

function createPathState(relativePath, content, exists, action, restorable) {
  const text = exists ? String(content ?? "") : "";
  return { path: relativePath, exists: Boolean(exists), content: text, sha256: exists ? hashContent(text) : "", size: exists ? Buffer.byteLength(text, "utf8") : 0, binary: false, action, restorable: restorable === true };
}

function publicPathState(state) {
  return { path: state.path, exists: state.exists === true, sha256: state.sha256 || "", size: state.size || 0, binary: state.binary === true, action: state.action || "restore", restorable: state.restorable === true };
}

function hashContent(content) {
  return crypto.createHash("sha256").update(String(content ?? ""), "utf8").digest("hex");
}

function workspaceFingerprint(workspaceRoot) {
  return crypto.createHash("sha256").update(path.resolve(String(workspaceRoot || "")).toLowerCase()).digest("hex").slice(0, 24);
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(5).toString("hex")}`;
}

function normalizeRelativePath(inputPath, workspaceRoot) {
  const raw = String(inputPath || "");
  if (!raw) return "";
  const resolved = path.isAbsolute(raw) ? path.resolve(raw) : path.resolve(workspaceRoot, raw);
  const relative = path.relative(workspaceRoot, resolved);
  if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) return raw;
  return toPosix(relative);
}

function isWorkspaceRelativePath(relativePath) {
  const value = String(relativePath || "");
  return Boolean(value) && !path.isAbsolute(value) && !value.startsWith("..") && !value.includes("\0");
}

function resolveWorkspacePath(workspaceRoot, relativePath) {
  if (!isWorkspaceRelativePath(relativePath)) return "";
  const resolved = path.resolve(workspaceRoot, relativePath);
  const relative = path.relative(workspaceRoot, resolved);
  return relative && !relative.startsWith("..") && !path.isAbsolute(relative) ? resolved : "";
}

function inferAction(beforeExists, afterExists) {
  if (!beforeExists && afterExists) return "create";
  if (beforeExists && !afterExists) return "delete";
  return "restore";
}

function normalizeCheckpointKind(kind) {
  const value = String(kind || "checkpoint");
  return /^(before-task|after-task|before-action|after-action|rollback-applied)$/.test(value) ? value : "checkpoint";
}

function normalizeRestoreMode(mode) {
  const value = String(mode || "checkpoint");
  return ["task", "file", "checkpoint"].includes(value) ? value : "checkpoint";
}

function classifyRestoreAction(currentExists, targetExists) {
  if (currentExists && !targetExists) return "delete";
  if (!currentExists && targetExists) return "create";
  if (currentExists && targetExists) return "restore";
  return "skipped";
}

function createRestoreCompare(relativePath, current, target) {
  return {
    beforeName: `${relativePath} (current)`,
    afterName: `${relativePath} (restore target)`,
    beforeContent: current.exists ? current.content : "",
    afterContent: target.exists ? target.content : "",
    changed: (current.sha256 || "") !== (target.sha256 || ""),
    readOnly: true
  };
}

function restoreTitle(mode, input) {
  if (mode === "task") return `Rollback task ${input.taskId || ""}`.trim();
  if (mode === "file") return `Rollback ${input.path || "file"}`;
  return `Restore checkpoint ${input.checkpointId || ""}`.trim();
}

function stripPreviewContent(preview) {
  return { ...preview, affectedFiles: (preview.affectedFiles || []).map(({ targetContent, ...entry }) => entry) };
}

async function readWorkspaceFile(workspaceRoot, relativePath) {
  const resolved = resolveWorkspacePath(workspaceRoot, relativePath);
  if (!resolved) return { path: relativePath, exists: false, content: "", sha256: "", size: 0 };
  try {
    const content = await fs.readFile(resolved, "utf8");
    return { path: relativePath, exists: true, content, sha256: hashContent(content), size: Buffer.byteLength(content, "utf8") };
  } catch (error) {
    if (error?.code === "ENOENT") return { path: relativePath, exists: false, content: "", sha256: "", size: 0 };
    throw error;
  }
}

async function materializeStates(repo, states) {
  const workspaceRoot = path.join(repo, WORKSPACE_PREFIX);
  await fs.mkdir(workspaceRoot, { recursive: true });
  for (const entry of Object.values(states)) {
    if (!isWorkspaceRelativePath(entry.path)) continue;
    const resolved = path.resolve(workspaceRoot, entry.path);
    const relative = path.relative(workspaceRoot, resolved);
    if (!relative || relative.startsWith("..") || path.isAbsolute(relative)) continue;
    if (entry.exists) {
      await fs.mkdir(path.dirname(resolved), { recursive: true });
      await fs.writeFile(resolved, entry.content || "", "utf8");
    } else {
      await fs.rm(resolved, { force: true });
    }
  }
}

async function scanDirectory(root, relativeDirectory, result, limits, signal) {
  if (signal?.aborted || result.truncated) return;
  const absoluteDirectory = path.join(root, relativeDirectory);
  let entries = [];
  try { entries = await fs.readdir(absoluteDirectory, { withFileTypes: true }); }
  catch (_error) { return; }
  for (const entry of entries) {
    if (signal?.aborted || result.truncated) return;
    if (entry.isDirectory() && IGNORED_DIRECTORIES.has(entry.name)) continue;
    const relativePath = toPosix(path.join(relativeDirectory, entry.name));
    const absolutePath = path.join(root, relativePath);
    if (entry.isDirectory()) {
      await scanDirectory(root, relativePath, result, limits, signal);
      continue;
    }
    if (!entry.isFile()) continue;
    result.totalFiles += 1;
    if (result.totalFiles > limits.maxFiles) {
      result.truncated = true;
      result.warnings.push("Workspace scan exceeded the file limit.");
      return;
    }
    const stat = await fs.stat(absolutePath).catch(() => null);
    if (!stat) continue;
    result.totalBytes += stat.size;
    if (result.totalBytes > limits.maxTotalBytes) {
      result.truncated = true;
      result.warnings.push("Workspace scan exceeded the byte limit.");
      return;
    }
    if (stat.size > limits.maxBytes) {
      result.files[relativePath] = { path: relativePath, sha256: "", size: stat.size, content: "", restorable: false };
      continue;
    }
    const content = await fs.readFile(absolutePath, "utf8").catch(() => null);
    if (content === null) {
      result.files[relativePath] = { path: relativePath, sha256: "", size: stat.size, content: "", restorable: false };
      continue;
    }
    result.files[relativePath] = { path: relativePath, sha256: hashContent(content), size: stat.size, content, restorable: true };
  }
}

async function readJsonOptional(filePath) {
  if (!filePath) return null;
  try { return JSON.parse(await fs.readFile(filePath, "utf8")); }
  catch (_error) { return null; }
}

function toPosix(value) {
  return String(value || "").replace(/\\/g, "/");
}

module.exports = {
  COMMAND_SCAN_LIMITS,
  CompanionChangeJournal,
  SCHEMA_VERSION,
  hashContent,
  normalizeRelativePath,
  workspaceFingerprint
};
