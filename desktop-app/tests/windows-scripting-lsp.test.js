"use strict";

/**
 * Verifies the pure Windows scripting analyzers used by the bundled LSP.
 */

const assert = require("node:assert/strict");
const { spawn } = require("node:child_process");
const path = require("node:path");
const test = require("node:test");
const { analyzeBatch, getBatchCompletions, getBatchDefinition, getBatchHover } = require("../resources/windows-scripting-lsp/analyzers/batch.cjs");
const { analyzePowerShell, getPowerShellCompletions, getPowerShellDefinition, getPowerShellHover } = require("../resources/windows-scripting-lsp/analyzers/powershell.cjs");
const { analyzeRegistry, getRegistryCompletions, getRegistryHover } = require("../resources/windows-scripting-lsp/analyzers/registry.cjs");
function createLspClient() {
  const server = spawn(process.execPath, ["server.cjs", "--stdio"], {
    cwd: path.resolve(__dirname, "../resources/windows-scripting-lsp"),
    stdio: ["pipe", "pipe", "pipe"]
  });
  let nextId = 1;
  let stdout = Buffer.alloc(0);
  const pending = new Map();
  const notifications = [];
  const errors = [];

  function send(message) {
    const body = JSON.stringify(message);
    server.stdin.write(`Content-Length: ${Buffer.byteLength(body, "utf8")}\r\n\r\n${body}`);
  }

  function request(method, params) {
    const id = nextId++;
    send({ jsonrpc: "2.0", id, method, params });
    return new Promise((resolve) => pending.set(id, resolve));
  }

  function notify(method, params) {
    send({ jsonrpc: "2.0", method, params });
  }

  server.stdout.on("data", (chunk) => {
    stdout = Buffer.concat([stdout, chunk]);
    while (true) {
      const headerEnd = stdout.indexOf("\r\n\r\n");
      if (headerEnd < 0) return;
      const header = stdout.slice(0, headerEnd).toString("utf8");
      const match = /Content-Length: (\d+)/i.exec(header);
      assert.ok(match, `Missing LSP content length in ${header}`);
      const length = Number(match[1]);
      const start = headerEnd + 4;
      if (stdout.length < start + length) return;
      const message = JSON.parse(stdout.slice(start, start + length).toString("utf8"));
      stdout = stdout.slice(start + length);
      if (message.id && pending.has(message.id)) {
        pending.get(message.id)(message);
        pending.delete(message.id);
      } else {
        notifications.push(message);
      }
    }
  });

  server.stderr.on("data", (chunk) => errors.push(chunk.toString("utf8")));

  return { errors, notifications, notify, request, server };
}

async function closeLspClient(client) {
  try {
    await client.request("shutdown", null);
    client.notify("exit", {});
  } finally {
    client.server.kill();
  }
}

test("Batch analyzer indexes labels and reports missing targets", () => {
  const analysis = analyzeBatch("@echo off\ncall :build\ngoto missing\n:build\necho done\n:build\n");
  const messages = analysis.diagnostics.map((entry) => entry.message);

  assert.ok(analysis.labels.has("build"));
  assert.ok(messages.some((message) => message.includes("missing")));
  assert.ok(messages.some((message) => message.includes("Duplicate Batch label")));
  assert.ok(getBatchCompletions(analysis).some((entry) => entry.label === ":build"));
  assert.match(getBatchHover(analysis, { line: 1, character: 6 }), /Batch label/);
  assert.equal(getBatchDefinition(analysis, { line: 1, character: 7 }).range.start.line, 3);
});

test("PowerShell analyzer indexes functions and variables", () => {
  const analysis = analyzePowerShell("function Invoke-Thing {\n  $name = 'demo'\n  Write-Host $name\n}\nInvoke-Thing\n");

  assert.ok(analysis.functions.has("invoke-thing"));
  assert.ok(analysis.variables.has("name"));
  assert.equal(analysis.diagnostics.length, 0);
  assert.match(getPowerShellHover(analysis, { line: 4, character: 3 }), /PowerShell function/);
  assert.equal(getPowerShellDefinition(analysis, { line: 4, character: 3 }).range.start.line, 0);
  assert.equal(getPowerShellDefinition(analysis, { line: 2, character: 15 }).range.start.line, 1);
});

