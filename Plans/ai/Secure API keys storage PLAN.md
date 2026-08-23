# Secure API keys storage

Use Windows Credential Manager as the sole persistent store. API keys will never be written to `localStorage`, profile JSON, settings exports, command-line arguments, or temporary files.

## Security decisions

- Store secrets as Windows Generic Credentials through `CredWriteW`, `CredReadW`, and `CredDeleteW`.
- Use random UUID credential references. Persist only those references in AI Companion settings.
- Allow the renderer to write, delete, and check credentials, but never read them back.
- Resolve credentials internally inside the existing AI Companion Node bridge immediately before provider execution.
- Transfer secrets only through process stdin; never through command arguments.
- Keep password fields empty after loading. Show “Credential saved securely” plus an explicit Remove button.
- Treat an empty field as “unchanged,” not “delete.”
- Fail closed when Credential Manager is unavailable or a referenced credential is missing.
- Do not add migration or legacy plaintext compatibility.

## Implementation plan

### 1. Add a narrowly scoped Windows credential helper

Create a small C# helper dedicated to the `MD-Editor/AI-Companion` credential namespace.

It will:

- Accept one bounded JSON command through stdin.
- Support `write`, `read`, `exists`, and `delete`.
- Validate credential references as UUIDs.
- Restrict target names to `MD-Editor/AI-Companion/<uuid>`.
- Limit secret size to a safe API-key-sized value.
- Store credentials as `CRED_TYPE_GENERIC` for the current Windows user.
- Never write secrets to stdout, stderr, logs, or exceptions except the private `read` response consumed by the bridge.
- Return stable error codes without including secret content.
- Clear unmanaged credential buffers before releasing them.

The helper will be compiled as a small Windows executable and packaged with the desktop resources.

### 2. Add a private credential client to the AI bridge

Add a Node module that invokes the helper with `spawn`/`execFile` and communicates exclusively over pipes.

Its public methods will be:

```text
storeCredential(existingReference, secret) -> reference
readCredential(reference) -> secret
credentialExists(reference) -> boolean
deleteCredential(reference)
```

Only the AI bridge’s internal provider resolver may call `readCredential`.

### 3. Separate persisted settings from runtime provider settings

Replace persisted secret properties:

```text
apiKey
geminiConnectorApiKey
```

with non-secret properties:

```text
apiKeyCredentialRef
geminiConnectorApiKeyCredentialRef
```

This applies to the primary connection and every connection profile.

Before chat, autocomplete, agent, plan, Git summary, or connection testing:

1. Normalize the secret-free persisted settings.
2. Resolve referenced credentials inside the Node bridge.
3. Create an ephemeral settings clone containing `apiKey` and `geminiConnectorApiKey`.
4. Pass that clone into the existing provider and routing code.
5. Release references to the clone when the request finishes.

Provider request construction and authentication formats will remain unchanged.

### 4. Add safe credential editing behavior

Introduce a focused renderer-side credential controller used by both the primary connection form and profile editor.

On load:

- Leave the password input empty.
- Query only whether the credential exists.
- Show a saved/missing status.
- Never retrieve the secret into the renderer.

On save:

- Non-empty input: store or replace the Windows credential, then persist its returned reference.
- Empty unchanged input: retain the existing reference.
- Explicit Remove: delete the credential first, then clear the reference.
- Credential Manager failure: stop the settings save and preserve the previous configuration.

Changing provider presets will explicitly mark the previous provider credential for removal so credentials cannot be silently reused across providers.

### 5. Protect credential references

Credential references are not secrets, but they are security-sensitive capability identifiers.

- Exclude them from portable settings exports.
- Ignore them during settings import.
- Redact them from AI-accessible preference reads and exports.
- Reject attempts by AI preference tools to set, import, or reset credential-reference paths.
- Never expose a bridge action that returns credential plaintext to the renderer or model.

### 6. Wire credential lifecycle operations

