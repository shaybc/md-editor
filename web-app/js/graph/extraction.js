(function(global) {
  global.registerMarkdownViewerGraphExtraction = function registerMarkdownViewerGraphExtraction(app, deps) {
    const api = {};

    with (deps) {
    function normalizeGraphNodeName(path) {
    return (path || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .replace(/\.(md|markdown)$/i, "")
      .replace(/\/+/g, "/")
      .toLowerCase();
  }

  function getGraphDisplayLabel(path) {
    const normalized = (path || "").replace(/\\/g, "/").replace(/\/+/g, "/");
    const fileName = normalized.split("/").pop() || normalized;
    return fileName.replace(/\.(md|markdown)$/i, "") || fileName;
  }

  function getGraphContextMenuTitle(node) {
    const source = node?.fullPath || node?.label || node?.id || "";
    const normalized = String(source).replace(/\\/g, "/").replace(/\/+/g, "/");
    const fileName = normalized.split("/").pop() || normalized || "Untitled";
    return fileName.replace(/\.[^/.]+$/, "") || fileName;
  }

  function createGraphTargetLookup(nodeIndex) {
    const sourceIndex = nodeIndex instanceof Map ? nodeIndex : new Map();
    return { nodeIndex: sourceIndex };
  }

  function normalizeGraphReferencePath(path) {
    const normalizedParts = [];
    String(path || "")
      .replace(/\\/g, "/")
      .replace(/^\/+/, "")
      .split("/")
      .forEach((part) => {
        if (!part || part === ".") return;
        if (part === "..") {
          normalizedParts.pop();
          return;
        }
        normalizedParts.push(part);
      });

    return normalizedParts.join("/");
  }

  function resolveGraphTargetId(reference, sourcePath, nodeIndex) {
    const ref = (reference || "").trim();
    if (!ref) return null;
    if (/^(https?:)?\/\//i.test(ref)) return null;
    const sourceIndex = nodeIndex?.nodeIndex instanceof Map ? nodeIndex.nodeIndex : nodeIndex;
    if (!(sourceIndex instanceof Map)) return null;

    const cleanedRef = ref
      .replace(/^\.\//, "")
      .replace(/^\/+/, "")
      .replace(/\\/g, "/");

    const sourceDir = String(sourcePath || "").replace(/\\/g, "/").split("/").slice(0, -1).join("/");
    const relativeCandidate = normalizeGraphNodeName(normalizeGraphReferencePath(sourceDir ? `${sourceDir}/${cleanedRef}` : cleanedRef));
    if (sourceIndex.has(relativeCandidate)) return relativeCandidate;

    const directCandidate = normalizeGraphNodeName(normalizeGraphReferencePath(cleanedRef));
    if (sourceIndex.has(directCandidate)) return directCandidate;

    return null;
  }

  function stripMarkdownCodeForLinkExtraction(markdown) {
    return String(markdown || "")
      .replace(/```[\s\S]*?```/g, "")
      .replace(/~~~[\s\S]*?~~~/g, "")
      .replace(/`[^`\n]*`/g, "");
  }

  function getMarkdownLinkTarget(rawDestination) {
    const destination = String(rawDestination || "").trim();
    if (!destination) return "";

    const angleMatch = destination.match(/^<([^>]+)>/);
    if (angleMatch) return angleMatch[1].trim();

    const titleSeparatorMatch = destination.match(/^(\S+)(?:\s+["'(].*)?$/);
    return (titleSeparatorMatch ? titleSeparatorMatch[1] : destination).trim();
  }

  function normalizeExtractedLinkTarget(link) {
    const target = String(link || "").split("#")[0].split("?")[0].trim();
    if (!target || isExternalOrSpecialLinkTarget(target)) return "";

    try {
      return decodeURIComponent(target);
    } catch (_error) {
      return target;
    }
  }

  function getMarkdownFrontmatterMatch(markdown) {
    return String(markdown || "").match(/^---\r?\n([\s\S]*?)\r?\n---(?:\r?\n|$)/);
  }

  function normalizeTagName(tag) {
    const normalized = String(tag || "")
      .trim()
      .replace(/^#+/, "")
      .trim();

    return normalized ? normalized.toLowerCase() : "";
  }

  function collectNormalizedTags(tags, values) {
    values.forEach((value) => {
      if (Array.isArray(value)) {
        collectNormalizedTags(tags, value);
        return;
      }

      const normalized = normalizeTagName(value);
      if (normalized) tags.add(normalized);
    });
  }

  function extractYamlFrontmatterTags(frontmatterText) {
    const tags = new Set();

    if (typeof jsyaml !== "undefined" && jsyaml?.load) {
      try {
        const data = jsyaml.load(frontmatterText) || {};
        if (data && Object.prototype.hasOwnProperty.call(data, "tags")) {
          const tagValue = data.tags;
          collectNormalizedTags(tags, Array.isArray(tagValue) ? tagValue : [tagValue]);
        }
        return Array.from(tags);
      } catch (error) {
        console.warn("Frontmatter tags YAML parse error:", error);
      }
    }

    const inlineTagsMatch = frontmatterText.match(/^\s*tags\s*:\s*\[([^\]]*)\]\s*$/im);
    if (inlineTagsMatch) {
      collectNormalizedTags(tags, inlineTagsMatch[1].split(","));
    }

    const multilineTagsMatch = frontmatterText.match(/^\s*tags\s*:\s*(?:#.*)?(?:\r?\n((?:\s*-\s*[^\r\n]+\r?\n?)+))/im);
    if (multilineTagsMatch) {
      collectNormalizedTags(
        tags,
        multilineTagsMatch[1]
          .split(/\r?\n/)
          .map((line) => line.replace(/^\s*-\s*/, ""))
      );
    }

    return Array.from(tags);
  }


  function getFileTagsFromContent(content) {
    const source = String(content || "");
    const frontmatterMatch = getMarkdownFrontmatterMatch(source);
    if (!frontmatterMatch) return [];
    return extractYamlFrontmatterTags(frontmatterMatch[1]);
  }

  function normalizeFileTagList(tags) {
    const normalizedTags = [];
    const seenTags = new Set();

    (Array.isArray(tags) ? tags : [tags]).forEach((tag) => {
      const normalizedTag = normalizeTagName(tag);
      if (!normalizedTag || seenTags.has(normalizedTag)) return;
      seenTags.add(normalizedTag);
      normalizedTags.push(normalizedTag);
    });

    return normalizedTags;
  }

  function setFileTagsInContent(content, tags) {
    const source = String(content || "");
    const normalizedTags = normalizeFileTagList(tags);
    const frontmatterMatch = getMarkdownFrontmatterMatch(source);
    let frontmatterData = {};
    let body = source;

    if (frontmatterMatch) {
      body = source.slice(frontmatterMatch[0].length);
      if (typeof jsyaml !== "undefined" && jsyaml?.load) {
        try {
          const parsedFrontmatter = jsyaml.load(frontmatterMatch[1]);
          if (parsedFrontmatter && typeof parsedFrontmatter === "object" && !Array.isArray(parsedFrontmatter)) {
            frontmatterData = parsedFrontmatter;
          }
        } catch (error) {
          console.warn("Frontmatter tags YAML parse error:", error);
        }
      }
    }

    frontmatterData.tags = normalizedTags;

    const yaml = typeof jsyaml !== "undefined" && jsyaml?.dump
      ? jsyaml.dump(frontmatterData, { lineWidth: -1, noRefs: true }).trimEnd()
      : `tags:
${normalizedTags.map((tag) => `  - ${tag}`).join("\n")}`;

    return `---
${yaml}
---
${body}`;
  }

  function addTagToContent(content, tag) {
    const normalizedTag = normalizeTagName(tag);
    if (!normalizedTag) return String(content || "");
    return setFileTagsInContent(content, [...getFileTagsFromContent(content), normalizedTag]);
  }

  function removeTagFromContent(content, tag) {
    const normalizedTag = normalizeTagName(tag);
    if (!normalizedTag) return String(content || "");
    return setFileTagsInContent(
      content,
      getFileTagsFromContent(content).filter((existingTag) => existingTag !== normalizedTag)
    );
  }

  function extractMarkdownTags(markdown) {
    const tags = new Set();
    const source = String(markdown || "");
    const frontmatterMatch = getMarkdownFrontmatterMatch(source);
    const bodyMarkdown = frontmatterMatch ? source.slice(frontmatterMatch[0].length) : source;
    const searchableMarkdown = stripMarkdownCodeForLinkExtraction(bodyMarkdown);
    const inlineTagRegex = /(^|[^\p{L}\p{N}_\/-])#([\p{L}\p{N}][\p{L}\p{N}_-]*(?:\/[\p{L}\p{N}][\p{L}\p{N}_-]*)*)/gu;
    let match;

    if (frontmatterMatch) {
      collectNormalizedTags(tags, extractYamlFrontmatterTags(frontmatterMatch[1]));
    }

    while ((match = inlineTagRegex.exec(searchableMarkdown)) !== null) {
      const normalized = normalizeTagName(match[2]);
      if (normalized) tags.add(normalized);
    }

    return Array.from(tags);
  }

  function extractMarkdownLinks(markdown) {
    const links = [];
    const searchableMarkdown = stripMarkdownCodeForLinkExtraction(markdown);
    const mdLinkRegex = /\[[^\]\n]*?\]\(([^)]+)\)/g;
    const wikiLinkRegex = /\[\[([^\]\n]+)\]\]/g;
    let match;

    while ((match = mdLinkRegex.exec(searchableMarkdown)) !== null) {
      if (searchableMarkdown[match.index - 1] !== "!") {
        links.push(getMarkdownLinkTarget(match[1]));
      }
    }

    while ((match = wikiLinkRegex.exec(searchableMarkdown)) !== null) {
      links.push(getWikiLinkParts(match[1]).target);
    }

    return links.map(normalizeExtractedLinkTarget).filter(Boolean);
  }


      api.normalizeGraphNodeName = normalizeGraphNodeName;
      api.getGraphDisplayLabel = getGraphDisplayLabel;
      api.getGraphContextMenuTitle = getGraphContextMenuTitle;
      api.createGraphTargetLookup = createGraphTargetLookup;
      api.resolveGraphTargetId = resolveGraphTargetId;
      api.stripMarkdownCodeForLinkExtraction = stripMarkdownCodeForLinkExtraction;
      api.getMarkdownLinkTarget = getMarkdownLinkTarget;
      api.normalizeExtractedLinkTarget = normalizeExtractedLinkTarget;
      api.getMarkdownFrontmatterMatch = getMarkdownFrontmatterMatch;
      api.normalizeTagName = normalizeTagName;
      api.collectNormalizedTags = collectNormalizedTags;
      api.extractYamlFrontmatterTags = extractYamlFrontmatterTags;
      api.getFileTagsFromContent = getFileTagsFromContent;
      api.normalizeFileTagList = normalizeFileTagList;
      api.setFileTagsInContent = setFileTagsInContent;
      api.addTagToContent = addTagToContent;
      api.removeTagFromContent = removeTagFromContent;
      api.extractMarkdownTags = extractMarkdownTags;
      api.extractMarkdownLinks = extractMarkdownLinks;
    }

    return api;
  };
})(window);
