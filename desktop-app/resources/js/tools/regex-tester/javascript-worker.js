(function(global) {
  "use strict";

  const MAX_MATCHES = 10000;

  function createError(request, error) {
    return {
      requestId: request.requestId,
      engine: "javascript",
      ok: false,
      elapsedMs: 0,
      matches: [],
      replacementOutput: "",
      replacementRanges: [],
      truncated: false,
      error: { type: "syntax", message: error?.message || String(error || "Invalid regular expression.") }
    };
  }

  function advanceIndex(text, index, unicode) {
    if (!unicode || index >= text.length) return index + 1;
    const first = text.charCodeAt(index);
    if (first >= 0xD800 && first <= 0xDBFF && index + 1 < text.length) {
      const second = text.charCodeAt(index + 1);
      if (second >= 0xDC00 && second <= 0xDFFF) return index + 2;
    }
    return index + 1;
  }

  function normalizeGroups(match) {
    const indices = match.indices || [];
    const namedByValue = match.groups || {};
    const namedIndices = indices.groups || {};
    const namesByIndex = {};
    Object.keys(namedIndices).forEach((name) => {
      const range = namedIndices[name];
      if (!range) return;
      const value = namedByValue[name];
      for (let index = 1; index < indices.length; index += 1) {
        if (indices[index] === range || (indices[index] && indices[index][0] === range[0] && indices[index][1] === range[1] && match[index] === value)) {
          namesByIndex[index] = name;
          break;
        }
      }
    });
    return match.slice(1).map((value, offset) => {
      const index = offset + 1;
      const range = indices[index];
      return {
        index,
        name: namesByIndex[index] || null,
        start: range ? range[0] : -1,
        end: range ? range[1] : -1,
        value: value === undefined ? "" : value,
        matched: value !== undefined
      };
    });
  }

  function replaceWithRanges(text, regex, replacement) {
    const markerSource = `${text}${replacement}`;
    let markerIndex = 0;
    let startMarker;
    let endMarker;
    do {
      startMarker = `\uE000REGEX_TESTER_START_${markerIndex}\uE001`;
      endMarker = `\uE000REGEX_TESTER_END_${markerIndex}\uE001`;
      markerIndex += 1;
    } while (markerSource.includes(startMarker) || markerSource.includes(endMarker));

    const markedOutput = text.replace(regex, `${startMarker}${replacement}${endMarker}`);
    const replacementRanges = [];
    let replacementOutput = "";
    let cursor = 0;
    while (cursor < markedOutput.length) {
      const markerStart = markedOutput.indexOf(startMarker, cursor);
      if (markerStart < 0) {
        replacementOutput += markedOutput.slice(cursor);
        break;
      }
      replacementOutput += markedOutput.slice(cursor, markerStart);
      const valueStart = markerStart + startMarker.length;
      const markerEnd = markedOutput.indexOf(endMarker, valueStart);
      if (markerEnd < 0) {
        replacementOutput += markedOutput.slice(markerStart);
        break;
      }
      const start = replacementOutput.length;
      replacementOutput += markedOutput.slice(valueStart, markerEnd);
      replacementRanges.push({ index: replacementRanges.length, start, end: replacementOutput.length });
      cursor = markerEnd + endMarker.length;
    }
    return { replacementOutput, replacementRanges };
  }

  function evaluateRequest(request) {
    const started = typeof performance !== "undefined" ? performance.now() : Date.now();
    const text = String(request.testString || "");
    const displayedFlags = String(request.flags || "");
    let flags = displayedFlags.includes("d") ? displayedFlags : `${displayedFlags}d`;
    if (!flags.includes("g")) flags += "g";
    let regex;
    try {
      regex = new RegExp(String(request.pattern || ""), flags);
    } catch (error) {
      return createError(request, error);
    }

    const matches = [];
    let truncated = false;
    let match;
    while ((match = regex.exec(text)) !== null) {
      matches.push({
        index: matches.length,
        start: match.index,
        end: match.index + match[0].length,
        value: match[0],
        groups: normalizeGroups(match)
      });
      if (!displayedFlags.includes("g")) break;
      if (match[0].length === 0) regex.lastIndex = advanceIndex(text, regex.lastIndex, flags.includes("u") || flags.includes("v"));
      if (matches.length >= MAX_MATCHES) {
        truncated = regex.exec(text) !== null;
        break;
      }
    }

    let replacementOutput = "";
    let replacementRanges = [];
    if (request.mode === "replace") {
      try {
        const replacementFlags = displayedFlags.includes("g") ? displayedFlags : displayedFlags.replace(/g/g, "");
        const replacementResult = replaceWithRanges(text, new RegExp(String(request.pattern || ""), replacementFlags), String(request.replacement || ""));
        replacementOutput = replacementResult.replacementOutput;
        replacementRanges = replacementResult.replacementRanges;
      } catch (error) {
        return createError(request, error);
      }
    }
    const ended = typeof performance !== "undefined" ? performance.now() : Date.now();
    return {
      requestId: request.requestId,
      engine: "javascript",
      ok: true,
      elapsedMs: Math.max(0, ended - started),
      matches,
      replacementOutput,
      replacementRanges,
      truncated,
      error: null
    };
  }

  if (typeof global.postMessage === "function" && typeof global.document === "undefined") {
    global.onmessage = function(event) {
      global.postMessage(evaluateRequest(event.data || {}));
    };
  }
  global.RegexTesterJavascriptWorker = { evaluateRequest, advanceIndex };
  if (typeof module !== "undefined" && module.exports) module.exports = { evaluateRequest, advanceIndex, replaceWithRanges };
})(typeof self !== "undefined" ? self : globalThis);
