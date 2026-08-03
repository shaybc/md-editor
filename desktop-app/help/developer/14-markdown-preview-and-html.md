---
tags: []
---
# 14. Markdown Preview And HTML Internals

Markdown, generated Help pages, and HTML previews use separate paths so user-authored Markdown stays sanitized while HTML files can still be inspected safely.

## Markdown Pipeline

Main files:

| File | Responsibility |
| --- | --- |
| `resources/js/markdown/render.js` | Main preview render path, cache, post-processing, and HTML preview routing. |
| `resources/js/markdown/renderer-config.js` | Marked renderer setup and Mermaid code-block handling. |
| `resources/js/markdown/frontmatter.js` | YAML frontmatter parsing and preview table rendering. |
| `resources/js/markdown/links.js` | Local links, Help links, heading anchors, and external link handling. |
| `resources/js/markdown/mermaid-tools.js` | Mermaid zoom, copy, SVG export, and PNG export controls. |

`renderMarkdownContent(target, markdown, options)` is the safest entry point for rendering Markdown into a supplied container. It applies the configured Markdown renderer and post-render enhancements.

`renderMarkdown(options)` renders the active tab preview. It checks `shouldRenderMarkdownPreview()` so editor-only or non-Markdown tabs do not do unnecessary preview work.

## Frontmatter

Frontmatter can appear at the top of the file or after a title prefix. Parsed metadata is rendered as a preview table when enabled and is also used by graph extraction, tags, generated source links, and workspace search metadata.

Do not change frontmatter parsing in isolation. Check graph extraction, tag editing, workspace search, and generated-doc source-root flows when adding fields.

## Mermaid And MathJax

Mermaid code fences are rendered as diagram containers, then initialized after the Markdown HTML is in the preview. MathJax runs after the sanitized Markdown content is mounted.

Mermaid toolbars are added after diagrams exist in the DOM. Export/copy actions depend on the rendered Mermaid SVG, not just the source code fence.

## Preview Cache And Large Documents

The renderer can reuse preview output when the active content has not changed. Large document paths avoid expensive re-rendering where possible and route unsupported or very large content through file preview or large-file viewer modules.

## HTML Preview Path

HTML source files are rendered into a sandboxed iframe instead of passing through the Markdown pipeline. The iframe path avoids direct `file://` asset loading problems in the Neutralino HTTP origin.

For local HTML assets:

- Local CSS links can be read and inlined.
- Local image references can be rewritten to `blob:` URLs.
- Existing `http:`, `https:`, `data:`, `blob:`, protocol-relative, and anchor references are left alone.
- The iframe uses sandbox attributes to limit direct access while still allowing useful preview behavior.

Previous: [13. Startup, Tabs, And Session Restore](13-startup-tabs-and-session.md)  
Next: [15. Folder Tree And Context Menus](15-folder-tree-context-menus.md)
