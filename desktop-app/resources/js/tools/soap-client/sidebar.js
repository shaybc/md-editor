// Sidebar renderer for the SOAP Client railbar panel.
(function(root) {
  "use strict";

  function createButton(label, iconClass, className) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = className || "soap-client-sidebar-action";
    if (iconClass) {
      const icon = document.createElement("i");
      icon.className = iconClass;
      icon.setAttribute("aria-hidden", "true");
      button.appendChild(icon);
    }
    const text = document.createElement("span");
    text.textContent = label;
    button.appendChild(text);
    return button;
  }

  function createSoapClientSidebar(panel, handlers = {}) {
    const wsdlTree = panel?.querySelector?.("[data-soap-client-wsdl-tree]");
    const historyList = panel?.querySelector?.("[data-soap-client-history]");
    const urlInput = panel?.querySelector?.("[data-soap-client-url]");
    const status = panel?.querySelector?.("[data-soap-client-status]");
    panel?.querySelector?.("[data-soap-client-import-url]")?.addEventListener("click", () => handlers.onImportUrl?.(urlInput?.value || ""));
    panel?.querySelector?.("[data-soap-client-import-file]")?.addEventListener("click", () => handlers.onImportFile?.());
    panel?.querySelector?.("[data-soap-client-refresh]")?.addEventListener("click", () => handlers.onRefresh?.());
    panel?.querySelector?.("[data-soap-client-new-request]")?.addEventListener("click", () => handlers.onNewRequest?.());

    function setStatus(message, tone) {
      if (!status) return;
      status.textContent = message || "";
      status.dataset.tone = tone || "";
      status.hidden = !message;
    }
    function renderWsdls(documents) {
      if (!wsdlTree) return;
      wsdlTree.textContent = "";
      if (!documents.length) {
        const empty = document.createElement("p");
        empty.className = "soap-client-sidebar-empty";
        empty.textContent = "Import a WSDL to browse SOAP operations.";
        wsdlTree.appendChild(empty);
        return;
      }
      documents.forEach((wsdlDocument) => {
        const details = document.createElement("details");
        details.className = "soap-client-wsdl-node";
        details.open = true;
        const summary = document.createElement("summary");
        summary.textContent = wsdlDocument.name || wsdlDocument.sourceLabel || "WSDL";
        details.appendChild(summary);
        (wsdlDocument.services || []).forEach((service) => {
          const serviceDetails = document.createElement("details");
          serviceDetails.open = true;
          serviceDetails.className = "soap-client-service-node";
          const serviceSummary = document.createElement("summary");
          serviceSummary.textContent = service.name || "Service";
          serviceDetails.appendChild(serviceSummary);
          (service.ports || []).forEach((port) => {
            const portDetails = document.createElement("details");
            portDetails.open = true;
            portDetails.className = "soap-client-port-node";
            const portSummary = document.createElement("summary");
            portSummary.textContent = port.name || "Port";
            portDetails.appendChild(portSummary);
            (port.operations || []).forEach((operation) => {
              const operationButton = createButton(operation.name || "Operation", "bi bi-diagram-3", "soap-client-operation-button");
              operationButton.addEventListener("click", () => handlers.onOpenOperation?.(operation, wsdlDocument));
              portDetails.appendChild(operationButton);
            });
            serviceDetails.appendChild(portDetails);
          });
          details.appendChild(serviceDetails);
        });
        (wsdlDocument.diagnostics || []).forEach((diagnostic) => {
          const message = document.createElement("div");
          message.className = "soap-client-sidebar-diagnostic";
          message.textContent = diagnostic;
          details.appendChild(message);
        });
        wsdlTree.appendChild(details);
      });
    }

    function renderHistory(entries) {
      if (!historyList) return;
      historyList.textContent = "";
      if (!entries.length) {
        const empty = document.createElement("p");
        empty.className = "soap-client-sidebar-empty";
        empty.textContent = "Recent SOAP calls will appear here.";
        historyList.appendChild(empty);
        return;
      }
      entries.forEach((entry) => {
        const item = document.createElement("div");
        item.className = "soap-client-history-entry";
        const title = document.createElement("strong");
        title.textContent = entry.operationName || "SOAP request";
        const meta = document.createElement("span");
        meta.textContent = `${entry.statusCode || "No status"} - ${entry.elapsedMs || 0} ms`;
        item.appendChild(title);
        item.appendChild(meta);
        historyList.appendChild(item);
      });
    }

    return {
      render(state = {}) {
        renderWsdls(Array.isArray(state.wsdls) ? state.wsdls : []);
        renderHistory(Array.isArray(state.history) ? state.history : []);
      },
      setStatus
    };
  }

  const api = { createSoapClientSidebar };
  root.markdownViewerSoapClientSidebar = api;
  if (typeof module !== "undefined" && module.exports) module.exports = api;
})(typeof window !== "undefined" ? window : globalThis);
