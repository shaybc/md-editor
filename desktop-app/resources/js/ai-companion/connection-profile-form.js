/** Shared primary and additional-provider form state for AI connection settings. */
(function(window) {
  "use strict";

  /**
   * Create the connection-profile form controller.
   * @param {object} options - Form controls and table synchronization callbacks.
   * @returns {object} Operations used by the connection settings orchestrator.
   */
  function createConnectionProfileForm(options) {
    const { elements, schema, getProfiles, setProfiles, renameProfileReferences, syncAndRender, setStatus } = options;
    let editingProfileIndex = -1;
    let primaryProfileId = "";
    let primaryConnectionDraft = {};

    function profileConnectionValues(source = {}) {
      return {
        providerMode: String(source.providerMode || "openai-compatible"),
        baseUrl: String(source.baseUrl || ""),
        apiKey: String(source.apiKey || ""),
        model: String(source.model || ""),
        providerRequestDelayMs: source.providerRequestDelayMs == null || source.providerRequestDelayMs === "" ? "" : Math.max(0, Math.floor(Number(source.providerRequestDelayMs) || 0)),
        litellmModelAlias: String(source.litellmModelAlias || ""),
        litellmRoutingConfig: String(source.litellmRoutingConfig || ""),
        geminiConnectorBaseUrl: String(source.geminiConnectorBaseUrl || ""),
        geminiConnectorId: String(source.geminiConnectorId || ""),
        geminiConnectorApiKey: String(source.geminiConnectorApiKey || "")
      };
    }

    function readForm() {
      return {
        id: String(elements.profileName?.value || "").trim(),
        ...profileConnectionValues({
        providerMode: elements.providerMode?.value,
        baseUrl: elements.baseUrl?.value,
        apiKey: elements.apiKey?.value,
        model: elements.model?.value,
        providerRequestDelayMs: elements.requestDelay?.value,
        litellmModelAlias: elements.litellmAlias?.value,
        litellmRoutingConfig: elements.litellmRouting?.value,
        geminiConnectorBaseUrl: elements.geminiBaseUrl?.value,
        geminiConnectorId: elements.geminiConnectorId?.value,
          geminiConnectorApiKey: elements.geminiApiKey?.value
        })
      };
    }

    function writeForm(source = {}) {
      const profile = profileConnectionValues(source);
      if (elements.profileName) elements.profileName.value = String(source.id || "");
      if (elements.providerMode) {
        elements.providerMode.value = profile.providerMode;
        elements.providerMode.dispatchEvent(new Event("change", { bubbles: true }));
      }
      if (elements.baseUrl) elements.baseUrl.value = profile.baseUrl;
      if (elements.apiKey) elements.apiKey.value = profile.apiKey;
      if (elements.model) elements.model.value = profile.model;
      if (elements.requestDelay) elements.requestDelay.value = String(profile.providerRequestDelayMs);
      if (elements.litellmAlias) elements.litellmAlias.value = profile.litellmModelAlias;
      if (elements.litellmRouting) elements.litellmRouting.value = profile.litellmRoutingConfig;
      if (elements.geminiBaseUrl) elements.geminiBaseUrl.value = profile.geminiConnectorBaseUrl;
      if (elements.geminiConnectorId) elements.geminiConnectorId.value = profile.geminiConnectorId;
      if (elements.geminiApiKey) elements.geminiApiKey.value = profile.geminiConnectorApiKey;
    }

    function updateActions() {
      const text = elements.profileAdd?.querySelector("span");
      const icon = elements.profileAdd?.querySelector("i");
      if (text) text.textContent = editingProfileIndex >= 0 ? "Update profile" : "Add profile";
      if (icon) icon.className = editingProfileIndex >= 0 ? "bi bi-check-lg" : "bi bi-plus-lg";
      if (elements.profileCancel) elements.profileCancel.hidden = editingProfileIndex < 0;
    }

    function clear() {
      editingProfileIndex = -1;
      writeForm({ providerMode: "openai-compatible", providerRequestDelayMs: "" });
      updateActions();
    }

    function save() {
      try {
        const profiles = getProfiles();
        const form = readForm();
        const connection = profileConnectionValues(form);
        const requestDelay = Number(connection.providerRequestDelayMs);
        if (!Number.isFinite(requestDelay) || requestDelay < 0 || requestDelay > 60000) throw new Error("Request spacing must be between 0 and 60000 ms.");
        const previous = editingProfileIndex >= 0 ? profiles[editingProfileIndex] : null;
        const wasPrimary = previous?.id === primaryProfileId;
        const entry = schema.normalizeProfile({
          ...(previous || {}),
          ...connection,
          id: form.id,
          isPrimary: wasPrimary
        });
        const error = schema.validateEntry("profile", entry, profiles, editingProfileIndex, profiles);
        if (error) throw new Error(error);
        const nextProfiles = profiles.slice();
        if (editingProfileIndex >= 0) nextProfiles[editingProfileIndex] = entry;
        else nextProfiles.push(entry);
        setProfiles(nextProfiles);
        if (previous?.id && previous.id !== entry.id) renameProfileReferences?.(previous.id, entry.id);
        if (wasPrimary) {
          primaryProfileId = entry.id;
          primaryConnectionDraft = profileConnectionValues(entry);
        }
        syncAndRender();
        clear();
        setStatus(`Profile '${entry.id}' ${previous ? "updated" : "added"}. Save settings to persist it.`);
      } catch (error) {
        setStatus(error?.message || String(error), true);
      }
    }

    function edit(index) {
      const profile = getProfiles()[index];
      if (!profile) return;
      editingProfileIndex = index;
      writeForm(profile);
      updateActions();
      elements.providerMode?.closest(".settings-subsection")?.scrollIntoView?.({ block: "start", behavior: "smooth" });
      setStatus(`Editing profile '${profile.id}'.`);
    }

    function selectPrimary(index) {
      const profiles = getProfiles();
      const profile = profiles[index];
      if (!profile) return;
      setProfiles(profiles.map((entry, profileIndex) => schema.normalizeProfile({ ...entry, isPrimary: profileIndex === index })));
      primaryProfileId = profile.id;
      primaryConnectionDraft = profileConnectionValues(profile);
      editingProfileIndex = -1;
      writeForm(profile);
      updateActions();
      syncAndRender();
      setStatus(`Profile '${profile.id}' is ready as the primary connection. Save settings to persist it.`);
    }

    function refresh() {
      const currentPrimary = profileConnectionValues(readForm());
      const markedPrimary = getProfiles().find((profile) => profile.isPrimary === true);
      primaryProfileId = markedPrimary?.id || "";
      primaryConnectionDraft = markedPrimary ? profileConnectionValues(markedPrimary) : currentPrimary;
      if (markedPrimary) writeForm(markedPrimary);
      editingProfileIndex = -1;
      updateActions();
    }

    return Object.freeze({
      refresh,
      save,
      edit,
      clear,
      selectPrimary,
      isPrimary: (id) => id === primaryProfileId,
      getPrimaryConnectionForSave: () => ({ ...primaryConnectionDraft })
    });
  }

  window.MarkdownViewerAiConnectionProfileForm = Object.freeze({ create: createConnectionProfileForm });
})(window);
