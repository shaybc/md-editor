(function(global) {
  "use strict";

  /** Inspect a reported file safely, including bounded binary signature data. */
  function registerMarkdownViewerRatFileInspector(app, deps = {}) {
    const TEXT_EXTENSIONS = new Set(["java", "js", "ts", "xml", "html", "css", "md", "txt", "json", "yaml", "yml", "properties", "sh", "cmd", "bat", "py", "kt", "scala", "sql", "csv"]);

    function extension(path) {
      return String(path || "").toLowerCase().match(/\.([a-z0-9_-]+)$/)?.[1] || "";
    }

    function bytesToHex(bytes) {
      return Array.from(bytes || []).map((value) => Number(value).toString(16).padStart(2, "0")).join(" ");
    }

    function bytesToAscii(bytes) {
      return Array.from(bytes || []).map((value) => value >= 32 && value <= 126 ? String.fromCharCode(value) : ".").join("");
    }

    function looksBinary(bytes) {
      const values = Array.from(bytes || []);
      return values.some((value) => value === 0) || values.filter((value) => value < 9 || (value > 13 && value < 32)).length > values.length / 10;
    }

    async function inspect(path, options = {}) {
      if (!path) return { exists: false, path: "" };
      const filesystem = (deps.Neutralino || global.Neutralino)?.filesystem;
      let stats;
      try {
        stats = await filesystem.getStats(path);
      } catch (_error) {
        return { exists: false, path };
      }
      if (stats.isDirectory === true) {
        return {
          exists: true,
          path,
          size: 0,
          classification: "project",
          generatedLooking: false,
          signatureHex: "",
          signatureAscii: "",
          sampleTruncated: false
        };
      }
      const data = await filesystem.readBinaryFile(path);
      const allBytes = new Uint8Array(data);
      const sample = allBytes.slice(0, Math.min(Number(options.sampleSize) || 256, allBytes.length));
      const binary = !TEXT_EXTENSIONS.has(extension(path)) && looksBinary(sample);
      return {
        exists: true,
        path,
        extension: extension(path),
        size: Number(stats.size || allBytes.length || 0),
        createdAt: stats.createdAt || null,
        modifiedAt: stats.modifiedAt || null,
        classification: binary ? "binary" : "text",
        generatedLooking: /(?:^|[\\/])(?:target|build|generated|snapshots?|fixtures?)(?:[\\/]|$)/i.test(path),
        signatureHex: bytesToHex(sample.slice(0, 32)),
        signatureAscii: bytesToAscii(sample.slice(0, 32)),
        sampleTruncated: allBytes.length > sample.length
      };
    }

    async function sha256(path) {
      const filesystem = (deps.Neutralino || global.Neutralino)?.filesystem;
      if (stats.isDirectory === true) {
        return {
          exists: true,
          path,
          size: 0,
          classification: "project",
          generatedLooking: false,
          signatureHex: "",
          signatureAscii: "",
          sampleTruncated: false
        };
      }
      const data = await filesystem.readBinaryFile(path);
      if (!global.crypto?.subtle) throw new Error("SHA-256 is unavailable in this runtime.");
      const digest = await global.crypto.subtle.digest("SHA-256", data);
      return bytesToHex(new Uint8Array(digest)).replace(/ /g, "");
    }

    const api = { inspect, sha256 };
    app?.registerModule?.("ratFileInspector", api);
    return api;
  }

  global.registerMarkdownViewerRatFileInspector = registerMarkdownViewerRatFileInspector;
})(typeof window !== "undefined" ? window : globalThis);
