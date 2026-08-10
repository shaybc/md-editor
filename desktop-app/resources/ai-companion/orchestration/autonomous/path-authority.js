/** Resolve file-system targets only from an opened workspace or user-authored locations. */

"use strict";

const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");
const { execFileSync } = require("node:child_process");

const WINDOWS_KNOWN_FOLDER_VALUES = Object.freeze({
  Desktop: "Desktop",
  Documents: "Personal",
  Downloads: "{374DE290-123F-4565-9164-39C4925E467B}",
  Pictures: "My Pictures",
  Music: "My Music",
  Videos: "My Video"
});
const windowsKnownFolderCache = new Map();

const KNOWN_FOLDER_NAMES = Object.freeze(["Home", "Desktop", "Documents", "Downloads", "Pictures", "Music", "Videos"]);

class PathAuthority {
  /** Create run-scoped path authority from the current user request. */
  constructor(request = {}) {
    this.workspaceRoot = normalizeAbsolutePath(request.workspaceRoot);
    this.userText = [];
    this.addUserText(request.prompt);
  }

  /** Add a user-authored prompt or interaction response to this run's authority. */
  addUserText(value) {
    const text = collectUserText(value).trim();
    if (text) this.userText.push(normalizeReferenceText(text));
  }

  /** Resolve one model-supplied file path against trusted user or workspace authority. */
  resolveFilePath(value) {
    const requested = String(value || "").trim();
    if (!requested) throw pathAuthorityError("PATH_LOCATION_REQUIRED", "A file location is required. Ask the user where the file should be read or written.");
    const known = resolveKnownFolderReference(requested);
    const absolute = known?.resolvedPath || (path.isAbsolute(requested) ? path.resolve(requested) : "");
    if (!absolute) {
      if (!this.workspaceRoot) throw pathAuthorityError("PATH_LOCATION_REQUIRED", "No folder is open and the user did not provide a file location. Ask the user for an absolute path or a known folder such as Desktop.");
      return workspaceTarget(this.workspaceRoot, requested);
    }
    if (this.workspaceRoot && isWithin(absolute, this.workspaceRoot)) return workspaceTarget(this.workspaceRoot, absolute);
    const authorityRoot = known
      ? this.findKnownFolderAuthority(known, requested)
      : this.findAbsoluteAuthority(absolute);
    if (!authorityRoot) throw pathAuthorityError("PATH_NOT_AUTHORIZED", "The requested external path was not supplied by the user. Ask the user to provide or confirm the file or folder location.");
    return externalTarget(authorityRoot, absolute);
  }

  /** Resolve the working directory for a command without inventing a process directory. */
  resolveCommandDirectory(value) {
    const requested = String(value || "").trim();
    if (!requested) {
      if (this.workspaceRoot) return workspaceTarget(this.workspaceRoot, ".");
      throw pathAuthorityError("PATH_LOCATION_REQUIRED", "No folder is open and the command has no working directory. Ask the user where the command should run.");
    }
    const target = this.resolveFilePath(requested);
    if (!isDirectory(target.resolvedPath)) throw pathAuthorityError("PATH_LOCATION_REQUIRED", "The command working directory must resolve to a folder supplied by the user.");
    return target;
  }

  findKnownFolderAuthority(known, requested) {
    const requestedReference = normalizeReferenceText(requested);
    if (this.userText.some((text) => containsReference(text, requestedReference))) return targetAuthority(known.resolvedPath);
    if (this.userText.some((text) => containsStandaloneReference(text, known.name))) return targetAuthority(known.root);
    return "";
  }

  findAbsoluteAuthority(absolute) {
    const exact = normalizeReferenceText(absolute);
    if (this.userText.some((text) => containsReference(text, exact))) return targetAuthority(absolute);
    let candidate = path.dirname(absolute);
    while (candidate && candidate !== path.dirname(candidate)) {
      if (isDirectory(candidate) && this.userText.some((text) => containsStandaloneReference(text, normalizeReferenceText(candidate)))) return { root: candidate, exactFile: "" };
      candidate = path.dirname(candidate);
    }
    return "";
  }
}

