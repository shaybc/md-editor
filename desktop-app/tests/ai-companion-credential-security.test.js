const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const { normalizeAiCompanionSettings } = require("../resources/ai-companion/config/defaults");
const { resolveProviderCredentials } = require("../resources/ai-companion/security/provider-credential-resolver");
const { WindowsCredentialClient } = require("../resources/ai-companion/security/windows-credential-client");

test("persisted AI settings drop plaintext credentials and retain only opaque IDs", () => {
  const credentialId = crypto.randomUUID();
  const settings = normalizeAiCompanionSettings({
    apiKey: "must-not-persist",
    apiKeyCredentialId: credentialId,
    geminiConnectorApiKey: "must-not-persist",
    connectionProfiles: [{ id: "secondary", apiKey: "must-not-persist", apiKeyCredentialId: credentialId }]
  });

  assert.equal(settings.apiKey, undefined);
  assert.equal(settings.geminiConnectorApiKey, undefined);
  assert.equal(settings.apiKeyCredentialId, credentialId);
  assert.equal(settings.connectionProfiles[0].apiKey, undefined);
  assert.equal(settings.connectionProfiles[0].apiKeyCredentialId, credentialId);
  assert.equal(JSON.stringify(settings).includes("must-not-persist"), false);
});

test("provider credentials are resolved per request without retaining references", async () => {
  const primaryId = crypto.randomUUID();
  const profileId = crypto.randomUUID();
  const reads = [];
  const client = {
    async readCredential(credentialId) {
      reads.push(credentialId);
      return credentialId === primaryId ? "primary-secret" : "profile-secret";
    }
  };
  const persisted = {
    apiKeyCredentialId: primaryId,
    connectionProfiles: [{ id: "secondary", apiKeyCredentialId: profileId }]
  };

  const first = await resolveProviderCredentials(persisted, client);
  const second = await resolveProviderCredentials(persisted, client, { apiKey: "ephemeral-secret" });

  assert.equal(first.apiKey, "primary-secret");
  assert.equal(first.apiKeyCredentialId, undefined);
  assert.equal(first.connectionProfiles[0].apiKey, "profile-secret");
  assert.equal(first.connectionProfiles[0].apiKeyCredentialId, undefined);
  assert.equal(second.apiKey, "ephemeral-secret");
  assert.equal(reads.filter((id) => id === primaryId).length, 1, "ephemeral override skips the saved primary read");
  assert.equal(reads.filter((id) => id === profileId).length, 2, "profile credentials are read again for each request");
  assert.equal(JSON.stringify(persisted).includes("secret"), false);
});

const helperPath = path.join(__dirname, "..", "resources", "bridges", "windows-credential-helper", "windows-credential-helper.exe");
test("Windows credential helper writes, reads, replaces, checks, and deletes a namespaced credential", { skip: !fs.existsSync(helperPath) }, async () => {
  const client = new WindowsCredentialClient({ executablePath: helperPath });
  let credentialId = "";
  try {
    credentialId = await client.storeCredential("", "test-secret-one");
    assert.match(credentialId, /^[0-9a-f-]{36}$/);
    assert.equal(await client.credentialExists(credentialId), true);
    assert.equal(await client.readCredential(credentialId), "test-secret-one");
    assert.equal(await client.storeCredential(credentialId, "test-secret-two"), credentialId);
    assert.equal(await client.readCredential(credentialId), "test-secret-two");
    assert.equal(await client.deleteCredential(credentialId), true);
    assert.equal(await client.credentialExists(credentialId), false);
    await assert.rejects(client.readCredential(credentialId), { code: "CREDENTIAL_NOT_FOUND" });
    assert.equal(await client.deleteCredential(credentialId), true, "deleting an already missing credential succeeds");
    await assert.rejects(client.credentialExists("not-a-uuid"), { code: "INVALID_CREDENTIAL_ID" });
    await assert.rejects(client.storeCredential("", "x".repeat(2561)), { code: "INVALID_SECRET_SIZE" });
  } finally {
    if (credentialId) await client.deleteCredential(credentialId).catch(() => {});
    client.close();
  }
});

test("renderer bridge exposes no credential read operation", () => {
  const source = fs.readFileSync(path.join(__dirname, "..", "resources", "js", "ai-companion", "neutralino-ai-bridge.js"), "utf8");
  assert.match(source, /credentialStore/);
  assert.match(source, /credentialExists/);
  assert.match(source, /credentialDelete/);
  assert.doesNotMatch(source, /credentialRead|readCredential/);
});
