/**
 * Maven runtime dependency tree normalization.
 *
 * Converts Maven Dependency Plugin JSON into the stable artifact and edge model
 * consumed by recovery updates. This module is pure and performs no filesystem IO.
 */
(function (global) {
  const normalizeText = (value) => String(value || "").trim();

  const coordinateKey = (artifact) => [
    normalizeText(artifact?.groupId),
    normalizeText(artifact?.artifactId),
    normalizeText(artifact?.version)
  ].join(":");

  const artifactKey = (artifact) => [
    coordinateKey(artifact),
    normalizeText(artifact?.type || "jar"),
    normalizeText(artifact?.classifier)
  ].join(":");

  const expectedJarFileName = (artifact) => {
    const artifactId = normalizeText(artifact?.artifactId);
    const version = normalizeText(artifact?.version);
    const classifier = normalizeText(artifact?.classifier);
    if (!artifactId || !version) return "";
    return `${artifactId}-${version}${classifier ? `-${classifier}` : ""}.jar`;
  };

  const joinRelativePath = (folder, fileName) => {
    const left = normalizeText(folder).replace(/\\/g, "/").replace(/\/+$/, "");
    const right = normalizeText(fileName).replace(/^\/+/, "");
    return left ? `${left}/${right}` : right;
  };

  /**
   * Normalize a Maven dependency:tree JSON document.
   * @param {object} root - Maven's synthetic project root.
   * @param {object} options - Target-folder options for copied artifacts.
   * @returns {{artifacts: object[], edges: object[], directArtifactKeys: string[]}}
   */
  function normalizeMavenRuntimeTree(root, options = {}) {
    const targetJarRelativeFolder = options.targetJarRelativeFolder || "lib/external";
    const artifacts = new Map();
    const edges = new Map();
    const directArtifactKeys = [];

    const visit = (node, parentArtifactKey, isDirect) => {
      if (!node || typeof node !== "object") return;
      const type = normalizeText(node.type || "jar");
      const isJar = type === "jar";
      const currentArtifactKey = isJar ? artifactKey(node) : "";

      if (isJar && normalizeText(node.groupId) && normalizeText(node.artifactId) && normalizeText(node.version)) {
        const fileName = expectedJarFileName(node);
        artifacts.set(currentArtifactKey, {
          artifactKey: currentArtifactKey,
          coordinateKey: coordinateKey(node),
          groupId: normalizeText(node.groupId),
          artifactId: normalizeText(node.artifactId),
          version: normalizeText(node.version),
          type,
          classifier: normalizeText(node.classifier),
          scope: normalizeText(node.scope),
          optional: normalizeText(node.optional).toLowerCase() === "true",
          direct: !!isDirect,
          expectedJarFileName: fileName,
          expectedJarRelativePath: joinRelativePath(targetJarRelativeFolder, fileName)
        });
        if (isDirect) directArtifactKeys.push(currentArtifactKey);
        if (parentArtifactKey) {
          const edgeKey = `${parentArtifactKey}->${currentArtifactKey}`;
          edges.set(edgeKey, { fromArtifactKey: parentArtifactKey, toArtifactKey: currentArtifactKey });
        }
      }

      const nextParentKey = currentArtifactKey || parentArtifactKey;
      (Array.isArray(node.children) ? node.children : []).forEach((child) => {
        visit(child, nextParentKey, !parentArtifactKey && !currentArtifactKey);
      });
    };

    (Array.isArray(root?.children) ? root.children : []).forEach((child) => visit(child, "", true));
    return {
      artifacts: Array.from(artifacts.values()).sort((left, right) => left.artifactKey.localeCompare(right.artifactKey)),
      edges: Array.from(edges.values()).sort((left, right) =>
        `${left.fromArtifactKey}:${left.toArtifactKey}`.localeCompare(`${right.fromArtifactKey}:${right.toArtifactKey}`)),
      directArtifactKeys: Array.from(new Set(directArtifactKeys)).sort()
    };
  }

  global.MdEditorMavenRuntimeTree = Object.freeze({
    artifactKey,
    coordinateKey,
    expectedJarFileName,
    normalizeMavenRuntimeTree
  });
})(typeof window !== "undefined" ? window : globalThis);
