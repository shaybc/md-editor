(function(global) {
  "use strict";

  function createElement(documentRef, tagName, className, text) {
    const element = documentRef.createElement(tagName);
    if (className) element.className = className;
    if (text !== undefined) element.textContent = text;
    return element;
  }

  function groupComponents(components) {
    const groups = new Map();
    components.forEach((component) => {
      if (!groups.has(component.category)) groups.set(component.category, []);
      groups.get(component.category).push(component);
    });
    return groups;
  }

  /** Register the Help > Open Source component and licensing dialog. */
  function registerMarkdownViewerOpenSourceDialog(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const catalog = deps.catalog || global.MarkdownViewerOpenSourceCatalog;
    const openExternalUrl = deps.openExternalUrl;
    if (!documentRef || !catalog?.getOpenSourceComponents) return null;

    let modal = null;
    let lastInvoker = null;

    function close() {
      if (!modal) return;
      modal.style.display = "none";
      lastInvoker?.focus?.();
      lastInvoker = null;
    }

    function buildComponentRow(component) {
      const row = createElement(documentRef, "article", "open-source-component");
      const summary = createElement(documentRef, "div", "open-source-component-summary");
      summary.append(
        createElement(documentRef, "h4", "open-source-component-name", component.name),
        createElement(documentRef, "p", "open-source-component-purpose", component.purpose)
      );
      const license = createElement(documentRef, "span", "open-source-license", component.license);
      license.setAttribute("aria-label", `License: ${component.license}`);
      const projectButton = createElement(documentRef, "button", "open-source-project-link", "Project");
      projectButton.type = "button";
      projectButton.dataset.openSourceUrl = component.url;
      projectButton.title = `Open ${component.name} project page`;
      const icon = createElement(documentRef, "i", "bi bi-box-arrow-up-right");
      icon.setAttribute("aria-hidden", "true");
      projectButton.prepend(icon);
      row.append(summary, license, projectButton);
      return row;
    }

    function ensureModal() {
      if (modal) return modal;
      const components = catalog.getOpenSourceComponents();
      modal = createElement(documentRef, "div", "reset-modal-overlay open-source-modal");
      modal.id = "open-source-modal";
      modal.setAttribute("role", "dialog");
      modal.setAttribute("aria-modal", "true");
      modal.setAttribute("aria-labelledby", "open-source-modal-title");
      modal.style.display = "none";

      const box = createElement(documentRef, "section", "reset-modal-box open-source-modal-box");
      const header = createElement(documentRef, "header", "open-source-modal-header");
      const heading = createElement(documentRef, "div", "open-source-modal-heading");
      const title = createElement(documentRef, "h2", "open-source-modal-title", "Open Source");
      title.id = "open-source-modal-title";
      heading.append(
        title,
        createElement(documentRef, "p", "open-source-modal-subtitle", `${components.length} direct and bundled open-source components used by MD-Editor.`)
      );
      const headerClose = createElement(documentRef, "button", "open-source-modal-close", "×");
      headerClose.type = "button";
      headerClose.title = "Close";
      headerClose.setAttribute("aria-label", "Close Open Source dialog");
      headerClose.addEventListener("click", close);
      header.append(heading, headerClose);

      const content = createElement(documentRef, "div", "open-source-modal-content");
      content.appendChild(createElement(
        documentRef,
        "p",
        "open-source-modal-intro",
        "License identifiers summarize each top-level component. Follow a project link for its complete license text, copyright notices, and bundled dependency notices."
      ));
      groupComponents(components).forEach((entries, category) => {
        const section = createElement(documentRef, "section", "open-source-category");
        section.appendChild(createElement(documentRef, "h3", "open-source-category-title", category));
        const list = createElement(documentRef, "div", "open-source-component-list");
        entries.forEach((component) => list.appendChild(buildComponentRow(component)));
        section.appendChild(list);
        content.appendChild(section);
      });

      const actions = createElement(documentRef, "div", "reset-modal-actions open-source-modal-actions");
      const closeButton = createElement(documentRef, "button", "reset-modal-btn", "Close");
      closeButton.type = "button";
      closeButton.addEventListener("click", close);
      actions.appendChild(closeButton);
      box.append(header, content, actions);
      modal.appendChild(box);
      modal.addEventListener("click", (event) => {
        const linkButton = event.target.closest?.("[data-open-source-url]");
        if (linkButton) {
          openExternalUrl?.(linkButton.dataset.openSourceUrl);
          return;
        }
        if (event.target === modal) close();
      });
      documentRef.body.appendChild(modal);
      return modal;
    }

    function open(options = {}) {
      lastInvoker = options.invoker || documentRef.activeElement;
      const dialog = ensureModal();
      dialog.style.display = "flex";
      dialog.querySelector(".open-source-modal-close")?.focus();
    }

    documentRef.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && modal?.style.display !== "none") close();
    });

    const api = { open, close };
    app?.registerModule?.("openSourceDialog", api);
    return api;
  }

  global.registerMarkdownViewerOpenSourceDialog = registerMarkdownViewerOpenSourceDialog;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { groupComponents, registerMarkdownViewerOpenSourceDialog };
  }
})(typeof window !== "undefined" ? window : globalThis);
