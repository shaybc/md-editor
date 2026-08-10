/** Shared primary and additional-provider form state for AI connection settings. */
(function(window) {
  "use strict";

  /**
   * Create the connection-profile form controller.
   * @param {object} options - Form controls and table synchronization callbacks.
   * @returns {object} Operations used by the connection settings orchestrator.
   */
  function createConnectionProfileForm(options) {
    const profileOptions = options;
    const { elements, schema, getProfiles, setProfiles, getProfileReferences, renameProfileReferences, syncAndRender, setStatus, credentialSettings } = options;
    let editingProfileIndex = -1;

    function profileConnectionValues(source = {}) {
      return {
        providerMode: source.providerMode == null ? "openai-compatible" : String(source.providerMode),
        baseUrl: String(source.baseUrl || ""),
        apiKeyCredentialId: String(source.apiKeyCredentialId || ""),
        model: String(source.model || ""),
        providerRequestDelayMs: source.providerRequestDelayMs == null || source.providerRequestDelayMs === "" ? "" : Math.max(0, Math.floor(Number(source.providerRequestDelayMs) || 0)),
        litellmModelAlias: String(source.litellmModelAlias || ""),
        litellmRoutingConfig: String(source.litellmRoutingConfig || ""),
        geminiConnectorBaseUrl: String(source.geminiConnectorBaseUrl || ""),
        geminiConnectorId: String(source.geminiConnectorId || ""),
        geminiConnectorApiKeyCredentialId: String(source.geminiConnectorApiKeyCredentialId || "")
      };
    }

    function readForm() {
      return {
        id: String(elements.profileName?.value || "").trim(),
        ...profileConnectionValues({
        providerMode: elements.providerMode?.value,
        baseUrl: elements.baseUrl?.value,
        apiKeyCredentialId: credentialSettings?.getCredentialId(elements.apiKey),
        model: elements.model?.value,
        providerRequestDelayMs: elements.requestDelay?.value,
        litellmModelAlias: elements.litellmAlias?.value,
        litellmRoutingConfig: elements.litellmRouting?.value,
        geminiConnectorBaseUrl: elements.geminiBaseUrl?.value,
        geminiConnectorId: elements.geminiConnectorId?.value,
          geminiConnectorApiKeyCredentialId: credentialSettings?.getCredentialId(elements.geminiApiKey)
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
      void credentialSettings?.hydrate(elements.apiKey, profile.apiKeyCredentialId);
      if (elements.model) elements.model.value = profile.model;
      if (elements.requestDelay) elements.requestDelay.value = String(profile.providerRequestDelayMs);
      if (elements.litellmAlias) elements.litellmAlias.value = profile.litellmModelAlias;
      if (elements.litellmRouting) elements.litellmRouting.value = profile.litellmRoutingConfig;
      if (elements.geminiBaseUrl) elements.geminiBaseUrl.value = profile.geminiConnectorBaseUrl;
      if (elements.geminiConnectorId) elements.geminiConnectorId.value = profile.geminiConnectorId;
      void credentialSettings?.hydrate(elements.geminiApiKey, profile.geminiConnectorApiKeyCredentialId);
    }

    /** Refresh form actions for the current editing state and entered profile name. */
    function updateActions() {
      const text = elements.profileAdd?.querySelector("span");
      const icon = elements.profileAdd?.querySelector("i");
      const editedProfile = editingProfileIndex >= 0 ? getProfiles()[editingProfileIndex] : null;
      const hasNewName = !!editedProfile && !!String(elements.profileName?.value || "").trim() && String(elements.profileName.value).trim() !== editedProfile.id;
      if (text) text.textContent = editingProfileIndex >= 0 ? "Update profile" : "Add profile";
      if (icon) icon.className = editingProfileIndex >= 0 ? "bi bi-check-lg" : "bi bi-plus-lg";
      if (elements.profileSaveAs) elements.profileSaveAs.hidden = !hasNewName;
      if (elements.profileCancel) elements.profileCancel.hidden = editingProfileIndex < 0;
    }

    function clear() {
      editingProfileIndex = -1;
      writeForm({ providerMode: "", providerRequestDelayMs: "" });
      updateActions();
    }

    function readValidatedEntry(profiles, options = {}) {
      const sourceIndex = Number.isInteger(options.sourceIndex) ? options.sourceIndex : -1;
      const validationIndex = Number.isInteger(options.validationIndex) ? options.validationIndex : sourceIndex;
      const previous = sourceIndex >= 0 ? profiles[sourceIndex] : null;
      const form = readForm();
      const connection = profileConnectionValues(form);
      if (options.saveAs === true) {
        connection.apiKeyCredentialId = "";
        connection.geminiConnectorApiKeyCredentialId = "";
      }
      const requestDelay = Number(connection.providerRequestDelayMs);
      if (!Number.isFinite(requestDelay) || requestDelay < 0 || requestDelay > 60000) throw new Error("Request spacing must be between 0 and 60000 ms.");
      const preliminaryEntry = schema.normalizeProfile({
        ...(previous || {}),
        ...connection,
        id: form.id,
        isPrimary: options.isPrimary === true
      });
      const error = schema.validateEntry("profile", preliminaryEntry, profiles, validationIndex, profiles);
      if (error) throw new Error(error);
      const credentialReferences = profileOptions.captureCredentialDraft?.(form.id, previous, {
        apiKey: credentialSettings?.snapshot(elements.apiKey),
        geminiConnectorApiKey: credentialSettings?.snapshot(elements.geminiApiKey)
      }, { saveAs: options.saveAs === true }) || {};
      const entry = schema.normalizeProfile({ ...preliminaryEntry, ...credentialReferences });
      return { entry, previous };
    }

    function save() {
      try {
        const profiles = getProfiles();
        const previous = editingProfileIndex >= 0 ? profiles[editingProfileIndex] : null;
        const { entry } = readValidatedEntry(profiles, { sourceIndex: editingProfileIndex, isPrimary: previous?.isPrimary === true || (!previous && profiles.length === 0) });
        const nextProfiles = profiles.slice();
        if (editingProfileIndex >= 0) nextProfiles[editingProfileIndex] = entry;
        else nextProfiles.push(entry);
        setProfiles(nextProfiles);
        if (previous?.id && previous.id !== entry.id) renameProfileReferences?.(previous.id, entry.id);
        syncAndRender();
        clear();
        setStatus(`Profile '${entry.id}' ${previous ? "updated" : "added"}. Save settings to persist it.`);
      } catch (error) {
        setStatus(error?.message || String(error), true);
      }
    }

    /** Save the edited connection values as a new non-default profile. */
    function saveAs() {
      try {
        const profiles = getProfiles();
        const original = editingProfileIndex >= 0 ? profiles[editingProfileIndex] : null;
        if (!original) throw new Error("Choose a profile to edit before using Save as.");
        const newName = String(elements.profileName?.value || "").trim();
        if (!newName || newName === original.id) throw new Error("Enter a different profile name before using Save as.");
        const { entry } = readValidatedEntry(profiles, { sourceIndex: editingProfileIndex, validationIndex: -1, isPrimary: false, saveAs: true });
        setProfiles([...profiles, entry]);
        syncAndRender();
        clear();
        setStatus(`Profile '${entry.id}' added from '${original.id}'. Save settings to persist it.`);
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

    /** Remove one staged connection profile when no provider route still references it. */
    function remove(index) {
      const profiles = getProfiles();
      const profile = profiles[index];
      if (!profile) return;
      const references = getProfileReferences?.(profile.id) || [];
      if (references.length) {
        setStatus(`Profile '${profile.id}' is used by provider route${references.length === 1 ? "" : "s"}: ${references.join(", ")}. Delete or update those routes first.`, true);
        return;
      }
      const remaining = profiles.filter((_entry, profileIndex) => profileIndex !== index);
      profileOptions.queueCredentialDeletion?.(profile);
      setProfiles(profile.isPrimary === true && remaining.length
        ? remaining.map((entry, profileIndex) => schema.normalizeProfile({ ...entry, isPrimary: profileIndex === 0 }))
        : remaining);
      if (editingProfileIndex === index) clear();
      else if (editingProfileIndex > index) editingProfileIndex -= 1;
      syncAndRender();
      setStatus(`Profile '${profile.id}' removed. Save settings to persist the change.`);
    }

    function selectDefault(index) {
      const profiles = getProfiles();
      const profile = profiles[index];
      if (!profile) return;
      setProfiles(profiles.map((entry, profileIndex) => schema.normalizeProfile({ ...entry, isPrimary: profileIndex === index })));
      editingProfileIndex = -1;
      clear();
      syncAndRender();
      setStatus(`Profile '${profile.id}' is ready as the default connection. Save settings to persist it.`);
    }

    function refresh() {
      clear();
    }

    /** Import the legacy top-level connection or select the first stored profile as default. */
    function ensureDefaultProfile() {
      const profiles = getProfiles();
      if (profiles.some((profile) => profile.isPrimary === true)) return;
      const currentConnection = readForm();
      const hasCurrentConnection = ["baseUrl", "apiKeyCredentialId", "model", "litellmModelAlias", "geminiConnectorBaseUrl", "geminiConnectorId", "geminiConnectorApiKeyCredentialId"]
        .some((key) => String(currentConnection[key] || "").trim());
      if (hasCurrentConnection) {
        const defaultIndex = profiles.findIndex((profile) => profile.id === "default");
        const defaultProfile = schema.normalizeProfile({ ...currentConnection, id: "default", isPrimary: true });
        setProfiles(defaultIndex >= 0
          ? profiles.map((profile, index) => schema.normalizeProfile(index === defaultIndex ? { ...profile, ...defaultProfile } : { ...profile, isPrimary: false }))
          : [defaultProfile, ...profiles.map((profile) => schema.normalizeProfile({ ...profile, isPrimary: false }))]);
      } else if (profiles.length) {
        setProfiles(profiles.map((profile, index) => schema.normalizeProfile({ ...profile, isPrimary: index === 0 })));
      }
    }

    return Object.freeze({
      refresh,
      ensureDefaultProfile,
      save,
      saveAs,
      updateActions,
      edit,
      remove,
      clear,
      selectDefault,
      isPrimary: (id) => getProfiles().some((profile) => profile.id === id && profile.isPrimary === true),
      getPrimaryConnectionForSave: () => profileConnectionValues(getProfiles().find((profile) => profile.isPrimary === true) || { providerMode: "" })
    });
  }

  window.MarkdownViewerAiConnectionProfileForm = Object.freeze({ create: createConnectionProfileForm });
})(window);
