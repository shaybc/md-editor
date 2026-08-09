/** Resolve literal command paths and detect workspace or protected-boundary impacts. */

"use strict";

const os = require("node:os");
const path = require("node:path");
const { normalizeExecutable } = require("./command-effect-catalog");

const PATH_MUTATORS = new Set(["rm", "del", "erase", "rmdir", "rd", "remove-item", "clear-content", "cp", "copy", "copy-item", "mv", "move", "move-item", "rename-item", "mkdir", "md", "touch"]);
const PATH_READERS = new Set(["cat", "type", "head", "tail", "more", "less", "get-content", "gc"]);

/** Inspect literal path effects without expanding shell expressions. */
function inspectPathImpact(structure, context = {}) {
  const workspaceRoot = path.resolve(String(context.workspaceRoot || context.workingDirectory || "."));
  let workingDirectory = path.resolve(String(context.workingDirectory || workspaceRoot));
  const affectedPaths = [];
  const reasons = [];
  let destructiveBoundary = false;
  let sensitiveBoundary = false;
  let unknownPath = false;
  const add = (candidate, access) => {
    if (isNullDevice(candidate)) return;
    const finding = resolveLiteralPath(candidate, workingDirectory, workspaceRoot, access);
    if (!finding) { unknownPath = true; reasons.push(`Path '${String(candidate).slice(0, 160)}' is dynamic or ambiguous.`); return; }
    affectedPaths.push(finding);
    if (finding.outsideWorkspace) {
      reasons.push(`${finding.path} is outside the workspace.`);
      if (access === "read" || access === "working-directory") sensitiveBoundary = true;
      if (access === "write" || access === "delete") destructiveBoundary = true;
    }
    if (finding.protected) { sensitiveBoundary = true; reasons.push(`${finding.path} is protected or sensitive.`); }
    if (access === "delete" && finding.dangerousDeletionTarget) { destructiveBoundary = true; reasons.push(`${finding.path} is too broad for automatic deletion.`); }
  };
  for (const command of structure.subcommands || []) {
    const executable = normalizeExecutable(command.argv?.[0]);
    for (const redirection of command.redirections || []) {
      if (redirection.writesFile) add(redirection.target, "write");
      if (redirection.readsFile) add(redirection.target, "read");
    }
    if (["cd", "chdir", "set-location", "sl"].includes(executable)) {
      const destination = command.argv?.slice(1).find((value) => !String(value).startsWith("-"));
      if (destination) {
        const finding = resolveLiteralPath(destination, workingDirectory, workspaceRoot, "working-directory");
        if (!finding) { unknownPath = true; reasons.push("The working-directory change is dynamic or ambiguous."); }
        else {
          affectedPaths.push(finding);
          workingDirectory = finding.path;
          if (finding.outsideWorkspace) { sensitiveBoundary = true; reasons.push(`${finding.path} changes execution outside the workspace.`); }
          if (finding.protected) { sensitiveBoundary = true; reasons.push(`${finding.path} is protected or sensitive.`); }
        }
      }
      continue;
    }
    if (!PATH_MUTATORS.has(executable) && !PATH_READERS.has(executable)) continue;
    const access = PATH_READERS.has(executable) ? "read" : (["rm", "del", "erase", "rmdir", "rd", "remove-item", "clear-content"].includes(executable) ? "delete" : "write");
    for (const candidate of pathArguments(command.argv?.slice(1) || [], executable)) add(candidate, access);
  }
  return { affectedPaths: deduplicate(affectedPaths), reasons: Array.from(new Set(reasons)), destructiveBoundary, sensitiveBoundary, unknownPath };
}

function pathArguments(args, executable) {
  const values = [];
  for (let index = 0; index < args.length; index++) {
    const value = String(args[index]);
    if (["-path", "-literalpath", "-destination", "-dest"].includes(value.toLowerCase()) && args[index + 1]) { values.push(args[++index]); continue; }
    if (/^[-/]/.test(value) && !/^(?:\.\.?[\\/]|[A-Za-z]:[\\/]|\/)/.test(value)) continue;
    values.push(value);
  }
  return executable === "mkdir" || executable === "md" ? values.slice(0, 20) : values.slice(-20);
}

function resolveLiteralPath(candidate, workingDirectory, workspaceRoot, access) {
  const value = String(candidate || "").trim().replace(/^['"]|['"]$/g, "");
  if (!value || /[*?%$!`]|\$\{|\$\(/.test(value)) return null;
  const expanded = value === "~" ? os.homedir() : (/^~[\\/]/.test(value) ? path.join(os.homedir(), value.slice(2)) : value);
  const absolute = path.resolve(workingDirectory, expanded);
  const relative = path.relative(workspaceRoot, absolute);
  const outsideWorkspace = relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative);
  const normalized = absolute.replace(/\\/g, "/");
  const protectedPath = /(?:^|\/)(?:\.git|\.ssh|\.gnupg|\.aws|\.azure|\.kube|\.md-editor\/companion)(?:\/|$)|(?:^|\/)\.env(?:\.|$)|\.(?:pem|key|p12|pfx)$/i.test(normalized);
  const roots = [path.parse(absolute).root, path.resolve(os.homedir()), workspaceRoot].map((entry) => path.resolve(entry));
  return { path: absolute, relativePath: outsideWorkspace ? "" : relative.replace(/\\/g, "/") || ".", access, outsideWorkspace, protected: protectedPath, dangerousDeletionTarget: access === "delete" && (roots.includes(absolute) || [".", "..", "*", "**"].includes(value)) };
}

function isNullDevice(value) { return /^(?:nul|\/dev\/null|\$null)$/i.test(String(value || "").trim()); }
function deduplicate(entries) { return Array.from(new Map(entries.map((entry) => [`${entry.access}:${entry.path.toLowerCase()}`, entry])).values()).slice(0, 50); }

module.exports = { inspectPathImpact };
