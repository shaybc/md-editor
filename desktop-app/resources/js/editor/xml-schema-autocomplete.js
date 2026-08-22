(function(global) {
  "use strict";

  const XML_SCHEMA_INSTANCE_NAMESPACE = "http://www.w3.org/2001/XMLSchema-instance";

  function registerMarkdownViewerXmlSchemaAutocomplete(app, deps = {}) {
    const DOMParserRef = deps.DOMParser || global.DOMParser;
    const NeutralinoRef = deps.Neutralino || global.Neutralino || null;
    const associations = new Map();

    function normalizeSlashes(value) {
      return String(value || "").replace(/\\/g, "/");
    }

    function isRemotePath(value) {
      const text = String(value || "");
      if (/^[A-Za-z]:[\\/]/.test(text)) return false;
      return /^[a-z][a-z0-9+.-]*:/i.test(text);
    }

    function isAbsolutePath(value) {
      const normalized = normalizeSlashes(value);
      return /^[A-Za-z]:\//.test(normalized) || normalized.startsWith("/");
    }

    function dirname(filePath) {
      const normalized = normalizeSlashes(filePath);
      const index = normalized.lastIndexOf("/");
      return index >= 0 ? normalized.slice(0, index) : "";
    }

    function basename(filePath) {
      const normalized = normalizeSlashes(filePath);
      const index = normalized.lastIndexOf("/");
      return index >= 0 ? normalized.slice(index + 1) : normalized;
    }

    function normalizeLocalPath(path) {
      const normalized = normalizeSlashes(path);
      const driveMatch = normalized.match(/^([A-Za-z]:)(\/.*)?$/);
      const prefix = driveMatch ? driveMatch[1] : normalized.startsWith("/") ? "" : "";
      const body = driveMatch ? (driveMatch[2] || "") : normalized;
      const absolute = driveMatch || body.startsWith("/");
      const parts = body.split("/").filter(Boolean);
      const stack = [];
      parts.forEach(function(part) {
        if (part === ".") return;
        if (part === "..") {
          if (stack.length && stack[stack.length - 1] !== "..") stack.pop();
          else if (!absolute) stack.push(part);
          return;
        }
        stack.push(part);
      });
      const joined = stack.join("/");
      if (driveMatch) return prefix + (joined ? "/" + joined : "/");
      if (absolute) return "/" + joined;
      return joined;
    }

    function resolveLocalPath(reference, filePath) {
      const value = String(reference || "").trim();
      if (!value || isRemotePath(value) || isAbsolutePath(value)) return normalizeSlashes(value);
      const base = dirname(filePath);
      return normalizeLocalPath(base ? base + "/" + value : value);
    }

    function getRelativeSchemaReference(filePath, schemaPath) {
      const fromDir = dirname(normalizeLocalPath(filePath));
      const target = normalizeLocalPath(schemaPath);
      const targetDir = dirname(target);
      if (!fromDir || !targetDir) return basename(target);
      const fromDrive = fromDir.match(/^[A-Za-z]:/)?.[0]?.toLowerCase() || "";
      const targetDrive = target.match(/^[A-Za-z]:/)?.[0]?.toLowerCase() || "";
      if (fromDrive && targetDrive && fromDrive !== targetDrive) return basename(target);
      if (fromDir.toLowerCase() === targetDir.toLowerCase()) return basename(target);
      const fromParts = fromDir.replace(/^[A-Za-z]:\//, "").split("/").filter(Boolean);
      const targetParts = targetDir.replace(/^[A-Za-z]:\//, "").split("/").filter(Boolean);
      let common = 0;
      while (common < fromParts.length && common < targetParts.length && fromParts[common].toLowerCase() === targetParts[common].toLowerCase()) {
        common += 1;
      }
      const up = fromParts.slice(common).map(function() { return ".."; });
      return up.concat(targetParts.slice(common), basename(target)).join("/") || basename(target);
    }

    function getAssociationKey(filePath) {
      return normalizeLocalPath(filePath).toLowerCase();
    }

    function isXmlSchemaPath(path) {
      return /\.xsd$/i.test(String(path || ""));
    }

    function isXmlDocumentPath(path) {
      const text = String(path || "");
      return !isXmlSchemaPath(text) && (/(\.xml|\.xsl|\.xslt|\.svg)$/i.test(text) || /(^|[/\\])pom\.xml$/i.test(text));
    }

    function getDocumentRoot(text) {
      if (!DOMParserRef || typeof DOMParserRef !== "function") return null;
      const parsed = new DOMParserRef().parseFromString(String(text || ""), "application/xml");
      if (!parsed || parsed.getElementsByTagName("parsererror").length) return null;
      return parsed.documentElement || null;
    }

    function getAttribute(root, name) {
      if (!root || typeof root.getAttribute !== "function") return "";
      return root.getAttributeNS?.(XML_SCHEMA_INSTANCE_NAMESPACE, name) || root.getAttribute("xsi:" + name) || root.getAttribute(name) || "";
    }

    function escapeXmlAttribute(value) {
      return String(value || "")
        .replace(/&/g, "&amp;")
        .replace(/"/g, "&quot;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;");
    }

    function extractSchemaTargetNamespace(text) {
      const match = String(text || "").match(/\btargetNamespace\s*=\s*(["'])(.*?)\1/i);
      return match ? match[2] : "";
    }

    function applySchemaAssociationAttributesToText(text, options = {}) {
      const source = String(text || "");
      if (!source) return { changed: false, text: source };
      const targetNamespace = String(options.targetNamespace || "").trim();
      const schemaReference = String(options.schemaReference || "").trim();
      if (!schemaReference) return { changed: false, text: source };
      const rootMatch = /<(?![?!/])([A-Za-z_][\w:.-]*)([^<>]*?)(\/?)>/.exec(source);
      if (!rootMatch) return { changed: false, text: source };
      const fullTag = rootMatch[0];
      const attrs = rootMatch[2] || "";
      const additions = [];
      if (targetNamespace && !/\sxmlns\s*=/.test(attrs)) additions.push(`xmlns="${escapeXmlAttribute(targetNamespace)}"`);
      if (!/\sxmlns:xsi\s*=/.test(attrs)) additions.push(`xmlns:xsi="${XML_SCHEMA_INSTANCE_NAMESPACE}"`);
      if (targetNamespace) {
        if (!/\sxsi:schemaLocation\s*=/.test(attrs)) additions.push(`xsi:schemaLocation="${escapeXmlAttribute(targetNamespace + " " + schemaReference)}"`);
      } else if (!/\sxsi:noNamespaceSchemaLocation\s*=/.test(attrs)) {
        additions.push(`xsi:noNamespaceSchemaLocation="${escapeXmlAttribute(schemaReference)}"`);
      }
      if (!additions.length) return { changed: false, text: source };
      const insertion = (attrs && /\s$/.test(attrs) ? "" : " ") + additions.join(" ");
      const nextTag = fullTag.slice(0, fullTag.length - 1 - rootMatch[3].length) + insertion + rootMatch[3] + ">";
      return {
        changed: true,
        text: source.slice(0, rootMatch.index) + nextTag + source.slice(rootMatch.index + fullTag.length)
      };
    }

    function normalizeSchemaReadResult(result) {
      if (typeof result === "string") return result;
      if (result && typeof result.data === "string") return result.data;
      if (result && typeof result.content === "string") return result.content;
      return "";
    }

    async function readSchemaText(schemaPath) {
      let schemaText = "";
      if (typeof deps.readSchemaText === "function") schemaText = normalizeSchemaReadResult(await deps.readSchemaText(schemaPath));
      if (schemaText) return schemaText;
      const filesystem = NeutralinoRef?.filesystem;
      if (typeof filesystem?.readFile === "function") return normalizeSchemaReadResult(await filesystem.readFile(schemaPath));
      return "";
    }

    async function applySchemaAssociationToActiveEditor(filePath, schemaPath) {
      const currentText = deps.getActiveEditorValue?.();
      if (typeof currentText !== "string") return false;
      const schemaText = await readSchemaText(schemaPath);
      const targetNamespace = extractSchemaTargetNamespace(schemaText);
      const schemaReference = getRelativeSchemaReference(filePath, schemaPath);
      const result = applySchemaAssociationAttributesToText(currentText, { targetNamespace, schemaReference });
      if (!result.changed) return false;
      if (typeof deps.replaceActiveEditorContent === "function") {
        if (deps.replaceActiveEditorContent(result.text) === false) return false;
      } else if (typeof deps.setActiveEditorValue === "function") {
        deps.setActiveEditorValue(result.text);
        deps.dispatchActiveEditorInput?.();
        deps.refreshActiveEditorUi?.();
      } else {
        return false;
      }
      return true;
    }

    function extractInlineSchemaReferences(text, filePath) {
      const root = getDocumentRoot(text);
      if (!root) return [];
      const references = [];
      String(getAttribute(root, "noNamespaceSchemaLocation") || "").split(/\s+/).forEach(function(reference) {
        if (reference) references.push(reference);
      });
      const schemaLocationParts = String(getAttribute(root, "schemaLocation") || "").split(/\s+/).filter(Boolean);
      for (let index = 1; index < schemaLocationParts.length; index += 2) {
        references.push(schemaLocationParts[index]);
      }
      return references
        .map(function(reference) {
          return {
            pattern: normalizeLocalPath(filePath),
            systemId: resolveLocalPath(reference, filePath),
            source: "inline"
          };
        })
        .filter(function(entry) {
          return entry.pattern && entry.systemId && !isRemotePath(entry.systemId) && isXmlSchemaPath(entry.systemId);
        });
    }

    async function canReadSchema(path) {
      if (!isXmlSchemaPath(path)) return false;
      const filesystem = NeutralinoRef?.filesystem;
      if (!filesystem) return true;
      try {
        if (typeof filesystem.getStats === "function") {
          await filesystem.getStats(path);
          return true;
        }
        if (typeof filesystem.readFile === "function") {
          await filesystem.readFile(path);
          return true;
        }
        return true;
      } catch (error) {
        return false;
      }
    }

    function notify(kind, message) {
      const notifyService = deps.notify || app.services?.notify || app.modules?.notificationModal;
      if (typeof notifyService?.[kind] === "function") {
        notifyService[kind]({ title: "XML Schema", message });
      } else if (typeof notifyService?.show === "function") {
        notifyService.show({ title: "XML Schema", message, type: kind });
      }
    }

    async function setSchemaAssociation(options = {}) {
      const filePath = normalizeLocalPath(options.filePath || "");
      const schemaPath = normalizeLocalPath(options.schemaPath || "");
      if (!filePath || !schemaPath) return { ok: false, message: "XML file and schema paths are required." };
      if (!isXmlDocumentPath(filePath)) return { ok: false, message: "Associate XML Schema is available for XML files." };
      if (!await canReadSchema(schemaPath)) return { ok: false, message: "Unable to read selected XML schema." };
      const association = { filePath, schemaPath };
      associations.set(getAssociationKey(filePath), association);
      return { ok: true, association };
    }

    function clearSchemaAssociation(filePath) {
      associations.delete(getAssociationKey(filePath));
    }

    function getAssociations() {
      return Array.from(associations.values()).map(function(entry) {
        return { filePath: entry.filePath, schemaPath: entry.schemaPath };
      });
    }

    function createFileAssociationEntries(options = {}) {
      const entries = [];
      getAssociations().forEach(function(entry) {
        entries.push({ pattern: entry.filePath, systemId: entry.schemaPath });
      });
      const filePath = normalizeLocalPath(options.filePath || options.path || "");
      if (filePath) {
        extractInlineSchemaReferences(options.content || "", filePath).forEach(function(entry) {
          entries.push({ pattern: entry.pattern, systemId: entry.systemId });
        });
      }
      const seen = new Set();
      return entries.filter(function(entry) {
        const key = entry.pattern + "\n" + entry.systemId;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    }

    function getWorkspaceConfiguration(options = {}) {
      const fileAssociations = createFileAssociationEntries(options);
      return fileAssociations.length ? { xml: { fileAssociations } } : {};
    }

    async function showSchemaPicker() {
      const showOpenDialog = NeutralinoRef?.os?.showOpenDialog;
      if (typeof showOpenDialog !== "function") return "";
      const result = await showOpenDialog("Associate XML Schema", {
        multiSelections: false,
        filters: [{ name: "XML Schema", extensions: ["xsd"] }]
      });
      return Array.isArray(result) ? (result[0] || "") : (result || "");
    }

    async function associateSchemaForActiveEditor() {
      const filePath = normalizeLocalPath(deps.getActiveEditorPath?.() || deps.getActiveTab?.()?.sourceFilePath || deps.getActiveTab?.()?.sourceFileName || "");
      if (!isXmlDocumentPath(filePath)) {
        const message = "Associate XML Schema is available for XML files.";
        notify("warning", message);
        return { ok: false, message };
      }
      const schemaPath = normalizeLocalPath(await showSchemaPicker());
      if (!schemaPath) return { ok: false, cancelled: true };
      const result = await setSchemaAssociation({ filePath, schemaPath });
      if (!result.ok) {
        notify("warning", result.message);
        return result;
      }
      const documentUpdated = await applySchemaAssociationToActiveEditor(filePath, schemaPath);
      await deps.refreshWorkspaceConfiguration?.();
      notify("success", "XML schema associated. Autocomplete will use it for this session.");
      result.documentUpdated = documentUpdated;
      return result;
    }

    const api = {
      associateSchemaForActiveEditor,
      setSchemaAssociation,
      clearSchemaAssociation,
      getWorkspaceConfiguration,
      getAssociations,
      _test: {
        extractInlineSchemaReferences,
        applySchemaAssociationAttributesToText,
        extractSchemaTargetNamespace,
        getRelativeSchemaReference,
        normalizeSchemaReadResult,
        isXmlDocumentPath,
        normalizeLocalPath,
        resolveLocalPath
      }
    };
    app.registerModule?.("xmlSchemaAutocomplete", api);
    return api;
  }

  global.registerMarkdownViewerXmlSchemaAutocomplete = registerMarkdownViewerXmlSchemaAutocomplete;
  if (typeof module !== "undefined") module.exports = { registerMarkdownViewerXmlSchemaAutocomplete };
})(typeof window !== "undefined" ? window : globalThis);
