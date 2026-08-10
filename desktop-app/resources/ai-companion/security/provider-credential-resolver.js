/** Resolve persisted credential references into request-scoped provider settings. */

"use strict";

const CREDENTIAL_FIELDS = Object.freeze([
  Object.freeze({ reference: "apiKeyCredentialId", runtime: "apiKey" }),
  Object.freeze({ reference: "geminiConnectorApiKeyCredentialId", runtime: "geminiConnectorApiKey" })
]);

/**
 * Build an ephemeral settings clone containing provider secrets for one backend request.
 * @param {object} settings Secret-free normalized AI Companion settings.
 * @param {object} credentialClient Backend-only Windows credential client.
 * @param {object} ephemeralCredentials Unsaved values sent through bridge stdin for testing only.
 * @returns {Promise<object>} Request-scoped provider settings.
 */
async function resolveProviderCredentials(settings, credentialClient, ephemeralCredentials = {}) {
  const resolved = clone(settings || {});
  await resolveCredentialFields(resolved, credentialClient, ephemeralCredentials);
  const profileOverrides = ephemeralCredentials.profiles && typeof ephemeralCredentials.profiles === "object"
    ? ephemeralCredentials.profiles : {};
  resolved.connectionProfiles = await Promise.all((resolved.connectionProfiles || []).map(async (profile) => {
    const copy = clone(profile);
    await resolveCredentialFields(copy, credentialClient, profileOverrides[copy.id] || {});
    return copy;
  }));
  return resolved;
}

async function resolveCredentialFields(target, credentialClient, ephemeral = {}) {
  for (const field of CREDENTIAL_FIELDS) {
    const transient = String(ephemeral[field.runtime] || "");
    const credentialId = String(target[field.reference] || "");
    delete target[field.reference];
    delete target[field.runtime];
    if (transient) target[field.runtime] = transient;
    else if (credentialId) target[field.runtime] = await credentialClient.readCredential(credentialId);
  }
}

function clone(value) {
  return JSON.parse(JSON.stringify(value || {}));
}

module.exports = { CREDENTIAL_FIELDS, resolveProviderCredentials };
