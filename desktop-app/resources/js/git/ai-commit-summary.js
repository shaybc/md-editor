(function(global) {
  "use strict";

  /**
   * AI commit summary for the Git panel.
   *
   * Owns the "AI summary" button next to the commit controls: collects the
   * repository's changes digest through the Git action runner, sends it to
   * the AI Companion bridge's gitSummary mode, renders the returned
   * business-level summary in a collapsible block, and fills the commit
   * message input with the suggested message. Read-only with respect to git:
   * it never stages, commits, or pushes.
   */

  const GENERATE_LABEL = "✨ AI summary";
  const BUSY_LABEL = "Summarizing… (click to cancel)";

  function escapeHtml(value) {
    return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
  }

  /**
   * Render a minimal, safe subset of markdown (##/### headings, bullets with
   * one nesting level, inline code) for the summary block. Kept dependency
   * free so the Git panel does not rely on the preview renderer.
   */
  function renderSummaryMarkdown(markdown) {
    const inline = (text) => escapeHtml(text).replace(/`([^`]+)`/g, "<code>$1</code>");
    const lines = String(markdown || "").split(/\r?\n/);
    const html = [];
    let listDepth = 0;
    const closeLists = (depth) => {
      while (listDepth > depth) {
        html.push("</ul>");
        listDepth--;
      }
    };
    lines.forEach((line) => {
      const heading = line.match(/^(#{2,4})\s+(.*)$/);
      const bullet = line.match(/^(\s*)[-*]\s+(.*)$/);
      if (heading) {
        closeLists(0);
        html.push(`<h5 class="workspace-git-ai-summary-heading">${inline(heading[2])}</h5>`);
        return;
      }
      if (bullet) {
        const depth = bullet[1].length >= 2 ? 2 : 1;
        if (listDepth < depth) {
          while (listDepth < depth) {
            html.push("<ul class=\"workspace-git-ai-summary-list\">");
            listDepth++;
          }
        } else {
          closeLists(depth);
        }
        html.push(`<li>${inline(bullet[2])}</li>`);
        return;
      }
      closeLists(0);
      if (line.trim()) html.push(`<p>${inline(line.trim())}</p>`);
    });
    closeLists(0);
    return html.join("");
  }

  /** Combine subject and body bullets into the commit textarea text. Pure. */
  function buildCommitMessageText(subject, body) {
    const subjectText = String(subject || "").trim();
    const bodyText = String(body || "").trim();
    if (!subjectText) return "";
    return bodyText ? `${subjectText}\n\n${bodyText}` : subjectText;
  }

  /**
   * Decide whether the commit input may be auto-filled. User-typed text is
   * never overwritten; only an empty input or the previous AI suggestion is
   * replaced. Pure.
   */
  function applyCommitMessagePolicy(currentText, lastGeneratedText, nextText) {
    const current = String(currentText || "").trim();
    if (!String(nextText || "").trim()) return { fill: false, offerInsert: false };
    if (!current || current === String(lastGeneratedText || "").trim()) return { fill: true, offerInsert: false };
    return { fill: false, offerInsert: true };
  }

  /** The feature is visible only on desktop with AI Companion + git summaries on. Pure. */
  function computeVisibility(settings, isDesktopRuntime) {
    return isDesktopRuntime === true && settings?.enabled === true && settings?.gitSummaryEnabled !== false;
  }

  /** Generation makes sense when something is uncommitted or unpushed. Pure. */
  function shouldOfferGeneration(status) {
    if (!status) return true;
    const dirty = Array.isArray(status.files) && status.files.length > 0;
    return dirty || Number(status.ahead || 0) > 0;
  }

  /** One-line progress text for streamed tool events shown while generating. Pure. */
  function formatToolProgress(event) {
    if (!event) return "";
    if (event.type === "tool") return `${event.tool || "tool"}: ${event.input || ""} ${event.summary || ""}`.trim();
    if (event.type === "tool-error") return `${event.tool || "tool"} failed: ${event.error || ""}`.trim();
    return "";
  }

  function registerMarkdownViewerGitAiCommitSummary(app, deps = {}) {
    const generateButton = document.getElementById("workspace-git-ai-summary");
    const summaryBlock = document.getElementById("workspace-git-ai-summary-block");
    const summaryContent = document.getElementById("workspace-git-ai-summary-content");
    const summaryProgress = document.getElementById("workspace-git-ai-summary-progress");
    const copyButton = document.getElementById("workspace-git-ai-summary-copy");
    const insertButton = document.getElementById("workspace-git-ai-summary-insert");
    const dismissButton = document.getElementById("workspace-git-ai-summary-dismiss");
    const commitInput = document.getElementById("workspace-git-commit-message");

    let activeRequest = null;
    let lastGeneratedMessage = "";
    let lastSummaryMarkdown = "";
    let lastSuggestedMessage = "";
    let lastFolderPath = "";

    function debugLog(level, message, details) {
      const result = deps.debugLog?.(level, `[git-ai-summary] ${message}`, details);
      result?.catch?.(() => {});
    }

    function getSettings() {
      return deps.getAiCompanionSettings?.() || {};
    }

    function isBusy() {
      return !!activeRequest;
    }

    function setBusy(busy) {
      if (!generateButton) return;
      generateButton.textContent = busy ? BUSY_LABEL : GENERATE_LABEL;
      generateButton.classList.toggle("busy", busy);
      generateButton.setAttribute("aria-busy", busy ? "true" : "false");
    }

    function setProgress(text) {
      if (!summaryProgress) return;
      summaryProgress.hidden = !text;
      summaryProgress.textContent = text || "";
    }

    function hideSummaryBlock() {
      if (summaryBlock) summaryBlock.hidden = true;
      if (insertButton) insertButton.hidden = true;
      setProgress("");
    }

    function showSummaryBlock() {
      if (summaryBlock) summaryBlock.hidden = false;
    }

    function renderSummary(markdown) {
      lastSummaryMarkdown = String(markdown || "");
      if (summaryContent) summaryContent.innerHTML = renderSummaryMarkdown(lastSummaryMarkdown);
      showSummaryBlock();
    }

    function renderError(message) {
      showSummaryBlock();
      if (summaryContent) summaryContent.innerHTML = `<p class="workspace-git-ai-summary-error">${escapeHtml(message || "AI summary failed.")}</p>`;
      setProgress("");
    }

    /**
     * Refresh button visibility/enablement from AI settings and the latest
     * git status. Called by the Git panel whenever commit controls update,
     * and after settings changes.
     */
    function updateAvailability() {
      if (!generateButton) return;
      const folderPath = deps.getActiveFolderPath?.() || "";
      if (folderPath !== lastFolderPath) {
        // Summaries describe one repository; drop them when the folder changes.
        lastFolderPath = folderPath;
        lastGeneratedMessage = "";
        lastSuggestedMessage = "";
        hideSummaryBlock();
      }
      const visible = computeVisibility(getSettings(), deps.isDesktopRuntime?.() === true) && !!deps.aiBridge;
      generateButton.hidden = !visible;
      if (!visible) return;
      const status = deps.workspaceGit?.getLastGitStatus?.()?.status || null;
      generateButton.disabled = !folderPath || (!isBusy() && !shouldOfferGeneration(status));
    }

    function applySuggestedCommitMessage(summary) {
      const nextText = buildCommitMessageText(summary.commitSubject, summary.commitBody);
      lastSuggestedMessage = nextText;
      if (!commitInput) return;
      const policy = applyCommitMessagePolicy(commitInput.value, lastGeneratedMessage, nextText);
      if (policy.fill) {
        commitInput.value = nextText;
        lastGeneratedMessage = nextText;
        deps.workspaceGit?.updateCommitAvailability?.();
      }
      if (insertButton) insertButton.hidden = !policy.offerInsert;
    }

    async function generateSummary() {
      if (isBusy()) {
        activeRequest?.cancel?.();
        return;
      }
      const folderPath = deps.getActiveFolderPath?.() || "";
      if (!folderPath || !deps.aiBridge?.gitSummary) return;
      setBusy(true);
      showSummaryBlock();
      if (summaryContent) summaryContent.innerHTML = "";
      setProgress("Collecting local changes…");
      try {
        const digestResult = await deps.workspaceGit?.runGitPanelAction?.("changesDigest");
        if (!digestResult?.digest) throw new Error("Unable to collect the repository changes digest.");
        setProgress("Asking the AI model…");
        const request = deps.aiBridge.gitSummary({ digest: digestResult.digest }, (event) => {
          const progress = formatToolProgress(event);
          if (progress) setProgress(progress);
        });
        activeRequest = request;
        const result = await request;
        const summary = result?.summary || {};
        renderSummary(summary.summaryMarkdown || result?.content || "");
        applySuggestedCommitMessage(summary);
        setProgress("");
        debugLog("info", "summary generated", { parsed: summary.parsed === true });
      } catch (error) {
        if (error?.cancelled) {
          hideSummaryBlock();
          debugLog("info", "summary cancelled");
        } else {
          renderError(error?.message || "AI summary failed.");
          debugLog("warning", "summary failed", { message: error?.message || String(error) });
        }
      } finally {
        activeRequest = null;
        setBusy(false);
        updateAvailability();
      }
    }

    async function copySummaryMarkdown() {
      if (!lastSummaryMarkdown) return;
      try {
        await navigator.clipboard.writeText(lastSummaryMarkdown);
      } catch (_error) {
        deps.copyText?.(lastSummaryMarkdown);
      }
    }

    function insertSuggestedMessage() {
      if (!commitInput || !lastSuggestedMessage) return;
      commitInput.value = lastSuggestedMessage;
      lastGeneratedMessage = lastSuggestedMessage;
      if (insertButton) insertButton.hidden = true;
      deps.workspaceGit?.updateCommitAvailability?.();
    }

    if (generateButton) generateButton.textContent = GENERATE_LABEL;
    generateButton?.addEventListener("click", () => { generateSummary(); });
    copyButton?.addEventListener("click", () => { copySummaryMarkdown(); });
    insertButton?.addEventListener("click", () => insertSuggestedMessage());
    dismissButton?.addEventListener("click", () => hideSummaryBlock());

    const api = {
      updateAvailability,
      _test: {
        applyCommitMessagePolicy,
        buildCommitMessageText,
        computeVisibility,
        formatToolProgress,
        renderSummaryMarkdown,
        shouldOfferGeneration
      }
    };
    app.registerModule("gitAiCommitSummary", api);
    updateAvailability();
    return api;
  }

  global.registerMarkdownViewerGitAiCommitSummary = registerMarkdownViewerGitAiCommitSummary;
})(typeof window !== "undefined" ? window : globalThis);
