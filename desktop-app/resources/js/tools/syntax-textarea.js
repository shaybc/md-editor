// Shared syntax overlay for DevToys-style tool textareas.
(function(root) {
  "use strict";

  root.registerMarkdownViewerToolSyntaxTextarea = function registerMarkdownViewerToolSyntaxTextarea(app) {
    const VALUE_PATCHED = "markdownViewerToolSyntaxTextareaPatched";
    const MAX_HIGHLIGHT_CHARS = 200000;

    function escapeHtml(value) {
      return String(value == null ? "" : value)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
    }

    function token(value, className) {
      return `<span class="tool-syntax-token tool-syntax-${className}">${escapeHtml(value)}</span>`;
    }

    function highlightJson(value) {
      const source = String(value || "");
      let output = "";
      let index = 0;
      const matcher = /"(?:\\.|[^"\\])*"|-?\d+(?:\.\d+)?(?:[eE][+-]?\d+)?|\b(?:true|false|null)\b|[{}[\]:,]/g;
      let match;
      while ((match = matcher.exec(source))) {
        output += escapeHtml(source.slice(index, match.index));
        const part = match[0];
        const after = source.slice(matcher.lastIndex);
        if (part.startsWith('"')) output += token(part, /^\s*:/.test(after) ? "property" : "string");
        else if (/^-?\d/.test(part)) output += token(part, "number");
        else if (/^(true|false|null)$/.test(part)) output += token(part, "atom");
        else if (/^[{}[\]]$/.test(part)) output += token(part, "bracket");
        else output += token(part, "operator");
        index = matcher.lastIndex;
      }
      return output + escapeHtml(source.slice(index));
    }

    function highlightYamlLine(line) {
      const commentIndex = line.search(/(^|[ \t])#/);
      const body = commentIndex >= 0 ? line.slice(0, commentIndex + (line[commentIndex] === "#" ? 0 : 1)) : line;
      const comment = commentIndex >= 0 ? line.slice(commentIndex + (line[commentIndex] === "#" ? 0 : 1)) : "";
      let output = escapeHtml(body);
      output = output.replace(/^(\s*-?\s*)([A-Za-z0-9_.-]+)(\s*:)/, (_match, prefix, key, suffix) => `${escapeHtml(prefix)}${token(key, "property")}${escapeHtml(suffix)}`);
      output = output.replace(/(:\s*)(["'](?:\\.|[^"'])*["'])/g, (_match, prefix, text) => `${escapeHtml(prefix)}${token(text, "string")}`);
      output = output.replace(/(:\s*)(-?\d+(?:\.\d+)?)(?=\s*$)/g, (_match, prefix, number) => `${escapeHtml(prefix)}${token(number, "number")}`);
      output = output.replace(/(:\s*)(true|false|null|yes|no|on|off)(?=\s*$)/gi, (_match, prefix, atomValue) => `${escapeHtml(prefix)}${token(atomValue, "atom")}`);
      return output + (comment ? token(comment, "comment") : "");
    }

    function highlightYaml(value) {
      return String(value || "").split("\n").map(highlightYamlLine).join("\n");
    }

    function highlightXml(value) {
      const source = String(value || "");
      let output = "";
      let index = 0;
      const matcher = /<!--[\s\S]*?-->|<!\[CDATA\[[\s\S]*?\]\]>|<\/?[A-Za-z_][\w:.-]*(?:\s+[A-Za-z_:][\w:.-]*(?:\s*=\s*(?:"[^"]*"|'[^']*'))?)*\s*\/?>|<\?[\s\S]*?\?>/g;
      let match;
      while ((match = matcher.exec(source))) {
        output += escapeHtml(source.slice(index, match.index));
        const part = match[0];
        if (part.startsWith("<!--")) {
          output += token(part, "comment");
        } else if (part.startsWith("<![CDATA[")) {
          output += token(part, "string");
        } else {
          output += escapeHtml(part)
            .replace(/(&lt;\/?)([A-Za-z_][\w:.-]*)/g, `$1<span class="tool-syntax-token tool-syntax-tag">$2</span>`)
            .replace(/([A-Za-z_:][\w:.-]*)(\s*=\s*)(&quot;[^&]*&quot;|&#39;[^&]*&#39;)/g, `<span class="tool-syntax-token tool-syntax-attribute">$1</span>$2<span class="tool-syntax-token tool-syntax-string">$3</span>`);
        }
        index = matcher.lastIndex;
      }
      return output + escapeHtml(source.slice(index));
    }

    function highlight(value, language) {
      const source = String(value || "");
      if (source.length > MAX_HIGHLIGHT_CHARS) return escapeHtml(source);
      if (language === "json") return highlightJson(source);
      if (language === "yaml") return highlightYaml(source);
      if (language === "xml") return highlightXml(source);
      return escapeHtml(source);
    }

    function patchTextareaValue(textarea, sync) {
      if (!textarea || textarea.dataset[VALUE_PATCHED] === "true") return;
      const descriptor = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(textarea), "value");
      if (!descriptor?.get || !descriptor?.set) return;
      Object.defineProperty(textarea, "value", {
        configurable: true,
        get() {
          return descriptor.get.call(this);
        },
        set(value) {
          descriptor.set.call(this, value);
          sync();
        }
      });
      textarea.dataset[VALUE_PATCHED] = "true";
    }

    function syncOverlayStyle(textarea, overlay) {
      const style = root.getComputedStyle?.(textarea);
      if (!style) return;
      overlay.style.font = style.font;
      overlay.style.lineHeight = style.lineHeight;
      overlay.style.letterSpacing = style.letterSpacing;
      overlay.style.padding = style.padding;
      overlay.style.border = style.border;
      overlay.style.borderRadius = style.borderRadius;
      overlay.style.tabSize = style.tabSize || "2";
      overlay.style.whiteSpace = style.whiteSpace || "pre";
      overlay.style.backgroundColor = style.backgroundColor;
    }

    function attach(textarea, options = {}) {
      if (!textarea || textarea.dataset.toolSyntaxTextarea === "true") return null;
      let language = options.language || "text";
      const wrapper = document.createElement("div");
      wrapper.className = "tool-syntax-textarea";
      wrapper.dataset.language = language;
      const overlay = document.createElement("pre");
      overlay.className = "tool-syntax-textarea-overlay";
      overlay.setAttribute("aria-hidden", "true");
      const code = document.createElement("code");
      overlay.appendChild(code);
      textarea.parentNode.insertBefore(wrapper, textarea);
      wrapper.appendChild(overlay);
      wrapper.appendChild(textarea);
      textarea.dataset.toolSyntaxTextarea = "true";

      function sync() {
        syncOverlayStyle(textarea, overlay);
        wrapper.dataset.language = language;
        code.innerHTML = highlight(textarea.value, language) || " ";
        overlay.scrollTop = textarea.scrollTop;
        overlay.scrollLeft = textarea.scrollLeft;
      }

      patchTextareaValue(textarea, sync);
      textarea.addEventListener("input", sync);
      textarea.addEventListener("scroll", sync);
      sync();

      return {
        sync,
        setLanguage(nextLanguage) {
          language = nextLanguage || "text";
          sync();
        },
        destroy() {
          textarea.removeEventListener("input", sync);
          textarea.removeEventListener("scroll", sync);
        }
      };
    }

    const api = { attach, highlight };
    app?.registerModule?.("toolSyntaxTextarea", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);
