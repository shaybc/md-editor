/** Resolve the shell grammar that will interpret a free-form command. */

"use strict";

const path = require("node:path");

/** Resolve the active shell dialect from trusted runtime configuration. */
function resolveShellDialect(input = {}) {
  const shell = path.basename(String(input.configuredShell || "")).toLowerCase();
  if (["powershell", "powershell.exe", "pwsh", "pwsh.exe"].includes(shell)) return "powershell";
  if (["cmd", "cmd.exe"].includes(shell)) return "cmd";
  if (["bash", "sh", "zsh", "dash", "fish"].includes(shell.replace(/\.exe$/, ""))) return "posix";
  return String(input.platform || process.platform) === "win32" ? "cmd" : "posix";
}

/** Detect a nested shell payload without executing it. */
function nestedShellCommand(argv = []) {
  const executable = path.basename(String(argv[0] || "")).toLowerCase().replace(/\.exe$/, "");
  const lower = argv.map((value) => String(value).toLowerCase());
  if (["powershell", "pwsh"].includes(executable)) {
    const encoded = lower.findIndex((value) => ["-encodedcommand", "-enc", "-e"].includes(value));
    if (encoded >= 0) return { dialect: "powershell", command: "", encoded: true };
    const marker = lower.findIndex((value) => ["-command", "-c"].includes(value));
    return marker >= 0 && argv[marker + 1] ? { dialect: "powershell", command: argv.slice(marker + 1).join(" ") } : null;
  }
  if (executable === "cmd") {
    const marker = lower.findIndex((value) => ["/c", "/k"].includes(value));
    return marker >= 0 && argv[marker + 1] ? { dialect: "cmd", command: argv.slice(marker + 1).join(" ") } : null;
  }
  if (["bash", "sh", "zsh", "dash"].includes(executable)) {
    const marker = lower.findIndex((value) => value === "-c");
    return marker >= 0 && argv[marker + 1] ? { dialect: "posix", command: argv.slice(marker + 1).join(" ") } : null;
  }
  return null;
}

module.exports = { nestedShellCommand, resolveShellDialect };
