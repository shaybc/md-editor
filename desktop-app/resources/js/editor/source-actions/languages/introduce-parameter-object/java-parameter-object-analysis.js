// JDT-backed method discovery and Java lexical analysis for Introduce Parameter Object.
(function(global) {
  "use strict";

  function maskJava(source) {
    const text = String(source || "");
    const result = text.split("");
    let state = "code";
    for (let index = 0; index < text.length; index += 1) {
      const current = text[index];
      const next = text[index + 1];
      if (state === "code") {
        if (current === "/" && next === "/") {
          result[index] = result[index + 1] = " ";
          state = "line-comment";
          index += 1;
        } else if (current === "/" && next === "*") {
          result[index] = result[index + 1] = " ";
          state = "block-comment";
          index += 1;
        } else if (current === '"') {
          result[index] = " ";
          state = text.slice(index, index + 3) === '"""' ? "text-block" : "string";
          if (state === "text-block") {
            result[index + 1] = result[index + 2] = " ";
            index += 2;
          }
        } else if (current === "'") {
          result[index] = " ";
          state = "character";
        }
      } else if (state === "line-comment") {
        if (current === "\n") state = "code";
        else result[index] = " ";
      } else if (state === "block-comment") {
        if (current === "*" && next === "/") {
          result[index] = result[index + 1] = " ";
          state = "code";
          index += 1;
        } else if (current !== "\n" && current !== "\r") result[index] = " ";
      } else if (state === "text-block") {
        if (text.slice(index, index + 3) === '"""') {
          result[index] = result[index + 1] = result[index + 2] = " ";
          state = "code";
          index += 2;
        } else if (current !== "\n" && current !== "\r") result[index] = " ";
      } else {
        result[index] = current === "\n" || current === "\r" ? current : " ";
        if (current === "\\") {
          if (index + 1 < text.length) result[index + 1] = " ";
          index += 1;
        } else if ((state === "string" && current === '"') || (state === "character" && current === "'")) {
          state = "code";
        }
      }
    }
    return result.join("");
  }

  function findMatching(masked, openOffset, openCharacter, closeCharacter) {
    let depth = 0;
    for (let index = openOffset; index < masked.length; index += 1) {
      if (masked[index] === openCharacter) depth += 1;
      else if (masked[index] === closeCharacter) {
        depth -= 1;
        if (depth === 0) return index;
      }
    }
    return -1;
  }

  function previousNonWhitespace(text, offset) {
    for (let index = offset - 1; index >= 0; index -= 1) {
      if (!/\s/.test(text[index])) return text[index];
    }
    return "";
  }

  function nextNonWhitespace(text, offset) {
    for (let index = offset; index < text.length; index += 1) {
      if (!/\s/.test(text[index])) return text[index];
    }
    return "";
  }

  function startsGenericArguments(masked, offset) {
    const previous = previousNonWhitespace(masked, offset);
    const next = nextNonWhitespace(masked, offset + 1);
    return /[\w$?.\])]/.test(previous) && /[\w$?@]/.test(next);
  }

  function splitTopLevelRanges(source, startOffset, endOffset) {
    const masked = maskJava(source);
    const ranges = [];
    let segmentStart = startOffset;
    let round = 0;
    let square = 0;
    let curly = 0;
    let angle = 0;
    for (let index = startOffset; index < endOffset; index += 1) {
      const character = masked[index];
      if (character === "(") round += 1;
      else if (character === ")") round = Math.max(0, round - 1);
      else if (character === "[") square += 1;
      else if (character === "]") square = Math.max(0, square - 1);
      else if (character === "{") curly += 1;
      else if (character === "}") curly = Math.max(0, curly - 1);
      else if (character === "<" && startsGenericArguments(masked, index)) angle += 1;
      else if (character === ">" && angle) angle -= 1;
      else if (character === "," && !round && !square && !curly && !angle) {
        ranges.push({ start: segmentStart, end: index });
        segmentStart = index + 1;
      }
    }
    if (segmentStart < endOffset || String(source || "").slice(startOffset, endOffset).trim()) {
      ranges.push({ start: segmentStart, end: endOffset });
    }
    return ranges;
  }

  function parameterNameRange(source, range) {
    const masked = maskJava(source).slice(range.start, range.end);
    const matches = Array.from(masked.matchAll(/[A-Za-z_$][\w$]*/g));
    const match = matches.at(-1);
    return match ? { start: range.start + match.index, end: range.start + match.index + match[0].length, name: match[0] } : null;
  }

  function lineStart(text, offset) {
    const index = String(text || "").lastIndexOf("\n", Math.max(0, offset - 1));
    return index < 0 ? 0 : index + 1;
  }

  function declarationStart(masked, methodNameOffset) {
    const boundary = Math.max(
      masked.lastIndexOf(";", methodNameOffset),
      masked.lastIndexOf("}", methodNameOffset),
      masked.lastIndexOf("{", methodNameOffset)
    );
    const candidateStart = boundary + 1;
    const prefix = masked.slice(candidateStart, methodNameOffset);
    const lines = prefix.split("\n");
    let relative = 0;
    let chosen = candidateStart;
    lines.forEach((line) => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("@") && !trimmed.startsWith("*") && !trimmed.startsWith("/")) {
        chosen = candidateStart + relative;
      }
      relative += line.length + 1;
    });
    return lineStart(masked, chosen);
  }

  function findOwner(masked, methodOffset) {
    const pattern = /\b(class|record|enum)\s+([A-Za-z_$][\w$]*)[^{;]*\{/g;
    const owners = [];
    for (const match of masked.matchAll(pattern)) {
      const open = match.index + match[0].lastIndexOf("{");
      const close = findMatching(masked, open, "{", "}");
      if (close > methodOffset && open < methodOffset) {
        owners.push({ kind: match[1], name: match[2], open, close });
      }
    }
    return owners.sort((left, right) => right.open - left.open)[0] || null;
  }

  function findMethodDeclaration(source, changeInfo, cursorOffset) {
    const text = String(source || "");
    const masked = maskJava(text);
    const methodName = String(changeInfo?.methodName || "");
    if (!methodName) throw new Error("JDT did not identify the selected Java method.");
    const pattern = new RegExp(`\\b${methodName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*\\(`, "g");
    const expectedNames = (changeInfo.parameters || []).map((parameter) => parameter.name);
    const candidates = [];
    for (const match of masked.matchAll(pattern)) {
      const nameStart = match.index;
      const open = masked.indexOf("(", nameStart + methodName.length);
      const close = findMatching(masked, open, "(", ")");
      if (close < 0) continue;
      const parameterRanges = splitTopLevelRanges(text, open + 1, close);
      const names = parameterRanges.map((range) => parameterNameRange(text, range)?.name).filter(Boolean);
      if (names.length !== expectedNames.length || names.some((name, index) => name !== expectedNames[index])) continue;
      let bodyOpen = close + 1;
      while (bodyOpen < masked.length && masked[bodyOpen] !== "{" && masked[bodyOpen] !== ";") bodyOpen += 1;
      if (masked[bodyOpen] !== "{") continue;
      const bodyClose = findMatching(masked, bodyOpen, "{", "}");
      if (bodyClose < 0) continue;
      const start = declarationStart(masked, nameStart);
      const owner = findOwner(masked, nameStart);
      if (!owner) continue;
      candidates.push({
        start,
        end: bodyClose + 1,
        nameStart,
        nameEnd: nameStart + methodName.length,
        parameterOpen: open,
        parameterClose: close,
        parameterRanges,
        parameterNameRanges: parameterRanges.map((range) => parameterNameRange(text, range)),
        bodyOpen,
        bodyClose,
        owner
      });
    }
    const containing = candidates.find((candidate) => cursorOffset >= candidate.start && cursorOffset <= candidate.end);
    const declaration = containing || (candidates.length === 1 ? candidates[0] : null);
    if (!declaration) throw new Error("Place the cursor on the Java method or constructor to refactor.");
    return declaration;
  }

  function getLineStarts(text) {
    const starts = [0];
    for (let index = 0; index < String(text || "").length; index += 1) {
      if (text[index] === "\n") starts.push(index + 1);
    }
    return starts;
  }

  function offsetToPosition(text, offset) {
    const bounded = Math.max(0, Math.min(String(text || "").length, Number(offset) || 0));
    const before = String(text || "").slice(0, bounded).split("\n");
    return { line: before.length - 1, character: before.at(-1).replace(/\r$/, "").length };
  }

  function positionToOffset(text, position) {
    const starts = getLineStarts(text);
    const line = Math.max(0, Math.min(Number(position?.line) || 0, starts.length - 1));
    return Math.min(String(text || "").length, (starts[line] || 0) + Math.max(0, Number(position?.character) || 0));
  }

  function packageName(source) {
    return maskJava(source).match(/^\s*package\s+([\w.]+)\s*;/m)?.[1] || "";
  }

  function importBlock(source) {
    const matches = Array.from(String(source || "").matchAll(/^\s*import\s+(?:static\s+)?[\w.*]+\s*;\s*$/gm));
    return matches.map((match) => match[0].trim()).join("\n");
  }

  function normalizeLocation(location) {
    return {
      uri: location?.uri || location?.targetUri || "",
      range: location?.range || location?.targetSelectionRange || null
    };
  }

  function locationKey(location) {
    return `${location.uri}:${location.range?.start?.line}:${location.range?.start?.character}:${location.range?.end?.line}:${location.range?.end?.character}`;
  }

  /**
   * Create the semantic analysis service for Introduce Parameter Object.
   * @param {object} options JDT request and workspace-reading dependencies.
   * @returns {{analyze:function(object):Promise<object>}} Analysis API.
   */
  function createMarkdownViewerJavaParameterObjectAnalysis(options = {}) {
    const requestClient = options.requestClient;
    const readUri = options.readUri;

    async function request(transport, method, params, label) {
      return requestClient.request(transport, method, params, { label });
    }

    async function analyze(context) {
      const source = String(context.source || "");
      const changeInfo = await request(
        context.transport,
        "java/getChangeSignatureInfo",
        context.codeActionParams,
        "Introduce Parameter Object method information"
      );
      if (!changeInfo || changeInfo.errorMessage || !changeInfo.methodIdentifier) {
        throw new Error(changeInfo?.errorMessage || "JDT cannot change the selected method signature.");
      }
      const cursorOffset = positionToOffset(source, context.codeActionParams?.range?.start);
      const declaration = findMethodDeclaration(source, changeInfo, cursorOffset);
      const parameters = (changeInfo.parameters || []).map((parameter, index) => ({
        ...parameter,
        originalIndex: Number.isFinite(Number(parameter.originalIndex)) ? Number(parameter.originalIndex) : index,
        declarationRange: declaration.parameterRanges[index],
        nameRange: declaration.parameterNameRanges[index]
      }));
      if (parameters.some((parameter) => !parameter.nameRange)) {
        throw new Error("The selected method parameters could not be mapped safely.");
      }
      const methodPosition = offsetToPosition(source, declaration.nameStart);
      const methodReferences = await request(context.transport, "textDocument/references", {
        textDocument: { uri: context.fileUri },
        position: methodPosition,
        context: { includeDeclaration: true }
      }, "Introduce Parameter Object method references");

      const parameterReferences = {};
      for (const parameter of parameters) {
        parameterReferences[parameter.originalIndex] = await request(context.transport, "textDocument/references", {
          textDocument: { uri: context.fileUri },
          position: offsetToPosition(source, parameter.nameRange.start),
          context: { includeDeclaration: true }
        }, `Introduce Parameter Object references for ${parameter.name}`);
      }

      const normalizedMethodReferences = Array.from(new Map((methodReferences || [])
        .map(normalizeLocation)
        .filter((location) => location.uri && location.range)
        .map((location) => [locationKey(location), location])).values());
      const normalizedParameterReferences = {};
      Object.entries(parameterReferences).forEach(([index, references]) => {
        normalizedParameterReferences[index] = Array.from(new Map((references || [])
          .map(normalizeLocation)
          .filter((location) => location.uri && location.range)
          .map((location) => [locationKey(location), location])).values());
      });

      const uris = new Set([context.fileUri]);
      normalizedMethodReferences.forEach((reference) => uris.add(reference.uri));
      Object.values(normalizedParameterReferences).flat().forEach((reference) => uris.add(reference.uri));
      const sources = {};
      for (const uri of uris) {
        const value = uri === context.fileUri ? source : await readUri(uri);
        if (typeof value !== "string" || (!value && uri !== context.fileUri)) {
          throw new Error("Every affected Java reference must be inside the active workspace.");
        }
        sources[uri] = value;
      }

      const header = source.slice(declaration.start, declaration.bodyOpen);
      const isConstructor = changeInfo.methodName === declaration.owner.name || !String(changeInfo.returnType || "").trim();
      return {
        changeInfo,
        declaration,
        fileUri: context.fileUri,
        imports: importBlock(source),
        isConstructor,
        isStatic: /\bstatic\b/.test(maskJava(header)),
        methodName: changeInfo.methodName,
        methodReferences: normalizedMethodReferences,
        owner: declaration.owner,
        packageName: packageName(source),
        parameterReferences: normalizedParameterReferences,
        parameters,
        returnType: changeInfo.returnType || "",
        source,
        sources,
        visibility: changeInfo.modifier === "package" ? "" : (changeInfo.modifier || "")
      };
    }

    return { analyze };
  }

  createMarkdownViewerJavaParameterObjectAnalysis._test = {
    findMatching,
    findMethodDeclaration,
    maskJava,
    offsetToPosition,
    positionToOffset,
    splitTopLevelRanges
  };
  global.createMarkdownViewerJavaParameterObjectAnalysis = createMarkdownViewerJavaParameterObjectAnalysis;
})(typeof window !== "undefined" ? window : globalThis);
