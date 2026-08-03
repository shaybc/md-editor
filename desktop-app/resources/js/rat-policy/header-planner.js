(function(global) {
  "use strict";

  /** Add reviewed license headers while preserving leading interpreter and XML declarations. */
  function registerMarkdownViewerRatPolicyHeaderPlanner(app) {
    function renderHeader(header, extension, lineEnding) {
      if (["xml", "html", "xhtml"].includes(extension)) return `<!--${lineEnding}${header}${lineEnding}-->${lineEnding}`;
      if (["properties", "sh", "py", "yaml", "yml"].includes(extension)) {
        return header.split(/\r?\n/).map((line) => `# ${line}`).join(lineEnding) + lineEnding;
      }
      return `/*${lineEnding}${header}${lineEnding}*/${lineEnding}`;
    }

    /** Return content with a header placed after any shebang or XML declaration. */
    function add(content, header, extension) {
      const text = String(content || "");
      const lineEnding = text.includes("\r\n") ? "\r\n" : "\n";
      const shebangEnd = text.startsWith("#!") ? text.indexOf("\n") + 1 : 0;
      const xmlDeclaration = text.slice(shebangEnd).match(/^<\?xml[^>]*\?>\s*/)?.[0] || "";
      const offset = shebangEnd + xmlDeclaration.length;
      return text.slice(0, offset) + renderHeader(header, String(extension || "").toLowerCase(), lineEnding) + text.slice(offset);
    }

    const api = { add };
    app?.registerModule?.("ratPolicyHeaderPlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyHeaderPlanner = registerMarkdownViewerRatPolicyHeaderPlanner;
})(typeof window !== "undefined" ? window : globalThis);
