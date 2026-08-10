(function(window, document) {
  "use strict";

  /** Create the dedicated foreground interaction shown while an agent waits for user input. */
  function createMarkdownViewerAiCompanionUserInputInteraction(options = {}) {
    const host = options.host;
    let activeInteractionId = "";

    function clear() {
      activeInteractionId = "";
      if (!host) return;
      if (typeof host.replaceChildren === "function") host.replaceChildren();
      else host.innerHTML = "";
      host.hidden = true;
    }

    function getQuestionText(event = {}) {
      return (Array.isArray(event.questions) ? event.questions : [])
        .map((question) => String(question?.question || question?.header || "").trim())
        .filter(Boolean)
        .join("; ");
    }

    function getAnswerText(event = {}) {
      if (event.response?.declined === true) return "Cancelled";
      const values = Object.values(event.response?.answers || {}).flatMap((value) => Array.isArray(value) ? value : [value]);
      return values.map((value) => String(value || "").trim()).filter(Boolean).join(", ") || "No answer (interrupted)";
    }

    /** Prefer a specific short header while retaining direct questions over generic labels. */
    function getQuestionTitle(question = {}) {
      const header = String(question.header || "").trim();
      const questionText = String(question.question || "").trim();
      const isGenericHeader = /^(decision|choice|question|input|required input)$/i.test(header);
      return header && !isGenericHeader ? header : questionText || header;
    }

    /** Create the compact activity-history representation of a completed or interrupted question. */
    function createHistoryEntry(event = {}) {
      const row = document.createElement("div");
      row.className = "ai-companion-user-input-history";
      row.dataset.aiCompanionActivityId = String(event.interactionId || "");
      row.setAttribute("role", "status");
      const question = getQuestionText(event) || "Agent question";
      const answer = getAnswerText(event);
      row.textContent = `Asked ${question} → ${answer}`;
      row.title = row.textContent;
      return row;
    }

    function createOption(questionIndex, option, optionIndex, multiSelect) {
      const label = document.createElement("label");
      label.className = "ai-companion-user-input-option";
      label.title = [option?.label, option?.description].map((value) => String(value || "").trim()).filter(Boolean).join(" — ");
      const input = document.createElement("input");
      input.type = multiSelect ? "checkbox" : "radio";
      input.name = `ai-user-input-${questionIndex}`;
      input.value = String(option?.label || "");
      if (!multiSelect && optionIndex === 0) input.checked = true;
      const copy = document.createElement("span");
      const optionTitle = document.createElement("strong");
      optionTitle.textContent = input.value;
      const description = document.createElement("small");
      description.textContent = String(option?.description || "");
      copy.append(optionTitle, description);
      label.append(input, copy);
      return { label, input };
    }

    /** Show one actionable question set in the dedicated interaction host. */
    function show(event = {}) {
      if (!host) return null;
      clear();
      activeInteractionId = String(event.interactionId || "");
      host.hidden = false;

      const card = document.createElement("section");
      card.className = "ai-companion-user-input pending";
      card.dataset.aiCompanionActivityId = activeInteractionId;
      card.setAttribute("role", "region");
      card.setAttribute("aria-label", "Agent input required");
      card.setAttribute("tabindex", "-1");

      const status = document.createElement("div");
      status.className = "ai-companion-user-input-status";
      status.textContent = "Input required";
      const form = document.createElement("form");
      form.className = "ai-companion-user-input-form";
      const readers = [];
      const controls = [];

      (Array.isArray(event.questions) ? event.questions : []).forEach((question, questionIndex) => {
        const fieldset = document.createElement("fieldset");
        const legend = document.createElement("legend");
        const fullQuestion = String(question.question || "").trim();
        legend.textContent = getQuestionTitle(question) || `Question ${questionIndex + 1}`;
        legend.title = fullQuestion || legend.textContent;
        fieldset.appendChild(legend);
        if (questionIndex === 0 && event.reason) {
          const reason = document.createElement("div");
          reason.className = "ai-companion-user-input-reason";
          reason.textContent = event.reason;
          reason.title = event.reason;
          fieldset.appendChild(reason);
        }

        const inputs = [];
        const optionRows = [];
        (Array.isArray(question.options) ? question.options : []).forEach((option, optionIndex) => {
          const rendered = createOption(questionIndex, option, optionIndex, question.multiSelect === true);
          fieldset.appendChild(rendered.label);
          inputs.push(rendered.input);
          optionRows.push(rendered.label);
          controls.push(rendered.input);
        });

        let freeChoice = null;
        let freeText = null;
        if (question.allowFreeText !== false) {
          const pathQuestion = /path|folder|directory|root/i.test(String(question.question || ""));
          const rendered = createOption(questionIndex, {
            label: pathQuestion ? "Enter another path..." : "Enter another answer...",
            description: "Type a different value."
          }, inputs.length, question.multiSelect === true);
          freeChoice = rendered.input;
          rendered.label.classList.add("ai-companion-user-input-option-custom");
          fieldset.appendChild(rendered.label);
          inputs.push(freeChoice);
          optionRows.push(rendered.label);
          controls.push(freeChoice);
          freeText = document.createElement("input");
          freeText.type = "text";
          freeText.className = "ai-companion-user-input-free-text";
          freeText.placeholder = pathQuestion ? "Enter an absolute path" : "Enter another answer";
          freeText.setAttribute("aria-label", freeText.placeholder);
          freeText.hidden = true;
          fieldset.appendChild(freeText);
        }

        const updateSelection = (focusFreeText = false, refreshSubmit = true) => {
          optionRows.forEach((row, index) => row.classList.toggle("selected", inputs[index].checked === true));
          if (freeText) {
            freeText.hidden = freeChoice?.checked !== true;
            if (!freeText.hidden && focusFreeText) freeText.focus?.();
          }
          if (refreshSubmit) updateSubmitState();
        };
        inputs.forEach((input) => input.addEventListener("change", () => updateSelection(input === freeChoice)));
        freeText?.addEventListener("input", updateSubmitState);
        readers.push(() => {
          const custom = String(freeText?.value || "").trim();
          if (question.multiSelect === true) {
            const selected = inputs.filter((input) => input !== freeChoice && input.checked).map((input) => input.value);
            if (freeChoice?.checked && custom) selected.push(custom);
            return selected;
          }
          if (freeChoice?.checked) return custom;
          return inputs.find((input) => input.checked)?.value || "";
        });
        updateSelection(false, false);
        form.appendChild(fieldset);
      });

      const actions = document.createElement("div");
      actions.className = "ai-companion-user-input-actions";
      const submit = document.createElement("button");
      submit.type = "button";
      submit.className = "ai-companion-user-input-primary";
      submit.textContent = "Continue";
      const cancel = document.createElement("button");
      cancel.type = "button";
      cancel.className = "ai-companion-user-input-secondary";
      cancel.textContent = "Cancel";
      const error = document.createElement("div");
      error.className = "ai-companion-user-input-error";
      error.setAttribute("role", "alert");
      let submitting = false;

      function updateSubmitState() {
        submit.disabled = readers.some((read) => {
          const value = read();
          return Array.isArray(value) ? value.length === 0 : !String(value || "").trim();
        });
      }

      async function respond(declined) {
        if (submitting) return;
        submitting = true;
        submit.disabled = true;
        cancel.disabled = true;
        const answers = {};
        (event.questions || []).forEach((question, index) => { answers[question.question] = readers[index](); });
        try {
          await options.respond?.(event, answers, declined);
          if (activeInteractionId === String(event.interactionId || "")) clear();
          options.onResolved?.(event, createHistoryEntry(event));
        } catch (responseError) {
          submitting = false;
          error.textContent = responseError?.message || "The answer could not be submitted.";
          cancel.disabled = false;
          updateSubmitState();
        }
      }

      submit.addEventListener("click", () => { void respond(false); });
      cancel.addEventListener("click", () => { void respond(true); });
      form.addEventListener("submit", (submitEvent) => {
        submitEvent.preventDefault();
        if (!submit.disabled) void respond(false);
      });
      card.addEventListener("keydown", (keyEvent) => {
        if (keyEvent.key === "Escape") {
          keyEvent.preventDefault?.();
          void respond(true);
        } else if (keyEvent.key === "Enter" && keyEvent.target?.tagName === "INPUT" && !submit.disabled) {
          keyEvent.preventDefault?.();
          void respond(false);
        }
      });
      actions.append(submit, cancel);
      form.append(actions, error);
      card.append(status, form);
      host.appendChild(card);
      updateSubmitState();
      const firstControl = controls[0];
      firstControl?.focus?.();
      card.scrollIntoView?.({ block: "nearest", behavior: "smooth" });
      return card;
    }

    return { show, clear, createHistoryEntry };
  }

  window.createMarkdownViewerAiCompanionUserInputInteraction = createMarkdownViewerAiCompanionUserInputInteraction;
})(window, document);
