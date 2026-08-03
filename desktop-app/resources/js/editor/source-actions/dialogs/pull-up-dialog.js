// Eclipse-style Java Pull Up configuration, subtype, problems, and preview dialog.
(function(global) {
  "use strict";

  /** Create the Pull Up wizard used by the Java refactoring action. */
  function createMarkdownViewerPullUpDialog() {
    function element(tag, className, text) {
      const node = document.createElement(tag);
      if (className) node.className = className;
      if (text !== undefined) node.textContent = text;
      return node;
    }

    function memberActionOptions(member) {
      const options = [{ value: "none", label: "Do not move" }, { value: "pullUp", label: "Pull up" }];
      if (member.canDeclareAbstract) options.push({ value: "declareAbstract", label: "Declare abstract" });
      return options;
    }

    function open(options = {}) {
      return new Promise((resolve) => {
        const overlay = element("div", "pull-up-overlay");
        const dialog = element("section", "pull-up-dialog");
        const heading = element("header", "pull-up-heading");
        heading.append(element("h2", "", "Pull Up"), element("p", "", "Select the destination type and the members to pull up."));
        const content = element("div", "pull-up-content");
        const footer = element("footer", "pull-up-footer");
        const backButton = element("button", "btn btn-secondary", "Back");
        const nextButton = element("button", "btn btn-primary", "Next");
        const finishButton = element("button", "btn btn-primary", "Finish");
        const cancelButton = element("button", "btn btn-secondary", "Cancel");
        backButton.disabled = true;
        finishButton.hidden = true;
        footer.append(backButton, nextButton, finishButton, cancelButton);
        dialog.append(heading, content, footer);
        overlay.append(dialog);
        document.body.append(overlay);

        const state = {
          page: 0,
          analysis: options.analysis || {},
          actions: Object.fromEntries((options.analysis?.members || []).map((member) => [
            member.handle, member.selected ? "pullUp" : "none"
          ])),
          destinationHandle: options.analysis?.destinations?.[0]?.handle || "",
          deletedMethodHandles: [],
          replaceWherePossible: true,
          replaceInstanceof: false,
          createMethodStubs: true,
          resolution: null,
          preview: null,
          applied: null
        };

        function settings() {
          return {
            ...options.request,
            destinationHandle: state.destinationHandle,
            actions: { ...state.actions },
            deletedMethodHandles: [...state.deletedMethodHandles],
            replaceWherePossible: state.replaceWherePossible,
            replaceInstanceof: state.replaceInstanceof,
            createMethodStubs: state.createMethodStubs
          };
        }

        function close(result) {
          overlay.remove();
          resolve(result);
        }

        function checkbox(label, checked, onChange, disabled = false) {
          const wrapper = element("label", "pull-up-option");
          const input = document.createElement("input");
          input.type = "checkbox";
          input.checked = checked;
          input.disabled = disabled;
          input.addEventListener("change", () => onChange(input.checked));
          wrapper.append(input, document.createTextNode(label));
          return wrapper;
        }

        function renderConfiguration() {
          content.replaceChildren();
          const destinationLabel = element("label", "pull-up-field", "Select destination type");
          const destination = document.createElement("select");
          for (const candidate of state.analysis.destinations || []) {
            const option = document.createElement("option");
            option.value = candidate.handle;
            option.textContent = candidate.label;
            option.selected = candidate.handle === state.destinationHandle;
            destination.append(option);
          }
          destination.addEventListener("change", () => { state.destinationHandle = destination.value; });
          destinationLabel.append(destination);
          content.append(destinationLabel);
          content.append(checkbox("Use the destination type where possible", state.replaceWherePossible, (checked) => {
            state.replaceWherePossible = checked;
            renderConfiguration();
          }));
          content.append(checkbox("Use the destination type in instanceof expressions", state.replaceInstanceof, (checked) => {
            state.replaceInstanceof = checked;
          }, !state.replaceWherePossible));
          const hasAbstract = Object.values(state.actions).includes("declareAbstract");
          content.append(checkbox("Create necessary method stubs in non-abstract subtypes", state.createMethodStubs, (checked) => {
            state.createMethodStubs = checked;
          }, !hasAbstract));

          content.append(element("h3", "", "Specify actions for members"));
          const table = element("table", "pull-up-members");
          const header = element("tr");
          header.append(element("th", "", "Member"), element("th", "", "Action"));
          table.append(header);
          for (const member of state.analysis.members || []) {
            const row = element("tr");
            row.append(element("td", "", member.label));
            const actionCell = element("td");
            const actionSelect = document.createElement("select");
            for (const action of memberActionOptions(member)) {
              const option = document.createElement("option");
              option.value = action.value;
              option.textContent = action.label;
              option.selected = state.actions[member.handle] === action.value;
              actionSelect.append(option);
            }
            actionSelect.addEventListener("change", () => {
              state.actions[member.handle] = actionSelect.value;
              renderConfiguration();
            });
            actionCell.append(actionSelect);
            row.append(actionCell);
            table.append(row);
          }
          content.append(table);
          nextButton.disabled = !state.destinationHandle || !Object.values(state.actions).some((action) => action !== "none");
        }

        function renderMatches() {
          content.replaceChildren(element("p", "", "Select matching methods to remove from subclasses."));
          const matches = state.resolution?.matchingMethods || [];
          if (!matches.length) content.append(element("p", "pull-up-empty", "No matching subtype methods were found."));
          for (const match of matches) {
            content.append(checkbox(`${match.declaringType} — ${match.label}`, state.deletedMethodHandles.includes(match.handle), (checked) => {
              state.deletedMethodHandles = checked
                ? [...state.deletedMethodHandles, match.handle]
                : state.deletedMethodHandles.filter((handle) => handle !== match.handle);
            }));
          }
          const required = state.resolution?.requiredMembers || [];
          if (required.length) {
            content.append(element("h3", "", "Additional required members"));
            const list = element("ul", "pull-up-required");
            required.forEach((member) => list.append(element("li", "", member.label)));
            content.append(list);
          }
        }

        function renderPreview() {
          content.replaceChildren();
          const problems = state.preview?.problems || [];
          if (problems.length) {
            content.append(element("h3", "", "Found problems"));
            const list = element("ul", "pull-up-problems");
            problems.forEach((problem) => list.append(element("li", `pull-up-${problem.severity}`, problem.message)));
            content.append(list);
          }
          if (state.preview?.summary?.length) {
            content.append(element("h3", "", "Changes to be performed"));
            const list = element("ul", "pull-up-preview-files");
            state.preview.summary.forEach((change) => {
              const destination = change.destination ? ` → ${change.destination}` : "";
              list.append(element("li", "", `${change.type}: ${change.path}${destination}`));
            });
            content.append(list);
          }
          finishButton.disabled = !state.preview || problems.some((problem) => ["fatal", "error"].includes(problem.severity));
        }

        function showWizardError(error) {
          content.querySelector(".pull-up-error")?.remove();
          const message = element("div", "pull-up-error", error?.message || "Pull Up failed.");
          message.setAttribute("role", "alert");
          content.prepend(message);
        }

        async function advance() {
          nextButton.disabled = true;
          try {
            if (state.page === 0) {
              state.resolution = await options.resolveConfiguration(settings());
              for (const member of state.resolution?.requiredMembers || []) state.actions[member.handle] = "pullUp";
              state.deletedMethodHandles = (state.resolution?.matchingMethods || []).map((match) => match.handle);
              state.page = 1;
              heading.querySelector("p").textContent = "Select the methods to be removed in subclasses.";
              renderMatches();
            } else {
              state.preview = await options.preparePreview(settings());
              state.page = 2;
              heading.querySelector("p").textContent = "Review the changes and any problems before applying.";
              renderPreview();
            }
            backButton.disabled = false;
            nextButton.hidden = state.page === 2;
            finishButton.hidden = state.page !== 2;
          } catch (error) {
            showWizardError(error);
          } finally {
            nextButton.disabled = false;
          }
        }

        backButton.addEventListener("click", () => {
          state.page = Math.max(0, state.page - 1);
          nextButton.hidden = false;
          finishButton.hidden = true;
          backButton.disabled = state.page === 0;
          if (state.page === 0) renderConfiguration(); else renderMatches();
        });
        nextButton.addEventListener("click", advance);
        finishButton.addEventListener("click", async () => {
          finishButton.disabled = true;
          try {
            if (state.applied) {
              await state.applied.undo?.();
              await options.onAfterUndo?.();
              close({ applied: false, undone: true });
              return;
            }
            state.applied = await options.applyPreview(state.preview);
            await options.onAfterApply?.();
            content.replaceChildren(element("p", "pull-up-applied", "Pull Up was applied successfully."));
            backButton.hidden = true;
            nextButton.hidden = true;
            finishButton.textContent = "Undo";
            cancelButton.textContent = "Close";
            finishButton.disabled = typeof state.applied?.undo !== "function";
          } catch (error) {
            showWizardError(error);
            finishButton.disabled = false;
          }
        });
        cancelButton.addEventListener("click", () => close({ applied: false, reason: "cancelled" }));
        overlay.addEventListener("click", (event) => { if (event.target === overlay) close({ applied: false, reason: "cancelled" }); });
        renderConfiguration();
      });
    }

    return { open };
  }

  global.createMarkdownViewerPullUpDialog = createMarkdownViewerPullUpDialog;
})(typeof window !== "undefined" ? window : globalThis);
