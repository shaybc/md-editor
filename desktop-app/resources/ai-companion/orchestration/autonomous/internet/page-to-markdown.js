/** Bounded conversion of retrieved text and HTML into model-readable Markdown. */

"use strict";

/** Convert a supported page body while removing scripts, styles, and hidden metadata. */
function pageToMarkdown(body, contentType = "", limit = 120000) {
  const source = String(body || "");
  if (!/html|xhtml/i.test(contentType) && !/<(?:html|body|article|main)[\s>]/i.test(source)) return source.slice(0, limit);
  const cleaned = source
    .replace(/<!--[\s\S]*?-->/g, "")
    .replace(/<(script|style|noscript|svg|canvas|template|iframe)\b[^>]*>[\s\S]*?<\/\1>/gi, "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/(p|div|section|article|main|header|footer|li|tr|h[1-6])>/gi, "\n")
    .replace(/<h([1-6])\b[^>]*>/gi, (_match, level) => `${"#".repeat(Number(level))} `)
    .replace(/<li\b[^>]*>/gi, "- ")
    .replace(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi, (_match, href, label) => `[${stripTags(label).trim() || href}](${href})`)
    .replace(/<[^>]+>/g, " ");
  return decodeEntities(cleaned).replace(/[ \t]+/g, " ").replace(/ *\n */g, "\n").replace(/\n{3,}/g, "\n\n").trim().slice(0, limit);
}

function stripTags(value) { return String(value || "").replace(/<[^>]+>/g, " "); }
function decodeEntities(value) {
  return String(value || "").replace(/&(#x?[0-9a-f]+|amp|lt|gt|quot|apos|nbsp);/gi, (_match, entity) => {
    const key = entity.toLowerCase();
    if (key === "amp") return "&"; if (key === "lt") return "<"; if (key === "gt") return ">"; if (key === "quot") return '"'; if (key === "apos") return "'"; if (key === "nbsp") return " ";
    const number = key.startsWith("#x") ? parseInt(key.slice(2), 16) : parseInt(key.slice(1), 10);
    return Number.isFinite(number) ? String.fromCodePoint(number) : _match;
  });
}

module.exports = { pageToMarkdown };
