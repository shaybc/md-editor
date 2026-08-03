---
tags: []
---
# 9. Tips And Tricks

These patterns make MD-Editor faster in daily use.

## Use Open File By Name In Large Folders

When a folder contains thousands of entries, do not manually expand everything. Press <kbd>Ctrl</kbd> + <kbd>Shift</kbd> + <kbd>N</kbd>, type part of the filename, and open the result directly.

Business benefit: this keeps large workspaces practical and avoids wasting attention on folder navigation.

## Keep Generated Docs Separate

When converting source code to Markdown, choose an output folder separate from the original source tree. Open that generated folder in MD-Editor after conversion.

Business benefit: generated documentation becomes easy to delete, regenerate, compare, graph, and commit independently.

## Use Tags As Review Lanes

Add tags such as `review`, `api`, `architecture`, `deprecated`, or `todo` to Markdown files. Then use tag filters in the folder tree or Graph View.

Business benefit: tags let you build task-specific views without moving files around.

## Use Graph Health Before Handoff

Before sharing a graph archive or generated code map, run graph health checks and review missing links or unresolved dependencies.

Business benefit: health checks catch broken relationships before another person relies on the documentation.

## Use Split View For Tables And Diagrams

Tables, Mermaid diagrams, and MathJax are easiest to author in Split mode because syntax mistakes become visible quickly.

Business benefit: live feedback reduces the cost of fixing formatting errors.

## Keep Confirmation Prompts On For Destructive Actions

Rename, delete, discard, reset, and bulk actions can change real local files. Keep confirmations enabled unless you have a stable workflow.

Business benefit: a small prompt is cheaper than recovering deleted or overwritten work.

Previous: [8. AI Companion](08-ai-companion/index.md)
Next: [10. Frequently Asked Questions](faq.md)