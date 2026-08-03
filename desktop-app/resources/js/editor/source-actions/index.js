// Source submenu provider registry and action dispatcher.
(function(window) {
  "use strict";

  /**
   * Register the editor Source-action registry.
   * @param {object} app Application module registry.
   * @returns {{registerProvider: function(object): object, getAvailableActions: function(object=): object[], prepareAvailableActions: function(object=): Promise<boolean>, findAvailableAction: function(string, object=): object|null, executeAction: function(string, object=): *}} Source-action API.
   */
  function registerMarkdownViewerSourceActions(app) {
    const providers = [];

    /** Register one focused provider of Source submenu actions. */
    function registerProvider(provider) {
      if (!provider || typeof provider.getAvailableActions !== "function") {
        throw new TypeError("Source-action providers must expose getAvailableActions(context).");
      }
      providers.push(provider);
      return provider;
    }

    /** Collect the actions available for the active editor context. */
    function getAvailableActions(context = {}) {
      return providers.flatMap(function(provider) {
        const actions = provider.getAvailableActions(context);
        return Array.isArray(actions) ? actions : [];
      });
    }

    /** Allow providers to prepare selection-dependent actions without delaying the initial menu. */
    async function prepareAvailableActions(context = {}) {
      const results = await Promise.all(providers.map(function(provider) {
        if (typeof provider.prepareAvailableActions !== 'function') return false;
        return Promise.resolve(provider.prepareAvailableActions(context)).catch(function() { return false; });
      }));
      return results.some(Boolean);
    }

    function findAction(actions, actionId) {
      for (const action of actions) {
        if (action?.id === actionId) return action;
        const child = findAction(Array.isArray(action?.children) ? action.children : [], actionId);
        if (child) return child;
      }
      return null;
    }

    /** Find a leaf or group action recursively by its stable id. */
    function findAvailableAction(actionId, context = {}) {
      return findAction(getAvailableActions(context), actionId);
    }

    /** Execute one currently available Source action by its stable id. */
    function executeAction(actionId, context = {}) {
      const action = findAvailableAction(actionId, context);
      return typeof action?.run === "function" ? action.run(context) : false;
    }

    const api = { registerProvider, getAvailableActions, prepareAvailableActions, findAvailableAction, executeAction };
    app.registerModule?.("sourceActions", api);
    return api;
  }

  window.registerMarkdownViewerSourceActions = registerMarkdownViewerSourceActions;
})(window);
