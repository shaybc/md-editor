/** Bridge-facing extension discovery and configuration operations. */

"use strict";

const { ExtensionFabric } = require("./extension-fabric");
const { ExtensionAuthoringRepository } = require("./extension-authoring-repository");
const { HookSourceCatalog } = require("../hooks/hook-source-catalog");
const { normalizeHookDefinition } = require("../hooks/hook-definition-policy");
const { SkillCatalog } = require("../skills/skill-catalog");
const { skillHooks } = require("../skills/skill-invocation-session");

/** Return redacted extension metadata for the current profile and workspace. */
async function listExtensions(request) {
  const fabric = new ExtensionFabric(request);
  return fabric.load();
}

/** Persist one enable/trust decision and return the refreshed catalog. */
async function configureExtension(request, change) {
  const fabric = new ExtensionFabric(request);
  await fabric.load();
  return fabric.configure({ id: String(change?.id || ""), enabled: change?.enabled, trusted: change?.trusted });
}

function authoring(request) { return new ExtensionAuthoringRepository(request); }
async function readExtension(request, input) { return authoring(request).read(input.scope, input.id); }
async function validateExtension(request, input) { return authoring(request).validate(input.draft); }
async function saveExtension(request, input) { return authoring(request).save(input); }
async function renameExtension(request, input) { return authoring(request).save(input); }
async function duplicateExtension(request, input) { return authoring(request).duplicate(input); }
async function exportExtension(request, input) { return authoring(request).export(input); }
async function trashExtension(request, input) { return authoring(request).trash(input); }
async function listTrashedExtensions(request, input) { return authoring(request).listTrash(input.scope); }
async function restoreExtension(request, input) { return authoring(request).restore(input); }

/** Return read-only lifecycle metadata discovered outside editable settings. */
async function listLifecycleAutomation(request) {
  const fabric = new ExtensionFabric(request);
  await fabric.load();
  const snapshot = await new HookSourceCatalog(request, fabric).load();
  const skillCatalog = new SkillCatalog(request, { fabric });
  await skillCatalog.load(request.activeFile || "");
  const skillDefinitions = [];
  const skillErrors = [];
  for (const entry of skillCatalog.entries.values()) {
    if (!entry.definition?.hooks) continue;
    for (const hook of skillHooks(entry.definition.name, entry.definition.hooks)) {
      try {
        skillDefinitions.push(normalizeHookDefinition(hook, { scope: "skill", trusted: entry.trusted === true, fingerprint: entry.fingerprint }));
      } catch (error) {
        skillErrors.push({ source: entry.id, error: error?.message || String(error) });
      }
    }
  }
  const definitions = [...snapshot.definitions.filter((entry) => entry.source.scope !== "settings" && entry.source.scope !== "run"), ...skillDefinitions];
  return {
    version: 2,
    definitions: definitions.map((entry) => ({
      id: entry.id,
      localId: entry.localId,
      event: entry.event,
      enabled: entry.enabled,
      matcher: entry.matcher,
      actions: entry.actions.map((action) => ({ type: action.type })),
      source: { scope: entry.source.scope, id: entry.source.id, trusted: entry.source.trusted, fingerprint: entry.source.fingerprint },
      validation: "valid",
      readOnly: true
    })),
    errors: [...snapshot.errors, ...skillErrors]
  };
}

module.exports = {
  configureExtension,
  duplicateExtension,
  exportExtension,
  listExtensions,
  listLifecycleAutomation,
  listTrashedExtensions,
  readExtension,
  renameExtension,
  restoreExtension,
  saveExtension,
  trashExtension,
  validateExtension
};
