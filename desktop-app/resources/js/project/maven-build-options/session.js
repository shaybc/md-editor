(function(global) {
  "use strict";

  /** Own normalized values, dependencies, persistence, and arguments for one rebuild invocation. */
  function registerMarkdownViewerMavenBuildOptionsSession(app, deps = {}) {
    const advancedArguments = deps.advancedArguments;

    function readPath(source, path) {
      return String(path || "").split(".").filter(Boolean).reduce((value, key) => value?.[key], source);
    }

    function writePath(target, path, value) {
      const parts = String(path || "").split(".").filter(Boolean);
      if (!parts.length) return;
      let cursor = target;
      parts.slice(0, -1).forEach((part) => {
        if (!cursor[part] || typeof cursor[part] !== "object") cursor[part] = {};
        cursor = cursor[part];
      });
      cursor[parts.at(-1)] = value;
    }

    function collectReservedArguments(definitions) {
      return definitions.flatMap((definition) => Array.isArray(definition.reservedArguments) ? definition.reservedArguments : []);
    }

    /** Create mutable state for one opening of the Maven rebuild dialog. */
    function createSession(options = {}) {
      const definitions = Array.isArray(options.definitions) ? options.definitions : [];
      const persisted = options.persistedConfiguration && typeof options.persistedConfiguration === "object"
        ? options.persistedConfiguration
        : {};
      const invocationValues = options.invocationValues && typeof options.invocationValues === "object"
        ? options.invocationValues
        : {};
      const values = {};
      let advancedArgumentsRaw = String(options.advancedArguments || "");
      const byId = new Map(definitions.map((definition) => [definition.id, definition]));

      for (const definition of definitions) {
        const persistedValue = definition.persistence === "project" && definition.storagePath
          ? readPath(persisted, definition.storagePath)
          : undefined;
        const invocationValue = Object.prototype.hasOwnProperty.call(invocationValues, definition.id)
          ? invocationValues[definition.id]
          : undefined;
        values[definition.id] = typeof invocationValue === "boolean"
          ? invocationValue
          : (typeof persistedValue === "boolean" ? persistedValue : definition.defaultValue === true);
      }

      function enableRequirements(id, seen = new Set()) {
        if (seen.has(id)) return;
        seen.add(id);
        const definition = byId.get(id);
        for (const requiredId of definition?.requires || []) {
          values[requiredId] = true;
          enableRequirements(requiredId, seen);
        }
      }

      function disableDependents(id) {
        for (const definition of definitions) {
          if ((definition.requires || []).includes(id) && values[definition.id]) {
            values[definition.id] = false;
            disableDependents(definition.id);
          }
        }
      }

      function setValue(id, value) {
        if (!byId.has(id)) throw new Error(`Unknown Maven Build Option '${id}'.`);
        values[id] = value === true;
        if (values[id]) enableRequirements(id);
        else disableDependents(id);
        return resolve();
      }

      function setAdvancedArgumentsRaw(value) {
        advancedArgumentsRaw = String(value || "");
        return resolve();
      }

      function resolveAdvancedArguments(errors, warnings) {
        if (!advancedArguments?.validate) return [];
        const validation = advancedArguments.validate(advancedArgumentsRaw, {
          reservedArguments: collectReservedArguments(definitions)
        });
        for (const message of validation.errors || []) errors.push({ optionId: "advanced.maven.arguments", message });
        for (const message of validation.warnings || []) warnings.push({ optionId: "advanced.maven.arguments", message });
        return validation.valid ? validation.arguments || [] : [];
      }

      function resolve() {
        const errors = [];
        const warnings = [];
        const argumentList = [];
        const persistedConfiguration = {};
        for (const definition of definitions) {
          const value = values[definition.id] === true;
          if (value && definition.disabledReason) errors.push({ optionId: definition.id, message: definition.disabledReason });
          if (value) {
            for (const conflictId of definition.conflicts || []) {
              if (values[conflictId] === true && definition.id.localeCompare(conflictId) < 0) {
                errors.push({ optionId: definition.id, relatedOptionId: conflictId, message: `'${definition.label}' conflicts with '${byId.get(conflictId)?.label || conflictId}'.` });
              }
            }
          }
          if (typeof definition.getArguments === "function") {
            const resolved = definition.getArguments(value, Object.assign({}, values));
            for (const argument of Array.isArray(resolved) ? resolved : []) {
              const text = String(argument || "").trim();
              if (text) argumentList.push(text);
            }
          }
          if (definition.persistence === "project" && definition.storagePath) {
            writePath(persistedConfiguration, definition.storagePath, value);
          }
          if (value && definition.warning) warnings.push({ optionId: definition.id, message: String(definition.warning) });
        }
        const resolvedAdvancedArguments = resolveAdvancedArguments(errors, warnings);
        argumentList.push(...resolvedAdvancedArguments);
        return {
          valid: errors.length === 0,
          values: Object.assign({}, values),
          arguments: argumentList,
          advancedArgumentsRaw,
          advancedArguments: resolvedAdvancedArguments,
          persistedConfiguration,
          errors,
          warnings
        };
      }

      definitions.filter((definition) => values[definition.id]).forEach((definition) => enableRequirements(definition.id));
      return {
        definitions,
        providerErrors: options.providerErrors || [],
        getValue: (id) => values[id] === true,
        getAdvancedArgumentsRaw: () => advancedArgumentsRaw,
        resolve,
        setAdvancedArgumentsRaw,
        setValue
      };
    }

    const api = { createSession };
    app.registerModule?.("mavenBuildOptionsSession", api);
    return api;
  }

  global.registerMarkdownViewerMavenBuildOptionsSession = registerMarkdownViewerMavenBuildOptionsSession;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerMavenBuildOptionsSession };
})(typeof window !== "undefined" ? window : globalThis);