- Creating a profile: create credentials only when the user supplies them.
- Editing or renaming a profile: retain its existing random reference.
- Save As: create a new reference; do not copy the existing secret automatically.
- Deleting a profile: delete both associated Windows credentials.
- Resetting AI Companion settings: delete referenced credentials before clearing settings.
- Closing the settings dialog without saving: discard typed values from the inputs.
- Testing an unsaved credential: send it ephemerally to the bridge through stdin without persisting it.

### 7. Package the helper

Add a dedicated build step that:

- Compiles the Windows credential helper.
- Places its executable in the packaged bridge resources.
- Fails the desktop build if the helper cannot be produced.
- Includes no cross-platform branches because MD-Editor is Windows-only.

### 8. Verification gates

The implementation is complete when:

- A sentinel API key cannot be found in `localStorage`, the profile JSON, settings exports, temporary launch files, process arguments, or debug logs.
- Windows Credential Manager contains the corresponding MD-Editor generic credential.
- Restarting MD-Editor preserves provider access without repopulating the password input.
- Credential replacement and deletion work for primary and additional connection profiles.
- Missing or inaccessible credentials produce a clear error and no unauthenticated provider request.
- Existing OpenAI, Gemini, Anthropic, xAI, LiteLLM, Ollama, autocomplete, routing, and connector behavior remains unchanged.

## Expected files to change:

New native helper files:

- [WindowsCredentialHelper.csproj](C:/GitHub/shaybc/md-editor/desktop-app/native/windows-credential-helper/WindowsCredentialHelper.csproj)
- [Program.cs](C:/GitHub/shaybc/md-editor/desktop-app/native/windows-credential-helper/Program.cs)
- [CredentialCommand.cs](C:/GitHub/shaybc/md-editor/desktop-app/native/windows-credential-helper/CredentialCommand.cs)
- [WindowsCredentialStore.cs](C:/GitHub/shaybc/md-editor/desktop-app/native/windows-credential-helper/WindowsCredentialStore.cs)
- [build-windows-credential-helper.js](C:/GitHub/shaybc/md-editor/desktop-app/build-windows-credential-helper.js)

New credential-boundary modules:

- [windows-credential-client.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/security/windows-credential-client.js)
- [provider-credential-resolver.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/security/provider-credential-resolver.js)
- [credential-settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/credential-settings.js)

Existing files:

- [package.json](C:/GitHub/shaybc/md-editor/desktop-app/package.json) — build and package the helper.
- [index.html](C:/GitHub/shaybc/md-editor/desktop-app/resources/index.html) — credential status and removal controls; load the new module.
- [script.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/script.js) — coordinate asynchronous credential saving with the settings dialog.
- [neutralino-ai-bridge.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/neutralino-ai-bridge.js) — expose write/delete/status operations without a renderer read operation.
- [ai-companion-bridge.cjs](C:/GitHub/shaybc/md-editor/desktop-app/resources/bridges/ai-companion-bridge/ai-companion-bridge.cjs) — handle credential operations and resolve credentials for provider requests.
- [settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings.js) — replace persisted secrets with references.
- [defaults.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/ai-companion/config/defaults.js) — normalize the secret-free runtime configuration.
- [connection-entry-schema.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/connection-entry-schema.js) — permit references and reject plaintext fields.
- [connection-profile-form.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/connection-profile-form.js) — keep credential inputs separate from profile serialization.
- [connection-settings.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/connection-settings.js) — manage profile credential lifecycle.
- [settings-transfer.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ui/settings-transfer.js) — exclude and ignore credential references.
- [settings-tools.js](C:/GitHub/shaybc/md-editor/desktop-app/resources/js/ai-companion/settings-tools.js) — block AI access and mutation.
- [01-settings-and-models.md](C:/GitHub/shaybc/md-editor/desktop-app/help/user/08-ai-companion/01-settings-and-models.md) — document Windows-secured credential behavior.

## Intentionally unchanged

- Provider-specific authentication header construction.
- Provider routing, model selection, rate limiting, prompts, and agent behavior.
- API Client secret storage, which is outside this request.
- Cross-platform credential implementations.
- Migration or backward compatibility for plaintext AI Companion keys.
- Unrelated application settings and profile persistence.