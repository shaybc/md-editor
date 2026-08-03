// Two-step Externalize Strings configuration and preview dialog.
(function(global) {
  "use strict";

  /** Create the Externalize Strings wizard dialog. */
  function createMarkdownViewerExternalizeStringsDialog(options = {}) {
    const document = options.document || window.document;
    let overlay = null;
    let resolveOpenDialog = null;
    let model = null;
    let selectedLiteralId = "";

    function close(result) {
      if (!overlay || overlay.hidden) return;
      overlay.hidden = true;
      const resolve = resolveOpenDialog;
      resolveOpenDialog = null;
      resolve?.(result);
    }

    function ensureDialog() {
      if (overlay) return overlay;
      overlay = document.createElement("div");
      overlay.id = "externalize-strings-dialog";
      overlay.className = "externalize-strings-dialog-overlay";
      overlay.hidden = true;
      overlay.setAttribute("role", "dialog");
      overlay.setAttribute("aria-modal", "true");
      overlay.setAttribute("aria-labelledby", "externalize-strings-dialog-title");
      overlay.innerHTML = [
        '<section class="externalize-strings-dialog-panel">',
        '<header class="externalize-strings-dialog-header"><div><h2 id="externalize-strings-dialog-title">Externalize Strings</h2>',
        '<p class="externalize-strings-dialog-subtitle"></p></div>',
        '<button type="button" class="externalize-strings-dialog-close" aria-label="Close">&times;</button></header>',
        '<div class="externalize-strings-dialog-body"></div>',
        '<footer class="externalize-strings-dialog-footer"></footer>',
        '</section>'
      ].join("");
      document.body.appendChild(overlay);
      overlay.querySelector(".externalize-strings-dialog-close").addEventListener("click", () => close(null));
      overlay.addEventListener("mousedown", (event) => {
        if (event.target === overlay) close(null);
      });
      overlay.addEventListener("keydown", (event) => {
        if (event.key === "Escape") { event.preventDefault(); close(null); }
      });
      return overlay;
    }

    function createButton(label, className, handler) {
      const button = document.createElement("button");
      button.type = "button";
      button.className = className || "";
      button.textContent = label;
      button.addEventListener("click", handler);
      return button;
    }

    /** Return a small source window surrounding one discovered string occurrence. */
    function getLiteralSourceContext(source, literal) {
      const value = String(source || "");
      const literalStart = Math.max(0, Number(literal?.start) || 0);
      const literalEnd = Math.max(literalStart, Number(literal?.end) || literalStart);
      const currentLineStart = value.lastIndexOf("\n", Math.max(0, literalStart - 1)) + 1;
      const previousLineBreak = value.lastIndexOf("\n", Math.max(0, currentLineStart - 2));
      const contextStart = previousLineBreak < 0 ? 0 : previousLineBreak + 1;
      const currentLineEnd = value.indexOf("\n", literalEnd);
      const nextLineEnd = currentLineEnd < 0 ? value.length : value.indexOf("\n", currentLineEnd + 1);
      const contextEnd = nextLineEnd < 0 ? value.length : nextLineEnd;
      return {
        before: value.slice(contextStart, literalStart),
        occurrence: value.slice(literalStart, literalEnd),
        after: value.slice(literalEnd, contextEnd)
      };
    }

    /** Show and emphasize the exact source occurrence represented by a literal row. */
    function showLiteralSourceOccurrence(literal, row) {
      const context = overlay.querySelector(".externalize-source-context");
      if (!context || !model.sourceContent) return;
      selectedLiteralId = literal.id;
      overlay.querySelectorAll(".externalize-string-row-selected").forEach((candidate) => {
        candidate.classList.remove("externalize-string-row-selected");
      });
      row.classList.add("externalize-string-row-selected");
      const status = overlay.querySelector('[data-literal-status="' + literal.id + '"]')?.value || literal.status || "externalize";
      const sourceContext = getLiteralSourceContext(model.sourceContent, literal);
      const heading = context.querySelector(".externalize-source-context-title");
      const source = context.querySelector("pre");
      const occurrence = document.createElement("mark");
      occurrence.className = "externalize-source-occurrence externalize-source-occurrence-" + status;
      occurrence.textContent = sourceContext.occurrence;
      heading.textContent = "Source occurrence — line " + (Number(literal.lineNumber) + 1);
      source.replaceChildren(document.createTextNode(sourceContext.before), occurrence, document.createTextNode(sourceContext.after));
      occurrence.scrollIntoView?.({ block: "center", inline: "nearest" });
    }

    function renderLiteralRows(body) {
      const table = document.createElement("div");
      table.className = "externalize-string-table";
      const sourceContext = document.createElement("section");
      sourceContext.className = "externalize-source-context";
      sourceContext.hidden = !model.sourceContent;
      const sourceContextTitle = document.createElement("h3");
      sourceContextTitle.className = "externalize-source-context-title";
      const sourceContextCode = document.createElement("pre");
      sourceContext.append(sourceContextTitle, sourceContextCode);
      const header = document.createElement("div");
      header.className = "externalize-string-row externalize-string-row-header";
      ["Action", "Value", "Key"].forEach((label) => {
        const cell = document.createElement("span");
        cell.textContent = label;
        header.appendChild(cell);
      });
      table.appendChild(header);
      model.literals.forEach((literal, index) => {
        const row = document.createElement("div");
        row.className = "externalize-string-row";
        row.dataset.literalRow = literal.id;
        const status = document.createElement("select");
        status.dataset.literalStatus = literal.id;
        [["externalize", "Externalize"], ["ignore", "Ignore"], ["skip", "Skip"]].forEach(([value, label]) => {
          const option = document.createElement("option");
          option.value = value;
          option.textContent = label;
          status.appendChild(option);
        });
        status.value = literal.status || "externalize";
        const value = document.createElement("span");
        value.className = "externalize-string-value";
        value.textContent = literal.value.replace(/\n/g, "\\n");
        value.title = literal.context;
        const key = document.createElement("input");
        key.type = "text";
        key.value = literal.key || "";
        key.dataset.literalKey = literal.id;
        key.dataset.generatedIndex = String(index);
        key.disabled = status.value !== "externalize";
        key.addEventListener("input", () => { key.dataset.manuallyEdited = "true"; });
        const selectOccurrence = () => showLiteralSourceOccurrence(literal, row);
        row.addEventListener("click", selectOccurrence);
        row.addEventListener("focusin", selectOccurrence);
        status.addEventListener("change", () => {
          key.disabled = status.value !== "externalize";
          if (selectedLiteralId === literal.id) selectOccurrence();
        });
        row.append(status, value, key);
        table.appendChild(row);
      });
      body.append(table, sourceContext);
      const initialLiteral = model.literals.find((literal) => literal.id === selectedLiteralId) || model.literals[0];
      const initialRow = initialLiteral && table.querySelector('[data-literal-row="' + initialLiteral.id + '"]');
      if (initialLiteral && initialRow) showLiteralSourceOccurrence(initialLiteral, initialRow);
    }

    function createConfigurationField(labelText, className, value, readOnly = false) {
      const label = document.createElement("label");
      label.textContent = labelText;
      const input = document.createElement("input");
      input.type = "text";
      input.className = className;
      input.value = value || "";
      input.readOnly = readOnly;
      label.appendChild(input);
      return label;
    }

    function collectConfiguration() {
      const literals = model.literals.map((literal) => ({
        ...literal,
        status: overlay.querySelector('[data-literal-status="' + literal.id + '"]').value,
        key: overlay.querySelector('[data-literal-key="' + literal.id + '"]').value.trim()
      }));
      const configuration = {
        sourceRoot: overlay.querySelector(".externalize-source-root").value.trim(),
        sourcePackageName: model.configuration.sourcePackageName,
        packageName: overlay.querySelector(".externalize-package-name").value.trim(),
        accessorClassName: overlay.querySelector(".externalize-accessor-class").value.trim(),
        propertyFileName: overlay.querySelector(".externalize-property-file").value.trim(),
        keyPrefix: overlay.querySelector(".externalize-key-prefix").value
      };
      if (!configuration.sourceRoot || !/^[A-Za-z_$][\w$]*$/.test(configuration.accessorClassName)) {
        throw new Error("Enter a valid source folder and accessor class name.");
      }
      if (configuration.packageName && !/^[A-Za-z_$][\w$]*(?:\.[A-Za-z_$][\w$]*)*$/.test(configuration.packageName)) {
        throw new Error("Enter a valid Java package name.");
      }
      if (!/^[^\\/:*?"<>|]+\.properties$/i.test(configuration.propertyFileName)) {
        throw new Error("Enter a valid .properties file name.");
      }
      return { literals, configuration };
    }

    function renderConfiguration() {
      const body = overlay.querySelector(".externalize-strings-dialog-body");
      const footer = overlay.querySelector(".externalize-strings-dialog-footer");
      overlay.querySelector(".externalize-strings-dialog-panel").classList.remove("externalize-preview-panel");
      body.classList.remove("externalize-preview-body");
      body.replaceChildren();
      footer.replaceChildren();
      overlay.querySelector(".externalize-strings-dialog-subtitle").textContent =
        "Externalize Strings in '" + model.fileName + "'";
      const prefix = createConfigurationField("Common prefix for generated keys", "externalize-key-prefix", model.configuration.keyPrefix);
      prefix.classList.add("externalize-key-prefix-label");
      prefix.querySelector("input").addEventListener("input", (event) => {
        overlay.querySelectorAll("[data-literal-key]").forEach((input) => {
          if (input.dataset.manuallyEdited !== "true") input.value = event.target.value + input.dataset.generatedIndex;
        });
      });
      body.appendChild(prefix);
      const prompt = document.createElement("p");
      prompt.className = "externalize-strings-prompt";
      prompt.textContent = "Strings to externalize:";
      body.appendChild(prompt);
      renderLiteralRows(body);
      const config = document.createElement("fieldset");
      config.className = "externalize-accessor-configuration";
      config.append(
        createConfigurationField("Source folder", "externalize-source-root", model.configuration.sourceRoot),
        createConfigurationField("Package", "externalize-package-name", model.configuration.packageName),
        createConfigurationField("Accessor class", "externalize-accessor-class", model.configuration.accessorClassName),
        createConfigurationField("Property file", "externalize-property-file", model.configuration.propertyFileName)
      );
      body.appendChild(config);
      footer.append(
        createButton("Next >", "externalize-dialog-primary", () => {
          try { close(collectConfiguration()); }
          catch (error) { window.alert?.(error.message); }
        }),
        createButton("Cancel", "", () => close(null))
      );
    }

    /** Render source text with non-overlapping preview highlights. */
    function renderPreviewContent(pre, content, highlights = []) {
      const value = String(content || "");
      const fragments = [];
      let offset = 0;
      highlights.slice().sort((left, right) => left.start - right.start).forEach((highlight) => {
        const start = Math.max(offset, Math.min(value.length, Number(highlight.start) || 0));
        const end = Math.max(start, Math.min(value.length, Number(highlight.end) || start));
        if (start > offset) fragments.push(document.createTextNode(value.slice(offset, start)));
        const occurrence = document.createElement("mark");
        occurrence.className = "externalize-source-occurrence externalize-source-occurrence-" + (highlight.status || "externalize");
        occurrence.textContent = value.slice(start, end);
        fragments.push(occurrence);
        offset = end;
      });
      if (offset < value.length) fragments.push(document.createTextNode(value.slice(offset)));
      pre.replaceChildren(...fragments);
    }

    function createPreviewFile(title, content, highlights = [], className = "") {
      const section = document.createElement("section");
      section.className = "externalize-preview-file" + (className ? " " + className : "");
      const heading = document.createElement("h3");
      heading.textContent = title;
      const pre = document.createElement("pre");
      renderPreviewContent(pre, content, highlights);
      section.append(heading, pre);
      return section;
    }

    function renderPreview(plan, fileName) {
      const body = overlay.querySelector(".externalize-strings-dialog-body");
      const footer = overlay.querySelector(".externalize-strings-dialog-footer");
      overlay.querySelector(".externalize-strings-dialog-panel").classList.add("externalize-preview-panel");
      body.classList.add("externalize-preview-body");
      body.replaceChildren();
      footer.replaceChildren();
      overlay.querySelector(".externalize-strings-dialog-subtitle").textContent =
        "The following changes will externalize " + plan.selectedCount + " string(s) and ignore " + plan.ignoredCount + ".";
      const preview = document.createElement("div");
      preview.className = "externalize-preview-list";
      preview.appendChild(createPreviewFile(fileName, plan.sourceContent, plan.sourceHighlights, "externalize-preview-source"));
      (plan.files || []).forEach((file) => preview.appendChild(createPreviewFile(file.path, file.content)));
      body.appendChild(preview);
      footer.append(
        createButton("< Back", "", () => close("back")),
        createButton("Finish", "externalize-dialog-primary", () => close("finish")),
        createButton("Cancel", "", () => close(null))
      );
    }

    return {
      /** Open the literal-selection and accessor-configuration page. */
      choose(nextModel) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        model = nextModel;
        selectedLiteralId = "";
        renderConfiguration();
        overlay.hidden = false;
        overlay.querySelector(".externalize-key-prefix").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      },
      /** Open the final generated-file preview page. */
      preview(plan, fileName) {
        if (resolveOpenDialog) close(null);
        ensureDialog();
        renderPreview(plan, fileName);
        overlay.hidden = false;
        overlay.querySelector(".externalize-dialog-primary").focus();
        return new Promise((resolve) => { resolveOpenDialog = resolve; });
      }
    };
  }

  global.createMarkdownViewerExternalizeStringsDialog = createMarkdownViewerExternalizeStringsDialog;
})(window);
