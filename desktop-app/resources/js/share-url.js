(function (window, document) {
  "use strict";

  var MAX_SHARE_URL_LENGTH = 32000;
  var PLAIN_SHARE_PREFIX = "plain.";
  var PUBLIC_SHARE_BASE_URL = "";

  function hasPakoDeflate() {
    return typeof pako !== "undefined" && pako && typeof pako.deflate === "function";
  }

  function hasPakoInflate() {
    return typeof pako !== "undefined" && pako && typeof pako.inflate === "function";
  }

  function bytesToBase64Url(bytes) {
    var chunkSize = 0x8000;
    var binary = "";

    for (var i = 0; i < bytes.length; i += chunkSize) {
      binary += String.fromCharCode.apply(null, bytes.subarray(i, i + chunkSize));
    }

    return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
  }

  function base64UrlToBytes(encoded) {
    var base64 = encoded.replace(/-/g, "+").replace(/_/g, "/");

    while (base64.length % 4) {
      base64 += "=";
    }

    var binary = atob(base64);
    var bytes = new Uint8Array(binary.length);

    for (var i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }

    return bytes;
  }

  function encodeMarkdownForShare(text) {
    var rawBytes = new TextEncoder().encode(text || "");

    if (!hasPakoDeflate()) {
      return PLAIN_SHARE_PREFIX + bytesToBase64Url(rawBytes);
    }

    return bytesToBase64Url(pako.deflate(rawBytes));
  }

  function decodeMarkdownFromShare(encoded) {
    if (encoded.startsWith(PLAIN_SHARE_PREFIX)) {
      return new TextDecoder().decode(base64UrlToBytes(encoded.slice(PLAIN_SHARE_PREFIX.length)));
    }

    if (!hasPakoInflate()) {
      throw new Error("Compressed share URLs require the pako compression library.");
    }

    return new TextDecoder().decode(pako.inflate(base64UrlToBytes(encoded)));
  }

  function isNeutralinoLocalOrigin() {
    var hostname = window.location.hostname;
    return typeof window.NL_VERSION !== "undefined"
      && (hostname === "127.0.0.1" || hostname === "localhost");
  }

  function normalizeShareBaseUrl(url) {
    var value = String(url || "").trim();
    if (!value) return "";

    return value.split("#")[0];
  }

  function getConfiguredPublicShareBaseUrl() {
    if (typeof window.MD_EDITOR_PUBLIC_SHARE_BASE_URL === "string") {
      return normalizeShareBaseUrl(window.MD_EDITOR_PUBLIC_SHARE_BASE_URL);
    }

    var meta = document.querySelector('meta[name="md-editor-public-share-base-url"]');
    if (meta) {
      return normalizeShareBaseUrl(meta.getAttribute("content"));
    }

    return normalizeShareBaseUrl(PUBLIC_SHARE_BASE_URL);
  }

  function getShareBaseUrl() {
    if (isNeutralinoLocalOrigin()) {
      return getConfiguredPublicShareBaseUrl() || window.location.origin + window.location.pathname;
    }

    return window.location.origin + window.location.pathname;
  }

  function enterSharedViewerMode() {
    document.documentElement.classList.add("shared-viewer");
    document.documentElement.classList.remove("is-starting");
    document.documentElement.classList.add("startup-ready", "startup-shell-ready");
    document.body.classList.add("shared-viewer");
    document.title = "Shared Markdown - MD-Editor";

    var contentContainer = document.querySelector(".content-container");
    if (contentContainer) {
      contentContainer.classList.remove("no-open-tabs", "view-editor-only", "view-split", "graph-view-active");
      contentContainer.classList.add("view-preview-only", "markdown-tab-active", "shared-viewer-active", "sidebar-hidden");
    }

    var legacyEditorTabView = document.getElementById("legacy-editor-tab-view");
    if (legacyEditorTabView) {
      legacyEditorTabView.hidden = false;
      legacyEditorTabView.setAttribute("aria-hidden", "false");
    }
  }

  function renderStandaloneSharedMarkdown(markdownText) {
    var preview = document.getElementById("markdown-preview");
    var editor = document.getElementById("markdown-editor");
    if (!preview) return;

    if (editor) editor.value = markdownText || "";

    var html = typeof marked !== "undefined" && marked?.parse
      ? marked.parse(markdownText || "")
      : "<pre>" + escapeHtml(markdownText || "") + "</pre>";
    preview.innerHTML = typeof DOMPurify !== "undefined" && DOMPurify?.sanitize
      ? DOMPurify.sanitize(html, {
          ADD_TAGS: ["mjx-container"],
          ADD_ATTR: ["id", "class", "style"]
        })
      : html;

    if (window.MathJax?.typesetPromise) {
      try {
        window.MathJax.typesetPromise([preview]).catch(function(error) {
          console.warn("MathJax typesetting failed:", error);
        });
      } catch (error) {
        console.warn("MathJax rendering failed:", error);
      }
    }
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  }

  function loadStandaloneSharedViewer() {
    var hash = window.location.hash;
    if (!hash.startsWith("#share=")) return false;

    var encoded = hash.slice("#share=".length);
    if (!encoded) return false;

    try {
      var decoded = decodeMarkdownFromShare(encoded);
      enterSharedViewerMode();
      renderStandaloneSharedMarkdown(decoded);
      return true;
    } catch (error) {
      console.error("Failed to load shared content:", error);
      alert("The shared URL could not be decoded. It may be corrupted or incomplete.");
      return false;
    }
  }

  function copyShareUrlFromText(markdownText, btn) {
    var encoded;

    try {
      encoded = encodeMarkdownForShare(markdownText || "");
    } catch (error) {
      console.error("Share encoding failed:", error);
      alert("Failed to encode content for sharing: " + error.message);
      return;
    }

    var shareUrl = getShareBaseUrl() + "#share=" + encoded;
    var tooLarge = shareUrl.length > MAX_SHARE_URL_LENGTH;
    var originalHTML = btn.innerHTML;
    var copiedHTML = '<i class="bi bi-check-lg"></i> Copied!';

    function onCopied() {
      if (!tooLarge && !isNeutralinoLocalOrigin()) {
        window.location.hash = "share=" + encoded;
      }

      btn.innerHTML = copiedHTML;
      setTimeout(function () {
        btn.innerHTML = originalHTML;
      }, 2000);
    }

    if (navigator.clipboard && window.isSecureContext) {
      navigator.clipboard.writeText(shareUrl).then(onCopied).catch(function () {
        // clipboard.writeText failed; nothing further to do in secure context
      });
      return;
    }

    try {
      var tempInput = document.createElement("textarea");
      tempInput.value = shareUrl;
      document.body.appendChild(tempInput);
      tempInput.select();
      document.execCommand("copy");
      document.body.removeChild(tempInput);
      onCopied();
    } catch (_) {
      // copy failed silently
    }
  }

  function registerShareUrl(app, deps) {
    function copyShareUrl(btn) {
      copyShareUrlFromText(deps.markdownEditor.value, btn);
    }

    function loadFromShareHash() {
      var hash = window.location.hash;
      if (!hash.startsWith("#share=")) return;

      var encoded = hash.slice("#share=".length);
      if (!encoded) return;

      try {
        var decoded = decodeMarkdownFromShare(encoded);
        enterSharedViewerMode();
        deps.markdownEditor.value = decoded;
        if (typeof deps.renderSharedMarkdown === "function") {
          deps.renderSharedMarkdown(decoded);
        } else {
          deps.renderEditorSyntaxHighlights();
          deps.renderMarkdown();
        }
      } catch (error) {
        console.error("Failed to load shared content:", error);
        alert("The shared URL could not be decoded. It may be corrupted or incomplete.");
      }
    }

    deps.shareButton.addEventListener("click", function () {
      copyShareUrl(deps.shareButton);
    });
    deps.mobileShareButton.addEventListener("click", function () {
      copyShareUrl(deps.mobileShareButton);
    });

    app.actions.copyShareUrl = copyShareUrl;
    app.actions.copyShareUrlFromText = copyShareUrlFromText;
    app.actions.loadFromShareHash = loadFromShareHash;
    app.registerModule("shareUrl", {
      copyShareUrl: copyShareUrl,
      copyShareUrlFromText: copyShareUrlFromText,
      loadFromShareHash: loadFromShareHash,
    });

    loadFromShareHash();
  }

  loadStandaloneSharedViewer();

  window.registerMarkdownViewerShareUrl = registerShareUrl;
})(window, document);
