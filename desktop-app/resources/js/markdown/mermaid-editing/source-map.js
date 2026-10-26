/* Exact Mermaid diagram/label ranges and preview ownership; never regenerate source from SVG. */
(function(global) {
  "use strict";
  const previewContexts = new WeakMap();
  const diagrams = new WeakMap();
  const shapes = [["[[", "]]"], ["[(", ")]"], ["([", "])"], ["((", "))"],
    ["{{", "}}"], ["[/", "/]"], ["[\\", "\\]"], ["[/", "\\]"], ["[\\", "/]"],
    ["[", "]"], ["(", ")"], ["{", "}"], [">", "]"]];

  function decodeLabel(text) {
    const entities = { quot: '"', amp: "&", lt: "<", gt: ">", nbsp: " " };
    return text.replace(/<br\s*\/?\s*>/gi, "\n").replace(/(?:&|#)(quot|amp|lt|gt|nbsp|\d+);/g,
      function(match, value) { return entities[value] ?? (Number(value) <= 0x10ffff ? String.fromCodePoint(Number(value)) : match); });
  }

  /** Encode plain label text for Mermaid's quoted-label syntax, preserving literal punctuation. */
  function encodeLabel(text) {
    return '"' + String(text).replace(/[&#"<>]/g, c => "#" + c.codePointAt(0) + ";")
      .replace(/\r\n?|\n/g, "<br/>") + '"';
  }

  function readLabel(source, start, opening, closing) {
    let quote = false;
    for (let i = start + opening.length; i < source.length; i++) {
      if (source[i] === '"') quote = !quote;
      if (!quote && source.startsWith(closing, i)) {
        const innerStart = start + opening.length;
        const raw = source.slice(innerStart, i);
        const trimmed = raw.trim();
        const content = trimmed.startsWith('"') && trimmed.endsWith('"') ? trimmed.slice(1, -1) : trimmed;
        const editable = !/[`]/.test(content) && !/<(?!br\s*\/?\s*>)[^>]*>/i.test(content);
        return { end: i + closing.length, labelStart: innerStart, labelEnd: i,
          originalText: decodeLabel(content), editable,
          reason: editable ? "" : "Rich HTML or Markdown labels are read-only." };
      }
    }
    return null;
  }

  /** Scan supported flowchart declarations without interpreting labels, comments, or edge text as nodes. */
  function scanNodes(source) {
    const nodes = new Map();
    let i = 0;
    let expectedNode = true;
    let supported = true;
    const header = source.match(/^(?:\s|%%[^\n]*(?:\n|$))*\s*(?:flowchart|graph)\s+(?:TB|TD|BT|LR|RL)\b/);
    if (!header) return { nodes, supported: false, reason: "Editing supports flowchart node labels." };
    i = header[0].length;
    while (i < source.length) {
      if (/\s/.test(source[i]) || source[i] === ";") {
        if (source[i] === "\n" || source[i] === ";") expectedNode = true;
        i++; continue;
      }
      if (source.startsWith("%%", i)) {
        const end = source.indexOf("\n", i);
        i = end < 0 ? source.length : end;
        continue;
      }
      if (expectedNode && /^(?:direction|subgraph|end|style|classDef|class|click|linkStyle|accTitle|accDescr)\b/.test(source.slice(i))) {
        const end = source.slice(i).search(/[;\n]/);
        i = end < 0 ? source.length : i + end;
        continue;
      }
      if (!expectedNode) {
        if (source.startsWith(":::" , i)) {
          const style = source.slice(i).match(/^:::[\w-]+/);
          if (!style) { supported = false; break; }
          i += style[0].length; continue;
        }
        if (source[i] === "&") { i++; expectedNode = true; continue; }
        const arrow = source.slice(i).match(/^(?:[<ox])?(?:-{2,}|={2,}|-\.+-)(?:[>ox])?/);
        if (!arrow) { supported = false; break; }
        i += arrow[0].length;
        // Text between two link markers is an edge label, not a node declaration.
        if (/^(?:--|==|~-)$/.test(arrow[0])) {
          const tail = source.slice(i).match(/^[ \t]+[^\n;]*?[ \t]+(?:--+|==+|\.+-)>?/);
          if (tail) i += tail[0].length;
        }
        while (/[ \t]/.test(source[i] || "\u0000")) i++;
        if (source[i] === "|") {
          const end = source.indexOf("|", i + 1);
          if (end < 0) { supported = false; break; }
          i = end + 1;
        }
        expectedNode = true; continue;
      }
      const match = source.slice(i).match(/^[\p{L}\p{N}_][\p{L}\p{N}_.-]*/u);
      const nodeId = match?.[0].replace(/-+$/, "");
      if (!nodeId) { supported = false; break; }
      const idStart = i;
      i += nodeId.length;
      const idEnd = i;
      while (/[ \t]/.test(source[i] || "\u0000")) i++;
      let label = null;
      const matchingShapes = shapes.filter(([opening]) => source.startsWith(opening, i));
      const openingLength = Math.max(0, ...matchingShapes.map(([opening]) => opening.length));
      // Slanted shapes share an opening marker but use different closers. Take the first
      // matching closer, never a later node's closer across an intervening connection.
      for (const [opening, closing] of matchingShapes) {
        if (opening.length !== openingLength) continue;
        const candidate = readLabel(source, i, opening, closing);
        if (candidate && (!label || candidate.end < label.end)) label = candidate;
      }
      if (label) {
        nodes.set(nodeId, global.createMarkdownViewerMermaidComponent(nodeId, label));
        i = label.end;
      } else if (source.startsWith("@{", i)) {
        // Property declarations can override prior labels; do not patch a stale declaration.
        nodes.set(nodeId, global.createMarkdownViewerMermaidComponent(nodeId));
        supported = false; break;
      } else if (!nodes.has(nodeId)) {
        nodes.set(nodeId, global.createMarkdownViewerMermaidComponent(nodeId, {
          labelStart: idEnd, labelEnd: idEnd, originalText: nodeId, implicit: true,
          idStart, editable: true, reason: ""
        }));
      }
      expectedNode = false;
    }
    if (!supported) nodes.forEach(node => { node.editable = false; node.reason = "This diagram contains unsupported source syntax."; });
    return { nodes, supported, reason: supported ? "" : "This diagram contains unsupported source syntax." };
  }

  /** Locate standalone source or top-level Markdown fences, retaining document offsets and line endings. */
  function findDiagrams(source, standalone) {
    if (standalone) return [{ start: 0, end: source.length, source }];
    const blocks = [];
    const lines = [...source.matchAll(/[^\n]*(?:\n|$)/g)];
    let fence = null;
    for (const line of lines) {
      const match = line[0].match(/^ {0,3}(`{3,}|~{3,})([^\r\n]*)/);
      if (!match) continue;
      if (!fence) {
        fence = { marker: match[1][0], length: match[1].length,
          mermaid: /^mermaid(?:\s|$)/i.test(match[2].trim()), start: line.index + line[0].length };
      } else if (match[1][0] === fence.marker && match[1].length >= fence.length && !match[2].trim()) {
        if (fence.mermaid) blocks.push({ start: fence.start, end: line.index, source: source.slice(fence.start, line.index) });
        fence = null;
      }
    }
    if (fence?.mermaid) blocks.push({ start: fence.start, end: source.length, source: source.slice(fence.start) });
    return blocks;
  }

  /** Bind a rendered preview to its document snapshot before asynchronous SVG generation starts. */
  function setPreviewContext(preview, source, tab, standalone) {
    previewContexts.set(preview, { source, tabId: tab?.id, readOnly: tab?.transformedForViewing === true,
      blocks: findDiagrams(source, standalone) });
  }

  /** Associate containers by fence order; refuse incomplete mappings rather than guess between diagrams. */
  function capturePreview(preview) {
    const context = previewContexts.get(preview);
    if (!context) return;
    const containers = [...preview.querySelectorAll(".mermaid-container")];
    if (containers.length !== context.blocks.length) {
      containers.forEach(container => diagrams.delete(container));
      return;
    }
    containers.forEach((container, index) => {
      const block = context.blocks[index];
      diagrams.set(container, Object.assign({}, context, block, {
        documentSource: context.source, diagramId: context.tabId + ":" + index,
        ...scanNodes(block.source)
      }));
    });
  }

  /** Apply draft label changes from right to left, leaving every unrelated source character intact. */
  function patchDiagram(diagram, changes) {
    const patches = [];
    changes.forEach((text, id) => {
      const node = diagram.nodes.get(id);
      if (!node?.editable) throw new Error("This node cannot be edited safely.");
      const encoded = encodeLabel(text);
      patches.push({ start: node.labelStart, end: node.labelEnd, text: node.implicit ? "[" + encoded + "]" : encoded });
    });
    return patches.sort((a, b) => b.start - a.start).reduce((source, patch) =>
      source.slice(0, patch.start) + patch.text + source.slice(patch.end), diagram.source);
  }

  global.MarkdownViewerMermaidSourceMap = {
    scanNodes, findDiagrams, encodeLabel, patchDiagram, setPreviewContext, capturePreview,
    get: container => diagrams.get(container) || null
  };
})(window);
