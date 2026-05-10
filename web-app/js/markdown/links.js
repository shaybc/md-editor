(function(global) {
  global.registerMarkdownViewerMarkdownLinks = function registerMarkdownViewerMarkdownLinks(app, deps) {
    const api = {};

    with (deps) {
    function getWikiLinkParts(rawLink) {
    const value = String(rawLink || "").trim();
    const pipeIndex = value.indexOf("|");
    const target = (pipeIndex >= 0 ? value.slice(0, pipeIndex) : value).trim();
    const label = (pipeIndex >= 0 ? value.slice(pipeIndex + 1) : target).trim() || target;
    return { target, label };
  }

  function isExternalOrSpecialLinkTarget(target) {
    return /^(?:[a-z][a-z0-9+.-]*:|#|\/\/)/i.test(String(target || "").trim());
  }

  function isExternalWebLinkTarget(target) {
    return /^(?:https?:\/\/|\/\/)/i.test(String(target || "").trim());
  }

  function normalizeExternalWebLinkTarget(target) {
    const trimmedTarget = String(target || "").trim();
    return trimmedTarget.startsWith("//") ? `${window.location.protocol}${trimmedTarget}` : trimmedTarget;
  }

  async function openExternalWebLink(target) {
    const url = normalizeExternalWebLinkTarget(target);
    if (!url) return;

    try {
      if (typeof Neutralino !== "undefined" && Neutralino.os && typeof Neutralino.os.open === "function") {
        await Neutralino.os.open(url);
        return;
      }
    } catch (error) {
      console.error("Failed to open external link with the OS:", error);
    }

    window.open(url, "_blank", "noopener,noreferrer");
  }

  function getWikiLinkHref(target) {
    const trimmedTarget = String(target || "").trim();
    if (!trimmedTarget) return "#";
    if (trimmedTarget.startsWith("#")) return trimmedTarget;
    if (isExternalOrSpecialLinkTarget(trimmedTarget)) return "#";

    const hashIndex = trimmedTarget.indexOf("#");
    const pathPart = hashIndex >= 0 ? trimmedTarget.slice(0, hashIndex) : trimmedTarget;
    const suffix = hashIndex >= 0 ? trimmedTarget.slice(hashIndex) : "";
    const pathWithExtension = /\.[^/\\]+$/.test(pathPart) ? pathPart : `${pathPart}.md`;
    return encodeURI(`${pathWithExtension}${suffix}`);
  }

  function splitLinkTarget(target) {
    const rawTarget = String(target || "").trim();
    const hashIndex = rawTarget.indexOf("#");
    const queryIndex = rawTarget.indexOf("?");
    const cutIndexes = [hashIndex, queryIndex].filter((index) => index >= 0);
    const firstCutIndex = cutIndexes.length ? Math.min(...cutIndexes) : -1;
    const path = firstCutIndex >= 0 ? rawTarget.slice(0, firstCutIndex) : rawTarget;
    const suffix = firstCutIndex >= 0 ? rawTarget.slice(firstCutIndex) : "";
    const hash = hashIndex >= 0 ? rawTarget.slice(hashIndex + 1).split("?")[0] : "";
    return { path, suffix, hash };
  }

  function safeDecodeLinkPath(path) {
    try {
      return decodeURIComponent(String(path || ""));
    } catch (_) {
      return String(path || "");
    }
  }

  function normalizeMarkdownLinkPath(path) {
    const normalized = safeDecodeLinkPath(path)
      .replace(/\\/g, "/")
      .replace(/^\.\//, "");
    const segments = [];

    normalized.split("/").forEach((segment) => {
      if (!segment || segment === ".") return;
      if (segment === "..") {
        if (segments.length && segments[segments.length - 1] !== "..") {
          segments.pop();
        } else {
          segments.push(segment);
        }
        return;
      }
      segments.push(segment);
    });

    return segments.join("/");
  }

  function getDirectoryPath(path) {
    const normalized = String(path || "").replace(/\\/g, "/");
    const index = normalized.lastIndexOf("/");
    return index >= 0 ? normalized.slice(0, index) : "";
  }

  function getLinkPathExtension(path) {
    const fileName = getFileName(splitLinkTarget(path).path);
    const extensionMatch = fileName.match(/\.([^.]*)$/);
    return extensionMatch ? extensionMatch[1].toLowerCase() : "";
  }

  function isMarkdownDocumentLinkPath(path) {
    const { path: targetPath } = splitLinkTarget(path);
    if (!targetPath) return false;
    const extension = getLinkPathExtension(targetPath);
    return !extension || extension === "md" || extension === "markdown";
  }

  function ensureMarkdownLinkExtension(path) {
    if (!path || getLinkPathExtension(path)) return path;
    return `${path}.md`;
  }

  function isSameOriginMarkdownUrl(target) {
    try {
      const url = new URL(String(target || ""), window.location.href);
      return url.origin === window.location.origin && isMarkdownDocumentLinkPath(url.pathname);
    } catch (_) {
      return false;
    }
  }

  function getSameOriginMarkdownUrlPath(target) {
    const url = new URL(String(target || ""), window.location.href);
    return `${url.pathname.replace(/^\/+/, "")}${url.search}${url.hash}`;
  }

  function isAbsoluteFilesystemPath(path) {
    const value = String(path || "");
    return /^[a-zA-Z]:[\\/]/.test(value) || /^\\\\/.test(value) || value.startsWith("/");
  }

  function normalizeFilesystemLinkPath(path) {
    const rawPath = safeDecodeLinkPath(path).replace(/\\/g, "/");
    const driveMatch = rawPath.match(/^[a-zA-Z]:\//);
    const prefix = driveMatch ? driveMatch[0] : (rawPath.startsWith("/") ? "/" : "");
    const pathWithoutPrefix = prefix ? rawPath.slice(prefix.length) : rawPath;
    return prefix + normalizeMarkdownLinkPath(pathWithoutPrefix);
  }

  function resolveMarkdownLinkPath(targetPath, basePath) {
    const decodedTarget = safeDecodeLinkPath(targetPath).replace(/\\/g, "/");
    if (!decodedTarget) return "";
    if (isAbsoluteFilesystemPath(decodedTarget)) {
      return normalizeFilesystemLinkPath(decodedTarget);
    }

    const decodedBasePath = safeDecodeLinkPath(basePath || "").replace(/\\/g, "/");
    if (isAbsoluteFilesystemPath(decodedBasePath)) {
      const baseDirectory = getDirectoryPath(decodedBasePath);
      return normalizeFilesystemLinkPath(baseDirectory ? `${baseDirectory}/${decodedTarget}` : decodedTarget);
    }

    const normalizedBasePath = normalizeMarkdownLinkPath(decodedBasePath);
    const baseDirectory = getDirectoryPath(normalizedBasePath);
    return normalizeMarkdownLinkPath(baseDirectory ? `${baseDirectory}/${decodedTarget}` : decodedTarget);
  }

  function getActiveMarkdownSourcePath() {
    const activeTab = getActiveMarkdownTab();
    return activeTab && activeTab.sourceFilePath ? activeTab.sourceFilePath : "";
  }

  function getFolderEntryPathCandidates(entry) {
    const candidates = [
      entry && entry.path,
      entry && entry.fullPath,
      entry && entry.file && entry.file.webkitRelativePath,
      entry && entry.file && entry.file.name
    ];
    return candidates
      .filter(Boolean)
      .map((path) => normalizeMarkdownLinkPath(path));
  }

  function findOpenFolderMarkdownEntry(resolvedPath, rawTargetPath) {
    const normalizedResolvedPath = normalizeMarkdownLinkPath(resolvedPath);
    const normalizedRawTargetPath = normalizeMarkdownLinkPath(ensureMarkdownLinkExtension(rawTargetPath || ""));
    const rawTargetIsBareFileName = !!normalizedRawTargetPath && !normalizedRawTargetPath.includes("/");
    const rawTargetFileName = rawTargetIsBareFileName ? getFileName(normalizedRawTargetPath).toLowerCase() : "";
    const resolvedWithoutFolderRoot = activeFolderName && normalizedResolvedPath.startsWith(`${activeFolderName}/`)
      ? normalizedResolvedPath.slice(activeFolderName.length + 1)
      : normalizedResolvedPath;

    const exactMatch = (folderMarkdownFiles || []).find((entry) => {
      const candidates = getFolderEntryPathCandidates(entry);
      return candidates.some((candidate) => {
        const candidateWithoutFolderRoot = activeFolderName && candidate.startsWith(`${activeFolderName}/`)
          ? candidate.slice(activeFolderName.length + 1)
          : candidate;
        return candidate === normalizedResolvedPath
          || candidate === resolvedWithoutFolderRoot
          || candidateWithoutFolderRoot === normalizedResolvedPath
          || candidateWithoutFolderRoot === resolvedWithoutFolderRoot;
      });
    });

    if (exactMatch || !rawTargetIsBareFileName) return exactMatch || null;

    return (folderMarkdownFiles || []).find((entry) => {
      return getFolderEntryPathCandidates(entry).some((candidate) => {
        return getFileName(candidate).toLowerCase() === rawTargetFileName;
      });
    }) || null;
  }

  function getMarkdownLinkSourceFile(target) {
    const { path: rawTargetPath } = splitLinkTarget(target);
    if (!rawTargetPath || !isMarkdownDocumentLinkPath(rawTargetPath)) return null;

    const targetPath = ensureMarkdownLinkExtension(rawTargetPath);
    const activeSourcePath = getActiveMarkdownSourcePath();
    const resolvedPath = resolveMarkdownLinkPath(targetPath, activeSourcePath);
    const folderEntry = findOpenFolderMarkdownEntry(resolvedPath, rawTargetPath);

    if (folderEntry) {
      return {
        name: folderEntry.name || getFileName(folderEntry.path || folderEntry.fullPath || targetPath),
        file: folderEntry.file || null,
        handle: folderEntry.handle || null,
        path: folderEntry.fullPath || folderEntry.path || resolvedPath
      };
    }

    if (typeof NL_VERSION !== "undefined") {
      if (isAbsoluteFilesystemPath(resolvedPath)) {
        return {
          name: getFileName(resolvedPath),
          path: resolvedPath
        };
      }
      if (activeFolderPath) {
        const folderRelativePath = normalizeMarkdownLinkPath(resolvedPath).replace(new RegExp(`^${activeFolderName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}/`), "");
        const fullPath = joinPath(activeFolderPath, folderRelativePath);
        return {
          name: getFileName(fullPath),
          path: fullPath
        };
      }
    }

    return null;
  }

  function scrollMarkdownPreviewToHash(hash) {
    if (!hash) return;
    requestAnimationFrame(() => {
      const decodedHash = safeDecodeLinkPath(String(hash).replace(/^#/, ""));
      const target = markdownPreview.querySelector(`#${CSS.escape(decodedHash)}`)
        || markdownPreview.querySelector(`[name="${CSS.escape(decodedHash)}"]`);
      if (target && typeof target.scrollIntoView === "function") {
        target.scrollIntoView({ behavior: "smooth", block: "start" });
      }
    });
  }

  async function openMarkdownLinkFromPreview(rawTarget) {
    const { hash } = splitLinkTarget(rawTarget);
    const sourceFile = getMarkdownLinkSourceFile(rawTarget);

    if (!sourceFile) {
      alert("Unable to open this Markdown link. Open the containing folder or use the desktop app so MD-Editor can read linked local files.");
      return;
    }

    const existingTab = findTabForSourceFile(sourceFile);
    if (existingTab) {
      switchTab(existingTab.id);
      pinTemporaryTab(existingTab.id);
      scrollMarkdownPreviewToHash(hash);
      return;
    }

    try {
      const openedTab = await openDocumentSourceFile(sourceFile);
      if (openedTab) {
        pinTemporaryTab(openedTab.id);
        scrollMarkdownPreviewToHash(hash);
      }
    } catch (error) {
      console.error("Failed to open linked Markdown file:", error);
      alert("Unable to open linked Markdown file.");
    }
  }

  function annotatePreviewMarkdownLinks(container) {
    if (!container) return;

    container.querySelectorAll("a[href]").forEach((anchor) => {
      const rawHref = anchor.getAttribute("href") || "";
      if (!rawHref || rawHref.startsWith("#")) return;

      let markdownTarget = "";
      if (!isExternalOrSpecialLinkTarget(rawHref) && isMarkdownDocumentLinkPath(rawHref)) {
        markdownTarget = rawHref;
      } else if (isSameOriginMarkdownUrl(rawHref)) {
        markdownTarget = getSameOriginMarkdownUrlPath(rawHref);
      }

      if (!markdownTarget) return;

      anchor.dataset.markdownLinkTarget = markdownTarget;
      anchor.setAttribute("href", "#");
      anchor.setAttribute("role", "button");
      anchor.title = anchor.title || `Open Markdown file: ${splitLinkTarget(markdownTarget).path}`;
    });
  }

  function getPreviewLinkStatusUrl(anchor) {
    if (!anchor) return "";

    const markdownTarget = anchor.dataset.markdownLinkTarget || "";
    if (markdownTarget) return markdownTarget;

    const rawHref = anchor.getAttribute("href") || "";
    if (!rawHref) return "";

    return anchor.href || rawHref;
  }

  function handlePreviewLinkMouseOver(event) {
    const anchor = event.target.closest("a[href], a[data-markdown-link-target]");
    if (!anchor || !markdownPreview.contains(anchor)) return;

    previewHoveredLinkUrl = getPreviewLinkStatusUrl(anchor);
    updateStatusLine();
  }

  function handlePreviewLinkMouseOut(event) {
    const anchor = event.target.closest("a[href], a[data-markdown-link-target]");
    if (!anchor || !markdownPreview.contains(anchor)) return;
    if (event.relatedTarget && anchor.contains(event.relatedTarget)) return;

    previewHoveredLinkUrl = "";
    updateStatusLine();
  }

  function handlePreviewLinkClick(event) {
    const anchor = event.target.closest("a[href], a[data-markdown-link-target]");
    if (!anchor || !markdownPreview.contains(anchor)) return;

    const markdownTarget = anchor.dataset.markdownLinkTarget || "";
    const rawHref = markdownTarget || anchor.getAttribute("href") || "";
    if (!rawHref) return;

    if (!markdownTarget && rawHref.startsWith("#") && rawHref.length > 1) {
      event.preventDefault();
      event.stopPropagation();
      scrollMarkdownPreviewToHash(rawHref);
      return;
    }

    let linkTarget = rawHref;
    if (!markdownTarget && isSameOriginMarkdownUrl(rawHref)) {
      linkTarget = getSameOriginMarkdownUrlPath(rawHref);
    } else if (!markdownTarget && isExternalWebLinkTarget(rawHref)) {
      event.preventDefault();
      event.stopPropagation();
      openExternalWebLink(rawHref);
      return;
    } else if (!markdownTarget && isExternalOrSpecialLinkTarget(rawHref)) {
      return;
    }

    if (!isMarkdownDocumentLinkPath(linkTarget)) return;

    event.preventDefault();
    event.stopPropagation();
    openMarkdownLinkFromPreview(linkTarget);
  }

  function createWikiLinkAnchor(rawLink) {
    const { target, label } = getWikiLinkParts(rawLink);
    const anchor = document.createElement("a");
    anchor.className = "wiki-link";
    anchor.href = getWikiLinkHref(target);
    anchor.textContent = label;
    anchor.title = `Wiki link: ${target}`;
    anchor.dataset.wikiTarget = target;
    return anchor;
  }

  function shouldSkipWikiLinkTextNode(node) {
    const parent = node && node.parentElement;
    return !parent || !!parent.closest("a, code, pre, script, style, textarea");
  }

  function enhanceWikiLinks(container) {
    if (!container) return;

    const textNodes = [];
    const walker = document.createTreeWalker(container, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        if (shouldSkipWikiLinkTextNode(node) || !/\[\[[^\]\n]+\]\]/.test(node.nodeValue || "")) {
          return NodeFilter.FILTER_REJECT;
        }
        return NodeFilter.FILTER_ACCEPT;
      }
    });

    let node;
    while ((node = walker.nextNode())) textNodes.push(node);

    textNodes.forEach((textNode) => {
      const fragment = document.createDocumentFragment();
      const text = textNode.nodeValue || "";
      const wikiLinkRegex = /\[\[([^\]\n]+)\]\]/g;
      let lastIndex = 0;
      let match;

      while ((match = wikiLinkRegex.exec(text)) !== null) {
        if (match.index > lastIndex) {
          fragment.appendChild(document.createTextNode(text.slice(lastIndex, match.index)));
        }
        fragment.appendChild(createWikiLinkAnchor(match[1]));
        lastIndex = wikiLinkRegex.lastIndex;
      }

      if (lastIndex < text.length) {
        fragment.appendChild(document.createTextNode(text.slice(lastIndex)));
      }

      textNode.parentNode.replaceChild(fragment, textNode);
    });
  }


      api.getWikiLinkParts = getWikiLinkParts;
      api.isExternalOrSpecialLinkTarget = isExternalOrSpecialLinkTarget;
      api.isExternalWebLinkTarget = isExternalWebLinkTarget;
      api.normalizeExternalWebLinkTarget = normalizeExternalWebLinkTarget;
      api.openExternalWebLink = openExternalWebLink;
      api.getWikiLinkHref = getWikiLinkHref;
      api.splitLinkTarget = splitLinkTarget;
      api.safeDecodeLinkPath = safeDecodeLinkPath;
      api.normalizeMarkdownLinkPath = normalizeMarkdownLinkPath;
      api.getDirectoryPath = getDirectoryPath;
      api.getLinkPathExtension = getLinkPathExtension;
      api.isMarkdownDocumentLinkPath = isMarkdownDocumentLinkPath;
      api.ensureMarkdownLinkExtension = ensureMarkdownLinkExtension;
      api.isSameOriginMarkdownUrl = isSameOriginMarkdownUrl;
      api.getSameOriginMarkdownUrlPath = getSameOriginMarkdownUrlPath;
      api.isAbsoluteFilesystemPath = isAbsoluteFilesystemPath;
      api.normalizeFilesystemLinkPath = normalizeFilesystemLinkPath;
      api.resolveMarkdownLinkPath = resolveMarkdownLinkPath;
      api.getActiveMarkdownSourcePath = getActiveMarkdownSourcePath;
      api.getFolderEntryPathCandidates = getFolderEntryPathCandidates;
      api.findOpenFolderMarkdownEntry = findOpenFolderMarkdownEntry;
      api.getMarkdownLinkSourceFile = getMarkdownLinkSourceFile;
      api.scrollMarkdownPreviewToHash = scrollMarkdownPreviewToHash;
      api.openMarkdownLinkFromPreview = openMarkdownLinkFromPreview;
      api.annotatePreviewMarkdownLinks = annotatePreviewMarkdownLinks;
      api.getPreviewLinkStatusUrl = getPreviewLinkStatusUrl;
      api.handlePreviewLinkMouseOver = handlePreviewLinkMouseOver;
      api.handlePreviewLinkMouseOut = handlePreviewLinkMouseOut;
      api.handlePreviewLinkClick = handlePreviewLinkClick;
      api.createWikiLinkAnchor = createWikiLinkAnchor;
      api.shouldSkipWikiLinkTextNode = shouldSkipWikiLinkTextNode;
      api.enhanceWikiLinks = enhanceWikiLinks;
    }

    return api;
  };
})(window);
