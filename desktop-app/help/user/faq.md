---
tags: []
---
# 10. Frequently Asked Questions

## Is MD-Editor a desktop app or a web app?

This guide documents MD-Editor as a desktop app. The runtime UI and assets live under `desktop-app/resources`, the launcher is `desktop-app/run-neutralino.js`, and native features use Neutralino desktop APIs.

## What is the business value of opening folders instead of single files?

A folder gives the app context. With folder context, MD-Editor can build a tree, restore recent workspace state, resolve local links, power workspace search, create graphs, manage source-root metadata, and connect generated Markdown back to source files.

## Why use Graph View?

Graph View helps you see relationships that are hard to notice in a flat folder tree: central files, missing dependencies, isolated notes, generated source relationships, tag groups, and broken links.

## Does MD-Editor upload my files?

No. Normal editing, preview, graphing, exporting, tab state, and preferences are local. Network access is limited to user-requested workflows such as GitHub import, setup downloads, provider-backed AI features, or opening external links.

## Where are my settings stored?

Preferences and desktop profile data are stored locally. Some folder-specific metadata can be stored in a `.md-editor` folder inside the opened workspace.

## Why does a very large folder open lazily?

Lazy loading keeps large folder trees usable by loading child folders on demand instead of expanding every nested item immediately. This makes it possible to work in folders that would otherwise freeze the UI.

## Can I edit non-Markdown files?

Yes. MD-Editor can open many text and code files. Markdown-specific preview and export features are available for Markdown content, while other supported files use the editor or specialized viewers.

## Can I use Graph View with normal notes?

Yes. Markdown links, wiki links, headings, and tags can become graph relationships. Generated code maps add source dependency relationships.

## Where should developers start?

Start with the [Developer Guide](../developer/index.md). It maps features to files, modules, and key functions.

Previous: [9. Tips And Tricks](tips-and-tricks.md)
Next: [11. Desktop Setup And Troubleshooting](desktop-setup-and-troubleshooting.md)