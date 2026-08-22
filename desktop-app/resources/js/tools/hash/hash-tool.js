// DevToys-style Hash / Checksum Generator tab UI.
(function(root) {
  "use strict";

  function registerMarkdownViewerHashTool(app, deps) {
    const codec = deps?.codec || app?.modules?.hashCodec || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openHashToolInTab = typeof deps?.openHashToolInTab === "function" ? deps.openHashToolInTab : null;
    const mountedTabs = new Map();

    function createSwitch(label, checked) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "hash-tool-switch";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.textContent = checked ? "On" : "Off";
      button.setAttribute("aria-label", label);
      return button;
    }

    function createShell() {
      const view = document.createElement("div");
      view.className = "hash-tool-view";
      view.innerHTML = `
        <div class="hash-tool-workspace">
          <header class="hash-tool-header">
            <h2><i class="bi bi-fingerprint"></i> Hash / Checksum Generator</h2>
          </header>
          <section class="hash-tool-config" aria-label="Hash configuration">
            <div class="hash-tool-setting-row">
              <i class="bi bi-fingerprint hash-tool-setting-icon"></i>
              <div class="hash-tool-setting-copy">
                <strong>Hashing Algorithm</strong>
                <span>Select which hashing algorithm you want to use</span>
              </div>
              <select class="hash-tool-algorithm" aria-label="Hashing algorithm">
                <option value="MD5">MD5</option>
                <option value="SHA1">SHA1</option>
                <option value="SHA256">SHA256</option>
                <option value="SHA384">SHA384</option>
                <option value="SHA512">SHA512</option>
              </select>
            </div>
            <div class="hash-tool-setting-row">
              <i class="bi bi-type hash-tool-setting-icon"></i>
              <div class="hash-tool-setting-copy">
                <strong>Uppercase</strong>
              </div>
              <span class="hash-tool-switch-label">Off</span>
            </div>
            <div class="hash-tool-secret-row">
              <label for="hash-tool-secret">Secret key to use to generate a HMAC hash</label>
              <div class="hash-tool-inline-actions">
                <button type="button" class="tool-button hash-tool-paste-secret" title="Paste secret key"><i class="bi bi-clipboard"></i> Paste</button>
                <button type="button" class="tool-button hash-tool-clear-secret" title="Clear secret key"><i class="bi bi-x-lg"></i></button>
              </div>
              <input id="hash-tool-secret" class="hash-tool-secret" type="text" autocomplete="off" spellcheck="false">
            </div>
          </section>
          <section class="hash-tool-input-grid">
            <div class="hash-tool-input-panel">
              <div class="hash-tool-panel-heading">
                <span>Input text</span>
                <div class="hash-tool-actions">
                  <button type="button" class="tool-button hash-tool-paste-text" title="Paste input text"><i class="bi bi-clipboard"></i> Paste</button>
                  <button type="button" class="tool-button hash-tool-clear-text" title="Clear input text"><i class="bi bi-x-lg"></i></button>
                </div>
              </div>
              <textarea class="hash-tool-text" spellcheck="false"></textarea>
            </div>
            <div class="hash-tool-input-separator">or</div>
            <div class="hash-tool-dropzone" tabindex="0">
              <input class="hash-tool-file-input" type="file" hidden>
              <strong>Drag &amp; drop any file here</strong>
              <span>or</span>
              <div>
                <button type="button" class="hash-tool-link hash-tool-browse">Browse files</button>
                <span class="hash-tool-drop-divider">/</span>
                <button type="button" class="hash-tool-link hash-tool-paste-file">Paste</button>
              </div>
              <small class="hash-tool-file-name"></small>
            </div>
          </section>
          <section class="hash-tool-output-panel">
            <div class="hash-tool-panel-heading">
              <span>Output</span>
              <div class="hash-tool-actions">
                <button type="button" class="tool-button hash-tool-copy-output" title="Copy output"><i class="bi bi-copy"></i> Copy</button>
              </div>
            </div>
            <input class="hash-tool-output" type="text" readonly>
          </section>
          <section class="hash-tool-verify-panel">
            <div class="hash-tool-panel-heading">
              <span>Checksum to verify data integrity</span>
              <div class="hash-tool-actions">
                <button type="button" class="tool-button hash-tool-paste-checksum" title="Paste checksum"><i class="bi bi-clipboard"></i> Paste</button>
                <button type="button" class="tool-button hash-tool-clear-checksum" title="Clear checksum"><i class="bi bi-x-lg"></i></button>
              </div>
            </div>
            <input class="hash-tool-checksum" type="text" spellcheck="false">
            <p class="hash-tool-status" aria-live="polite"></p>
          </section>
        </div>
      `;
      const uppercaseRow = view.querySelector(".hash-tool-setting-row:nth-child(2)");
      const uppercaseSwitch = createSwitch("Uppercase", false);
      uppercaseRow.querySelector(".hash-tool-switch-label").replaceWith(uppercaseSwitch);
      return view;
    }

    function getElements(view) {
      return {
        algorithm: view.querySelector(".hash-tool-algorithm"),
        uppercase: view.querySelector(".hash-tool-switch"),
        secret: view.querySelector(".hash-tool-secret"),
        text: view.querySelector(".hash-tool-text"),
        output: view.querySelector(".hash-tool-output"),
        checksum: view.querySelector(".hash-tool-checksum"),
        status: view.querySelector(".hash-tool-status"),
        dropzone: view.querySelector(".hash-tool-dropzone"),
        fileInput: view.querySelector(".hash-tool-file-input"),
        fileName: view.querySelector(".hash-tool-file-name"),
        browse: view.querySelector(".hash-tool-browse"),
        pasteFile: view.querySelector(".hash-tool-paste-file"),
        pasteText: view.querySelector(".hash-tool-paste-text"),
        clearText: view.querySelector(".hash-tool-clear-text"),
        pasteSecret: view.querySelector(".hash-tool-paste-secret"),
        clearSecret: view.querySelector(".hash-tool-clear-secret"),
        copyOutput: view.querySelector(".hash-tool-copy-output"),
        pasteChecksum: view.querySelector(".hash-tool-paste-checksum"),
        clearChecksum: view.querySelector(".hash-tool-clear-checksum")
      };
    }

    function isSwitchOn(button) {
      return button?.getAttribute("aria-checked") === "true";
    }

    function setSwitch(button, checked) {
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.textContent = checked ? "On" : "Off";
    }

    function setStatus(elements, message, type) {
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type || "";
    }

    async function copyText(text) {
      if (!text) return;
      if (copyTextToClipboard) {
        await copyTextToClipboard(text);
      } else {
        await navigator.clipboard?.writeText?.(text);
      }
    }

    async function pasteTextInto(input) {
      const text = await navigator.clipboard?.readText?.();
      if (typeof text === "string") {
        input.value = text;
        input.dispatchEvent(new Event("input", { bubbles: true }));
      }
    }

    async function calculate(elements, state) {
      if (!codec?.hashBytes) {
        setStatus(elements, "Hash generator is unavailable.", "error");
        return;
      }
      try {
        const bytes = state.fileBytes || elements.text.value;
        const hash = await codec.hashBytes(bytes, {
          algorithm: elements.algorithm.value,
          uppercase: isSwitchOn(elements.uppercase),
          secret: elements.secret.value
        });
        elements.output.value = hash;
        const verification = codec.verifyChecksum(hash, elements.checksum.value);
        if (verification.status === "match") {
          setStatus(elements, "Checksum matches.", "success");
        } else if (verification.status === "mismatch") {
          setStatus(elements, "Checksum does not match.", "error");
        } else {
          setStatus(elements, state.fileName ? `Hashed ${state.fileName}.` : "", state.fileName ? "success" : "");
        }
      } catch (error) {
        elements.output.value = "";
        setStatus(elements, error?.message || "Could not calculate hash.", "error");
      }
    }

    async function loadFile(elements, state, file) {
      if (!file) return;
      state.fileBytes = new Uint8Array(await file.arrayBuffer());
      state.fileName = file.name || "pasted file";
      elements.fileName.textContent = state.fileName;
      elements.text.value = "";
      await calculate(elements, state);
    }

    async function pasteFile(elements, state) {
      const items = await navigator.clipboard?.read?.().catch(() => null);
      const item = items?.[0];
      const type = item?.types?.[0];
      if (!item || !type) return;
      const blob = await item.getType(type);
      await loadFile(elements, state, new File([blob], "pasted-file"));
    }

    function bindEvents(elements, state) {
      const recalculate = () => calculate(elements, state);
      elements.algorithm.addEventListener("change", recalculate);
      elements.secret.addEventListener("input", recalculate);
      elements.checksum.addEventListener("input", recalculate);
      elements.uppercase.addEventListener("click", function() {
        setSwitch(elements.uppercase, !isSwitchOn(elements.uppercase));
        recalculate();
      });
      elements.text.addEventListener("input", function() {
        state.fileBytes = null;
        state.fileName = "";
        elements.fileName.textContent = "";
        recalculate();
      });
      elements.browse.addEventListener("click", function() { elements.fileInput.click(); });
      elements.fileInput.addEventListener("change", function() { loadFile(elements, state, elements.fileInput.files?.[0]); });
      elements.dropzone.addEventListener("dragover", function(event) {
        event.preventDefault();
        elements.dropzone.classList.add("is-dragging");
      });
      elements.dropzone.addEventListener("dragleave", function() {
        elements.dropzone.classList.remove("is-dragging");
      });
      elements.dropzone.addEventListener("drop", function(event) {
        event.preventDefault();
        elements.dropzone.classList.remove("is-dragging");
        loadFile(elements, state, event.dataTransfer?.files?.[0]);
      });
      elements.pasteText.addEventListener("click", function() { pasteTextInto(elements.text); });
      elements.clearText.addEventListener("click", function() {
        state.fileBytes = null;
        state.fileName = "";
        elements.fileName.textContent = "";
        elements.text.value = "";
        recalculate();
      });
      elements.pasteSecret.addEventListener("click", function() { pasteTextInto(elements.secret); });
      elements.clearSecret.addEventListener("click", function() {
        elements.secret.value = "";
        recalculate();
      });
      elements.copyOutput.addEventListener("click", async function() {
        await copyText(elements.output.value);
        if (elements.output.value) setStatus(elements, "Copied hash.", "success");
      });
      elements.pasteChecksum.addEventListener("click", function() { pasteTextInto(elements.checksum); });
      elements.clearChecksum.addEventListener("click", function() {
        elements.checksum.value = "";
        recalculate();
      });
      elements.pasteFile.addEventListener("click", function() { pasteFile(elements, state); });
    }

    function mountHashToolTab(tab, host) {
      if (!tab?.id || !host) return null;
      let view = mountedTabs.get(tab.id);
      if (!view || !view.isConnected) {
        view = createShell();
        const elements = getElements(view);
        const state = { fileBytes: null, fileName: "" };
        bindEvents(elements, state);
        mountedTabs.set(tab.id, view);
        calculate(elements, state);
      }
      if (view.parentElement !== host) {
        host.textContent = "";
        host.appendChild(view);
      }
      return view;
    }

    function destroyHashToolTab(tabId) {
      const view = mountedTabs.get(tabId);
      if (view) view.remove();
      mountedTabs.delete(tabId);
    }

    function openHashTool() {
      return openHashToolInTab?.() || null;
    }

    document.querySelectorAll(".open-hash-tool").forEach(function(button) {
      button.addEventListener("click", openHashTool);
    });

    const api = { mountHashToolTab, destroyHashToolTab, openHashTool };
    app?.registerModule?.("hashTool", api);
    return api;
  }

  root.registerMarkdownViewerHashTool = registerMarkdownViewerHashTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerHashTool };
  }
})(typeof window !== "undefined" ? window : globalThis);
