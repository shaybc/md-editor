(function(global) {
  "use strict";

  /** Plan narrow, formatting-preserving Apache RAT POM edits. */
  function registerMarkdownViewerRatXmlEditPlanner(app) {
    function lineEnding(text) {
      return String(text || "").includes("\r\n") ? "\r\n" : "\n";
    }

    function indentationBefore(text, offset) {
      const lineStart = String(text || "").lastIndexOf("\n", Math.max(0, offset - 1)) + 1;
      return String(text || "").slice(lineStart, offset).match(/^\s*/)?.[0] || "";
    }

    function validateXml(text) {
      if (typeof global.DOMParser !== "function") return true;
      const document = new global.DOMParser().parseFromString(String(text || ""), "application/xml");
      if (document.querySelector?.("parsererror")) throw new Error("The proposed RAT configuration is not valid XML.");
      return true;
    }

    function findRatPlugin(text) {
      const pattern = /<plugin(?:\s[^>]*)?>([\s\S]*?<artifactId>\s*apache-rat-plugin\s*<\/artifactId>[\s\S]*?)<\/plugin>/i;
      const match = pattern.exec(String(text || ""));
      if (!match) return null;
      return { start: match.index, end: match.index + match[0].length, text: match[0] };
    }

    function insertIntoConfiguration(pluginText, elementXml) {
      const eol = lineEnding(pluginText);
      const configuration = /<configuration(?:\s[^>]*)?>([\s\S]*?)<\/configuration>/i.exec(pluginText);
      if (configuration) {
        const closeOffset = configuration.index + configuration[0].lastIndexOf("</configuration>");
        const baseIndent = indentationBefore(pluginText, closeOffset);
        const childIndent = `${baseIndent}  `;
        return pluginText.slice(0, closeOffset) + `${childIndent}${elementXml}${eol}` + pluginText.slice(closeOffset);
      }
      const closeOffset = pluginText.lastIndexOf("</plugin>");
      if (closeOffset < 0) throw new Error("The Apache RAT plugin XML is ambiguous.");
      const pluginIndent = indentationBefore(pluginText, closeOffset);
      return pluginText.slice(0, closeOffset)
        + `${pluginIndent}  <configuration>${eol}${pluginIndent}    ${elementXml}${eol}${pluginIndent}  </configuration>${eol}`
        + pluginText.slice(closeOffset);
    }

    function insertPlugin(text, configurationXml) {
      const eol = lineEnding(text);
      const pluginsClose = String(text || "").indexOf("</plugins>");
      if (pluginsClose >= 0) {
        const indent = indentationBefore(text, pluginsClose);
        const plugin = `${indent}<plugin>${eol}${indent}  <groupId>org.apache.rat</groupId>${eol}${indent}  <artifactId>apache-rat-plugin</artifactId>${eol}${indent}  <configuration>${eol}${indent}    ${configurationXml}${eol}${indent}  </configuration>${eol}${indent}</plugin>${eol}`;
        return text.slice(0, pluginsClose) + plugin + text.slice(pluginsClose);
      }
      const buildClose = String(text || "").indexOf("</build>");
      if (buildClose >= 0) {
        const indent = indentationBefore(text, buildClose);
        const block = `${indent}<plugins>${eol}${indent}  <plugin>${eol}${indent}    <groupId>org.apache.rat</groupId>${eol}${indent}    <artifactId>apache-rat-plugin</artifactId>${eol}${indent}    <configuration>${eol}${indent}      ${configurationXml}${eol}${indent}    </configuration>${eol}${indent}  </plugin>${eol}${indent}</plugins>${eol}`;
        return text.slice(0, buildClose) + block + text.slice(buildClose);
      }
      const projectClose = String(text || "").lastIndexOf("</project>");
      if (projectClose < 0) throw new Error("A safe insertion point was not found in pom.xml.");
      const block = `  <build>${eol}    <plugins>${eol}      <plugin>${eol}        <groupId>org.apache.rat</groupId>${eol}        <artifactId>apache-rat-plugin</artifactId>${eol}        <configuration>${eol}          ${configurationXml}${eol}        </configuration>${eol}      </plugin>${eol}    </plugins>${eol}  </build>${eol}`;
      return text.slice(0, projectClose) + block + text.slice(projectClose);
    }

    function appendConfigurationElement(text, elementXml) {
      const plugin = findRatPlugin(text);
      let after;
      if (plugin) {
        const replacement = insertIntoConfiguration(plugin.text, elementXml);
        after = text.slice(0, plugin.start) + replacement + text.slice(plugin.end);
      } else {
        after = insertPlugin(text, elementXml);
      }
      validateXml(after);
      return after;
    }

    function escapeXml(value) {
      return String(value || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
    }

    function addExclude(text, pattern, options = {}) {
      const tag = options.legacy ? "exclude" : "inputExclude";
      return appendConfigurationElement(text, `<${tag}>${escapeXml(pattern)}</${tag}>`);
    }

    function addExcludeFile(text, path) {
      return appendConfigurationElement(text, `<inputExcludeFile>${escapeXml(path)}</inputExcludeFile>`);
    }

    function addSkip(text) {
      return appendConfigurationElement(text, "<skip>true</skip>");
    }

    function addCustomLicense(text, definition = {}) {
      if (/<(?:licenses|families|approvedLicenses)(?:\s[^>]*)?>/i.test(String(text || ""))) {
        throw new Error("Existing custom license collections require manual merging; automatic editing was disabled to preserve their structure.");
      }
      const familyId = escapeXml(definition.familyId);
      const familyName = escapeXml(definition.familyName || definition.familyId);
      const matcherType = ["text", "regex", "spdx"].includes(definition.matcherType) ? definition.matcherType : "text";
      const matcher = escapeXml(definition.matcherEvidence);
      const fragment = [
        "<licenses>",
        "  <license>",
        `    <family>${familyId}</family>`,
        "    <notes></notes>",
        `    <${matcherType}>${matcher}</${matcherType}>`,
        "  </license>",
        "</licenses>",
        "<families>",
        "  <family>",
        `    <id>${familyId}</id>`,
        `    <name>${familyName}</name>`,
        "  </family>",
        "</families>",
        `<licenseFamiliesApproved>${familyId}</licenseFamiliesApproved>`
      ].join(lineEnding(text));
      return appendConfigurationElement(text, fragment);
    }

    const api = { addCustomLicense, addExclude, addExcludeFile, addSkip, appendConfigurationElement, validateXml };
    app?.registerModule?.("ratXmlEditPlanner", api);
    return api;
  }

  global.registerMarkdownViewerRatXmlEditPlanner = registerMarkdownViewerRatXmlEditPlanner;
})(typeof window !== "undefined" ? window : globalThis);
