/** Conservative quote-aware structural reader for supported command dialects. */

"use strict";

const MAX_COMMAND_CHARS = 20000;
const MAX_SUBCOMMANDS = 50;

/** Read shell structure without executing or expanding the command. */
function readShellStructure(command, dialect) {
  const text = String(command || "");
  if (!text.trim()) return invalid("Command is empty.");
  if (text.length > MAX_COMMAND_CHARS) return invalid(`Command exceeds ${MAX_COMMAND_CHARS} characters.`);
  if (text.includes("\0")) return invalid("Command contains a null byte.");
  const lexical = tokenize(text, dialect);
  if (!lexical.parseable) return { ...lexical, subcommands: [], operators: [], redirections: [], hasDynamicSyntax: true };
  const subcommands = [];
  const operators = [];
  const redirections = [];
  let current = createSubcommand("");
  let pendingRedirection = null;
  for (const token of lexical.tokens) {
    if (token.type === "operator") {
      if (pendingRedirection) return invalid(`Redirection '${pendingRedirection.value}' has no target.`, lexical);
      finalize(current, subcommands);
      operators.push(token.value);
      current = createSubcommand(token.value);
      continue;
    }
    if (token.type === "redirection") {
      if (pendingRedirection) return invalid(`Redirection '${pendingRedirection.value}' has no target.`, lexical);
      if (token.mergeOnly) {
        const entry = { operator: token.value, target: "", streamMerge: true, writesFile: false, readsFile: false };
        current.redirections.push(entry);
        redirections.push(entry);
      } else pendingRedirection = token;
      continue;
    }
    if (pendingRedirection) {
      const entry = { operator: pendingRedirection.value, target: token.value, streamMerge: false, writesFile: pendingRedirection.value.includes(">"), readsFile: pendingRedirection.value.includes("<") };
      current.redirections.push(entry);
      redirections.push(entry);
      pendingRedirection = null;
    } else current.argv.push(token.value);
  }
  if (pendingRedirection) return invalid(`Redirection '${pendingRedirection.value}' has no target.`, lexical);
  finalize(current, subcommands);
  if (subcommands.length > MAX_SUBCOMMANDS) return invalid(`Command contains more than ${MAX_SUBCOMMANDS} subcommands.`, lexical);
  const unsupported = findUnsupportedStructure(subcommands, dialect, operators);
  return {
    parseable: unsupported.length === 0,
    reason: unsupported[0] || "",
    tokens: lexical.tokens,
    subcommands,
    operators,
    redirections,
    dynamicReasons: Array.from(new Set([...lexical.dynamicReasons, ...unsupported])),
    hasDynamicSyntax: lexical.dynamicReasons.length > 0 || unsupported.length > 0
  };
}

function tokenize(text, dialect) {
  const tokens = [];
  const dynamicReasons = [];
  let word = "";
  let quote = "";
  let escaped = false;
  const pushWord = () => { if (word.length) { tokens.push({ type: "word", value: word }); word = ""; } };
  for (let index = 0; index < text.length; index++) {
    const character = text[index];
    const next = text[index + 1] || "";
    if (escaped) { word += character; escaped = false; continue; }
    if (quote) {
      if (character === quote) { quote = ""; continue; }
      if ((dialect === "posix" && quote === '"' && character === "\\") || (dialect === "powershell" && character === "`")) { escaped = true; continue; }
      if (quote !== "'" && character === "$" && next === "(") dynamicReasons.push("Command substitution is present.");
      if (quote !== "'" && character === "$" && /[A-Za-z_{]/.test(next)) dynamicReasons.push("Dynamic shell variable expansion is present.");
      if (dialect === "posix" && quote === '"' && character === "`") dynamicReasons.push("Backtick command substitution is present.");
      word += character;
      continue;
    }
    if ((dialect !== "cmd" && ["'", '"'].includes(character)) || (dialect === "cmd" && character === '"')) { quote = character; continue; }
    if ((dialect === "posix" && character === "\\") || (dialect === "cmd" && character === "^") || (dialect === "powershell" && character === "`")) { escaped = true; continue; }
    if (dialect === "posix" && ["<", ">"].includes(character) && next === "(") dynamicReasons.push("Process substitution is present.");
    if (dialect === "posix" && character === "<" && next === "<") dynamicReasons.push("Heredoc or here-string syntax requires approval.");
    if (/\s/.test(character)) { pushWord(); if (character === "\n" || character === "\r") pushStructuralToken(tokens, ";"); continue; }
    const structural = structuralToken(text, index, word);
    if (structural) {
      if (structural.consumeWord) word = ""; else pushWord();
      tokens.push(structural.token);
      index += structural.length - 1;
      continue;
    }
    if (character === "`" && dialect === "posix") dynamicReasons.push("Backtick command substitution is present.");
    if (character === "$" && (["(", "{"].includes(next) || /[A-Za-z_]/.test(next))) dynamicReasons.push("Dynamic shell expansion is present.");
    if (dialect === "cmd" && (character === "%" || character === "!")) dynamicReasons.push("Dynamic command-environment expansion is present.");
    word += character;
  }
  if (quote) return { parseable: false, reason: "Command contains an unterminated quote.", tokens, dynamicReasons };
  if (escaped) return { parseable: false, reason: "Command ends with an incomplete escape.", tokens, dynamicReasons };
  pushWord();
  return { parseable: true, reason: "", tokens, dynamicReasons };
}

function structuralToken(text, index, word) {
  const remaining = text.slice(index);
  const merge = remaining.match(/^(\d*)>&(\d+)/);
  if (merge && (!word || word === merge[1])) return { token: { type: "redirection", value: merge[0], mergeOnly: true }, length: merge[0].length, consumeWord: Boolean(word) };
  const redirect = remaining.match(/^(\d*)(>>|>|<)/);
  if (redirect && (!word || word === redirect[1])) return { token: { type: "redirection", value: redirect[0], mergeOnly: false }, length: redirect[0].length, consumeWord: Boolean(word) };
  for (const operator of ["&&", "||", "|", ";", "&"]) if (remaining.startsWith(operator)) return { token: { type: "operator", value: operator }, length: operator.length, consumeWord: false };
  return null;
}

function pushStructuralToken(tokens, value) { if (tokens.at(-1)?.type !== "operator") tokens.push({ type: "operator", value }); }
function createSubcommand(precedingOperator) { return { precedingOperator, argv: [], redirections: [] }; }
function finalize(command, target) { if (command.argv.length || command.redirections.length) target.push({ ...command, text: command.argv.join(" ") }); }
function findUnsupportedStructure(commands, dialect, operators = []) {
  const unsupported = [];
  const controlWords = dialect === "powershell" ? new Set(["foreach", "for", "while", "do", "switch", "try", "trap", "function", "class"]) : new Set(["for", "while", "until", "case", "select", "function"]);
  for (const command of commands) {
    const executable = String(command.argv[0] || "").toLowerCase();
    if (controlWords.has(executable)) unsupported.push(`Control-flow construct '${executable}' requires approval.`);
    if (["eval", "invoke-expression", "iex"].includes(executable)) unsupported.push(`Dynamic evaluation command '${executable}' requires approval.`);
  }
  if (operators.includes("&")) unsupported.push("Background command execution requires approval.");
  return unsupported;
}
function invalid(reason, partial = {}) { return { parseable: false, reason, tokens: partial.tokens || [], subcommands: [], operators: [], redirections: [], dynamicReasons: [reason], hasDynamicSyntax: true }; }

module.exports = { MAX_COMMAND_CHARS, MAX_SUBCOMMANDS, readShellStructure };
