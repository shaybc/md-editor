#!/usr/bin/env node

/**
 * Desktop terminal bridge.
 *
 * Receives a base64 JSON launch request, starts the requested shell in a PTY,
 * and relays terminal data over a newline-delimited JSON stdio protocol.
 */

const fs = require("node:fs");
const path = require("node:path");
const readline = require("node:readline");
const pty = require("node-pty");

const PROFILE_LABELS = Object.freeze({
  "git-cmd": "Git CMD",
  "git-bash": "Git Bash",
  cmd: "Command Prompt",
  powershell: "PowerShell"
});

function send(message) {
  process.stdout.write(`${JSON.stringify(message)}\n`);
}

function decodeRequest(value) {
  const raw = Buffer.from(String(value || ""), "base64").toString("utf8");
  const request = JSON.parse(raw || "{}");
  if (!request || typeof request !== "object") throw new Error("Terminal launch request is invalid.");
  const command = String(request.command || "").trim();
  const profileId = String(request.profileId || "git-cmd");
  if (!command && !Object.prototype.hasOwnProperty.call(PROFILE_LABELS, profileId)) throw new Error("Terminal profile is not supported.");
  return {
    profileId,
    command,
    title: String(request.title || "Command"),
    cwd: String(request.cwd || ""),
    homeCwd: String(request.homeCwd || ""),
    workspaceCwd: String(request.workspaceCwd || ""),
    cols: Number(request.cols || 80) || 80,
    rows: Number(request.rows || 24) || 24
  };
}

function fileExists(filePath) {
  try {
    return !!filePath && fs.existsSync(filePath) && fs.statSync(filePath).isFile();
  } catch (_error) {
    return false;
  }
}

function directoryExists(dirPath) {
  try {
    return !!dirPath && fs.existsSync(dirPath) && fs.statSync(dirPath).isDirectory();
  } catch (_error) {
    return false;
  }
}

function getPathEntries() {
  return String(process.env.PATH || "")
    .split(path.delimiter)
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function findExecutableInPath(names) {
  const entries = getPathEntries();
  for (const entry of entries) {
    for (const name of names) {
      const candidate = path.join(entry, name);
      if (fileExists(candidate)) return candidate;
    }
  }
  return "";
}

function findGitExecutable(fileName) {
  const candidates = [
    path.join(process.env.ProgramFiles || "C:\\Program Files", "Git", fileName),
    path.join(process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)", "Git", fileName),
    path.join(process.env.LOCALAPPDATA || "", "Programs", "Git", fileName),
    findExecutableInPath([fileName])
  ];
  return candidates.find(fileExists) || "";
}

function getHomeDirectory(request) {
  const windowsHome = `${process.env.HOMEDRIVE || ""}${process.env.HOMEPATH || ""}`.trim();
  return request.homeCwd || windowsHome || process.env.USERPROFILE || process.env.HOME || process.cwd();
}

function getWorkspaceDirectory(request) {
  return request.workspaceCwd || process.cwd();
}

function resolveCwd(request, useHome) {
  const preferred = useHome ? getHomeDirectory(request) : (request.cwd || getWorkspaceDirectory(request) || getHomeDirectory(request));
  return directoryExists(preferred) ? preferred : process.cwd();
}

function resolveProfile(request) {
  if (request.command) {
    const isWindows = process.platform === "win32";
    const command = isWindows
      ? (findExecutableInPath(["cmd.exe"]) || "cmd.exe")
      : (process.env.SHELL || findExecutableInPath(["bash", "sh"]) || "/bin/sh");
    // Raw Windows arguments preserve CMD quotes; node-pty array serialization escapes them as literal backslashes.
    const args = isWindows ? `/d /s /c "${request.command}"` : ["-lc", request.command];
    return { command, args, cwd: resolveCwd(request, false), label: request.title };
  }
  if (request.profileId === "git-cmd") {
    const command = findGitExecutable("git-cmd.exe");
    if (!command) throw new Error("Git CMD was not found. Install Git for Windows or add it to PATH.");
    return { command, args: ["--cd-to-home"], cwd: resolveCwd(request, true), label: PROFILE_LABELS[request.profileId] };
  }
  if (request.profileId === "git-bash") {
    const command = findGitExecutable("git-bash.exe");
    if (!command) throw new Error("Git Bash was not found. Install Git for Windows or add it to PATH.");
    return { command, args: ["--cd-to-home"], cwd: resolveCwd(request, true), label: PROFILE_LABELS[request.profileId] };
  }
  if (request.profileId === "cmd") {
    const command = findExecutableInPath(["cmd.exe"]) || "cmd.exe";
    return { command, args: [], cwd: resolveCwd(request, false), label: PROFILE_LABELS[request.profileId] };
  }
  const command = findExecutableInPath(["pwsh.exe"]) || findExecutableInPath(["powershell.exe"]) || "powershell.exe";
  return { command, args: [], cwd: resolveCwd(request, false), label: PROFILE_LABELS[request.profileId] };
}

function startTerminal(request) {
  const profile = resolveProfile(request);
  const shell = pty.spawn(profile.command, profile.args, {
    cols: Math.max(20, request.cols),
    rows: Math.max(5, request.rows),
    cwd: profile.cwd,
    env: process.env,
    name: "xterm-256color"
  });
  shell.onData((data) => send({ type: "data", data }));
  shell.onExit((event) => {
    send({ type: "exit", exitCode: event.exitCode, signal: event.signal });
    process.exitCode = event.exitCode || 0;
    setTimeout(() => process.exit(process.exitCode), 0);
  });
  send({
    type: "ready",
    title: profile.label,
    banner: "",
    command: profile.command,
    cwd: profile.cwd,
    args: profile.args,
    pid: shell.pid
  });
  return shell;
}

function bindInput(shell) {
  let closing = false;
  function closeShell() {
    if (closing) return;
    closing = true;
    try {
      shell.kill();
    } catch (_error) {
      // Shutdown is best-effort when the desktop app is already exiting.
    }
  }
  const reader = readline.createInterface({ input: process.stdin, crlfDelay: Infinity });
  reader.on("line", (line) => {
    let message = null;
    try {
      message = JSON.parse(line || "{}");
    } catch (error) {
      send({ type: "error", message: error.message || String(error) });
      return;
    }
    if (message.type === "input") {
      shell.write(String(message.data || ""));
    } else if (message.type === "resize") {
      const cols = Math.max(20, Number(message.cols || 80) || 80);
      const rows = Math.max(5, Number(message.rows || 24) || 24);
      shell.resize(cols, rows);
    } else if (message.type === "close") {
      closeShell();
      reader.close();
    }
  });
  reader.on("close", closeShell);
  process.once("SIGINT", () => {
    closeShell();
    process.exit(130);
  });
  process.once("SIGTERM", () => {
    closeShell();
    process.exit(143);
  });
  process.once("exit", closeShell);
}

try {
  bindInput(startTerminal(decodeRequest(process.argv[2])));
} catch (error) {
  send({ type: "error", message: error?.message || String(error) });
  process.exitCode = 1;
}
