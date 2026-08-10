/**
 * AI Companion settings tools backed by md-editor preference state.
 */
(function(window) {
  "use strict";

  const SECRET_KEY_PATTERN = /(apiKey|api_key|token|secret|password|credential)/i;
  const DEFAULT_PAGE_ENTRIES = 25;
  const MAX_PAGE_ENTRIES = 100;
  const MAX_SEARCH_SCAN_ENTRIES = 200;
  const DEFAULT_READ_DEPTH = 1;
  const MAX_READ_DEPTH = 4;
  const MAX_PATH_SEGMENTS = 32;
  const MAX_RESULT_BYTES = 96 * 1024;
  const CURSOR_VERSION = 1;
  const MAX_TOOL_VALUE_DEPTH = 4;
  const CIRCULAR_VALUE_MARKER = "[circular]";
  const TRUNCATED_VALUE_MARKER = "[truncated]";
  const PREFERENCE_METADATA = Object.freeze({
    theme: { category: "themes", label: "Theme mode" },
    editorFontFamily: { category: "editor", label: "Editor font family" },
    editorFontSize: { category: "editor", label: "Editor font size" },
    wordWrapEnabled: { category: "editor", label: "Word wrap" },
    fileOpeningModes: { category: "interface", label: "File opening modes" },
    startupBehavior: { category: "folder-view", label: "Startup behavior" },
    restoreLastFolderOnStartup: { category: "folder-view", label: "Restore last folder on startup" },
    graphAutoClusterThreshold: { category: "graph", label: "Graph auto-clustering threshold" },
    graphRenderWarningThreshold: { category: "graph", label: "Graph render warning threshold" },
    aiCompanionSettings: { category: "ai-companion", label: "AI Companion settings" },
    apiClientRequestSettings: { category: "api-client", label: "API Client request settings" },
    confirmDeleteFiles: { category: "confirmations", label: "Confirm before deleting files" },
    confirmMoveFiles: { category: "confirmations", label: "Confirm before moving or copying files" },
    confirmOpenManyGraphNodes: { category: "confirmations", label: "Confirm before opening many graph nodes" },
    confirmResetState: { category: "confirmations", label: "Confirm before resetting state" },
    debugEnabled: { category: "debug", label: "Debug logging" },
    codeConverterGradleMode: { category: "gradle", label: "Gradle mode" },
    codeConverterGradleOffline: { category: "gradle", label: "Gradle offline mode" },
    mavenExecutionMode: { category: "maven", label: "Maven execution mode" },
    mavenExecutablePath: { category: "maven", label: "Custom Maven executable" },
    mavenSettingsFilePath: { category: "maven", label: "Maven user settings file" },
    mavenOffline: { category: "maven", label: "Maven offline mode" },
    mavenLocalRepositoryPath: { category: "maven", label: "Maven local repository" },
    codeConverterJavaJdks: { category: "jdks", label: "Configured JDKs" }
  });

  function registerMarkdownViewerAiCompanionSettingsTools(app, deps = {}) {
    function asObject(value) {
      return value && typeof value === "object" && !Array.isArray(value) ? value : {};
    }

    function clone(value) {
      if (value === undefined) return undefined;
      return JSON.parse(JSON.stringify(value));
    }

    function getDefaultState() {
      return asObject(deps.getDefaultGlobalState?.());
    }

    function getSavedState() {
      return asObject(deps.loadGlobalState?.());
    }

    function getEffectiveState() {
      return Object.assign({}, getDefaultState(), getSavedState());
    }

    function getAiCompanionDefaults() {
      return asObject(deps.aiCompanionSettings?.defaults);
    }

    function getEffectiveTopValue(key) {
      if (key === "aiCompanionSettings" && typeof deps.aiCompanionSettings?.normalize === "function") {
        return deps.aiCompanionSettings.normalize(getSavedState().aiCompanionSettings || getAiCompanionDefaults());
      }
      const saved = getSavedState();
      if (Object.prototype.hasOwnProperty.call(saved, key)) return saved[key];
      return getDefaultState()[key];
    }

    function getDefaultTopValue(key) {
      if (key === "aiCompanionSettings" && typeof deps.aiCompanionSettings?.normalize === "function") {
        return deps.aiCompanionSettings.normalize(getAiCompanionDefaults());
      }
      return getDefaultState()[key];
    }

    function splitPreferencePath(key, maxParts = 2) {
      const parts = Array.isArray(key)
        ? key.map((part) => String(part || "").trim()).filter(Boolean)
        : String(key || "").split(".").map((part) => part.trim()).filter(Boolean);
      if (!parts.length || parts.length > maxParts) throw new Error("Preference key must be a known path within the configured depth limit.");
      return parts;
    }

    function getKnownNestedDefaults(topKey) {
      if (topKey === "aiCompanionSettings") return getAiCompanionDefaults();
      return asObject(getDefaultState()[topKey]);
    }

    /**
     * For a bare (single-segment) key that does not resolve at the top level,
     * find full paths where a known namespace has a child leaf of that name — e.g.
     * "chatStatefulControllerEnabled" -> "aiCompanionSettings.chatStatefulControllerEnabled".
     * Used to suggest (never auto-apply) a correction back to the model.
     * @returns {string[]} candidate full paths (usually zero or one).
     */
    function findPreferenceKeySuggestions(key) {
      const parts = Array.isArray(key)
        ? key.map((part) => String(part || "").trim()).filter(Boolean)
        : String(key || "").split(".").map((part) => part.trim()).filter(Boolean);
      if (parts.length !== 1) return [];
      const bare = parts[0];
      const suggestions = [];
      for (const topKey of Object.keys(getDefaultState())) {
        const nested = getKnownNestedDefaults(topKey);
        if (nested && typeof nested === "object" && Object.prototype.hasOwnProperty.call(nested, bare)) {
          suggestions.push(`${topKey}.${bare}`);
        }
      }
      return suggestions;
    }

    function assertKnownPreferencePath(key) {
      const parts = splitPreferencePath(key);
      const defaults = getDefaultState();
      if (!Object.prototype.hasOwnProperty.call(defaults, parts[0])) {
        const error = new Error(`Unknown preference key: ${Array.isArray(key) ? key.join(".") : key}`);
        error.code = "unknown-preference";
        error.path = parts;
        throw error;
      }
      if (parts.length === 2) {
        const nestedDefaults = getKnownNestedDefaults(parts[0]);
        if (!Object.prototype.hasOwnProperty.call(nestedDefaults, parts[1])) {
          const error = new Error(`Unknown preference key: ${Array.isArray(key) ? key.join(".") : key}`);
          error.code = "unknown-preference";
          error.path = parts;
          throw error;
        }
      }
      return parts;
    }

    function getPreferencePathValue(stateResolver, key) {
      const parts = assertKnownPreferencePath(key);
      const topValue = stateResolver(parts[0]);
      return parts.length === 1 ? topValue : asObject(topValue)[parts[1]];
    }

    function getValueAtPath(stateResolver, path) {
      const parts = splitPreferencePath(path, MAX_READ_DEPTH + 1);
      let value = stateResolver(parts[0]);
      for (let index = 1; index < parts.length; index++) {
        if (value == null || typeof value !== "object" || !Object.prototype.hasOwnProperty.call(value, parts[index])) {
          const error = new Error(`Unknown preference key: ${parts.join(".")}`);
          error.code = "unknown-preference";
          error.path = parts;
          throw error;
        }
        value = value[parts[index]];
      }
      return value;
    }

    function isPlainObject(value) {
      return value && typeof value === "object" && !Array.isArray(value);
    }

    /**
     * Copy one preference value into a bounded, JSON-safe tool result.
     * Runtime settings may contain cyclic or unusually deep objects even though persisted
     * preferences are JSON. Tool reads must remain inspectable without overflowing the
     * bridge or recursively walking an unbounded value.
     * @param {string} key - Preference path used for secret detection.
     * @param {*} value - Runtime preference value to expose.
     * @param {boolean} redactSecrets - Whether secret-like paths should be redacted.
     * @returns {*} A JSON-safe copy suitable for an AI tool result.
     */
    function copyToolValue(key, value, redactSecrets, maxDepth = MAX_TOOL_VALUE_DEPTH) {
      if (redactSecrets && isSecretPreferencePath(key)) return value ? "[redacted]" : "";
      if (!Array.isArray(value) && !isPlainObject(value)) return value;

      const root = Array.isArray(value) ? [] : {};
      const seen = new WeakSet([value]);
      const pending = [{ source: value, target: root, path: key, depth: 0 }];

      while (pending.length) {
        const current = pending.pop();
        Object.keys(current.source).forEach((childKey) => {
          const childPath = current.path ? `${current.path}.${childKey}` : childKey;
          const childValue = current.source[childKey];
          if (redactSecrets && isSecretPreferencePath(childPath)) {
            current.target[childKey] = childValue ? "[redacted]" : "";
            return;
          }
          if (!Array.isArray(childValue) && !isPlainObject(childValue)) {
            current.target[childKey] = childValue;
            return;
          }
          if (seen.has(childValue)) {
            current.target[childKey] = CIRCULAR_VALUE_MARKER;
            return;
          }
          if (current.depth >= maxDepth) {
            current.target[childKey] = TRUNCATED_VALUE_MARKER;
            return;
          }
          const childTarget = Array.isArray(childValue) ? [] : {};
          current.target[childKey] = childTarget;
          seen.add(childValue);
          pending.push({ source: childValue, target: childTarget, path: childPath, depth: current.depth + 1 });
        });
      }

      return root;
    }

    // Coerce a string value to the preference's declared type. Some providers (e.g.
    // Gemini) cannot express a polymorphic value and send booleans/numbers as strings;
    // this lets those round-trip. No-op when the value already matches the type.
    function coercePreferenceValue(key, value) {
      if (typeof value !== "string") return value;
      const defaultValue = getPreferencePathValue(getDefaultTopValue, key);
      if (typeof defaultValue === "boolean") {
        const lowered = value.trim().toLowerCase();
        if (lowered === "true") return true;
        if (lowered === "false") return false;
        return value;
      }
      if (typeof defaultValue === "number") {
        const asNumber = Number(value);
        return value.trim() !== "" && Number.isFinite(asNumber) ? asNumber : value;
      }
      return value;
    }

    function validateValueType(key, nextValue) {
      const defaultValue = getPreferencePathValue(getDefaultTopValue, key);
      if (Array.isArray(defaultValue)) {
        if (!Array.isArray(nextValue)) throw new Error(`Preference ${key} expects an array value.`);
        return;
      }
      if (isPlainObject(defaultValue)) {
        if (!isPlainObject(nextValue)) throw new Error(`Preference ${key} expects an object value.`);
        return;
      }
      if (typeof defaultValue === "number" && (!Number.isFinite(Number(nextValue)) || typeof nextValue !== "number")) {
        throw new Error(`Preference ${key} expects a number value.`);
      } else if (typeof defaultValue === "boolean" && typeof nextValue !== "boolean") {
        throw new Error(`Preference ${key} expects a boolean value.`);
      } else if (typeof defaultValue === "string" && typeof nextValue !== "string") {
        throw new Error(`Preference ${key} expects a string value.`);
      }
    }

    function valuesEqual(a, b) {
      if (a === b) return true;
      try {
        return JSON.stringify(a) === JSON.stringify(b);
      } catch (_error) {
        return false;
      }
    }

    function isSecretPreferencePath(key) {
      return SECRET_KEY_PATTERN.test(String(key || ""));
    }

    function redactValueForPath(key, value) {
      return copyToolValue(key, value, true);
    }

    function getCategoryForKey(key) {
      const topKey = splitPreferencePath(key, MAX_PATH_SEGMENTS)[0];
      if (PREFERENCE_METADATA[topKey]?.category) return PREFERENCE_METADATA[topKey].category;
      if (/^graph/i.test(topKey)) return "graph";
      if (/^codeConverterGradle/i.test(topKey)) return "gradle";
      if (/^codeConverterJava|jdk/i.test(topKey)) return "jdks";
      if (/^debug/i.test(topKey)) return "debug";
      if (/^confirm/i.test(topKey)) return "confirmations";
      if (/theme|syntax/i.test(topKey)) return "themes";
      if (/folder|startup|recent/i.test(topKey)) return "folder-view";
      if (/editor|autocomplete|wordWrap|spacesPerIndent|tabsPerIndent/i.test(topKey)) return "editor";
      return "interface";
    }

    function labelForKey(key) {
      const parts = splitPreferencePath(key, MAX_PATH_SEGMENTS);
      const topLabel = PREFERENCE_METADATA[parts[0]]?.label || parts[0].replace(/([a-z])([A-Z])/g, "$1 $2");
      return parts.length === 1 ? topLabel : `${topLabel}: ${parts.slice(1).map((part) => part.replace(/([a-z])([A-Z])/g, "$1 $2")).join(": ")}`;
    }

    function getValueType(value) {
      if (value === null) return "null";
      if (Array.isArray(value)) return "array";
      if (value && typeof value === "object") return "object";
      return ["boolean", "string", "number"].includes(typeof value) ? typeof value : "null";
    }

    function createReadError(code, path, retryable, message) {
      return { code, path: Array.isArray(path) ? path : [], retryable: retryable === true, message: String(message || code) };
    }

    function failedRead(code, path, retryable, message) {
      const error = createReadError(code, path, retryable, message);
      return {
        status: "failed",
        entries: [],
        preferences: [],
        results: [],
        page: { returned: 0, hasMore: false, nextCursor: null },
        errors: [error],
        error,
        complete: false
      };
    }

    function createPreferenceDescriptor(path, defaultValue) {
      const key = path.join(".");
      const valueType = getValueType(defaultValue);
      return {
        path,
        key,
        category: getCategoryForKey(path),
        label: labelForKey(path),
        valueType,
        hasChildren: valueType === "object" || valueType === "array"
      };
    }

    function listChildDescriptors(path) {
      const value = path.length ? getValueAtPath(getDefaultTopValue, path) : getDefaultState();
      if (value == null || typeof value !== "object") return [createPreferenceDescriptor(path, value)];
      return Object.keys(value).sort().map((childKey) => {
        let childValue;
        try { childValue = value[childKey]; } catch (_error) { childValue = null; }
        return createPreferenceDescriptor(path.concat(childKey), childValue);
      });
    }

    function flattenDefaultDescriptors(maxDepth = MAX_READ_DEPTH) {
      const descriptors = [];
      const pending = listChildDescriptors([]).map((descriptor) => ({ descriptor, depth: 1 }));
      while (pending.length) {
        const current = pending.shift();
        descriptors.push(current.descriptor);
        if (!current.descriptor.hasChildren || current.depth >= maxDepth) continue;
        try {
          listChildDescriptors(current.descriptor.path).forEach((descriptor) => pending.push({ descriptor, depth: current.depth + 1 }));
        } catch (_error) {
          // The parent remains searchable even when its children cannot be indexed.
        }
      }
      return descriptors.sort((left, right) => left.key.localeCompare(right.key));
    }

    function resolvePreferenceEntry(descriptor, options = {}) {
      try {
        if (descriptor.hasChildren) return { entry: { ...descriptor }, error: null };
        const value = getValueAtPath(getEffectiveTopValue, descriptor.path);
        const defaultValue = getValueAtPath(getDefaultTopValue, descriptor.path);
        const entry = { ...descriptor };
        entry.value = copyToolValue(descriptor.key, value, true, Number(options.maxDepth || DEFAULT_READ_DEPTH));
        entry.changedFromDefault = !valuesEqual(value, defaultValue);
        if (options.includeDefaults !== false) {
          entry.defaultValue = copyToolValue(descriptor.key, defaultValue, true, Number(options.maxDepth || DEFAULT_READ_DEPTH));
        }
        return { entry, error: null };
      } catch (_error) {
        return {
          entry: null,
          error: createReadError("preference-resolution-failed", descriptor.path, true, "The preference could not be resolved.")
        };
      }
    }

    function getKnownPreferenceKeys() {
      return Object.keys(getDefaultState()).sort();
    }

    function normalizeKeys(keys) {
      if (!Array.isArray(keys) || !keys.length) return getKnownPreferenceKeys();
      return keys.map((key) => assertKnownPreferencePath(key).join("."));
    }

    function clampInteger(value, fallback, minimum, maximum) {
      const number = Number(value);
      return Number.isFinite(number) ? Math.max(minimum, Math.min(maximum, Math.floor(number))) : fallback;
    }

    function hashText(value) {
      let hash = 2166136261;
      for (const character of String(value || "")) {
        hash ^= character.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
      }
      return (hash >>> 0).toString(36);
    }

    function utf8ByteLength(value) {
      let bytes = 0;
      for (const character of String(value || "")) {
        const codePoint = character.codePointAt(0);
        bytes += codePoint <= 0x7f ? 1 : codePoint <= 0x7ff ? 2 : codePoint <= 0xffff ? 3 : 4;
      }
      return bytes;
    }

    function getSavedStateFingerprint() {
      const state = getSavedState();
      const signatures = Object.keys(state).sort().map((key) => {
        try {
          return [key, copyToolValue(key, state[key], false, MAX_READ_DEPTH)];
        } catch (_error) {
          return [key, "[unresolvable]"];
        }
      });
      return hashText(JSON.stringify(signatures));
    }

    function encodeCursor(payload) {
      const json = JSON.stringify(payload);
      const base64 = typeof btoa === "function" ? btoa(unescape(encodeURIComponent(json))) : json;
      return base64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
    }

    function decodeCursor(cursor) {
      if (!cursor) return null;
      try {
        const normalized = String(cursor).replace(/-/g, "+").replace(/_/g, "/");
        const padded = normalized + "=".repeat((4 - normalized.length % 4) % 4);
        const json = typeof atob === "function" ? decodeURIComponent(escape(atob(padded))) : normalized;
        return JSON.parse(json);
      } catch (_error) {
        return null;
      }
    }

    function buildFilterFingerprint(operation, args) {
      return hashText(JSON.stringify({
        operation,
        path: Array.isArray(args.path) ? args.path : null,
        keys: Array.isArray(args.keys) ? args.keys : null,
        category: String(args.category || "").toLowerCase(),
        query: String(args.query || "").toLowerCase(),
        valueType: String(args.valueType || "").toLowerCase(),
        maxDepth: clampInteger(args.maxDepth, DEFAULT_READ_DEPTH, 1, MAX_READ_DEPTH),
        redactSecrets: args.redactSecrets !== false,
        includeDefaults: args.includeDefaults !== false
      }));
    }

    function readCursor(operation, args, stateFingerprint = "") {
      if (!args.cursor) return { offset: 0, exportedAt: "" };
      const cursor = decodeCursor(args.cursor);
      const fingerprint = buildFilterFingerprint(operation, args);
      if (!cursor || cursor.v !== CURSOR_VERSION || cursor.operation !== operation || cursor.fingerprint !== fingerprint) {
        return { error: failedRead("invalid-cursor", [], false, "The cursor does not match this preference request.") };
      }
      if (stateFingerprint && cursor.stateFingerprint !== stateFingerprint) {
        return { error: failedRead("stale-cursor", [], false, "Preference state changed after this export began.") };
      }
      return { offset: clampInteger(cursor.offset, 0, 0, Number.MAX_SAFE_INTEGER), exportedAt: String(cursor.exportedAt || "") };
    }

    function makeNextCursor(operation, args, offset, stateFingerprint = "", exportedAt = "") {
      return encodeCursor({
        v: CURSOR_VERSION,
        operation,
        fingerprint: buildFilterFingerprint(operation, args),
        offset,
        stateFingerprint,
        exportedAt
      });
    }

    function finalizeRead(operation, args, descriptors, offset, options = {}) {
      const maxEntries = clampInteger(args.maxEntries ?? args.maxResults, DEFAULT_PAGE_ENTRIES, 1, MAX_PAGE_ENTRIES);
      const entries = [];
      const errors = [];
      let bytes = 2048;
      let index = offset;
      while (index < descriptors.length && entries.length < maxEntries) {
        const resolved = resolvePreferenceEntry(descriptors[index], args);
        index += 1;
        if (resolved.error) {
          const errorBytes = utf8ByteLength(JSON.stringify(resolved.error));
          if (bytes + errorBytes > MAX_RESULT_BYTES) {
            index -= 1;
            break;
          }
          errors.push(resolved.error);
          bytes += errorBytes;
          continue;
        }
        const entryBytes = utf8ByteLength(JSON.stringify(resolved.entry));
        if (entries.length && bytes + entryBytes > MAX_RESULT_BYTES) {
          index -= 1;
          break;
        }
        if (!entries.length && bytes + entryBytes > MAX_RESULT_BYTES) {
          errors.push(createReadError("result-size-limit", resolved.entry.path, true, "The preference entry exceeded the safe response size."));
          entries.push({ ...descriptors[index - 1], valueOmitted: true });
          continue;
        }
        entries.push(resolved.entry);
        bytes += entryBytes;
      }
      const hasMore = index < descriptors.length;
      const nextCursor = hasMore ? makeNextCursor(operation, args, index, options.stateFingerprint, options.exportedAt) : null;
      const status = errors.length ? (entries.length ? "partial" : "failed") : "success";
      return {
        status,
        entries,
        preferences: operation === "get" ? entries : undefined,
        results: operation === "search" ? entries : undefined,
        page: { returned: entries.length, hasMore, nextCursor, scannedThrough: index },
        errors,
        complete: errors.length === 0
      };
    }

    function descriptorsForGet(args) {
      const category = String(args.category || "").trim().toLowerCase();
      const valueType = String(args.valueType || "").trim().toLowerCase();
      let descriptors;
      if (Array.isArray(args.path) && args.path.length) {
        const path = splitPreferencePath(args.path, MAX_PATH_SEGMENTS);
        getValueAtPath(getDefaultTopValue, path);
        descriptors = listChildDescriptors(path);
      } else if (Array.isArray(args.keys) && args.keys.length) {
        descriptors = [];
        args.keys.forEach((key) => {
          const path = assertKnownPreferencePath(key);
          const descriptor = createPreferenceDescriptor(path, getValueAtPath(getDefaultTopValue, path));
          descriptors.push(...(descriptor.hasChildren ? listChildDescriptors(path) : [descriptor]));
        });
      } else if (category) {
        descriptors = [];
        listChildDescriptors([]).filter((descriptor) => descriptor.category.toLowerCase() === category).forEach((descriptor) => {
          descriptors.push(...(descriptor.hasChildren ? listChildDescriptors(descriptor.path) : [descriptor]));
        });
      } else {
        descriptors = listChildDescriptors([]);
      }
      return descriptors
        .filter((descriptor) => !valueType || descriptor.valueType === valueType)
        .sort((left, right) => left.key.localeCompare(right.key));
    }

    function getPreferences(args = {}) {
      try {
        const cursor = readCursor("get", args);
        if (cursor.error) return cursor.error;
        return finalizeRead("get", args, descriptorsForGet(args), cursor.offset);
      } catch (error) {
        const code = error?.code === "unknown-preference" ? "unknown-preference" : "invalid-path";
        return failedRead(code, error?.path || args.path || [], false, error?.message || "The preference path is invalid.");
      }
    }

    function searchPreferences(args = {}) {
      const query = String(args.query || "").trim().toLowerCase();
      if (!query) return failedRead("invalid-path", [], false, "A preference search query is required.");
      const cursor = readCursor("search", args);
      if (cursor.error) return cursor.error;
      const valueType = String(args.valueType || "").trim().toLowerCase();
      const all = flattenDefaultDescriptors(clampInteger(args.maxDepth, MAX_READ_DEPTH, 1, MAX_READ_DEPTH));
      const scanLimit = Math.min(all.length, cursor.offset + MAX_SEARCH_SCAN_ENTRIES);
      const maxEntries = clampInteger(args.maxEntries ?? args.maxResults, DEFAULT_PAGE_ENTRIES, 1, MAX_PAGE_ENTRIES);
      const entries = [];
      const errors = [];
      let bytes = 2048;
      let scanIndex = cursor.offset;
      while (scanIndex < scanLimit && entries.length < maxEntries) {
        const descriptor = all[scanIndex];
        if (valueType && descriptor.valueType !== valueType) {
          scanIndex += 1;
          continue;
        }
        const metadataMatches = `${descriptor.key} ${descriptor.label} ${descriptor.category} ${descriptor.valueType}`.toLowerCase().includes(query);
        const resolved = resolvePreferenceEntry(descriptor, args);
        if (resolved.error) {
          const errorBytes = utf8ByteLength(JSON.stringify(resolved.error));
          if (bytes + errorBytes > MAX_RESULT_BYTES) break;
          errors.push(resolved.error);
          bytes += errorBytes;
          scanIndex += 1;
          continue;
        }
        if (!metadataMatches && !JSON.stringify(resolved.entry).toLowerCase().includes(query)) {
          scanIndex += 1;
          continue;
        }
        const entryBytes = utf8ByteLength(JSON.stringify(resolved.entry));
        if (entries.length && bytes + entryBytes > MAX_RESULT_BYTES) break;
        if (!entries.length && bytes + entryBytes > MAX_RESULT_BYTES) {
          errors.push(createReadError("result-size-limit", resolved.entry.path, true, "The preference entry exceeded the safe response size."));
          entries.push({ ...descriptor, valueOmitted: true });
        } else {
          entries.push(resolved.entry);
          bytes += entryBytes;
        }
        scanIndex += 1;
      }
      const hasMoreToScan = scanIndex < all.length;
      return {
        status: errors.length ? (entries.length ? "partial" : "failed") : "success",
        entries,
        results: entries,
        page: {
          returned: entries.length,
          hasMore: hasMoreToScan,
          hasMoreMatches: hasMoreToScan,
          hasMoreToScan,
          nextCursor: hasMoreToScan ? makeNextCursor("search", args, scanIndex) : null,
          scannedThrough: scanIndex
        },
        errors,
        complete: errors.length === 0
      };
    }

    function createChange(key, newValue, action) {
      validateValueType(key, newValue);
      const oldValue = getPreferencePathValue(getEffectiveTopValue, key);
      return {
        key,
        action,
        oldValue: redactValueForPath(key, oldValue),
        newValue: redactValueForPath(key, newValue),
        changed: !valuesEqual(oldValue, newValue),
        rawNewValue: clone(newValue)
      };
    }

    function buildPatchFromChanges(changes) {
      const patch = {};
      changes.forEach((change) => {
        const parts = assertKnownPreferencePath(change.key);
        if (parts.length === 1) {
          patch[parts[0]] = clone(change.rawNewValue);
          return;
        }
        const currentTopValue = Object.prototype.hasOwnProperty.call(patch, parts[0])
          ? patch[parts[0]]
          : clone(getEffectiveTopValue(parts[0])) || {};
        currentTopValue[parts[1]] = clone(change.rawNewValue);
        patch[parts[0]] = currentTopValue;
      });
      return patch;
    }

    async function refreshPreferences() {
      await deps.refreshPreferences?.({ refreshSettingsDialog: true });
    }

    async function updatePreferences(args = {}) {
      const sourceChanges = Array.isArray(args.changes) ? args.changes : [];
      const changes = [];
      const unresolved = [];
      for (const change of sourceChanges) {
        const key = change?.key;
        try {
          // Resolve first so an unknown bare key becomes a suggestion, not a hard
          // failure that aborts the whole call.
          assertKnownPreferencePath(key);
        } catch (error) {
          if (error && error.code === "unknown-preference") {
            const suggestions = findPreferenceKeySuggestions(key);
            unresolved.push({
              key: Array.isArray(key) ? key.join(".") : String(key || ""),
              found: false,
              suggestions,
              message: suggestions.length
                ? `Preference "${Array.isArray(key) ? key.join(".") : key}" was not found. Did you mean ${suggestions.map((s) => `"${s}"`).join(" or ")}? Nothing was changed — re-call preferences_update with the full path if that is the setting you want, or ask the user.`
                : `Preference "${Array.isArray(key) ? key.join(".") : key}" was not found and no similar key exists. Nothing was changed.`
            });
            continue;
          }
          throw error;
        }
        changes.push(createChange(key, coercePreferenceValue(key, change?.value), "update"));
      }
      const changed = changes.some((change) => change.changed);
      if (changed && args.previewOnly !== true) {
        deps.saveGlobalState?.(buildPatchFromChanges(changes.filter((change) => change.changed)));
        await refreshPreferences();
      }
      return { changed, changes: changes.map(({ rawNewValue, ...change }) => change), unresolved };
    }

    async function resetPreferences(args = {}) {
      const changes = normalizeKeys(args.keys).map((key) => createChange(key, getPreferencePathValue(getDefaultTopValue, key), "reset"));
      const changed = changes.some((change) => change.changed);
      if (changed && args.previewOnly !== true) {
        deps.saveGlobalState?.(buildPatchFromChanges(changes.filter((change) => change.changed)));
        await refreshPreferences();
      }
      return { changed, changes: changes.map(({ rawNewValue, ...change }) => change) };
    }

    function buildExportPayload(args = {}) {
      try {
        const stateFingerprint = getSavedStateFingerprint();
        const cursor = readCursor("export", args, stateFingerprint);
        if (cursor.error) return cursor.error;
        const exportedAt = cursor.exportedAt || new Date().toISOString();
        const descriptors = flattenDefaultDescriptors(MAX_READ_DEPTH);
        const result = finalizeRead("export", args, descriptors, cursor.offset, { stateFingerprint, exportedAt });
        result.manifest = {
          documentType: "md-editor-settings",
          schemaVersion: 1,
          app: "MD-Editor",
          exportedAt,
          totalEntries: descriptors.length
        };
        return result;
      } catch (_error) {
        return failedRead("tool-execution-failed", [], true, "The bounded settings export could not be created.");
      }
    }

    function createImportChanges(settings) {
      return Object.keys(settings || {}).sort().filter((key) => Object.prototype.hasOwnProperty.call(getDefaultState(), key)).map((key) => {
        const oldValue = getEffectiveTopValue(key);
        const newValue = settings[key];
        return {
          key,
          action: "import",
          oldValue: redactValueForPath(key, oldValue),
          newValue: redactValueForPath(key, newValue),
          changed: !valuesEqual(oldValue, newValue)
        };
      });
    }

    async function importPreferences(args = {}) {
      if (!deps.settingsTransfer?.parseSettingsImportText) throw new Error("Settings import parsing is unavailable.");
      const settings = deps.settingsTransfer.parseSettingsImportText(String(args.text || ""));
      const changes = createImportChanges(settings);
      const changed = changes.some((change) => change.changed);
      if (changed && args.apply === true) {
        deps.replaceGlobalState?.(settings);
        await refreshPreferences();
      }
      return { valid: true, changed, changes };
    }

    async function execute(toolName, args = {}) {
      switch (toolName) {
        case "preferences_get":
          return getPreferences(args);
        case "preferences_search":
          return searchPreferences(args);
        case "preferences_export":
          return buildExportPayload(args);
        case "preferences_update":
          return updatePreferences(args);
        case "preferences_reset":
          return resetPreferences(args);
        case "preferences_import":
          return importPreferences(args);
        default:
          throw new Error(`Unsupported settings action: ${toolName}`);
      }
    }

    const api = { execute, _test: { redactValueForPath, getKnownPreferenceKeys } };
    app.registerModule?.("aiCompanionSettingsTools", api);
    return api;
  }

  window.registerMarkdownViewerAiCompanionSettingsTools = registerMarkdownViewerAiCompanionSettingsTools;
})(window);