/** Return the platform path for a supported user-facing known-folder name. */
function resolveKnownFolderReference(value) {
  const text = String(value || "").trim();
  const match = text.match(new RegExp(`^(${KNOWN_FOLDER_NAMES.join("|")})(?:[\\\\/](.*))?$`, "i"));
  if (!match) return null;
  const name = KNOWN_FOLDER_NAMES.find((entry) => entry.toLowerCase() === match[1].toLowerCase());
  const root = resolveKnownFolder(name);
  return { name, root, resolvedPath: path.resolve(root, String(match[2] || "")) };
}

function resolveKnownFolder(name) {
  const home = os.homedir();
  if (name === "Home") return home;
  const redirected = resolveWindowsKnownFolder(name);
  if (redirected) return redirected;
  const cloudRoots = [process.env.OneDrive, process.env.OneDriveConsumer, process.env.OneDriveCommercial].filter(Boolean);
  const candidates = [...cloudRoots.map((root) => path.join(root, name)), path.join(home, name)];
  return candidates.find(isDirectory) || candidates.at(-1);
}

function resolveWindowsKnownFolder(name) {
  if (process.platform !== "win32" || !WINDOWS_KNOWN_FOLDER_VALUES[name]) return "";
  if (windowsKnownFolderCache.has(name)) return windowsKnownFolderCache.get(name);
  let resolved = "";
  try {
    const output = execFileSync("reg.exe", ["query", "HKCU\\Software\\Microsoft\\Windows\\CurrentVersion\\Explorer\\User Shell Folders", "/v", WINDOWS_KNOWN_FOLDER_VALUES[name]], { encoding: "utf8", windowsHide: true });
    const match = output.match(/\s+REG_(?:EXPAND_)?SZ\s+(.+)\r?$/m);
    resolved = match ? expandWindowsEnvironment(match[1].trim()) : "";
  } catch (_error) { /* Fall back to OneDrive and the conventional home folder. */ }
  windowsKnownFolderCache.set(name, resolved);
  return resolved;
}

function expandWindowsEnvironment(value) {
  return String(value || "").replace(/%([^%]+)%/g, (_match, name) => process.env[name] || process.env[name.toUpperCase()] || "");
}

function workspaceTarget(root, requested) {
  const resolvedPath = path.isAbsolute(requested) ? path.resolve(requested) : path.resolve(root, requested);
  if (!isWithin(resolvedPath, root)) throw pathAuthorityError("PATH_NOT_AUTHORIZED", "The relative path resolves outside the opened folder.");
  return { root, relativePath: path.relative(root, resolvedPath) || ".", resolvedPath, external: false };
}

function externalTarget(authorityRoot, resolvedPath) {
  if (authorityRoot.exactFile && resolvedPath !== authorityRoot.exactFile) throw pathAuthorityError("PATH_NOT_AUTHORIZED", "The user supplied authority for one file only.");
  if (!isWithin(resolvedPath, authorityRoot.root)) throw pathAuthorityError("PATH_NOT_AUTHORIZED", "The requested path is outside the location supplied by the user.");
  return { root: authorityRoot.root, relativePath: path.relative(authorityRoot.root, resolvedPath) || ".", resolvedPath, external: true };
}

function targetAuthority(target) {
  const absolute = path.resolve(target);
  return isDirectory(absolute) ? { root: absolute, exactFile: "" } : { root: path.dirname(absolute), exactFile: absolute };
}

function normalizeAbsolutePath(value) {
  const text = String(value || "").trim();
  return text ? path.resolve(text) : "";
}

function normalizeReferenceText(value) { return String(value || "").replace(/\//g, "\\").toLowerCase(); }
function containsReference(text, reference) { return !!reference && text.includes(reference); }
function containsStandaloneReference(text, reference) {
  const index = text.indexOf(reference.toLowerCase());
  if (index < 0) return false;
  const before = text[index - 1] || " ";
  const after = text[index + reference.length] || " ";
  return !/[a-z0-9_\\/]/i.test(before) && !/[a-z0-9_\\/]/i.test(after);
}
function collectUserText(value) {
  if (value == null) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(collectUserText).join("\n");
  if (typeof value === "object") return Object.values(value).map(collectUserText).join("\n");
  return String(value);
}
function isWithin(candidate, root) { return candidate === root || candidate.startsWith(root + path.sep); }
function isDirectory(value) { try { return fs.statSync(value).isDirectory(); } catch (_error) { return false; } }
function pathAuthorityError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { KNOWN_FOLDER_NAMES, PathAuthority, resolveKnownFolderReference };
