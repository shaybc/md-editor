"use strict";

/**
 * Analyzes Batch and CMD scripts for labels, commands, variables, and conservative diagnostics.
 */

const { BATCH_ARGUMENT_MODIFIERS, BATCH_COMMANDS } = require("../language-data.cjs");
const {
  collectLineMatches,
  completion,
  diagnostic,
  lineRange,
  normalizeKey,
  positionInRange,
  splitLines,
  tokenAtPosition
} = require("./shared.cjs");

const LABEL_PATTERN = /^\s*:([A-Za-z0-9_.-]+)\b/;
const COMMAND_TOKEN_PATTERN = /[%!]?[A-Za-z_][A-Za-z0-9_.-]*[%!]?|%~?[A-Za-z0-9*]+/g;
const VARIABLE_PATTERN = /(?:%([A-Za-z_][A-Za-z0-9_]*)%|!([A-Za-z_][A-Za-z0-9_]*)!)/g;
const LABEL_REFERENCE_PATTERN = /\b(?:goto\s+:?|call\s+:)([A-Za-z0-9_.-]+)\b/ig;

function isCommentLine(lineText) {
  return /^\s*(?:rem\b|::)/i.test(lineText || "");
}

function hasUnmatchedDoubleQuote(lineText) {
  const text = String(lineText || "").replace(/\^"/g, "");
  return (text.match(/"/g) || []).length % 2 === 1;
}

/**
 * Analyze a Batch or CMD document.
 * @param {string} text Document text.
 * @returns {object} Analyzer result for LSP features.
 */
function analyzeBatch(text) {
  const lines = splitLines(text);
  const labels = new Map();
  const variables = new Map();
  const diagnostics = [];
  const symbols = [];
  const foldingRanges = [];
  let parenBalance = 0;

  lines.forEach((lineText, lineIndex) => {
    const label = lineText.match(LABEL_PATTERN);
    if (label && !/^\s*::/.test(lineText)) {
      const name = label[1];
      const key = normalizeKey(name);
      const start = lineText.indexOf(name);
      const entry = { name, key, range: lineRange(lineIndex, start, start + name.length) };
      if (!labels.has(key)) labels.set(key, []);
      labels.get(key).push(entry);
      symbols.push({ name, kind: "function", range: lineRange(lineIndex, 0, lineText.length), selectionRange: entry.range });
      if (symbols.length > 1) {
        const previous = symbols[symbols.length - 2];
        if (previous.range.start.line < lineIndex - 1) {
          foldingRanges.push({ startLine: previous.range.start.line, endLine: lineIndex - 1 });
        }
      }
    } else if (/^\s*:[^\sA-Za-z0-9_.-]/.test(lineText)) {
      diagnostics.push(diagnostic(lineIndex, 0, lineText.length, "Batch label names should use letters, numbers, underscore, period, or hyphen."));
    }

    for (const variable of collectLineMatches(lineText, VARIABLE_PATTERN, lineIndex)) {
      const name = variable.match[1] || variable.match[2] || variable.text;
      const key = normalizeKey(name);
      if (!variables.has(key)) variables.set(key, { name, range: variable.range });
    }

    if (!isCommentLine(lineText) && hasUnmatchedDoubleQuote(lineText)) {
      diagnostics.push(diagnostic(lineIndex, lineText.indexOf('"'), lineText.length, "Line contains an unmatched double quote."));
    }

    if (!isCommentLine(lineText)) {
      const openCount = (lineText.match(/\(/g) || []).length;
      const closeCount = (lineText.match(/\)/g) || []).length;
      parenBalance += openCount - closeCount;
    }
  });

  if (symbols.length) {
    const last = symbols[symbols.length - 1];
    if (last.range.start.line < lines.length - 1) foldingRanges.push({ startLine: last.range.start.line, endLine: lines.length - 1 });
  }

  for (const [key, entries] of labels.entries()) {
    if (entries.length > 1) {
      entries.slice(1).forEach((entry) => diagnostics.push(diagnostic(
        entry.range.start.line,
        entry.range.start.character,
        entry.range.end.character,
        `Duplicate Batch label '${entry.name}'.`
      )));
    }
  }

  lines.forEach((lineText, lineIndex) => {
    if (isCommentLine(lineText)) return;
    for (const reference of collectLineMatches(lineText, LABEL_REFERENCE_PATTERN, lineIndex)) {
      const name = reference.text;
      if (normalizeKey(name) === "eof") continue;
      if (!labels.has(normalizeKey(name))) {
        diagnostics.push(diagnostic(
          lineIndex,
          reference.range.start.character,
          reference.range.end.character,
          `Batch label '${name}' was not found.`
        ));
      }
    }
  });

  if (parenBalance !== 0) {
    diagnostics.push(diagnostic(0, 0, Math.max(1, lines[0]?.length || 1), "Batch block parentheses appear unbalanced.", "information"));
  }

  return { diagnostics, foldingRanges, labels, lines, symbols, variables };
}

/**
 * Return Batch completions for the current document.
 * @param {object} analysis Analyzer result.
 * @returns {object[]} Completion records.
 */
function getBatchCompletions(analysis) {
  const completions = Object.entries(BATCH_COMMANDS).map(([label, documentation]) => completion(label, "keyword", "Batch command", documentation));
  for (const entries of analysis.labels.values()) {
    const label = entries[0].name;
    completions.push(completion(label, "function", "Batch label", `Jump target :${label}`, label));
    completions.push(completion(`:${label}`, "function", "Batch label reference", `Call target :${label}`, `:${label}`));
  }
  for (const variable of analysis.variables.values()) {
    completions.push(completion(`%${variable.name}%`, "variable", "Batch variable", `Environment variable ${variable.name}`));
    completions.push(completion(`!${variable.name}!`, "variable", "Delayed expansion variable", `Delayed expansion variable ${variable.name}`));
  }
  BATCH_ARGUMENT_MODIFIERS.forEach((label) => completions.push(completion(label, "variable", "Batch argument modifier")));
  return completions;
}

/**
 * Return hover content for a Batch token.
 * @param {object} analysis Analyzer result.
 * @param {object} position LSP position.
 * @returns {string} Hover text or empty string.
 */
function getBatchHover(analysis, position) {
  const token = tokenAtPosition(analysis.lines, position, COMMAND_TOKEN_PATTERN);
  if (!token) return "";
  const text = token.text.replace(/^[:%!]+|[%!]+$/g, "");
  const command = BATCH_COMMANDS[normalizeKey(text)];
  if (command) return `**${text}**\n\n${command}`;
  const label = analysis.labels.get(normalizeKey(text));
  if (label) return `Batch label :${label[0].name}`;
  const variable = analysis.variables.get(normalizeKey(text));
  if (variable) return `Batch variable ${variable.name}`;
  return "";
}

/**
 * Resolve a Batch label reference to its label definition.
 * @param {object} analysis Analyzer result.
 * @param {object} position LSP position.
 * @returns {object|null} Definition location data or null.
 */
function getBatchDefinition(analysis, position) {
  const lineText = analysis.lines[position?.line] || "";
  const references = collectLineMatches(lineText, LABEL_REFERENCE_PATTERN, position?.line || 0);
  const reference = references.find((entry) => positionInRange(position, entry.range));
  if (!reference) return null;
  const target = analysis.labels.get(normalizeKey(reference.text))?.[0];
  return target ? { range: target.range, selectionRange: target.range } : null;
}

module.exports = {
  analyzeBatch,
  getBatchCompletions,
  getBatchDefinition,
  getBatchHover
};