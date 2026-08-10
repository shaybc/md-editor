(function(window) {
  "use strict";

  function registerMarkdownViewerStructuredExecutionActions(app, deps) {
    function supports(toolName) {
      return toolName === "structured_compile_project" || toolName === "structured_run_tests";
    }

    async function execute(toolName, args) {
      if (!supports(toolName)) throw new Error(`Unsupported structured execution action: ${toolName}`);
      if (toolName === "structured_compile_project") {
        if (!deps.projectCommands?.execute) throw new Error("IDE project rebuild is unavailable.");
        const succeeded = await deps.projectCommands.execute("rebuild-project-last-options", {
          configureIfMissing: true,
          waitForAnalysis: false,
          source: "ai-companion"
        });
        return { success: succeeded === true };
      }
      if (!deps.projectCommands?.executeStructured) throw new Error("Structured project execution is unavailable.");
      return deps.projectCommands.executeStructured(toolName.replace("structured_", ""), args || {});
    }

    const api = { execute, supports };
    app.registerModule("structuredExecutionActions", api);
    return api;
  }

  window.registerMarkdownViewerStructuredExecutionActions = registerMarkdownViewerStructuredExecutionActions;
})(window);
