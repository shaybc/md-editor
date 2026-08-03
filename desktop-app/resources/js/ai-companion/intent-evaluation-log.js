/**
 * Local-only persistence for bounded intent evaluation and clarification feedback records.
 */
(function(window) {
  "use strict";

  const MAX_LOG_CHARS = 5 * 1024 * 1024;

  window.createMarkdownViewerIntentEvaluationLog = function(deps = {}) {
    let writeQueue = Promise.resolve();

    async function append(record) {
      if (!record || !deps.Neutralino?.filesystem?.writeFile || !deps.getProfileDataDirPath) return;
      writeQueue = writeQueue.then(async () => {
        const profileDir = await deps.getProfileDataDirPath();
        if (!profileDir) return;
        const companionDir = deps.joinPath(profileDir, "companion");
        const evalDir = deps.joinPath(companionDir, "eval");
        await deps.ensureDirectory?.(companionDir);
        await deps.ensureDirectory?.(evalDir);
        const filePath = deps.joinPath(evalDir, "intent-contracts.jsonl");
        let current = "";
        try { current = await deps.Neutralino.filesystem.readFile(filePath) || ""; } catch (_error) {}
        const line = `${JSON.stringify(record)}\n`;
        const retained = current.length + line.length > MAX_LOG_CHARS
          ? current.slice(Math.max(0, current.length - Math.floor(MAX_LOG_CHARS * 0.8))).replace(/^[^\n]*\n?/, "")
          : current;
        await deps.Neutralino.filesystem.writeFile(filePath, `${retained}${line}`);
      }).catch(() => {});
      return writeQueue;
    }

    return { append };
  };
})(window);
