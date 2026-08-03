"use strict";

/**
 * Analyzes PowerShell scripts for functions, variables, cmdlets, and bracket diagnostics.
 */

const { POWERSHELL_ALIASES, POWERSHELL_COMMANDS, POWERSHELL_KEYWORDS, POWERSHELL_MEMBERS, POWERSHELL_PARAMETERS } = require("../language-data.cjs");
const { completion, diagnostic, lineRange, normalizeKey, splitLines, tokenAtPosition } = require("./shared.cjs");

const FUNCTION_PATTERN = /^\s*function\s+([A-Za-z_][A-Za-z0-9_-]*)\b/i;
const VARIABLE_ASSIGNMENT_PATTERN = /\$([A-Za-z_][A-Za-z0-9_]*)\s*=/g;
const VARIABLE_PATTERN = /\$[A-Za-z_][A-Za-z0-9_]*|[A-Za-z_][A-Za-z0-9_-]*/g;
const BRACE_PAIRS = Object.freeze({ "(": ")", "[": "]", "{": "}" });


function getPowerShellMetadataEntry(metadata, key) {
  if (metadata[key]) return { label: key, documentation: metadata[key] };
  const match = Object.entries(metadata).find(([label]) => normalizeKey(label) === key);
  return match ? { label: match[0], documentation: match[1] } : null;
}

function normalizePowerShellDocumentation(documentation) {
  if (!documentation) return { aliases: [], examples: [] };
  if (typeof documentation === "string") return { aliases: [], description: documentation, examples: [] };
  return {
    aliases: Array.isArray(documentation.aliases) ? documentation.aliases : [],
    category: documentation.category || "",
    description: documentation.description || "",
    examples: Array.isArray(documentation.examples) ? documentation.examples : []
  };
}

function formatPowerShellDocumentation(documentation, options = {}) {
  const details = normalizePowerShellDocumentation(documentation);
  const lines = [];
  if (options.aliasFor) lines.push(`Alias for ${options.aliasFor}.`);
  if (details.description) lines.push(details.description);
  if (details.category) lines.push(`Category: ${details.category}.`);
  if (details.aliases.length && !options.aliasFor) lines.push(`Aliases: ${details.aliases.join(", ")}.`);
  if (details.examples.length) {
    lines.push("", "Examples:");
    details.examples.slice(0, 3).forEach((example) => lines.push("- `" + example + "`"));
  }
  return lines.join("\n");
}

function formatPowerShellHover(label, documentation, options = {}) {
  return `**${label}**\n\n${formatPowerShellDocumentation(documentation, options)}`;
}

function getPowerShellCommandEntry(key) {
  const direct = getPowerShellMetadataEntry(POWERSHELL_COMMANDS, key);
  if (direct) return direct;
  const aliasFor = POWERSHELL_ALIASES[key];
  const target = aliasFor ? getPowerShellMetadataEntry(POWERSHELL_COMMANDS, aliasFor) : null;
  return target ? { ...target, aliasFor: target.label } : null;
}
function collectPowerShellBraceFoldingRanges(lines) {
  const ranges = [];
  const stack = [];
  let quote = "";
  lines.forEach((lineText, lineIndex) => {
    for (let character = 0; character < lineText.length; character += 1) {
      const current = lineText[character];
      const previous = lineText[character - 1] || "";
      if (quote) {
        if (current === quote && previous !== "`") quote = "";
        continue;
      }
      if (current === "#") break;
      if (current === '"' || current === "'") {
        quote = current;
        continue;
      }
      if (current === "{") {
        stack.push({ line: lineIndex, character });
      } else if (current === "}") {
        const opener = stack.pop();
        if (opener && lineIndex > opener.line) ranges.push({ startLine: opener.line, endLine: lineIndex });
      }
    }
  });
  return ranges;
}
function scanPowerShellStructure(lines) {
  const diagnostics = [];
  const stack = [];
  let quote = "";
  let quoteLine = 0;
  let quoteCharacter = 0;
  const pairs = { "(": ")", "[": "]", "{": "}" };
  const closers = new Set(Object.values(pairs));

  lines.forEach((lineText, lineIndex) => {
    for (let character = 0; character < lineText.length; character += 1) {
      const current = lineText[character];
      const previous = lineText[character - 1] || "";
      if (quote) {
        if (current === quote && previous !== "`") quote = "";
        continue;
      }
      if (current === "#") break;
      if (current === '"' || current === "'") {
        quote = current;
        quoteLine = lineIndex;
        quoteCharacter = character;
        continue;
      }
      if (pairs[current]) {
        stack.push({ opener: current, expected: pairs[current], line: lineIndex, character });
      } else if (closers.has(current)) {
        const top = stack.pop();
        if (!top || top.expected !== current) {
          diagnostics.push(diagnostic(lineIndex, character, character + 1, `Unexpected '${current}' in PowerShell script.`));
        }
      }
    }
  });

  if (quote) diagnostics.push(diagnostic(quoteLine, quoteCharacter, quoteCharacter + 1, "PowerShell string is not terminated."));
  stack.forEach((entry) => diagnostics.push(diagnostic(entry.line, entry.character, entry.character + 1, `PowerShell '${entry.opener}' is not closed.`)));
  return diagnostics;
}

/**
 * Analyze a PowerShell document.
 * @param {string} text Document text.
 * @returns {object} Analyzer result for LSP features.
 */
