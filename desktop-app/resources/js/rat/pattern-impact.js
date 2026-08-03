(function(global) {
  "use strict";

  /** Enumerate the bounded current workspace impact of one reviewed RAT expression. */
  function registerMarkdownViewerRatPatternImpact(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(root, child) {
      return `${normalizePath(root)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    function globToRegex(pattern) {
      const value = String(pattern || "").replace(/\\/g, "/").replace(/^\/+/, "");
      let output = "^";
      for (let index = 0; index < value.length; index += 1) {
        const character = value[index];
        if (character === "*" && value[index + 1] === "*") {
          index += 1;
          if (value[index + 1] === "/") {
            index += 1;
            output += "(?:.*/)?";
          } else {
            output += ".*";
          }
        } else if (character === "*") output += "[^/]*";
        else if (character === "?") output += "[^/]";
        else output += character.replace(/[|\\{}()[\]^$+?.]/g, "\\$&");
      }
      return new RegExp(`${output}$`, "i");
    }

    async function findMatches(rootPath, pattern, options = {}) {
      const filesystem = (deps.Neutralino || global.Neutralino)?.filesystem;
      const root = normalizePath(rootPath);
      const matcher = globToRegex(pattern);
      const pending = [root];
      const matches = [];
      const maxFiles = Number(options.maxFiles) || 5000;
      const maxMatches = Number(options.maxMatches) || 200;
      let scanned = 0;
      let truncated = false;
      while (pending.length && scanned < maxFiles && matches.length < maxMatches) {
        const directory = pending.shift();
        let entries = [];
        try {
          entries = await filesystem.readDirectory(directory) || [];
        } catch (_error) {
          continue;
        }
        for (const entry of entries) {
          const name = String(entry.entry || entry.name || "");
          if (!name || name === "." || name === "..") continue;
          const fullPath = joinPath(directory, name);
          const relative = fullPath.slice(root.length).replace(/^\/+/, "");
          const type = String(entry.type || "").toLowerCase();
          if (type === "directory" || type === "dir") {
            if (![".git", ".svn", "node_modules"].includes(name)) pending.push(fullPath);
            continue;
          }
          scanned += 1;
          if (matcher.test(relative)) matches.push(relative);
          if (scanned >= maxFiles || matches.length >= maxMatches) {
            truncated = true;
            break;
          }
        }
      }
      if (pending.length) truncated = true;
      return { matches, scanned, truncated };
    }

    const api = { findMatches, globToRegex };
    app?.registerModule?.("ratPatternImpact", api);
    return api;
  }

  global.registerMarkdownViewerRatPatternImpact = registerMarkdownViewerRatPatternImpact;
})(typeof window !== "undefined" ? window : globalThis);
