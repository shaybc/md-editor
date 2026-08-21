(function(global) {
  "use strict";

  const OPEN_SOURCE_COMPONENTS = Object.freeze([
    { category: "Application and interface", name: "Neutralinojs", purpose: "Desktop application runtime", license: "MIT", url: "https://github.com/neutralinojs/neutralinojs" },
    { category: "Application and interface", name: "Bootstrap", purpose: "Interface layout and controls", license: "MIT", url: "https://github.com/twbs/bootstrap" },
    { category: "Application and interface", name: "Bootstrap Icons", purpose: "Interface icon set", license: "MIT", url: "https://github.com/twbs/icons" },
    { category: "Application and interface", name: "Popper", purpose: "Positioning used by Bootstrap components", license: "MIT", url: "https://github.com/floating-ui/floating-ui" },
    { category: "Application and interface", name: "CodeMirror", purpose: "Source and Markdown editor", license: "MIT", url: "https://github.com/codemirror/dev" },
    { category: "Application and interface", name: "GitHub Markdown CSS", purpose: "Rendered Markdown styling", license: "MIT", url: "https://github.com/sindresorhus/github-markdown-css" },
    { category: "Application and interface", name: "VS Code Hex Editor", purpose: "Hexadecimal file editor", license: "MIT", url: "https://github.com/microsoft/vscode-hexeditor" },
    { category: "Application and interface", name: "xterm.js", purpose: "Integrated terminal rendering", license: "MIT", url: "https://github.com/xtermjs/xterm.js" },
    { category: "Application and interface", name: "xterm.js Fit Addon", purpose: "Integrated terminal sizing", license: "MIT", url: "https://github.com/xtermjs/xterm.js" },

    { category: "Markdown, diagrams, and visualization", name: "Marked", purpose: "Markdown parsing", license: "MIT", url: "https://github.com/markedjs/marked" },
    { category: "Markdown, diagrams, and visualization", name: "highlight.js", purpose: "Code syntax highlighting", license: "BSD-3-Clause", url: "https://github.com/highlightjs/highlight.js" },
    { category: "Markdown, diagrams, and visualization", name: "DOMPurify", purpose: "Rendered HTML sanitization", license: "Apache-2.0 OR MPL-2.0", url: "https://github.com/cure53/DOMPurify" },
    { category: "Markdown, diagrams, and visualization", name: "Mermaid", purpose: "Text-based diagrams", license: "MIT", url: "https://github.com/mermaid-js/mermaid" },
    { category: "Markdown, diagrams, and visualization", name: "diagrams.net (draw.io)", purpose: "Visual diagram editor", license: "Apache-2.0", url: "https://github.com/jgraph/drawio" },
    { category: "Markdown, diagrams, and visualization", name: "D3", purpose: "Graph visualization", license: "ISC", url: "https://github.com/d3/d3" },
    { category: "Markdown, diagrams, and visualization", name: "MathJax", purpose: "Mathematical notation rendering", license: "Apache-2.0", url: "https://github.com/mathjax/MathJax" },
    { category: "Markdown, diagrams, and visualization", name: "JoyPixels Emoji Toolkit", purpose: "Emoji parsing and presentation", license: "MIT (toolkit)", url: "https://github.com/joypixels/emoji-toolkit" },

    { category: "Export and data", name: "FileSaver.js", purpose: "Browser file downloads", license: "MIT", url: "https://github.com/eligrey/FileSaver.js" },
    { category: "Export and data", name: "html2pdf.js", purpose: "HTML-to-PDF export workflow", license: "MIT", url: "https://github.com/eKoopmans/html2pdf.js" },
    { category: "Export and data", name: "html2canvas", purpose: "HTML canvas capture", license: "MIT", url: "https://github.com/niklasvh/html2canvas" },
    { category: "Export and data", name: "jsPDF", purpose: "PDF document generation", license: "MIT", url: "https://github.com/parallax/jsPDF" },
    { category: "Export and data", name: "pdfmake", purpose: "PDF document generation", license: "MIT", url: "https://github.com/bpampuch/pdfmake" },
    { category: "Export and data", name: "pako", purpose: "Deflate compression", license: "MIT AND Zlib", url: "https://github.com/nodeca/pako" },
    { category: "Export and data", name: "JSZip", purpose: "ZIP project and export archives", license: "MIT OR GPL-3.0-or-later", url: "https://github.com/Stuk/jszip" },
    { category: "Export and data", name: "js-yaml", purpose: "YAML parsing in the interface", license: "MIT", url: "https://github.com/nodeca/js-yaml" },
    { category: "Export and data", name: "yaml", purpose: "YAML parsing in desktop services", license: "ISC", url: "https://github.com/eemeli/yaml" },
    { category: "Export and data", name: "fast-glob", purpose: "Workspace file discovery", license: "MIT", url: "https://github.com/mrmlnc/fast-glob" },
    { category: "Export and data", name: "simple-git", purpose: "Git command integration", license: "MIT", url: "https://github.com/steveukx/git-js" },

    { category: "Language and developer tooling", name: "Model Context Protocol JavaScript SDK", purpose: "MCP client integration", license: "MIT", url: "https://github.com/modelcontextprotocol/typescript-sdk" },
    { category: "Language and developer tooling", name: "node-pty", purpose: "Desktop pseudo-terminal processes", license: "MIT", url: "https://github.com/microsoft/node-pty" },
    { category: "Language and developer tooling", name: "Prettier", purpose: "Code formatting engine", license: "MIT", url: "https://github.com/prettier/prettier" },
    { category: "Language and developer tooling", name: "Prettier Java", purpose: "Java formatting", license: "Apache-2.0", url: "https://github.com/jhipster/prettier-java" },
    { category: "Language and developer tooling", name: "web-tree-sitter", purpose: "Parser runtime used by Java formatting", license: "MIT", url: "https://github.com/tree-sitter/tree-sitter" },
    { category: "Language and developer tooling", name: "tree-sitter-java", purpose: "Java syntax grammar", license: "MIT", url: "https://github.com/tree-sitter/tree-sitter-java" },
    { category: "Language and developer tooling", name: "TypeScript", purpose: "TypeScript and JavaScript language services", license: "Apache-2.0", url: "https://github.com/microsoft/TypeScript" },
    { category: "Language and developer tooling", name: "TypeScript Language Server", purpose: "TypeScript and JavaScript LSP", license: "Apache-2.0", url: "https://github.com/typescript-language-server/typescript-language-server" },
    { category: "Language and developer tooling", name: "VS Code Language Servers", purpose: "HTML, CSS, JSON, and ESLint language services", license: "MIT", url: "https://github.com/hrsh7th/vscode-langservers-extracted" },
    { category: "Language and developer tooling", name: "VS Code Language Server Node", purpose: "Language Server Protocol implementation", license: "MIT", url: "https://github.com/microsoft/vscode-languageserver-node" },
    { category: "Language and developer tooling", name: "Bash Language Server", purpose: "Shell language intelligence", license: "MIT", url: "https://github.com/bash-lsp/bash-language-server" },
    { category: "Language and developer tooling", name: "Dockerfile Language Server", purpose: "Dockerfile language intelligence", license: "MIT", url: "https://github.com/rcjsuen/dockerfile-language-server-nodejs" },
    { category: "Language and developer tooling", name: "Pyright", purpose: "Python language intelligence", license: "MIT", url: "https://github.com/microsoft/pyright" },
    { category: "Language and developer tooling", name: "YAML Language Server", purpose: "YAML language intelligence", license: "MIT", url: "https://github.com/redhat-developer/yaml-language-server" },
    { category: "Language and developer tooling", name: "Eclipse JDT Language Server", purpose: "Java language intelligence", license: "EPL-2.0", url: "https://github.com/eclipse-jdtls/eclipse.jdt.ls" },
    { category: "Language and developer tooling", name: "Eclipse LemMinX", purpose: "XML language intelligence", license: "EPL-2.0", url: "https://github.com/eclipse-lemminx/lemminx" },
    { category: "Language and developer tooling", name: "Kotlin Language Server", purpose: "Kotlin language intelligence", license: "Apache-2.0", url: "https://github.com/Kotlin/kotlin-lsp" },
    { category: "Language and developer tooling", name: "Kotlin Compiler", purpose: "Kotlin compilation and ABI analysis", license: "Apache-2.0", url: "https://github.com/JetBrains/kotlin" },
    { category: "Language and developer tooling", name: "Eclipse Temurin", purpose: "Bundled Java tooling runtime", license: "GPL-2.0 with Classpath Exception", url: "https://github.com/adoptium/temurin-build" }
  ]);

  /** Return the direct and bundled open-source components used by MD-Editor. */
  function getOpenSourceComponents() {
    return OPEN_SOURCE_COMPONENTS.slice();
  }

  const api = Object.freeze({ getOpenSourceComponents });
  global.MarkdownViewerOpenSourceCatalog = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
