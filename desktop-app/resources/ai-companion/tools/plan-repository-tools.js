/**
 * Agent-facing plan repository tools backed by profile Markdown files.
 */

"use strict";

const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const PROFILE_DIR = ".md-editor";
const PLANS_PROFILE_DIR = "companion/plans";
const INDEX_PROFILE_FILE = "companion/plans/index.json";
const VALID_PLAN_STATUSES = new Set(["planned", "implementing", "implemented"]);

function throwIfAborted(signal) {
  if (signal?.aborted) throw new Error("AI Companion request cancelled.");
}

function createId(prefix) {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function getProfileRoot(options = {}) {
  return path.resolve(String(options.profileRoot || path.join(os.homedir(), PROFILE_DIR)));
}

function getProfilePath(profileFile, options = {}) {
  return path.join(getProfileRoot(options), ...String(profileFile).split("/"));
}

function getPlansRoot(options = {}) {
  return getProfilePath(PLANS_PROFILE_DIR, options);
}

function getIndexPath(options = {}) {
  return getProfilePath(INDEX_PROFILE_FILE, options);
}

function toProfileRelativePath(absolutePath, options = {}) {
  return path.relative(getProfileRoot(options), absolutePath).replace(/\\/g, "/");
}

function normalizeComparablePath(value) {
  return path.resolve(String(value || "")).toLowerCase();
}

function isPathWithinFolder(filePath, folderPath) {
  const file = normalizeComparablePath(filePath);
  const folder = normalizeComparablePath(folderPath);
  return file === folder || file.startsWith(folder + path.sep);
}

function normalizeStatus(value, fallback = "planned") {
  const status = String(value || "").trim().toLowerCase();
  return VALID_PLAN_STATUSES.has(status) ? status : fallback;
}

function normalizeArchived(value) {
  return value === true || String(value || "").trim().toLowerCase() === "true";
}

function isLegacyArchivedStatus(value) {
  return String(value || "").trim().toLowerCase() === "archived";
}

function normalizePlanTitle(value, fallback = "Untitled plan") {
  const title = String(value || "").trim().replace(/^Plan:\s*/i, "").trim();
  return title || fallback;
}

function slugify(value) {
  const slug = String(value || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 72);
  return slug || "plan";
}

function getDateParts(value = new Date()) {
  const date = value instanceof Date ? value : new Date(value);
  const safeDate = Number.isNaN(date.getTime()) ? new Date() : date;
  return {
    year: String(safeDate.getFullYear()),
    month: String(safeDate.getMonth() + 1).padStart(2, "0"),
    day: String(safeDate.getDate()).padStart(2, "0")
  };
}

function parseFrontmatterValue(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  if (text === "true") return true;
  if (text === "false") return false;
  if (text === "null") return null;
  if (/^-?\d+(?:\.\d+)?$/.test(text)) return Number(text);
  if (/^["[{]/.test(text)) {
    try {
      return JSON.parse(text);
    } catch (_error) {
      return text;
    }
  }
  return text;
}

function stringifyFrontmatterValue(value) {
  if (value === null || value === undefined) return "null";
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return JSON.stringify(value);
}

function parseMarkdownPlan(content) {
  const text = String(content || "").replace(/\r\n?/g, "\n");
  if (!text.startsWith("---\n")) return { frontmatter: {}, body: text };
  const endIndex = text.indexOf("\n---\n", 4);
  if (endIndex < 0) return { frontmatter: {}, body: text };
  const frontmatter = {};
  const header = text.slice(4, endIndex).split("\n");
  for (const line of header) {
    const match = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!match) continue;
    frontmatter[match[1]] = parseFrontmatterValue(match[2]);
  }
  return { frontmatter, body: text.slice(endIndex + 5) };
}

function writeMarkdownPlan(frontmatter, body) {
  const keys = [
    "id",
    "title",
    "status",
    "archived",
    "createdAt",
    "updatedAt",
    "implementedAt",
    "archivedAt",
    "path",
    "sourceChatId",
    "sourceTaskId",
    "workspaceRoot",
    "milestones"
  ];
  const lines = ["---"];
  for (const key of keys) {
    if (frontmatter[key] === undefined || frontmatter[key] === "") continue;
    if (key === "archived" && frontmatter[key] !== true) continue;
    lines.push(`${key}: ${stringifyFrontmatterValue(frontmatter[key])}`);
  }
  lines.push("---", String(body || "").replace(/\r\n?/g, "\n"));
  return lines.join("\n");
}

function normalizeMilestones(value) {
  if (!Array.isArray(value)) return [];
  return value.map((milestone, index) => {
    const source = milestone && typeof milestone === "object" ? milestone : {};
    const id = String(source.id || `M${index + 1}`).trim().toUpperCase();
    const title = String(source.title || source.name || source.description || id).trim();
    return {
      id,
      title,
      status: normalizeMilestoneStatus(source.status)
    };
  }).filter((milestone) => milestone.id && milestone.title);
}

function normalizeMilestoneStatus(value) {
  const status = String(value || "").trim().toLowerCase();
  return ["pending", "implementing", "done", "blocked"].includes(status) ? status : "pending";
}

function createIndexEntry(frontmatter, absolutePath, options = {}) {
  const archived = normalizeArchived(frontmatter.archived) || isLegacyArchivedStatus(frontmatter.status);
  return {
    id: String(frontmatter.id || ""),
    title: normalizePlanTitle(frontmatter.title),
    status: normalizeStatus(frontmatter.status),
    archived,
    path: String(frontmatter.path || toProfileRelativePath(absolutePath, options)),
    createdAt: String(frontmatter.createdAt || ""),
    updatedAt: String(frontmatter.updatedAt || ""),
    implementedAt: String(frontmatter.implementedAt || ""),
    archivedAt: archived ? String(frontmatter.archivedAt || "") : "",
    workspaceRoot: String(frontmatter.workspaceRoot || ""),
    sourceChatId: String(frontmatter.sourceChatId || ""),
    sourceTaskId: String(frontmatter.sourceTaskId || ""),
    milestones: normalizeMilestones(frontmatter.milestones)
  };
}

async function readJsonProfile(profileFile, fallback, options = {}) {
  throwIfAborted(options.signal);
  try {
    return JSON.parse(await fs.readFile(getProfilePath(profileFile, options), "utf8"));
  } catch (_error) {
    return fallback;
  }
}

async function writeJsonProfile(profileFile, value, options = {}) {
  throwIfAborted(options.signal);
  const filePath = getProfilePath(profileFile, options);
  await fs.mkdir(path.dirname(filePath), { recursive: true });
  await fs.writeFile(filePath, JSON.stringify(value, null, 2), "utf8");
  return value;
}

async function listPlanMarkdownFiles(options = {}) {
  const plansRoot = getPlansRoot(options);
  const files = [];
  async function walk(directory) {
    throwIfAborted(options.signal);
    let entries;
    try {
      entries = await fs.readdir(directory, { withFileTypes: true });
    } catch (error) {
      if (error?.code === "ENOENT") return;
      throw error;
    }
    for (const entry of entries) {
      throwIfAborted(options.signal);
      const absolutePath = path.join(directory, entry.name);
      if (entry.isDirectory()) await walk(absolutePath);
      else if (entry.isFile() && /\.md$/i.test(entry.name)) files.push(absolutePath);
    }
  }
  await walk(plansRoot);
  return files;
}

async function readPlanFileByPath(absolutePath, options = {}) {
  throwIfAborted(options.signal);
  const content = await fs.readFile(absolutePath, "utf8");
  const parsed = parseMarkdownPlan(content);
  return {
    frontmatter: {
      ...parsed.frontmatter,
      status: normalizeStatus(parsed.frontmatter.status),
      archived: normalizeArchived(parsed.frontmatter.archived) || isLegacyArchivedStatus(parsed.frontmatter.status),
      path: String(parsed.frontmatter.path || toProfileRelativePath(absolutePath, options)),
      milestones: normalizeMilestones(parsed.frontmatter.milestones)
    },
    body: parsed.body,
    absolutePath
  };
}

async function writePlanFile(absolutePath, frontmatter, body, options = {}) {
  throwIfAborted(options.signal);
  await fs.mkdir(path.dirname(absolutePath), { recursive: true });
  await fs.writeFile(absolutePath, writeMarkdownPlan(frontmatter, body), "utf8");
}

async function rebuildPlanIndex(_root = "", _args = {}, options = {}) {
  const entries = [];
  for (const filePath of await listPlanMarkdownFiles(options)) {
    try {
      const plan = await readPlanFileByPath(filePath, options);
      if (!plan.frontmatter.id) continue;
      entries.push(createIndexEntry(plan.frontmatter, filePath, options));
    } catch (_error) {
      // Ignore unreadable Markdown files; user-authored notes can live near plans.
    }
  }
  entries.sort((a, b) => String(b.updatedAt || b.createdAt).localeCompare(String(a.updatedAt || a.createdAt)));
  const index = { version: 1, updatedAt: new Date().toISOString(), plans: entries };
  await writeJsonProfile(INDEX_PROFILE_FILE, index, options);
  return index;
}

async function loadPlanIndex(options = {}) {
  const index = await readJsonProfile(INDEX_PROFILE_FILE, null, options);
  if (!index || !Array.isArray(index.plans)) return rebuildPlanIndex("", {}, options);
  return index;
}

async function resolvePlanAbsolutePath(args = {}, options = {}) {
  const id = String(args.id || args.planId || "").trim();
  const requestedPath = String(args.path || "").trim();
  const plansRoot = getPlansRoot(options);
  if (id) {
    const index = await loadPlanIndex(options);
    const item = index.plans.find((plan) => plan.id === id);
    if (!item?.path) throw new Error("Plan was not found.");
    return resolvePlanAbsolutePath({ path: item.path }, options);
  }
  if (!requestedPath) throw new Error("Plan id or path is required.");
  const absolutePath = path.isAbsolute(requestedPath)
    ? path.resolve(requestedPath)
    : getProfilePath(requestedPath.replace(/\\/g, "/"), options);
  if (!isPathWithinFolder(absolutePath, plansRoot)) throw new Error("Plan path is outside the plan repository.");
  return absolutePath;
}

function extractPlanTitle(args = {}) {
  const explicit = normalizePlanTitle(args.title, "");
  if (explicit) return explicit;
  const body = String(args.body || args.content || "").replace(/\r\n?/g, "\n");
  const heading = body.split("\n").map((line) => line.match(/^#\s+(.+)$/)?.[1]?.trim()).find(Boolean);
  return normalizePlanTitle(heading);
}

async function createUniquePlanPath(title, createdAt, options = {}) {
  const parts = getDateParts(createdAt);
  const directory = path.join(getPlansRoot(options), parts.year, parts.month, parts.day);
  return createUniquePlanPathInDirectory(title, directory, "", options);
}

async function createUniquePlanPathInDirectory(title, directory, currentPath = "", options = {}) {
  const base = slugify(title);
  const currentAbsolutePath = currentPath ? path.resolve(currentPath) : "";
  for (let index = 0; index < 1000; index++) {
    throwIfAborted(options.signal);
    const suffix = index ? `-${index + 1}` : "";
    const candidate = path.join(directory, `${base}${suffix}.md`);
    if (currentAbsolutePath && path.resolve(candidate) === currentAbsolutePath) return candidate;
    try {
      await fs.access(candidate);
    } catch (error) {
      if (error?.code === "ENOENT") return candidate;
      throw error;
    }
  }
  return path.join(directory, `${base}-${createId("file")}.md`);
}

async function planCreate(_root, args = {}, options = {}) {
  const createdAt = new Date().toISOString();
  const title = extractPlanTitle(args);
  const absolutePath = await createUniquePlanPath(title, createdAt, options);
  const profilePath = toProfileRelativePath(absolutePath, options);
  const frontmatter = {
    id: String(args.id || createId("plan")),
    title,
    status: normalizeStatus(args.status),
    archived: normalizeArchived(args.archived) || isLegacyArchivedStatus(args.status),
    createdAt,
    updatedAt: createdAt,
    path: profilePath,
    sourceChatId: String(args.sourceChatId || ""),
    sourceTaskId: String(args.sourceTaskId || ""),
    workspaceRoot: String(args.workspaceRoot || _root || ""),
    milestones: normalizeMilestones(args.milestones)
  };
  await writePlanFile(absolutePath, frontmatter, String(args.body || args.content || ""), options);
  await rebuildPlanIndex("", {}, options);
  return { changed: true, plan: createIndexEntry(frontmatter, absolutePath, options) };
}

async function planList(_root, args = {}, options = {}) {
  let index;
  try {
    index = await loadPlanIndex(options);
  } catch (_error) {
    index = await rebuildPlanIndex("", {}, options);
  }
  const status = String(args.status || "").trim().toLowerCase();
  const query = String(args.query || "").trim().toLowerCase();
  const workspaceRoot = String(args.workspaceRoot || "").trim();
  const maxResults = Math.max(1, Math.min(Number(args.maxResults || 50), 500));
  let plans = Array.isArray(index.plans) ? index.plans : [];
  if (status === "archived") plans = plans.filter((plan) => plan.archived === true);
  else if (status === "planned") plans = plans.filter((plan) => plan.status === "planned" && plan.archived !== true);
  else if (status) plans = plans.filter((plan) => plan.status === status);
  if (workspaceRoot) plans = plans.filter((plan) => plan.workspaceRoot === workspaceRoot);
  if (query) {
    const details = await Promise.all(plans.map(async (plan) => {
      try {
        const full = await planRead("", { id: plan.id }, options);
        return { plan, haystack: `${plan.title}\n${plan.path}\n${full.body}`.toLowerCase() };
      } catch (_error) {
        return { plan, haystack: `${plan.title}\n${plan.path}`.toLowerCase() };
      }
    }));
    plans = details.filter((item) => item.haystack.includes(query)).map((item) => item.plan);
  }
  return { plans: plans.slice(0, maxResults) };
}

async function planRead(_root, args = {}, options = {}) {
  const absolutePath = await resolvePlanAbsolutePath(args, options);
  const plan = await readPlanFileByPath(absolutePath, options);
  const frontmatter = {
    ...plan.frontmatter,
    path: String(plan.frontmatter.path || toProfileRelativePath(absolutePath, options))
  };
  return {
    ...createIndexEntry(frontmatter, absolutePath, options),
    frontmatter,
    body: plan.body,
    content: writeMarkdownPlan(frontmatter, plan.body)
  };
}

async function planUpdate(_root, args = {}, options = {}) {
  const absolutePath = await resolvePlanAbsolutePath(args, options);
  const current = await readPlanFileByPath(absolutePath, options);
  const now = new Date().toISOString();
  const patch = args.patch && typeof args.patch === "object" ? args.patch : {};
  const legacyArchiveRequest = isLegacyArchivedStatus(patch.status);
  const archived = patch.archived !== undefined
    ? normalizeArchived(patch.archived)
    : (legacyArchiveRequest ? true : normalizeArchived(current.frontmatter.archived));
  const implementationStatus = legacyArchiveRequest
    ? normalizeStatus(current.frontmatter.status)
    : normalizeStatus(patch.status || current.frontmatter.status);
  const requestedTitle = args.title !== undefined ? normalizePlanTitle(args.title) : "";
  const nextAbsolutePath = args.renameFile === true && requestedTitle
    ? await createUniquePlanPathInDirectory(requestedTitle, path.dirname(absolutePath), absolutePath, options)
    : absolutePath;
  const frontmatter = {
    ...current.frontmatter,
    ...patch,
    id: current.frontmatter.id,
    createdAt: current.frontmatter.createdAt || now,
    updatedAt: now,
    path: toProfileRelativePath(nextAbsolutePath, options),
    status: implementationStatus,
    archived,
    archivedAt: archived ? String(patch.archivedAt || current.frontmatter.archivedAt || now) : "",
    milestones: normalizeMilestones(patch.milestones || args.milestones || current.frontmatter.milestones)
  };
  if (args.title !== undefined) frontmatter.title = requestedTitle;
  const body = args.body !== undefined || args.content !== undefined ? String(args.body ?? args.content ?? "") : current.body;
  await writePlanFile(nextAbsolutePath, frontmatter, body, options);
  if (path.resolve(nextAbsolutePath) !== path.resolve(absolutePath)) await fs.unlink(absolutePath);
  await rebuildPlanIndex("", {}, options);
  return { changed: true, plan: createIndexEntry(frontmatter, nextAbsolutePath, options) };
}

async function planUpdateStatus(_root, args = {}, options = {}) {
  const now = new Date().toISOString();
  const patch = {};
  if (args.archived !== undefined) {
    patch.archived = normalizeArchived(args.archived);
    patch.archivedAt = patch.archived ? now : "";
  }
  if (isLegacyArchivedStatus(args.status)) {
    patch.archived = true;
    patch.archivedAt = now;
  } else if (args.status !== undefined) {
    const status = normalizeStatus(args.status);
    patch.status = status;
    if (status === "implemented") patch.implementedAt = now;
    if (status === "planned") patch.implementedAt = "";
  }
  return planUpdate(_root, { ...args, patch: { ...(args.patch || {}), ...patch } }, options);
}

async function planDelete(_root, args = {}, options = {}) {
  const absolutePath = await resolvePlanAbsolutePath(args, options);
  try {
    await fs.unlink(absolutePath);
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  await rebuildPlanIndex("", {}, options);
  return { changed: true, id: String(args.id || args.planId || ""), path: toProfileRelativePath(absolutePath, options) };
}

module.exports = {
  planCreate,
  planList,
  planRead,
  planDelete,
  planRebuildIndex: rebuildPlanIndex,
  planUpdate,
  planUpdateStatus,
  _test: {
    getIndexPath,
    getPlansRoot,
    parseMarkdownPlan,
    writeMarkdownPlan
  }
};
