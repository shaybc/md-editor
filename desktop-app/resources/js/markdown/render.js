(function(window) {
  window.registerMarkdownViewerRender = function registerMarkdownViewerRender(app, deps) {
    const LARGE_MARKDOWN_PREVIEW_BYTES = 512 * 1024;
    const LARGE_MARKDOWN_PREVIEW_LINES = 2000;
    const getActiveMarkdownEditor = deps.getActiveMarkdownEditor || function() { return deps.markdownEditor; };
    const getActiveMarkdownPreview = deps.getActiveMarkdownPreview || function() { return deps.markdownPreview; };
    const getActiveTab = deps.getActiveTab || function() { return null; };

    // --- HTML preview helpers ---
    function getActiveTabPath(tab) {
      return tab?.sourceFilePath || tab?.sourceFileName || tab?.sourceFileHandle?.name || "";
    }

    function isHtmlTab(tab) {
      return /\.(html|htm)$/i.test(getActiveTabPath(tab));
    }

    // Find the iframe inside the active preview pane, creating it if needed.
    // The split view creates a new .preview-pane per tab, so we can't rely on
    // a single static #html-preview element in index.html.
    function getHtmlPreviewFrame(markdownPreview) {
      const pane = markdownPreview?.parentElement;
      if (!pane) return null;
      let frame = pane.querySelector(".html-preview-frame");
      if (!frame) {
        frame = (deps.document || document).createElement("iframe");
        frame.className = "html-preview-frame";
        frame.setAttribute("sandbox", "allow-same-origin allow-scripts allow-forms allow-popups");
        pane.appendChild(frame);
      }
      return frame;
    }

    // Resolve a relative path against a base directory (handles ".." segments).
    // baseDir must end with "/", e.g. "C:/Users/.../bike-palace/"
    function resolveRelativePath(baseDir, relative) {
      relative = (relative || "").trim();
      if (!relative || /^(https?:|data:|blob:|\/\/|#)/i.test(relative)) return null;
      const parts = (baseDir + relative).split("/");
      const out = [];
      for (const p of parts) {
        if (p === "..") out.pop();
        else if (p !== ".") out.push(p);
      }
      return out.join("/");
    }

    function assetMimeType(path) {
      const ext = (path.split(".").pop() || "").toLowerCase();
      return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg",
               gif: "image/gif", svg: "image/svg+xml", webp: "image/webp",
               ico: "image/x-icon", woff: "font/woff", woff2: "font/woff2",
               ttf: "font/ttf", otf: "font/otf" }[ext] || "application/octet-stream";
    }

    // Read a local file via Neutralino and return a blob: URL usable in the same HTTP origin.
    async function localFileToBlobUrl(absPath) {
      const buf = await Neutralino.filesystem.readBinaryFile(absPath);
      const blob = new Blob([buf], { type: assetMimeType(absPath) });
      return URL.createObjectURL(blob);
    }

    // Replace url('...') references in CSS with blob: URLs for local files.
    async function inlineCssUrls(css, cssDir) {
      const re = /url\(\s*(['"]?)([^'")\s]+)\1\s*\)/g;
      const matches = Array.from(css.matchAll(re));
      for (const m of matches) {
        const href = m[2];
        if (/^(https?:|data:|blob:|\/\/)/i.test(href)) continue;
        const absPath = resolveRelativePath(cssDir, href);
        if (!absPath) continue;
        try {
          const blobUrl = await localFileToBlobUrl(absPath);
          css = css.replace(m[0], `url("${blobUrl}")`);
        } catch (_) { /* leave as-is if file not found */ }
      }
      return css;
    }

    // Inline local CSS <link> tags and replace local <img src> with blob: URLs.
    // Only runs in desktop (Neutralino) context; returns html unchanged in browser.
    async function inlineLocalAssets(html, fileDir) {
      if (typeof window.Neutralino === "undefined" || !window.Neutralino.filesystem) return html;

      // Inline <link rel="stylesheet" href="local.css">
      const linkRe = /<link\b([^>]*)>/gi;
      for (const m of Array.from(html.matchAll(linkRe))) {
        if (!/rel=["']stylesheet["']/i.test(m[1])) continue;
        const hm = m[1].match(/href=["']([^"']+)["']/i);
        if (!hm) continue;
        const absPath = resolveRelativePath(fileDir, hm[1]);
        if (!absPath) continue;
        try {
          const cssDir = absPath.replace(/\/[^/]+$/, "/");
          let css = await Neutralino.filesystem.readFile(absPath);
          css = await inlineCssUrls(css, cssDir);
          html = html.replace(m[0], `<style>\n${css}\n</style>`);
        } catch (_) { /* leave <link> tag as-is */ }
      }

      // Replace <img src="local-file"> with blob: URLs
      for (const m of Array.from(html.matchAll(/<img\b([^>]*)>/gi))) {
        const sm = m[1].match(/src=["']([^"']+)["']/i);
        if (!sm) continue;
        const absPath = resolveRelativePath(fileDir, sm[1]);
        if (!absPath) continue;
        try {
          const blobUrl = await localFileToBlobUrl(absPath);
          const newTag = m[0].replace(sm[0], `src="${blobUrl}"`);
          html = html.replace(m[0], newTag);
        } catch (_) { /* leave as-is */ }
      }

      // Inline local <script src="local.js"> as inline <script> blocks
      for (const m of Array.from(html.matchAll(/<script\b([^>]*)>\s*<\/script>/gi))) {
        const sm = m[1].match(/src=["']([^"']+)["']/i);
        if (!sm) continue;
        const absPath = resolveRelativePath(fileDir, sm[1]);
        if (!absPath) continue;
        try {
          const js = await Neutralino.filesystem.readFile(absPath);
          html = html.replace(m[0], `<script>\n${js}\n</script>`);
        } catch (_) { /* leave as-is */ }
      }

      return html;
    }

    function showHtmlPreview(markdownPreview, source, filePath) {
      const frame = getHtmlPreviewFrame(markdownPreview);
      if (!frame) return false;
      markdownPreview.style.display = "none";
      frame.style.display = "block";

      // Skip if nothing changed (use source as cache key)
      if (frame._lastSource === source && frame._lastFilePath === filePath) return true;
      frame._lastSource = source;
      frame._lastFilePath = filePath;

      // Show immediately with whatever we have (CDN resources render right away)
      frame.srcdoc = source;
      frame._lastSrcdoc = source;

      if (filePath) {
        const fileDir = filePath.replace(/\\/g, "/").replace(/\/[^/]+$/, "/");
        // Async: inline local CSS and images, then update iframe
        inlineLocalAssets(source, fileDir).then(function(inlined) {
          // Only update if this tab is still showing the same file
          if (frame._lastSource === source && frame._lastFilePath === filePath) {
            frame.srcdoc = inlined;
            frame._lastSrcdoc = inlined;
          }
        }).catch(function() { /* keep the un-inlined version */ });
      }

      return true;
    }

    function hideHtmlPreview(markdownPreview) {
      const frame = getHtmlPreviewFrame(markdownPreview);
      if (!frame) return;
      frame.style.display = "none";
      frame.srcdoc = "";
      frame._lastSrcdoc = "";
      markdownPreview.style.display = "";
    }
    // --- end HTML preview helpers ---

    function getNow() {
      return typeof performance !== "undefined" && typeof performance.now === "function"
        ? performance.now()
        : Date.now();
    }

    function createPreviewPerfSession(action, details = {}) {
      const enabled = typeof deps.appDebugLog === "function";
      const start = getNow();
      let last = start;
      const steps = [];

      function mark(step, extra = {}) {
        if (!enabled) return;
        const now = getNow();
        steps.push({
          step,
          deltaMs: Math.round((now - last) * 10) / 10,
          totalMs: Math.round((now - start) * 10) / 10,
          ...extra
        });
        last = now;
      }

      function finish(extra = {}) {
        if (!enabled) return;
        void deps.appDebugLog("info", "[preview-render-perf] " + action, {
          totalMs: Math.round((getNow() - start) * 10) / 10,
          steps,
          ...details,
          ...extra
        });
      }

      return { mark, finish };
    }

    function getPreviewContentStats(text) {
      const value = String(text || "");
      return {
        bytes: value.length,
        lineCount: value ? value.split(/\r\n|\r|\n/).length : 0
      };
    }

    function getMarkdownPreviewPolicy(text, options = {}) {
      const stats = getPreviewContentStats(text);
      const isLarge = stats.bytes > LARGE_MARKDOWN_PREVIEW_BYTES ||
        stats.lineCount > LARGE_MARKDOWN_PREVIEW_LINES;
      return {
        kind: isLarge ? "deferred-preview" : "normal-preview",
        isLarge,
        deferHeavyEnhancements: options.deferHeavyEnhancements === true || isLarge,
        bytes: stats.bytes,
        lineCount: stats.lineCount,
        thresholdBytes: LARGE_MARKDOWN_PREVIEW_BYTES,
        thresholdLines: LARGE_MARKDOWN_PREVIEW_LINES
      };
    }

    function getContentKey(text) {
      const value = String(text || "");
      let hash = 2166136261;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 16777619);
      }
      return `${value.length}:${(hash >>> 0).toString(16)}`;
    }

    function setPreviewStatus(preview, message) {
      const pane = preview?.parentElement;
      if (!pane) return;
      let status = pane.querySelector(":scope > .markdown-preview-render-status");
      if (!message) {
        if (status) status.remove();
        return;
      }
      if (!status) {
        status = deps.document.createElement("div");
        status.className = "markdown-preview-render-status";
        pane.insertBefore(status, preview);
      }
      status.textContent = message;
    }

    function processEmojis(element) {
      const joypixels = deps.joypixels;
      if (!joypixels?.shortnameToUnicode) return;
      const walker = deps.document.createTreeWalker(
        element,
        deps.NodeFilter.SHOW_TEXT,
        null,
        false
      );

      const textNodes = [];
      let node;
      while ((node = walker.nextNode())) {
        let parent = node.parentNode;
        let isInCode = false;
        while (parent && parent !== element) {
          if (parent.tagName === "PRE" || parent.tagName === "CODE") {
            isInCode = true;
            break;
          }
          parent = parent.parentNode;
        }

        if (!isInCode && node.nodeValue.includes(":")) {
          textNodes.push(node);
        }
      }

      textNodes.forEach(textNode => {
        const text = textNode.nodeValue;
        const emojiRegex = /:([\w+-]+):/g;
        let match;
        let lastIndex = 0;
        let result = "";
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
          const span = deps.document.createElement("span");
          span.innerHTML = result;
          textNode.parentNode.replaceChild(span, textNode);
        }
      });
    }

    function setCodeBlockCopyButtonState(button, state) {
      if (!button) return;
      if (button._copyStateTimeout) {
        clearTimeout(button._copyStateTimeout);
        button._copyStateTimeout = null;
      }
      if (state === "copied") {
        button.classList.add("is-copied");
        button.innerHTML = '<i class="bi bi-check-lg" aria-hidden="true"></i>';
        button.setAttribute("aria-label", "Copied code block");
        button.title = "Copied";
        button._copyStateTimeout = setTimeout(function() {
          setCodeBlockCopyButtonState(button, "ready");
        }, 1400);
        return;
      }
      if (state === "failed") {
        button.classList.add("is-copy-failed");
        button.innerHTML = '<i class="bi bi-exclamation-triangle" aria-hidden="true"></i>';
        button.setAttribute("aria-label", "Copy code block failed");
        button.title = "Copy failed";
        button._copyStateTimeout = setTimeout(function() {
          setCodeBlockCopyButtonState(button, "ready");
        }, 1800);
        return;
      }
      button.classList.remove("is-copied", "is-copy-failed");
      button.innerHTML = '<i class="bi bi-copy" aria-hidden="true"></i>';
      button.setAttribute("aria-label", "Copy code block");
      button.title = "Copy code block";
    }

    async function copyCodeBlockText(text) {
      if (typeof deps.copyTextToClipboard === "function") {
        await deps.copyTextToClipboard(text);
        return;
      }
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return;
      }
      const textArea = deps.document.createElement("textarea");
      textArea.value = text;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      deps.document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const successful = deps.document.execCommand("copy");
      deps.document.body.removeChild(textArea);
      if (!successful) throw new Error("Copy command was unsuccessful");
    }

    function createCodeBlockCopyButton(codeElement) {
      const button = deps.document.createElement("button");
      button.type = "button";
      button.className = "markdown-code-copy-button";
      setCodeBlockCopyButtonState(button, "ready");
      button.addEventListener("click", async function(event) {
        event.preventDefault();
        event.stopPropagation();
        try {
          await copyCodeBlockText(codeElement?.textContent || "");
          setCodeBlockCopyButtonState(button, "copied");
        } catch (error) {
          console.warn("Code block copy failed:", error);
          setCodeBlockCopyButtonState(button, "failed");
        }
      });
      return button;
    }

    function getCodeBlockCopyScrollContainer(preview, wrapper) {
      let element = wrapper?.parentElement || preview?.parentElement || null;
      while (element && element !== deps.document.body && element !== deps.document.documentElement) {
        const style = window.getComputedStyle ? window.getComputedStyle(element) : null;
        const overflowY = style?.overflowY || "";
        if ((overflowY === "auto" || overflowY === "scroll" || overflowY === "overlay") && element.scrollHeight > element.clientHeight) {
          return element;
        }
        element = element.parentElement;
      }
      return window;
    }

    function getScrollContainerRect(container) {
      if (!container || container === window) {
        return {
          top: 0,
          right: window.innerWidth || deps.document.documentElement.clientWidth || 0,
          bottom: window.innerHeight || deps.document.documentElement.clientHeight || 0,
          left: 0
        };
      }
      return container.getBoundingClientRect();
    }

    function getCodeBlockCopyMutationRoot(preview) {
      const container = getCodeBlockCopyScrollContainer(preview, preview);
      if (container && container !== window) return container;
      return deps.document.body || deps.document.documentElement;
    }

    function updateCodeBlockCopyButtonPositions(preview) {
      if (!preview) return;
      preview.querySelectorAll(".markdown-code-block").forEach(function(wrapper) {
        const button = wrapper.querySelector(":scope > .markdown-code-copy-button");
        if (!button) return;
        const wrapperRect = wrapper.getBoundingClientRect();
        const containerRect = getScrollContainerRect(getCodeBlockCopyScrollContainer(preview, wrapper));
        const buttonWidth = button.offsetWidth || 30;
        const buttonHeight = button.offsetHeight || 30;
        const inset = 8;
        const visibleTop = Math.max(wrapperRect.top + inset, containerRect.top + inset);
        const visibleRight = Math.min(wrapperRect.right - inset, containerRect.right - inset);
        const visibleBottom = Math.min(wrapperRect.bottom - inset, containerRect.bottom - inset);

        if (visibleBottom <= visibleTop || visibleRight <= wrapperRect.left + inset || wrapperRect.bottom <= containerRect.top || wrapperRect.top >= containerRect.bottom) {
          button.style.visibility = "hidden";
          button.style.pointerEvents = "none";
          return;
        }

        const top = Math.min(visibleTop, Math.max(wrapperRect.top + inset, visibleBottom - buttonHeight));
        const left = Math.max(wrapperRect.left + inset, visibleRight - buttonWidth);
        button.style.transform = `translate(${Math.round(left)}px, ${Math.round(top)}px)`;
        button.style.visibility = "visible";
        button.style.pointerEvents = "auto";
      });
    }

    function bindCodeBlockCopyButtonPositioning(preview) {
      if (!preview) return;
      const previous = preview._codeBlockCopyButtonPositioning;
      if (previous?.schedule) {
        previous.schedule();
        return;
      }
      let pending = false;
      const schedule = function() {
        if (pending) return;
        pending = true;
        window.requestAnimationFrame(function() {
          pending = false;
          updateCodeBlockCopyButtonPositions(preview);
        });
      };
      deps.document.addEventListener("scroll", schedule, true);
      window.addEventListener("resize", schedule);
      const mutationRoot = getCodeBlockCopyMutationRoot(preview);
      const mutationObserver = typeof window.MutationObserver === "function" && mutationRoot
        ? new window.MutationObserver(function(mutations) {
          const shouldSchedule = mutations.some(function(mutation) {
            return !mutation.target?.classList?.contains("markdown-code-copy-button");
          });
          if (shouldSchedule) schedule();
        })
        : null;
      mutationObserver?.observe(mutationRoot, {
        attributes: true,
        attributeFilter: ["aria-expanded", "class", "hidden", "open"],
        childList: true,
        subtree: true
      });
      preview._codeBlockCopyButtonPositioning = {
        schedule,
        cleanup: function() {
          deps.document.removeEventListener("scroll", schedule, true);
          window.removeEventListener("resize", schedule);
          mutationObserver?.disconnect();
        }
      };
      schedule();
    }
    function enhanceCodeBlockCopyButtons(preview) {
      if (!preview) return;
      preview.querySelectorAll("pre").forEach(function(pre) {
        if (pre.closest(".mermaid-container")) return;
        const code = pre.querySelector("code");
        if (!code) return;

        let wrapper = pre.parentElement;
        if (!wrapper || !wrapper.classList.contains("markdown-code-block")) {
          wrapper = deps.document.createElement("div");
          wrapper.className = "markdown-code-block";
          pre.parentNode.insertBefore(wrapper, pre);
          wrapper.appendChild(pre);
        }

        if (wrapper.querySelector(":scope > .markdown-code-copy-button")) return;
        wrapper.insertBefore(createCodeBlockCopyButton(code), pre);
      });
      bindCodeBlockCopyButtonPositioning(preview);
    }

    function enhancePreview(preview, cache, perf) {
      deps.enhanceWikiLinks(preview);
      perf?.mark("enhance wiki links");
      deps.enhancePreviewMarkdownImages(preview);
      perf?.mark("enhance images");
      deps.annotatePreviewMarkdownLinks(preview);
      perf?.mark("annotate links");
      deps.enhanceGitHubAlerts(preview);
      perf?.mark("enhance alerts");
      enhanceCodeBlockCopyButtons(preview);
      perf?.mark("enhance code block copy buttons");
      processEmojis(preview);
      perf?.mark("emoji pass");

      deps.initMermaid();
      try {
        const mermaidNodes = preview.querySelectorAll(".mermaid");
        if (mermaidNodes.length > 0 && deps.mermaid?.init) {
          Promise.resolve(deps.mermaid.init(undefined, mermaidNodes))
            .then(() => deps.addMermaidToolbars())
            .catch((e) => {
              console.warn("Mermaid rendering failed:", e);
              deps.addMermaidToolbars();
            });
        }
      } catch (e) {
        console.warn("Mermaid rendering failed:", e);
      }
      perf?.mark("mermaid scheduled");

      if (deps.MathJax) {
        try {
          deps.MathJax.typesetPromise([preview]).catch((err) => {
            console.warn("MathJax typesetting failed:", err);
          });
        } catch (e) {
          console.warn("MathJax rendering failed:", e);
        }
      }
      perf?.mark("mathjax scheduled");
      if (cache) cache.enhanced = true;
    }

    function schedulePreviewEnhancements(tab, preview, cache, policy) {
      if (!preview || !cache || cache.enhanced) return;
      setPreviewStatus(preview, "Preview loaded. Finishing diagrams and link enhancements...");
      const tabId = tab?.id || null;
      const run = function() {
        if (tabId && getActiveTab()?.id !== tabId) return;
        const perf = createPreviewPerfSession("deferred preview enhancements", {
          tabId,
          title: tab?.title || null,
          policy: policy.kind,
          bytes: policy.bytes,
          lineCount: policy.lineCount
        });
        enhancePreview(preview, cache, perf);
        setPreviewStatus(preview, "");
        deps.updateDocumentStats();
        perf.finish({ enhanced: true });
      };
      if (typeof window.requestIdleCallback === "function") {
        window.requestIdleCallback(run, { timeout: 1200 });
      } else {
        window.setTimeout(run, 0);
      }
    }

    function parseMarkdownToHtml(source, options = {}) {
      const parseMarkdown = deps.marked?.parse
        ? function(markdown) { return deps.marked.parse(markdown); }
        : function(markdown) { return `<pre>${escapeHtml(markdown)}</pre>`; };
      const sanitizeHtml = deps.DOMPurify?.sanitize
        ? function(html) {
            return deps.DOMPurify.sanitize(html, {
              ADD_TAGS: ["mjx-container"],
              ADD_ATTR: ["id", "class", "style"]
            });
          }
        : function(html) { return html; };
      if (options.renderFrontmatter === false) return sanitizeHtml(parseMarkdown(source));
      const { frontmatter, frontmatterPrefix, body } = deps.parseFrontmatter(source);
      const prefixHtml = frontmatterPrefix ? parseMarkdown(frontmatterPrefix) : "";
      const tableHtml = frontmatter ? deps.renderFrontmatterTable(frontmatter) : "";
      return sanitizeHtml(prefixHtml + tableHtml + parseMarkdown(body));
    }

    /** Adapt a standalone Mermaid source into the Markdown block expected by the preview renderer. */
    function getMarkdownPreviewSource(source, tab) {
      const rawSource = String(source || "");
      const sourcePath = tab?.sourceFilePath || tab?.sourceFileName || tab?.sourceFileHandle?.name || "";
      if (!rawSource.trim() || deps.isMermaidPath?.(sourcePath) !== true) return rawSource;
      const trailingNewline = rawSource.endsWith("\n") ? "" : "\n";
      return `\`\`\`mermaid\n${rawSource}${trailingNewline}\`\`\``;
    }

    function renderMarkdownContent(target, markdown, options = {}) {
      if (!target) return false;
      try {
        target.classList?.add("markdown-body");
        target.innerHTML = parseMarkdownToHtml(String(markdown || ""), {
          renderFrontmatter: options.renderFrontmatter !== false
        });
        if (options.enhance !== false) enhancePreview(target, null, null);
        return true;
      } catch (error) {
        console.error("Markdown content rendering failed:", error);
        return false;
      }
    }

    function renderMarkdown(options = {}) {
      const activeMarkdownEditor = getActiveMarkdownEditor();
      const activeMarkdownPreview = getActiveMarkdownPreview();
      deps.updateEditorLineNumbers();
      if (typeof deps.shouldRenderMarkdownPreview === "function" && !deps.shouldRenderMarkdownPreview()) {
        if (activeMarkdownPreview) {
          activeMarkdownPreview.innerHTML = "";
          activeMarkdownPreview.dataset.previewCacheKey = "";
          setPreviewStatus(activeMarkdownPreview, "");
        }
        deps.updateDocumentStats();
        return;
      }
      if (!activeMarkdownEditor || !activeMarkdownPreview) return;
      const tab = getActiveTab();
      const editorSource = activeMarkdownEditor.value || "";

      // HTML files are rendered directly in a sandboxed iframe, not via the markdown pipeline
      if (isHtmlTab(tab)) {
        showHtmlPreview(activeMarkdownPreview, editorSource, tab?.sourceFilePath || "");
        deps.updateDocumentStats();
        return;
      }
      // Non-HTML tab: ensure iframe is hidden and markdown div is visible
      hideHtmlPreview(activeMarkdownPreview);

      const source = getMarkdownPreviewSource(editorSource, tab);
      const policy = getMarkdownPreviewPolicy(source, options);
      const key = getContentKey(source);
      const cache = tab?.markdownPreviewCache;
      const perf = createPreviewPerfSession("render markdown preview", {
        tabId: tab?.id || null,
        title: tab?.title || null,
        reason: options.reason || "render",
        policy: policy.kind,
        bytes: policy.bytes,
        lineCount: policy.lineCount
      });

      try {
        if (options.reuseCache !== false && cache?.key === key && cache.html) {
          let appliedCachedHtml = false;
          if (activeMarkdownPreview.dataset.previewCacheKey !== key) {
            activeMarkdownPreview.innerHTML = cache.html;
            activeMarkdownPreview.dataset.previewCacheKey = key;
            cache.enhanced = false;
            appliedCachedHtml = true;
            perf.mark("apply cached html");
          } else {
            perf.mark("reuse mounted preview dom");
          }
          if (!cache.enhanced) {
            if (policy.deferHeavyEnhancements) {
              schedulePreviewEnhancements(tab, activeMarkdownPreview, cache, policy);
            } else {
              enhancePreview(activeMarkdownPreview, cache, perf);
              setPreviewStatus(activeMarkdownPreview, "");
            }
          } else {
            setPreviewStatus(activeMarkdownPreview, "");
          }
          deps.updateDocumentStats();
          perf.finish({
            cacheHit: true,
            appliedCachedHtml,
            enhanced: cache.enhanced === true
          });
          return;
        }

        setPreviewStatus(activeMarkdownPreview, policy.isLarge ? "Rendering large preview..." : "");
        const sanitizedHtml = parseMarkdownToHtml(source);
        perf.mark("parse and sanitize");
        activeMarkdownPreview.innerHTML = sanitizedHtml;
        activeMarkdownPreview.dataset.previewCacheKey = key;
        const nextCache = {
          key,
          html: sanitizedHtml,
          enhanced: false,
          renderedAt: Date.now(),
          policy: policy.kind
        };
        if (tab) tab.markdownPreviewCache = nextCache;
        perf.mark("apply html");

        if (policy.deferHeavyEnhancements) {
          schedulePreviewEnhancements(tab, activeMarkdownPreview, nextCache, policy);
          deps.updateDocumentStats();
          perf.finish({ cacheHit: false, deferredEnhancements: true });
          return;
        }

        enhancePreview(activeMarkdownPreview, nextCache, perf);
        setPreviewStatus(activeMarkdownPreview, "");
        deps.updateDocumentStats();
        perf.finish({ cacheHit: false, deferredEnhancements: false });
      } catch (e) {
        console.error("Markdown rendering failed:", e);
        activeMarkdownPreview.innerHTML = `<div class="alert alert-danger">
              <strong>Error rendering markdown:</strong> ${e.message}
          </div>
          <pre>${escapeHtml(editorSource)}</pre>`;
        activeMarkdownPreview.dataset.previewCacheKey = "";
        setPreviewStatus(activeMarkdownPreview, "");
        perf.finish({ error: e?.message || String(e) });
      }
    }

    function debouncedRender() {
      clearTimeout(deps.getMarkdownRenderTimeout());
      deps.setMarkdownRenderTimeout(setTimeout(function() {
        renderMarkdown({ reason: "debounced-edit", reuseCache: false });
      }, deps.RENDER_DELAY));
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
      renderMarkdownContent,
      debouncedRender,
      getMarkdownPreviewPolicy
    };
  };
})(window);
