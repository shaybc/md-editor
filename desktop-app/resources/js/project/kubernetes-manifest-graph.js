// Build a lightweight graph from Kubernetes YAML manifests.
(function(global) {
  "use strict";

  /** Register manifest graph extraction helpers. */
  function registerMarkdownViewerKubernetesManifestGraph(app) {
    function parseDocuments(yamlText) {
      const yaml = global.jsyaml || global.jsYaml || global.YAML;
      if (yaml?.loadAll) {
        const documents = [];
        try { yaml.loadAll(String(yamlText || ""), (doc) => { if (doc && typeof doc === "object") documents.push(doc); }); } catch (_error) {}
        if (documents.length) return documents;
      }
      return String(yamlText || "").split(/^---\s*$/m).map(parseSimpleDocument).filter(Boolean);
    }

    function parseSimpleDocument(text) {
      const doc = {};
      const nameMatch = String(text || "").match(/^\s*name:\s*([^\r\n#]+)/m);
      const namespaceMatch = String(text || "").match(/^\s*namespace:\s*([^\r\n#]+)/m);
      const apiVersionMatch = String(text || "").match(/^apiVersion:\s*([^\r\n#]+)/m);
      const kindMatch = String(text || "").match(/^kind:\s*([^\r\n#]+)/m);
      if (!apiVersionMatch && !kindMatch) return null;
      doc.apiVersion = apiVersionMatch?.[1]?.trim() || "";
      doc.kind = kindMatch?.[1]?.trim() || "";
      doc.metadata = { name: nameMatch?.[1]?.trim() || "", namespace: namespaceMatch?.[1]?.trim() || "" };
      doc.__rawText = String(text || "");
      return doc;
    }

    function addNode(nodes, id, label, kind) {
      if (!id || nodes.some((node) => node.id === id)) return;
      nodes.push({ id, label, kind });
    }

    function addEdge(edges, from, to, label) {
      if (!from || !to || from === to || edges.some((edge) => edge.from === from && edge.to === to && edge.label === label)) return;
      edges.push({ from, to, label });
    }

    function getResourceName(resource) {
      return resource?.metadata?.name || resource?.kind || "resource";
    }

    function getNamespace(resource) {
      return resource?.metadata?.namespace || "default";
    }

    function collectRefs(value, refs = []) {
      if (!value || typeof value !== "object") return refs;
      if (value.configMapRef?.name) refs.push({ kind: "ConfigMap", name: value.configMapRef.name });
      if (value.secretRef?.name) refs.push({ kind: "Secret", name: value.secretRef.name });
      if (value.configMapKeyRef?.name) refs.push({ kind: "ConfigMap", name: value.configMapKeyRef.name });
      if (value.secretKeyRef?.name) refs.push({ kind: "Secret", name: value.secretKeyRef.name });
      Object.keys(value).forEach((key) => collectRefs(value[key], refs));
      return refs;
    }

    function collectRawRefs(resource) {
      const rawText = String(resource?.__rawText || "");
      if (!rawText) return [];
      const refs = [];
      const patterns = [
        { kind: "ConfigMap", regex: /configMap(?:Key)?Ref:\s*[\r\n]+\s*name:\s*([^\s#]+)/gi },
        { kind: "Secret", regex: /secret(?:Key)?Ref:\s*[\r\n]+\s*name:\s*([^\s#]+)/gi }
      ];
      patterns.forEach((pattern) => {
        let match;
        while ((match = pattern.regex.exec(rawText))) {
          refs.push({ kind: pattern.kind, name: match[1].replace(/^["']|["']$/g, "") });
        }
      });
      return refs;
    }
    /** Build graph nodes and edges from rendered or saved manifest YAML. */
    function buildFromYaml(yamlText) {
      const resources = parseDocuments(yamlText);
      const nodes = [];
      const edges = [];
      const resourceIds = new Map();
      resources.forEach((resource) => {
        const kind = resource.kind || "Resource";
        const name = getResourceName(resource);
        const namespace = getNamespace(resource);
        const resourceId = `${namespace}/${kind}/${name}`;
        resourceIds.set(`${kind}/${name}`, resourceId);
        addNode(nodes, `namespace/${namespace}`, namespace, "Namespace");
        addNode(nodes, resourceId, `${kind}/${name}`, kind);
        addEdge(edges, `namespace/${namespace}`, resourceId, "contains");
        if (["Deployment", "StatefulSet", "DaemonSet", "ReplicaSet"].includes(kind)) {
          const podId = `${resourceId}/pod-template`;
          addNode(nodes, podId, `${name} pod template`, "PodTemplate");
          addEdge(edges, resourceId, podId, "creates");
        }
      });
      resources.forEach((resource) => {
        const kind = resource.kind || "Resource";
        const name = getResourceName(resource);
        const namespace = getNamespace(resource);
        const from = `${namespace}/${kind}/${name}`;
        collectRefs(resource).concat(collectRawRefs(resource)).forEach((ref) => {
          const to = resourceIds.get(`${ref.kind}/${ref.name}`) || `${namespace}/${ref.kind}/${ref.name}`;
          addNode(nodes, to, `${ref.kind}/${ref.name}`, ref.kind);
          addEdge(edges, from, to, "references");
        });
      });
      return { nodes, edges };
    }

    const api = { buildFromYaml };
    app?.registerModule?.("kubernetesManifestGraph", api);
    return api;
  }

  global.registerMarkdownViewerKubernetesManifestGraph = registerMarkdownViewerKubernetesManifestGraph;
  if (typeof module !== "undefined" && module.exports) module.exports = { registerMarkdownViewerKubernetesManifestGraph };
})(typeof window !== "undefined" ? window : globalThis);