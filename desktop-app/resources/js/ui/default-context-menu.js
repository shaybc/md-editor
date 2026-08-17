// Application-wide fallback context menu for surfaces without a dedicated menu.
(function registerDefaultContextMenuModule(global, document) {
  "use strict";

  const TEXT_INPUT_TYPES = new Set(["text", "search", "url", "tel", "email", "password"]);

  function isTextControl(element) {
    if (!element) return false;
    if (element.tagName === "TEXTAREA") return true;
    return element.tagName === "INPUT" && TEXT_INPUT_TYPES.has(String(element.type || "text").toLowerCase());
  }

  function resolveEditableTarget(target) {
    const element = target?.nodeType === 1 ? target : target?.parentElement;
    const candidate = element?.closest?.("textarea, input, [contenteditable]");
    if (!candidate) return null;
    if (isTextControl(candidate)) return candidate.disabled || candidate.readOnly ? null : candidate;
    return candidate.isContentEditable ? candidate : null;
  }

  function captureSelection(target) {
    const editable = resolveEditableTarget(target);
    if (isTextControl(editable)) {
      const start = Number(editable.selectionStart) || 0;
      const end = Number(editable.selectionEnd) || start;
      const isPassword = String(editable.type || "").toLowerCase() === "password";
      return {
        target,
        editable,
        start: Math.min(start, end),
        end: Math.max(start, end),
        text: isPassword ? "" : String(editable.value || "").slice(Math.min(start, end), Math.max(start, end)),
        range: null
      };
    }

    const selection = global.getSelection?.();
    const range = selection?.rangeCount ? selection.getRangeAt(0).cloneRange() : null;
    return {
      target,
      editable,
      start: 0,
      end: 0,
      text: selection?.isCollapsed ? "" : String(selection?.toString() || ""),
      range
    };
  }

  function replaceCapturedSelection(context, replacement) {
    if (!context.editable) return false;
    const text = String(replacement || "");
    if (isTextControl(context.editable)) {
      context.editable.focus();
      context.editable.setSelectionRange(context.start, context.end);
      context.editable.setRangeText(text, context.start, context.end, "end");
      context.editable.dispatchEvent(new Event("input", { bubbles: true }));
      context.start = context.end = context.start + text.length;
      context.text = "";
      return true;
    }

    const range = context.range?.cloneRange();
    if (!range) return false;
    context.editable.focus();
    range.deleteContents();
    const textNode = document.createTextNode(text);
    range.insertNode(textNode);
    range.setStartAfter(textNode);
    range.collapse(true);
    const selection = global.getSelection?.();
    selection?.removeAllRanges();
    selection?.addRange(range);
    context.range = range.cloneRange();
    context.text = "";
    context.editable.dispatchEvent(new Event("input", { bubbles: true }));
    return true;
  }

  async function writeClipboardText(text) {
    if (typeof global.Neutralino?.clipboard?.writeText === "function") return global.Neutralino.clipboard.writeText(text);
    if (global.navigator?.clipboard?.writeText) return global.navigator.clipboard.writeText(text);
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.style.cssText = "position:fixed;opacity:0;pointer-events:none";
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand("copy");
    textarea.remove();
  }

  async function readClipboardText() {
    if (typeof global.Neutralino?.clipboard?.readText === "function") return global.Neutralino.clipboard.readText();
    if (global.navigator?.clipboard?.readText) return global.navigator.clipboard.readText();
    return "";
  }

  function selectAll(context) {
    if (isTextControl(context.editable)) {
      context.editable.focus();
      context.editable.select();
      return;
    }
    const selection = global.getSelection?.();
    if (!selection) return;
    const range = document.createRange();
    range.selectNodeContents(context.editable || document.body);
    selection.removeAllRanges();
    selection.addRange(range);
  }

  function printSelectedText(text) {
    const frame = document.createElement("iframe");
    frame.setAttribute("aria-hidden", "true");
    frame.style.cssText = "position:fixed;width:0;height:0;border:0;visibility:hidden";
    document.body.appendChild(frame);
    const printDocument = frame.contentDocument;
    printDocument.open();
    printDocument.write("<!doctype html><html><head><title>Print selection</title><style>body{margin:32px;font:14px/1.5 system-ui,sans-serif}pre{white-space:pre-wrap;overflow-wrap:anywhere;font:inherit}</style></head><body><pre></pre></body></html>");
    printDocument.close();
    printDocument.querySelector("pre").textContent = text;
    const printWindow = frame.contentWindow;
    const removeFrame = () => global.setTimeout(() => frame.remove(), 0);
    printWindow.addEventListener?.("afterprint", removeFrame, { once: true });
    printWindow.focus();
    printWindow.print();
    global.setTimeout(() => { if (frame.isConnected) frame.remove(); }, 60000);
  }

  /**
   * Register the fallback menu after dedicated application context menus.
   * @param {object} app Application module registry.
   * @param {object} deps External URL opening dependency.
   * @returns {object} Controls for showing and dismissing the fallback menu.
   */
  function registerMarkdownViewerDefaultContextMenu(app, deps = {}) {
    let context = null;
    const menu = document.createElement("div");
    menu.className = "graph-context-menu app-default-context-menu hidden";
    menu.setAttribute("role", "menu");
    menu.setAttribute("aria-label", "Application commands");
    menu.innerHTML = `
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="copy"><i class="bi bi-copy" aria-hidden="true"></i><span class="graph-context-menu-item-label">Copy</span></button>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="cut"><i class="bi bi-scissors" aria-hidden="true"></i><span class="graph-context-menu-item-label">Cut</span></button>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="paste"><i class="bi bi-clipboard" aria-hidden="true"></i><span class="graph-context-menu-item-label">Paste</span></button>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="delete"><i class="bi bi-trash" aria-hidden="true"></i><span class="graph-context-menu-item-label">Delete</span></button>
      <div class="graph-context-menu-separator" aria-hidden="true"></div>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="select-all"><i class="bi bi-card-text" aria-hidden="true"></i><span class="graph-context-menu-item-label">Select all</span></button>
      <div class="graph-context-menu-separator" aria-hidden="true"></div>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="search-web"><i class="bi bi-search" aria-hidden="true"></i><span class="graph-context-menu-item-label">Search the web</span></button>
      <button class="graph-context-menu-item" type="button" role="menuitem" data-default-context-action="print-selection"><i class="bi bi-printer" aria-hidden="true"></i><span class="graph-context-menu-item-label">Print selection…</span></button>`;
    document.body.appendChild(menu);

    function hide() {
      menu.classList.add("hidden");
      context = null;
    }

    function setEnabled(action, enabled) {
      const button = menu.querySelector(`[data-default-context-action="${action}"]`);
      button.disabled = !enabled;
      button.setAttribute("aria-disabled", String(!enabled));
    }

    function position(clientX, clientY) {
      menu.style.left = Math.max(4, clientX) + "px";
      menu.style.top = Math.max(4, clientY) + "px";
      menu.classList.remove("hidden");
      const bounds = menu.getBoundingClientRect();
      menu.style.left = Math.max(4, Math.min(clientX, global.innerWidth - bounds.width - 4)) + "px";
      menu.style.top = Math.max(4, Math.min(clientY, global.innerHeight - bounds.height - 4)) + "px";
    }

    function show(event) {
      context = captureSelection(event.target);
      const hasSelection = context.text.length > 0;
      const canEdit = !!context.editable;
      const editableSelection = canEdit && (context.range ? hasSelection : context.end > context.start);
      setEnabled("copy", hasSelection);
      setEnabled("cut", editableSelection);
      setEnabled("paste", canEdit);
      setEnabled("delete", editableSelection);
      setEnabled("select-all", true);
      setEnabled("search-web", hasSelection);
      setEnabled("print-selection", hasSelection);
      position(event.clientX, event.clientY);
      menu.querySelector(".graph-context-menu-item:not(:disabled)")?.focus();
    }

    async function run(action) {
      const current = context;
      if (!current) return;
      hide();
      if (action === "copy") return writeClipboardText(current.text);
      if (action === "cut") {
        await writeClipboardText(current.text);
        replaceCapturedSelection(current, "");
        return;
      }
      if (action === "paste") return replaceCapturedSelection(current, await readClipboardText());
      if (action === "delete") return replaceCapturedSelection(current, "");
      if (action === "select-all") return selectAll(current);
      if (action === "search-web") {
        const url = "https://www.google.com/search?q=" + encodeURIComponent(current.text);
        if (typeof deps.openExternalUrl === "function") return deps.openExternalUrl(url);
        if (typeof global.Neutralino?.os?.open === "function") return global.Neutralino.os.open(url);
        return global.open(url, "_blank", "noopener,noreferrer");
      }
      if (action === "print-selection") return printSelectedText(current.text);
    }

    menu.addEventListener("click", (event) => {
      const button = event.target.closest("[data-default-context-action]");
      if (!button || button.disabled) return;
      void Promise.resolve(run(button.dataset.defaultContextAction)).catch((error) => console.error("[default-context-menu] Action failed", error));
    });
    menu.addEventListener("contextmenu", (event) => { event.preventDefault(); event.stopPropagation(); });
    document.addEventListener("contextmenu", (event) => {
      if (event.defaultPrevented || menu.contains(event.target)) return;
      event.preventDefault();
      show(event);
    });
    document.addEventListener("pointerdown", (event) => { if (!menu.contains(event.target)) hide(); });
    document.addEventListener("keydown", (event) => {
      if (menu.classList.contains("hidden")) return;
      if (event.key === "Escape") { event.preventDefault(); hide(); }
      if (!["ArrowDown", "ArrowUp"].includes(event.key)) return;
      event.preventDefault();
      const buttons = [...menu.querySelectorAll(".graph-context-menu-item:not(:disabled)")];
      const currentIndex = buttons.indexOf(document.activeElement);
      const direction = event.key === "ArrowDown" ? 1 : -1;
      buttons[(currentIndex + direction + buttons.length) % buttons.length]?.focus();
    });
    global.addEventListener("blur", hide);
    global.addEventListener("resize", hide);

    const api = { hide, show };
    app.registerModule("defaultContextMenu", api);
    return api;
  }

  global.registerMarkdownViewerDefaultContextMenu = registerMarkdownViewerDefaultContextMenu;
})(window, document);
