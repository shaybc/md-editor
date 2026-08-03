---
tags: []
---
# 2. Runtime And Resources

This chapter maps the desktop runtime folder and the resource-loading behavior. If the app starts but a feature cannot find a file, start here.

## 2.1. Important Paths

```text
desktop-app/
|-- run-neutralino.js
|-- neutralino.config.json
|-- package.json
|-- resources/
|   |-- index.html
|   |-- styles.css
|   |-- js/
|   |-- assets/
|   |-- bridges/
|   |-- ai-companion/
|   `-- vendor/
|-- converters/
|-- tests/
`-- help/
```

| Path | Meaning |
| --- | --- |
| `resources/index.html` | The actual UI shell loaded by Neutralino. |
| `resources/js/script.js` | Main composition layer and remaining legacy runtime logic. |
| `resources/js/core/context.js` | Shared constants and app-context construction. |
| `resources/assets/` | Icons, screenshots, badges, and visual resources. |
| `help/` | New user/developer Markdown documentation. |
| `tests/` | Desktop unit/source and Playwright tests. |
| `converters/` | Code-to-Markdown converter implementations. |

## 2.2. Resource Loading

Neutralino serves `desktop-app/resources` as `/resources/`. Normal browser-style fetches resolve inside that document root. Files outside `resources`, such as `desktop-app/help`, must be read through desktop filesystem candidates.

Relevant functions:

| Function | File | Detail |
| --- | --- | --- |
| `readBundledDesktopMarkdown(normalizedPath)` | `resources/js/script.js` | Reads Markdown through `Neutralino.filesystem.readFile()`. It checks direct `help/` paths and resource paths. |
| `fetchBundledWikiMarkdown(wikiPath)` | `resources/js/script.js` | Fetches bundled Help/wiki Markdown and falls back to HTTP fetch candidates. |
| `fetchHelpHomeMarkdown()` | `resources/js/script.js` | Returns `help/user/index.md`. |
| `openHelpHome()` | `resources/js/script.js` | Opens the Help tab in preview mode with `linkBasePath: "help/user/index.md"`. |
| `isBundledWikiPath(path)` | `resources/js/markdown/links.js` | Allows both `wiki/` and `help/` during the transition period. |
| `openBundledWikiLinkFromPreview(rawTarget)` | `resources/js/markdown/links.js` | Opens relative Help links in tabs instead of treating them like external links. |

## 2.3. README And LICENSE Bundling

`run-neutralino.js` has helper logic for temporarily bundling root documents during Neutralino builds. The relevant functions are:

- `getBundledRootDocumentEntries(rootDir)`
- `bundleRootDocumentsForBuild(rootDir)`
- `restoreBundledRootDocuments(states)`

These functions exist so app surfaces such as README and License can be opened from inside the desktop app without permanently duplicating root files.

## 2.4. Profile Directory

Profile data is based on constants from `resources/js/core/context.js`, loaded by `run-neutralino.js` as:

```js
require(path.join(ROOT_DIR, "resources", "js", "core", "context.js"))
```

The important exported object is `MARKDOWN_VIEWER_SHARED_CONSTANTS`. It keeps profile naming consistent between the launcher and renderer.

Profile-related runtime functions include:

- `hydrateTabsSessionFromProfile()` in `resources/js/script.js`
- `restoreLastFolderOnStartupIfNeeded()` in `resources/js/script.js`
- `restoreTabsFromPayload()` in `resources/js/tabs/persistence.js`
- `createProfilePayload()` in `resources/js/tabs/persistence.js`
- `scheduleGlobalProfileWrite()` in recent/profile modules

## 2.5. When To Touch This Area

Edit runtime/resource code when:

- Help files do not open inside the app.
- A packaged build cannot find README, LICENSE, assets, bridges, or converters.
- Profile data is read from or written to the wrong location.
- Startup restore behaves differently from direct file/folder opening.

Previous: [1. Architecture](01-architecture.md)  
Next: [3. Modules](03-modules.md)