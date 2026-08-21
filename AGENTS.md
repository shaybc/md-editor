# AGENTS.md

## Application notification dialogs

When developing a notification, confirmation, prompt, or alert dialog, never use browser-native APIs such as `window.alert`, `window.confirm`, `window.prompt`, or their global equivalents. Always use MD-Editor's app-wide styled notification dialog service.

## Application dialog controls

When developing or changing an application dialog, always use MD-Editor's existing app-wide dialog button classes and visual patterns for primary, secondary, destructive, and close actions. Never use unstyled browser-default buttons in an application dialog.

## UI/UX dialog guidelines

When developing or changing dialogs, modals, command sheets, or result summaries, read and follow [.agents/ui-ux-dialog-guidelines.md](.agents/ui-ux-dialog-guidelines.md). Keep command and result dialogs wide enough for paths, code, output, and diagnostics while preserving the app-wide dialog controls.

## Pinned vendor package restoration

When asked to restore the currently pinned vendor packages and rebuild the Kotlin ABI JAR, read and follow [`.agents/restore-pinned-vendor-packages.md`](.agents/restore-pinned-vendor-packages.md) completely before running the workflow.

## Kotlin JDT ABI code changes

Whenever changing code under `desktop-app/language-server-extensions/kotlin-abi`, always increment the project version in [`desktop-app/language-server-extensions/kotlin-abi/pom.xml`](desktop-app/language-server-extensions/kotlin-abi/pom.xml) and rebuild the Kotlin ABI JAR by running `npm --prefix desktop-app run build:kotlin-jdt-extension`.

## Downloadable vendor updates

When asked to discover, validate, or pin newer downloadable vendor JARs and tools, read and follow [`.agents/update-downloadable-vendors.md`](.agents/update-downloadable-vendors.md) completely before running the workflow.

## Bundled Diagram Editor updates

When asked to discover, validate, pin, or package a newer draw.io/diagrams.net release, read and follow [`.agents/update-drawio-vendor.md`](.agents/update-drawio-vendor.md) completely before running the workflow.

## Building the MD-Editor executable

When asked to generate the MD-Editor executable, read and follow [`.agents/build-neutralino-executable.md`](.agents/build-neutralino-executable.md) completely before running the workflow.

## Promoting versions

When asked to promote, push, create, or publish an MD-Editor version release, read and follow [`.agents/promote-version.md`](.agents/promote-version.md) completely before running the workflow.

The release automation script is the source of truth for version promotions. Do not manually patch release surfaces or run in-memory variants of the script; use the script-supported recovery and resume behavior documented in the promotion agent instead.

## Creating agents

When the user asks to create an agent, create a separate Markdown agent definition in the `.agents` folder and add an instruction to this `AGENTS.md` file that refers agents to the new definition.
