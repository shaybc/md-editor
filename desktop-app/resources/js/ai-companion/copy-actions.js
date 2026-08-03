(function(window, document) {
  "use strict";

  function createMarkdownViewerAiCompanionCopyActions(deps = {}) {
    async function writeTextToClipboard(text) {
      const value = String(text || "");
      if (window.Neutralino?.clipboard?.writeText) {
        await window.Neutralino.clipboard.writeText(value);
        return;
      }
      if (navigator.clipboard?.writeText && window.isSecureContext) {
        await navigator.clipboard.writeText(value);
        return;
      }
      const textArea = document.createElement("textarea");
      textArea.value = value;
      textArea.style.position = "fixed";
      textArea.style.opacity = "0";
      document.body.appendChild(textArea);
      textArea.focus();
      textArea.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(textArea);
      if (!copied) throw new Error("Copy command was unsuccessful");
    }

    function setButtonCopied(button) {
      const icon = button.querySelector?.("i");
      if (!icon) return;
      const originalClassName = icon.className;
      icon.className = "bi bi-check-lg";
      button.classList.add("is-copied");
      window.setTimeout(() => {
        icon.className = originalClassName;
        button.classList.remove("is-copied");
      }, 1200);
    }

    function createCopyButton(getMarkdown, label) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-companion-box-copy";
      button.title = label || "Copy Markdown";
      button.setAttribute("aria-label", label || "Copy Markdown");
      const icon = document.createElement("i");
      icon.className = "bi bi-copy";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", async (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        try {
          await writeTextToClipboard(typeof getMarkdown === "function" ? getMarkdown() : "");
          setButtonCopied(button);
          deps.onCopied?.();
        } catch (error) {
          console.error("Failed to copy AI Companion Markdown:", error);
          deps.onCopyError?.(error);
        }
      });
      return button;
    }

    function createOpenInNewTabButton(getMarkdown) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "ai-companion-box-copy ai-companion-box-open-tab";
      button.title = "Open in a new tab";
      button.setAttribute("aria-label", "Open in a new tab");
      const icon = document.createElement("i");
      icon.className = "bi bi-box-arrow-up-right";
      icon.setAttribute("aria-hidden", "true");
      button.append(icon);
      button.addEventListener("click", (event) => {
        event.preventDefault?.();
        event.stopPropagation?.();
        try {
          deps.openMarkdownInNewTab?.(typeof getMarkdown === "function" ? getMarkdown() : "");
        } catch (error) {
          console.error("Failed to open AI Companion Markdown in a new tab:", error);
          deps.onOpenTabError?.(error);
        }
      });
      return button;
    }

    function formatTimestamp(value) {
      const timestamp = typeof value === "function" ? value() : value;
      if (!timestamp) return "";
      const date = new Date(timestamp);
      if (Number.isNaN(date.getTime())) return "";
      return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    }

    function createTimestampElement(timestamp) {
      const label = formatTimestamp(timestamp);
      if (!label) return null;
      const element = document.createElement("span");
      element.className = "ai-companion-box-timestamp";
      element.textContent = label;
      return element;
    }

    function attachCopyAction(target, getMarkdown, options = {}) {
      if (!target || typeof getMarkdown !== "function") return null;
      target.classList?.add("ai-companion-copyable-box");
      const existingChild = Array.from(target.children || []).find((child) => child.className === "ai-companion-box-actions");
      if (existingChild) target.removeChild(existingChild);
      const existingSibling = target.nextElementSibling?.className === "ai-companion-box-actions" ? target.nextElementSibling : null;
      if (existingSibling) existingSibling.remove();
      const actions = document.createElement("div");
      actions.className = "ai-companion-box-actions";
      const timestamp = createTimestampElement(options.timestamp);
      if (options.isModelResponse) {
        actions.append(createCopyButton(getMarkdown, options.label));
        if (typeof deps.openMarkdownInNewTab === "function") actions.append(createOpenInNewTabButton(getMarkdown));
        if (timestamp) actions.append(timestamp);
        target.after(actions);
        return actions;
      }
      if (timestamp) actions.append(timestamp);
      if (typeof deps.openMarkdownInNewTab === "function") actions.append(createOpenInNewTabButton(getMarkdown));
      actions.append(createCopyButton(getMarkdown, options.label));
      target.after(actions);
      return actions;
    }

    return { attachCopyAction, writeTextToClipboard };
  }

  window.createMarkdownViewerAiCompanionCopyActions = createMarkdownViewerAiCompanionCopyActions;
})(window, document);
