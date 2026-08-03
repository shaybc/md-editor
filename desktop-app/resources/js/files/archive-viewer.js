// Archive file viewing: read-only navigation and entry previews for ZIP-based files.
(function(window) {
  "use strict";

  window.registerMarkdownViewerArchiveViewer = function registerMarkdownViewerArchiveViewer(app, deps) {
    const api = {};
    const archiveViews = new Map();
    const ARCHIVE_EXTENSIONS = new Set(["jar", "zip", "war", "ear"]);
    const MAX_ARCHIVE_BYTES = 256 * 1024 * 1024;
    const MAX_INLINE_ENTRY_BYTES = 8 * 1024 * 1024;
    const SPECIAL_TEXT_NAMES = new Set([
      "manifest.mf", "notice", "notice.txt", "license", "license.txt",
      "readme", "readme.txt", "pom.xml"
    ]);

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
        || getFileName(source?.path || source?.fullPath || "")
        || source?.file?.name
        || source?.handle?.name
        || "";
    }

    /**
     * Determine whether a source should open in the ZIP-family archive viewer.
     * @param {object|string} source - File source metadata or a file name.
     * @returns {boolean} True for JAR, ZIP, WAR, and EAR sources.
     */
    function isArchiveSource(source) {
      const name = typeof source === "string" ? source : getSourceName(source);
      return ARCHIVE_EXTENSIONS.has(getFileExtension(name));
    }

    function formatBytes(bytes) {
      const value = Number(bytes) || 0;
      if (value >= 1024 * 1024) return `${(value / 1024 / 1024).toFixed(1)} MB`;
      if (value >= 1024) return `${(value / 1024).toFixed(1)} KB`;
      return `${value} B`;
    }

    function getArchiveEntryPath(entry) {
      return String(entry?.unsafeOriginalName || entry?.name || "").replace(/\\/g, "/");
    }

    function getArchiveEntrySize(entry) {
      const size = Number(entry?._data?.uncompressedSize ?? entry?.uncompressedSize ?? 0);
      return Number.isFinite(size) && size > 0 ? size : 0;
    }

    function getSafeDownloadName(entryPath) {
      const segments = String(entryPath || "").replace(/\\/g, "/").split("/")
        .filter((segment) => segment && segment !== "." && segment !== "..");
      return segments.pop() || "archive-entry";
    }

    function isTextArchiveEntry(entryPath) {
      const name = getFileName(entryPath).toLowerCase();
      return SPECIAL_TEXT_NAMES.has(name) || deps.isKnownTextFilePath?.(entryPath) === true;
    }

    function createDirectoryNode(name, path) {
      return { kind: "directory", name, path, children: [], childNodes: new Map(), entry: null };
    }

    /**
     * Build a stable folder hierarchy from JSZip entries.
     * @param {object[]} entries - JSZip file and directory entries.
     * @returns {object} Root archive tree node. This function has no side effects.
     */
    function buildArchiveTree(entries) {
      const root = createDirectoryNode("", "");
      for (const entry of entries || []) {
        const entryPath = getArchiveEntryPath(entry);
        const segments = entryPath.split("/").filter(Boolean);
        if (!segments.length) continue;
        let parent = root;
        segments.forEach((segment, index) => {
          const isLast = index === segments.length - 1;
          const kind = isLast && !entry.dir ? "file" : "directory";
          const nodePath = segments.slice(0, index + 1).join("/");
          const key = `${kind}:${segment}`;
          let node = parent.childNodes.get(key);
          if (!node) {
            node = kind === "directory"
              ? createDirectoryNode(segment, nodePath)
              : { kind: "file", name: segment, path: entryPath, children: [], entry };
            parent.childNodes.set(key, node);
            parent.children.push(node);
          }
          if (isLast) node.entry = entry;
          parent = node;
        });
      }
      sortArchiveTree(root);
      return root;
    }

    function sortArchiveTree(node) {
      if (!node?.children) return;
      node.children.sort((left, right) => {
        if (left.kind !== right.kind) return left.kind === "directory" ? -1 : 1;
        return left.name.localeCompare(right.name, undefined, { numeric: true, sensitivity: "base" });
      });
      node.children.forEach(sortArchiveTree);
    }

    /**
     * Filter an archive hierarchy by full path while retaining matching parents.
     * @param {object} root - Root node returned by buildArchiveTree.
     * @param {string} query - Case-insensitive path fragment.
     * @returns {object} Filtered tree copy. This function has no side effects.
     */
    function filterArchiveTree(root, query) {
      const normalizedQuery = String(query || "").trim().toLowerCase();
      if (!normalizedQuery) return root;
      function filterNode(node) {
        const children = (node.children || []).map(filterNode).filter(Boolean);
        const matches = String(node.path || "").toLowerCase().includes(normalizedQuery);
        if (node === root || matches || children.length) return { ...node, children };
        return null;
      }
      return filterNode(root);
    }

    function createArchiveShell() {
      const shell = document.createElement("div");
      shell.className = "archive-viewer";
      shell.innerHTML = `
        <aside class="archive-viewer-sidebar" aria-label="Archive contents">
          <div class="archive-viewer-search-row">
            <i class="bi bi-search" aria-hidden="true"></i>
            <input class="archive-viewer-search" type="search" placeholder="Search archive paths" aria-label="Search archive paths">
          </div>
          <div class="archive-viewer-count" aria-live="polite"></div>
          <div class="archive-viewer-tree" role="tree"></div>
        </aside>
        <section class="archive-viewer-entry" aria-label="Archive entry preview">
          <div class="archive-viewer-entry-toolbar">
            <div class="archive-viewer-entry-heading">
              <strong class="archive-viewer-entry-name">Archive contents</strong>
              <span class="archive-viewer-entry-meta"></span>
            </div>
            <button class="file-preview-button archive-viewer-download-entry" type="button" hidden>Download Entry</button>
          </div>
          <div class="archive-viewer-entry-stage"></div>
        </section>
      `;
      return shell;
    }

    function createMessage(titleText, bodyText, className) {
      const message = document.createElement("div");
      message.className = className || "archive-viewer-message";
      const title = document.createElement("h2");
      const body = document.createElement("p");
      title.textContent = titleText;
      body.textContent = bodyText;
      message.append(title, body);
      return message;
    }

    function renderArchiveSummary(view) {
      releaseEntryPreviewUrl(view);
      view.entryName.textContent = "Archive contents";
      view.entryMeta.textContent = "";
      view.downloadButton.hidden = true;
      view.entryStage.textContent = "";
      const fileCount = view.entries.filter((entry) => !entry.dir).length;
      const directoryCount = view.entries.filter((entry) => entry.dir).length;
      view.entryStage.appendChild(createMessage(
        view.entries.length ? "Select an entry to preview" : "This archive is empty",
        view.entries.length
          ? `${fileCount} files and ${directoryCount} directories are available.`
          : "No files or directories were found in this archive."
      ));
    }

    function releaseEntryPreviewUrl(view) {
      if (!view?.entryObjectUrl) return;
      URL.revokeObjectURL(view.entryObjectUrl);
      view.entryObjectUrl = null;
    }

    function renderEntryMetadata(view, entry, message) {
      view.entryStage.textContent = "";
      view.entryStage.appendChild(createMessage(
        "Preview unavailable",
        message || "This binary entry cannot be previewed. You can still download it."
      ));
      const details = document.createElement("dl");
      details.className = "archive-viewer-entry-details";
      const values = [
        ["Path", getArchiveEntryPath(entry)],
        ["Size", formatBytes(getArchiveEntrySize(entry))],
        ["Modified", entry.date instanceof Date ? entry.date.toLocaleString() : "Unknown"]
      ];
      values.forEach(([label, value]) => {
        const term = document.createElement("dt");
        const description = document.createElement("dd");
        term.textContent = label;
        description.textContent = value;
        details.append(term, description);
      });
      view.entryStage.appendChild(details);
    }

    async function renderSelectedEntry(view, entry) {
      releaseEntryPreviewUrl(view);
      const entryPath = getArchiveEntryPath(entry);
      const entrySize = getArchiveEntrySize(entry);
      view.selectedEntry = entry;
      view.entryName.textContent = entryPath;
      view.entryMeta.textContent = formatBytes(entrySize);
      view.downloadButton.hidden = false;
      view.entryStage.textContent = "";
      if (entrySize > MAX_INLINE_ENTRY_BYTES) {
        renderEntryMetadata(view, entry, `Entries larger than ${formatBytes(MAX_INLINE_ENTRY_BYTES)} are download-only.`);
        return;
      }
      try {
        if (isTextArchiveEntry(entryPath)) {
          const text = await entry.async("string");
          if (view.selectedEntry !== entry) return;
          const pre = document.createElement("pre");
          pre.className = "archive-viewer-text-preview";
          pre.textContent = text;
          view.entryStage.appendChild(pre);
          return;
        }
        const mimeType = deps.filePreview?.getPreviewMimeType?.({ name: entryPath }) || "application/octet-stream";
        if (!deps.filePreview?.canEmbedPreviewMimeType?.(mimeType)) {
          renderEntryMetadata(view, entry);
          return;
        }
        const blob = await entry.async("blob");
        if (view.selectedEntry !== entry) return;
        view.entryObjectUrl = URL.createObjectURL(blob);
        const mounted = deps.filePreview?.mountBlobPreview?.(view.entryStage, {
          mimeType,
          objectUrl: view.entryObjectUrl,
          title: entryPath,
          onError: () => {
            if (view.selectedEntry === entry) renderEntryMetadata(view, entry);
          }
        });
        if (!mounted) renderEntryMetadata(view, entry);
      } catch (error) {
        console.warn("Failed to preview archive entry:", entryPath, error);
        renderEntryMetadata(view, entry, "Unable to decompress this entry for preview.");
      }
    }

    function createTreeNodeElement(view, node, expandMatches) {
      const item = document.createElement("li");
      item.className = `archive-viewer-tree-node is-${node.kind}`;
      item.setAttribute("role", "treeitem");
      const button = document.createElement("button");
      button.type = "button";
      button.className = "archive-viewer-tree-button";
      const icon = document.createElement("i");
      icon.className = node.kind === "directory" ? "bi bi-folder" : "bi bi-file-earmark";
      icon.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.textContent = node.name;
      button.append(icon, label);
      item.appendChild(button);
      if (node.kind === "directory") {
        const children = document.createElement("ul");
        children.className = "archive-viewer-tree-group";
        children.setAttribute("role", "group");
        children.hidden = !expandMatches;
        button.setAttribute("aria-expanded", String(expandMatches));
        button.addEventListener("click", () => {
          children.hidden = !children.hidden;
          button.setAttribute("aria-expanded", String(!children.hidden));
          icon.className = children.hidden ? "bi bi-folder" : "bi bi-folder2-open";
        });
        node.children.forEach((child) => children.appendChild(createTreeNodeElement(view, child, expandMatches)));
        item.appendChild(children);
      } else {
        button.title = node.path;
        button.addEventListener("click", () => {
          view.tree.querySelectorAll(".archive-viewer-tree-button.is-selected")
            .forEach((element) => element.classList.remove("is-selected"));
          button.classList.add("is-selected");
          void renderSelectedEntry(view, node.entry);
        });
      }
      return item;
    }

    function renderArchiveTree(view, query) {
      view.tree.textContent = "";
      const filteredTree = filterArchiveTree(view.treeModel, query);
      const group = document.createElement("ul");
      group.className = "archive-viewer-tree-root";
      group.setAttribute("role", "group");
      const expandMatches = Boolean(String(query || "").trim());
      filteredTree.children.forEach((node) => group.appendChild(createTreeNodeElement(view, node, expandMatches)));
      view.tree.appendChild(group);
      const visibleFiles = countTreeFiles(filteredTree);
      view.count.textContent = expandMatches
        ? `${visibleFiles} matching ${visibleFiles === 1 ? "file" : "files"}`
        : `${view.entries.length} ${view.entries.length === 1 ? "entry" : "entries"}`;
    }

    function countTreeFiles(node) {
      if (node.kind === "file") return 1;
      return (node.children || []).reduce((count, child) => count + countTreeFiles(child), 0);
    }

    async function downloadSelectedEntry(view) {
      const entry = view?.selectedEntry;
      if (!entry || typeof deps.saveAs !== "function") return;
      const originalText = view.downloadButton.textContent;
      view.downloadButton.disabled = true;
      view.downloadButton.textContent = "Preparing...";
      try {
        const blob = await entry.async("blob");
        deps.saveAs(blob, getSafeDownloadName(getArchiveEntryPath(entry)));
      } catch (error) {
        console.error("Failed to download archive entry:", error);
        renderEntryMetadata(view, entry, "Unable to decompress this entry for download.");
      } finally {
        view.downloadButton.disabled = false;
        view.downloadButton.textContent = originalText;
      }
    }

    function renderArchiveError(view, message) {
      view.stage.textContent = "";
      view.stage.appendChild(createMessage("Unable to open archive", message, "archive-viewer-message is-error"));
    }

    /**
     * Mount an archive browser inside an existing file-preview view.
     * @param {object} previewView - Managed file-preview view and source metadata.
     * @returns {Promise<object>} The mounted preview view.
     */
    async function mountArchivePreview(previewView) {
      const source = previewView?.source || previewView?.tab?.filePreviewSource || {};
      const declaredSize = Number(source.size || previewView?.size || 0);
      if (declaredSize > MAX_ARCHIVE_BYTES) {
        renderArchiveError(previewView, `Archives larger than ${formatBytes(MAX_ARCHIVE_BYTES)} are not opened.`);
        return previewView;
      }
      try {
        const binary = await deps.filePreview.createPreviewBlobUrl(source, { includeData: true });
        previewView.objectUrl = binary.url;
        previewView.mimeType = binary.mimeType;
        previewView.size = binary.size || declaredSize;
        if (previewView.size > MAX_ARCHIVE_BYTES) {
          URL.revokeObjectURL(previewView.objectUrl);
          previewView.objectUrl = null;
          renderArchiveError(previewView, `Archives larger than ${formatBytes(MAX_ARCHIVE_BYTES)} are not opened.`);
          return previewView;
        }
        const zip = await deps.JSZip.loadAsync(binary.data);
        const entries = Object.values(zip.files || {});
        const shell = createArchiveShell();
        previewView.stage.textContent = "";
        previewView.stage.appendChild(shell);
        const view = {
          tabId: previewView.tabId,
          stage: previewView.stage,
          shell,
          entries,
          treeModel: buildArchiveTree(entries),
          tree: shell.querySelector(".archive-viewer-tree"),
          count: shell.querySelector(".archive-viewer-count"),
          entryName: shell.querySelector(".archive-viewer-entry-name"),
          entryMeta: shell.querySelector(".archive-viewer-entry-meta"),
          entryStage: shell.querySelector(".archive-viewer-entry-stage"),
          downloadButton: shell.querySelector(".archive-viewer-download-entry"),
          selectedEntry: null,
          entryObjectUrl: null
        };
        archiveViews.set(previewView.tabId, view);
        shell.querySelector(".archive-viewer-search").addEventListener("input", (event) => {
          renderArchiveTree(view, event.target.value);
        });
        view.downloadButton.addEventListener("click", () => void downloadSelectedEntry(view));
        renderArchiveTree(view, "");
        renderArchiveSummary(view);
        return previewView;
      } catch (error) {
        console.warn("Failed to open ZIP-family archive:", error);
        renderArchiveError(previewView, "The archive is malformed, encrypted, or unreadable.");
        return previewView;
      }
    }

    /**
     * Release entry preview resources owned by an archive tab.
     * @param {string} tabId - Managed file-preview tab identifier.
     */
    function destroyArchivePreview(tabId) {
      const view = archiveViews.get(tabId);
      if (!view) return;
      releaseEntryPreviewUrl(view);
      archiveViews.delete(tabId);
    }

    Object.assign(api, {
      MAX_ARCHIVE_BYTES,
      MAX_INLINE_ENTRY_BYTES,
      isArchiveSource,
      mountArchivePreview,
      destroyArchivePreview,
      _test: {
        buildArchiveTree,
        filterArchiveTree,
        getArchiveEntryPath,
        getArchiveEntrySize,
        getSafeDownloadName,
        isTextArchiveEntry,
        countTreeFiles,
        renderSelectedEntry,
        downloadSelectedEntry,
        releaseEntryPreviewUrl,
        formatBytes
      }
    });

    app.services.archiveViewer = api;
    app.registerModule?.("archiveViewer", api);
    return api;
  };
})(window);
