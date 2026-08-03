(function(global) {
  "use strict";

  const FLAG_LABELS = {
    javascript: [
      ["d", "indices"], ["g", "global"], ["i", "ignore case"], ["m", "multiline"],
      ["s", "dot all"], ["u", "Unicode"], ["v", "Unicode sets"], ["y", "sticky"]
    ],
    java: [
      ["g", "global"], ["i", "ignore case"], ["m", "multiline"], ["s", "dot all"],
      ["u", "Unicode case"], ["U", "Unicode classes"], ["x", "comments"], ["d", "UNIX lines"]
    ]
  };

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (character) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;"
    })[character]);
  }

  function renderHighlightedText(text, matches, selectedIndex) {
    const source = String(text || "");
    const ordered = (matches || []).slice().sort((left, right) => left.start - right.start || left.end - right.end);
    let cursor = 0;
    let output = "";
    ordered.forEach((match) => {
      const start = Math.max(cursor, Number(match.start || 0));
      const end = Math.max(start, Number(match.end || start));
      output += escapeHtml(source.slice(cursor, start));
      const classes = ["regex-tester-highlight", `regex-tester-highlight-${match.index % 2}`];
      if (match.index === selectedIndex) classes.push("selected");
      const value = source.slice(start, end);
      output += `<mark class="${classes.join(" ")}" data-match-index="${match.index}">${escapeHtml(value || "\u200b")}</mark>`;
      cursor = Math.max(cursor, end);
    });
    output += escapeHtml(source.slice(cursor));
    return output;
  }

  function registerMarkdownViewerRegexTester(app, deps = {}) {
    const views = new Map();
    const storage = deps.storage;
    const javascriptEngine = deps.javascriptEngine;
    const javaEngine = deps.javaEngine;
    const explanation = deps.explanation || global.RegexTesterExplanation;
    const quickReference = deps.quickReference || global.RegexTesterQuickReference;
    let loadedStatePromise = null;
    let previousSidebarView = null;

    function getState() {
      if (!loadedStatePromise) loadedStatePromise = storage.loadLastSession();
      return loadedStatePromise;
    }

    function updateRailActiveState(active) {
      document.querySelectorAll(".open-regex-tester").forEach((button) => {
        button.classList.toggle("active", active === true);
        button.setAttribute("aria-pressed", active === true ? "true" : "false");
      });
    }

    function setActiveTab(tab) {
      const isActive = tab?.type === "regex-tester";
      if (isActive) {
        const currentView = deps.getSidebarView?.();
        if (currentView && currentView !== "regex-tester") previousSidebarView = currentView;
        deps.setSidebarVisible?.(true, false, false);
        deps.setSidebarView?.("regex-tester");
      } else if (deps.getSidebarView?.() === "regex-tester") {
        deps.setSidebarView?.(previousSidebarView || "files");
      }
      updateRailActiveState(isActive);
    }

    function createShell() {
      const shell = document.createElement("div");
      shell.className = "regex-tester-view";
      shell.innerHTML = `
        <div class="regex-tester-workspace">
          <main class="regex-tester-main">
            <header class="regex-tester-toolbar">
              <label>Engine
                <select class="regex-tester-engine" aria-label="Regular expression engine">
                  <option value="javascript">JavaScript (ECMAScript)</option>
                  <option value="java">Java</option>
                </select>
              </label>
              <div class="regex-tester-mode-tabs" role="tablist" aria-label="Regular expression mode">
                <button class="regex-tester-mode active" type="button" data-mode="match" role="tab">Match</button>
                <button class="regex-tester-mode" type="button" data-mode="replace" role="tab">Replace</button>
              </div>
              <span class="regex-tester-engine-version"></span>
            </header>
            <section class="regex-tester-card">
              <div class="regex-tester-section-heading">
                <label for="regex-tester-pattern">Pattern</label>
                <button class="regex-tester-copy" type="button" data-copy="pattern" title="Copy pattern"><i class="bi bi-copy"></i></button>
              </div>
              <textarea id="regex-tester-pattern" class="regex-tester-pattern" rows="1" spellcheck="false" placeholder="Enter a regular expression"></textarea>
              <div class="regex-tester-flags" aria-label="Engine flags"></div>
            </section>
            <section class="regex-tester-card">
              <div class="regex-tester-section-heading">
                <label for="regex-tester-test-string">Test string</label>
                <span>
                  <button class="regex-tester-copy" type="button" data-copy="selected" title="Copy selected match">Selected</button>
                  <button class="regex-tester-copy" type="button" data-copy="all" title="Copy all matches">All</button>
                </span>
              </div>
              <div class="regex-tester-text-editor">
                <pre class="regex-tester-highlight-overlay" aria-hidden="true"></pre>
                <textarea id="regex-tester-test-string" class="regex-tester-test-string" spellcheck="false" placeholder="Enter text to test" aria-label="Test string"></textarea>
              </div>
            </section>
            <section class="regex-tester-card regex-tester-replace-panel" hidden>
              <label for="regex-tester-replacement">Replacement</label>
              <input id="regex-tester-replacement" class="regex-tester-replacement" type="text" spellcheck="false" placeholder="Enter replacement text">
              <div class="regex-tester-section-heading">
                <label for="regex-tester-replacement-output">Replacement output</label>
                <button class="regex-tester-copy" type="button" data-copy="output" title="Copy replacement output"><i class="bi bi-copy"></i></button>
              </div>
              <div class="regex-tester-replacement-output-editor">
                <pre class="regex-tester-replacement-highlight-overlay" aria-hidden="true"></pre>
                <textarea id="regex-tester-replacement-output" class="regex-tester-replacement-output" readonly></textarea>
              </div>
            </section>
            <footer class="regex-tester-result-bar">
              <span class="regex-tester-status" role="status">Ready</span>
              <div class="regex-tester-match-navigation">
                <button class="regex-tester-previous" type="button" title="Previous match"><i class="bi bi-chevron-left"></i></button>
                <span class="regex-tester-match-count">0 matches</span>
                <button class="regex-tester-next" type="button" title="Next match"><i class="bi bi-chevron-right"></i></button>
              </div>
            </footer>
          </main>
        </div>`;
      return shell;
    }

    function captureEditableState(view) {
      return {
        version: 1,
        engine: view.state.engine,
        mode: view.state.mode,
        pattern: view.elements.pattern.value,
        testString: view.elements.testString.value,
        replacement: view.elements.replacement.value,
        flagsByEngine: { ...view.state.flagsByEngine }
      };
    }

    function renderFlags(view) {
      const flags = view.state.flagsByEngine[view.state.engine] || "";
      view.elements.flags.innerHTML = FLAG_LABELS[view.state.engine].map(([flag, label]) => `
        <label class="regex-tester-flag" title="${escapeHtml(label)}">
          <input type="checkbox" value="${escapeHtml(flag)}" ${flags.includes(flag) ? "checked" : ""}>
          <span>${escapeHtml(flag)}</span>
        </label>`).join("");
    }

    function renderExplanation(view) {
      const tokens = explanation.tokenizePattern(view.elements.pattern.value, view.state.engine, view.state.flagsByEngine[view.state.engine]);
      view.elements.explanation.innerHTML = tokens.length ? tokens.map((token, index) => `
        <button type="button" class="regex-tester-explanation-token" data-token-index="${index}" data-start="${token.start}" data-end="${token.end}">
          <code>${escapeHtml(token.text)}</code><span>${escapeHtml(token.description)}</span>
        </button>`).join("") : '<p class="regex-tester-empty">Enter a pattern to see its tokens.</p>';
    }

    function renderQuickReference(view) {
      if (!view.elements.referenceGroup.options.length) {
        view.elements.referenceGroup.innerHTML = quickReference.getQuickReferenceGroups().map((group) =>
          `<option value="${escapeHtml(group.id)}">${escapeHtml(group.label)}</option>`
        ).join("");
      }
      const selectedGroup = view.elements.referenceGroup.value || "all";
      const entries = quickReference.getQuickReference(view.state.engine, view.elements.referenceFilter.value, selectedGroup);
      let previousGroup = "";
      view.elements.quickReference.innerHTML = entries.length ? entries.map((entry) => {
        const showHeading = (selectedGroup === "all" || selectedGroup === "common") && entry.group !== previousGroup;
        previousGroup = entry.group;
        return `${showHeading ? `<h4 class="regex-tester-reference-group-heading">${escapeHtml(entry.groupLabel)}</h4>` : ""}
          <button type="button" class="regex-tester-reference-entry" data-token="${escapeHtml(entry.token)}" data-reference-group="${escapeHtml(entry.group)}">
            <strong>${escapeHtml(entry.name)}</strong><code>${escapeHtml(entry.token)}</code><span>${escapeHtml(entry.description)}</span>
          </button>`;
      }).join("") : '<p class="regex-tester-empty">No reference entries match.</p>';
    }

    function renderMatchInformation(view) {
      const match = view.result?.matches?.[view.selectedMatchIndex];
      if (!match) {
        view.elements.matchInformation.innerHTML = "No match selected.";
        return;
      }
      const groups = (match.groups || []).map((group) => `
        <tr><th>${group.name ? `${escapeHtml(group.name)} (${group.index})` : group.index}</th>
        <td>${group.matched ? `<code>${escapeHtml(group.value)}</code> <small>${group.start}–${group.end}</small>` : "<em>unmatched</em>"}</td></tr>`).join("");
      view.elements.matchInformation.innerHTML = `
        <dl><dt>Match</dt><dd>${match.index + 1} of ${view.result.matches.length}</dd>
        <dt>Value</dt><dd><code>${escapeHtml(match.value)}</code></dd>
        <dt>Offsets</dt><dd>${match.start}–${match.end}</dd></dl>
        ${groups ? `<table><tbody>${groups}</tbody></table>` : '<p class="regex-tester-empty">No capture groups.</p>'}`;
    }

    function syncEditorScroll(editor, highlight) {
      const editorVerticalRange = Math.max(0, editor.scrollHeight - editor.clientHeight);
      const highlightVerticalRange = Math.max(0, highlight.scrollHeight - highlight.clientHeight);
      const editorHorizontalRange = Math.max(0, editor.scrollWidth - editor.clientWidth);
      const highlightHorizontalRange = Math.max(0, highlight.scrollWidth - highlight.clientWidth);
      highlight.scrollTop = editorVerticalRange ? (editor.scrollTop / editorVerticalRange) * highlightVerticalRange : 0;
      highlight.scrollLeft = editorHorizontalRange ? (editor.scrollLeft / editorHorizontalRange) * highlightHorizontalRange : 0;
    }

    function syncHighlightScroll(view) {
      syncEditorScroll(view.elements.testString, view.elements.highlight);
    }

    function syncReplacementHighlightScroll(view) {
      syncEditorScroll(view.elements.replacementOutput, view.elements.replacementHighlight);
    }

    function getMatchIndexAtPoint(highlight, clientX, clientY) {
      const match = Array.from(highlight.querySelectorAll("[data-match-index]")).find((candidate) => {
        const rect = candidate.getBoundingClientRect();
        return clientX >= rect.left && clientX <= rect.right && clientY >= rect.top && clientY <= rect.bottom;
      });
      return match ? Number(match.dataset.matchIndex) : -1;
    }

    function selectMatch(view, index) {
      const count = view.result?.matches?.length || 0;
      view.selectedMatchIndex = count ? (index + count) % count : -1;
      view.elements.highlight.innerHTML = renderHighlightedText(view.elements.testString.value, view.result?.matches || [], view.selectedMatchIndex);
      view.elements.replacementHighlight.innerHTML = renderHighlightedText(
        view.elements.replacementOutput.value,
        view.result?.replacementRanges || [],
        view.selectedMatchIndex
      );
      syncReplacementHighlightScroll(view);
      view.elements.matchCount.textContent = count ? `${view.selectedMatchIndex + 1} of ${count}` : "0 matches";
      renderMatchInformation(view);
      view.elements.highlight.querySelector(`[data-match-index="${view.selectedMatchIndex}"]`)?.scrollIntoView?.({ block: "nearest", inline: "nearest" });
      view.elements.testString.scrollTop = view.elements.highlight.scrollTop;
      view.elements.testString.scrollLeft = view.elements.highlight.scrollLeft;
    }

    function renderResult(view, result) {
      view.result = result;
      if (!result.ok) {
        view.selectedMatchIndex = -1;
        view.elements.status.textContent = result.error?.message || "Evaluation failed.";
        view.elements.status.dataset.state = result.error?.type || "error";
        view.elements.matchCount.textContent = "0 matches";
        view.elements.highlight.innerHTML = renderHighlightedText(view.elements.testString.value, [], -1);
        view.elements.replacementOutput.value = "";
        view.elements.replacementHighlight.innerHTML = "";
        renderMatchInformation(view);
        return;
      }
      const count = result.matches.length;
      view.elements.status.textContent = `${count} match${count === 1 ? "" : "es"} in ${Number(result.elapsedMs || 0).toFixed(2)} ms${result.truncated ? " — limited to 10,000 results" : ""}`;
      view.elements.status.dataset.state = result.truncated ? "truncated" : "ok";
      view.elements.replacementOutput.value = result.replacementOutput || "";
      selectMatch(view, count ? Math.min(Math.max(view.selectedMatchIndex, 0), count - 1) : -1);
    }

    async function evaluate(view) {
      const requestId = `${Date.now()}-${++view.requestCounter}`;
      view.currentRequestId = requestId;
      view.elements.status.textContent = "Evaluating…";
      view.elements.status.dataset.state = "pending";
      const request = {
        requestId,
        engine: view.state.engine,
        mode: view.state.mode,
        pattern: view.elements.pattern.value,
        testString: view.elements.testString.value,
        replacement: view.elements.replacement.value,
        flags: view.state.flagsByEngine[view.state.engine]
      };
      const engine = request.engine === "java" ? javaEngine : javascriptEngine;
      const result = await engine.evaluate(request);
      if (!views.has(view.tab.id) || view.currentRequestId !== result.requestId) return;
      if (request.engine === "java") {
        const version = javaEngine.getJavaVersion?.();
        view.elements.engineVersion.textContent = version ? `Java ${version}` : "";
      }
      renderResult(view, result);
    }

    function scheduleEvaluation(view) {
      clearTimeout(view.evaluationTimer);
      view.evaluationTimer = setTimeout(() => { void evaluate(view); }, 250);
    }

    function persistAndEvaluate(view) {
      storage.saveLastSession(captureEditableState(view));
      renderExplanation(view);
      scheduleEvaluation(view);
    }

    function bindView(view) {
      const elements = view.elements;
      elements.engine.addEventListener("change", () => {
        const previous = view.state.engine;
        const next = elements.engine.value === "java" ? "java" : "javascript";
        const shared = "gims".split("").filter((flag) => view.state.flagsByEngine[previous].includes(flag));
        let nextFlags = view.state.flagsByEngine[next];
        "gims".split("").forEach((flag) => { nextFlags = nextFlags.replace(flag, ""); });
        shared.forEach((flag) => {
          if (FLAG_LABELS[next].some(([candidate]) => candidate === flag)) nextFlags += flag;
        });
        view.state.flagsByEngine[next] = FLAG_LABELS[next].filter(([flag]) => nextFlags.includes(flag)).map(([flag]) => flag).join("");
        view.state.engine = next;
        view.elements.engineVersion.textContent = "";
        renderFlags(view);
        renderExplanation(view);
        renderQuickReference(view);
        persistAndEvaluate(view);
      });
      elements.modeButtons.forEach((button) => button.addEventListener("click", () => {
        view.state.mode = button.dataset.mode === "replace" ? "replace" : "match";
        elements.modeButtons.forEach((candidate) => candidate.classList.toggle("active", candidate === button));
        elements.replacePanel.hidden = view.state.mode !== "replace";
        persistAndEvaluate(view);
      }));
      [elements.pattern, elements.replacement].forEach((input) => input.addEventListener("input", () => persistAndEvaluate(view)));
      elements.testString.addEventListener("input", () => {
        view.elements.highlight.innerHTML = renderHighlightedText(elements.testString.value, view.result?.matches || [], view.selectedMatchIndex);
        syncHighlightScroll(view);
        persistAndEvaluate(view);
      });
      elements.testString.addEventListener("scroll", () => syncHighlightScroll(view));
      elements.testString.addEventListener("click", (event) => {
        const visualMatchIndex = getMatchIndexAtPoint(elements.highlight, event.clientX, event.clientY);
        if (visualMatchIndex >= 0) {
          selectMatch(view, visualMatchIndex);
          return;
        }
        const offset = elements.testString.selectionStart;
        const match = view.result?.matches?.find((candidate) => offset >= candidate.start && offset <= candidate.end);
        if (match) selectMatch(view, match.index);
      });
      elements.replacementOutput.addEventListener("scroll", () => syncReplacementHighlightScroll(view));
      elements.replacementOutput.addEventListener("click", (event) => {
        const visualMatchIndex = getMatchIndexAtPoint(elements.replacementHighlight, event.clientX, event.clientY);
        if (visualMatchIndex >= 0) {
          selectMatch(view, visualMatchIndex);
          return;
        }
        const offset = elements.replacementOutput.selectionStart;
        const range = view.result?.replacementRanges?.find((candidate) => offset >= candidate.start && offset <= candidate.end);
        if (range) selectMatch(view, range.index);
      });
      elements.flags.addEventListener("change", (event) => {
        const input = event.target.closest('input[type="checkbox"]');
        if (!input) return;
        let flags = Array.from(elements.flags.querySelectorAll('input:checked')).map((flagInput) => flagInput.value);
        if (view.state.engine === "javascript" && (input.value === "u" || input.value === "v") && input.checked) {
          const incompatible = input.value === "u" ? "v" : "u";
          elements.flags.querySelector(`input[value="${incompatible}"]`).checked = false;
          flags = flags.filter((flag) => flag !== incompatible);
        }
        view.state.flagsByEngine[view.state.engine] = FLAG_LABELS[view.state.engine].filter(([flag]) => flags.includes(flag)).map(([flag]) => flag).join("");
        persistAndEvaluate(view);
      });
      elements.previous.addEventListener("click", () => selectMatch(view, view.selectedMatchIndex - 1));
      elements.next.addEventListener("click", () => selectMatch(view, view.selectedMatchIndex + 1));
      elements.explanation.addEventListener("click", (event) => {
        const token = event.target.closest("[data-start]");
        if (!token) return;
        elements.pattern.focus();
        elements.pattern.setSelectionRange(Number(token.dataset.start), Number(token.dataset.end));
      });
      elements.referenceFilter.addEventListener("input", () => renderQuickReference(view));
      elements.referenceGroup.addEventListener("change", () => renderQuickReference(view));
      elements.quickReference.addEventListener("click", (event) => {
        const entry = event.target.closest("[data-token]");
        if (!entry) return;
        const start = elements.pattern.selectionStart;
        elements.pattern.setRangeText(entry.dataset.token, start, elements.pattern.selectionEnd, "end");
        persistAndEvaluate(view);
      });
      view.shell.addEventListener("click", (event) => {
        const copyButton = event.target.closest("[data-copy]");
        if (!copyButton) return;
        const match = view.result?.matches?.[view.selectedMatchIndex];
        const values = {
          pattern: elements.pattern.value,
          selected: match?.value || "",
          all: (view.result?.matches || []).map((item) => item.value).join("\n"),
          output: elements.replacementOutput.value
        };
        void deps.copyTextToClipboard?.(values[copyButton.dataset.copy] || "");
      });
    }

    async function mountRegexTesterTab(tab, root) {
      if (!tab?.id || !root) return null;
      const existing = views.get(tab.id);
      if (existing?.root?.isConnected) {
        updateRailActiveState(true);
        return existing;
      }
      const savedState = await getState();
      if (!root.isConnected) return null;
      const shell = createShell();
      root.textContent = "";
      root.appendChild(shell);
      const sidebarPanel = document.getElementById("regex-tester-sidebar-panel");
      const view = {
        tab,
        root,
        shell,
        sidebarPanel,
        state: {
          engine: savedState.engine,
          mode: savedState.mode,
          flagsByEngine: { ...savedState.flagsByEngine }
        },
        requestCounter: 0,
        currentRequestId: null,
        evaluationTimer: null,
        selectedMatchIndex: -1,
        result: null,
        elements: {
          engine: shell.querySelector(".regex-tester-engine"),
          engineVersion: shell.querySelector(".regex-tester-engine-version"),
          modeButtons: Array.from(shell.querySelectorAll(".regex-tester-mode")),
          pattern: shell.querySelector(".regex-tester-pattern"),
          flags: shell.querySelector(".regex-tester-flags"),
          testString: shell.querySelector(".regex-tester-test-string"),
          highlight: shell.querySelector(".regex-tester-highlight-overlay"),
          replacePanel: shell.querySelector(".regex-tester-replace-panel"),
          replacement: shell.querySelector(".regex-tester-replacement"),
          replacementOutput: shell.querySelector(".regex-tester-replacement-output"),
          replacementHighlight: shell.querySelector(".regex-tester-replacement-highlight-overlay"),
          status: shell.querySelector(".regex-tester-status"),
          matchCount: shell.querySelector(".regex-tester-match-count"),
          previous: shell.querySelector(".regex-tester-previous"),
          next: shell.querySelector(".regex-tester-next"),
          explanation: sidebarPanel.querySelector(".regex-tester-explanation"),
          matchInformation: sidebarPanel.querySelector(".regex-tester-match-information"),
          referenceGroup: sidebarPanel.querySelector(".regex-tester-reference-group"),
          referenceFilter: sidebarPanel.querySelector(".regex-tester-reference-filter"),
          quickReference: sidebarPanel.querySelector(".regex-tester-quick-reference")
        }
      };
      view.elements.engine.value = savedState.engine;
      view.elements.pattern.value = savedState.pattern;
      view.elements.testString.value = savedState.testString;
      view.elements.replacement.value = savedState.replacement;
      view.elements.modeButtons.forEach((button) => button.classList.toggle("active", button.dataset.mode === savedState.mode));
      view.elements.replacePanel.hidden = savedState.mode !== "replace";
      views.set(tab.id, view);
      renderFlags(view);
      renderExplanation(view);
      renderQuickReference(view);
      bindView(view);
      updateRailActiveState(true);
      scheduleEvaluation(view);
      return view;
    }

    function destroyRegexTesterTab(tabId) {
      const view = views.get(tabId);
      if (!view) return;
      clearTimeout(view.evaluationTimer);
      const editableState = captureEditableState(view);
      loadedStatePromise = Promise.resolve(editableState);
      storage.saveLastSession(editableState);
      void storage.flush();
      javascriptEngine.dispose();
      void javaEngine.dispose();
      views.delete(tabId);
      updateRailActiveState(false);
    }

    function openRegexTester() {
      const wasActive = deps.getActiveTab?.()?.type === "regex-tester";
      const tab = deps.openRegexTesterInTab?.();
      if (tab && wasActive) {
        const sidebarVisible = deps.isSidebarVisible?.() !== false;
        if (sidebarVisible && deps.getSidebarView?.() === "regex-tester") {
          deps.setSidebarVisible?.(false);
        } else {
          deps.setSidebarVisible?.(true, true, false);
          deps.setSidebarView?.("regex-tester");
        }
      }
      if (!tab) deps.alert?.("Unable to open Regex-Tester.");
      return tab || null;
    }

    const api = {
      openRegexTester,
      mountRegexTesterTab,
      destroyRegexTesterTab,
      setActiveTab,
      getMountedRegexTesterCount: () => views.size,
      _test: { renderHighlightedText, escapeHtml }
    };
    app?.registerModule?.("regexTester", api);
    return api;
  }

  global.registerMarkdownViewerRegexTester = registerMarkdownViewerRegexTester;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerRegexTester, renderHighlightedText, escapeHtml };
})(typeof window !== "undefined" ? window : globalThis);
