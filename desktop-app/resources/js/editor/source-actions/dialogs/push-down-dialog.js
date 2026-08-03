// Eclipse-style Java Push Down member selection and workspace preview dialog.
(function(global) {
  "use strict";

  /** Create the Push Down wizard used by the Java refactoring action. */
  function createMarkdownViewerPushDownDialog() {
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function actionLabel(action) {
      if (action === "pushDown") return "push down";
      if (action === "leaveAbstract") return "push down and leave abstract";
      return "";
    }

    function open(options = {}) {
      return new Promise((resolve) => {
        const overlay = element("div", "push-down-overlay");
        const panel = element("section", "push-down-dialog");
        const heading = element("header", "push-down-heading");
        heading.append(element("h2", "", "Push Down"), element("p", "", "Selected members are moved to every eligible direct subclass."));
        const content = element("div", "push-down-content");
        const footer = element("footer", "push-down-footer");
        const backButton = element("button", "btn btn-secondary", "Back");
        const previewButton = element("button", "btn btn-primary", "Preview");
        const applyButton = element("button", "btn btn-primary", "Apply");
        const cancelButton = element("button", "btn btn-secondary", "Cancel");
        backButton.hidden = true;
        applyButton.hidden = true;
        footer.append(backButton, previewButton, applyButton, cancelButton);
        panel.append(heading, content, footer);
        overlay.append(panel);
        document.body.append(overlay);

        const state = {
          members: [...(options.analysis?.members || [])],
          actions: Object.fromEntries((options.analysis?.members || []).map((member) => [member.handle, member.action || "none"])),
          selectedHandles: new Set((options.analysis?.members || []).filter((member) => member.action !== "none").map((member) => member.handle)),
          problems: [...(options.analysis?.problems || [])],
          preview: null,
          applied: null
        };

        function settings() {
          return { ...options.request, actions: { ...state.actions } };
        }

        function close(result) {
          overlay.remove();
          resolve(result);
        }

        function hasActiveAction() {
          return Object.values(state.actions).some((action) => action !== "none");
        }

        function renderProblems(container, problems = state.problems) {
          if (!problems.length) return;
          const list = element("ul", "push-down-problems");
          problems.forEach((problem) => list.append(element("li", `push-down-${problem.severity}`, problem.message)));
          container.append(list);
        }

        function setAllActions(action) {
          state.members.forEach((member) => {
            state.actions[member.handle] = member.availableActions.includes(action) ? action : "none";
          });
          renderConfiguration();
        }

        function renderConfiguration() {
          content.replaceChildren();
          const toolbar = element("div", "push-down-toolbar");
          const selectAll = element("button", "btn btn-secondary", "Select All");
          const deselectAll = element("button", "btn btn-secondary", "Deselect All");
          const bulkAction = document.createElement("select");
          bulkAction.className = "push-down-bulk-action";
          [
            ["pushDown", "push down"],
            ["leaveAbstract", "push down and leave abstract"],
            ["none", "no action"]
          ].forEach(([value, label]) => {
            const option = document.createElement("option");
            option.value = value;
            option.textContent = label;
            bulkAction.append(option);
          });
          const setAction = element("button", "btn btn-secondary", "Set Action");
          const addRequired = element("button", "btn btn-secondary", "Add Required");
          selectAll.addEventListener("click", () => setAllActions("pushDown"));
          deselectAll.addEventListener("click", () => setAllActions("none"));
          setAction.addEventListener("click", () => {
            state.members.forEach((member) => {
              if (state.selectedHandles.has(member.handle) && member.availableActions.includes(bulkAction.value)) {
                state.actions[member.handle] = bulkAction.value;
              }
            });
            renderConfiguration();
          });
          addRequired.addEventListener("click", async () => {
            addRequired.disabled = true;
            try {
              const resolution = await options.resolveRequiredMembers(settings());
              state.members = [...(resolution?.members || state.members)];
              state.problems = [...(resolution?.problems || [])];
              state.members.forEach((member) => { state.actions[member.handle] = member.action || "none"; });
              renderConfiguration();
            } catch (error) {
              state.problems = [{ severity: "error", message: error?.message || "Unable to add required members." }];
              renderConfiguration();
            }
          });
          toolbar.append(selectAll, deselectAll, bulkAction, setAction, addRequired);
          content.append(toolbar);

          const table = element("table", "push-down-members");
          const header = element("tr");
          header.append(element("th", "", ""), element("th", "", "Member"), element("th", "", "Action"));
          table.append(header);
          state.members.forEach((member) => {
            const row = element("tr", state.selectedHandles.has(member.handle) ? "push-down-row-selected" : "");
            row.addEventListener("click", (event) => {
              if (event.target.closest("input, select, button")) return;
              if (state.selectedHandles.has(member.handle)) state.selectedHandles.delete(member.handle);
              else state.selectedHandles.add(member.handle);
              renderConfiguration();
            });
            const checkCell = element("td");
            const checkbox = document.createElement("input");
            checkbox.type = "checkbox";
            checkbox.checked = state.actions[member.handle] !== "none";
            checkbox.addEventListener("change", () => {
              state.actions[member.handle] = checkbox.checked ? "pushDown" : "none";
              renderConfiguration();
            });
            checkCell.append(checkbox);
            const actionCell = element("td");
            const action = document.createElement("select");
            member.availableActions.forEach((value) => {
              const option = document.createElement("option");
              option.value = value;
              option.textContent = actionLabel(value);
              option.selected = state.actions[member.handle] === value;
              action.append(option);
            });
            action.addEventListener("change", () => {
              state.actions[member.handle] = action.value;
              renderConfiguration();
            });
            actionCell.append(action);
            row.append(checkCell, element("td", "", member.label), actionCell);
            table.append(row);
          });
          content.append(table);
          content.append(element("p", "push-down-summary", `${Object.values(state.actions).filter((action) => action !== "none").length} members selected.`));
          renderProblems(content);
          previewButton.disabled = !hasActiveAction() || state.problems.some((problem) => ["fatal", "error"].includes(problem.severity));
        }

        function showPreview() {
          content.replaceChildren();
          renderProblems(content, state.preview?.problems || []);
          const summaries = state.preview?.summary || [];
          const layout = element("div", "push-down-preview-layout");
          const files = element("div", "push-down-file-list");
          const comparison = element("div", "push-down-comparison");
          const before = element("pre", "push-down-before");
          const after = element("pre", "push-down-after");
          comparison.append(element("h3", "", "Original Source"), element("h3", "", "Refactored Source"), before, after);
          function selectSummary(summary, button) {
            files.querySelectorAll("button").forEach((item) => item.setAttribute("aria-selected", "false"));
            button.setAttribute("aria-selected", "true");
            before.textContent = summary.before || "";
            after.textContent = summary.after || "";
          }
          summaries.forEach((summary, index) => {
            const button = element("button", "", summary.destination ? `${summary.path} → ${summary.destination}` : summary.path);
            button.addEventListener("click", () => selectSummary(summary, button));
            files.append(button);
            if (index === 0) selectSummary(summary, button);
          });
          layout.append(files, comparison);
          content.append(layout);
          backButton.hidden = false;
          previewButton.hidden = true;
          applyButton.hidden = false;
          applyButton.disabled = !state.preview || (state.preview.problems || []).some((problem) => ["fatal", "error"].includes(problem.severity));
        }

        previewButton.addEventListener("click", async () => {
          previewButton.disabled = true;
          try {
            state.preview = await options.preparePreview(settings());
            showPreview();
          } catch (error) {
            state.problems = [{ severity: "error", message: error?.message || "Unable to preview Push Down." }];
            renderConfiguration();
          }
        });
        backButton.addEventListener("click", () => {
          state.preview = null;
          backButton.hidden = true;
          previewButton.hidden = false;
          applyButton.hidden = true;
          renderConfiguration();
        });
        applyButton.addEventListener("click", async () => {
          if (state.applied) {
            await state.applied.undo?.();
            await options.onAfterUndo?.();
            close({ applied: false, undone: true });
            return;
          }
          applyButton.disabled = true;
          try {
            state.applied = await options.applyPreview(state.preview);
            await options.onAfterApply?.();
            content.replaceChildren(element("p", "push-down-applied", "Push Down was applied successfully."));
            backButton.hidden = true;
            previewButton.hidden = true;
            applyButton.textContent = "Undo";
            applyButton.hidden = false;
            applyButton.disabled = typeof state.applied?.undo !== "function";
            cancelButton.textContent = "Close";
          } catch (error) {
            state.problems = [{ severity: "error", message: error?.message || "Unable to apply Push Down." }];
            renderConfiguration();
            backButton.hidden = true;
            previewButton.hidden = false;
            applyButton.hidden = true;
          }
        });
        cancelButton.addEventListener("click", () => close({ applied: !!state.applied, reason: "cancelled" }));
        overlay.addEventListener("click", (event) => { if (event.target === overlay) close({ applied: false, reason: "cancelled" }); });
        renderConfiguration();
      });
    }

    return { open };
  }

  global.createMarkdownViewerPushDownDialog = createMarkdownViewerPushDownDialog;
})(typeof window !== "undefined" ? window : globalThis);
