/** Owns the searchable language override submenu used by editor tabs. */
(function(global) {
  "use strict";
  /**
   * Create the searchable Parse as submenu.
   * @param {object} options Language registry and selection callback.
   * @returns {{element: HTMLElement, update: Function, focusFilter: Function}} Submenu controls.
   */
  function createMarkdownViewerTabParseAsMenu(options) {
    const languages = Array.isArray(options.languageRegistry?.languages) ? options.languageRegistry.languages : [];
    const onSelect = typeof options.onSelect === "function" ? options.onSelect : function() {};
    const root = document.createElement("div");
    root.className = "graph-context-menu-submenu tab-parse-as-submenu";
    root.innerHTML =
      '<button class="graph-context-menu-item tab-parse-as-trigger" type="button" role="menuitem" aria-haspopup="menu" aria-expanded="false"><i class="bi bi-code-slash" aria-hidden="true"></i><span class="graph-context-menu-item-label">Parse as</span><i class="bi bi-chevron-right graph-context-menu-submenu-arrow" aria-hidden="true"></i></button>' +
      '<div class="graph-context-menu-submenu-panel tab-parse-as-panel" role="menu" aria-label="Parse as language"><div class="tab-parse-as-filter-wrap"><i class="bi bi-search" aria-hidden="true"></i><input class="tab-parse-as-filter" type="search" placeholder="Filter languages..." autocomplete="off" aria-label="Filter parse languages"></div><div class="tab-parse-as-languages"></div><div class="tab-parse-as-empty hidden" role="status">No languages found</div></div>';
    const trigger = root.querySelector(".tab-parse-as-trigger");
    const panel = root.querySelector(".tab-parse-as-panel");
    const filter = root.querySelector(".tab-parse-as-filter");
    const list = root.querySelector(".tab-parse-as-languages");
    const empty = root.querySelector(".tab-parse-as-empty");
    let selectedLanguageId = null;

    function createChoice(language) {
      const button = document.createElement("button");
      button.className = "graph-context-menu-item tab-parse-as-choice";
      button.type = "button";
      button.setAttribute("role", "menuitemradio");
      button.dataset.languageId = language?.id || "";
      button.dataset.searchText = [language?.label, language?.id].concat(language?.extensions || []).filter(Boolean).join(" ").toLowerCase();
      const check = document.createElement("i");
      check.className = "bi bi-check-lg tab-parse-as-check";
      check.setAttribute("aria-hidden", "true");
      const label = document.createElement("span");
      label.className = "graph-context-menu-item-label";
      label.textContent = language?.label || "Automatic (file extension)";
      button.append(check, label);
      return button;
    }

    list.appendChild(createChoice(null));
    languages.forEach(function(language) { list.appendChild(createChoice(language)); });
    function updateCheckedChoice() {
      list.querySelectorAll(".tab-parse-as-choice").forEach(function(button) {
        const isSelected = (button.dataset.languageId || null) === selectedLanguageId;
        button.setAttribute("aria-checked", isSelected ? "true" : "false");
      });
    }

    function applyFilter() {
      const query = filter.value.trim().toLowerCase();
      let matchingLanguageCount = 0;
      list.querySelectorAll(".tab-parse-as-choice").forEach(function(button) {
        const isAutomatic = !button.dataset.languageId;
        const isVisible = !query || isAutomatic || button.dataset.searchText.includes(query);
        button.classList.toggle("hidden", !isVisible);
        if (isVisible && !isAutomatic) matchingLanguageCount += 1;
      });
      empty.classList.toggle("hidden", matchingLanguageCount > 0 || !query);
    }

    function update(languageId, enabled) {
      selectedLanguageId = languages.some(function(language) { return language.id === languageId; }) ? languageId : null;
      root.classList.toggle("hidden", !enabled);
      trigger.disabled = !enabled;
      trigger.setAttribute("aria-disabled", enabled ? "false" : "true");
      filter.value = "";
      applyFilter();
      updateCheckedChoice();
    }

    function positionPanel() {
      const bounds = root.getBoundingClientRect();
      root.classList.toggle("open-left", bounds.right + 280 > window.innerWidth);
      root.classList.toggle("open-up", bounds.top + 390 > window.innerHeight);
    }

    root.addEventListener("mouseenter", function() {
      positionPanel();
      trigger.setAttribute("aria-expanded", "true");
    });
    root.addEventListener("mouseleave", function() { trigger.setAttribute("aria-expanded", "false"); });
    trigger.addEventListener("focus", function() {
      positionPanel();
      trigger.setAttribute("aria-expanded", "true");
    });
    trigger.addEventListener("click", function(event) {
      event.stopPropagation();
      filter.focus();
    });
    filter.addEventListener("input", applyFilter);
    filter.addEventListener("click", function(event) { event.stopPropagation(); });
    filter.addEventListener("keydown", function(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        return;
      }
      event.stopPropagation();
    });
    panel.addEventListener("click", function(event) {
      const choice = event.target.closest(".tab-parse-as-choice");
      if (!choice) return;
      event.stopPropagation();
      onSelect(choice.dataset.languageId || null);
    });

    return {
      element: root,
      update,
      focusFilter: function() { filter.focus(); }
    };
  }
  global.createMarkdownViewerTabParseAsMenu = createMarkdownViewerTabParseAsMenu;
})(window);
