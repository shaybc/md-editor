(function(global) {
  "use strict";

  /** Convert one reviewed RAT action into a previewable text change plan. */
  function registerMarkdownViewerRatChangePlanner(app, deps = {}) {
    function normalizePath(value) {
      return String(value || "").replace(/\\/g, "/").replace(/\/+$/, "");
    }

    function relativePath(root, path) {
      const base = normalizePath(root);
      const target = normalizePath(path);
      return target.toLowerCase().startsWith(`${base.toLowerCase()}/`) ? target.slice(base.length + 1) : target;
    }

    function addHeader(content, header, extension) {
      const text = String(content || "");
      const eol = text.includes("\r\n") ? "\r\n" : "\n";
      const comment = ["xml", "html"].includes(extension)
        ? `<!--${eol}${header}${eol}-->${eol}`
        : ["properties", "sh", "py", "yaml", "yml"].includes(extension)
          ? header.split(/\r?\n/).map((line) => `# ${line}`).join(eol) + eol
          : `/*${eol}${header}${eol}*/${eol}`;
      const shebangEnd = text.startsWith("#!") ? text.indexOf("\n") + 1 : 0;
      const xmlDeclaration = text.slice(shebangEnd).match(/^<\?xml[^>]*\?>\s*/)?.[0] || "";
      const offset = shebangEnd + xmlDeclaration.length;
      return text.slice(0, offset) + comment + text.slice(offset);
    }

    async function readContent(path) {
      const snapshot = deps.tabs?.getExternalDocumentSnapshot?.(path);
      if (snapshot) return { content: snapshot.content, snapshot };
      return {
        content: await (deps.Neutralino || global.Neutralino).filesystem.readFile(path),
        snapshot: { path, isOpen: false, isDirty: false }
      };
    }

    async function readOptionalContent(path) {
      try {
        return { ...(await readContent(path)), exists: true };
      } catch (_error) {
        return { content: "", snapshot: { path, isOpen: false, isDirty: false }, exists: false };
      }
    }

    function requireWorkspacePath(context, path) {
      const root = normalizePath(context.projectPath).toLowerCase();
      const target = normalizePath(path);
      const key = target.toLowerCase();
      if (!root || (key !== root && !key.startsWith(`${root}/`))) {
        throw new Error("RAT configuration files must stay inside the opened workspace.");
      }
      return target;
    }

    async function plan(actionId, context, input = {}) {
      const changes = [];
      const warnings = [];
      let title = "";
      let expectedEffect = "investigation-only";
      if (actionId === "resolution.add-header") {
        if (context.inspection?.classification === "binary") throw new Error("Binary files cannot receive a source license header.");
        if (!input.authorized) throw new Error("Confirm that the project is authorized to apply this license header.");
        const path = context.finding.filePath;
        const before = await readContent(path);
        const after = addHeader(before.content, input.headerText, context.inspection?.extension || "");
        changes.push({ type: "modify", path, beforeContent: before.content, afterContent: after, snapshot: before.snapshot });
        title = "Add project license header";
        expectedEffect = "clears-finding";
      } else if (actionId === "resolution.exclude-file" || actionId === "resolution.exclude-pattern") {
        if (!String(input.rationale || "").trim()) throw new Error("A rationale is required for a RAT exclusion.");
        const pomPath = input.pomPath || context.governing?.pomPath || context.module.pomPath;
        const before = await readContent(pomPath);
        const pattern = actionId === "resolution.exclude-file"
          ? relativePath(input.scopeRoot || context.module.projectRoot, context.finding.filePath)
          : String(input.pattern || "").trim();
        if (!pattern) throw new Error("Enter a reviewed exclusion pattern.");
        if (actionId === "resolution.exclude-pattern" && (/^\*+$/.test(pattern) || pattern === "**/*")) {
          throw new Error("The exclusion pattern is too broad.");
        }
        const legacy = context.governing?.version && /^0\.(?:[0-9]|1[0-6])(?:\.|$)/.test(context.governing.version);
        const exclusionFilePath = String(input.exclusionFilePath || "").trim();
        let after;
        if (exclusionFilePath) {
          const externalPath = requireWorkspacePath(context, exclusionFilePath);
          const external = await readOptionalContent(externalPath);
          const eol = external.content.includes("\r\n") ? "\r\n" : "\n";
          const externalAfter = external.content && !external.content.endsWith("\n")
            ? `${external.content}${eol}${pattern}${eol}`
            : `${external.content}${pattern}${eol}`;
          changes.push({
            type: external.exists ? "modify" : "create",
            path: externalPath,
            beforeContent: external.content,
            afterContent: externalAfter,
            snapshot: external.snapshot
          });
          after = deps.xmlEditPlanner.addExcludeFile(before.content, relativePath(context.module.projectRoot, externalPath));
        } else {
          after = deps.xmlEditPlanner.addExclude(before.content, pattern, { legacy });
        }
        changes.push({ type: "modify", path: pomPath, beforeContent: before.content, afterContent: after, snapshot: before.snapshot });
        title = actionId === "resolution.exclude-file" ? "Exclude exact file from RAT" : "Exclude reviewed file pattern from RAT";
        expectedEffect = "clears-finding";
        warnings.push("Exclusion stops RAT inspection; it does not approve or determine the file's license.");
        if (actionId === "resolution.exclude-pattern") {
          const impact = await deps.patternImpact.findMatches(input.scopeRoot || context.module.projectRoot, pattern);
          warnings.push(`Current pattern impact: ${impact.matches.length} matching file(s) after scanning ${impact.scanned}.`);
          if (impact.truncated) warnings.push("Pattern impact was truncated; narrow the pattern or inspect the remaining tree manually.");
          input.patternMatches = impact.matches;
        }
      } else if (actionId === "resolution.approve-license-family") {
        if (!input.familyId || !input.matcherEvidence) throw new Error("A license family and matcher evidence are required.");
        if (context.governing?.version && /^0\.(?:[0-9]|1[0-5])(?:\.|$)/.test(context.governing.version)) {
          throw new Error("Inline declarative custom licenses require Apache RAT 0.16 or newer.");
        }
        const pomPath = input.pomPath || context.governing?.pomPath || context.module.pomPath;
        const before = await readContent(pomPath);
        const after = deps.xmlEditPlanner.addCustomLicense(before.content, input);
        changes.push({ type: "modify", path: pomPath, beforeContent: before.content, afterContent: after, snapshot: before.snapshot });
        title = "Recognize and approve custom license family in RAT";
        expectedEffect = "clears-finding";
        warnings.push("RAT approval records project policy; it is not a legal compatibility opinion.");
      } else if (actionId === "advanced.disable-execution") {
        if (!input.acknowledged) throw new Error("Acknowledge that this change bypasses license verification.");
        const pomPath = input.pomPath || context.governing?.pomPath || context.module.pomPath;
        const before = await readContent(pomPath);
        const after = deps.xmlEditPlanner.addSkip(before.content);
        changes.push({ type: "modify", path: pomPath, beforeContent: before.content, afterContent: after, snapshot: before.snapshot });
        title = "Configure RAT to skip this scope";
        expectedEffect = "audit-bypass";
        warnings.push("This suppresses the audit and does not resolve the licensing question.");
      } else if (actionId === "documentation.third-party") {
        const path = input.documentationPath;
        if (!path) throw new Error("Select an existing third-party documentation file.");
        const before = await readContent(path);
        const entry = [
          "",
          `## ${input.component || "Third-party component"}`,
          "",
          `- Source: ${input.upstreamUrl || "Unknown"}`,
          `- Version: ${input.version || "Unknown"}`,
          `- Copyright: ${input.copyrightHolder || "Unknown"}`,
          `- License: ${input.license || "Unknown"}`,
          `- Local paths: ${input.localPaths || context.finding.filePath}`,
          ""
        ].join(before.content.includes("\r\n") ? "\r\n" : "\n");
        changes.push({ type: "modify", path, beforeContent: before.content, afterContent: before.content.replace(/\s*$/, "") + entry, snapshot: before.snapshot });
        title = "Record third-party license and provenance";
        warnings.push("Documentation alone does not clear the RAT finding.");
      } else {
        throw new Error(`The RAT action ${actionId} does not create a text change plan.`);
      }
      return {
        actionId,
        title,
        changes,
        warnings,
        expectedEffect,
        patternMatches: Array.isArray(input.patternMatches) ? input.patternMatches : [],
        affectedPaths: changes.map((change) => change.path)
      };
    }

    const api = { addHeader, plan };
    app?.registerModule?.("ratChangePlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatChangePlanner = registerMarkdownViewerRatChangePlanner;
})(typeof window !== "undefined" ? window : globalThis);
