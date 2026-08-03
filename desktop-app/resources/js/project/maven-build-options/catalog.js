(function(global) {
  "use strict";

  /** Own the ordered provider catalog for Maven rebuild options. */
  function registerMarkdownViewerMavenBuildOptionsCatalog(app) {
    const providers = [];

    function normalizeGroup(group = {}) {
      const id = String(group.id || "").trim();
      const label = String(group.label || "").trim();
      if (!id || !label) throw new Error("Maven Build Option groups require an id and label.");
      return { id, label, order: Number.isFinite(group.order) ? group.order : 100 };
    }

    function normalizeOption(option, providerId) {
      const source = option && typeof option === "object" ? option : {};
      const id = String(source.id || "").trim();
      const label = String(source.label || "").trim();
      if (!id || !label) throw new Error(`Maven Build Option provider '${providerId}' returned an option without an id or label.`);
      if (source.type && source.type !== "boolean") throw new Error(`Maven Build Option '${id}' uses unsupported type '${source.type}'.`);
      const persistence = source.persistence || "invocation";
      if (persistence !== "project" && persistence !== "invocation") {
        throw new Error(`Maven Build Option '${id}' has invalid persistence '${persistence}'.`);
      }
      return Object.assign({}, source, {
        id,
        label,
        providerId,
        group: normalizeGroup(source.group),
        type: "boolean",
        description: String(source.description || "").trim(),
        help: String(source.help || source.description || "").trim(),
        badge: String(source.badge || "").trim(),
        order: Number.isFinite(source.order) ? source.order : 100,
        defaultValue: source.defaultValue === true,
        persistence,
        storagePath: persistence === "project" ? String(source.storagePath || "").trim() : "",
        requires: Array.isArray(source.requires) ? source.requires.map(String) : [],
        conflicts: Array.isArray(source.conflicts) ? source.conflicts.map(String) : [],
        reservedArguments: Array.isArray(source.reservedArguments) ? source.reservedArguments.map(String) : []
      });
    }

    function validateRelationships(options) {
      const byId = new Map(options.map((option) => [option.id, option]));
      for (const option of options) {
        for (const relatedId of option.requires.concat(option.conflicts)) {
          if (!byId.has(relatedId)) throw new Error(`Maven Build Option '${option.id}' references unknown option '${relatedId}'.`);
        }
      }
      const visiting = new Set();
      const visited = new Set();
      function visit(id) {
        if (visiting.has(id)) throw new Error(`Maven Build Option requirements contain a cycle at '${id}'.`);
        if (visited.has(id)) return;
        visiting.add(id);
        byId.get(id).requires.forEach(visit);
        visiting.delete(id);
        visited.add(id);
      }
      options.forEach((option) => visit(option.id));
    }

    function sortOptions(options) {
      return options.sort((left, right) => left.group.order - right.group.order
        || left.group.label.localeCompare(right.group.label)
        || left.order - right.order
        || left.label.localeCompare(right.label));
    }

    /** Register one source of Maven Build Option definitions. */
    function registerProvider(provider) {
      const id = String(provider?.id || "").trim();
      if (!id || typeof provider?.getOptions !== "function") throw new Error("Maven Build Option providers require an id and getOptions(context).");
      if (providers.some((entry) => entry.id === id)) throw new Error(`Maven Build Option provider '${id}' is already registered.`);
      providers.push({ id, getOptions: provider.getOptions });
      return () => {
        const index = providers.findIndex((entry) => entry.id === id);
        if (index >= 0) providers.splice(index, 1);
      };
    }

    /** Resolve and validate all option definitions for one Maven project context. */
    async function getOptions(context = {}) {
      const options = [];
      const providerErrors = [];
      const ids = new Set();
      for (const provider of providers) {
        try {
          const entries = await provider.getOptions(context);
          for (const entry of Array.isArray(entries) ? entries : []) {
            const option = normalizeOption(entry, provider.id);
            if (ids.has(option.id)) throw new Error(`Maven Build Option '${option.id}' is registered more than once.`);
            ids.add(option.id);
            options.push(option);
          }
        } catch (error) {
          providerErrors.push({ providerId: provider.id, message: error?.message || String(error) });
        }
      }
      validateRelationships(options);
      return { options: sortOptions(options), providerErrors };
    }

    const api = { getOptions, registerProvider };
    app.registerModule?.("mavenBuildOptionsCatalog", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildOptionsCatalog = registerMarkdownViewerMavenBuildOptionsCatalog;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenBuildOptionsCatalog };
})(typeof window !== "undefined" ? window : globalThis);
