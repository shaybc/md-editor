(function(window, document) {
  "use strict";

  function registerMarkdownViewerRendererConfig(app, deps) {
    const marked = deps.marked;
    const hljs = deps.hljs;
    const mermaid = deps.mermaid;
    const getSyntaxHighlightStyleForLanguage = deps.getSyntaxHighlightStyleForLanguage || function() { return ""; };

    function initMermaid() {
      if (!mermaid?.initialize) return;
      const currentTheme = document.documentElement.getAttribute("data-theme");
      const mermaidTheme = currentTheme === "dark" ? "dark" : "default";

      mermaid.initialize({
        startOnLoad: false,
        theme: mermaidTheme,
        securityLevel: "loose",
        flowchart: { useMaxWidth: true, htmlLabels: true },
        fontSize: 16
      });
    }

    function renderCodeBlock(code, language) {
      const normalizedLanguage = (language || "").trim().split(/\s+/)[0].toLowerCase();

      if (normalizedLanguage === "mermaid") {
        const uniqueId = "mermaid-diagram-" + Math.random().toString(36).substr(2, 9);
        return `<div class="mermaid-container"><div class="mermaid" id="${uniqueId}">${code}</div></div>`;
      }

      if (!hljs?.getLanguage || !hljs?.highlight) {
        return `<pre><code>${escapeHtml(code)}</code></pre>`;
      }
      const validLanguage = hljs.getLanguage(normalizedLanguage) ? normalizedLanguage : "plaintext";
      const highlightedCode = hljs.highlight(code, {
        language: validLanguage
      }).value;
      const syntaxStyle = getSyntaxHighlightStyleForLanguage(validLanguage);
      const styleAttribute = syntaxStyle ? ` style="${escapeHtml(syntaxStyle)}"` : "";
      return `<pre><code class="hljs ${validLanguage}"${styleAttribute}>${highlightedCode}</code></pre>`;
    }

    function configureMarkedRenderer() {
      if (!marked?.Renderer || !marked?.setOptions) return;
      const markedOptions = {
        gfm: true,
        breaks: false,
        pedantic: false,
        sanitize: false,
        smartypants: false,
        xhtml: false,
        headerIds: true,
        mangle: false
      };

      const renderer = new marked.Renderer();
      renderer.code = renderCodeBlock;

      marked.setOptions({
        ...markedOptions,
        renderer
      });
    }

    function initialize() {
      try {
        initMermaid();
      } catch (error) {
        console.warn("Mermaid initialization failed:", error);
      }

      configureMarkedRenderer();
    }

    function escapeHtml(str) {
      return String(str || "")
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;");
    }

    const api = {
      configureMarkedRenderer,
      initMermaid,
      initialize,
      renderCodeBlock
    };

    app.registerModule("rendererConfig", api);
    return api;
  }

  window.registerMarkdownViewerRendererConfig = registerMarkdownViewerRendererConfig;
})(window, document);
