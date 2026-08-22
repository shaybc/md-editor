// JSONPath Tester evaluator.
(function(root) {
  "use strict";

  function parseJsonDocument(input) {
    try {
      return JSON.parse(String(input || ""));
    } catch (error) {
      throw new Error(`Invalid JSON: ${error.message}`);
    }
  }

  function readIdentifier(path, start) {
    let index = start;
    while (index < path.length && !".[".includes(path[index])) index += 1;
    return { value: path.slice(start, index), index };
  }

  function readBracket(path, start) {
    let quote = "";
    let index = start + 1;
    while (index < path.length) {
      const character = path[index];
      if (quote) {
        if (character === "\\" && index + 1 < path.length) {
          index += 2;
          continue;
        }
        if (character === quote) quote = "";
      } else if (character === "'" || character === '"') {
        quote = character;
      } else if (character === "]") {
        return { value: path.slice(start + 1, index), index: index + 1 };
      }
      index += 1;
    }
    throw new Error("Invalid JSONPath: missing closing bracket.");
  }

  function unquote(value) {
    const trimmed = String(value || "").trim();
    if ((trimmed.startsWith("'") && trimmed.endsWith("'")) || (trimmed.startsWith('"') && trimmed.endsWith('"'))) {
      return trimmed.slice(1, -1).replace(/\\(['"\\])/g, "$1");
    }
    return trimmed;
  }

  function parseUnion(content) {
    return content.split(",").map((part) => unquote(part)).filter((part) => part !== "");
  }

  function parsePath(path) {
    const source = String(path || "$").trim() || "$";
    const tokens = [];
    let index = source.startsWith("$") ? 1 : 0;
    while (index < source.length) {
      if (source[index] === ".") {
        if (source[index + 1] === ".") {
          const identifier = readIdentifier(source, index + 2);
          if (!identifier.value) throw new Error("Invalid JSONPath: recursive selector needs a property name.");
          tokens.push({ type: "recursive-property", name: identifier.value });
          index = identifier.index;
        } else if (source[index + 1] === "*") {
          tokens.push({ type: "wildcard" });
          index += 2;
        } else {
          const identifier = readIdentifier(source, index + 1);
          if (!identifier.value) throw new Error("Invalid JSONPath: dot selector needs a property name.");
          tokens.push({ type: "property", name: identifier.value });
          index = identifier.index;
        }
      } else if (source[index] === "[") {
        const bracket = readBracket(source, index);
        const content = bracket.value.trim();
        if (content === "*") tokens.push({ type: "wildcard" });
        else if (content.startsWith("?(") && content.endsWith(")")) tokens.push({ type: "filter", expression: content.slice(2, -1).trim() });
        else if (content.includes(":")) tokens.push({ type: "slice", parts: content.split(":").map((part) => part.trim()) });
        else if (content.includes(",")) tokens.push({ type: "union", values: parseUnion(content) });
        else if (/^-?\d+$/.test(content)) tokens.push({ type: "index", index: Number(content) });
        else tokens.push({ type: "property", name: unquote(content) });
        index = bracket.index;
      } else {
        const identifier = readIdentifier(source, index);
        if (!identifier.value) throw new Error(`Invalid JSONPath near "${source.slice(index)}".`);
        tokens.push({ type: "property", name: identifier.value });
        index = identifier.index;
      }
    }
    return tokens;
  }

  function readProperty(value, propertyPath) {
    return String(propertyPath || "").split(".").reduce((current, part) => {
      if (current == null || part === "") return undefined;
      return current[part];
    }, value);
  }

  function parseLiteral(source) {
    const value = String(source || "").trim();
    if ((value.startsWith("'") && value.endsWith("'")) || (value.startsWith('"') && value.endsWith('"'))) return unquote(value);
    if (value === "true") return true;
    if (value === "false") return false;
    if (value === "null") return null;
    if (/^-?\d+(?:\.\d+)?$/.test(value)) return Number(value);
    return value;
  }

  function compareValues(left, operator, right) {
    if (operator === "==") return left === right;
    if (operator === "!=") return left !== right;
    if (operator === ">") return left > right;
    if (operator === "<") return left < right;
    if (operator === ">=") return left >= right;
    if (operator === "<=") return left <= right;
    return false;
  }

  function matchesFilter(value, expression) {
    const comparison = String(expression || "").match(/^@\.([A-Za-z0-9_$.-]+)\s*(==|!=|>=|<=|>|<)\s*(.+)$/);
    if (comparison) {
      return compareValues(readProperty(value, comparison[1]), comparison[2], parseLiteral(comparison[3]));
    }
    const truthyPath = String(expression || "").match(/^@\.([A-Za-z0-9_$.-]+)$/);
    return truthyPath ? Boolean(readProperty(value, truthyPath[1])) : false;
  }

  function getChildren(value) {
    if (Array.isArray(value)) return value;
    if (value && typeof value === "object") return Object.keys(value).map((key) => value[key]);
    return [];
  }

  function applyProperty(values, name) {
    return values.flatMap((value) => {
      if (value == null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, name)) return [];
      return [value[name]];
    });
  }

  function applyIndex(values, index) {
    return values.flatMap((value) => {
      if (!Array.isArray(value)) return [];
      const resolvedIndex = index < 0 ? value.length + index : index;
      return resolvedIndex >= 0 && resolvedIndex < value.length ? [value[resolvedIndex]] : [];
    });
  }

  function applySlice(values, parts) {
    return values.flatMap((value) => {
      if (!Array.isArray(value)) return [];
      const start = parts[0] === "" ? 0 : Number(parts[0]);
      const end = parts[1] === "" || parts[1] == null ? value.length : Number(parts[1]);
      const step = Math.max(1, Number(parts[2] || 1) || 1);
      const result = [];
      for (let index = start < 0 ? value.length + start : start; index < (end < 0 ? value.length + end : end); index += step) {
        if (index >= 0 && index < value.length) result.push(value[index]);
      }
      return result;
    });
  }

  function collectRecursiveProperty(value, name, results) {
    if (value && typeof value === "object") {
      if (Object.prototype.hasOwnProperty.call(value, name)) results.push(value[name]);
      getChildren(value).forEach((child) => collectRecursiveProperty(child, name, results));
    }
  }

  function applyToken(values, token) {
    if (token.type === "property") return applyProperty(values, token.name);
    if (token.type === "index") return applyIndex(values, token.index);
    if (token.type === "wildcard") return values.flatMap(getChildren);
    if (token.type === "union") return token.values.flatMap((value) => /^-?\d+$/.test(value) ? applyIndex(values, Number(value)) : applyProperty(values, value));
    if (token.type === "slice") return applySlice(values, token.parts);
    if (token.type === "filter") return values.flatMap((value) => getChildren(value).filter((child) => matchesFilter(child, token.expression)));
    if (token.type === "recursive-property") {
      const results = [];
      values.forEach((value) => collectRecursiveProperty(value, token.name, results));
      return results;
    }
    return values;
  }

  function evaluateJsonPath(jsonInput, pathInput) {
    const documentValue = parseJsonDocument(jsonInput);
    const tokens = parsePath(pathInput);
    return tokens.reduce(applyToken, [documentValue]);
  }

  function formatJsonPathResult(result) {
    return JSON.stringify(result, null, 2);
  }

  root.registerMarkdownViewerJsonPathEvaluator = function registerMarkdownViewerJsonPathEvaluator(app) {
    const api = { evaluateJsonPath, formatJsonPathResult, parsePath };
    app?.registerModule?.("jsonPathEvaluator", api);
    return api;
  };

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { evaluateJsonPath, formatJsonPathResult, parsePath };
  }
})(typeof window !== "undefined" ? window : globalThis);
