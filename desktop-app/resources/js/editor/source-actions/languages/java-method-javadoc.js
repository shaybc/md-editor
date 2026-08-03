// Local Java method resolution and signature-derived Javadoc generation.
(function(global) {
  "use strict";

  const METHOD_MODIFIERS = new Set([
    "public", "protected", "private", "static", "final", "abstract", "synchronized",
    "native", "strictfp", "default"
  ]);
  const NON_METHOD_NAMES = new Set([
    "if", "for", "while", "switch", "catch", "try", "synchronized", "new", "return", "throw"
  ]);

  function maskNonCode(source) {
    const chars = Array.from(String(source || ""));
    let state = "code";
    for (let index = 0; index < chars.length; index += 1) {
      const current = chars[index];
      const next = chars[index + 1];
      const third = chars[index + 2];
      if (state === "code") {
        if (current === "/" && next === "/") {
          chars[index] = chars[index + 1] = " "; index += 1; state = "line";
        } else if (current === "/" && next === "*") {
          chars[index] = chars[index + 1] = " "; index += 1; state = "block";
        } else if (current === '"' && next === '"' && third === '"') {
          chars[index] = chars[index + 1] = chars[index + 2] = " "; index += 2; state = "text";
        } else if (current === '"') {
          chars[index] = " "; state = "string";
        } else if (current === "'") {
          chars[index] = " "; state = "character";
        }
      } else if (state === "line") {
        if (current === "\n") state = "code";
        else chars[index] = " ";
      } else if (state === "block") {
        if (current === "*" && next === "/") {
          chars[index] = chars[index + 1] = " "; index += 1; state = "code";
        } else if (current !== "\n" && current !== "\r") chars[index] = " ";
      } else if (state === "text") {
        if (current === '"' && next === '"' && third === '"') {
          chars[index] = chars[index + 1] = chars[index + 2] = " "; index += 2; state = "code";
        } else if (current !== "\n" && current !== "\r") chars[index] = " ";
      } else if (current === "\\") {
        chars[index] = " ";
        if (index + 1 < chars.length && chars[index + 1] !== "\n") chars[++index] = " ";
      } else if ((state === "string" && current === '"') || (state === "character" && current === "'")) {
        chars[index] = " "; state = "code";
      } else if (current !== "\n" && current !== "\r") chars[index] = " ";
    }
    return chars.join("");
  }

  function tokenize(source) {
    const tokens = [];
    const matcher = /[A-Za-z_$][\w$]*|\.\.\.|->|::|[{}()[\];,@.<>?=:+*\-\/&|!~^%]/g;
    let match;
    while ((match = matcher.exec(source))) tokens.push({ text: match[0], start: match.index, end: matcher.lastIndex });
    return tokens;
  }

  function buildPairMap(tokens, openText, closeText) {
    const stack = [];
    const pairs = new Map();
    tokens.forEach((token, index) => {
      if (token.text === openText) stack.push(index);
      else if (token.text === closeText && stack.length) pairs.set(stack.pop(), index);
    });
    return pairs;
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

  function skipAnnotation(tokens, startIndex) {
    let index = startIndex + 1;
    if (isIdentifier(tokens[index])) index += 1;
    while (tokens[index]?.text === "." && isIdentifier(tokens[index + 1])) index += 2;
    if (tokens[index]?.text !== "(") return index;
    let depth = 0;
    for (; index < tokens.length; index += 1) {
      if (tokens[index].text === "(") depth += 1;
      else if (tokens[index].text === ")" && --depth === 0) return index + 1;
    }
    return index;
  }

  function stripLeadingMetadata(tokens, parenthesisPairs) {
    let index = 0;
    while (index < tokens.length) {
      if (METHOD_MODIFIERS.has(tokens[index].text) || tokens[index].text === "final") index += 1;
      else if (tokens[index].text === "@") index = skipAnnotation(tokens, index, parenthesisPairs);
      else break;
    }
    return tokens.slice(index);
  }

  function splitTopLevel(tokens) {
    const segments = [];
    let start = 0;
    let angle = 0;
    let bracket = 0;
    let parenthesis = 0;
    for (let index = 0; index <= tokens.length; index += 1) {
      const text = tokens[index]?.text;
      if (text === "<") angle += 1;
      else if (text === ">") angle = Math.max(0, angle - 1);
      else if (text === "[") bracket += 1;
      else if (text === "]") bracket = Math.max(0, bracket - 1);
      else if (text === "(") parenthesis += 1;
      else if (text === ")") parenthesis = Math.max(0, parenthesis - 1);
      if ((text === "," && angle === 0 && bracket === 0 && parenthesis === 0) || index === tokens.length) {
        segments.push(tokens.slice(start, index)); start = index + 1;
      }
    }
    return segments;
  }

  function parseTypeParameters(prefixTokens) {
    if (prefixTokens[0]?.text !== "<") return { names: [], remaining: prefixTokens };
    let depth = 0;
    let closeIndex = -1;
    for (let index = 0; index < prefixTokens.length; index += 1) {
      if (prefixTokens[index].text === "<") depth += 1;
      else if (prefixTokens[index].text === ">" && --depth === 0) { closeIndex = index; break; }
    }
    if (closeIndex < 0) return { names: [], remaining: prefixTokens };
    const names = splitTopLevel(prefixTokens.slice(1, closeIndex)).flatMap((segment) => {
      const name = segment.find(isIdentifier)?.text;
      return name ? [name] : [];
    });
    return { names, remaining: prefixTokens.slice(closeIndex + 1) };
  }

  function parseParameterNames(parameterTokens, parenthesisPairs) {
    return splitTopLevel(parameterTokens).flatMap((segment) => {
      const clean = stripLeadingMetadata(segment, parenthesisPairs);
      for (let index = clean.length - 1; index >= 0; index -= 1) {
        if (isIdentifier(clean[index]) && clean[index].text !== "this") return [clean[index].text];
      }
      return [];
    });
  }

  function findDeclarationBoundary(tokens, nameIndex) {
    for (let index = nameIndex - 1; index >= 0; index -= 1) {
      if (["{", "}", ";"].includes(tokens[index].text)) return index + 1;
    }
    return 0;
  }

  function findMethodTerminal(tokens, closeParenthesisIndex) {
    let angle = 0;
    let bracket = 0;
    for (let index = closeParenthesisIndex + 1; index < tokens.length; index += 1) {
      const text = tokens[index].text;
      if (text === "<") angle += 1;
      else if (text === ">") angle = Math.max(0, angle - 1);
      else if (text === "[") bracket += 1;
      else if (text === "]") bracket = Math.max(0, bracket - 1);
      if (angle === 0 && bracket === 0 && (text === "=" || text === "->")) return null;
      if (angle === 0 && bracket === 0 && (text === "{" || text === ";")) return index;
      if (angle === 0 && bracket === 0 && text === "}") return null;
    }
    return null;
  }

  function parseThrows(tokens) {
    const throwsIndex = tokens.findIndex((token) => token.text === "throws");
    if (throwsIndex < 0) return [];
    return splitTopLevel(tokens.slice(throwsIndex + 1)).map(compactTokens).filter(Boolean);
  }

  function findExistingJavadoc(source, insertionOffset) {
    const before = String(source || "").slice(0, insertionOffset).replace(/\s+$/, "");
    if (!before.endsWith("*/")) return null;
    const start = before.lastIndexOf("/**");
    const ordinaryComment = before.lastIndexOf("/*");
    return start >= 0 && ordinaryComment === start ? { start, end: before.length } : null;
  }

  function createMethodModel(source, cursorOffset) {
    const value = String(source || "");
    const tokens = tokenize(maskNonCode(value));
    const parenthesisPairs = buildPairMap(tokens, "(", ")");
    const bracePairs = buildPairMap(tokens, "{", "}");
    const candidates = [];

    parenthesisPairs.forEach((closeParenthesisIndex, openParenthesisIndex) => {
      const nameIndex = openParenthesisIndex - 1;
      const nameToken = tokens[nameIndex];
      if (!isIdentifier(nameToken) || NON_METHOD_NAMES.has(nameToken.text) || tokens[nameIndex - 1]?.text === "@") return;
      const terminalIndex = findMethodTerminal(tokens, closeParenthesisIndex);
      if (terminalIndex === null) return;
      const declarationStartIndex = findDeclarationBoundary(tokens, nameIndex);
      const prefix = tokens.slice(declarationStartIndex, nameIndex);
      if (!prefix.length || prefix.some((token) => token.text === "=" || token.text === "->")) return;
      const typeParameters = parseTypeParameters(stripLeadingMetadata(prefix, parenthesisPairs));
      const returnType = compactTokens(typeParameters.remaining);
      if (!returnType || ["new", "return", "throw"].includes(typeParameters.remaining[0]?.text)) return;

      const terminal = tokens[terminalIndex];
      const bodyCloseIndex = terminal.text === "{" ? bracePairs.get(terminalIndex) : terminalIndex;
      if (bodyCloseIndex === undefined) return;
      const declarationToken = tokens[declarationStartIndex] || nameToken;
      const declarationLineStart = value.lastIndexOf("\n", Math.max(0, declarationToken.start - 1)) + 1;
      const rangeEnd = tokens[bodyCloseIndex]?.end || terminal.end;
      if (cursorOffset < declarationLineStart || cursorOffset > rangeEnd) return;

      candidates.push({
        name: nameToken.text,
        returnType,
        typeParameters: typeParameters.names,
        parameters: parseParameterNames(tokens.slice(openParenthesisIndex + 1, closeParenthesisIndex), parenthesisPairs),
        throwsTypes: parseThrows(tokens.slice(closeParenthesisIndex + 1, terminalIndex)),
        insertionOffset: declarationLineStart,
        rangeEnd,
        existingJavadoc: findExistingJavadoc(value, declarationLineStart)
      });
    });

    candidates.sort((left, right) => (left.rangeEnd - left.insertionOffset) - (right.rangeEnd - right.insertionOffset));
    return candidates[0] || null;
  }

  function createComment(source, method) {
    const value = String(source || "");
    const lineEnding = value.includes("\r\n") ? "\r\n" : "\n";
    const lineEnd = value.indexOf("\n", method.insertionOffset);
    const linePrefix = value.slice(method.insertionOffset, lineEnd < 0 ? value.length : lineEnd);
    const indent = linePrefix.match(/^\s*/)?.[0] || "";
    const isVoid = method.returnType === "void";
    const lines = [
      indent + "/**",
      indent + " * " + (isVoid ? "Performs {@code " : "Returns the result of {@code ") + method.name + "}."
    ];
    const tags = [];
    method.typeParameters.forEach((name) => tags.push("@param <" + name + "> the " + name + " type parameter"));
    method.parameters.forEach((name) => tags.push("@param " + name + " the " + name + " value"));
    if (!isVoid) tags.push("@return the result of {@code " + method.name + "}");
    method.throwsTypes.forEach((type) => tags.push("@throws " + type + " if the method cannot complete"));
    if (tags.length) lines.push(indent + " *");
    tags.forEach((tag) => lines.push(indent + " * " + tag));
    lines.push(indent + " */", "");
    return lines.join(lineEnding);
  }

  /**
   * Create the source insertion needed to document the method at an editor offset.
   * @param {string} source Current unsaved Java source text.
   * @param {number} cursorOffset Cursor offset used to select the enclosing method.
   * @returns {{ status: string, offset?: number, text?: string, methodName?: string }} Pure generation result.
   */
  function createInsertion(source, cursorOffset = 0) {
    const method = createMethodModel(source, Math.max(0, Number(cursorOffset) || 0));
    if (!method) return { status: "no-method" };
    if (method.existingJavadoc) return { status: "existing", methodName: method.name };
    return { status: "ready", offset: method.insertionOffset, text: createComment(source, method), methodName: method.name };
  }

  /** Create the pure Java method-Javadoc generator. */
  global.createMarkdownViewerJavaMethodJavadoc = function() {
    return { createInsertion };
  };
})(typeof window !== "undefined" ? window : globalThis);
