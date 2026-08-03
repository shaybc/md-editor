#!/usr/bin/env node
"use strict";

/**
 * Starts the Windows scripting language server and routes LSP requests to analyzers.
 */

const {
  CompletionItemKind,
  createConnection,
  DiagnosticSeverity,
  ProposedFeatures,
  SymbolKind,
  TextDocumentSyncKind
} = require("vscode-languageserver/node");
const { TextDocuments } = require("vscode-languageserver/node");
const { TextDocument } = require("vscode-languageserver-textdocument");
const { analyzeBatch, getBatchCompletions, getBatchDefinition, getBatchHover } = require("./analyzers/batch.cjs");
const { analyzePowerShell, getPowerShellCompletions, getPowerShellDefinition, getPowerShellHover } = require("./analyzers/powershell.cjs");
const { analyzeRegistry, getRegistryCompletions, getRegistryHover } = require("./analyzers/registry.cjs");

const connection = createConnection(ProposedFeatures.all);
const documents = new TextDocuments(TextDocument);
const analysisByUri = new Map();

const COMPLETION_KIND_BY_TYPE = Object.freeze({
  function: CompletionItemKind.Function,
  keyword: CompletionItemKind.Keyword,
  namespace: CompletionItemKind.Module,
  property: CompletionItemKind.Property,
  variable: CompletionItemKind.Variable
});

const DIAGNOSTIC_SEVERITY_BY_NAME = Object.freeze({
  error: DiagnosticSeverity.Error,
  warning: DiagnosticSeverity.Warning,
  information: DiagnosticSeverity.Information,
  hint: DiagnosticSeverity.Hint
});

const SYMBOL_KIND_BY_NAME = Object.freeze({
  function: SymbolKind.Function,
  namespace: SymbolKind.Namespace,
  variable: SymbolKind.Variable
});

/**
 * Resolve the analyzer family for a document.
 * @param {object} document Text document.
 * @returns {string} Analyzer family id.
 */
function getDocumentFamily(document) {
  const languageId = String(document?.languageId || "").toLowerCase();
  const uri = String(document?.uri || "").toLowerCase();
  if (languageId === "powershell" || /\.(ps1|psm1|psd1)(?:$|[?#])/.test(uri)) return "powershell";
  if (languageId === "registry" || /\.reg(?:$|[?#])/.test(uri)) return "registry";
  return "batch";
}

/**
 * Analyze a text document and cache the result by URI.
 * @param {object} document Text document.
 * @returns {object} Cached analyzer record.
 */
function analyzeDocument(document) {
  const family = getDocumentFamily(document);
  const text = document.getText();
  const analysis = family === "powershell"
    ? analyzePowerShell(text)
    : family === "registry"
      ? analyzeRegistry(text)
      : analyzeBatch(text);
  const record = { family, analysis };
  analysisByUri.set(document.uri, record);
  return record;
}

/**
 * Return cached analysis for a document, refreshing when needed.
 * @param {string} uri Document URI.
 * @returns {object|null} Analyzer record or null.
 */
function getAnalysis(uri) {
  const document = documents.get(uri);
  if (!document) return null;
  return analysisByUri.get(uri) || analyzeDocument(document);
}

function publishDiagnostics(document) {
  const record = analyzeDocument(document);
  connection.sendDiagnostics({
    uri: document.uri,
    diagnostics: record.analysis.diagnostics.map((entry) => ({
      range: entry.range,
      message: entry.message,
      severity: DIAGNOSTIC_SEVERITY_BY_NAME[entry.severity] || DiagnosticSeverity.Warning,
      source: entry.source || "windows-scripting"
    }))
  });
}

function toCompletionItem(entry) {
  return {
    label: entry.label,
    kind: COMPLETION_KIND_BY_TYPE[entry.type] || CompletionItemKind.Text,
    detail: entry.detail || "",
    documentation: entry.documentation || undefined,
    insertText: entry.insertText || entry.label
  };
}

function getCompletions(record) {
  if (!record) return [];
  if (record.family === "powershell") return getPowerShellCompletions(record.analysis).map(toCompletionItem);
  if (record.family === "registry") return getRegistryCompletions(record.analysis).map(toCompletionItem);
  return getBatchCompletions(record.analysis).map(toCompletionItem);
}

function getHover(record, position) {
  if (!record) return null;
  const value = record.family === "powershell"
    ? getPowerShellHover(record.analysis, position)
    : record.family === "registry"
      ? getRegistryHover(record.analysis, position)
      : getBatchHover(record.analysis, position);
  return value ? { contents: { kind: "markdown", value } } : null;
}

function getDefinition(record, uri, position) {
  if (!record || record.family === "registry") return null;
  const target = record.family === "powershell"
    ? getPowerShellDefinition(record.analysis, position)
    : getBatchDefinition(record.analysis, position);
  return target ? { uri, range: target.selectionRange || target.range } : null;
}

function getDocumentSymbols(record) {
  if (!record) return [];
  return record.analysis.symbols.map((symbol) => ({
    name: symbol.name,
    kind: SYMBOL_KIND_BY_NAME[symbol.kind] || SymbolKind.String,
    range: symbol.range,
    selectionRange: symbol.selectionRange || symbol.range
  }));
}

connection.onInitialize(() => ({
  capabilities: {
    textDocumentSync: TextDocumentSyncKind.Incremental,
    completionProvider: {
      resolveProvider: false,
      triggerCharacters: ["%", "!", "$", "-", ":", "\\", "\"", "[", "@"]
    },
    definitionProvider: true,
    documentSymbolProvider: true,
    foldingRangeProvider: true,
    hoverProvider: true
  }
}));

connection.onCompletion((params) => getCompletions(getAnalysis(params.textDocument.uri)));
connection.onHover((params) => getHover(getAnalysis(params.textDocument.uri), params.position));
connection.onDefinition((params) => getDefinition(getAnalysis(params.textDocument.uri), params.textDocument.uri, params.position));
connection.onDocumentSymbol((params) => getDocumentSymbols(getAnalysis(params.textDocument.uri)));
connection.onFoldingRanges((params) => getAnalysis(params.textDocument.uri)?.analysis.foldingRanges || []);

documents.onDidOpen((event) => publishDiagnostics(event.document));
documents.onDidChangeContent((event) => publishDiagnostics(event.document));
documents.onDidClose((event) => {
  analysisByUri.delete(event.document.uri);
  connection.sendDiagnostics({ uri: event.document.uri, diagnostics: [] });
});

documents.listen(connection);
connection.listen();