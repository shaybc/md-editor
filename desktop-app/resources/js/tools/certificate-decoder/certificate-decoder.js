// Certificate Decoder tab UI and file handling.
(function(global) {
  "use strict";

  function registerMarkdownViewerCertificateDecoder(app, deps = {}) {
    const mountedTabs = new Map();
    const parser = deps.parser || app?.services?.certificateParser || app?.modules?.certificateParser || null;

    function formatBytes(bytes) {
      const size = Number(bytes || 0);
      if (size < 1024) return `${size} B`;
      if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
      return `${(size / (1024 * 1024)).toFixed(2)} MB`;
    }

    function setStatus(elements, message, type = "info") {
      if (!elements.status) return;
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type;
    }

    async function readFile(file) {
      const bytes = new Uint8Array(await file.arrayBuffer());
      const text = new TextDecoder().decode(bytes);
      if (/-----BEGIN [^-]+-----/i.test(text)) return { value: text, display: text };
      const lowerName = String(file?.name || "").toLowerCase();
      if (lowerName.endsWith(".pem")) return { value: text, display: text };
      return { value: bytes, display: `${file?.name || "certificate"} (${formatBytes(bytes.length)})` };
    }

    async function copyText(text) {
      const value = String(text || "");
      if (!value) return false;
      if (typeof deps.copyTextToClipboard === "function") {
        await deps.copyTextToClipboard(value);
        return true;
      }
      if (global.navigator?.clipboard?.writeText) {
        await global.navigator.clipboard.writeText(value);
        return true;
      }
      return false;
    }

    async function pasteText(elements) {
      const text = await global.navigator?.clipboard?.readText?.();
      if (typeof text !== "string") return;
      elements.input.value = text;
      await decodeInput(elements);
    }

    function renderSection(lines, title, values) {
      const filtered = Array.isArray(values) ? values.filter(Boolean) : [values].filter(Boolean);
      if (!filtered.length) return;
      lines.push(`[${title}]`);
      filtered.forEach((value) => lines.push(`  ${value}`));
      lines.push("");
    }

    function findExtension(certificate, oid) {
      return (certificate.extensions || []).find((extension) => extension.oid === oid) || null;
    }

    async function digestHex(name, bytes) {
      if (!global.crypto?.subtle?.digest) return "";
      try {
        const digest = await global.crypto.subtle.digest(name, bytes);
        return parser?.bytesToHex?.(new Uint8Array(digest), "") || "";
      } catch (_error) {
        return "";
      }
    }

    async function renderCertificate(certificate) {
      const lines = [];
      renderSection(lines, "Subject", certificate.subject?.text || "(empty)");
      renderSection(lines, "Issuer", certificate.issuer?.text || "(empty)");
      renderSection(lines, "Serial Number", certificate.serialNumber);
      renderSection(lines, "Not Before", certificate.notBefore?.iso);
      renderSection(lines, "Not After", certificate.notAfter?.iso);
      const sha1 = await digestHex("SHA-1", certificate.der);
      const sha256 = await digestHex("SHA-256", certificate.der);
      renderSection(lines, "Thumbprint", sha1 ? `SHA-1=${sha1}` : "");
      renderSection(lines, "SHA-256", sha256);
      renderSection(lines, "Version", certificate.version);
      renderSection(lines, "Signature Algorithm", certificate.signatureAlgorithm?.name || certificate.signatureAlgorithm?.oid);
      renderSection(lines, "Public Key Algorithm", certificate.publicKeyAlgorithm?.name || certificate.publicKeyAlgorithm?.oid);

      const orderedExtensionOids = [
        "2.5.29.15",
        "2.5.29.37",
        "2.5.29.19",
        "2.5.29.14",
        "2.5.29.35",
        "1.3.6.1.5.5.7.1.1",
        "2.5.29.17"
      ];
      orderedExtensionOids.forEach((oid) => {
        const extension = findExtension(certificate, oid);
        if (extension) renderSection(lines, extension.name, extension.values);
      });
      (certificate.extensions || [])
        .filter((extension) => !orderedExtensionOids.includes(extension.oid))
        .forEach((extension) => renderSection(lines, `${extension.name}${extension.critical ? " (critical)" : ""}`, extension.values));
      return lines.join("\n").trimEnd();
    }

    async function decodeInput(elements, sourceValue) {
      if (!parser?.parseCertificate) {
        setStatus(elements, "Certificate parser is unavailable.", "error");
        return;
      }
      const value = sourceValue == null ? elements.input.value : sourceValue;
      if (typeof value === "string" && !value.trim()) {
        elements.output.textContent = "";
        setStatus(elements, "", "info");
        return;
      }
      try {
        const certificate = parser.parseCertificate(value);
        elements.output.textContent = await renderCertificate(certificate);
        setStatus(elements, "Certificate decoded.", "success");
      } catch (error) {
        elements.output.textContent = error?.message || "Unable to decode certificate.";
        setStatus(elements, error?.message || "Unable to decode certificate.", "error");
      }
    }

    async function handleFile(elements, file) {
      if (!file) return;
      try {
        const fileContent = await readFile(file);
        elements.input.value = fileContent.display;
        await decodeInput(elements, fileContent.value);
      } catch (error) {
        elements.output.textContent = error?.message || "Unable to read certificate file.";
        setStatus(elements, error?.message || "Unable to read certificate file.", "error");
      }
    }

    function createShell() {
      const shell = document.createElement("div");
      shell.className = "certificate-decoder-view";
      shell.innerHTML = `
        <div class="certificate-decoder-workspace">
          <header class="certificate-decoder-header">
            <h2><i class="bi bi-award" aria-hidden="true"></i> Certificate Decoder</h2>
          </header>
          <main class="certificate-decoder-grid">
            <section class="certificate-decoder-panel certificate-decoder-input-panel">
              <div class="certificate-decoder-password-row">
                <label class="certificate-decoder-label" for="certificate-decoder-password">Password</label>
                <input id="certificate-decoder-password" class="certificate-decoder-password" type="password" autocomplete="off">
              </div>
              <div class="certificate-decoder-dropzone" tabindex="0">
                <input class="certificate-decoder-file-input" type="file" accept=".cer,.crt,.pem,.der,.pfx,.p12,application/x-x509-ca-cert,application/pkix-cert" hidden>
                <strong>Drag & drop a CER, CRT, PEM, PFX file here</strong>
                <span>or</span>
                <div class="certificate-decoder-dropzone-actions">
                  <button class="tool-button certificate-decoder-browse" type="button">Browse files</button>
                  <button class="tool-button certificate-decoder-paste-file" type="button">Paste</button>
                </div>
              </div>
              <div class="certificate-decoder-panel-heading">
                <label for="certificate-decoder-input">Input</label>
                <div class="certificate-decoder-actions">
                  <button class="tool-button certificate-decoder-paste" type="button" title="Paste certificate"><i class="bi bi-clipboard" aria-hidden="true"></i> Paste</button>
                  <button class="tool-button certificate-decoder-clear" type="button" title="Clear"><i class="bi bi-x-lg" aria-hidden="true"></i></button>
                  <button class="tool-button certificate-decoder-copy-input" type="button" title="Copy input"><i class="bi bi-copy" aria-hidden="true"></i> Copy</button>
                </div>
              </div>
              <textarea id="certificate-decoder-input" class="certificate-decoder-input" spellcheck="false" placeholder="Paste a PEM certificate or Base64 DER certificate"></textarea>
            </section>
            <section class="certificate-decoder-panel certificate-decoder-output-panel">
              <div class="certificate-decoder-panel-heading">
                <label for="certificate-decoder-output">Output</label>
                <button class="tool-button certificate-decoder-copy-output" type="button" title="Copy output"><i class="bi bi-copy" aria-hidden="true"></i> Copy</button>
              </div>
              <pre id="certificate-decoder-output" class="certificate-decoder-output"></pre>
            </section>
          </main>
          <footer class="certificate-decoder-status" role="status" aria-live="polite"></footer>
        </div>`;
      return shell;
    }

    function getElements(shell) {
      return {
        password: shell.querySelector(".certificate-decoder-password"),
        input: shell.querySelector(".certificate-decoder-input"),
        output: shell.querySelector(".certificate-decoder-output"),
        fileInput: shell.querySelector(".certificate-decoder-file-input"),
        browse: shell.querySelector(".certificate-decoder-browse"),
        pasteFile: shell.querySelector(".certificate-decoder-paste-file"),
        paste: shell.querySelector(".certificate-decoder-paste"),
        clear: shell.querySelector(".certificate-decoder-clear"),
        copyInput: shell.querySelector(".certificate-decoder-copy-input"),
        copyOutput: shell.querySelector(".certificate-decoder-copy-output"),
        dropzone: shell.querySelector(".certificate-decoder-dropzone"),
        status: shell.querySelector(".certificate-decoder-status")
      };
    }

    async function pasteFile(elements) {
      const items = await global.navigator?.clipboard?.read?.();
      for (const item of items || []) {
        for (const type of item.types || []) {
          if (type === "text/plain") {
            const blob = await item.getType(type);
            elements.input.value = await blob.text();
            await decodeInput(elements);
            return;
          }
        }
      }
      await pasteText(elements);
    }

    function bindEvents(elements) {
      elements.input.addEventListener("input", () => decodeInput(elements).catch((error) => setStatus(elements, error?.message || "Unable to decode certificate.", "error")));
      elements.browse.addEventListener("click", () => elements.fileInput.click());
      elements.fileInput.addEventListener("change", () => handleFile(elements, elements.fileInput.files?.[0]));
      elements.pasteFile.addEventListener("click", () => pasteFile(elements).catch((error) => setStatus(elements, error?.message || "Paste failed.", "error")));
      elements.paste.addEventListener("click", () => pasteText(elements).catch((error) => setStatus(elements, error?.message || "Paste failed.", "error")));
      elements.clear.addEventListener("click", () => {
        elements.input.value = "";
        elements.output.textContent = "";
        elements.password.value = "";
        setStatus(elements, "Cleared.", "info");
      });
      elements.copyInput.addEventListener("click", async () => {
        if (await copyText(elements.input.value)) setStatus(elements, "Input copied.", "success");
      });
      elements.copyOutput.addEventListener("click", async () => {
        if (await copyText(elements.output.textContent)) setStatus(elements, "Output copied.", "success");
      });
      elements.dropzone.addEventListener("dragover", (event) => {
        event.preventDefault();
        elements.dropzone.classList.add("drag-over");
      });
      elements.dropzone.addEventListener("dragleave", () => elements.dropzone.classList.remove("drag-over"));
      elements.dropzone.addEventListener("drop", (event) => {
        event.preventDefault();
        elements.dropzone.classList.remove("drag-over");
        handleFile(elements, event.dataTransfer?.files?.[0]);
      });
    }

    function mountCertificateDecoderTab(tab, root) {
      if (!root || !tab?.id) return null;
      let state = mountedTabs.get(tab.id);
      if (!state || !state.shell?.isConnected) {
        root.textContent = "";
        const shell = createShell();
        const elements = getElements(shell);
        bindEvents(elements);
        state = { shell, elements };
        mountedTabs.set(tab.id, state);
        root.appendChild(shell);
      } else if (state.shell.parentElement !== root) {
        root.textContent = "";
        root.appendChild(state.shell);
      }
      return state.shell;
    }

    function destroyCertificateDecoderTab(tabId) {
      const state = mountedTabs.get(tabId);
      if (state?.shell?.isConnected) state.shell.remove();
      mountedTabs.delete(tabId);
    }

    function openCertificateDecoder() {
      return deps.openCertificateDecoderInTab?.() || null;
    }

    document.querySelectorAll?.(".open-certificate-decoder")?.forEach?.((button) => {
      button.addEventListener("click", () => openCertificateDecoder());
    });

    const api = { openCertificateDecoder, mountCertificateDecoderTab, destroyCertificateDecoderTab };
    app?.registerModule?.("certificateDecoder", api);
    return api;
  }

  global.registerMarkdownViewerCertificateDecoder = registerMarkdownViewerCertificateDecoder;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerCertificateDecoder };
  }
})(typeof window !== "undefined" ? window : globalThis);