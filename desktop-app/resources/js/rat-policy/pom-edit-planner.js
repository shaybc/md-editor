(function(global) {
  "use strict";

  /** Plan narrow Maven POM edits that activate Apache RAT policy. */
  function registerMarkdownViewerRatPolicyPomEditPlanner(app, deps = {}) {
    function eol(text) {
      return String(text || "").includes("\r\n") ? "\r\n" : "\n";
    }

    function indentationBefore(text, offset) {
      const lineStart = String(text || "").lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
      return String(text || "").slice(lineStart, offset).match(/^\s*/)?.[0] || "";
    }

    function findRatPlugin(text) {
      const source = String(text || "");
      const pattern = /<plugin(?:\s[^>]*)?>([\s\S]*?<artifactId>\s*apache-rat-plugin\s*<\/artifactId>[\s\S]*?)<\/plugin>/gi;
      let match;
      while ((match = pattern.exec(source))) {
        const prefix = source.slice(0, match.index);
        const managementStart = prefix.lastIndexOf("<pluginManagement");
        const managementEnd = prefix.lastIndexOf("</pluginManagement>");
        if (managementStart > managementEnd) continue;
        return { start: match.index, end: match.index + match[0].length, text: match[0] };
      }
      return null;
    }

    function executionXml(indent, lineEnding) {
      return [
        `${indent}<execution>`,
        `${indent}  <id>rat-check</id>`,
        `${indent}  <phase>verify</phase>`,
        `${indent}  <goals>`,
        `${indent}    <goal>check</goal>`,
        `${indent}  </goals>`,
        `${indent}</execution>`
      ].join(lineEnding);
    }

    function addExecution(pluginText) {
      if (/<goal>\s*check\s*<\/goal>/i.test(pluginText)) return pluginText;
      const lineEnding = eol(pluginText);
      const executions = /<executions(?:\s[^>]*)?>([\s\S]*?)<\/executions>/i.exec(pluginText);
      if (executions) {
        const close = executions.index + executions[0].lastIndexOf("</executions>");
        const indent = indentationBefore(pluginText, close);
        return pluginText.slice(0, close) + executionXml(`${indent}  `, lineEnding) + lineEnding + pluginText.slice(close);
      }
      const close = pluginText.lastIndexOf("</plugin>");
      if (close < 0) throw new Error("The Apache RAT plugin structure is ambiguous.");
      const indent = indentationBefore(pluginText, close);
      return pluginText.slice(0, close)
        + `${indent}  <executions>${lineEnding}${executionXml(`${indent}    `, lineEnding)}${lineEnding}${indent}  </executions>${lineEnding}`
        + pluginText.slice(close);
    }

    function addVersion(pluginText, version) {
      if (/<version(?:\s[^>]*)?>[\s\S]*?<\/version>/i.test(pluginText)) return pluginText;
      const artifact = /<artifactId>\s*apache-rat-plugin\s*<\/artifactId>/i.exec(pluginText);
      if (!artifact) throw new Error("The Apache RAT plugin artifact could not be located safely.");
      const lineEnding = eol(pluginText);
      const offset = artifact.index + artifact[0].length;
      const indent = indentationBefore(pluginText, artifact.index);
      return pluginText.slice(0, offset) + `${lineEnding}${indent}<version>${escapeXml(version)}</version>` + pluginText.slice(offset);
    }

    function deactivateCheckExecution(pluginText) {
      const executions = /<execution(?:\s[^>]*)?>([\s\S]*?<goal>\s*check\s*<\/goal>[\s\S]*?)<\/execution>/i.exec(pluginText);
      if (!executions) throw new Error("No Apache RAT check execution could be deactivated safely.");
      return pluginText.slice(0, executions.index) + pluginText.slice(executions.index + executions[0].length);
    }

    function escapeXml(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function pluginXml(indent, draft, lineEnding) {
      const execution = draft.bindToVerify
        ? `${lineEnding}${indent}  <executions>${lineEnding}${executionXml(`${indent}    `, lineEnding)}${lineEnding}${indent}  </executions>`
        : "";
      return [
        `${indent}<plugin>`,
        `${indent}  <groupId>org.apache.rat</groupId>`,
        `${indent}  <artifactId>apache-rat-plugin</artifactId>`,
        `${indent}  <version>${escapeXml(draft.pluginVersion)}</version>${execution}`,
        `${indent}</plugin>`
      ].join(lineEnding);
    }

    function insertPlugin(text, draft) {
      const lineEnding = eol(text);
      const pluginsPattern = /<\/plugins>/gi;
      let pluginsMatch;
      let pluginsClose = -1;
      while ((pluginsMatch = pluginsPattern.exec(String(text || "")))) {
        const prefix = String(text || "").slice(0, pluginsMatch.index);
        if (prefix.lastIndexOf("<pluginManagement") > prefix.lastIndexOf("</pluginManagement>")) continue;
        pluginsClose = pluginsMatch.index;
        break;
      }
      if (pluginsClose >= 0) {
        const indent = indentationBefore(text, pluginsClose);
        return text.slice(0, pluginsClose) + pluginXml(indent, draft, lineEnding) + lineEnding + text.slice(pluginsClose);
      }
      const buildClose = String(text || "").indexOf("</build>");
      if (buildClose >= 0) {
        const indent = indentationBefore(text, buildClose);
        return text.slice(0, buildClose)
          + `${indent}<plugins>${lineEnding}${pluginXml(`${indent}  `, draft, lineEnding)}${lineEnding}${indent}</plugins>${lineEnding}`
          + text.slice(buildClose);
      }
      const projectClose = String(text || "").lastIndexOf("</project>");
      if (projectClose < 0) throw new Error("A safe Apache RAT insertion point was not found in pom.xml.");
      return text.slice(0, projectClose)
        + `  <build>${lineEnding}    <plugins>${lineEnding}${pluginXml("      ", draft, lineEnding)}${lineEnding}    </plugins>${lineEnding}  </build>${lineEnding}`
        + text.slice(projectClose);
    }

    /** Add or activate RAT without serializing the complete POM. */
    function plan(text, draft) {
      const plugin = findRatPlugin(text);
      let after;
      if (plugin) {
        let replacement = addVersion(plugin.text, draft.pluginVersion);
        if (draft.bindToVerify) replacement = addExecution(replacement);
        if (draft.disableExecution) replacement = deactivateCheckExecution(replacement);
        after = text.slice(0, plugin.start) + replacement + text.slice(plugin.end);
      } else {
        after = insertPlugin(text, draft);
      }
      deps.xmlEditPlanner?.validateXml?.(after);
      return after;
    }

    const api = { findRatPlugin, plan };
    app?.registerModule?.("ratPolicyPomEditPlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatPolicyPomEditPlanner = registerMarkdownViewerRatPolicyPomEditPlanner;
})(typeof window !== "undefined" ? window : globalThis);
