/** Renderer-side editing state for Windows-secured AI provider credentials. */
(function(window) {
  "use strict";

  function registerMarkdownViewerAiCredentialSettings(app, deps = {}) {
    const drafts = new WeakMap();

    /** Attach saved-status and explicit-removal behavior to one password input. */
    function attach(input, status, removeButton) {
      if (!input) return;
      drafts.set(input, { credentialId: "", remove: false, status, removeButton });
      input.addEventListener("input", () => {
        const draft = drafts.get(input);
        if (!draft) return;
        if (input.value) draft.remove = false;
        render(input);
      });
      removeButton?.addEventListener("click", () => markForRemoval(input));
      render(input);
    }

    /** Load only the opaque reference; the secret is never read into the renderer. */
    async function hydrate(input, credentialId) {
      const draft = drafts.get(input);
      if (!draft) return;
      input.value = "";
      draft.credentialId = String(credentialId || "");
      draft.remove = false;
      if (draft.credentialId) {
        try {
          const result = await deps.bridge?.credentialExists?.({ credentialId: draft.credentialId });
          if (result?.exists !== true) draft.credentialId = "";
        } catch (_error) {
          // Keep the reference so a temporary Credential Manager failure cannot erase it.
        }
      }
      render(input);
    }

    /** Mark a saved credential for deletion when the settings transaction is committed. */
    function markForRemoval(input) {
      const draft = drafts.get(input);
      if (!draft) return;
      input.value = "";
      draft.remove = !!draft.credentialId;
      render(input);
    }

    /** Persist this input's pending change and return the retained opaque identifier. */
    async function commit(input) {
      const draft = drafts.get(input);
      if (!draft) return "";
      const secret = String(input.value || "");
      if (secret) {
        const result = await deps.bridge.credentialStore({ credentialId: draft.credentialId, secret });
        draft.credentialId = String(result?.credentialId || "");
        draft.remove = false;
        input.value = "";
      } else if (draft.remove && draft.credentialId) {
        await deps.bridge.credentialDelete({ credentialId: draft.credentialId });
        draft.credentialId = "";
        draft.remove = false;
      }
      render(input);
      return draft.credentialId;
    }

    /** Return an unsaved value for connection testing without adding it to settings. */
    function getEphemeralValue(input) {
      return String(input?.value || "");
    }

    /** Restore an input to its saved reference after a cancelled edit. */
    function discard(input) {
      const draft = drafts.get(input);
      if (!draft) return;
      input.value = "";
      draft.remove = false;
      render(input);
    }

    function getCredentialId(input) {
      return String(drafts.get(input)?.credentialId || "");
    }

    /** Capture pending in-memory state without serializing the secret into profile JSON. */
    function snapshot(input) {
      const draft = drafts.get(input);
      return {
        credentialId: String(draft?.credentialId || ""),
        secret: String(input?.value || ""),
        remove: draft?.remove === true
      };
    }

    function render(input) {
      const draft = drafts.get(input);
      if (!draft) return;
      const hasNewValue = !!String(input.value || "");
      const text = hasNewValue
        ? "New credential will be saved securely"
        : draft.remove
          ? "Saved credential will be removed"
          : draft.credentialId
            ? "Credential saved securely"
            : "No credential saved";
      if (draft.status) draft.status.textContent = text;
      if (draft.removeButton) draft.removeButton.hidden = !draft.credentialId || draft.remove;
      input.placeholder = draft.credentialId && !draft.remove ? "Enter a new value to replace" : "";
    }

    const api = { attach, commit, discard, getCredentialId, getEphemeralValue, hydrate, markForRemoval, snapshot };
    app.registerModule?.("aiCompanionCredentialSettings", api);
    return api;
  }

  window.registerMarkdownViewerAiCredentialSettings = registerMarkdownViewerAiCredentialSettings;
})(window);
