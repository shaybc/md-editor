(function(global) {
  "use strict";

  // License summary presentation: one fixed informational card per eligible editor tab.
  function registerMarkdownViewerLicenseSummaryHeader(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const catalog = deps.catalog;
    const views = new Map();

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function createIcon(iconName, className) {
      const icon = createElement("i", `bi ${iconName}${className ? ` ${className}` : ""}`);
      icon.setAttribute("aria-hidden", "true");
      return icon;
    }

    function appendCategory(cardBody, title, items, iconName, iconClass) {
      const section = createElement("section", "license-summary-category");
      section.appendChild(createElement("h4", "", title));
      const list = createElement("ul");
      const visibleItems = items?.length ? items : ["None"];
      visibleItems.forEach(function(item) {
        const listItem = createElement("li");
        listItem.append(createIcon(iconName, iconClass), createElement("span", "", item));
        list.appendChild(listItem);
      });
      section.appendChild(list);
      cardBody.appendChild(section);
    }

    function renderMatch(view, match) {
      view.host.replaceChildren();
      view.host.hidden = !match;
      view.editorPane.classList.toggle("license-summary-visible", !!match);
      if (!match) return;

      const card = createElement("aside", "license-summary-card");
      card.setAttribute("aria-label", `${match.name} summary`);
      const body = createElement("div", "license-summary-body");
      const overview = createElement("section", "license-summary-overview");
      const titleRow = createElement("div", "license-summary-title");
      titleRow.append(createIcon("bi-scales"), createElement("h3", "", match.name));
      overview.append(titleRow, createElement("p", "", match.description));
      body.appendChild(overview);
      appendCategory(body, "Permissions", match.permissions, "bi-check-lg", "license-summary-permission");
      appendCategory(body, "Limitations", match.limitations, "bi-x-lg", "license-summary-limitation");
      appendCategory(body, "Conditions", match.conditions, "bi-info-circle", "license-summary-condition");
      const footer = createElement("div", "license-summary-footer", "This is not legal advice.");
      card.append(body, footer);
      view.host.appendChild(card);
    }

    /**
     * Re-evaluate one mounted tab using its current path and editor content.
     * @param {string} tabId - Mounted editor tab identifier.
     * @returns {Promise<object|null>} Current exact license match.
     */
    async function refresh(tabId) {
      const view = views.get(tabId);
      if (!view) return null;
      const revision = ++view.revision;
      const path = view.getPath?.() || "";
      if (!catalog?.isCandidateFileName?.(path)) {
        renderMatch(view, null);
        return null;
      }
      const match = await catalog.match(path, view.textarea?.value || "");
      if (views.get(tabId) !== view || view.revision !== revision) return null;
      renderMatch(view, match);
      return match;
    }

    /**
     * Mount license presentation state above one source editor.
     * @param {object} options - Tab identity, path accessor, and editor DOM elements.
     * @returns {HTMLElement|null} Header host inserted above the source editor.
     */
    function mount(options) {
      if (!options?.tabId || !options.editorPane || !options.editorShell || !options.textarea) return null;
      destroy(options.tabId);
      const host = createElement("div", "license-summary-host");
      host.hidden = true;
      options.editorPane.classList.add("license-summary-capable");
      options.editorPane.insertBefore(host, options.editorShell);
      const view = {
        tabId: options.tabId,
        getPath: options.getPath || function() { return ""; },
        editorPane: options.editorPane,
        editorShell: options.editorShell,
        textarea: options.textarea,
        host,
        revision: 0,
        onInput: null
      };
      view.onInput = function() { void refresh(view.tabId); };
      options.textarea.addEventListener("input", view.onInput);
      views.set(view.tabId, view);
      void refresh(view.tabId);
      return host;
    }

    /**
     * Remove the listener and DOM state owned by one editor tab.
     * @param {string} tabId - Mounted editor tab identifier.
     */
    function destroy(tabId) {
      const view = views.get(tabId);
      if (!view) return;
      view.revision += 1;
      view.textarea?.removeEventListener?.("input", view.onInput);
      view.host?.remove?.();
      view.editorPane?.classList?.remove?.("license-summary-capable", "license-summary-visible");
      views.delete(tabId);
    }

    const api = {
      mount,
      refresh,
      destroy,
      getMountedTabCount: function() { return views.size; }
    };
    app?.registerModule?.("licenseSummaryHeader", api);
    return api;
  }

  global.registerMarkdownViewerLicenseSummaryHeader = registerMarkdownViewerLicenseSummaryHeader;
})(typeof window !== "undefined" ? window : globalThis);
