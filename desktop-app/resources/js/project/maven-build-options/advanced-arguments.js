(function(global) {
  "use strict";

  /** Validate one-off advanced Maven CLI arguments without changing Maven goals. */
  function registerMarkdownViewerMavenBuildOptionsAdvancedArguments(app) {
    const OPTIONS_WITH_VALUE = new Set(["-pl", "--projects", "-T", "--threads", "-s", "--settings", "-gs", "--global-settings", "-f", "--file"]);
    const FLAG_OPTIONS = new Set(["-am", "--also-make", "-amd", "--also-make-dependents", "-U", "--update-snapshots", "-o", "--offline", "-B", "--batch-mode", "-q", "--quiet", "-X", "--debug", "-e", "--errors", "-N", "--non-recursive"]);
    const LONG_EQUALS_OPTIONS = new Set(["--projects", "--threads", "--settings", "--global-settings", "--file"]);
    const DISALLOWED_GOALS = new Set(["clean", "compile", "test", "package", "verify", "install", "deploy", "site", "validate", "integration-test"]);

    function hasShellOperator(text) {
      return /[&|;<>`]/.test(text) || /\$\s*\(/.test(text) || /\r|\n/.test(text);
    }

    function tokenize(raw) {
      const tokens = [];
      let token = "";
      let quote = "";
      for (const character of String(raw || "")) {
        if (quote) {
          token += character;
          if (character === quote) quote = "";
        } else if (character === "\"" || character === "'") {
          quote = character;
          token += character;
        } else if (/\s/.test(character)) {
          if (token) {
            tokens.push(token);
            token = "";
          }
        } else {
          token += character;
        }
      }
      if (quote) return { tokens, error: "Advanced Maven arguments contain an unterminated quoted value." };
      if (token) tokens.push(token);
      return { tokens, error: "" };
    }

    function propertyKey(token) {
      const text = String(token || "");
      if (!text.startsWith("-D") || text.length <= 2) return "";
      return text.slice(2).replace(/=.*/, "").trim();
    }

    function optionKey(token) {
      const text = String(token || "");
      if (text.startsWith("-D")) return propertyKey(text);
      return text.replace(/^--?/, "").replace(/=.*/, "").trim();
    }

    function isGoalLike(token) {
      const text = String(token || "");
      return DISALLOWED_GOALS.has(text) || /^[\w.-]+:[\w.-]+/.test(text) || !text.startsWith("-");
    }

    function normalizeReservedKeys(reservedArguments) {
      return new Set((Array.isArray(reservedArguments) ? reservedArguments : [])
        .map((argument) => String(argument || "").replace(/^-D/, "").replace(/^--?/, "").replace(/=.*/, "").trim())
        .filter(Boolean));
    }

    function validateOptionToken(tokens, index) {
      const token = tokens[index];
      if (token.startsWith("-D")) {
        return propertyKey(token) ? { consumed: 1 } : { error: "Maven properties must use -Dname or -Dname=value." };
      }
      const equalsOption = token.match(/^(--[^=]+)=/);
      if (equalsOption) {
        return LONG_EQUALS_OPTIONS.has(equalsOption[1])
          ? { consumed: 1 }
          : { error: `Unsupported Maven argument '${token}'.` };
      }
      if (OPTIONS_WITH_VALUE.has(token)) {
        const value = tokens[index + 1];
        if (!value || value.startsWith("-")) return { error: `Maven argument '${token}' requires a value.` };
        return { consumed: 2 };
      }
      if (FLAG_OPTIONS.has(token) || /^-P.+/.test(token)) return { consumed: 1 };
      return { error: `Unsupported Maven argument '${token}'.` };
    }

    /** Parse and validate the raw advanced argument field for one rebuild invocation. */
    function validate(raw, options = {}) {
      const text = String(raw || "").trim();
      const errors = [];
      if (!text) return { valid: true, arguments: [], errors, warnings: [] };
      if (hasShellOperator(text)) {
        return { valid: false, arguments: [], errors: ["Advanced Maven arguments cannot contain shell operators or command separators."], warnings: [] };
      }
      const tokenized = tokenize(text);
      if (tokenized.error) return { valid: false, arguments: [], errors: [tokenized.error], warnings: [] };

      const reserved = normalizeReservedKeys(options.reservedArguments);
      for (let index = 0; index < tokenized.tokens.length;) {
        const token = tokenized.tokens[index];
        if (isGoalLike(token)) {
          errors.push(`'${token}' looks like a Maven goal or lifecycle phase. This rebuild always runs clean package.`);
          index += 1;
          continue;
        }
        const key = optionKey(token);
        if (key && reserved.has(key)) errors.push(`'${token}' conflicts with an option already controlled by Build Options.`);
        const result = validateOptionToken(tokenized.tokens, index);
        if (result.error) {
          errors.push(result.error);
          index += 1;
        } else {
          index += result.consumed;
        }
      }
      return { valid: errors.length === 0, arguments: errors.length ? [] : tokenized.tokens, errors, warnings: [] };
    }

    const api = { tokenize, validate };
    app.registerModule?.("mavenBuildOptionsAdvancedArguments", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildOptionsAdvancedArguments = registerMarkdownViewerMavenBuildOptionsAdvancedArguments;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenBuildOptionsAdvancedArguments };
})(typeof window !== "undefined" ? window : globalThis);
