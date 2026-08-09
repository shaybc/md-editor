/** Plain-language field guidance for the lifecycle automation settings editor. */
(function(window) {
  "use strict";

  const HELP_TEXT = Object.freeze({
    id: "Give this automation a unique, stable name so you can recognize it later. Use letters, numbers, periods, underscores, colons, or hyphens, and do not use spaces. For example: notify-on-tool-failure. Other definitions and saved settings may refer to this ID, so avoid changing it after the automation is in use.",
    event: "Choose the exact point in the agent run when this automation should be considered. For example, before-tool runs before a tool starts, tool-failure runs after a tool reports an error, and run-finish runs when the task ends successfully. The automation runs only for the selected event, and the matcher below can narrow it further.",
    enabled: "Turn this on when the automation should be active. Turn it off to keep the complete definition saved without allowing it to run. This is useful when testing a rule or temporarily pausing it without deleting its matcher and actions.",
    onError: "Choose what should happen if one of this automation's actions cannot finish. Continue records the problem and lets the current agent boundary continue. Block current boundary stops only the operation being processed. Stop run ends the complete agent run. Use the stronger choices only when continuing could be unsafe or misleading.",
    matcher: "Enter a JSON object that decides which occurrences of the selected event should run this automation. Use {} to match every occurrence. You can filter common values with tool, mode, path, status, or error, and use fields for nested payload values. Strings may contain a simple * wildcard. Example: {\"tool\":\"read_*\",\"mode\":\"agent\"}. Use only data that the selected event actually provides.",
    preview: "Enter a sample event payload as a JSON object to test the matcher without running the automation. Include the same fields that the real event is expected to carry, such as tool, mode, path, status, error, or nested values. This preview checks whether the sample matches; it does not run any configured actions.",
    validateMatch: "Select this button to compare the Matcher JSON with the sample Matcher preview payload. The result below tells you whether that sample would activate the automation. Validation does not save the definition and does not execute commands, requests, callbacks, or other actions.",
    actionType: "Choose what this action should do. Context adds guidance for the agent. Notify user shows a message. Command runs a configured command through the normal security and approval controls. Model check asks a model for a bounded decision. Delegated run starts a scoped agent. Web request calls an allowed endpoint. Application callback invokes a callback supplied by the application.",
    actionProperties: "Enter a JSON object containing the values required by the selected action type. The editor inserts a starter example when you choose a type. Fill in its empty values instead of adding a type property here. Examples include content for Context, message and level for Notify user, command for Command, prompt for Model check, agentId and prompt for Delegated run, url and method for Web request, or callbackId for Application callback.",
    addAction: "Add the selected action type and its JSON properties to the ordered action list. When you are editing an existing action, this button updates that action instead. Invalid JSON is rejected. Adding an action changes only this open editor; use Save automation to persist the complete definition.",
    orderedActions: "This list shows the actions that will run for one matching event, from top to bottom. Use the row controls to edit, move, or remove actions. A lifecycle automation must contain at least one action. If an action stops the boundary or fails under the selected On error policy, later actions may not run.",
    actionChain: "This advanced editor represents the complete ordered action list as a JSON array. Use it when copying or editing several actions at once. Every item must be an object with a supported type and the properties needed by that type. Loading this JSON replaces the current ordered action list in the open editor, but it does not save the automation yet.",
    loadActionChain: "Replace the visible ordered action list with the JSON array from the advanced editor. Use this after pasting or manually changing the array. The JSON must be valid and every item must use a supported action type. This operation affects only the open editor until you select Save automation.",
    timeout: "Enter the maximum time, in milliseconds, that one action may run before it is treated as timed out. The allowed range is 100 to 300000 milliseconds. For example, 30000 means 30 seconds. Choose enough time for the action to finish, but avoid very large values that could leave the agent waiting for a stalled operation.",
    cooldown: "Enter how long, in milliseconds, this automation must wait after running before it may run again. Use 0 when no cooldown is needed. A cooldown helps prevent a frequently repeated event, such as file changes or tool failures, from triggering the same automation too often.",
    deduplication: "Enter the time window, in milliseconds, used to ignore repeated copies of the same matching event. Use 0 to disable duplicate suppression. For example, 1000 ignores equivalent repeats received within one second. This protects against event bursts while still allowing a genuinely different payload to run.",
    background: "Turn this on to let eligible actions run without making the main agent boundary wait for their result. Use it only for work whose result is not required by the next agent decision, such as an informational notification. Leave it off for context, checks, or safety actions that must finish before the run continues."
  });

  /** Attach accessible, viewport-safe explanations to lifecycle setting help buttons. */
  function attach(root) {
    const tooltipFactory = window.MarkdownViewerAiConnectionEntryTooltip;
    if (!root || !tooltipFactory?.create) return Object.freeze({ hide() {} });
    const tooltip = tooltipFactory.create();
    root.querySelectorAll("[data-lifecycle-help]").forEach((button) => {
      const description = HELP_TEXT[button.dataset.lifecycleHelp];
      if (!description) return;
      button.dataset.nativeTooltip = "off";
      button.setAttribute("aria-label", `${button.dataset.lifecycleLabel || "Setting information"}: ${description}`);
      tooltip.bind(button, description);
      button.addEventListener("click", (event) => { event.preventDefault(); event.stopPropagation(); });
    });
    return tooltip;
  }

  window.MarkdownViewerAiLifecycleSettingsHelp = Object.freeze({ attach, text: HELP_TEXT });
})(window);
