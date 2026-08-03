"use strict";

const fs = require("fs");

/**
 * Source-derived Kotlin ABI export expectations.
 *
 * Expectations are read from Kotlin sources before compilation, independently of the output
 * JAR. Only public/default-public top-level classifiers are Java-resolvable type contracts.
 */

function collectExpectedKotlinExports(files) {
  const exports = new Set();
  for (const file of files || []) {
    let source = "";
    try { source = fs.readFileSync(file, "utf8"); } catch (_error) { continue; }
    const scrubbed = removeCommentsAndStrings(source);
    const packageName = /^\s*package\s+([A-Za-z_][\w.]*)/m.exec(scrubbed)?.[1] || "";
    let depth = 0;
    for (const line of scrubbed.split(/\r?\n/)) {
      if (depth === 0 && !/\bprivate\b|\bprotected\b|\binternal\b/.test(line)) {
        const declaration = /^\s*(?:(?:public|expect|actual|data|sealed|open|abstract|enum|annotation|value|fun)\s+)*(?:class|interface|object)\s+([A-Za-z_]\w*)\b/.exec(line);
        if (declaration) exports.add(packageName ? `${packageName}.${declaration[1]}` : declaration[1]);
      }
      depth += count(line, "{") - count(line, "}");
      depth = Math.max(0, depth);
    }
  }
  return Array.from(exports).sort();
}

/**
 * Hide non-code Kotlin tokens while preserving line boundaries and code braces.
 * A single lexical pass is required because strings and comments may contain each
 * other's delimiters, and Kotlin block comments may nest.
 */
function removeCommentsAndStrings(source) {
  const input = String(source || "");
  const output = Array.from(input, (character) => character === "\r" || character === "\n" ? character : " ");
  const modes = [{ type: "code" }];
  let index = 0;

  while (index < input.length) {
    const mode = modes[modes.length - 1];
    const character = input[index];
    const next = input[index + 1];

    if (mode.type === "code") {
      if (input.startsWith("//", index)) {
        modes.push({ type: "line-comment" });
        index += 2;
      } else if (input.startsWith("/*", index)) {
        modes.push({ type: "block-comment", depth: 1 });
        index += 2;
      } else if (input.startsWith('"""', index)) {
        modes.push({ type: "raw-string" });
        index += 3;
      } else if (character === '"') {
        modes.push({ type: "string" });
        index += 1;
      } else if (character === "'") {
        modes.push({ type: "character" });
        index += 1;
      } else if (character === "`") {
        modes.push({ type: "backtick-identifier" });
        index += 1;
      } else {
        output[index] = character;
        index += 1;
      }
      continue;
    }

    if (mode.type === "line-comment") {
      if (character === "\r" || character === "\n") modes.pop();
      else index += 1;
      continue;
    }

    if (mode.type === "block-comment") {
      if (input.startsWith("/*", index)) {
        mode.depth += 1;
        index += 2;
      } else if (input.startsWith("*/", index)) {
        mode.depth -= 1;
        index += 2;
        if (mode.depth === 0) modes.pop();
      } else {
        index += 1;
      }
      continue;
    }

    if (mode.type === "string") {
      if (character === "\\") {
        index += Math.min(2, input.length - index);
      } else if (character === "$" && next === "{") {
        modes.push({ type: "template-expression", depth: 1 });
        index += 2;
      } else if (character === '"') {
        modes.pop();
        index += 1;
      } else {
        index += 1;
      }
      continue;
    }

    if (mode.type === "raw-string") {
      if (character === "$" && next === "{") {
        modes.push({ type: "template-expression", depth: 1 });
        index += 2;
      } else if (input.startsWith('"""', index)) {
        modes.pop();
        index += 3;
      } else {
        index += 1;
      }
      continue;
    }

    if (mode.type === "template-expression") {
      if (input.startsWith("//", index)) {
        modes.push({ type: "line-comment" });
        index += 2;
      } else if (input.startsWith("/*", index)) {
        modes.push({ type: "block-comment", depth: 1 });
        index += 2;
      } else if (input.startsWith('"""', index)) {
        modes.push({ type: "raw-string" });
        index += 3;
      } else if (character === '"') {
        modes.push({ type: "string" });
        index += 1;
      } else if (character === "'") {
        modes.push({ type: "character" });
        index += 1;
      } else if (character === "`") {
        modes.push({ type: "backtick-identifier" });
        index += 1;
      } else if (character === "{") {
        mode.depth += 1;
        index += 1;
      } else if (character === "}") {
        mode.depth -= 1;
        index += 1;
        if (mode.depth === 0) modes.pop();
      } else {
        index += 1;
      }
      continue;
    }

    if (mode.type === "character") {
      if (character === "\\") index += Math.min(2, input.length - index);
      else {
        index += 1;
        if (character === "'") modes.pop();
      }
      continue;
    }

    if (mode.type === "backtick-identifier") {
      index += 1;
      if (character === "`") modes.pop();
    }
  }

  return output.join("");
}
function count(value, token) {
  return String(value || "").split(token).length - 1;
}

module.exports = { collectExpectedKotlinExports };