function analyzePowerShell(text) {
  const lines = splitLines(text);
  const diagnostics = scanPowerShellStructure(lines);
  const functions = new Map();
  const variables = new Map();
  const symbols = [];
  const foldingRanges = collectPowerShellBraceFoldingRanges(lines);

  lines.forEach((lineText, lineIndex) => {
    const functionMatch = lineText.match(FUNCTION_PATTERN);
    if (functionMatch) {
      const name = functionMatch[1];
      const start = lineText.indexOf(name);
      const range = lineRange(lineIndex, start, start + name.length);
      functions.set(normalizeKey(name), { name, range });
      symbols.push({ name, kind: "function", range: lineRange(lineIndex, 0, lineText.length), selectionRange: range });
      if (symbols.length > 1) {
        const previous = symbols[symbols.length - 2];
        if (previous.range.start.line < lineIndex - 1) foldingRanges.push({ startLine: previous.range.start.line, endLine: lineIndex - 1 });
      }
    }

    VARIABLE_ASSIGNMENT_PATTERN.lastIndex = 0;
    let variableMatch;
    while ((variableMatch = VARIABLE_ASSIGNMENT_PATTERN.exec(lineText)) !== null) {
      const name = variableMatch[1];
      const start = variableMatch.index + 1;
      const range = lineRange(lineIndex, start, start + name.length);
      if (!variables.has(normalizeKey(name))) variables.set(normalizeKey(name), { name, range });
    }
  });

  if (symbols.length) {
    const last = symbols[symbols.length - 1];
    if (last.range.start.line < lines.length - 1) foldingRanges.push({ startLine: last.range.start.line, endLine: lines.length - 1 });
  }

  const uniqueFoldingRanges = Array.from(new Map(foldingRanges.map((range) => [`${range.startLine}:${range.endLine}`, range])).values());
  return { diagnostics, foldingRanges: uniqueFoldingRanges, functions, lines, symbols, variables };
}

/**
 * Return PowerShell completions for the current document.
 * @param {object} analysis Analyzer result.
 * @returns {object[]} Completion records.
 */
function getPowerShellCompletions(analysis) {
  const completions = Object.entries(POWERSHELL_COMMANDS).map(([label, documentation]) => {
    const details = normalizePowerShellDocumentation(documentation);
    const detail = details.category ? `PowerShell ${details.category}` : "PowerShell command";
    return completion(label, "function", detail, formatPowerShellDocumentation(documentation));
  });
  Object.entries(POWERSHELL_ALIASES).forEach(([alias, command]) => {
    const target = getPowerShellMetadataEntry(POWERSHELL_COMMANDS, command);
    if (target) completions.push(completion(alias, "function", `PowerShell alias for ${target.label}`, formatPowerShellDocumentation(target.documentation, { aliasFor: target.label })));
  });
  Object.entries(POWERSHELL_KEYWORDS).forEach(([label, documentation]) => completions.push(completion(label, "keyword", "PowerShell keyword", formatPowerShellDocumentation(documentation))));
  Object.entries(POWERSHELL_MEMBERS).forEach(([label, documentation]) => completions.push(completion(label, "property", "PowerShell member", formatPowerShellDocumentation(documentation))));
  POWERSHELL_PARAMETERS.forEach((label) => completions.push(completion(label, "property", "PowerShell parameter")));
  for (const value of analysis.functions.values()) {
    completions.push(completion(value.name, "function", "PowerShell function", `Function ${value.name}`));
  }
  for (const value of analysis.variables.values()) {
    completions.push(completion(`$${value.name}`, "variable", "PowerShell variable", `Variable $${value.name}`));
  }
  return completions;
}

/**
 * Return hover content for a PowerShell token.
 * @param {object} analysis Analyzer result.
 * @param {object} position LSP position.
 * @returns {string} Hover text or empty string.
 */
function getPowerShellHover(analysis, position) {
  const token = tokenAtPosition(analysis.lines, position, VARIABLE_PATTERN);
  if (!token) return "";
  const text = token.text || "";
  if (text.startsWith("$")) {
    const variable = analysis.variables.get(normalizeKey(text.slice(1)));
    return variable ? `PowerShell variable ${text}` : "";
  }
  const key = normalizeKey(text);
  const command = getPowerShellCommandEntry(key);
  if (command) return formatPowerShellHover(text, command.documentation, { aliasFor: command.aliasFor });
  const keyword = getPowerShellMetadataEntry(POWERSHELL_KEYWORDS, key);
  if (keyword) return formatPowerShellHover(text, keyword.documentation);
  const member = getPowerShellMetadataEntry(POWERSHELL_MEMBERS, key);
  if (member) return formatPowerShellHover(text, member.documentation);
  const fn = analysis.functions.get(key);
  if (fn) return `PowerShell function ${fn.name}`;
  return "";
}

/**
 * Resolve a PowerShell token to a function or variable definition.
 * @param {object} analysis Analyzer result.
 * @param {object} position LSP position.
 * @returns {object|null} Definition location data or null.
 */
function getPowerShellDefinition(analysis, position) {
  const token = tokenAtPosition(analysis.lines, position, VARIABLE_PATTERN);
  if (!token) return null;
  const text = token.text || "";
  const target = text.startsWith("$")
    ? analysis.variables.get(normalizeKey(text.slice(1)))
    : analysis.functions.get(normalizeKey(text));
  return target ? { range: target.range, selectionRange: target.range } : null;
}

module.exports = {
  analyzePowerShell,
  getPowerShellCompletions,
  getPowerShellDefinition,
  getPowerShellHover
};