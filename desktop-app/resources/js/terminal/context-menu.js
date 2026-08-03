(function(global) {
  "use strict";

  /** Own right-click selection, clipboard, and clearing actions for terminal sessions. */
  function registerMarkdownViewerTerminalContextMenu(app, deps = {}) {
    const MAX_FULL_OUTPUT_COPY_LINES = 50000;
    const MAX_FULL_OUTPUT_COPY_BYTES = 5 * 1024 * 1024;
    const FULL_OUTPUT_TOO_LARGE_MESSAGE = "Full output is too large to copy. Open it in a new tab and copy a smaller section.";
    let menu = null;
    let targetSession = null;
    let targetActions = null;

    function getNeutralino() {
      return deps.Neutralino || global.Neutralino;
    }

    function getSelectedText(session) {
      if (session?.isAllOutputSelected) return getTerminalOutput(session);
      if (session?.terminal?.getSelection) return String(session.terminal.getSelection() || "");
      return String(global.getSelection?.()?.toString?.() || "");
    }

    function hasSelectedText(session) {
      if (session?.isAllOutputSelected) return canCopyFullOutput(session);
      if (session?.terminal?.hasSelection) return session.terminal.hasSelection();
      const selection = global.getSelection?.();
      return Boolean(selection && !selection.isCollapsed);
    }

    function getTerminalOutput(session) {
      if (session?.consoleOutput) return String(session.consoleOutput).replace(/\x1b\[[0-?]*[ -/]*[@-~]/g, "");
      const buffer = session?.terminal?.buffer?.active;
      if (buffer?.get && Number.isFinite(buffer.length)) {
        let output = "";
        for (let index = 0; index < buffer.length; index += 1) {
          const line = buffer.get(index);
          if (!line) continue;
          if (index > 0 && !line.isWrapped) output += "\n";
          output += line.translateToString(true);
        }
        return output;
      }
      return String(session?.outputElement?.textContent || "");
    }

    function hasTerminalOutput(session) {
      if (session?.consoleOutput) return true;
      const buffer = session?.terminal?.buffer?.active;
      if (Number(buffer?.baseY) > 0 || Number(buffer?.cursorY) > 0 || Number(buffer?.cursorX) > 0) return true;
      return Boolean(session?.outputElement?.textContent);
    }

    function canCopyFullOutput(session) {
      if (session?.consoleOutput) {
        const lineCount = Number(session.consoleOutputNewlineCount || 0) + (session.consoleOutput.endsWith("\n") ? 0 : 1);
        return lineCount <= MAX_FULL_OUTPUT_COPY_LINES && Number(session.consoleOutputSizeBytes || 0) <= MAX_FULL_OUTPUT_COPY_BYTES;
      }
      const buffer = session?.terminal?.buffer?.active;
      if (buffer) {
        const lineCount = Number(buffer.length || 0);
        const estimatedBytes = lineCount * Number(session?.terminal?.cols || 80);
        return lineCount <= MAX_FULL_OUTPUT_COPY_LINES && estimatedBytes <= MAX_FULL_OUTPUT_COPY_BYTES;
      }
      const text = String(session?.outputElement?.textContent || "");
      return text.length <= MAX_FULL_OUTPUT_COPY_BYTES && text.split(/\r?\n/).length <= MAX_FULL_OUTPUT_COPY_LINES;
    }

    function selectAll(session) {
      if (hasTerminalOutput(session) && canCopyFullOutput(session)) {
        session.isAllOutputSelected = true;
        session?.terminal?.clearSelection?.();
        return;
      }
      if (!session?.outputElement || !document.createRange || !global.getSelection) return;
      const range = document.createRange();
      range.selectNodeContents(session.outputElement);
      const selection = global.getSelection();
      selection.removeAllRanges();
      selection.addRange(range);
    }

    async function writeClipboard(text) {
      const Neutralino = getNeutralino();
      if (Neutralino?.clipboard?.writeText) {
        await Neutralino.clipboard.writeText(String(text || ""));
        return;
      }
      if (global.navigator?.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(String(text || ""));
        return;
      }
      const textArea = document.createElement("textarea");
      textArea.value = String(text || "");
      textArea.style.position = "fixed";
      textArea.style.left = "-9999px";
      document.body.appendChild(textArea);
      textArea.select();
      document.execCommand("copy");
      textArea.remove();
    }

    async function readClipboard() {
      const Neutralino = getNeutralino();
      if (Neutralino?.clipboard?.readText) return String(await Neutralino.clipboard.readText() || "");
      if (global.navigator?.clipboard?.readText) return String(await global.navigator.clipboard.readText() || "");
      return "";
    }

    function clearConsole(session) {
      if (session?.terminal?.clear) session.terminal.clear();
      else if (session?.outputElement) session.outputElement.textContent = "";
    }

    function hideMenu() {
      menu?.classList.add("hidden");
      targetSession = null;
      targetActions = null;
    }

    function ensureMenu() {
      if (menu || !document.body) return menu;
      menu = document.createElement("div");
      menu.className = "graph-context-menu terminal-context-menu hidden";
      menu.setAttribute("role", "menu");
      menu.innerHTML =
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="select-all"><i class="bi bi-card-text" aria-hidden="true"></i><span class="graph-context-menu-item-label">Select All</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="copy"><i class="bi bi-clipboard" aria-hidden="true"></i><span class="graph-context-menu-item-label">Copy</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="open-in-new-tab"><i class="bi bi-box-arrow-up-right" aria-hidden="true"></i><span class="graph-context-menu-item-label">Open in a new tab</span></button>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="paste"><i class="bi bi-clipboard-plus" aria-hidden="true"></i><span class="graph-context-menu-item-label">Paste</span></button>` +
        `<div class="graph-context-menu-separator" aria-hidden="true"></div>` +
        `<button class="graph-context-menu-item" type="button" role="menuitem" data-action="clear"><i class="bi bi-eraser" aria-hidden="true"></i><span class="graph-context-menu-item-label">Clear Console</span></button>`;
      menu.querySelector('[data-action="select-all"]').addEventListener("click", () => {
        selectAll(targetSession);
        hideMenu();
      });
      menu.querySelector('[data-action="copy"]').addEventListener("click", async () => {
        const session = targetSession;
        const text = getSelectedText(session);
        if (session) session.isAllOutputSelected = false;
        hideMenu();
        if (text) await writeClipboard(text);
      });
      menu.querySelector('[data-action="open-in-new-tab"]').addEventListener("click", () => {
        const session = targetSession;
        hideMenu();
        global.setTimeout(() => {
          const output = getTerminalOutput(session);
          if (output) deps.openOutputInNewTab?.(output, `${session?.title || "Terminal"} Output`);
        }, 0);
      });
      menu.querySelector('[data-action="paste"]').addEventListener("click", async () => {
        const session = targetSession;
        const actions = targetActions;
        hideMenu();
        const text = await readClipboard();
        if (text) actions?.pasteText?.(text, session);
      });
      menu.querySelector('[data-action="clear"]').addEventListener("click", () => {
        clearConsole(targetSession);
        targetActions?.clearConsole?.(targetSession);
        hideMenu();
      });
      document.body.appendChild(menu);
      global.addEventListener("pointerdown", (event) => {
        if (!menu.contains(event.target)) hideMenu();
      });
      global.addEventListener("blur", hideMenu);
      global.addEventListener("resize", hideMenu);
      document.addEventListener("keydown", (event) => {
        if (event.key === "Escape") hideMenu();
      });
      return menu;
    }

    function showMenu(event, session, actions) {
      const contextMenu = ensureMenu();
      if (!contextMenu) return;
      event.preventDefault();
      targetSession = session;
      targetActions = actions;
      const selectAllButton = contextMenu.querySelector('[data-action="select-all"]');
      const copyButton = contextMenu.querySelector('[data-action="copy"]');
      const openInNewTabButton = contextMenu.querySelector('[data-action="open-in-new-tab"]');
      const pasteButton = contextMenu.querySelector('[data-action="paste"]');
      const canSelectAll = hasTerminalOutput(session) && canCopyFullOutput(session);
      selectAllButton.disabled = !canSelectAll;
      selectAllButton.title = hasTerminalOutput(session) && !canSelectAll ? FULL_OUTPUT_TOO_LARGE_MESSAGE : "";
      if (!canSelectAll) session.isAllOutputSelected = false;
      copyButton.disabled = !hasSelectedText(session);
      openInNewTabButton.disabled = !hasTerminalOutput(session) || typeof deps.openOutputInNewTab !== "function";
      pasteButton.disabled = Boolean(session?.readOnly || session?.closed || typeof actions?.pasteText !== "function");
      contextMenu.classList.remove("hidden");
      contextMenu.style.left = `${Math.max(4, event.clientX)}px`;
      contextMenu.style.top = `${Math.max(4, event.clientY)}px`;
      const bounds = contextMenu.getBoundingClientRect();
      contextMenu.style.left = `${Math.max(4, Math.min(event.clientX, global.innerWidth - bounds.width - 4))}px`;
      contextMenu.style.top = `${Math.max(4, Math.min(event.clientY, global.innerHeight - bounds.height - 4))}px`;
      contextMenu.querySelector(".graph-context-menu-item:not(:disabled)")?.focus();
    }

    /** Bind the shared terminal context menu to one terminal session. */
    function bind(session, actions = {}) {
      session?.terminalRoot?.addEventListener?.("contextmenu", (event) => showMenu(event, session, actions));
      session?.terminalRoot?.addEventListener?.("pointerdown", (event) => {
        if (event.button !== 2) session.isAllOutputSelected = false;
      });
    }

    const api = { bind };
    app.registerModule?.("terminalContextMenu", api);
    return api;
  }

  global.registerMarkdownViewerTerminalContextMenu = registerMarkdownViewerTerminalContextMenu;
})(typeof window !== "undefined" ? window : globalThis);
