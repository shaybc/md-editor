(function(global) {
  "use strict";

  /**
   * Owns reusable app notification and confirmation modals.
   * @param {object} app - Shared MD-Editor application object.
   * @param {object} deps - Optional browser/document overrides.
   * @returns {object} Notification modal API.
   */
  function registerMarkdownViewerNotificationModal(app, deps = {}) {
    const documentRef = deps.document || global.document;
    const nativeAlert = deps.nativeAlert || null;
    const getComputedStyleRef = deps.getComputedStyle || global.getComputedStyle;
    const defaultModalStackLevel = 2000;
    const queue = [];
    let activeRequest = null;
    let activeResolver = null;
    let previousFocus = null;

    function createElement(tagName, className, text) {
      const element = documentRef.createElement(tagName);
      if (className) element.className = className;
      if (text !== undefined) element.textContent = text;
      return element;
    }

    function ensureModal() {
      if (!documentRef?.body) return null;
      let modal = documentRef.getElementById("app-notification-modal");
      if (!modal) {
        modal = createElement("div", "reset-modal-overlay app-notification-modal");
        modal.id = "app-notification-modal";
        modal.setAttribute("role", "dialog");
        modal.setAttribute("aria-modal", "true");
        modal.setAttribute("aria-labelledby", "app-notification-title");
        modal.setAttribute("aria-describedby", "app-notification-message");
        modal.setAttribute("aria-hidden", "true");
        modal.style.display = "none";

        const box = createElement("div", "reset-modal-box app-notification-box");
        const title = createElement("p", "reset-modal-message app-notification-title");
        title.id = "app-notification-title";
        const message = createElement("div", "app-notification-message");
        message.id = "app-notification-message";
        const body = createElement("div", "app-notification-body");
        body.id = "app-notification-body";
        const actions = createElement("div", "reset-modal-actions app-notification-actions");
        actions.id = "app-notification-actions";

        box.append(title, message, body, actions);
        modal.appendChild(box);
        documentRef.body.appendChild(modal);
      }
      return modal;
    }

    function getModalParts(modal) {
      return {
        box: modal.querySelector(".app-notification-box"),
        title: modal.querySelector("#app-notification-title"),
        message: modal.querySelector("#app-notification-message"),
        body: modal.querySelector("#app-notification-body"),
        actions: modal.querySelector("#app-notification-actions")
      };
    }

    function getElementStyle(element) {
      if (typeof getComputedStyleRef === "function") {
        try {
          return getComputedStyleRef.call(global, element);
        } catch (_) {}
      }
      return element?.style || {};
    }

    function isVisibleModal(element) {
      if (!element || element.hidden || element.getAttribute?.("aria-hidden") === "true") return false;
      const style = getElementStyle(element);
      return style.display !== "none" && style.visibility !== "hidden";
    }

    function getModalStackLevel(element) {
      const stackLevel = Number.parseInt(getElementStyle(element).zIndex, 10);
      return Number.isFinite(stackLevel) ? stackLevel : null;
    }

    function bringNotificationToFront(modal) {
      const modalElements = [
        ...Array.from(documentRef.querySelectorAll?.(".reset-modal-overlay") || []),
        ...Array.from(documentRef.querySelectorAll?.('[role="dialog"]') || [])
      ];
      let highestStackLevel = getModalStackLevel(modal) ?? defaultModalStackLevel;
      new Set(modalElements).forEach((element) => {
        if (element === modal || !isVisibleModal(element)) return;
        const stackLevel = getModalStackLevel(element);
        if (stackLevel !== null) highestStackLevel = Math.max(highestStackLevel, stackLevel);
      });
      modal.style.zIndex = String(highestStackLevel + 1);
    }

    function normalizeButton(button, index) {
      if (typeof button === "string") {
        return { id: button.toLowerCase(), label: button };
      }
      const normalized = button || {};
      return {
        id: normalized.id || `button-${index + 1}`,
        label: normalized.label || "OK",
        value: Object.prototype.hasOwnProperty.call(normalized, "value") ? normalized.value : undefined,
        variant: normalized.variant || "",
        autoFocus: normalized.autoFocus === true,
        closeOnClick: normalized.closeOnClick !== false,
        action: normalized.action
      };
    }

    function normalizeOptions(options) {
      const source = typeof options === "string" ? { message: options } : (options || {});
      const buttons = Array.isArray(source.buttons) && source.buttons.length
        ? source.buttons.map(normalizeButton)
        : [normalizeButton({ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }, 0)];
      return {
        title: source.title || "MD-Editor",
        message: source.message || "",
        dedupeKey: String(source.dedupeKey || "").trim(),
        buttons,
        dialogClassName: String(source.dialogClassName || "").trim(),
        dismissible: source.dismissible !== false,
        dismissValue: Object.prototype.hasOwnProperty.call(source, "dismissValue") ? source.dismissValue : null,
        renderBody: source.renderBody,
        focusSelector: source.focusSelector || null
      };
    }

    function setMessageContent(element, message) {
      if (!element) return;
      element.replaceChildren();
      String(message || "").split(/\n/).forEach((line, index) => {
        if (index > 0) element.appendChild(documentRef.createElement("br"));
        element.appendChild(documentRef.createTextNode(line));
      });
    }

    function closeActiveModal(value) {
      const modal = ensureModal();
      if (modal) {
        modal.style.display = "none";
        modal.style.zIndex = "";
        modal.setAttribute("aria-hidden", "true");
      }
      const resolver = activeResolver;
      activeRequest = null;
      activeResolver = null;
      if (previousFocus?.focus) {
        try {
          previousFocus.focus({ preventScroll: true });
        } catch (_) {
          previousFocus.focus();
        }
      }
      previousFocus = null;
      if (resolver) resolver(value);
      openNextQueuedModal();
    }

    function createButtonElement(button) {
      const element = createElement("button", "reset-modal-btn app-notification-button", button.label);
      element.type = "button";
      element.dataset.notificationButtonId = button.id;
      if (button.variant === "primary") element.classList.add("settings-primary-action");
      if (button.variant === "danger") element.classList.add("reset-modal-confirm");
      if (button.variant === "cancel" || button.variant === "secondary") element.classList.add("reset-modal-cancel");
      element.addEventListener("click", async (event) => {
        let value = Object.prototype.hasOwnProperty.call(button, "value") ? button.value : button.id;
        if (typeof button.action === "function") {
          const actionResult = await button.action(event);
          if (actionResult !== undefined) value = actionResult;
        }
        if (button.closeOnClick) closeActiveModal(value);
      });
      return element;
    }

    function renderActiveModal(options, resolve) {
      const modal = ensureModal();
      if (!modal) {
        if (nativeAlert && options.message) nativeAlert(String(options.message));
        resolve(options.dismissValue);
        return;
      }

      activeRequest = options;
      activeResolver = resolve;
      previousFocus = documentRef.activeElement;

      const parts = getModalParts(modal);
      if (parts.box) parts.box.className = ["reset-modal-box", "app-notification-box", options.dialogClassName].filter(Boolean).join(" ");
      if (parts.title) parts.title.textContent = options.title;
      setMessageContent(parts.message, options.message);
      if (parts.body) {
        parts.body.replaceChildren();
        parts.body.hidden = typeof options.renderBody !== "function";
        if (typeof options.renderBody === "function") {
          const bodyResult = options.renderBody(parts.body);
          if (typeof bodyResult === "string") parts.body.textContent = bodyResult;
          else if (global.Node && bodyResult instanceof global.Node) parts.body.appendChild(bodyResult);
        }
      }
      if (parts.actions) {
        parts.actions.replaceChildren();
        options.buttons.forEach((button) => {
          parts.actions.appendChild(createButtonElement(button));
        });
      }

      modal.style.display = "flex";
      bringNotificationToFront(modal);
      modal.setAttribute("aria-hidden", "false");
      const configuredFocusTarget = options.focusSelector
        ? modal.querySelector(options.focusSelector)
        : null;
      const focusTarget = configuredFocusTarget
        || modal.querySelector("[data-notification-button-id].settings-primary-action")
        || modal.querySelector("[data-notification-button-id]");
      const autoFocusButton = options.buttons.find((button) => button.autoFocus);
      const explicitFocusTarget = autoFocusButton
        ? modal.querySelector(`[data-notification-button-id="${autoFocusButton.id}"]`)
        : null;
      (explicitFocusTarget || focusTarget)?.focus?.();
    }

    function openNextQueuedModal() {
      if (activeRequest || !queue.length) return;
      const next = queue.shift();
      renderActiveModal(next.options, next.resolve);
    }

    function show(options = {}) {
      const normalizedOptions = normalizeOptions(options);
      if (normalizedOptions.dedupeKey
        && (activeRequest?.dedupeKey === normalizedOptions.dedupeKey
          || queue.some((request) => request.options.dedupeKey === normalizedOptions.dedupeKey))) {
        return Promise.resolve(normalizedOptions.dismissValue);
      }
      return new Promise((resolve) => {
        queue.push({ options: normalizedOptions, resolve });
        openNextQueuedModal();
      });
    }

    function alert(messageOrOptions) {
      return show(typeof messageOrOptions === "string"
        ? {
            title: "MD-Editor",
            message: messageOrOptions,
            buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
          }
        : Object.assign({
            title: "MD-Editor",
            buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
          }, messageOrOptions || {}));
    }

    function confirm(messageOrOptions) {
      const options = typeof messageOrOptions === "string" ? { message: messageOrOptions } : (messageOrOptions || {});
      return show(Object.assign({
        title: "Confirm",
        dismissValue: false,
        buttons: [
          { id: "cancel", label: options.cancelLabel || "Cancel", value: false, variant: "cancel" },
          { id: "confirm", label: options.confirmLabel || "OK", value: true, variant: options.confirmVariant || "primary", autoFocus: true }
        ]
      }, options)).then(Boolean);
    }

    function prompt(options = {}) {
      const source = typeof options === "string" ? { message: options } : (options || {});
      let input = null;
      return show(Object.assign({
        title: source.title || "MD-Editor",
        dismissValue: null,
        focusSelector: "#app-notification-input",
        renderBody: function renderPromptInput(body) {
          input = createElement("input", "rename-modal-input");
          input.id = "app-notification-input";
          input.type = "text";
          input.value = Object.prototype.hasOwnProperty.call(source, "value") ? String(source.value) : "";
          input.addEventListener("keydown", (event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            closeActiveModal(input.value);
          });
          body.appendChild(input);
        },
        buttons: [
          { id: "cancel", label: source.cancelLabel || "Cancel", value: null, variant: "cancel" },
          { id: "confirm", label: source.confirmLabel || "OK", variant: "primary", action: () => input?.value ?? "" }
        ]
      }, source));
    }

    function handleModalClick(event) {
      if (event.target?.id === "app-notification-modal" && activeRequest?.dismissible) {
        closeActiveModal(activeRequest.dismissValue);
      }
    }

    function handleModalKeydown(event) {
      if (event.key === "Escape" && activeRequest?.dismissible) {
        event.preventDefault();
        closeActiveModal(activeRequest.dismissValue);
      }
    }

    const modal = ensureModal();
    modal?.addEventListener("click", handleModalClick);
    modal?.addEventListener("keydown", handleModalKeydown);

    const api = { show, alert, confirm, prompt };
    if (app?.services) {
      app.services.notify = api;
      app.services.alert = alert;
      app.services.confirm = confirm;
      app.services.prompt = prompt;
    }
    app?.registerModule?.("notificationModal", api);
    return api;
  }

  global.registerMarkdownViewerNotificationModal = registerMarkdownViewerNotificationModal;
  if (typeof module !== "undefined" && module.exports) {
    module.exports = { registerMarkdownViewerNotificationModal };
  }
})(typeof window !== "undefined" ? window : globalThis);
