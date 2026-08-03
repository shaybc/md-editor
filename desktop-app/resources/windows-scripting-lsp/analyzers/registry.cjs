"use strict";

/**
 * Analyzes .reg files for headers, hive sections, values, and conservative diagnostics.
 */

const { REGISTRY_HIVES, REGISTRY_VALUE_NAMES, REGISTRY_VALUE_TYPES } = require("../language-data.cjs");
const { completion, diagnostic, lineRange, normalizeKey, splitLines, tokenAtPosition } = require("./shared.cjs");

const HEADER_PATTERN = /^\s*(?:Windows Registry Editor Version 5\.00|REGEDIT4)\s*$/i;
const SECTION_PATTERN = /^\s*\[(-?)([^\]]+)\]\s*$/;
const VALUE_PATTERN = /^\s*(?:@|"(?:[^"\\]|\\.)*")\s*=\s*(?:"(?:[^"\\]|\\.)*"|dword:[0-9a-fA-F]{8}|hex(?:\([0-9a-fA-F]+\))?:[0-9a-fA-F,\\\s]*|-)\s*$/;
const CONTINUATION_PATTERN = /^\s*[0-9a-fA-F,\\\s]+$/;
const TOKEN_PATTERN = /HKEY_[A-Z_]+|HK[A-Z]+|hex(?:\([0-9a-fA-F]+\))?:|dword:|"(?:[^"\\]|\\.)*"|@/g;
const HIVE_ALIASES = Object.freeze({
  HKCR: "HKEY_CLASSES_ROOT",
  HKCU: "HKEY_CURRENT_USER",
  HKLM: "HKEY_LOCAL_MACHINE",
  HKU: "HKEY_USERS",
  HKCC: "HKEY_CURRENT_CONFIG"
});

function normalizeHiveName(name) {
  const key = String(name || "").split(/\\/, 1)[0].toUpperCase();
  return HIVE_ALIASES[key] || key;
}

function firstContentLine(lines) {
  for (let index = 0; index < lines.length; index += 1) {
    const text = lines[index].trim();
    if (text && !text.startsWith(";")) return { index, text };
  }
  return null;
}

/**
 * Analyze a Registry export document.
 * @param {string} text Document text.
 * @returns {object} Analyzer result for LSP features.
 */
function analyzeRegistry(text) {
  const lines = splitLines(text);
  const diagnostics = [];
  const sections = new Map();
  const symbols = [];
  const foldingRanges = [];
  const first = firstContentLine(lines);
  if (!first || !HEADER_PATTERN.test(first.text)) {
    diagnostics.push(diagnostic(first?.index || 0, 0, Math.max(1, lines[first?.index || 0]?.length || 1), "Registry files should start with 'Windows Registry Editor Version 5.00' or 'REGEDIT4'."));
  }

  let previousHexContinues = false;
  lines.forEach((lineText, lineIndex) => {
    const trimmed = lineText.trim();
    if (!trimmed || trimmed.startsWith(";") || HEADER_PATTERN.test(trimmed)) {
      previousHexContinues = false;
      return;
    }

    const section = lineText.match(SECTION_PATTERN);
    if (section) {
      const keyPath = section[2];
      const hive = normalizeHiveName(keyPath);
      const keyStart = lineText.indexOf(keyPath);
      const range = lineRange(lineIndex, keyStart, keyStart + keyPath.length);
      sections.set(normalizeKey(keyPath), { name: keyPath, range });
      symbols.push({ name: keyPath, kind: "namespace", range: lineRange(lineIndex, 0, lineText.length), selectionRange: range });
      if (!REGISTRY_HIVES[hive]) {
        diagnostics.push(diagnostic(lineIndex, keyStart, keyStart + keyPath.split(/\\/, 1)[0].length, `Unknown registry hive '${keyPath.split(/\\/, 1)[0]}'.`));
      }
      if (symbols.length > 1) {
        const previous = symbols[symbols.length - 2];
        if (previous.range.start.line < lineIndex - 1) foldingRanges.push({ startLine: previous.range.start.line, endLine: lineIndex - 1 });
      }
      previousHexContinues = false;
      return;
    }

    if (previousHexContinues && CONTINUATION_PATTERN.test(lineText)) {
      previousHexContinues = /\\\s*$/.test(lineText);
      return;
    }

    if (!VALUE_PATTERN.test(lineText)) {
      diagnostics.push(diagnostic(lineIndex, 0, lineText.length, "Registry value assignment is malformed."));
      previousHexContinues = false;
      return;
    }
    previousHexContinues = /\\\s*$/.test(lineText);
  });

  if (symbols.length) {
    const last = symbols[symbols.length - 1];
    if (last.range.start.line < lines.length - 1) foldingRanges.push({ startLine: last.range.start.line, endLine: lines.length - 1 });
  }

  return { diagnostics, foldingRanges, lines, sections, symbols };
}

/**
 * Return Registry completions for the current document.
 * @returns {object[]} Completion records.
 */
function getRegistryCompletions() {
  const completions = Object.entries(REGISTRY_HIVES).map(([label, documentation]) => completion(label, "namespace", "Registry hive", documentation));
  REGISTRY_VALUE_NAMES.forEach((label) => completions.push(completion(label, "property", "Registry value")));
  Object.entries(REGISTRY_VALUE_TYPES).forEach(([label, documentation]) => completions.push(completion(label, "keyword", "Registry value type", documentation)));
  return completions;
}

/**
 * Return hover content for a Registry token.
 * @param {object} analysis Analyzer result.
 * @param {object} position LSP position.
 * @returns {string} Hover text or empty string.
 */
function getRegistryHover(analysis, position) {
  const token = tokenAtPosition(analysis.lines, position, TOKEN_PATTERN);
  if (!token) return "";
  const text = token.text || "";
  const hive = REGISTRY_HIVES[normalizeHiveName(text)];
  if (hive) return `**${text}**\n\n${hive}`;
  const type = REGISTRY_VALUE_TYPES[text.toLowerCase()] || REGISTRY_VALUE_TYPES[text];
  if (type) return `**${text}**\n\n${type}`;
  if (text === "@") return "Default unnamed registry value.";
  return "";
}

module.exports = {
  analyzeRegistry,
  getRegistryCompletions,
  getRegistryHover
};