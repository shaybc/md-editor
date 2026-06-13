(function(window) {
  window.registerMarkdownViewerRender = function registerMarkdownViewerRender(app, deps) {
    with (deps) {
  function processEmojis(element) {
    if (!joypixels?.shortnameToUnicode) return;
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      null,
      false
    );

    const textNodes = [];
    let node;
    while ((node = walker.nextNode())) {
      let parent = node.parentNode;
      let isInCode = false;
      while (parent && parent !== element) {
        if (parent.tagName === 'PRE' || parent.tagName === 'CODE') {
          isInCode = true;
          break;
        }
        parent = parent.parentNode;
      }

      if (!isInCode && node.nodeValue.includes(':')) {
        textNodes.push(node);
      }
    }

    textNodes.forEach(textNode => {
      const text = textNode.nodeValue;
      const emojiRegex = /:([\w+-]+):/g;

      let match;
      let lastIndex = 0;
      let result = '';
      let hasEmoji = false;

      while ((match = emojiRegex.exec(text)) !== null) {
        const shortcode = match[1];
        const emoji = joypixels.shortnameToUnicode(`:${shortcode}:`);

        if (emoji !== `:${shortcode}:`) {
          hasEmoji = true;
          result += text.substring(lastIndex, match.index) + emoji;
          lastIndex = emojiRegex.lastIndex;
        } else {
          result += text.substring(lastIndex, emojiRegex.lastIndex);
          lastIndex = emojiRegex.lastIndex;
        }
      }

      if (hasEmoji) {
        result += text.substring(lastIndex);
        const span = document.createElement('span');
        span.innerHTML = result;
        textNode.parentNode.replaceChild(span, textNode);
      }
    });
  }

  function renderMarkdown() {
    updateEditorLineNumbers();
    try {
      const { frontmatter, frontmatterPrefix, body } = parseFrontmatter(markdownEditor.value);
      const parseMarkdown = marked?.parse
        ? function(source) { return marked.parse(source); }
        : function(source) { return `<pre>${escapeHtml(source)}</pre>`; };
      const sanitizeHtml = DOMPurify?.sanitize
        ? function(html) {
            return DOMPurify.sanitize(html, {
              ADD_TAGS: ['mjx-container'],
              ADD_ATTR: ['id', 'class', 'style']
            });
          }
        : function(html) { return html; };
      const prefixHtml = frontmatterPrefix ? parseMarkdown(frontmatterPrefix) : '';
      const tableHtml = frontmatter ? renderFrontmatterTable(frontmatter) : '';
      const html = prefixHtml + tableHtml + parseMarkdown(body);
      const sanitizedHtml = sanitizeHtml(html);
      markdownPreview.innerHTML = sanitizedHtml;
      enhanceWikiLinks(markdownPreview);
      enhancePreviewMarkdownImages(markdownPreview);
      annotatePreviewMarkdownLinks(markdownPreview);
      enhanceGitHubAlerts(markdownPreview);

      processEmojis(markdownPreview);

      initMermaid();

      try {
        const mermaidNodes = markdownPreview.querySelectorAll('.mermaid');
        if (mermaidNodes.length > 0 && mermaid?.init) {
          Promise.resolve(mermaid.init(undefined, mermaidNodes))
            .then(() => addMermaidToolbars())
            .catch((e) => {
              console.warn("Mermaid rendering failed:", e);
              addMermaidToolbars();
            });
        }
      } catch (e) {
        console.warn("Mermaid rendering failed:", e);
      }

      if (window.MathJax) {
        try {
          MathJax.typesetPromise([markdownPreview]).catch((err) => {
            console.warn('MathJax typesetting failed:', err);
          });
        } catch (e) {
          console.warn("MathJax rendering failed:", e);
        }
      }

      updateDocumentStats();
    } catch (e) {
      console.error("Markdown rendering failed:", e);
      markdownPreview.innerHTML = `<div class="alert alert-danger">
              <strong>Error rendering markdown:</strong> ${e.message}
          </div>
          <pre>${markdownEditor.value}</pre>`;
    }
  }

  function debouncedRender() {
    clearTimeout(getMarkdownRenderTimeout());
    setMarkdownRenderTimeout(setTimeout(renderMarkdown, RENDER_DELAY));
  }

  function escapeHtml(str) {
    return String(str || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  return {
    processEmojis,
    renderMarkdown,
    debouncedRender
  };
    }
  };
})(window);