test("PowerShell analyzer reports unmatched structure", () => {
  const analysis = analyzePowerShell("function Broken {\n  Write-Host \"oops\n");
  const messages = analysis.diagnostics.map((entry) => entry.message);

  assert.ok(messages.some((message) => message.includes("not terminated")));
  assert.ok(messages.some((message) => message.includes("not closed")));
});
test("PowerShell analyzer hovers keywords and .NET members", () => {
  const analysis = analyzePowerShell("try {\n  $path = [Environment]::GetFolderPath('Fonts')\n  if (-not (Test-Path \"$path\")) {\n    throw \"missing\"\n  }\n  exit 0\n} catch {\n  exit 1\n}\n");
  const completions = getPowerShellCompletions(analysis).map((entry) => entry.label.toLowerCase());

  assert.match(getPowerShellHover(analysis, { line: 0, character: 1 }), /protected block/i);
  assert.match(getPowerShellHover(analysis, { line: 1, character: 12 }), /environment/i);
  assert.match(getPowerShellHover(analysis, { line: 1, character: 28 }), /special folder/i);
  assert.match(getPowerShellHover(analysis, { line: 5, character: 3 }), /exits/i);
  assert.ok(completions.includes("getfolderpath"));
  assert.ok(completions.includes("try"));
  assert.ok(analysis.foldingRanges.some((range) => range.startLine === 0 && range.endLine === 6));
  assert.ok(analysis.foldingRanges.some((range) => range.startLine === 6 && range.endLine === 8));
  assert.ok(analysis.foldingRanges.some((range) => range.startLine === 2 && range.endLine === 4));
});

test("PowerShell analyzer exposes developer command examples and aliases", () => {
  const analysis = analyzePowerShell("dir .\nGet-ChildItem -Path .\nInvoke-RestMethod https://example.com\n[Environment]::GetFolderPath('Fonts')\n");
  const completions = getPowerShellCompletions(analysis).map((entry) => entry.label.toLowerCase());

  assert.ok(completions.includes("get-help"));
  assert.ok(completions.includes("invoke-restmethod"));
  assert.ok(completions.includes("dir"));
  assert.ok(completions.includes("getfolderpath"));
  assert.match(getPowerShellHover(analysis, { line: 0, character: 1 }), /alias for get-childitem/i);
  assert.match(getPowerShellHover(analysis, { line: 1, character: 4 }), /Get-ChildItem -Path \. -Recurse -Filter \*\.ps1/);
  assert.match(getPowerShellHover(analysis, { line: 2, character: 8 }), /HTTP or HTTPS request/i);
  assert.match(getPowerShellHover(analysis, { line: 3, character: 28 }), /Environment\]::GetFolderPath/);
});

test("Registry analyzer validates header, sections, and values", () => {
  const analysis = analyzeRegistry("Windows Registry Editor Version 5.00\n\n[HKEY_CURRENT_USER\\Software\\Demo]\n\"Enabled\"=dword:00000001\n");

  assert.equal(analysis.diagnostics.length, 0);
  assert.equal(analysis.symbols[0].name, "HKEY_CURRENT_USER\\Software\\Demo");
  assert.ok(getRegistryCompletions().some((entry) => entry.label === "HKEY_CURRENT_USER"));
  assert.match(getRegistryHover(analysis, { line: 2, character: 3 }), /current user profile/i);
});

test("Registry analyzer reports invalid files", () => {
  const analysis = analyzeRegistry("[HKEY_FAKE\\Software]\nBadValue\n");
  const messages = analysis.diagnostics.map((entry) => entry.message);

  assert.ok(messages.some((message) => message.includes("Registry files should start")));
  assert.ok(messages.some((message) => message.includes("Unknown registry hive")));
  assert.ok(messages.some((message) => message.includes("malformed")));
});
test("Windows scripting LSP starts and serves Batch requests", async () => {
  const client = createLspClient();
  try {
    const initialize = await client.request("initialize", {
      processId: process.pid,
      rootUri: "file:///C:/workspace",
      capabilities: {}
    });
    assert.equal(initialize.result.capabilities.hoverProvider, true);
    assert.equal(initialize.result.capabilities.definitionProvider, true);
    assert.equal(initialize.result.capabilities.documentSymbolProvider, true);
    assert.equal(initialize.result.capabilities.foldingRangeProvider, true);
    client.notify("initialized", {});

    const uri = "file:///C:/workspace/demo.bat";
    client.notify("textDocument/didOpen", {
      textDocument: {
        uri,
        languageId: "batch",
        version: 1,
        text: "@echo off\ngoto missing\n"
      }
    });
    await new Promise((resolve) => setTimeout(resolve, 100));

    const diagnostics = client.notifications.find((message) => message.method === "textDocument/publishDiagnostics");
    assert.ok(diagnostics.params.diagnostics.some((entry) => entry.message.includes("missing")));

    const completion = await client.request("textDocument/completion", {
      textDocument: { uri },
      position: { line: 1, character: 1 }
    });
    const completionItems = Array.isArray(completion.result) ? completion.result : completion.result.items;
    assert.ok(completionItems.some((entry) => entry.label.toLowerCase() === "goto"));
    assert.deepEqual(client.errors, []);
  } finally {
    await closeLspClient(client);
  }
});