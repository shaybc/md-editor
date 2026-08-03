(function(global) {
  "use strict";

  /** Execute Javadoc commands through the existing terminal workflow. */
  function registerMarkdownViewerJavadocRunner(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinPath(parent, child) {
      return `${normalizePath(parent)}/${String(child || "").replace(/\\/g, "/").replace(/^\/+/, "")}`;
    }

    async function ensureDirectory(path) {
      try {
        await deps.Neutralino.filesystem.createDirectory(path);
      } catch (_error) {
        // Existing destination folders are valid.
      }
    }

    async function hasDirectoryEntries(path) {
      try {
        return (await deps.Neutralino.filesystem.readDirectory(path) || []).some((entry) => {
          const name = entry?.entry || entry?.name || "";
          return name && name !== "." && name !== "..";
        });
      } catch (_error) {
        return false;
      }
    }

    async function confirmReplaceDestination(destination) {
      if (!await hasDirectoryEntries(destination)) return true;
      const message = `Replace the generated documentation in:\n\n${destination}`;
      if (typeof deps.confirm === "function") return deps.confirm({ title: "Replace Javadoc Output", message, confirmLabel: "Replace", confirmVariant: "danger" });
      return typeof global.confirm === "function" ? global.confirm(message) : false;
    }

    async function openIndex(destination) {
      if (!deps.Neutralino?.os?.open) return;
      const indexPath = joinPath(destination, "index.html");
      try {
        await deps.Neutralino.os.open(indexPath);
      } catch (_error) {
        // The terminal output remains the source of truth if no index was generated.
      }
    }

    async function run(options = {}) {
      const settings = options.settings || {};
      if (!settings.destination) throw new Error("Choose a Javadoc destination folder.");
      if (!await confirmReplaceDestination(settings.destination)) return false;
      await ensureDirectory(settings.destination);
      const result = await deps.terminal.runCommand(options.command, {
        cwd: options.cwd,
        title: "Generate Javadoc",
        captureOutput: true
      });
      const succeeded = Number(result.exitCode) === 0;
      if (succeeded && settings.openIndex) await openIndex(settings.destination);
      if (!succeeded) throw new Error(`Javadoc failed with exit code ${result.exitCode}. See Generate Javadoc output for details.`);
      return true;
    }

    const api = { run };
    app.registerModule?.("javadocRunner", api);
    return api;
  }

  global.registerMarkdownViewerJavadocRunner = registerMarkdownViewerJavadocRunner;
})(typeof window !== "undefined" ? window : globalThis);
