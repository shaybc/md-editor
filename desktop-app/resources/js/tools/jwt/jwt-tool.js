(function(root) {
  "use strict";

  root.registerMarkdownViewerJwtTool = function registerMarkdownViewerJwtTool(app, deps = {}) {
    const codec = deps.codec || app?.modules?.jwtCodec || null;
    const copyTextToClipboard = deps.copyTextToClipboard || null;
    const syntaxTextarea = deps.syntaxTextarea || app?.modules?.toolSyntaxTextarea || null;
    const openJwtToolInTab = deps.openJwtToolInTab || null;
    const mountedTabs = new Map();

    function setStatus(elements, message, type = "info") {
      if (!elements?.status) return;
      elements.status.textContent = message || "";
      elements.status.dataset.statusType = type;
    }

    function setSwitch(button, enabled) {
      button?.setAttribute("aria-checked", enabled ? "true" : "false");
      if (button) button.textContent = enabled ? "On" : "Off";
    }

    function isSwitchOn(button) {
      return button?.getAttribute("aria-checked") === "true";
    }

    function getValidationOptions(elements) {
      return {
        validateSignature: isSwitchOn(elements.validateSignature),
        secret: elements.secret.value,
        secretIsBase64: isSwitchOn(elements.secretBase64),
        validateIssuer: isSwitchOn(elements.validateIssuer),
        issuers: elements.issuer.value,
        validateAudience: isSwitchOn(elements.validateAudience),
        audiences: elements.audience.value,
        validateLifetime: isSwitchOn(elements.validateLifetime)
      };
    }

    function setTextSilently(elements, field, value) {
      elements.silent = true;
      field.value = value;
      elements.silent = false;
    }

    async function decodeFromToken(elements) {
      if (!codec || elements.silent) return;
      const token = elements.token.value.trim();
      if (!token) {
        setTextSilently(elements, elements.header, "");
        setTextSilently(elements, elements.payload, "");
        elements.claims.textContent = "";
        setStatus(elements, "");
        return;
      }
      try {
        const result = await codec.validateToken(token, getValidationOptions(elements));
        setTextSilently(elements, elements.header, codec.formatJson(result.decoded.header));
        setTextSilently(elements, elements.payload, codec.formatJson(result.decoded.payload));
        renderClaims(elements, result.claims);
        const worst = result.messages.find((message) => message.type === "error")
          || result.messages.find((message) => message.type === "warning")
          || result.messages[0];
        setStatus(elements, result.messages.map((message) => message.text).join(" "), worst?.type || "success");
      } catch (error) {
        setTextSilently(elements, elements.header, "");
        setTextSilently(elements, elements.payload, "");
        elements.claims.textContent = "";
        setStatus(elements, error?.message || "Invalid JWT token.", "error");
      }
    }

    async function encodeFromJson(elements) {
      if (!codec || elements.silent) return;
      try {
        const token = await codec.encodeToken(elements.header.value, elements.payload.value, {
          algorithm: elements.algorithm.value,
          secret: elements.secret.value,
          secretIsBase64: isSwitchOn(elements.secretBase64)
        });
        setTextSilently(elements, elements.token, token);
        const decoded = codec.decodeToken(token);
        renderClaims(elements, codec.describeClaims(decoded.payload));
        setStatus(elements, "Token encoded.", "success");
      } catch (error) {
        setStatus(elements, error?.message || "Unable to encode JWT token.", "error");
      }
    }

    function renderClaims(elements, claims) {
      if (!elements.claims) return;
      if (!claims?.length) {
        elements.claims.textContent = "";
        return;
      }
      elements.claims.innerHTML = claims.map((claim) => `
        <div class="jwt-tool-claim-row">
          <span class="jwt-tool-claim-name"></span>
          <span class="jwt-tool-claim-value"></span>
        </div>
      `).join("");
      elements.claims.querySelectorAll(".jwt-tool-claim-row").forEach((row, index) => {
        row.querySelector(".jwt-tool-claim-name").textContent = claims[index].name;
        row.querySelector(".jwt-tool-claim-value").textContent = claims[index].formatted || claims[index].value;
      });
    }

    function updateMode(elements) {
      const isEncode = elements.mode.value === "encode";
      elements.shell.dataset.jwtMode = elements.mode.value;
      elements.token.readOnly = isEncode;
      elements.header.readOnly = !isEncode;
      elements.payload.readOnly = !isEncode;
      elements.algorithm.disabled = !isEncode;
      if (isEncode && !elements.header.value.trim()) {
        elements.header.value = '{\n  "alg": "HS256",\n  "typ": "JWT"\n}';
      }
      if (isEncode && !elements.payload.value.trim()) {
        elements.payload.value = '{\n  "sub": "1234567890",\n  "name": "John Doe",\n  "iat": 1516239022\n}';
      }
      void (isEncode ? encodeFromJson(elements) : decodeFromToken(elements));
    }

    function copyValue(value) {
      if (!value) return;
      if (typeof copyTextToClipboard === "function") copyTextToClipboard(value);
      else if (navigator?.clipboard?.writeText) navigator.clipboard.writeText(value);
    }

    async function pasteInto(field, afterPaste) {
      if (!navigator?.clipboard?.readText) return;
      field.value = await navigator.clipboard.readText();
      afterPaste?.();
    }

    function createToolbarButton(icon, label, className) {
      return `<button class="tool-button ${className}" type="button" title="${label}"><i class="bi ${icon}"></i> ${label}</button>`;
    }

    function createToolView() {
      const shell = document.createElement("div");
      shell.className = "jwt-tool-view";
      shell.innerHTML = `
        <div class="jwt-tool-workspace">
          <header class="jwt-tool-header">
            <h2><i class="bi bi-key"></i> JWT Encoder / Decoder</h2>
          </header>
          <section class="jwt-tool-config" aria-label="Configuration">
            <div class="jwt-tool-config-title">Configuration</div>
            <div class="jwt-tool-setting-row">
              <div class="jwt-tool-setting-icon"><i class="bi bi-arrow-left-right"></i></div>
              <div class="jwt-tool-setting-copy"><strong>Tool Mode</strong><span>Select which mode you want to use</span></div>
              <select class="jwt-tool-select jwt-tool-mode" aria-label="Tool mode">
                <option value="decode">Decode</option>
                <option value="encode">Encode</option>
              </select>
            </div>
            <div class="jwt-tool-setting-row">
              <div class="jwt-tool-setting-icon"><i class="bi bi-shield-check"></i></div>
              <div class="jwt-tool-setting-copy"><strong>Token validation settings</strong><span>Select which token parameters to validate</span></div>
              <button class="jwt-tool-switch jwt-tool-validate-signature" type="button" role="switch" aria-checked="false">Off</button>
            </div>
            <div class="jwt-tool-validation-grid">
              <label>Signature key <input class="jwt-tool-input jwt-tool-secret" type="password" autocomplete="off" placeholder="Plain text or Base64 secret"></label>
              <button class="jwt-tool-switch jwt-tool-secret-base64" type="button" role="switch" aria-checked="false">Plain text</button>
              <label>Algorithm <select class="jwt-tool-select jwt-tool-algorithm"><option>HS256</option><option>HS384</option><option>HS512</option></select></label>
              <label>Issuer <input class="jwt-tool-input jwt-tool-issuer" type="text" placeholder="Allowed issuers, comma separated"></label>
              <button class="jwt-tool-switch jwt-tool-validate-issuer" type="button" role="switch" aria-checked="false">Off</button>
              <label>Audience <input class="jwt-tool-input jwt-tool-audience" type="text" placeholder="Allowed audiences, comma separated"></label>
              <button class="jwt-tool-switch jwt-tool-validate-audience" type="button" role="switch" aria-checked="false">Off</button>
              <button class="jwt-tool-switch jwt-tool-validate-lifetime" type="button" role="switch" aria-checked="false">Validate lifetime: Off</button>
            </div>
          </section>
          <section class="jwt-tool-token-panel">
            <div class="jwt-tool-panel-heading"><label for="jwt-tool-token">Token</label><div class="jwt-tool-actions">${createToolbarButton("bi-clipboard", "Paste", "jwt-tool-paste-token")}${createToolbarButton("bi-copy", "Copy", "jwt-tool-copy-token")}<button class="tool-button jwt-tool-clear-token" type="button" title="Clear"><i class="bi bi-x-lg"></i></button></div></div>
            <textarea id="jwt-tool-token" class="jwt-tool-textarea jwt-tool-token" spellcheck="false"></textarea>
          </section>
          <section class="jwt-tool-json-grid">
            <div class="jwt-tool-json-panel">
              <div class="jwt-tool-panel-heading"><label for="jwt-tool-header">Header</label><button class="tool-button jwt-tool-copy-header" type="button" title="Copy"><i class="bi bi-copy"></i> Copy</button></div>
              <textarea id="jwt-tool-header" class="jwt-tool-textarea jwt-tool-header-json" spellcheck="false"></textarea>
            </div>
            <div class="jwt-tool-json-panel">
              <div class="jwt-tool-panel-heading"><label for="jwt-tool-payload">Payload</label><button class="tool-button jwt-tool-copy-payload" type="button" title="Copy"><i class="bi bi-copy"></i> Copy</button></div>
              <textarea id="jwt-tool-payload" class="jwt-tool-textarea jwt-tool-payload" spellcheck="false"></textarea>
            </div>
          </section>
          <section class="jwt-tool-claims" aria-label="Decoded claims"></section>
          <footer class="jwt-tool-status" role="status" aria-live="polite"></footer>
        </div>
      `;
      return shell;
    }

    function getElements(shell) {
      return {
        shell,
        mode: shell.querySelector(".jwt-tool-mode"),
        validateSignature: shell.querySelector(".jwt-tool-validate-signature"),
        secretBase64: shell.querySelector(".jwt-tool-secret-base64"),
        validateIssuer: shell.querySelector(".jwt-tool-validate-issuer"),
        validateAudience: shell.querySelector(".jwt-tool-validate-audience"),
        validateLifetime: shell.querySelector(".jwt-tool-validate-lifetime"),
        secret: shell.querySelector(".jwt-tool-secret"),
        issuer: shell.querySelector(".jwt-tool-issuer"),
        audience: shell.querySelector(".jwt-tool-audience"),
        algorithm: shell.querySelector(".jwt-tool-algorithm"),
        token: shell.querySelector(".jwt-tool-token"),
        header: shell.querySelector(".jwt-tool-header-json"),
        payload: shell.querySelector(".jwt-tool-payload"),
        syntaxEditors: [],
        claims: shell.querySelector(".jwt-tool-claims"),
        status: shell.querySelector(".jwt-tool-status"),
        silent: false
      };
    }

    function enableSyntaxTextareas(elements) {
      elements.syntaxEditors = [
        syntaxTextarea?.attach?.(elements.header, { language: "json" }),
        syntaxTextarea?.attach?.(elements.payload, { language: "json" })
      ].filter(Boolean);
    }

    function bindTool(elements) {
      elements.mode.addEventListener("change", () => updateMode(elements));
      elements.token.addEventListener("input", () => decodeFromToken(elements));
      elements.header.addEventListener("input", () => encodeFromJson(elements));
      elements.payload.addEventListener("input", () => encodeFromJson(elements));
      [elements.secret, elements.issuer, elements.audience, elements.algorithm].forEach((field) => {
        field.addEventListener("input", () => (elements.mode.value === "encode" ? encodeFromJson(elements) : decodeFromToken(elements)));
        field.addEventListener("change", () => (elements.mode.value === "encode" ? encodeFromJson(elements) : decodeFromToken(elements)));
      });
      [elements.validateSignature, elements.validateIssuer, elements.validateAudience].forEach((button) => {
        button.addEventListener("click", () => {
          setSwitch(button, !isSwitchOn(button));
          void decodeFromToken(elements);
        });
      });
      elements.secretBase64.addEventListener("click", () => {
        const enabled = !isSwitchOn(elements.secretBase64);
        elements.secretBase64.setAttribute("aria-checked", enabled ? "true" : "false");
        elements.secretBase64.textContent = enabled ? "Base64" : "Plain text";
        void (elements.mode.value === "encode" ? encodeFromJson(elements) : decodeFromToken(elements));
      });
      elements.validateLifetime.addEventListener("click", () => {
        const enabled = !isSwitchOn(elements.validateLifetime);
        elements.validateLifetime.setAttribute("aria-checked", enabled ? "true" : "false");
        elements.validateLifetime.textContent = `Validate lifetime: ${enabled ? "On" : "Off"}`;
        void decodeFromToken(elements);
      });
      elements.shell.querySelector(".jwt-tool-paste-token").addEventListener("click", () => pasteInto(elements.token, () => decodeFromToken(elements)));
      elements.shell.querySelector(".jwt-tool-copy-token").addEventListener("click", () => copyValue(elements.token.value));
      elements.shell.querySelector(".jwt-tool-copy-header").addEventListener("click", () => copyValue(elements.header.value));
      elements.shell.querySelector(".jwt-tool-copy-payload").addEventListener("click", () => copyValue(elements.payload.value));
      elements.shell.querySelector(".jwt-tool-clear-token").addEventListener("click", () => {
        elements.token.value = "";
        elements.header.value = "";
        elements.payload.value = "";
        elements.claims.textContent = "";
        setStatus(elements, "Cleared.");
      });
      updateMode(elements);
    }

    function mountJwtToolTab(tab, rootElement) {
      let entry = mountedTabs.get(tab.id);
      if (!entry) {
        const shell = createToolView();
        const elements = getElements(shell);
        enableSyntaxTextareas(elements);
        bindTool(elements);
        entry = { shell, elements };
        mountedTabs.set(tab.id, entry);
      }
      rootElement.replaceChildren(entry.shell);
    }

    function destroyJwtToolTab(tabId) {
      mountedTabs.delete(tabId);
    }

    document.querySelectorAll?.(".open-jwt-tool")?.forEach?.((button) => {
      button.addEventListener("click", () => openJwtToolInTab?.());
    });

    const api = { mountJwtToolTab, destroyJwtToolTab };
    app?.registerModule?.("jwtTool", api);
    return api;
  };
})(typeof window !== "undefined" ? window : globalThis);