// SOAP Client railbar tool.
(function(root) {
  "use strict";

  const API_CLIENT_BRIDGE_PATH = "resources/bridges/api-client-bridge/api-client-bridge.cjs";

  function quoteCommandArg(value) {
    return `"${String(value || "").replace(/(["\\])/g, "\\$1")}"`;
  }

  function encodeJsonRequest(payload) {
    const json = JSON.stringify(payload);
    if (typeof Buffer !== "undefined") return Buffer.from(json, "utf8").toString("base64");
    return root.btoa(unescape(encodeURIComponent(json)));
  }

  function formatXml(xml) {
    const text = String(xml || "").trim();
    if (!text) return "";
    return text
      .replace(/>\s*</g, ">\n<")
      .split("\n")
      .reduce((lines, line) => {
        const trimmed = line.trim();
        const closing = /^<\//.test(trimmed);
        const selfClosing = /\/>$/.test(trimmed) || /^<\?/.test(trimmed) || /^<!/.test(trimmed);
        const opening = /^<[^/!?][^>]*>$/.test(trimmed) && !selfClosing;
        const depth = Math.max(0, lines.depth + (closing ? -1 : 0));
        lines.items.push(`${"  ".repeat(depth)}${trimmed}`);
        lines.depth = Math.max(0, depth + (opening ? 1 : 0));
        return lines;
      }, { depth: 0, items: [] }).items.join("\n");
  }

  function textSize(value) {
    return new Blob([String(value || "")]).size;
  }

  function createIconButton(label, iconClass, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className || "tool-icon-button";
    const icon = document.createElement("i");
    icon.className = iconClass;
    icon.setAttribute("aria-hidden", "true");
    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(icon);
    button.appendChild(text);
    return button;
  }

  /**
   * Registers the WSDL/SOAP railbar tool with MD-Editor.
   * @param {object} app Application service container.
   * @param {object} deps Runtime dependencies supplied by script.js.
   * @returns {object} SOAP Client public API.
   */
  function registerMarkdownViewerSoapClient(app, deps = {}) {
    const parser = deps.parser || root.markdownViewerSoapWsdlParser;
    const requestBuilder = deps.requestBuilder || root.markdownViewerSoapRequestBuilder;
    const storage = deps.storage || root.markdownViewerSoapClientStorage?.createSoapClientStorage?.(deps);
    const sidebarFactory = deps.sidebarFactory || root.markdownViewerSoapClientSidebar;
    const syntaxTextarea = deps.syntaxTextarea || root.markdownViewerToolSyntaxTextarea || null;
    const mountedViews = new Map();
    let sidebar = null;
    let sidebarPanel = null;
    let activatingSidebarView = false;
    let wsdls = [];
    let history = [];

    function isDesktopRuntime() {
      return typeof deps.isNeutralinoRuntime === "function" ? deps.isNeutralinoRuntime() : !!deps.Neutralino;
    }

    function getNeutralino() {
      return deps.Neutralino || root.Neutralino || null;
    }

    async function loadState() {
      wsdls = storage?.loadWsdls ? await storage.loadWsdls() : [];
      history = storage?.loadHistory ? await storage.loadHistory(50) : [];
      renderSidebar();
    }

    function renderSidebar() {
      sidebar?.render?.({ wsdls, history });
    }
    function setSidebarStatus(message, tone) {
      sidebar?.setStatus?.(message, tone);
    }

    function setStatus(view, message, tone) {
      if (!view?.status) return;
      view.status.textContent = message || "";
      view.status.dataset.tone = tone || "";
    }

    function createInitialState(options = {}) {
      const operation = options.operationSnapshot || options.operation || null;
      return {
        wsdlLabel: options.wsdlLabel || operation?.sourceLabel || "",
        serviceName: options.serviceName || operation?.serviceName || "",
        portName: options.portName || operation?.portName || "",
        operationName: options.operationName || operation?.name || "",
        endpointUrl: options.endpointUrl || operation?.endpointUrl || "",
        soapAction: options.soapAction || operation?.soapAction || "",
        soapVersion: options.soapVersion || operation?.soapVersion || "1.1",
        requestXml: options.requestXml || (operation ? requestBuilder?.createSoapEnvelope?.(operation) || "" : ""),
        responseXml: options.responseXml || "",
        responseMeta: options.responseMeta || null,
        operationSnapshot: operation
      };
    }

    function syncTabState(view) {
      const state = {
        ...(view.tab.soapClient || {}),
        wsdlLabel: view.wsdlLabelInput.value,
        serviceName: view.serviceInput.value,
        portName: view.portInput.value,
        operationName: view.operationInput.value,
        endpointUrl: view.endpointInput.value,
        soapVersion: view.soapVersionSelect.value,
        requestXml: view.requestInput.value,
        responseXml: view.responseInput.value
      };
      view.tab.soapClient = state;
      return state;
    }

    function runBridgeRequest(payload, view) {
      return new Promise(async (resolve, reject) => {
        if (!isDesktopRuntime()) {
          reject(new Error("Desktop request bridge is unavailable."));
          return;
        }
        const Neutralino = getNeutralino();
        const command = `node ${quoteCommandArg(API_CLIENT_BRIDGE_PATH)} ${encodeJsonRequest(payload)}`;
        let output = "";
        let errorOutput = "";
        let unsubscribe = null;
        const cleanup = () => {
          if (typeof unsubscribe === "function") unsubscribe();
          if (view) view.activeProcessId = null;
        };
        const finish = () => {
          cleanup();
          try {
            const result = JSON.parse(output || "{}");
            if (result.ok === false) reject(new Error(result.error?.message || "Request failed."));
            else resolve(result);
          } catch (_error) {
            reject(new Error(errorOutput.trim() || "Request bridge returned an invalid response."));
          }
        };
        try {

          let processId = null;
          unsubscribe = await Neutralino.events.on("spawnedProcess", (event) => {
            const detail = event?.detail || {};
            if (processId == null || detail.id !== processId) return;
            if (detail.action === "stdOut") output += detail.data || "";
            else if (detail.action === "stdErr") errorOutput += detail.data || "";
            else if (detail.action === "exit") finish();
          });
          const handle = await Neutralino.os.spawnProcess(command);
          processId = handle?.id ?? handle;
          if (view) view.activeProcessId = processId;
        } catch (error) {
          cleanup();
          reject(error);
        }
      });
    }

    async function importWsdlFromText(source, sourceLabel) {
      const wsdlDocument = parser.parseWsdl(source, sourceLabel);
      wsdlDocument.importedAt = Date.now();
      wsdls = [wsdlDocument].concat(wsdls.filter((candidate) => candidate.id !== wsdlDocument.id));
      if (storage?.saveWsdls) wsdls = await storage.saveWsdls(wsdls);
      renderSidebar();
      return wsdlDocument;
    }

    async function importWsdlFromUrl(url) {
      const normalizedUrl = String(url || "").trim();
      if (!normalizedUrl) return null;
      const payload = {
        method: "GET",
        url: normalizedUrl,
        headers: { Accept: "text/xml, application/wsdl+xml, application/xml, */*" },
        bodyMode: "none",
        body: "",
        requestSettings: { ...(deps.getRequestSettings?.() || {}), responseRenderMode: "xml" }
      };
      const result = await runBridgeRequest(payload, null);
      return importWsdlFromText(result?.response?.body || "", normalizedUrl);
    }

    async function importWsdlFromFile() {
      const Neutralino = getNeutralino();
      if (!Neutralino?.os?.showOpenDialog || !Neutralino?.filesystem?.readFile) return null;
      const files = await Neutralino.os.showOpenDialog("Import WSDL", {
        filters: [{ name: "WSDL/XML", extensions: ["wsdl", "xml"] }]
      });
      const filePath = Array.isArray(files) ? files[0] : files;
      if (!filePath) return null;
      const source = await Neutralino.filesystem.readFile(filePath);
      return importWsdlFromText(source, String(filePath).split(/[\\/]/).pop() || filePath);
    }

    function activateSoapClientSidebar() {
      if (activatingSidebarView === false && typeof deps.setSidebarView === "function") {
        activatingSidebarView = true;
        try {
          deps.setSidebarView("soap-client");
        } finally {
          activatingSidebarView = false;
        }
      }
      const panel = document.getElementById("soap-client-sidebar-panel");
      if (!panel) return;
      panel.hidden = false;
      if (!sidebar || sidebarPanel !== panel) {
        sidebarPanel = panel;
        sidebar = sidebarFactory?.createSoapClientSidebar?.(panel, {
          onImportUrl: async (url) => {
            const normalizedUrl = String(url || "").trim();
            if (!normalizedUrl) {
              setSidebarStatus("Enter a WSDL URL first.", "error");
              return;
            }
            setSidebarStatus("Importing WSDL...", "");
            try {
              const wsdlDocument = await importWsdlFromUrl(normalizedUrl);
              const operationCount = Array.isArray(wsdlDocument?.operations) ? wsdlDocument.operations.length : 0;
              setSidebarStatus(`Imported ${operationCount} SOAP operation${operationCount === 1 ? "" : "s"}.`, "success");
            } catch (error) {
              console.error("Failed to import WSDL URL:", error);
              setSidebarStatus(error?.message || "Failed to import WSDL URL.", "error");
            }
          },
          onImportFile: async () => {
            setSidebarStatus("Importing WSDL...", "");
            try {
              const wsdlDocument = await importWsdlFromFile();
              if (!wsdlDocument) {
                setSidebarStatus("", "");
                return;
              }
              const operationCount = Array.isArray(wsdlDocument.operations) ? wsdlDocument.operations.length : 0;
              setSidebarStatus(`Imported ${operationCount} SOAP operation${operationCount === 1 ? "" : "s"}.`, "success");
            } catch (error) {
              console.error("Failed to import WSDL file:", error);
              setSidebarStatus(error?.message || "Failed to import WSDL file.", "error");
            }
          },
          onRefresh: () => void loadState(),
          onNewRequest: () => openSoapClientTab(),
          onOpenOperation: (operation, document) => openSoapClientTab({ operationSnapshot: { ...operation, sourceLabel: document.sourceLabel }, wsdlLabel: document.sourceLabel })
        });
      }
      renderSidebar();
    }

    function deactivateSoapClientSidebar() {
      const panel = document.getElementById("soap-client-sidebar-panel");
      if (panel) panel.hidden = true;
    }

    function openSoapClientTab(operationSnapshot) {
      return deps.openSoapClientInTab?.(operationSnapshot || {}) || null;
    }

    async function sendSoapRequest(view) {
      const state = syncTabState(view);
      if (!state.endpointUrl) {
        setStatus(view, "Endpoint URL is required.", "error");
        return;
      }
      setStatus(view, "Sending SOAP request...", "");
      view.sendButton.disabled = true;
      try {
        const payload = requestBuilder.createSoapHttpRequest(state, deps.getRequestSettings?.() || {});
        const result = await runBridgeRequest(payload, view);
        const response = result?.response || {};
        const responseBody = response.body || "";
        view.responseInput.value = formatXml(responseBody);
        const metadata = {
          statusCode: response.statusCode || 0,
          elapsedMs: result.elapsedMs || 0,
          contentType: response.headers?.["content-type"] || response.headers?.["Content-Type"] || "",
          sizeBytes: response.sizeBytes || textSize(responseBody)
        };
        view.meta.textContent = `Status: ${metadata.statusCode || "No status"} | Duration: ${metadata.elapsedMs} ms | Content-Type: ${metadata.contentType || "unknown"} | Size: ${metadata.sizeBytes} bytes`;
        view.tab.soapClient = { ...state, responseXml: view.responseInput.value, responseMeta: metadata };
        history = [{ id: `soap_${Date.now()}`, operationName: state.operationName, endpointUrl: state.endpointUrl, statusCode: metadata.statusCode, elapsedMs: metadata.elapsedMs, createdAt: Date.now() }].concat(history).slice(0, 50);
        if (storage?.saveHistory) history = await storage.saveHistory(history, 50);
        renderSidebar();
        setStatus(view, "SOAP response received.", "success");
      } catch (error) {
        setStatus(view, error?.message || "SOAP request failed.", "error");
      } finally {
        view.sendButton.disabled = false;
      }
    }

    function mountSoapClientTab(tab, rootElement) {
      if (!tab || !rootElement) return;
      let view = mountedViews.get(tab.id);
      if (view && view.root === rootElement) return;
      const state = createInitialState(tab.soapClient || {});
      tab.soapClient = state;
      rootElement.textContent = "";
      rootElement.classList.add("soap-client-tab");
      rootElement.innerHTML = `
        <div class="soap-client-workbench">
          <header class="soap-client-tab-header">
            <h2><i class="bi bi-diagram-3" aria-hidden="true"></i> SOAP Client</h2>
            <div class="soap-client-actions"></div>
          </header>
          <section class="soap-client-config-row">
            <label>WSDL<input data-soap-field="wsdlLabel" type="text"></label>
            <label>Service<input data-soap-field="service" type="text"></label>
            <label>Port<input data-soap-field="port" type="text"></label>
            <label>Operation<input data-soap-field="operation" type="text"></label>
            <label class="soap-client-endpoint">Endpoint URL<input data-soap-field="endpoint" type="text"></label>
            <label>SOAP<select data-soap-field="version"><option value="1.1">1.1</option><option value="1.2">1.2</option></select></label>
          </section>
          <section class="soap-client-editors">
            <div class="soap-client-editor-pane">
              <div class="soap-client-pane-title"><span>Request XML</span><button data-soap-action="copy-request" type="button"><i class="bi bi-clipboard" aria-hidden="true"></i> Copy request</button></div>
              <textarea data-soap-field="request"></textarea>
            </div>
            <div class="soap-client-editor-pane">
              <div class="soap-client-pane-title"><span>Response XML</span><button data-soap-action="copy-response" type="button"><i class="bi bi-clipboard" aria-hidden="true"></i> Copy response</button></div>
              <textarea data-soap-field="response" readonly></textarea>
            </div>
          </section>
          <div class="soap-client-response-meta"></div>
          <div class="soap-client-status" role="status"></div>
        </div>`;
      const actions = rootElement.querySelector(".soap-client-actions");
      const sendButton = createIconButton("Send", "bi bi-send");
      const formatButton = createIconButton("Format", "bi bi-magic");
      actions.appendChild(sendButton);
      actions.appendChild(formatButton);
      view = {
        root: rootElement,
        tab,
        wsdlLabelInput: rootElement.querySelector('[data-soap-field="wsdlLabel"]'),
        serviceInput: rootElement.querySelector('[data-soap-field="service"]'),
        portInput: rootElement.querySelector('[data-soap-field="port"]'),
        operationInput: rootElement.querySelector('[data-soap-field="operation"]'),
        endpointInput: rootElement.querySelector('[data-soap-field="endpoint"]'),
        soapVersionSelect: rootElement.querySelector('[data-soap-field="version"]'),
        requestInput: rootElement.querySelector('[data-soap-field="request"]'),
        responseInput: rootElement.querySelector('[data-soap-field="response"]'),
        meta: rootElement.querySelector(".soap-client-response-meta"),
        status: rootElement.querySelector(".soap-client-status"),
        sendButton
      };
      view.wsdlLabelInput.value = state.wsdlLabel;
      view.serviceInput.value = state.serviceName;
      view.portInput.value = state.portName;
      view.operationInput.value = state.operationName;
      view.endpointInput.value = state.endpointUrl;
      view.soapVersionSelect.value = state.soapVersion;
      view.requestInput.value = state.requestXml;
      view.responseInput.value = state.responseXml || "";
      if (state.responseMeta) view.meta.textContent = `Status: ${state.responseMeta.statusCode || "No status"} | Duration: ${state.responseMeta.elapsedMs || 0} ms | Content-Type: ${state.responseMeta.contentType || "unknown"} | Size: ${state.responseMeta.sizeBytes || 0} bytes`;
      syntaxTextarea?.attach?.(view.requestInput, { language: "xml" });
      syntaxTextarea?.attach?.(view.responseInput, { language: "xml" });
      [view.wsdlLabelInput, view.serviceInput, view.portInput, view.operationInput, view.endpointInput, view.soapVersionSelect, view.requestInput].forEach((input) => {
        input.addEventListener("input", () => syncTabState(view));
        input.addEventListener("change", () => syncTabState(view));
      });
      sendButton.addEventListener("click", () => void sendSoapRequest(view));
      formatButton.addEventListener("click", () => {
        view.requestInput.value = formatXml(view.requestInput.value);
        syncTabState(view);
      });
      rootElement.querySelector('[data-soap-action="copy-request"]')?.addEventListener("click", () => deps.copyTextToClipboard?.(view.requestInput.value));
      rootElement.querySelector('[data-soap-action="copy-response"]')?.addEventListener("click", () => deps.copyTextToClipboard?.(view.responseInput.value));
      mountedViews.set(tab.id, view);
    }

    function destroySoapClientTab(tabId) {
      mountedViews.delete(tabId);
    }

    void loadState();

    const api = {
      mountSoapClientTab,
      activateSoapClientSidebar,
      deactivateSoapClientSidebar,
      openSoapClientTab,
      importWsdlFromUrl,
      importWsdlFromText,
      destroySoapClientTab
    };
    app?.registerModule?.("soapClient", api);
    return api;
  }

  root.registerMarkdownViewerSoapClient = registerMarkdownViewerSoapClient;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerSoapClient, formatXml };
})(typeof window !== "undefined" ? window : globalThis);
