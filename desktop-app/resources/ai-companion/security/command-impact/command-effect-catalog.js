/** Flag-aware command effect classifications for common development workflows. */

"use strict";

const path = require("node:path");

const READ_ONLY = new Set(["echo", "printf", "pwd", "ls", "dir", "type", "cat", "head", "tail", "more", "less", "wc", "sort", "uniq", "diff", "grep", "rg", "findstr", "where", "which", "get-command", "get-childitem", "gci", "get-item", "gi", "get-content", "gc", "select-string", "measure-object", "test-path"]);
const WORKSPACE_WRITE = new Set(["mkdir", "md", "touch", "cp", "copy", "copy-item", "mv", "move", "move-item", "rename-item", "set-content", "add-content", "out-file", "tee"]);
const DESTRUCTIVE = new Set(["rm", "del", "erase", "rmdir", "rd", "remove-item", "clear-content"]);
const EXTERNAL = new Set(["curl", "wget", "invoke-webrequest", "invoke-restmethod", "ssh", "scp", "rsync", "kubectl", "helm", "terraform", "aws", "az", "gcloud", "vercel", "netlify"]);
const VERSION_EXECUTABLES = new Set(["node", "npm", "npx", "pnpm", "yarn", "bun", "java", "javac", "mvn", "mvnw", "gradle", "gradlew", "dotnet", "python", "python3", "ruby", "go", "rustc", "cargo"]);

/** Classify one parsed subcommand using executable and argument semantics. */
function classifyCommandEffect(command = {}) {
  const argv = Array.isArray(command.argv) ? command.argv.map(String) : [];
  const executable = normalizeExecutable(argv[0]);
  const args = argv.slice(1);
  const lower = args.map((value) => value.toLowerCase());
  if (!executable) return effect("unknown", "A redirection without an executable cannot be proven safe.");
  if (containsSensitiveArguments(argv)) return effect("sensitive-read", "The command contains a credential-like argument that requires confirmation.");
  if (["cd", "chdir", "set-location", "sl"].includes(executable)) return { ...effect("read-only", "The command changes only the process working directory."), changesDirectory: true };
  if (READ_ONLY.has(executable)) {
    if (executable === "find" && lower.some((value) => ["-delete", "-exec", "-execdir", "-ok"].includes(value))) return effect(lower.includes("-delete") ? "destructive" : "unknown", "The find operation can execute or delete content.");
    if (executable === "sort" && lower.some((value) => value === "/o" || value.startsWith("/o:"))) return effect("workspace-write", "sort can write its result to a file.");
    return effect("read-only", `${executable} is observational with the supplied arguments.`);
  }
  if (executable === "git") return classifyGit(lower);
  if (VERSION_EXECUTABLES.has(executable) && lower.some((value) => ["--version", "-version", "-v", "version", "--help", "-h"].includes(value))) return effect("read-only", `${executable} only reports version or help information.`);
  if (["npm", "pnpm", "yarn", "bun"].includes(executable)) return classifyPackageCommand(executable, lower);
  if (DESTRUCTIVE.has(executable)) return effect("destructive", `${executable} can delete or irreversibly clear filesystem content.`);
  if (WORKSPACE_WRITE.has(executable)) return effect("workspace-write", `${executable} can modify filesystem content.`);
  if (EXTERNAL.has(executable)) return { ...effect("external-impact", `${executable} can access or change external systems.`), externalTarget: firstExternalTarget(args) };
  if (["gh", "glab"].includes(executable)) return effect("external-impact", "The command can read or change authenticated shared repository state.");
  if (["shutdown", "reboot", "restart-computer", "stop-computer", "format", "diskpart"].includes(executable)) return effect("destructive", `${executable} can affect the host system broadly.`);
  return effect("unknown", `${executable} is not proven read-only by the command-effect catalog.`);
}

function classifyGit(args) {
  const subcommand = args.find((value) => !value.startsWith("-")) || "";
  if (args.some((value) => value === "--output" || value.startsWith("--output="))) return effect("workspace-write", "The Git command writes output to a file.");
  if (["status", "log", "show", "diff", "rev-parse", "ls-files", "grep", "blame", "describe", "name-rev"].includes(subcommand)) return effect("read-only", `git ${subcommand} inspects repository state.`);
  if (subcommand === "branch" && !args.some((value) => ["-d", "--delete", "-m", "--move"].includes(value))) return effect("read-only", "git branch lists branches without mutation flags.");
  if (subcommand === "remote" && (args.length === 1 || args.includes("-v") || args.includes("get-url"))) return effect("read-only", "git remote inspects configured remotes.");
  if (subcommand === "push") return effect("external-impact", args.some((value) => /force/.test(value)) ? "Forced Git push can overwrite shared history." : "Git push changes shared remote state.");
  if (subcommand === "reset" && args.includes("--hard")) return effect("destructive", "git reset --hard can discard local work.");
  if (subcommand === "clean" && args.some((value) => /^-[a-z]*f/i.test(value) || value === "--force")) return effect("destructive", "git clean with force can delete untracked work.");
  if (subcommand === "branch" && args.some((value) => ["-d", "--delete"].includes(value))) return effect("destructive", "Deleting a Git branch can discard unmerged work.");
  if (["checkout", "restore"].includes(subcommand) && args.includes("--")) return effect("destructive", `git ${subcommand} can overwrite working-tree changes.`);
  if (["fetch", "pull", "clone"].includes(subcommand)) return effect("workspace-write", `git ${subcommand} changes local repository state and uses the network.`);
  if (["add", "commit", "merge", "rebase", "switch", "checkout", "restore", "reset", "stash", "tag", "init", "worktree"].includes(subcommand)) return effect("workspace-write", `git ${subcommand} changes local repository state.`);
  return effect("unknown", `git ${subcommand || "command"} is not proven read-only.`);
}

function classifyPackageCommand(executable, args) {
  const subcommand = args.find((value) => !value.startsWith("-")) || "";
  if (["view", "info", "why", "list", "ls", "outdated", "config"].includes(subcommand)) return effect("external-impact", `${executable} ${subcommand} may read package registry or configuration data.`);
  if (["publish", "unpublish", "deprecate", "owner", "access", "login", "logout"].includes(subcommand)) return effect("external-impact", `${executable} ${subcommand} can change registry or account state.`);
  if (["remove", "uninstall"].includes(subcommand)) return effect("destructive", `${executable} ${subcommand} removes project dependencies.`);
  if (["install", "add", "update", "upgrade", "link", "unlink", "run", "exec", "test", "build"].includes(subcommand)) return effect("workspace-write", `${executable} ${subcommand} can execute scripts or modify the workspace.`);
  return effect("unknown", `${executable} ${subcommand || "command"} is not proven read-only.`);
}

function normalizeExecutable(value) { return path.basename(String(value || "")).toLowerCase().replace(/\.(exe|cmd|bat)$/i, ""); }
function containsSensitiveArguments(argv) { return argv.some((value) => /(?:password|passwd|token|secret|api[_-]?key|authorization)(?:=|:)/i.test(value)); }
function firstExternalTarget(args) { return args.find((value) => /^(?:https?|ssh):\/\//i.test(value) || /^[\w.-]+@[\w.-]+:/.test(value)) || ""; }
function effect(impact, reason) { return { impact, reason }; }

module.exports = { classifyCommandEffect, normalizeExecutable };
