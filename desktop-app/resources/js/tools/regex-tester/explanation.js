(function(global) {
  "use strict";

  const FLAG_DESCRIPTIONS = {
    d: "Expose capture indices", g: "Find all matches", i: "Ignore case", m: "Multiline anchors",
    s: "Dot matches line terminators", u: "Unicode mode", v: "Unicode sets mode", y: "Sticky matching",
    U: "Unicode character classes", x: "Comments and whitespace", d_java: "UNIX lines"
  };

  function tokenizePattern(pattern, engine = "javascript", flags = "") {
    const source = String(pattern || "");
    const tokens = [];
    let inClass = false;
    for (let index = 0; index < source.length; index += 1) {
      const char = source[index];
      let end = index + 1;
      let type = "literal";
      let description = `Literal ${char}`;
      if (char === "\\") {
        end = Math.min(source.length, index + 2);
        type = "escape";
        description = `Escape ${source.slice(index, end)}`;
      } else if (char === "[" && !inClass) {
        inClass = true;
        type = "character-class";
        description = "Start character class";
      } else if (char === "]" && inClass) {
        inClass = false;
        type = "character-class";
        description = "End character class";
      } else if (inClass) {
        type = "character-class";
        description = "Character class member";
      } else if (char === "(") {
        const prefix = source.slice(index, index + 4);
        type = "group";
        description = prefix.startsWith("(?<") ? "Named capturing group" : prefix.startsWith("(?:") ? "Non-capturing group" : prefix.startsWith("(?") ? "Special group" : "Capturing group";
      } else if (char === ")") {
        type = "group";
        description = "End group";
      } else if ("^$".includes(char)) {
        type = "anchor";
        description = char === "^" ? "Start anchor" : "End anchor";
      } else if (char === "|") {
        type = "alternation";
        description = "Alternation";
      } else if ("*+?".includes(char) || char === "{") {
        if (char === "{") {
          const closing = source.indexOf("}", index + 1);
          if (closing >= 0) end = closing + 1;
        }
        type = "quantifier";
        description = `Quantifier ${source.slice(index, end)}`;
      }
      tokens.push({ type, start: index, end, text: source.slice(index, end), description, engine });
      index = end - 1;
    }
    Array.from(String(flags || "")).forEach((flag, index) => {
      tokens.push({
        type: "flag",
        start: source.length + index,
        end: source.length + index + 1,
        text: flag,
        description: FLAG_DESCRIPTIONS[engine === "java" && flag === "d" ? "d_java" : flag] || `Engine flag ${flag}`,
        engine
      });
    });
    return tokens;
  }

  global.RegexTesterExplanation = { tokenizePattern };
  if (typeof module !== "undefined" && module.exports) module.exports = { tokenizePattern };
})(typeof window !== "undefined" ? window : globalThis);
