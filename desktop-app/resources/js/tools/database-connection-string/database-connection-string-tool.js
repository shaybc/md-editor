// DevToys-style Database Connection String Builder tool UI.
(function(root) {
  "use strict";

  /**
   * Register the Database Connection String Builder tool with MD-Editor.
   * @param {object} app - MD-Editor application service container.
   * @param {object} deps - Tool dependencies supplied by the app shell.
   * @returns {object} Public tool API.
   */
  function registerMarkdownViewerDatabaseConnectionStringTool(app, deps) {
    const codec = deps?.codec || root.registerMarkdownViewerDatabaseConnectionStringCodec?.(app) || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const saveAs = typeof deps?.saveAs === "function" ? deps.saveAs : null;
    const openDatabaseConnectionStringToolInTab = typeof deps?.openDatabaseConnectionStringToolInTab === "function"
      ? deps.openDatabaseConnectionStringToolInTab
      : null;
    const mountedTabs = new Map();

    function createDatabaseOptions() {
      return (codec?.DATABASES || []).map(function(database) {
        return `<option value="${database.id}">${database.label}</option>`;
      }).join("");
    }

    function createDatabaseConnectionStringToolView(tab) {
      const view = document.createElement("div");
      view.className = "database-connection-string-tool-view";
      view.innerHTML = `
        <div class="database-connection-string-tool-workspace">
          <header class="database-connection-string-tool-header">
            <h2><i class="bi bi-database-gear"></i> Database Connection String Builder</h2>
          </header>
          <div class="database-connection-string-tool-layout">
            <section class="database-connection-string-tool-card database-connection-string-tool-inputs" aria-label="Connection inputs">
              <div class="database-connection-string-tool-card-heading">
                <h3>Inputs</h3>
                <button type="button" class="database-connection-string-tool-reset" title="Reset inputs"><i class="bi bi-arrow-counterclockwise"></i> Reset</button>
              </div>
              <label>Database
                <select class="database-connection-string-tool-database">
                  ${createDatabaseOptions()}
                </select>
              </label>
              <label>Host
                <input class="database-connection-string-tool-host" type="text" autocomplete="off">
              </label>
              <label>Port (blank = default)
                <input class="database-connection-string-tool-port" type="number" min="1" max="65535" autocomplete="off">
              </label>
              <label>Username
                <input class="database-connection-string-tool-username" type="text" autocomplete="off">
              </label>
              <label>Password
                <input class="database-connection-string-tool-password" type="password" autocomplete="off">
              </label>
              <label>Database name
                <input class="database-connection-string-tool-name" type="text" autocomplete="off">
              </label>
            </section>
            <section class="database-connection-string-tool-card database-connection-string-tool-result-panel" aria-label="Connection string result">
              <div class="database-connection-string-tool-card-heading">
                <span>Result</span>
                <div class="database-connection-string-tool-actions">
                  <button type="button" class="database-connection-string-tool-copy" title="Copy connection string"><i class="bi bi-copy"></i></button>
                  <button type="button" class="database-connection-string-tool-download" title="Download connection string"><i class="bi bi-download"></i></button>
                </div>
              </div>
              <textarea class="database-connection-string-tool-result" spellcheck="false" readonly></textarea>
              <div class="database-connection-string-tool-details" aria-label="Connection details"></div>
              <p class="database-connection-string-tool-status" aria-live="polite"></p>
            </section>
          </div>
        </div>
      `;

      const controls = {
        database: view.querySelector(".database-connection-string-tool-database"),
        host: view.querySelector(".database-connection-string-tool-host"),
        port: view.querySelector(".database-connection-string-tool-port"),
        username: view.querySelector(".database-connection-string-tool-username"),
        password: view.querySelector(".database-connection-string-tool-password"),
        databaseName: view.querySelector(".database-connection-string-tool-name"),
        reset: view.querySelector(".database-connection-string-tool-reset"),
        result: view.querySelector(".database-connection-string-tool-result"),
        details: view.querySelector(".database-connection-string-tool-details"),
        copy: view.querySelector(".database-connection-string-tool-copy"),
        download: view.querySelector(".database-connection-string-tool-download"),
        status: view.querySelector(".database-connection-string-tool-status")
      };

      function setStatus(message, type) {
        controls.status.textContent = message || "";
        if (type) controls.status.dataset.statusType = type;
        else delete controls.status.dataset.statusType;
      }

      function getParts() {
        return {
          database: controls.database.value,
          host: controls.host.value,
          port: controls.port.value,
          username: controls.username.value,
          password: controls.password.value,
          databaseName: controls.databaseName.value
        };
      }

      function renderDetails(details) {
        controls.details.textContent = "";
        [
          ["Scheme", details.scheme],
          ["Host", details.host],
          ["Port", details.port],
          ["Database", details.databaseName || "-"]
        ].forEach(function(item) {
          const card = document.createElement("div");
          const label = document.createElement("span");
          const value = document.createElement("strong");
          label.textContent = item[0];
          value.textContent = item[1];
          card.append(label, value);
          controls.details.appendChild(card);
        });
      }

      function renderConnectionString() {
        try {
          const result = codec?.buildConnectionString?.(getParts()) || { connectionString: "", details: {} };
          controls.result.value = result.connectionString;
          renderDetails(result.details || {});
          setStatus("", "");
        } catch (error) {
          controls.result.value = "";
          controls.details.textContent = "";
          setStatus(error?.message || "Unable to build connection string.", "error");
        }
      }

      function applyDefaults(databaseId) {
        const defaults = codec?.getDefaultConnectionParts?.(databaseId) || {};
        controls.database.value = defaults.database || "postgresql";
        controls.host.value = defaults.host || "localhost";
        controls.port.value = defaults.port || "";
        controls.username.value = defaults.username || "";
        controls.password.value = defaults.password || "";
        controls.databaseName.value = defaults.databaseName || "";
        renderConnectionString();
      }

      controls.database.addEventListener("change", function() {
        const defaults = codec?.getDefaultConnectionParts?.(controls.database.value) || {};
        controls.port.value = defaults.port || "";
        if (!controls.databaseName.value || controls.databaseName.value === "mydb" || controls.databaseName.value === "0") {
          controls.databaseName.value = defaults.databaseName || "";
        }
        renderConnectionString();
      });
      [controls.host, controls.port, controls.username, controls.password, controls.databaseName].forEach(function(control) {
        control.addEventListener("input", renderConnectionString);
      });
      controls.reset.addEventListener("click", function() {
        applyDefaults(controls.database.value);
        controls.host.focus();
      });
      controls.copy.addEventListener("click", async function() {
        try {
          if (copyTextToClipboard) await copyTextToClipboard(controls.result.value);
          else await navigator.clipboard.writeText(controls.result.value);
          setStatus("Copied connection string.", "success");
        } catch (error) {
          setStatus("Unable to copy connection string.", "error");
        }
      });
      controls.download.addEventListener("click", function() {
        if (saveAs) {
          saveAs(new Blob([controls.result.value], { type: "text/plain;charset=utf-8" }), "connection-string.txt");
          setStatus("Downloaded connection string.", "success");
        }
      });

      applyDefaults("postgresql");
      mountedTabs.set(tab.id, { view });
      return view;
    }

    function mountDatabaseConnectionStringToolTab(tab, rootElement) {
      if (!tab?.id || !rootElement) return null;
      let record = mountedTabs.get(tab.id);
      if (!record || !record.view?.isConnected) {
        rootElement.textContent = "";
        const view = createDatabaseConnectionStringToolView(tab);
        rootElement.appendChild(view);
        record = mountedTabs.get(tab.id);
      } else if (record.view.parentElement !== rootElement) {
        rootElement.textContent = "";
        rootElement.appendChild(record.view);
      }
      return record.view;
    }

    function destroyDatabaseConnectionStringToolTab(tabId) {
      const record = mountedTabs.get(tabId);
      record?.view?.remove?.();
      mountedTabs.delete(tabId);
    }

    function openDatabaseConnectionStringTool() {
      return openDatabaseConnectionStringToolInTab?.() || null;
    }

    document.querySelectorAll(".open-database-connection-string-tool").forEach(function(button) {
      button.addEventListener("click", openDatabaseConnectionStringTool);
    });

    const api = {
      mountDatabaseConnectionStringToolTab,
      destroyDatabaseConnectionStringToolTab,
      openDatabaseConnectionStringTool
    };
    app?.registerModule?.("databaseConnectionStringTool", api);
    return api;
  }

  root.registerMarkdownViewerDatabaseConnectionStringTool = registerMarkdownViewerDatabaseConnectionStringTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerDatabaseConnectionStringTool };
  }
})(typeof window !== "undefined" ? window : globalThis);
