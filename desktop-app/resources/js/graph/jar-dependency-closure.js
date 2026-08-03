/**
 * External JAR dependency closure traversal.
 *
 * Walks directed graph links from source-selected JAR roots through JAR-to-JAR
 * relationships. This module is pure and performs no export or UI side effects.
 */
(function (global) {
  /**
   * Collect direct and transitive external JAR nodes.
   * @param {object} options - Graph accessors and source nodes.
   * @returns {{nodes: object[], directNodeIds: string[], transitiveNodeIds: string[]}}
   */
  function collectExternalJarDependencyClosure(options = {}) {
    const sourceNodeIds = new Set((options.sourceNodes || []).map((node) => node?.id).filter(Boolean));
    const links = Array.isArray(options.links) ? options.links : [];
    const getSourceId = options.getSourceId || ((link) => link?.source);
    const getTargetId = options.getTargetId || ((link) => link?.target);
    const getNodeById = options.getNodeById || (() => null);
    const isExternalJarNode = options.isExternalJarNode || (() => false);
    const outgoing = new Map();

    links.forEach((link) => {
      const sourceId = getSourceId(link);
      const targetId = getTargetId(link);
      if (!sourceId || !targetId) return;
      if (!outgoing.has(sourceId)) outgoing.set(sourceId, []);
      outgoing.get(sourceId).push(targetId);
    });

    const directNodeIds = new Set();
    sourceNodeIds.forEach((sourceId) => {
      (outgoing.get(sourceId) || []).forEach((targetId) => {
        if (isExternalJarNode(getNodeById(targetId))) directNodeIds.add(targetId);
      });
    });

    const visited = new Set();
    const queue = Array.from(directNodeIds);
    while (queue.length) {
      const nodeId = queue.shift();
      if (!nodeId || visited.has(nodeId)) continue;
      const node = getNodeById(nodeId);
      if (!isExternalJarNode(node)) continue;
      visited.add(nodeId);
      (outgoing.get(nodeId) || []).forEach((targetId) => {
        if (!visited.has(targetId) && isExternalJarNode(getNodeById(targetId))) queue.push(targetId);
      });
    }

    return {
      nodes: Array.from(visited).map(getNodeById).filter(Boolean),
      directNodeIds: Array.from(directNodeIds),
      transitiveNodeIds: Array.from(visited).filter((nodeId) => !directNodeIds.has(nodeId))
    };
  }

  global.MdEditorJarDependencyClosure = Object.freeze({
    collectExternalJarDependencyClosure
  });
})(typeof window !== "undefined" ? window : globalThis);
