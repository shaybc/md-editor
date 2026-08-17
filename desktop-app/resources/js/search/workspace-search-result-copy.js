/* Workspace-search result copy menu and plain-text formatting. */
(function(global) {
  "use strict";

  function getResultPath(result) {
    return String(result?.path || result?.name || "document");
  }

  function getFullMatchLine(result, match) {
    if (Number(match?.index) < 0) return String(match?.preview || "");
    const lines = String(result?.content || "").split(/\r?\n/);
    return lines[Math.max(0, Number(match?.lineNumber || 1) - 1)] ?? String(match?.preview || "");
  }

  function formatWorkspaceSearchMatch(result, match) {
    if (!result || !match) return "";
    return `${getResultPath(result)}:${Number(match.lineNumber || 1)}: ${getFullMatchLine(result, match)}`;
  }

  function formatWorkspaceSearchResult(result, matchIndex) {
    if (!result || result.error) return "";
    const matches = Number.isInteger(matchIndex)
      ? [result.matches?.[matchIndex]].filter(Boolean)
      : (result.matches || []);
    return matches.map((match) => formatWorkspaceSearchMatch(result, match)).filter(Boolean).join("\n");
  }

  function formatAllWorkspaceSearchResults(results) {
    return (results || []).map((result) => formatWorkspaceSearchResult(result)).filter(Boolean).join("\n");
  }

  async function writeClipboardText(text, copyText) {
    if (!text) return false;
    if (typeof copyText === "function") {
      await copyText(text);
      return true;
    }
    if (typeof global.Neutralino?.clipboard?.writeText === "function") {
      await global.Neutralino.clipboard.writeText(text);
      return true;
    }
    if (global.navigator?.clipboard?.writeText) {
      await global.navigator.clipboard.writeText(text);
      return true;
    }
    return false;
  }

  /**
   * Attach the dedicated copy menu to workspace-search results.
   * @param {{container:HTMLElement,getResults:function():Array,copyText?:function(string):Promise<void>}} options - Search results and clipboard dependencies.
   * @returns {{hide:function():void}} Menu controls for the owning search view.
   */
  function registerWorkspaceSearchResultCopy(options = {}) {
    const container = options.container;
    if (!container) return null;
    const menu = document.createElement("div");
    menu.className = "graph-context-menu workspace-search-result-copy-menu hidden";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Workspace search result actions");
    menu.innerHTML = `
      <button class="graph-context-menu-item" type="button" role="menuitem" data-workspace-search-copy="single"><i class="bi bi-clipboard" aria-hidden="true"></i><span class="graph-context-menu-item-label">Copy result as full text</span></button>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-workspace-search-copy="all"><i class="bi bi-copy" aria-hidden="true"></i><span class="graph-context-menu-item-label">Copy all results as full text</span></button>`;
    document.body.appendChild(menu);

    const singleButton = menu.querySelector('[data-workspace-search-copy="single"]');
    const allButton = menu.querySelector('[data-workspace-search-copy="all"]');
    let selectedResultIndex = -1;
    let selectedMatchIndex = null;

    function hide() {
      menu.classList.add("hidden");
    }

    function getSingleText() {
      return formatWorkspaceSearchResult(options.getResults?.()[selectedResultIndex], selectedMatchIndex);
    }

    function positionMenu(clientX, clientY) {
      menu.style.left = "0px";
      menu.style.top = "0px";
      menu.classList.remove("hidden");
      const bounds = menu.getBoundingClientRect();
      menu.style.left = `${Math.max(4, Math.min(clientX, global.innerWidth - bounds.width - 4))}px`;
      menu.style.top = `${Math.max(4, Math.min(clientY, global.innerHeight - bounds.height - 4))}px`;
    }

    container.addEventListener("contextmenu", (event) => {
      const target = event.target.closest(".workspace-search-match, .workspace-search-file");
      if (!target || !container.contains(target)) return;
      event.preventDefault();
      event.stopPropagation();
      selectedResultIndex = Number(target.dataset.resultIndex);
      selectedMatchIndex = target.classList.contains("workspace-search-match")
        ? Number(target.dataset.matchIndex)
        : null;
      const singleText = getSingleText();
      const allText = formatAllWorkspaceSearchResults(options.getResults?.());
      singleButton.disabled = !singleText;
      allButton.disabled = !allText;
      singleButton.querySelector(".graph-context-menu-item-label").textContent = selectedMatchIndex === null
        ? "Copy file results as full text"
        : "Copy result as full text";
      positionMenu(event.clientX, event.clientY);
    });

    menu.addEventListener("click", async (event) => {
      const action = event.target.closest("[data-workspace-search-copy]")?.dataset.workspaceSearchCopy;
      if (!action) return;
      const text = action === "single" ? getSingleText() : formatAllWorkspaceSearchResults(options.getResults?.());
      hide();
      try {
        await writeClipboardText(text, options.copyText);
      } catch (error) {
        console.warn("Could not copy workspace search results:", error);
      }
    });
    menu.addEventListener("contextmenu", (event) => event.preventDefault());
    document.addEventListener("pointerdown", (event) => { if (!menu.contains(event.target)) hide(); });
    document.addEventListener("keydown", (event) => { if (event.key === "Escape") hide(); });
    global.addEventListener("blur", hide);
    global.addEventListener("resize", hide);

    return { hide };
  }

  global.registerMarkdownViewerWorkspaceSearchResultCopy = registerWorkspaceSearchResultCopy;
  global.markdownViewerWorkspaceSearchResultCopy = Object.freeze({
    formatAllWorkspaceSearchResults,
    formatWorkspaceSearchMatch,
    formatWorkspaceSearchResult
  });
})(typeof window !== "undefined" ? window : globalThis);
