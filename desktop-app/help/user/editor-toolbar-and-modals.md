---
tags: []
---
# Editor Toolbar And Modal Actions

The formatting toolbar sits above the editor when a Markdown or text tab is active. Graph tabs, large-file viewer tabs, compare tabs, and preview-only contexts hide it.

![Editor formatting toolbar](../img/editor-toolbar-zoomed.png)

## Direct Formatting

| Action | Output |
| --- | --- |
| Bold | `**text**` |
| Italic | `*text*` |
| Strikethrough | `~~text~~` |
| Inline code | `` `text` `` |
| Fenced code | Triple-backtick code block. |
| Blockquote | `> ` line prefixes. |
| Headings H1-H6 | `#` through `######` heading prefixes. |
| Bulleted list | `- ` line prefixes. |
| Numbered list | `1.`, `2.`, `3.` line prefixes. |
| Task list | `- [ ] ` line prefixes. |
| Horizontal rule | `---` |
| Title case, uppercase, lowercase | Text case conversion. |

## Modal Actions

| Action | Modal Purpose |
| --- | --- |
| Clear formatting | Confirm stripping Markdown markers from the selected text. |
| Link | Insert a standard Markdown inline link. |
| Reference | Insert a reference-style link and append its definition. |
| Image | Insert an image from URL or a local file path. |
| Alert | Insert a GitHub-style alert block. |
| Symbols | Search and insert HTML entities or symbols. |
| Emoji shortcode | Search and insert emoji shortcodes. |
| Find and Replace | Open the editor find/replace bar. |
| Sort Lines | Open the sort dialog from Tools and apply sorting options to the current document. |

## Link, Image, And Reference Details

The link modal uses the selected text as the default link label. The image modal can convert a chosen desktop file path into a relative path when the file is inside the opened folder. Reference links append the definition at the end of the document.

## Alerts

The alert modal supports `NOTE`, `TIP`, `IMPORTANT`, `WARNING`, and `CAUTION`.

```markdown
> [!WARNING]
> Confirm production settings before running this command.
```

## Implementation Notes

Toolbar buttons are declared in `desktop-app/resources/index.html` with `data-editor-format-action`. The main dispatch and modal handlers currently live in `desktop-app/resources/js/script.js`, while reusable Markdown selection transforms live in `desktop-app/resources/js/editor/context-menu.js`.

Previous: [Markdown Reference](markdown-reference.md)  
Next: [Search Workflow Details](search-workflows.md)
