(function(global) {
  global.registerMarkdownViewerGraphPackageSummary = function registerMarkdownViewerGraphPackageSummary(app, deps) {
    const api = {};

    with (deps) {
    function deriveMissingPackageBucket(symbol, kind = "", language = "") {
      const normalized = String(symbol || "")
        .trim()
        .replace(/\.\*$/, "")
        .replace(/\.$/, "");
      const normalizedLanguage = String(language || "").toLowerCase();
      if (!normalized) return "";

      if (normalizedLanguage === "javascript" || normalizedLanguage === "typescript") {
        if (normalized.startsWith("@")) return normalized.split("/").slice(0, 2).join("/");
        return normalized.split("/")[0] || "";
      }

      if (normalizedLanguage === "python") {
        return normalized.split(/[./]/)[0] || "";
      }

      if (!normalized.includes(".")) return "";

      const parts = normalized.split(".").filter(Boolean);
      if (parts.length < 2) return "";

      const isPackageDependency = String(kind || "").toLowerCase().includes("package") || String(symbol || "").trim().endsWith(".*");
      if (isPackageDependency) return parts.join(".");

      if (parts.length <= 2) return parts.join(".");
      return parts.slice(0, -1).join(".");
    }

    function createEmptyPackageSummary(folderName = "") {
      return {
        folderName,
        packageCount: 0,
        missingSymbolCount: 0,
        affectedFileCount: 0,
        referenceCount: 0,
        packages: []
      };
    }

    function aggregateMissingPackageSummary(dependencySummary, folderName = "") {
      if (!dependencySummary?.rows?.length) return createEmptyPackageSummary(folderName);

      const packageMap = new Map();
      dependencySummary.rows.forEach((row) => {
        const packageName = deriveMissingPackageBucket(row.qualifiedName, row.rawKind, row.language);
        if (!packageName) return;

        if (!packageMap.has(packageName)) {
          packageMap.set(packageName, {
            packageName,
            symbols: [],
            affectedFileIds: new Set(),
            referenceCount: 0
          });
        }

        const entry = packageMap.get(packageName);
        row.usages.forEach((usage) => {
          if (usage.fileId) entry.affectedFileIds.add(usage.fileId);
        });
        entry.referenceCount += row.referenceCount;
        entry.symbols.push({
          symbol: row.qualifiedName,
          kind: row.kind,
          rawKind: row.rawKind,
            language: row.language,
          affectedFileCount: row.affectedFileCount,
          referenceCount: row.referenceCount
        });
      });

      const packages = Array.from(packageMap.values()).map((entry) => {
        const symbols = entry.symbols.sort((a, b) => {
          if (b.affectedFileCount !== a.affectedFileCount) return b.affectedFileCount - a.affectedFileCount;
          if (b.referenceCount !== a.referenceCount) return b.referenceCount - a.referenceCount;
          return a.symbol.localeCompare(b.symbol);
        });
        return {
          packageName: entry.packageName,
          missingSymbolCount: symbols.length,
          affectedFileCount: entry.affectedFileIds.size,
          affectedFileIds: Array.from(entry.affectedFileIds),
          referenceCount: entry.referenceCount,
          symbols
        };
      }).sort((a, b) => {
        if (b.affectedFileCount !== a.affectedFileCount) return b.affectedFileCount - a.affectedFileCount;
        if (b.referenceCount !== a.referenceCount) return b.referenceCount - a.referenceCount;
        return a.packageName.localeCompare(b.packageName);
      });

      const allAffectedFileIds = new Set();
      packages.forEach((entry) => {
        (entry.affectedFileIds || []).forEach((fileId) => allAffectedFileIds.add(fileId));
      });

      return {
        folderName,
        packageCount: packages.length,
        missingSymbolCount: packages.reduce((total, entry) => total + entry.missingSymbolCount, 0),
        affectedFileCount: allAffectedFileIds.size,
        referenceCount: packages.reduce((total, entry) => total + entry.referenceCount, 0),
        packages
      };
    }

    function filterPackageSummaryPackages(packages, query) {
      const normalizedQuery = String(query || "").trim().toLowerCase();
      if (!normalizedQuery) return packages.slice();
      return packages.filter((entry) => {
        return entry.packageName.toLowerCase().includes(normalizedQuery)
          || entry.symbols.some((symbol) => symbol.symbol.toLowerCase().includes(normalizedQuery));
      });
    }

    function getFilteredPackageSummary(summary, query) {
      const packages = filterPackageSummaryPackages(summary?.packages || [], query);
      const affectedFileIds = new Set();
      packages.forEach((entry) => {
        (entry.affectedFileIds || []).forEach((fileId) => affectedFileIds.add(fileId));
      });
      return {
        folderName: summary?.folderName || "",
        packageCount: packages.length,
        missingSymbolCount: packages.reduce((total, entry) => total + entry.missingSymbolCount, 0),
        affectedFileCount: affectedFileIds.size || packages.reduce((total, entry) => total + entry.affectedFileCount, 0),
        referenceCount: packages.reduce((total, entry) => total + entry.referenceCount, 0),
        packages
      };
    }

    function formatPackageSummaryMarkdown(summary, options = {}) {
      const title = options.title || summary?.folderName || "Graph Health";
      const lines = [
        `# Missing Dependency Group Summary: ${title}`,
        "",
        `- Groups: ${(summary?.packageCount || 0).toLocaleString()}`,
        `- Missing symbols: ${(summary?.missingSymbolCount || 0).toLocaleString()}`,
        `- Affected files: ${(summary?.affectedFileCount || 0).toLocaleString()}`,
        `- References: ${(summary?.referenceCount || 0).toLocaleString()}`,
        "",
        "| Group | Language | Missing symbols | Affected files | References |",
        "| --- | --- | ---: | ---: | ---: |"
      ];

      (summary?.packages || []).forEach((entry) => {
        const languages = Array.from(new Set((entry.symbols || []).map((symbol) => symbol.language || "unknown"))).join(", ");
        lines.push(`| ${entry.packageName} | ${languages} | ${entry.missingSymbolCount} | ${entry.affectedFileCount} | ${entry.referenceCount} |`);
      });

      (summary?.packages || []).forEach((entry) => {
        lines.push("", `## ${entry.packageName}`, "");
        entry.symbols.forEach((symbol) => {
          lines.push(`- \`${symbol.symbol}\` (${symbol.language || "unknown"}, ${symbol.rawKind || symbol.kind || "unknown"}, ${symbol.affectedFileCount} files, ${symbol.referenceCount} references)`);
        });
      });

      return lines.join("\n");
    }

    function escapeCsvValue(value) {
      const source = String(value ?? "");
      return /[",\r\n]/.test(source) ? `"${source.replace(/"/g, '""')}"` : source;
    }

    function formatPackageSummaryCsv(summary) {
      const lines = [["group", "languages", "missingSymbols", "affectedFiles", "references", "symbols"].join(",")];
      (summary?.packages || []).forEach((entry) => {
        const languages = Array.from(new Set((entry.symbols || []).map((symbol) => symbol.language || "unknown"))).join("; ");
        lines.push([
          entry.packageName,
          languages,
          entry.missingSymbolCount,
          entry.affectedFileCount,
          entry.referenceCount,
          entry.symbols.map((symbol) => `${symbol.symbol} [${symbol.language || "unknown"}:${symbol.rawKind || symbol.kind || "unknown"}]`).join("; ")
        ].map(escapeCsvValue).join(","));
      });
      return lines.join("\n");
    }

    function createPackageSummaryJson(summary) {
      return {
        generatedAt: new Date().toISOString(),
        folderName: summary?.folderName || "",
        packageCount: summary?.packageCount || 0,
        packages: (summary?.packages || []).map((entry) => ({
          groupName: entry.packageName,
          packageName: entry.packageName,
          languages: Array.from(new Set((entry.symbols || []).map((symbol) => symbol.language || "unknown"))),
          missingSymbolCount: entry.missingSymbolCount,
          affectedFileCount: entry.affectedFileCount,
          referenceCount: entry.referenceCount,
          symbols: entry.symbols.map((symbol) => ({
            symbol: symbol.symbol,
            language: symbol.language || "unknown",
            kind: symbol.rawKind || symbol.kind || "unknown"
          }))
        }))
      };
    }

    function formatPackageSummaryJson(summary) {
      return JSON.stringify(createPackageSummaryJson(summary), null, 2);
    }

    function getPackageSummaryExportName(summary, extension) {
      const base = String(summary?.folderName || "graph-health")
        .trim()
        .replace(/[\\/:*?"<>|]+/g, "-")
        .replace(/\s+/g, "-")
        .replace(/^-+|-+$/g, "")
        || "graph-health";
      return `${base}-missing-dependency-groups.${extension}`;
    }

    /**
     * Build one downloadable missing-dependency group report using the existing serializers.
     * @param {object} summary Missing-dependency group summary to serialize.
     * @param {"markdown"|"csv"|"json"} format Requested report format.
     * @param {object} options Formatter options, including the Markdown report title.
     * @returns {{content: string, fileName: string, extension: string, mimeType: string}} Export-ready report data.
     * @throws {Error} When the requested report format is unsupported.
     */
    function createPackageSummaryExport(summary, format, options = {}) {
      const normalizedFormat = String(format || "").trim().toLowerCase();
      const formats = {
        markdown: {
          extension: "md",
          mimeType: "text/markdown;charset=utf-8",
          formatContent: () => formatPackageSummaryMarkdown(summary, options)
        },
        csv: {
          extension: "csv",
          mimeType: "text/csv;charset=utf-8",
          formatContent: () => formatPackageSummaryCsv(summary)
        },
        json: {
          extension: "json",
          mimeType: "application/json;charset=utf-8",
          formatContent: () => formatPackageSummaryJson(summary)
        }
      };
      const selectedFormat = formats[normalizedFormat];
      if (!selectedFormat) {
        throw new Error(`Unsupported graph report format: ${format || "(empty)"}`);
      }
      return {
        content: selectedFormat.formatContent(),
        fileName: getPackageSummaryExportName(summary, selectedFormat.extension),
        extension: selectedFormat.extension,
        mimeType: selectedFormat.mimeType
      };
    }

    async function copyPackageSummaryText(text, label) {
      try {
        if (typeof copyTextToSystemClipboard === "function") {
          await copyTextToSystemClipboard(text);
        } else if (navigator.clipboard?.writeText && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
        } else {
          throw new Error("Clipboard is unavailable.");
        }
        alert(`${label} copied to clipboard.`);
      } catch (error) {
        console.error("Failed to copy package summary:", error);
        alert("Could not copy package summary: " + (error?.message || error || "Unknown error"));
      }
    }

    function downloadPackageSummaryText(summary, extension, mimeType, content) {
      const blob = new Blob([content], { type: mimeType });
      const fileName = getPackageSummaryExportName(summary, extension);
      if (typeof saveAs === "function") {
        saveAs(blob, fileName);
        return;
      }
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    }

    /**
     * Download a missing-dependency group report through the existing browser save flow.
     * @param {object} summary Missing-dependency group summary to serialize.
     * @param {"markdown"|"csv"|"json"} format Requested report format.
     * @param {object} options Formatter options, including the Markdown report title.
     * @returns {{content: string, fileName: string, extension: string, mimeType: string}} The downloaded report descriptor.
     */
    function downloadPackageSummaryExport(summary, format, options = {}) {
      const report = createPackageSummaryExport(summary, format, options);
      downloadPackageSummaryText(summary, report.extension, report.mimeType, report.content);
      return report;
    }

    function getPackageSummaryEntrySubEntryNames(entry) {
      return Array.from(new Set((entry?.symbols || [])
        .map((symbol) => symbol?.symbol || "")
        .filter(Boolean)))
        .sort((a, b) => a.localeCompare(b));
    }

    function closePackageSummaryContextMenu() {
      document.querySelector(".graph-health-package-context-menu")?.remove();
    }

    function createPackageSummaryContextMenuButton(label, iconClass, onClick) {
      const button = document.createElement("button");
      button.className = "graph-context-menu-item";
      button.type = "button";
      button.innerHTML = `
        <i class="${escapeHtml(iconClass)}" aria-hidden="true"></i>
        <span class="graph-context-menu-item-label">${escapeHtml(label)}</span>
      `;
      button.addEventListener("click", async () => {
        closePackageSummaryContextMenu();
        await onClick();
      });
      return button;
    }

    function openPackageSummaryContextMenu(event, entry) {
      event.preventDefault();
      event.stopPropagation();
      closePackageSummaryContextMenu();

      const entryName = entry?.packageName || entry?.symbol || "";
      const subEntries = getPackageSummaryEntrySubEntryNames(entry);
      const menu = document.createElement("div");
      menu.className = "graph-context-menu graph-health-package-context-menu";
      menu.innerHTML = `
        <div class="graph-context-menu-title">${escapeHtml(entryName || "Group")}</div>
        <div class="graph-context-menu-separator"></div>
      `;
      menu.appendChild(createPackageSummaryContextMenuButton("Copy entry name", "bi bi-clipboard", () => (
        copyPackageSummaryText(entryName, "Entry name")
      )));
      menu.appendChild(createPackageSummaryContextMenuButton("Copy sub-entries", "bi bi-clipboard-data", () => (
        copyPackageSummaryText(subEntries.join("\n"), "Sub-entries")
      )));

      document.body.appendChild(menu);
      const margin = 8;
      const rect = menu.getBoundingClientRect();
      const left = Math.min(event.clientX, window.innerWidth - rect.width - margin);
      const top = Math.min(event.clientY, window.innerHeight - rect.height - margin);
      menu.style.left = `${Math.max(margin, left)}px`;
      menu.style.top = `${Math.max(margin, top)}px`;

      const closeOnOutside = (closeEvent) => {
        if (menu.contains(closeEvent.target)) return;
        closePackageSummaryContextMenu();
        document.removeEventListener("click", closeOnOutside, true);
        document.removeEventListener("contextmenu", closeOnOutside, true);
      };
      setTimeout(() => {
        document.addEventListener("click", closeOnOutside, true);
        document.addEventListener("contextmenu", closeOnOutside, true);
      }, 0);
    }

    function renderPackageSummaryRows(tbody, summary) {
      tbody.innerHTML = "";
      (summary.packages || []).forEach((entry) => {
        const examples = entry.symbols.slice(0, 3).map((symbol) => symbol.symbol);
        const extraCount = Math.max(0, entry.symbols.length - examples.length);
        const row = document.createElement("tr");
        row.className = "graph-health-package-row";
        row.dataset.packageName = entry.packageName;
        row.innerHTML = `
          <td>
            <button class="graph-health-expand-button graph-health-package-expand" type="button" aria-expanded="false">
              <i class="bi bi-chevron-right" aria-hidden="true"></i>
              <span class="graph-health-name" title="${escapeHtml(entry.packageName)}">${escapeHtml(entry.packageName)}</span>
            </button>
          </td>
          <td class="graph-health-number-cell">${entry.missingSymbolCount.toLocaleString()}</td>
          <td class="graph-health-number-cell">${entry.affectedFileCount.toLocaleString()}</td>
          <td class="graph-health-number-cell">${entry.referenceCount.toLocaleString()}</td>
          <td class="graph-health-package-examples" title="${escapeHtml(entry.symbols.map((symbol) => symbol.symbol).join(", "))}">
            ${examples.map((symbol) => `<code>${escapeHtml(symbol)}</code>`).join("")}
            ${extraCount ? `<span>+${extraCount.toLocaleString()} more</span>` : ""}
          </td>
        `;

        const detailsRow = document.createElement("tr");
        detailsRow.className = "graph-health-package-details-row hidden";
        const detailsCell = document.createElement("td");
        detailsCell.colSpan = 5;
        detailsCell.innerHTML = `
          <div class="graph-health-package-symbols">
            ${entry.symbols.map((symbol) => `
              <div class="graph-health-package-symbol">
                <code>${escapeHtml(symbol.symbol)}</code>
                <span>${symbol.affectedFileCount.toLocaleString()} files</span>
                <span>${symbol.referenceCount.toLocaleString()} refs</span>
              </div>
            `).join("")}
          </div>
        `;
        detailsRow.appendChild(detailsCell);

        const openContextMenu = (event) => {
          openPackageSummaryContextMenu(event, entry);
        };
        row.addEventListener("contextmenu", openContextMenu);
        const toggleButton = row.querySelector(".graph-health-package-expand");
        toggleButton.addEventListener("contextmenu", openContextMenu);
        toggleButton.addEventListener("click", () => {
          const isOpening = detailsRow.classList.contains("hidden");
          detailsRow.classList.toggle("hidden", !isOpening);
          toggleButton.setAttribute("aria-expanded", isOpening ? "true" : "false");
          toggleButton.querySelector("i")?.classList.toggle("expanded", isOpening);
        });

        tbody.append(row, detailsRow);
      });
    }

    function openPackageSummaryModal(sourceSummary, options = {}) {
      const existing = document.querySelector(".graph-health-package-modal");
      if (existing) existing.remove();

      let filteredSummary = getFilteredPackageSummary(sourceSummary, "");
      const overlay = document.createElement("div");
      overlay.className = "reset-modal-overlay graph-health-package-modal";
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "graph-health-package-title");
      overlay.innerHTML = `
        <div class="reset-modal-box graph-health-package-modal-box">
          <div class="graph-health-package-modal-header">
            <div>
              <p class="graph-health-report-kicker">Graph Health</p>
              <h2 id="graph-health-package-title">Missing Dependency Groups</h2>
            </div>
            <button class="settings-modal-close graph-health-package-close" type="button" aria-label="Close package summary">
              <i class="bi bi-x-lg" aria-hidden="true"></i>
            </button>
          </div>
          <div class="graph-health-package-toolbar">
            <input class="rename-modal-input graph-health-package-filter" type="search" placeholder="Filter groups or symbols" aria-label="Filter groups or symbols" />
            <div class="graph-health-package-actions">
              <button class="reset-modal-btn graph-health-package-copy-md" type="button">Copy Markdown</button>
              <button class="reset-modal-btn graph-health-package-copy-csv" type="button">Copy CSV</button>
              <button class="reset-modal-btn graph-health-package-download-csv" type="button">Download CSV</button>
              <button class="reset-modal-btn graph-health-package-download-json" type="button">Download JSON</button>
            </div>
          </div>
          <div class="graph-health-package-summary-counts"></div>
          <div class="graph-health-package-table-wrap">
            <table class="graph-health-table graph-health-package-table">
              <thead>
                <tr>
                <th scope="col">Group</th>
                  <th scope="col">Missing symbols</th>
                  <th scope="col">Affected files</th>
                  <th scope="col">References</th>
                  <th scope="col">Examples</th>
                </tr>
              </thead>
              <tbody></tbody>
            </table>
          </div>
        </div>
      `;

      const closeModal = () => overlay.remove();
      const filterInput = overlay.querySelector(".graph-health-package-filter");
      const counts = overlay.querySelector(".graph-health-package-summary-counts");
      const tbody = overlay.querySelector("tbody");
      tbody.addEventListener("contextmenu", (event) => {
        const row = event.target.closest(".graph-health-package-row");
        if (!row || !tbody.contains(row)) return;
        const packageName = row.dataset.packageName || "";
        const entry = (filteredSummary.packages || []).find((candidate) => candidate.packageName === packageName);
        if (entry) openPackageSummaryContextMenu(event, entry);
      }, true);
      const renderFiltered = () => {
        filteredSummary = getFilteredPackageSummary(sourceSummary, filterInput.value);
        counts.innerHTML = `
          <span>${filteredSummary.packageCount.toLocaleString()} packages</span>
          <span>${filteredSummary.missingSymbolCount.toLocaleString()} missing symbols</span>
          <span>${filteredSummary.affectedFileCount.toLocaleString()} affected files</span>
          <span>${filteredSummary.referenceCount.toLocaleString()} references</span>
        `;
        renderPackageSummaryRows(tbody, filteredSummary);
        if (!filteredSummary.packages.length) {
          tbody.innerHTML = '<tr><td colspan="5" class="graph-health-package-empty">No packages match the filter.</td></tr>';
        }
      };

      overlay.querySelector(".graph-health-package-close").addEventListener("click", closeModal);
      overlay.addEventListener("click", (event) => {
        if (event.target === overlay) closeModal();
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") closeModal();
      });
      filterInput.addEventListener("input", renderFiltered);
      overlay.querySelector(".graph-health-package-copy-md").addEventListener("click", () => {
        copyPackageSummaryText(formatPackageSummaryMarkdown(filteredSummary, options), "Package summary Markdown");
      });
      overlay.querySelector(".graph-health-package-copy-csv").addEventListener("click", () => {
        copyPackageSummaryText(formatPackageSummaryCsv(filteredSummary), "Package summary CSV");
      });
      overlay.querySelector(".graph-health-package-download-csv").addEventListener("click", () => {
        downloadPackageSummaryText(filteredSummary, "csv", "text/csv;charset=utf-8", formatPackageSummaryCsv(filteredSummary));
      });
      overlay.querySelector(".graph-health-package-download-json").addEventListener("click", () => {
        downloadPackageSummaryText(filteredSummary, "json", "application/json;charset=utf-8", formatPackageSummaryJson(filteredSummary));
      });

      document.body.appendChild(overlay);
      renderFiltered();
      filterInput.focus();
      return overlay;
    }

    api.deriveMissingPackageBucket = deriveMissingPackageBucket;
    api.aggregateMissingPackageSummary = aggregateMissingPackageSummary;
    api.formatPackageSummaryMarkdown = formatPackageSummaryMarkdown;
    api.formatPackageSummaryCsv = formatPackageSummaryCsv;
    api.createPackageSummaryJson = createPackageSummaryJson;
    api.formatPackageSummaryJson = formatPackageSummaryJson;
    api.createPackageSummaryExport = createPackageSummaryExport;
    api.downloadPackageSummaryExport = downloadPackageSummaryExport;
    api.getPackageSummaryEntrySubEntryNames = getPackageSummaryEntrySubEntryNames;
    api.openPackageSummaryModal = openPackageSummaryModal;
    }

    return api;
  };
})(window);
