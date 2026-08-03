(function(global) {
  "use strict";

  const GROUPS = [
    { id: "all", label: "All Tokens" },
    { id: "common", label: "Common Tokens" },
    { id: "general", label: "General Tokens" },
    { id: "anchors", label: "Anchors" },
    { id: "meta", label: "Meta Sequences" },
    { id: "quantifiers", label: "Quantifiers" },
    { id: "groups", label: "Group Constructs" },
    { id: "classes", label: "Character Classes" },
    { id: "flags", label: "Flags / Modifiers" },
    { id: "substitution", label: "Substitution" }
  ];
  const BOTH = ["javascript", "java"];
  function entry(group, name, token, description, engines = BOTH, common = false) {
    return { group, name, token, description, engines, common };
  }

  const ENTRIES = [
    entry("general", "Newline", "\\n", "Newline character", BOTH, true),
    entry("general", "Carriage return", "\\r", "Carriage return character"),
    entry("general", "Tab", "\\t", "Tab character", BOTH, true),
    entry("general", "Null character", "\\0", "Null character", ["javascript"]),
    entry("general", "Null character", "\\x00", "Null character", ["java"]),
    entry("anchors", "Start of input or line", "^", "Start of input, or line in multiline mode", BOTH, true),
    entry("anchors", "End of input or line", "$", "End of input, or line in multiline mode", BOTH, true),
    entry("anchors", "Start of input", "\\A", "Start of the entire input", ["java"]),
    entry("anchors", "End of input", "\\z", "End of the entire input", ["java"]),
    entry("anchors", "End before final terminator", "\\Z", "End of input except for a final line terminator", ["java"]),
    entry("anchors", "Previous match end", "\\G", "Boundary where the previous match ended", ["java"]),
    entry("anchors", "Word boundary", "\\b", "A word boundary", BOTH, true),
    entry("anchors", "Non-word boundary", "\\B", "A non-word boundary", BOTH, true),
    entry("meta", "Any character", ".", "Any character except a line terminator unless dot-all is enabled", BOTH, true),
    entry("meta", "Alternation", "a|b", "Match either expression a or expression b", BOTH, true),
    entry("meta", "Whitespace", "\\s", "Any whitespace character", BOTH, true),
    entry("meta", "Non-whitespace", "\\S", "Any non-whitespace character", BOTH, true),
    entry("meta", "Digit", "\\d", "Any decimal digit", BOTH, true),
    entry("meta", "Non-digit", "\\D", "Any non-digit character", BOTH, true),
    entry("meta", "Word character", "\\w", "Any word character", BOTH, true),
    entry("meta", "Non-word character", "\\W", "Any non-word character", BOTH, true),
    entry("meta", "Unicode property", "\\p{Letter}", "A character with the specified Unicode property", BOTH),
    entry("meta", "Negated Unicode property", "\\P{Letter}", "A character without the specified Unicode property", BOTH),
    entry("meta", "Unicode line break", "\\R", "Any Unicode line-break sequence", ["java"]),
    entry("meta", "Horizontal whitespace", "\\h", "Any horizontal whitespace character", ["java"]),
    entry("meta", "Non-horizontal whitespace", "\\H", "Any non-horizontal whitespace character", ["java"]),
    entry("meta", "Vertical whitespace", "\\v", "Any vertical whitespace character", ["java"]),
    entry("meta", "Non-vertical whitespace", "\\V", "Any non-vertical whitespace character", ["java"]),
    entry("meta", "Quoted literal", "\\Q...\\E", "Treat enclosed characters as literals", ["java"]),
    entry("meta", "Numbered backreference", "\\1", "Match the text captured by group 1", BOTH),
    entry("meta", "Named backreference", "\\k<name>", "Match the text captured by a named group", BOTH),
    entry("meta", "Hex character", "\\x{1F600}", "Character represented by a hexadecimal code point", ["java"]),
    entry("meta", "Unicode escape", "\\uFFFF", "Character represented by four hexadecimal digits", BOTH),
    entry("meta", "Escape metacharacter", "\\.", "Treat a regular-expression metacharacter literally", BOTH),
    entry("quantifiers", "Optional", "a?", "Zero or one occurrence of a", BOTH, true),
    entry("quantifiers", "Zero or more", "a*", "Zero or more occurrences of a", BOTH, true),
    entry("quantifiers", "One or more", "a+", "One or more occurrences of a", BOTH, true),
    entry("quantifiers", "Exact count", "a{3}", "Exactly 3 occurrences of a", BOTH, true),
    entry("quantifiers", "Minimum count", "a{3,}", "3 or more occurrences of a", BOTH),
    entry("quantifiers", "Count range", "a{3,6}", "Between 3 and 6 occurrences of a", BOTH),
    entry("quantifiers", "Lazy optional", "a??", "Zero or one occurrence, preferring fewer", BOTH),
    entry("quantifiers", "Lazy zero or more", "a*?", "Zero or more occurrences, preferring fewer", BOTH),
    entry("quantifiers", "Lazy one or more", "a+?", "One or more occurrences, preferring fewer", BOTH),
    entry("quantifiers", "Possessive optional", "a?+", "Possessive zero-or-one quantifier", ["java"]),
    entry("quantifiers", "Possessive zero or more", "a*+", "Possessive zero-or-more quantifier", ["java"]),
    entry("quantifiers", "Possessive one or more", "a++", "Possessive one-or-more quantifier", ["java"]),
    entry("groups", "Capturing group", "(...)", "Numbered capturing group", BOTH, true),
    entry("groups", "Non-capturing group", "(?:...)", "Group without creating a capture", BOTH, true),
    entry("groups", "Named capturing group", "(?<name>...)", "Capturing group addressed by name", BOTH, true),
    entry("groups", "Positive lookahead", "(?=...)", "Require an expression to follow without consuming it", BOTH),
    entry("groups", "Negative lookahead", "(?!...)", "Require an expression not to follow", BOTH),
    entry("groups", "Positive lookbehind", "(?<=...)", "Require an expression immediately before the match", BOTH),
    entry("groups", "Negative lookbehind", "(?<!...)", "Require an expression not to precede the match", BOTH),
    entry("groups", "Atomic group", "(?>...)", "Non-backtracking group", ["java"]),
    entry("groups", "Inline modifiers", "(?imsx-imsx)", "Enable or disable modifiers for the remaining pattern", ["java"]),
    entry("groups", "Localized modifiers", "(?imsx-imsx:...)", "Enable or disable modifiers within a group", ["java"]),
    entry("classes", "Character set", "[abc]", "A single character: a, b, or c", BOTH, true),
    entry("classes", "Negated character set", "[^abc]", "Any character except a, b, or c", BOTH, true),
    entry("classes", "Character range", "[a-z]", "A character in the range a through z", BOTH, true),
    entry("classes", "Combined ranges", "[a-zA-Z]", "A character in either listed range", BOTH),
    entry("classes", "Class intersection", "[a-z&&[^bc]]", "Intersection of character classes", ["java"]),
    entry("classes", "Letters and digits", "\\p{Alnum}", "An ASCII letter or digit", ["java"]),
    entry("classes", "Letters", "\\p{Alpha}", "An ASCII alphabetic character", ["java"]),
    entry("classes", "ASCII characters", "\\p{ASCII}", "A character with code 0 through 127", ["java"]),
    entry("classes", "Decimal digits", "\\p{Digit}", "An ASCII decimal digit", ["java"]),
    entry("classes", "Lowercase letters", "\\p{Lower}", "An ASCII lowercase letter", ["java"]),
    entry("classes", "Uppercase letters", "\\p{Upper}", "An ASCII uppercase letter", ["java"]),
    entry("classes", "Hexadecimal digits", "\\p{XDigit}", "An ASCII hexadecimal digit", ["java"]),
    entry("flags", "Global", "g", "Find or replace all matches", BOTH, true),
    entry("flags", "Case insensitive", "i", "Case-insensitive matching", BOTH, true),
    entry("flags", "Multiline", "m", "Make anchors operate per line", BOTH, true),
    entry("flags", "Dot all", "s", "Allow dot to match line terminators", BOTH),
    entry("flags", "Unicode", "u", "Unicode-aware matching", BOTH),
    entry("flags", "Unicode sets", "v", "Unicode set notation and properties", ["javascript"]),
    entry("flags", "Sticky", "y", "Match from the current lastIndex position", ["javascript"]),
    entry("flags", "Indices", "d", "Return match and capture indices", ["javascript"]),
    entry("flags", "Comments", "x", "Ignore pattern whitespace and allow comments", ["java"]),
    entry("flags", "Unicode classes", "U", "Use Unicode versions of predefined and POSIX classes", ["java"]),
    entry("flags", "UNIX lines", "d", "Recognize only newline as a line terminator", ["java"]),
    entry("substitution", "Complete match", "$&", "Insert the complete match", ["javascript"], true),
    entry("substitution", "Numbered capture", "$1", "Insert capture group 1", ["javascript"], true),
    entry("substitution", "Named capture", "$<name>", "Insert a named capture group", ["javascript"]),
    entry("substitution", "Literal dollar", "$$", "Insert a dollar sign", ["javascript"], true),
    entry("substitution", "Before match", "$`", "Insert the text before the match", ["javascript"]),
    entry("substitution", "After match", "$'", "Insert the text after the match", ["javascript"]),
    entry("substitution", "Complete match", "$0", "Insert the complete match", ["java"], true),
    entry("substitution", "Numbered capture", "$1", "Insert capture group 1", ["java"], true),
    entry("substitution", "Named capture", "${name}", "Insert a named capture group", ["java"]),
    entry("substitution", "Escaped dollar", "\\$", "Insert a literal dollar sign", ["java"]),
    entry("substitution", "Escaped backslash", "\\\\", "Insert a literal backslash", ["java"])
  ];

  function getQuickReferenceGroups() {
    return GROUPS.map((group) => ({ ...group }));
  }

  function getQuickReference(engine = "javascript", query = "", group = "all") {
    const activeEngine = engine === "java" ? "java" : "javascript";
    const activeGroup = GROUPS.some((candidate) => candidate.id === group) ? group : "all";
    const filter = String(query || "").trim().toLowerCase();
    return ENTRIES
      .filter((reference) => reference.engines.includes(activeEngine))
      .filter((reference) => activeGroup === "all" || (activeGroup === "common" ? reference.common : reference.group === activeGroup))
      .filter((reference) => !filter || `${reference.name} ${reference.token} ${reference.description} ${reference.group}`.toLowerCase().includes(filter))
      .map((reference) => ({
        name: reference.name, token: reference.token, description: reference.description,
        group: reference.group,
        groupLabel: GROUPS.find((candidate) => candidate.id === reference.group)?.label || reference.group,
        engine: activeEngine
      }));
  }

  global.RegexTesterQuickReference = { getQuickReference, getQuickReferenceGroups };
  if (typeof module !== "undefined" && module.exports) module.exports = { getQuickReference, getQuickReferenceGroups };
})(typeof window !== "undefined" ? window : globalThis);
