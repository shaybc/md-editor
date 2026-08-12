(function(window) {
  "use strict";

  window.registerMarkdownViewerFilePreview = function registerMarkdownViewerFilePreview(app, deps) {
    const api = {};
    const previews = new Map();

    const MIME_BY_EXTENSION = {
      zip: "application/zip",
      jar: "application/java-archive",
      war: "application/java-archive",
      ear: "application/java-archive",
      pdf: "application/pdf",
      svg: "image/svg+xml",
      png: "image/png",
      jpg: "image/jpeg",
      jpeg: "image/jpeg",
      gif: "image/gif",
      webp: "image/webp",
      bmp: "image/bmp",
      ico: "image/x-icon",
      avif: "image/avif",
      mdimage: "application/vnd.md-editor.image+zip",
      mp3: "audio/mpeg",
      wav: "audio/wav",
      ogg: "audio/ogg",
      m4a: "audio/mp4",
      flac: "audio/flac",
      mp4: "video/mp4",
      webm: "video/webm",
      mov: "video/quicktime",
      m4v: "video/mp4"
    };

    function getFileName(path) {
      return typeof deps.getFileName === "function"
        ? deps.getFileName(path)
        : String(path || "").split(/[\\/]/).pop() || "";
    }

    function getFileExtension(path) {
      if (typeof deps.getFileExtension === "function") return deps.getFileExtension(path);
      const match = String(path || "").toLowerCase().match(/\.([a-z0-9+_-]+)$/i);
      return match ? match[1] : "";
    }

    function getSourceName(source) {
      return source?.name
        || (source?.path || source?.fullPath ? getFileName(source.path || source.fullPath) : "")
        || source?.file?.name
        || source?.handle?.name
        || "file";
    }

    function getPreviewMimeType(source = {}) {
      const explicitType = String(source.type || source.mimeType || source.file?.type || "").trim();
      if (explicitType) return explicitType;
      const extension = getFileExtension(getSourceName(source) || source.path || source.fullPath || "");
      return MIME_BY_EXTENSION[extension] || "application/octet-stream";
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
      if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${value} B`;
    }

    async function getBrowserFile(source) {
      if (source?.file) return source.file;
      if (source?.handle?.getFile) return source.handle.getFile();
      return null;
    }

    /**
     * Read a preview source as binary data through the active runtime.
     * @param {object} source - Desktop path or browser file source.
     * @returns {Promise<{data: ArrayBuffer|Uint8Array, mimeType: string, size: number}>} Binary preview payload.
     * @throws When the source cannot be read.
     */
    async function readPreviewBinaryData(source) {
      const mimeType = getPreviewMimeType(source);
      if (typeof deps.NL_VERSION !== "undefined" && source?.path) {
        const data = await deps.Neutralino.filesystem.readBinaryFile(source.path);
        const size = Number(data?.byteLength || data?.length || source?.size || 0);
        return { data, mimeType, size };
      }

      const file = await getBrowserFile(source);
      if (!file?.arrayBuffer) throw new Error("No readable file was provided.");
      const data = await file.arrayBuffer();
      return {
        data,
        mimeType: getPreviewMimeType({ ...source, file }),
        size: Number(file.size || data.byteLength || source?.size || 0)
      };
    }

    /**
     * Create a managed object URL and retain the source bytes for specialized viewers.
     * @param {object} source - Desktop path or browser file source.
     * @param {object} options - Set includeData for consumers that parse the binary payload.
     * @returns {Promise<{url: string, mimeType: string, size: number, data?: ArrayBuffer|Uint8Array}>} Preview resource.
     */
    async function createPreviewBlobUrl(source, options = {}) {
      if (options.includeData !== true && typeof deps.NL_VERSION === "undefined") {
        const file = await getBrowserFile(source);
        if (!file) throw new Error("No readable file was provided.");
        return {
          url: URL.createObjectURL(file),
          mimeType: getPreviewMimeType({ ...source, file }),
          size: Number(file.size || source?.size || 0)
        };
      }
      const binary = await readPreviewBinaryData(source);
      const blob = new Blob([binary.data], { type: binary.mimeType });
      return { ...binary, url: URL.createObjectURL(blob), size: blob.size || binary.size };
    }

    function createPreviewShell(tab) {
      const shell = document.createElement("div");
      shell.className = "file-preview-viewer";
      shell.innerHTML = `
        <div class="file-preview-toolbar">
          <div class="file-preview-title">
            <i class="bi bi-file-earmark" aria-hidden="true"></i>
            <span></span>
          </div>
          <span class="file-preview-meta"></span>
          <div class="file-preview-actions">
            <a class="file-preview-button file-preview-download" download>Download</a>
            <button class="file-preview-button file-preview-open-external" type="button">Open Externally</button>
          </div>
        </div>
        <div class="file-preview-stage" role="region" aria-label="File preview"></div>
      `;
      shell.querySelector(".file-preview-title span").textContent = tab.sourceFileName || tab.title || "File";
      return shell;
    }

    function getFilePreviewOpenSource(view) {
      const source = view?.source || view?.tab?.filePreviewSource || {};
      return {
        ...source,
        name: view?.tab?.sourceFileName || source.name || view?.tab?.title || "file",
        path: view?.tab?.sourceFilePath || source.path || source.fullPath || null,
        fullPath: source.fullPath || view?.tab?.sourceFilePath || source.path || null,
        handle: view?.tab?.sourceFileHandle || source.handle || null,
        file: source.file || null,
        size: Number(view?.size || source.size || 0)
      };
    }

    function canOpenFilePreviewWithDefaultApp(view) {
      return typeof deps.NL_VERSION !== "undefined" && !!view?.tab?.sourceFilePath && !!deps.Neutralino?.os?.open;
    }

    async function openFilePreviewWithDefaultApp(view) {
      if (!canOpenFilePreviewWithDefaultApp(view)) return;
      await deps.Neutralino.os.open(view.tab.sourceFilePath);
    }

    async function openFilePreviewAsTextFile(view) {
      if (typeof deps.openDocumentSourceFile !== "function") return;
      const source = getFilePreviewOpenSource(view);
      await deps.openDocumentSourceFile(source, {
        temporary: false,
        title: source.name || view?.tab?.title || "File",
        forceText: true,
        skipExistingSourceTab: true
      });
    }

    async function openFilePreviewInHexEditor(view) {
      if (typeof deps.openDocumentSourceFile !== "function") return;
      const source = getFilePreviewOpenSource(view);
      await deps.openDocumentSourceFile(source, {
        temporary: false,
        title: source.name || view?.tab?.title || "File",
        forceHex: true,
        skipExistingSourceTab: true
      });
    }

    function appendFallbackActions(fallback, view) {
      const actions = document.createElement("div");
      actions.className = "file-preview-fallback-actions";

      const openDefault = document.createElement("button");
      openDefault.className = "file-preview-button file-preview-fallback-button";
      openDefault.type = "button";
      openDefault.textContent = "Open with the default app";
      openDefault.hidden = !canOpenFilePreviewWithDefaultApp(view);
      openDefault.addEventListener("click", async () => {
        try {
          await openFilePreviewWithDefaultApp(view);
        } catch (error) {
          console.error("Failed to open file with default app:", error);
          alert("Unable to open this file with the default app.");
        }
      });

      const openAsText = document.createElement("button");
      openAsText.className = "file-preview-button file-preview-fallback-button";
      openAsText.type = "button";
      openAsText.textContent = "Open as a text file";
      openAsText.hidden = typeof deps.openDocumentSourceFile !== "function";
      openAsText.addEventListener("click", async () => {
        try {
          await openFilePreviewAsTextFile(view);
        } catch (error) {
          console.error("Failed to open file as text:", error);
          alert("Unable to open this file as text.");
        }
      });

      const openAsHex = document.createElement("button");
      openAsHex.className = "file-preview-button file-preview-fallback-button";
      openAsHex.type = "button";
      openAsHex.textContent = "Open in Hex Editor";
      openAsHex.hidden = typeof deps.openDocumentSourceFile !== "function";
      openAsHex.addEventListener("click", async () => {
        try {
          await openFilePreviewInHexEditor(view);
        } catch (error) {
          console.error("Failed to open file in hex editor:", error);
          alert("Unable to open this file in the hex editor.");
        }
      });

      actions.append(openDefault, openAsText, openAsHex);
      if (actions.querySelector("button:not([hidden])")) fallback.appendChild(actions);
    }

    function renderFallback(view, message) {
      view.stage.textContent = "";
      const fallback = document.createElement("div");
      fallback.className = "file-preview-fallback";
      const title = document.createElement("h2");
      const body = document.createElement("p");
      title.textContent = "Preview unavailable";
      body.textContent = message || "The browser could not display this file.";
      fallback.append(title, body);
      appendFallbackActions(fallback, view);
      view.stage.appendChild(fallback);
    }

    function canEmbedPreviewMimeType(mimeType) {
      const type = String(mimeType || "").toLowerCase();
      return type.startsWith("image/")
        || type.startsWith("audio/")
        || type.startsWith("video/")
        || type.startsWith("text/")
        || type === "application/pdf";
    }

    /**
     * Mount a browser-supported blob resource into a preview container.
     * @param {HTMLElement} stage - Container that will own the preview element.
     * @param {object} options - MIME type, object URL, accessible title, and error callback.
     * @returns {HTMLElement|null} Mounted media element, or null for unsupported MIME types.
     */
    function mountBlobPreview(stage, options = {}) {
      if (!stage) return null;
      stage.textContent = "";
      const type = String(options.mimeType || "").toLowerCase();
      let element = null;
      if (type.startsWith("image/")) {
        element = document.createElement("img");
        element.alt = options.title || "File preview";
      } else if (type.startsWith("audio/")) {
        element = document.createElement("audio");
        element.controls = true;
      } else if (type.startsWith("video/")) {
        element = document.createElement("video");
        element.controls = true;
      } else if (type === "application/pdf" || type.startsWith("text/")) {
        element = document.createElement("iframe");
        element.title = options.title || "File preview";
      } else {
        return null;
      }
      element.className = "file-preview-content";
      if (typeof options.onError === "function") element.addEventListener("error", options.onError);
      element.src = options.objectUrl || "";
      stage.appendChild(element);
      return element;
    }

    function bindActions(view) {
      const download = view.shell.querySelector(".file-preview-download");
      if (download) {
        download.href = view.objectUrl || "#";
        download.download = view.tab.sourceFileName || view.tab.title || "download";
      }
      const openExternal = view.shell.querySelector(".file-preview-open-external");
      if (openExternal) {
        const canOpen = typeof deps.NL_VERSION !== "undefined" && !!view.tab.sourceFilePath && deps.Neutralino?.os?.open;
        openExternal.hidden = !canOpen;
        openExternal.addEventListener("click", async () => {
          if (!canOpen) return;
          await deps.Neutralino.os.open(view.tab.sourceFilePath);
        });
      }
    }

    function renderPreviewElement(view) {
      const element = mountBlobPreview(view.stage, {
        mimeType: view.mimeType,
        objectUrl: view.objectUrl,
        title: view.tab.sourceFileName || view.tab.title || "File preview",
        onError: () => renderFallback(view)
      });
      if (!element) {
        renderFallback(view, "This file type may not be supported by the browser preview.");
        return;
      }
      view.element = element;
      if (String(view.mimeType || "").toLowerCase().startsWith("image/")) {
        const source = getFilePreviewOpenSource(view);
        deps.imagePreviewControls?.mount?.(view, {
          canEdit: deps.imageEditor?.canEditSource?.({ ...source, mimeType: view.mimeType }) === true,
          onEdit: function() {
            deps.openImageEditorInTab?.({ ...source, mimeType: view.mimeType });
          }
        });
      }
    }

    async function refreshImagePreviews(sourcePath) {
      const normalized = String(sourcePath || "").replace(/\\/g, "/").toLowerCase();
      if (!normalized) return;
      const matching = Array.from(previews.values()).filter(function(view) {
        return String(view?.tab?.sourceFilePath || "").replace(/\\/g, "/").toLowerCase() === normalized;
      });
      for (const view of matching) await mountFilePreviewTab(view.tab, view.root);
    }

    async function mountFilePreviewTab(tab, root) {
      if (!tab?.id || !root) return null;
      destroyFilePreviewTab(tab.id);
      root.innerHTML = "";
      const shell = createPreviewShell(tab);
      root.appendChild(shell);
      const view = {
        tab,
        tabId: tab.id,
        root,
        shell,
        stage: shell.querySelector(".file-preview-stage"),
        source: tab.filePreviewSource || null,
        objectUrl: null,
        mimeType: tab.filePreviewSource?.mimeType || "",
        size: Number(tab.filePreviewSource?.size || 0)
      };
      previews.set(tab.id, view);

      try {
        if (deps.archiveViewer?.isArchiveSource?.(tab.filePreviewSource || {})) {
          await deps.archiveViewer.mountArchivePreview(view);
          tab.filePreviewSource = {
            ...(tab.filePreviewSource || {}),
            mimeType: view.mimeType,
            size: view.size,
            file: null,
            handle: tab.filePreviewSource?.handle || null
          };
          shell.querySelector(".file-preview-meta").textContent = `${view.mimeType || "application/zip"} · ${formatBytes(view.size)}`;
          bindActions(view);
          const download = shell.querySelector(".file-preview-download");
          if (download) download.hidden = !view.objectUrl;
          return view;
        }
        const result = await createPreviewBlobUrl(tab.filePreviewSource || {});
        view.objectUrl = result.url;
        view.mimeType = result.mimeType;
        view.size = result.size || view.size;
        tab.filePreviewSource = {
          ...(tab.filePreviewSource || {}),
          mimeType: view.mimeType,
          size: view.size,
          file: null,
          handle: tab.filePreviewSource?.handle || null
        };
        shell.querySelector(".file-preview-meta").textContent = `${view.mimeType || "application/octet-stream"} · ${formatBytes(view.size)}`;
        bindActions(view);
        if (canEmbedPreviewMimeType(view.mimeType)) {
          renderPreviewElement(view);
        } else {
          renderFallback(view, "This file type may not be supported by the browser preview.");
        }
      } catch (error) {
        console.warn("Failed to open file preview:", error);
        shell.querySelector(".file-preview-meta").textContent = tab.filePreviewSource?.mimeType || "";
        bindActions(view);
        renderFallback(view, "Unable to read this file for preview.");
      }
      return view;
    }

    function destroyFilePreviewTab(tabId) {
      const view = previews.get(tabId);
      if (!view) return;
      deps.imagePreviewControls?.destroy?.(tabId);
      deps.archiveViewer?.destroyArchivePreview?.(tabId);
      if (view.objectUrl) URL.revokeObjectURL(view.objectUrl);
      view.root.innerHTML = "";
      previews.delete(tabId);
    }

    Object.assign(api, {
      MIME_BY_EXTENSION,
      getPreviewMimeType,
      canEmbedPreviewMimeType,
      readPreviewBinaryData,
      createPreviewBlobUrl,
      mountBlobPreview,
      mountFilePreviewTab,
      destroyFilePreviewTab,
      refreshImagePreviews,
      _test: { formatBytes }
    });

    app.services.filePreview = api;
    app.registerModule?.("filePreview", api);
    return api;
  };
})(window);
