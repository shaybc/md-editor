/**
 * Browser renderer for persisted intent contracts and clarification interactions.
 */
(function(window) {
  "use strict";

  function textElement(tag, className, text) {
    const element = document.createElement(tag);
    element.className = className;
    element.textContent = String(text || "");
    return element;
  }

  function provenanceLabel(value) {
    return String(value || "inferred").replace(/-/g, " ");
  }

  function appendValueField(container, label, field) {
    if (!field?.value) return;
    const row = textElement("div", "ai-companion-intent-field", "");
    row.appendChild(textElement("strong", "", `${label}: `));
    row.appendChild(document.createTextNode(String(field.value)));
    row.appendChild(textElement("span", `ai-companion-intent-provenance provenance-${field.provenance || "inferred"}`, provenanceLabel(field.provenance)));
    container.appendChild(row);
  }

  function appendTargets(container, contract) {
    const targets = Object.values(contract.namedTargets || {}).flatMap((group) => Array.isArray(group) ? group : []);
    if (!targets.length) return;
    const section = textElement("section", "ai-companion-intent-section", "");
    section.appendChild(textElement("h4", "", "Named targets"));
    const list = textElement("ul", "ai-companion-intent-targets", "");
    for (const target of targets) {
      const item = textElement("li", "", "");
      item.appendChild(textElement("span", "ai-companion-intent-target-value", `${target.id}: ${target.value}`));
      item.appendChild(textElement("span", `ai-companion-intent-target-state state-${target.status || "unverified"}`, target.status || "unverified"));
      list.appendChild(item);
    }
    section.appendChild(list);
    container.appendChild(section);
  }

  /** Create the collapsible, read-only contract card used for live and restored events. */
  function createIntentContractCard(event = {}) {
    const contract = event.contract && typeof event.contract === "object" ? event.contract : {};
    const criteria = Array.isArray(contract.acceptanceCriteria) ? contract.acceptanceCriteria : [];
    const isFallback = event.variant === "fallback" || event.source === "raw-prompt-fallback";
    const card = document.createElement("details");
    card.className = `ai-companion-intent-card${isFallback ? " fallback" : ""}`;
    const summary = textElement("summary", "ai-companion-intent-header", "");
    const marker = textElement("i", "bi bi-bullseye ai-companion-intent-marker", "");
    marker.setAttribute("aria-hidden", "true");
    summary.appendChild(marker);
    summary.appendChild(textElement("span", "ai-companion-intent-title", `Intent: ${contract.taskType || "answer"} - ${criteria.length} acceptance ${criteria.length === 1 ? "criterion" : "criteria"}`));
    const revision = Number(event.meta?.revision || 0);
    const amendments = Array.isArray(contract.amendments) ? contract.amendments.length : 0;
    if (revision || amendments) summary.appendChild(textElement("span", "ai-companion-intent-revision", `r${revision}${amendments ? ` / ${amendments} amendment${amendments === 1 ? "" : "s"}` : ""}`));
    card.appendChild(summary);

    const body = textElement("div", "ai-companion-intent-body", "");
    appendValueField(body, "Goal", contract.goal);
    appendValueField(body, "Expected outcome", contract.expectedOutcome);
    if (isFallback) body.appendChild(textElement("div", "ai-companion-intent-warning", "Structured intent extraction was unavailable; using the raw request."));
    if (criteria.length) {
      const section = textElement("section", "ai-companion-intent-section", "");
      section.appendChild(textElement("h4", "", "Acceptance criteria"));
      const list = textElement("ol", "ai-companion-intent-criteria", "");
      for (const criterion of criteria) {
        const item = textElement("li", "", `${criterion.id}: ${criterion.description || ""}`);
        item.appendChild(textElement("span", `ai-companion-intent-provenance provenance-${criterion.provenance || "inferred"}`, provenanceLabel(criterion.provenance)));
        list.appendChild(item);
      }
      section.appendChild(list);
      body.appendChild(section);
    }
    appendTargets(body, contract);
    card.appendChild(body);
    return card;
  }

  function appendRatingControls(row, event, options) {
    const controls = textElement("div", "ai-companion-clarification-feedback", "");
    controls.appendChild(textElement("span", "", "Was this question decision-shaping?"));
    for (const rating of ["useful", "not-useful"]) {
      const button = textElement("button", `ai-companion-clarification-rating${event.rating === rating ? " active" : ""}`, "");
      button.type = "button";
      button.dataset.rating = rating;
      button.title = rating === "useful" ? "Useful clarification" : "Not decision-shaping";
      button.setAttribute("aria-label", button.title);
      button.setAttribute("aria-pressed", event.rating === rating ? "true" : "false");
      const icon = textElement("i", `bi ${rating === "useful" ? "bi-hand-thumbs-up" : "bi-hand-thumbs-down"}`, "");
      button.appendChild(icon);
      button.addEventListener("click", async () => {
        await options.onRate?.(event.clarificationId, rating);
        controls.querySelectorAll("button").forEach((entry) => {
          const active = entry.dataset.rating === rating;
          entry.classList.toggle("active", active);
          entry.setAttribute("aria-pressed", active ? "true" : "false");
        });
      });
      controls.appendChild(button);
    }
    row.appendChild(controls);
  }

  /** Create one clarification card, including answer, feedback, and optional resume actions. */
  function createClarificationCard(event = {}, options = {}) {
    const interactive = options.interactive !== false;
    const resolvedAnswer = String(options.resolvedAnswer || "").trim();
    const row = textElement("div", `ai-companion-clarification ${resolvedAnswer ? "resolved" : "pending"}`, "");
    if (event.clarificationId) row.dataset.aiCompanionActivityId = String(event.clarificationId);
    const header = textElement("div", "ai-companion-clarification-header", "");
    const marker = textElement("i", "bi bi-question-circle ai-companion-clarification-marker", "");
    marker.setAttribute("aria-hidden", "true");
    header.appendChild(marker);
    header.appendChild(textElement("div", "ai-companion-clarification-title", resolvedAnswer ? "Clarification answered" : "Clarification needed"));
    row.appendChild(header);
    row.appendChild(textElement("div", "ai-companion-clarification-question", event.question));
    if (event.reason) row.appendChild(textElement("div", "ai-companion-clarification-reason", event.reason));

    if (resolvedAnswer) {
      row.appendChild(textElement("div", "ai-companion-clarification-answer", `Answered: ${resolvedAnswer}`));
    } else if (interactive) {
      const choices = Array.isArray(event.choices) ? event.choices.filter(Boolean) : [];
      const form = textElement("div", "ai-companion-clarification-form", "");
      let getAnswer;
      if (choices.length) {
        const groupName = `clarification-${event.clarificationId || Math.random().toString(36).slice(2)}`;
        for (const [index, choice] of choices.entries()) {
          const label = document.createElement("label");
          const input = document.createElement("input");
          input.type = "radio";
          input.name = groupName;
          input.value = String(choice);
          input.checked = index === 0;
          label.append(input, document.createTextNode(String(choice)));
          form.appendChild(label);
        }
        getAnswer = () => form.querySelector("input:checked")?.value || "";
      } else {
        const input = document.createElement("textarea");
        input.className = "ai-companion-clarification-input";
        input.rows = 2;
        form.appendChild(input);
        getAnswer = () => String(input.value || "").trim();
      }
      row.appendChild(form);
      const submit = textElement("button", "ai-companion-clarification-submit", "Send answer");
      submit.type = "button";
      submit.addEventListener("click", async () => {
        const answer = getAnswer();
        if (!answer) return;
        submit.disabled = true;
        try {
          await options.onSubmit?.(event.clarificationId, answer);
          row.classList.replace("pending", "resolved");
          form.remove();
          submit.remove();
          row.appendChild(textElement("div", "ai-companion-clarification-answer", `Answered: ${answer}`));
        } catch (error) {
          submit.disabled = false;
          options.onError?.(error);
        }
      });
      row.appendChild(submit);
    } else if (options.canResume === true) {
      const resume = textElement("button", "ai-companion-clarification-resume", "Resume intent analysis");
      resume.type = "button";
      resume.addEventListener("click", () => options.onResume?.());
      row.appendChild(resume);
    }
    appendRatingControls(row, event, options);
    return row;
  }

  window.createMarkdownViewerIntentContractRenderer = function() {
    return { createClarificationCard, createIntentContractCard };
  };
})(window);
