(function(global) {
  "use strict";

  const TYPE_KEYWORDS = new Set(["class", "interface", "record", "enum"]);
  const MODIFIERS = new Set([
    "public", "protected", "private", "static", "final", "abstract", "native", "synchronized",
    "transient", "volatile", "strictfp", "default", "sealed", "non-sealed"
  ]);
  const LSP_KIND_NAMES = Object.freeze({
    4: "package", 5: "class", 6: "method", 7: "field", 8: "field", 9: "constructor",
    10: "enum", 11: "interface", 12: "method", 13: "field", 14: "field", 22: "enum-member", 23: "record"
  });

  function maskNonCode(source) {
    const chars = Array.from(String(source || ""));
    let state = "code";
    for (let index = 0; index < chars.length; index += 1) {
      const current = chars[index];
      const next = chars[index + 1];
      const third = chars[index + 2];
      if (state === "code") {
        if (current === "/" && next === "/") { chars[index] = chars[index + 1] = " "; index += 1; state = "line"; }
        else if (current === "/" && next === "*") { chars[index] = chars[index + 1] = " "; index += 1; state = "block"; }
        else if (current === '"' && next === '"' && third === '"') { chars[index] = chars[index + 1] = chars[index + 2] = " "; index += 2; state = "text"; }
        else if (current === '"') { chars[index] = " "; state = "string"; }
        else if (current === "'") { chars[index] = " "; state = "char"; }
      } else if (state === "line") {
        if (current === "\n") state = "code";
        else chars[index] = " ";
      } else if (state === "block") {
        if (current === "*" && next === "/") { chars[index] = chars[index + 1] = " "; index += 1; state = "code"; }
        else if (current !== "\n" && current !== "\r") chars[index] = " ";
      } else if (state === "text") {
        if (current === '"' && next === '"' && third === '"') { chars[index] = chars[index + 1] = chars[index + 2] = " "; index += 2; state = "code"; }
        else if (current !== "\n" && current !== "\r") chars[index] = " ";
      } else {
        if (current === "\\") {
          chars[index] = " ";
          if (index + 1 < chars.length && chars[index + 1] !== "\n") chars[++index] = " ";
        } else if ((state === "string" && current === '"') || (state === "char" && current === "'")) {
          chars[index] = " "; state = "code";
        } else if (current !== "\n" && current !== "\r") chars[index] = " ";
      }
    }
    return chars.join("");
  }

  function tokenize(source) {
    const tokens = [];
    const matcher = /[A-Za-z_$][\w$]*|\.\.\.|->|::|==|!=|<=|>=|&&|\|\||[{}()[\];,@.<>?=:+*\-\/&|!~^%]/g;
    let match;
    while ((match = matcher.exec(source))) tokens.push({ text: match[0], start: match.index, end: matcher.lastIndex });
    return tokens;
  }

  function buildPairMap(tokens, openText, closeText) {
    const stack = [];
    const pairs = new Map();
    tokens.forEach((token, index) => {
      if (token.text === openText) stack.push(index);
      else if (token.text === closeText && stack.length) {
        const open = stack.pop();
        pairs.set(open, index);
      }
    });
    return pairs;
  }

  function createPositionResolver(source) {
    const lineStarts = [0];
    for (let index = 0; index < source.length; index += 1) if (source[index] === "\n") lineStarts.push(index + 1);
    return function position(offset) {
      let low = 0;
      let high = lineStarts.length - 1;
      while (low <= high) {
        const middle = (low + high) >> 1;
        if (lineStarts[middle] <= offset) low = middle + 1;
        else high = middle - 1;
      }
      const line = Math.max(0, high);
      return { line, character: Math.max(0, offset - lineStarts[line]) };
    };
  }

  function createNode(kind, name, detail, startToken, endToken, position, children = []) {
    const start = position(startToken?.start || 0);
    const end = position(endToken?.end || startToken?.end || 0);
    return {
      id: `${kind}:${start.line}:${start.character}:${name}`,
      name: String(name || ""),
      detail: String(detail || ""),
      kind,
      range: { start, end },
      selectionRange: { start, end: position(startToken?.end || startToken?.start || 0) },
      children
    };
  }

  function isIdentifier(token) {
    return !!token && /^[A-Za-z_$][\w$]*$/.test(token.text);
  }

  function compactTokens(tokens) {
    return tokens.map((token) => token.text).join(" ")
      .replace(/\s+([,.;)\]>])/g, "$1")
      .replace(/([(<\[.@])\s+/g, "$1")
      .replace(/\s+\.\s+/g, ".")
      .replace(/\s+/g, " ").trim();
  }

  function stripLeadingMetadata(tokens) {
    let index = 0;
    while (index < tokens.length) {
      if (MODIFIERS.has(tokens[index].text)) { index += 1; continue; }
      if (tokens[index].text === "@") {
        index += 1;
        while (index < tokens.length && (isIdentifier(tokens[index]) || tokens[index].text === ".")) index += 1;
        if (tokens[index]?.text === "(") {
          let depth = 1;
          index += 1;
          while (index < tokens.length && depth) {
            if (tokens[index].text === "(") depth += 1;
            if (tokens[index].text === ")") depth -= 1;
            index += 1;
          }
        }
        continue;
      }
      break;
    }
    return tokens.slice(index);
  }

  function findTopLevelToken(tokens, text) {
    let paren = 0;
    let angle = 0;
    let bracket = 0;
    for (let index = 0; index < tokens.length; index += 1) {
      const value = tokens[index].text;
      if (value === "(" ) paren += 1;
      else if (value === ")") paren = Math.max(0, paren - 1);
      else if (value === "<") angle += 1;
      else if (value === ">") angle = Math.max(0, angle - 1);
      else if (value === "[") bracket += 1;
      else if (value === "]") bracket = Math.max(0, bracket - 1);
      if (value === text && paren === 0 && angle === 0 && bracket === 0) return index;
    }
    return -1;
  }

  function parseCallable(header, ownerName, position) {
    const openParen = header.findIndex((token) => token.text === "(");
    const equals = header.findIndex((token) => token.text === "=");
    if (openParen < 0 || (equals >= 0 && equals < openParen)) return null;
    let nameIndex = openParen - 1;
    while (nameIndex >= 0 && !isIdentifier(header[nameIndex])) nameIndex -= 1;
    if (nameIndex < 0) return null;
    const nameToken = header[nameIndex];
    if (["if", "for", "while", "switch", "catch", "new"].includes(nameToken.text)) return null;
    let closeParen = openParen;
    let depth = 0;
    for (; closeParen < header.length; closeParen += 1) {
      if (header[closeParen].text === "(") depth += 1;
      if (header[closeParen].text === ")" && --depth === 0) break;
    }
    const parameters = compactTokens(header.slice(openParen + 1, closeParen));
    const prefix = stripLeadingMetadata(header.slice(0, nameIndex));
    const isConstructor = nameToken.text === ownerName;
    return createNode(
      isConstructor ? "constructor" : "method",
      `${nameToken.text}(${parameters})`,
      isConstructor ? "constructor" : compactTokens(prefix),
      nameToken,
      header[Math.min(closeParen, header.length - 1)] || nameToken,
      position
    );
  }

  function parseFields(header, position) {
    const clean = stripLeadingMetadata(header);
    if (!clean.length) return [];
    const segments = [];
    let start = 0;
    let angle = 0;
    let bracket = 0;
    let paren = 0;
    for (let index = 0; index <= clean.length; index += 1) {
      const value = clean[index]?.text;
      if (value === "<") angle += 1;
      else if (value === ">") angle = Math.max(0, angle - 1);
      else if (value === "[") bracket += 1;
      else if (value === "]") bracket = Math.max(0, bracket - 1);
      else if (value === "(") paren += 1;
      else if (value === ")") paren = Math.max(0, paren - 1);
      if ((value === "," && angle === 0 && bracket === 0 && paren === 0) || index === clean.length) {
        segments.push(clean.slice(start, index));
        start = index + 1;
      }
    }
    let declaredType = "";
    return segments.flatMap((segment, segmentIndex) => {
      const equals = segment.findIndex((token) => token.text === "=");
      const declaration = equals >= 0 ? segment.slice(0, equals) : segment;
      let nameIndex = declaration.length - 1;
      while (nameIndex >= 0 && !isIdentifier(declaration[nameIndex])) nameIndex -= 1;
      if (nameIndex < 0) return [];
      if (segmentIndex === 0) declaredType = compactTokens(declaration.slice(0, nameIndex));
      const nameToken = declaration[nameIndex];
      return [createNode("field", nameToken.text, declaredType, nameToken, nameToken, position)];
    });
  }

  function parseJava(source) {
    const original = String(source || "");
    const masked = maskNonCode(original);
    const tokens = tokenize(masked);
    const braces = buildPairMap(tokens, "{", "}");
    const position = createPositionResolver(original);

    function findTypeName(keywordIndex) {
      for (let index = keywordIndex + 1; index < tokens.length; index += 1) if (isIdentifier(tokens[index])) return index;
      return -1;
    }

    function findOpenBrace(fromIndex, limit = tokens.length) {
      for (let index = fromIndex; index < limit; index += 1) {
        if (tokens[index].text === "{") return index;
        if (tokens[index].text === ";") return -1;
      }
      return -1;
    }

    function parseEnumConstants(startIndex, endIndex) {
      const nodes = [];
      let segmentStart = startIndex;
      let paren = 0;
      for (let index = startIndex; index <= endIndex; index += 1) {
        if (tokens[index]?.text === "{") {
          const close = braces.get(index);
          if (close !== undefined && close <= endIndex) { index = close; continue; }
        }
        if (tokens[index]?.text === "(") paren += 1;
        else if (tokens[index]?.text === ")") paren = Math.max(0, paren - 1);
        if ((tokens[index]?.text === "," && paren === 0) || index === endIndex) {
          const segment = stripLeadingMetadata(tokens.slice(segmentStart, index));
          const nameToken = segment.find(isIdentifier);
          if (nameToken) nodes.push(createNode("enum-member", nameToken.text, "enum constant", nameToken, nameToken, position));
          segmentStart = index + 1;
        }
      }
      return nodes;
    }

    function parseMembers(startIndex, endIndex, ownerName, ownerKind) {
      const children = [];
      let segmentStart = startIndex;
      let index = startIndex;
      if (ownerKind === "enum") {
        let separator = -1;
        for (let cursor = startIndex; cursor < endIndex; cursor += 1) {
          if (tokens[cursor].text === "{") {
            const close = braces.get(cursor);
            if (close !== undefined && close < endIndex) { cursor = close; continue; }
          }
          if (tokens[cursor].text === ";") { separator = cursor; break; }
        }
        if (separator >= 0) {
          children.push(...parseEnumConstants(startIndex, separator));
          segmentStart = separator + 1;
          index = segmentStart;
        }
      }
      while (index < endIndex) {
        const token = tokens[index];
        if (TYPE_KEYWORDS.has(token.text)) {
          const nested = parseType(index, endIndex);
          if (nested) {
            children.push(nested.node);
            index = nested.nextIndex;
            segmentStart = index;
            continue;
          }
        }
        if (token.text === "{") {
          const close = braces.get(index);
          const header = tokens.slice(segmentStart, index);
          const callable = parseCallable(header, ownerName, position);
          if (callable) children.push(callable);
          else if (header.some((headerToken) => headerToken.text === "=")) children.push(...parseFields(header, position));
          if (close === undefined || close > endIndex) break;
          index = close + 1;
          segmentStart = index;
          continue;
        }
        if (token.text === ";") {
          const header = tokens.slice(segmentStart, index);
          const callable = parseCallable(header, ownerName, position);
          if (callable) children.push(callable);
          else children.push(...parseFields(header, position));
          index += 1;
          segmentStart = index;
          continue;
        }
        index += 1;
      }
      return children;
    }

    function parseType(keywordIndex, limit) {
      const nameIndex = findTypeName(keywordIndex);
      if (nameIndex < 0) return null;
      const openBrace = findOpenBrace(nameIndex + 1, limit);
      if (openBrace < 0) return null;
      const matchedCloseBrace = braces.get(openBrace);
      const hasMatchedCloseBrace = matchedCloseBrace !== undefined && matchedCloseBrace <= limit;
      const closeBrace = hasMatchedCloseBrace ? matchedCloseBrace : limit;
      const keyword = tokens[keywordIndex].text;
      const nameToken = tokens[nameIndex];
      const children = [];
      if (keyword === "record") {
        const componentOpen = tokens.findIndex((token, index) => index > nameIndex && index < openBrace && token.text === "(");
        if (componentOpen >= 0) {
          let componentClose = componentOpen + 1;
          let depth = 1;
          for (; componentClose < openBrace && depth; componentClose += 1) {
            if (tokens[componentClose].text === "(") depth += 1;
            else if (tokens[componentClose].text === ")") depth -= 1;
          }
          const componentTokens = tokens.slice(componentOpen + 1, Math.max(componentOpen + 1, componentClose - 1));
          let componentStart = 0;
          let angleDepth = 0;
          for (let componentIndex = 0; componentIndex <= componentTokens.length; componentIndex += 1) {
            if (componentTokens[componentIndex]?.text === "<") angleDepth += 1;
            else if (componentTokens[componentIndex]?.text === ">") angleDepth = Math.max(0, angleDepth - 1);
            if ((componentTokens[componentIndex]?.text === "," && angleDepth === 0) || componentIndex === componentTokens.length) {
              const component = stripLeadingMetadata(componentTokens.slice(componentStart, componentIndex));
              let componentNameIndex = component.length - 1;
              while (componentNameIndex >= 0 && !isIdentifier(component[componentNameIndex])) componentNameIndex -= 1;
              if (componentNameIndex >= 0) {
                const componentName = component[componentNameIndex];
                children.push(createNode("field", componentName.text, compactTokens(component.slice(0, componentNameIndex)), componentName, componentName, position));
              }
              componentStart = componentIndex + 1;
            }
          }
        }
      }
      children.push(...parseMembers(openBrace + 1, closeBrace, nameToken.text, keyword));
      const endToken = hasMatchedCloseBrace ? tokens[closeBrace] : (tokens[Math.max(nameIndex, limit - 1)] || nameToken);
      const node = createNode(keyword, nameToken.text, keyword, nameToken, endToken, position, children);
      return { node, nextIndex: hasMatchedCloseBrace ? closeBrace + 1 : limit };
    }

    const roots = [];
    let packageName = "";
    let packageToken = null;
    const packageIndex = tokens.findIndex((token) => token.text === "package");
    if (packageIndex >= 0) {
      const semicolon = tokens.findIndex((token, index) => index > packageIndex && token.text === ";");
      if (semicolon > packageIndex) {
        packageName = tokens.slice(packageIndex + 1, semicolon).map((token) => token.text).join("").trim();
        packageToken = tokens[packageIndex + 1] || tokens[packageIndex];
      }
    }
    for (let index = 0; index < tokens.length;) {
      if (TYPE_KEYWORDS.has(tokens[index].text)) {
        const parsed = parseType(index, tokens.length);
        if (parsed) { roots.push(parsed.node); index = parsed.nextIndex; continue; }
      }
      index += 1;
    }
    if (!packageName) return roots;
    return [createNode("package", packageName, "package", packageToken, packageToken, position, roots)];
  }

  function normalizeDocumentSymbols(symbols, source) {
    let counter = 0;
    function normalize(symbol) {
      const range = symbol?.range || symbol?.selectionRange || { start: { line: 0, character: 0 }, end: { line: 0, character: 0 } };
      const selectionRange = symbol?.selectionRange || range;
      const kind = LSP_KIND_NAMES[symbol?.kind] || "symbol";
      return {
        id: `lsp:${counter++}:${kind}:${symbol?.name || ""}`,
        name: String(symbol?.name || ""),
        detail: String(symbol?.detail || kind),
        kind,
        range,
        selectionRange,
        children: Array.isArray(symbol?.children) ? symbol.children.map(normalize) : []
      };
    }
    const normalized = (Array.isArray(symbols) ? symbols : []).map(normalize);
    const local = parseJava(source);
    const localPackage = local.find((node) => node.kind === "package");
    if (!localPackage || normalized.some((node) => node.kind === "package")) return normalized;
    return [{ ...localPackage, children: normalized }];
  }

  /** Create the Java-specific adapter consumed by the generic Outline panel. */
  function registerMarkdownViewerJavaOutlineLanguage(app) {
    const api = {
      id: "java",
      supports(path, tab) { return tab?.parseAsLanguageId === "java" || /\.java$/i.test(String(path || "")); },
      parse: parseJava,
      normalizeDocumentSymbols
    };
    app.registerModule?.("javaOutlineLanguage", api);
    return api;
  }

  global.registerMarkdownViewerJavaOutlineLanguage = registerMarkdownViewerJavaOutlineLanguage;
})(typeof window !== "undefined" ? window : globalThis);
