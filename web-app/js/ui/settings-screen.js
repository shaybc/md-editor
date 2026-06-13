(function(window) {
  "use strict";

  function createMarkdownViewerSettingsScreen(options = {}) {
    const modal = options.modal || document.getElementById("settings-modal");
    const defaultTab = options.defaultTab || "graph";
    const searchInput = modal?.querySelector("#settings-search-input") || null;
    const tabButtons = Array.from(modal?.querySelectorAll(".settings-tab-button[data-settings-tab]") || []);
    const panels = Array.from(modal?.querySelectorAll(".settings-panel[data-settings-panel]") || []);
    let activeTab = defaultTab;

    function getPanelByTab(tabName) {
      return panels.find((panel) => panel.dataset.settingsPanel === tabName) || null;
    }

    function selectTab(tabName, options = {}) {
      const panel = getPanelByTab(tabName) || getPanelByTab(defaultTab);
      if (!panel) return;
      activeTab = panel.dataset.settingsPanel || defaultTab;
      tabButtons.forEach((button) => {
        const isActive = button.dataset.settingsTab === activeTab;
        button.classList.toggle("active", isActive);
        button.setAttribute("aria-selected", isActive ? "true" : "false");
        button.setAttribute("tabindex", isActive ? "0" : "-1");
      });
      panels.forEach((settingsPanel) => {
        const isActive = settingsPanel === panel;
        settingsPanel.hidden = !isActive;
        settingsPanel.classList.toggle("active", isActive);
      });
      if (options.focusPanel) {
        panel.setAttribute("tabindex", "-1");
        panel.focus({ preventScroll: true });
      }
    }

    function getSearchText(panel) {
      const tabName = panel.dataset.settingsPanel || "";
      const button = tabButtons.find((tabButton) => tabButton.dataset.settingsTab === tabName);
      return `${button?.textContent || ""} ${panel.textContent || ""}`.toLowerCase();
    }

    function searchSettings() {
      const query = (searchInput?.value || "").trim().toLowerCase();
      if (!query) return;
      const matchingTabButton = tabButtons.find((button) => (button.textContent || "").toLowerCase().includes(query));
      const match = matchingTabButton
        ? getPanelByTab(matchingTabButton.dataset.settingsTab || defaultTab)
        : panels.find((panel) => getSearchText(panel).includes(query));
      if (match) selectTab(match.dataset.settingsPanel || defaultTab);
    }

    function open() {
      if (searchInput) searchInput.value = "";
      selectTab(defaultTab);
      window.requestAnimationFrame(() => {
        searchInput?.focus();
      });
    }

    tabButtons.forEach((button) => {
      button.addEventListener("click", () => {
        selectTab(button.dataset.settingsTab || defaultTab, { focusPanel: true });
      });
    });

    searchInput?.addEventListener("input", searchSettings);

    return {
      open,
      selectTab,
      getActiveTab: () => activeTab
    };
  }

  window.createMarkdownViewerSettingsScreen = createMarkdownViewerSettingsScreen;
})(window);
