// Build a lightweight field-aware topology graph from Kubernetes YAML manifests.
(function(global) {
  "use strict";

  /** Register manifest graph extraction helpers. */
  function registerMarkdownViewerKubernetesManifestGraph(app) {
    const SCHEMA_VERSION = 1;

    function getDocumentBlocks(yamlText) {
      return String(yamlText || "").split(/^---\s*$/m).map((block) => String(block || "")).filter((block) => block.trim());
    }

    function getHelmSourceRef(rawText) {
      const match = String(rawText || "").match(/^\s*#\s*Source:\s*([^\r\n]+)/m);
      return match ? match[1].trim() : "";
    }

    function attachDocumentMetadata(document, rawText) {
      if (!document || typeof document !== "object") return null;
      return Object.assign(document, {
        __rawText: rawText || document.__rawText || "",
        __fileRef: document.__fileRef || getHelmSourceRef(rawText)
      });
    }

    function parseDocuments(yamlText) {
      const yaml = global.jsyaml || global.jsYaml || global.YAML;
      const blocks = getDocumentBlocks(yamlText);
      if (yaml?.load) {
        const documents = [];
        blocks.forEach((block) => {
          try {
            const doc = attachDocumentMetadata(yaml.load(block), block);
            if (doc) documents.push(doc);
          } catch (_error) {}
        });
        if (documents.length) return documents;
      }
      if (yaml?.loadAll) {
        const documents = [];
        try { yaml.loadAll(String(yamlText || ""), (doc) => { if (doc && typeof doc === "object") documents.push(attachDocumentMetadata(doc, "")); }); } catch (_error) {}
        if (documents.length) return documents.filter(Boolean);
      }
      return blocks.map(parseSimpleDocument).filter(Boolean);
    }

    function parseSimpleDocument(text) {
      const doc = {};
      const rawText = String(text || "");
      const nameMatch = rawText.match(/^\s*name:\s*([^\r\n#]+)/m);
      const namespaceMatch = rawText.match(/^\s*namespace:\s*([^\r\n#]+)/m);
      const apiVersionMatch = rawText.match(/^apiVersion:\s*([^\r\n#]+)/m);
      const kindMatch = rawText.match(/^kind:\s*([^\r\n#]+)/m);
      if (!apiVersionMatch && !kindMatch) return null;
      doc.apiVersion = apiVersionMatch?.[1]?.trim() || "";
      doc.kind = kindMatch?.[1]?.trim() || "";
      doc.metadata = { name: nameMatch?.[1]?.trim() || "", namespace: namespaceMatch?.[1]?.trim() || "" };
      doc.__rawText = rawText;
      doc.__fileRef = getHelmSourceRef(rawText);
      return doc;
    }

    function cleanYamlValue(value) {
      return String(value || "").trim().replace(/^["']|["']$/g, "");
    }

    function getDisplayValue(value) {
      if (value === undefined || value === null) return "";
      if (Array.isArray(value)) return value.map(getDisplayValue).filter(Boolean).join(", ");
      if (typeof value === "object") return Object.entries(value).map(([key, val]) => `${key}: ${getDisplayValue(val)}`).join(", ");
      return cleanYamlValue(value);
    }

    function normalizeFieldIdPart(value) {
      return String(value || "field").replace(/[^A-Za-z0-9_.\[\]-]+/g, "_");
    }

    function createFieldId(nodeId, path) {
      return `${nodeId}#${normalizeFieldIdPart(path)}`;
    }

    function appendPath(basePath, childPath) {
      const base = String(basePath || "").replace(/\.$/, "");
      const child = String(childPath || "").replace(/^\./, "");
      return base ? `${base}.${child}` : child;
    }

    function addNode(nodes, id, label, kind, extras = {}) {
      if (!id) return null;
      const existing = nodes.find((node) => node.id === id);
      if (existing) return existing;
      const node = Object.assign({ id, label, kind, fields: [] }, extras);
      if (!Array.isArray(node.fields)) node.fields = [];
      nodes.push(node);
      return node;
    }

    function getNode(nodes, id) {
      return nodes.find((node) => node.id === id) || null;
    }

    function ensureField(node, path, options = {}) {
      if (!node || !path) return null;
      if (!Array.isArray(node.fields)) node.fields = [];
      const normalizedPath = String(path);
      const fieldId = options.id || createFieldId(node.id, normalizedPath);
      const existing = node.fields.find((field) => field.id === fieldId || field.path === normalizedPath);
      if (existing) {
        if (!existing.value && options.value !== undefined) existing.value = getDisplayValue(options.value);
        if (!existing.relationRole && options.relationRole) existing.relationRole = options.relationRole;
        return existing;
      }
      const field = {
        id: fieldId,
        path: normalizedPath,
        label: options.label || normalizedPath,
        type: options.type || "string",
        value: getDisplayValue(options.value),
        relationRole: options.relationRole || "related"
      };
      node.fields.push(field);
      return field;
    }

    function addEdge(nodes, edges, from, to, label, reason = "", options = {}) {
      if (!from || !to || from === to) return;
      const fromNode = getNode(nodes, from);
      const toNode = getNode(nodes, to);
      const sourceField = ensureField(fromNode, options.sourcePath || "metadata.name", {
        type: options.sourceType || "string",
        value: options.sourceValue,
        relationRole: "source"
      });
      const targetField = ensureField(toNode, options.targetPath || "metadata.name", {
        type: options.targetType || "string",
        value: options.targetValue,
        relationRole: "target"
      });
      const sourceFieldId = options.sourceFieldId || sourceField?.id || "";
      const targetFieldId = options.targetFieldId || targetField?.id || "";
      if (edges.some((edge) => edge.from === from && edge.to === to && edge.label === label && edge.sourceFieldId === sourceFieldId && edge.targetFieldId === targetFieldId)) return;
      edges.push({
        from,
        to,
        sourceFieldId,
        targetFieldId,
        sourcePath: options.sourcePath || sourceField?.path || "",
        targetPath: options.targetPath || targetField?.path || "",
        relationKind: options.relationKind || label || "references",
        label,
        reason
      });
    }

    function getResourceName(resource) {
      return cleanYamlValue(resource?.metadata?.name || resource?.kind || "resource");
    }

    function getNamespace(resource) {
      return cleanYamlValue(resource?.metadata?.namespace || "default");
    }

    function getResourceId(kind, name, namespace = "default") {
      const normalizedKind = cleanYamlValue(kind || "Resource");
      const normalizedName = cleanYamlValue(name || normalizedKind);
      const normalizedNamespace = normalizedKind === "Namespace" ? normalizedName : cleanYamlValue(namespace || "default");
      return normalizedKind === "Namespace" ? `namespace/${normalizedName}` : `${normalizedNamespace}/${normalizedKind}/${normalizedName}`;
    }

    function normalizeLabels(labels) {
      if (!labels || typeof labels !== "object" || Array.isArray(labels)) return {};
      return Object.fromEntries(Object.entries(labels).filter((entry) => entry[0] && entry[1] !== undefined).map(([key, value]) => [String(key), String(value)]));
    }

    function labelsMatch(selector, labels) {
      const wanted = normalizeLabels(selector);
      const available = normalizeLabels(labels);
      const keys = Object.keys(wanted);
      return Boolean(keys.length) && keys.every((key) => available[key] === wanted[key]);
    }

    function extractBlock(text, headingRegex) {
      const source = String(text || "");
      const match = headingRegex.exec(source);
      if (!match) return "";
      const start = match.index + match[0].length;
      const rest = source.slice(start);
      const end = rest.search(/^\S/m);
      return end >= 0 ? rest.slice(0, end) : rest;
    }

    function extractLabelsFromBlock(block) {
      const labels = {};
      String(block || "").split(/\r?\n/).forEach((line) => {
        const match = line.match(/^\s{2,}([A-Za-z0-9_.-]+\/?[A-Za-z0-9_.-]*):\s*([^\r\n#]+)/);
        if (match) labels[cleanYamlValue(match[1])] = cleanYamlValue(match[2]);
      });
      return labels;
    }

    function getPodTemplateLabels(resource) {
      return normalizeLabels(resource?.spec?.template?.metadata?.labels);
    }

    function getSelectorLabels(resource) {
      return normalizeLabels(resource?.spec?.selector?.matchLabels || resource?.spec?.selector);
    }

    function getRawPodTemplateLabels(resource) {
      const rawText = String(resource?.__rawText || "");
      return extractLabelsFromBlock(extractBlock(rawText, /^\s{2,}template:\s*[\r\n]+\s{4,}metadata:\s*[\r\n]+\s{6,}labels:\s*[\r\n]/m));
    }

    function getRawSelectorLabels(resource) {
      const rawText = String(resource?.__rawText || "");
      const matchLabels = extractLabelsFromBlock(extractBlock(rawText, /^\s{2,}selector:\s*[\r\n]+\s{4,}matchLabels:\s*[\r\n]/m));
      return Object.keys(matchLabels).length ? matchLabels : extractLabelsFromBlock(extractBlock(rawText, /^\s{2,}selector:\s*[\r\n]/m));
    }

    function collectRefs(value, refs = [], path = "") {
      if (!value || typeof value !== "object") return refs;
      if (value.configMapRef?.name) refs.push({ kind: "ConfigMap", name: value.configMapRef.name, sourcePath: appendPath(path, "configMapRef.name") });
      if (value.secretRef?.name) refs.push({ kind: "Secret", name: value.secretRef.name, sourcePath: appendPath(path, "secretRef.name") });
      if (value.configMapKeyRef?.name) refs.push({ kind: "ConfigMap", name: value.configMapKeyRef.name, sourcePath: appendPath(path, "configMapKeyRef.name") });
      if (value.secretKeyRef?.name) refs.push({ kind: "Secret", name: value.secretKeyRef.name, sourcePath: appendPath(path, "secretKeyRef.name") });
      if (value.configMap?.name) refs.push({ kind: "ConfigMap", name: value.configMap.name, sourcePath: appendPath(path, "configMap.name") });
      if (value.secret?.secretName) refs.push({ kind: "Secret", name: value.secret.secretName, sourcePath: appendPath(path, "secret.secretName") });
      if (value.persistentVolumeClaim?.claimName) refs.push({ kind: "PersistentVolumeClaim", name: value.persistentVolumeClaim.claimName, sourcePath: appendPath(path, "persistentVolumeClaim.claimName") });
      if (Array.isArray(value)) {
        value.forEach((entry) => collectRefs(entry, refs, `${path || "items"}[]`));
        return refs;
      }
      Object.keys(value).forEach((key) => collectRefs(value[key], refs, appendPath(path, key)));
      return refs;
    }

    function collectRawRefs(resource) {
      const rawText = String(resource?.__rawText || "");
      if (!rawText) return [];
      const refs = [];
      const patterns = [
        { kind: "ConfigMap", sourcePath: "spec.template.spec.containers[].envFrom[].configMapRef.name", regex: /configMap(?:Key)?Ref:\s*[\r\n]+\s*name:\s*([^\s#]+)/gi },
        { kind: "ConfigMap", sourcePath: "spec.template.spec.volumes[].configMap.name", regex: /configMap:\s*[\r\n]+\s*name:\s*([^\s#]+)/gi },
        { kind: "Secret", sourcePath: "spec.template.spec.containers[].envFrom[].secretRef.name", regex: /secret(?:Key)?Ref:\s*[\r\n]+\s*name:\s*([^\s#]+)/gi },
        { kind: "Secret", sourcePath: "spec.template.spec.volumes[].secret.secretName", regex: /secret:\s*[\r\n]+\s*secretName:\s*([^\s#]+)/gi },
        { kind: "PersistentVolumeClaim", sourcePath: "spec.template.spec.volumes[].persistentVolumeClaim.claimName", regex: /persistentVolumeClaim:\s*[\r\n]+\s*claimName:\s*([^\s#]+)/gi }
      ];
      patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.regex.exec(rawText))) refs.push({ kind: pattern.kind, name: cleanYamlValue(match[1]), sourcePath: pattern.sourcePath });
      });
      return refs;
    }

    function collectIngressBackends(resource) {
      const refs = [];
      function visit(value, path = "spec") {
        if (!value || typeof value !== "object") return;
        const serviceName = value.service?.name || value.serviceName;
        if (serviceName) refs.push({ kind: "Service", name: serviceName, label: "routes to", sourcePath: appendPath(path, value.service?.name ? "service.name" : "serviceName") });
        if (Array.isArray(value)) {
          value.forEach((entry) => visit(entry, `${path}[]`));
          return;
        }
        Object.keys(value).forEach((key) => visit(value[key], appendPath(path, key)));
      }
      visit(resource?.spec, "spec");
      const rawText = String(resource?.__rawText || "");
      [/serviceName:\s*([^\s#]+)/gi, /service:\s*[\r\n]+\s*name:\s*([^\s#]+)/gi].forEach((regex) => {
        let match;
        while ((match = regex.exec(rawText))) refs.push({ kind: "Service", name: cleanYamlValue(match[1]), label: "routes to", sourcePath: "spec.rules[].http.paths[].backend.service.name" });
      });
      return refs;
    }

    function collectRoleBindingRefs(resource) {
      const refs = [];
      const roleRef = resource?.roleRef;
      if (roleRef?.kind && roleRef?.name) refs.push({ kind: roleRef.kind, name: roleRef.name, namespace: getNamespace(resource), label: "binds role", sourcePath: "roleRef.name", targetPath: "metadata.name" });
      (Array.isArray(resource?.subjects) ? resource.subjects : []).forEach((subject) => {
        if (subject?.kind && subject?.name) refs.push({ kind: subject.kind, name: subject.name, namespace: subject.namespace || getNamespace(resource), label: "binds subject", sourcePath: "subjects[].name", targetPath: "metadata.name" });
      });
      const rawText = String(resource?.__rawText || "");
      const roleMatch = rawText.match(/roleRef:\s*[\r\n]+\s*apiGroup:\s*[^\r\n]*[\r\n]+\s*kind:\s*([^\r\n#]+)[\r\n]+\s*name:\s*([^\r\n#]+)/i);
      if (roleMatch) refs.push({ kind: cleanYamlValue(roleMatch[1]), name: cleanYamlValue(roleMatch[2]), namespace: getNamespace(resource), label: "binds role", sourcePath: "roleRef.name", targetPath: "metadata.name" });
      let subjectMatch;
      const subjectPattern = /^\s*-\s*kind:\s*(ServiceAccount)[\s\S]*?^\s+name:\s*([^\s#]+)/gim;
      while ((subjectMatch = subjectPattern.exec(rawText))) refs.push({ kind: subjectMatch[1], name: cleanYamlValue(subjectMatch[2]), namespace: getNamespace(resource), label: "binds subject", sourcePath: "subjects[].name", targetPath: "metadata.name" });
      return refs;
    }

    function addServiceAccountRefs(resource, refs) {
      const directName = resource?.spec?.serviceAccountName;
      if (directName) refs.push({ kind: "ServiceAccount", name: directName, sourcePath: "spec.serviceAccountName", targetPath: "metadata.name", label: "uses" });
      const templateName = resource?.spec?.template?.spec?.serviceAccountName;
      if (templateName) refs.push({ kind: "ServiceAccount", name: templateName, sourcePath: "spec.template.spec.serviceAccountName", targetPath: "metadata.name", label: "uses" });
      const rawText = String(resource?.__rawText || "");
      const match = rawText.match(/^\s*serviceAccountName:\s*([^\s#]+)/m);
      if (match) refs.push({ kind: "ServiceAccount", name: cleanYamlValue(match[1]), sourcePath: "spec.template.spec.serviceAccountName", targetPath: "metadata.name", label: "uses" });
    }

    /** Build graph nodes and field-aware edges from rendered or saved manifest YAML. */
    function buildFromYaml(yamlText, options = {}) {
      const resources = parseDocuments(yamlText);
      const nodes = [];
      const edges = [];
      const warnings = [];
      const resourceIds = new Map();
      const workloads = [];
      const services = [];
      resources.forEach((resource) => {
        const kind = cleanYamlValue(resource.kind || "Resource");
        const name = getResourceName(resource);
        const namespace = getNamespace(resource);
        const resourceId = getResourceId(kind, name, namespace);
        resourceIds.set(`${namespace}/${kind}/${name}`, resourceId);
        resourceIds.set(`${kind}/${name}`, resourceId);
        const namespaceNode = addNode(nodes, `namespace/${namespace}`, namespace, "Namespace", { name: namespace, namespace, fileRef: resource.__fileRef || "" });
        ensureField(namespaceNode, "metadata.name", { type: "string", value: namespace, relationRole: "source" });
        const resourceNode = addNode(nodes, resourceId, `${kind}/${name}`, kind, { name, namespace, apiVersion: resource.apiVersion || "", fileRef: resource.__fileRef || "" });
        ensureField(resourceNode, "metadata.name", { type: "string", value: name, relationRole: "identity" });
        if (kind !== "Namespace") addEdge(nodes, edges, `namespace/${namespace}`, resourceId, "contains", "Namespace metadata.name matches the resource metadata.namespace field.", {
          sourcePath: "metadata.name",
          sourceValue: namespace,
          targetPath: "metadata.namespace",
          targetValue: namespace,
          relationKind: "namespace-containment"
        });
        if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(kind)) {
          const podId = `${resourceId}/pod-template`;
          const podLabels = Object.assign({}, getPodTemplateLabels(resource), getRawPodTemplateLabels(resource));
          const podNode = addNode(nodes, podId, `${name} pod template`, "PodTemplate", { name: `${name} pod template`, namespace, labels: podLabels });
          ensureField(podNode, "metadata.labels", { type: "object", value: podLabels, relationRole: "target" });
          addEdge(nodes, edges, resourceId, podId, "creates", "Workload spec.template defines the pod template.", {
            sourcePath: "spec.template",
            sourceValue: "template",
            sourceType: "objectRef",
            targetPath: "kind",
            targetValue: "PodTemplate",
            relationKind: "workload-pod-template"
          });
          workloads.push({ resource, id: resourceId, podId, labels: podLabels });
        }
        if (kind === "Service") services.push({ resource, id: resourceId, selector: Object.assign({}, getSelectorLabels(resource), getRawSelectorLabels(resource)) });
      });
      services.forEach((service) => {
        workloads.forEach((workload) => {
          if (getNamespace(service.resource) === getNamespace(workload.resource) && labelsMatch(service.selector, workload.labels)) {
            addEdge(nodes, edges, service.id, workload.podId, "selects", "Service spec.selector matches workload pod template metadata.labels.", {
              sourcePath: "spec.selector",
              sourceValue: service.selector,
              sourceType: "objectRef",
              targetPath: "metadata.labels",
              targetValue: workload.labels,
              targetType: "object",
              relationKind: "service-selector"
            });
          }
        });
      });
      resources.forEach((resource) => {
        const kind = cleanYamlValue(resource.kind || "Resource");
        const name = getResourceName(resource);
        const namespace = getNamespace(resource);
        const from = getResourceId(kind, name, namespace);
        const refs = collectRefs(resource, [], "").concat(collectRawRefs(resource));
        if (kind === "Ingress") refs.push(...collectIngressBackends(resource));
        if (kind === "RoleBinding" || kind === "ClusterRoleBinding") refs.push(...collectRoleBindingRefs(resource));
        addServiceAccountRefs(resource, refs);
        refs.forEach((ref) => {
          const refNamespace = ref.namespace || namespace;
          const to = resourceIds.get(`${refNamespace}/${ref.kind}/${ref.name}`) || resourceIds.get(`${ref.kind}/${ref.name}`) || getResourceId(ref.kind, ref.name, refNamespace);
          const targetNode = addNode(nodes, to, `${ref.kind}/${ref.name}`, ref.kind, { name: cleanYamlValue(ref.name), namespace: refNamespace });
          ensureField(targetNode, "metadata.name", { type: "string", value: ref.name, relationRole: "target" });
          addEdge(nodes, edges, from, to, ref.label || "references", ref.reason || `${kind}/${name} references ${ref.kind}/${ref.name}.`, {
            sourcePath: ref.sourcePath || "metadata.name",
            sourceValue: ref.name,
            targetPath: ref.targetPath || "metadata.name",
            targetValue: ref.name,
            relationKind: ref.relationKind || (ref.label || "references")
          });
        });
      });
      if (!resources.length && String(yamlText || "").trim()) warnings.push("No Kubernetes resources were detected in the provided YAML.");
      return {
        schemaVersion: SCHEMA_VERSION,
        nodes,
        edges,
        warnings,
        sourceRefs: Array.isArray(options.sourceRefs) ? options.sourceRefs : []
      };
    }

    const api = { buildFromYaml };
    app?.registerModule?.("kubernetesManifestGraph", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesManifestGraph = registerMarkdownViewerKubernetesManifestGraph;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKubernetesManifestGraph };
})(typeof window !== "undefined" ? window : globalThis);
