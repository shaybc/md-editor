(function(root) {
  "use strict";

  function registerMarkdownViewerUuidTool(app, deps) {
    const codec = deps?.codec || app?.modules?.uuidCodec || null;
    const copyTextToClipboard = typeof deps?.copyTextToClipboard === "function" ? deps.copyTextToClipboard : null;
    const openUuidToolInTab = typeof deps?.openUuidToolInTab === "function" ? deps.openUuidToolInTab : null;
    const mountedTabs = new Map();

    function createSwitch(label, checked) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = "uuid-tool-switch";
      button.setAttribute("role", "switch");
      button.setAttribute("aria-checked", checked ? "true" : "false");
      button.textContent = `${label}: ${checked ? "On" : "Off"}`;
      return button;
    }

    function createSettingRow(iconClass, title, description, control) {
      const row = document.createElement("div");
      row.className = "uuid-tool-setting-row";
      const icon = document.createElement("i");
      icon.className = `${iconClass} uuid-tool-setting-icon`;
      const copy = document.createElement("div");
      copy.className = "uuid-tool-setting-copy";
      const titleNode = document.createElement("strong");
      titleNode.textContent = title;
      copy.appendChild(titleNode);
      if (description) {
        const descriptionNode = document.createElement("span");
        descriptionNode.textContent = description;
        copy.appendChild(descriptionNode);
      }
      row.append(icon, copy, control);
      return row;
    }

    function createShell() {
      const view = document.createElement("div");
      view.className = "uuid-tool-view";
      view.innerHTML = `
        <div class="uuid-tool-workspace">
          <header class="uuid-tool-header">
            <h2><i class="bi bi-hash"></i> UUID Generator</h2>
          </header>
          <section class="uuid-tool-config" aria-label="UUID configuration"></section>
          <section class="uuid-tool-output-panel">
            <div class="uuid-tool-panel-heading">
              <span>UUID(s)</span>
              <div class="uuid-tool-actions">
                <button type="button" class="tool-button uuid-tool-refresh" title="Refresh UUIDs"><i class="bi bi-arrow-clockwise"></i> Refresh</button>
                <button type="button" class="tool-button uuid-tool-copy" title="Copy UUIDs"><i class="bi bi-copy"></i> Copy</button>
              </div>
            </div>
            <textarea class="uuid-tool-output" spellcheck="false" readonly></textarea>
            <p class="uuid-tool-status" aria-live="polite"></p>
          </section>
        </div>
      `;

      const config = view.querySelector(".uuid-tool-config");
      const hyphens = createSwitch("Hyphens", true);
      const uppercase = createSwitch("Uppercase", false);

      const version = document.createElement("select");
      version.className = "uuid-tool-select";
      [
        ["4", "4 (GUID)"],
        ["1", "1"],
        ["7", "7"]
      ].forEach(function(optionSpec) {
        const option = document.createElement("option");
        option.value = optionSpec[0];
        option.textContent = optionSpec[1];
        version.appendChild(option);
      });
      version.value = "4";

      const count = document.createElement("input");
      count.className = "uuid-tool-number";
      count.type = "number";
      count.min = "1";
      count.max = "1000";
      count.step = "1";
      count.value = "1";

      config.append(
        createSettingRow("bi bi-dash-lg", "Hyphens", "", hyphens),
        createSettingRow("bi bi-type", "Uppercase", "", uppercase),
        createSettingRow("bi bi-sliders", "UUID version", "Generate UUIDs version 1, 4 (GUID) and 7", version),
        createSettingRow("bi bi-hash", "UUID Generation Count", "Number of UUIDs to generate", count)
      );

      return view;
    }

    function getElements(view) {
      return {
        hyphens: view.querySelector(".uuid-tool-setting-row:nth-child(1) .uuid-tool-switch"),
        uppercase: view.querySelector(".uuid-tool-setting-row:nth-child(2) .uuid-tool-switch"),
        version: view.querySelector(".uuid-tool-select"),
        count: view.querySelector(".uuid-tool-number"),
        output: view.querySelector(".uuid-tool-output"),
        refresh: view.querySelector(".uuid-tool-refresh"),
        copy: view.querySelector(".uuid-tool-copy"),
        status: view.querySelector(".uuid-tool-status")
      };
    }

    function isSwitchOn(button) {
      return button?.getAttribute("aria-checked") === "true";
    }

    function setSwitch(button, checked) {
      button.setAttribute("aria-checked", checked ? "true" : "false");
      const label = button.textContent.split(":")[0];
      button.textContent = `${label}: ${checked ? "On" : "Off"}`;
    }

    function getGenerationOptions(elements) {
      return {
        hyphens: isSwitchOn(elements.hyphens),
        uppercase: isSwitchOn(elements.uppercase),
        version: elements.version.value,
        count: elements.count.value
      };
    }

    function generate(elements) {
      if (!codec?.generateUuids) {
        elements.status.textContent = "UUID generator is unavailable.";
        elements.status.dataset.statusType = "error";
        return;
      }
      const values = codec.generateUuids(getGenerationOptions(elements));
      elements.count.value = String(codec.normalizeCount?.(elements.count.value) || values.length || 1);
      elements.output.value = values.join("\n");
      elements.status.textContent = `${values.length} UUID${values.length === 1 ? "" : "s"} generated.`;
      elements.status.dataset.statusType = "success";
    }

    function bindEvents(elements) {
      const regenerate = function() {
        generate(elements);
      };
      [elements.version, elements.count].forEach(function(control) {
        control.addEventListener("change", regenerate);
        control.addEventListener("input", regenerate);
      });
      [elements.hyphens, elements.uppercase].forEach(function(button) {
        button.addEventListener("click", function() {
          setSwitch(button, !isSwitchOn(button));
          regenerate();
        });
      });
      elements.refresh.addEventListener("click", regenerate);
      elements.copy.addEventListener("click", async function() {
        const text = elements.output.value;
        if (!text) return;
        if (copyTextToClipboard) {
          await copyTextToClipboard(text);
        } else {
          await navigator.clipboard?.writeText?.(text);
        }
        elements.status.textContent = "Copied UUIDs.";
        elements.status.dataset.statusType = "success";
      });
    }

    function mountUuidToolTab(tab, host) {
      if (!tab?.id || !host) return null;
      let view = mountedTabs.get(tab.id);
      if (!view || !view.isConnected) {
        view = createShell();
        const elements = getElements(view);
        bindEvents(elements);
        mountedTabs.set(tab.id, view);
        generate(elements);
      }
      if (view.parentElement !== host) {
        host.textContent = "";
        host.appendChild(view);
      }
      return view;
    }

    function destroyUuidToolTab(tabId) {
      const view = mountedTabs.get(tabId);
      if (view) view.remove();
      mountedTabs.delete(tabId);
    }

    function openUuidTool() {
      return openUuidToolInTab?.() || null;
    }

    document.querySelectorAll(".open-uuid-tool").forEach(function(button) {
      button.addEventListener("click", openUuidTool);
    });

    const api = {
      mountUuidToolTab,
      destroyUuidToolTab,
      openUuidTool
    };
    app?.registerModule?.("uuidTool", api);
    return api;
  }

  root.registerMarkdownViewerUuidTool = registerMarkdownViewerUuidTool;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      registerMarkdownViewerUuidTool
    };
  }
})(typeof window !== "undefined" ? window : globalThis);
