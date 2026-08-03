(function(global) {
  "use strict";

  /** Compose the complete Apache RAT policy preview from focused planners. */
  function registerMarkdownViewerRatPolicyChangePlanner(app, deps = {}) {
    const filesystem = () => (deps.Neutralino || global.Neutralino)?.filesystem;

    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function joinWorkspacePath(root, path) {
      const candidate = normalizePath(path);
      if (/^(?:[A-Za-z]:\/|\/)/.test(candidate)) return requireWorkspacePath(root, candidate);
      const parts = `${normalizePath(root)}/${candidate}`.split("/");
      const resolved = [];
      for (const part of parts) {
        if (!part || part === ".") continue;
        if (part === "..") resolved.pop();
        else resolved.push(part);
      }
      const drive = normalizePath(root).match(/^[A-Za-z]:/)?.[0] || "";
      const absolute = drive ? `${drive}/${resolved.slice(1).join("/")}` : `/${resolved.join("/")}`;
      return requireWorkspacePath(root, absolute);
    }

    function requireWorkspacePath(root, path) {
      const base = normalizePath(root).toLowerCase();
      const target = normalizePath(path);
      const key = target.toLowerCase();
      if (!base || (key !== base && !key.startsWith(`${base}/`))) throw new Error("RAT policy files must stay inside the opened workspace.");
      return target;
    }

    function relativePath(root, path) {
      const base = normalizePath(root);
      const target = normalizePath(path);
      return target.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? target.slice(base.length + 1) : target;
    }

    async function readOptional(path) {
      const snapshot = deps.tabs?.getExternalDocumentSnapshot?.(path);
      if (snapshot) return { exists: true, content: snapshot.content, snapshot };
      try {
        return {
          exists: true,
          content: await filesystem().readFile(path),
          snapshot: { path, isOpen: false, isDirty: false }
        };
      } catch (_error) {
        return { exists: false, content: "", snapshot: { path, isOpen: false, isDirty: false } };
      }
    }

    async function readRequired(path) {
      const result = await readOptional(path);
      if (!result.exists) throw new Error(`The selected policy file does not exist: ${path}`);
      return result;
    }

    function pushChange(changes, path, before, after) {
      if (before.content === after) return;
      changes.push({
        type: before.exists ? "modify" : "create",
        path,
        beforeContent: before.content,
        afterContent: after,
        snapshot: before.snapshot
      });
    }

    async function fetchTemplateContent(id) {
      const entry = await deps.referenceCatalog.getTemplate(id);
      if (!entry) throw new Error(`The offline policy template '${id}' is unavailable.`);
      const response = await (deps.fetch || global.fetch)(entry.path);
      if (!response.ok) throw new Error(`The offline policy template '${id}' could not be read.`);
      return response.text();
    }

    /** Build a transactional, unsaved policy change plan. */
    async function plan(inventory, draft) {
      const validation = deps.validator.validate(draft, inventory);
      if (!validation.valid) throw new Error(validation.errors.join("\n"));
      const changes = [];
      const pomPath = requireWorkspacePath(inventory.projectPath, draft.targetPomPath);
      const pom = await readRequired(pomPath);
      let pomAfter = deps.pomEditPlanner.plan(pom.content, draft, inventory);

      if (draft.useExternalConfiguration) {
        const configPath = joinWorkspacePath(inventory.projectPath, draft.externalConfigurationPath);
        const config = await readOptional(configPath);
        if (!config.exists) pushChange(changes, configPath, config, deps.ratConfigPlanner.create(draft));
        const relative = relativePath(inventory.module.projectRoot, configPath);
        if (!pomAfter.includes(`<config>${relative}</config>`)) {
          pomAfter = deps.xmlEditPlanner.appendConfigurationElement(pomAfter, `<configs><config>${relative}</config></configs>`);
        }
      } else if (draft.customLicenses.length) {
        throw new Error("Custom policy definitions require the external RAT configuration option in this release.");
      }

      if (draft.useExclusionFile) {
        const exclusionPath = joinWorkspacePath(inventory.projectPath, draft.exclusionFilePath);
        const exclusions = await readOptional(exclusionPath);
        const exclusionAfter = deps.exclusionPlanner.create(draft.exclusions);
        pushChange(changes, exclusionPath, exclusions, exclusionAfter);
        const relative = relativePath(inventory.module.projectRoot, exclusionPath);
        if (!pomAfter.includes(`<inputExcludeFile>${relative}</inputExcludeFile>`)) {
          pomAfter = deps.xmlEditPlanner.addExcludeFile(pomAfter, relative);
        }
      } else {
        draft.exclusions.forEach((pattern) => {
          if (!pomAfter.includes(`>${pattern}</`)) {
            pomAfter = deps.xmlEditPlanner.addExclude(pomAfter, pattern, { legacy: !inventory.capabilities.supportsConfigFiles });
          }
        });
      }

      if (draft.skip && !/<skip>\s*true\s*<\/skip>/i.test(pomAfter)) pomAfter = deps.xmlEditPlanner.addSkip(pomAfter);
      pushChange(changes, pomPath, pom, pomAfter);

      for (const target of draft.headerTargets || []) {
        if (!target.authorized) throw new Error(`Authorization is required before adding a header to ${target.path}.`);
        const path = requireWorkspacePath(inventory.projectPath, target.path);
        const source = await readRequired(path);
        pushChange(changes, path, source, deps.headerPlanner.add(source.content, target.header, target.extension));
      }

      if (draft.createLicenseFile && !inventory.documents.some((entry) => /^LICENSE(?:\.|$)/i.test(entry.name))) {
        const licensePath = joinWorkspacePath(inventory.projectPath, "LICENSE");
        const license = await readOptional(licensePath);
        const templateId = draft.projectLicense === "Apache-2.0" ? "apache-2.0-license" : "";
        if (!templateId) throw new Error("An offline full-text LICENSE template is not bundled for the selected license. Open the project license guidance and add reviewed text manually.");
        pushChange(changes, licensePath, license, await fetchTemplateContent(templateId));
      }

      if (draft.documentation.createThirdPartyInventory && !inventory.documents.some((entry) => entry.name === "THIRD-PARTY.md")) {
        const thirdPartyPath = joinWorkspacePath(inventory.projectPath, "THIRD-PARTY.md");
        const thirdParty = await readOptional(thirdPartyPath);
        pushChange(changes, thirdPartyPath, thirdParty, await fetchTemplateContent("third-party-inventory"));
      }

      return {
        title: "Configure Apache RAT project policy",
        expectedEffect: "establishes-policy",
        changes,
        warnings: validation.warnings,
        summary: {
          license: draft.projectLicense,
          pomPath,
          pluginVersion: draft.pluginVersion,
          bindsToVerify: draft.bindToVerify,
          affectedFiles: changes.length,
          affectedModules: draft.includeSubprojects ? "Current module and inherited children" : "Current module"
        }
      };
    }

    const api = { plan, requireWorkspacePath };
    app?.registerModule?.("ratPolicyChangePlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyChangePlanner = registerMarkdownViewerRatPolicyChangePlanner;
})(typeof window !== "undefined" ? window : globalThis);
