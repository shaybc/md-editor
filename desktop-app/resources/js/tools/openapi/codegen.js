// OpenAPI code generation dialog and preview workflow.
(function(root, document) {
  "use strict";

  const DEFAULT_GENERATOR_GROUPS = [
    { id: "clients", label: "Clients" },
    { id: "servers", label: "Servers" },
    { id: "docs", label: "Docs / Spec" }
  ];

  const SPRING_PACKAGE_FIELDS = ["apiPackage", "modelPackage", "configPackage"];
  const JAVA_PACKAGE_FIELDS = ["apiPackage", "modelPackage", "invokerPackage"];
  const SPRING_PROPERTY_FIELDS = [
    { name: "library", label: "Spring library", type: "select", options: ["spring-boot", "spring-boot3", "spring-mvc", "spring-cloud"] },
    { name: "delegatePattern", label: "Delegate pattern", type: "boolean" },
    { name: "interfaceOnly", label: "Interface only", type: "boolean" },
    { name: "useTags", label: "Use tags for class names", type: "boolean" },
    { name: "useBeanValidation", label: "Bean validation", type: "boolean" },
    { name: "jakarta", label: "Jakarta packages", type: "boolean" }
  ];

  const DEFAULT_GENERATORS = [
    { id: "java", generatorName: "java", label: "Java client", groupId: "clients", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "kotlin-client", generatorName: "kotlin-client", label: "Kotlin client", groupId: "clients", packageFields: ["packageName"] },
    { id: "typescript-fetch", generatorName: "typescript-fetch", label: "TypeScript fetch", groupId: "clients", packageFields: ["npmName"] },
    { id: "typescript-axios", generatorName: "typescript-axios", label: "TypeScript Axios", groupId: "clients", packageFields: ["npmName"] },
    { id: "typescript-angular", generatorName: "typescript-angular", label: "TypeScript Angular", groupId: "clients", packageFields: ["npmName"] },
    { id: "javascript", generatorName: "javascript", label: "JavaScript", groupId: "clients", packageFields: ["projectName"] },
    { id: "csharp", generatorName: "csharp", label: "CSharp", groupId: "clients", packageFields: ["packageName"] },
    { id: "csharp-dotnet2", generatorName: "csharp-dotnet2", label: "CSharp .NET 2", groupId: "clients", packageFields: ["packageName"] },
    { id: "python", generatorName: "python", label: "Python", groupId: "clients", packageFields: ["packageName"] },
    { id: "go", generatorName: "go", label: "Go", groupId: "clients", packageFields: ["packageName"] },
    { id: "dart", generatorName: "dart", label: "Dart", groupId: "clients", packageFields: ["packageName"] },
    { id: "php", generatorName: "php", label: "PHP", groupId: "clients", packageFields: ["packageName"] },
    { id: "ruby", generatorName: "ruby", label: "Ruby", groupId: "clients", packageFields: ["packageName"] },
    { id: "swift5", generatorName: "swift5", label: "Swift 5", groupId: "clients", packageFields: ["packageName"] },
    { id: "swift4", generatorName: "swift4", label: "Swift 4", groupId: "clients", packageFields: ["packageName"] },
    { id: "swift3", generatorName: "swift3", label: "Swift 3", groupId: "clients", packageFields: ["packageName"] },
    { id: "scala", generatorName: "scala", label: "Scala", groupId: "clients", packageFields: ["packageName"] },
    { id: "r", generatorName: "r", label: "R", groupId: "clients", packageFields: ["packageName"] },
    { id: "jaxrs-cxf-client", generatorName: "jaxrs-cxf-client", label: "JAX-RS CXF client", groupId: "clients", packageFields: JAVA_PACKAGE_FIELDS },

    { id: "spring-boot", generatorName: "spring", label: "Spring Boot microservice", groupId: "servers", packageFields: SPRING_PACKAGE_FIELDS, propertyFields: SPRING_PROPERTY_FIELDS, presetProperties: { library: "spring-boot", delegatePattern: "true", interfaceOnly: "false", useTags: "true", useBeanValidation: "true", jakarta: "false" } },
    { id: "spring-boot3", generatorName: "spring", label: "Spring Boot 3 microservice", groupId: "servers", packageFields: SPRING_PACKAGE_FIELDS, propertyFields: SPRING_PROPERTY_FIELDS, presetProperties: { library: "spring-boot3", delegatePattern: "true", interfaceOnly: "false", useTags: "true", useBeanValidation: "true", jakarta: "true" } },
    { id: "spring-mvc", generatorName: "spring", label: "Spring MVC server", groupId: "servers", packageFields: SPRING_PACKAGE_FIELDS, propertyFields: SPRING_PROPERTY_FIELDS, presetProperties: { library: "spring-mvc", delegatePattern: "false", interfaceOnly: "false", useTags: "true", useBeanValidation: "true", jakarta: "false" } },
    { id: "spring-cloud", generatorName: "spring", label: "Spring Cloud", groupId: "servers", packageFields: SPRING_PACKAGE_FIELDS, propertyFields: SPRING_PROPERTY_FIELDS, presetProperties: { library: "spring-cloud", generateForOpenFeign: "true", interfaceOnly: "false", useTags: "true", useBeanValidation: "true", jakarta: "false" } },
    { id: "nodejs-server", generatorName: "nodejs-server", label: "Node.js server", groupId: "servers", packageFields: ["projectName"] },
    { id: "aspnetcore", generatorName: "aspnetcore", label: "ASP.NET Core server", groupId: "servers", packageFields: ["packageName"] },
    { id: "go-server", generatorName: "go-server", label: "Go server", groupId: "servers", packageFields: ["packageName"] },
    { id: "kotlin-server", generatorName: "kotlin-server", label: "Kotlin server", groupId: "servers", packageFields: ["packageName"] },
    { id: "python-flask", generatorName: "python-flask", label: "Python Flask server", groupId: "servers", packageFields: ["packageName"] },
    { id: "micronaut", generatorName: "micronaut", label: "Micronaut server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "java-vertx", generatorName: "java-vertx", label: "Java Vert.x server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "inflector", generatorName: "inflector", label: "Java Inflector server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-cxf", generatorName: "jaxrs-cxf", label: "JAX-RS CXF server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-cxf-cdi", generatorName: "jaxrs-cxf-cdi", label: "JAX-RS CXF CDI server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-spec", generatorName: "jaxrs-spec", label: "JAX-RS spec server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-jersey", generatorName: "jaxrs-jersey", label: "JAX-RS Jersey server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-di", generatorName: "jaxrs-di", label: "JAX-RS DI server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-resteasy", generatorName: "jaxrs-resteasy", label: "JAX-RS RESTEasy server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "jaxrs-resteasy-eap", generatorName: "jaxrs-resteasy-eap", label: "JAX-RS RESTEasy EAP server", groupId: "servers", packageFields: JAVA_PACKAGE_FIELDS },
    { id: "scala-akka-http-server", generatorName: "scala-akka-http-server", label: "Scala Akka HTTP server", groupId: "servers", packageFields: ["packageName"] },

    { id: "html", generatorName: "html", label: "HTML documentation", groupId: "docs", packageFields: [] },
    { id: "html2", generatorName: "html2", label: "HTML2 documentation", groupId: "docs", packageFields: [] },
    { id: "dynamic-html", generatorName: "dynamic-html", label: "Dynamic HTML documentation", groupId: "docs", packageFields: [] },
    { id: "openapi", generatorName: "openapi", label: "OpenAPI JSON", groupId: "docs", packageFields: [] },
    { id: "openapi-yaml", generatorName: "openapi-yaml", label: "OpenAPI YAML", groupId: "docs", packageFields: [] }
  ];
  const DEFAULT_PACKAGE_VALUES = {
    apiPackage: "io.mdeditor.openapi.api",
    modelPackage: "io.mdeditor.openapi.model",
    invokerPackage: "io.mdeditor.openapi",
    configPackage: "io.mdeditor.openapi.config",
    npmName: "openapi-client",
    projectName: "openapi-client",
    packageName: "openapi_client"
  };

  function createElement(tagName, className, textContent) {
    const element = document.createElement(tagName);
    if (className) element.className = className;
    if (textContent !== undefined) element.textContent = textContent;
    return element;
  }

  function normalizePath(value) {
    return String(value || "").trim().replace(/\\/g, "/").replace(/\/+$/, "");
  }

  function getFileName(filePath) {
    return normalizePath(filePath).split("/").pop() || "openapi.yaml";
  }

  function joinPath(parent, child) {
    const base = normalizePath(parent);
    const segment = String(child || "").replace(/\\/g, "/").replace(/^\/+/, "");
    return base ? `${base}/${segment}` : segment;
  }

  function parseAdditionalProperties(value) {
    const properties = {};
    String(value || "")
      .split(/\r?\n|,/)
      .map((item) => item.trim())
      .filter(Boolean)
      .forEach((item) => {
        const separatorIndex = item.indexOf("=");
        if (separatorIndex < 0) {
          properties[item] = "true";
          return;
        }
        const key = item.slice(0, separatorIndex).trim();
        if (!key) return;
        properties[key] = item.slice(separatorIndex + 1).trim();
      });
    return properties;
  }

  function createCodegenRequest(config) {
    return {
      specText: String(config.specText || ""),
      specFileName: getFileName(config.specFileName || config.filePath || "openapi.yaml"),
      workspaceRoot: normalizePath(config.workspaceRoot || ""),
      outputFolder: normalizePath(config.outputFolder || ""),
      generatorName: String(config.generatorName || "").trim(),
      additionalProperties: Object.assign({}, config.additionalProperties || {}),
      templateDir: normalizePath(config.templateDir || "")
    };
  }

  function injectCodegenStyles() {
    if (!document || document.getElementById("openapi-codegen-styles")) return;
    const style = document.createElement("style");
    style.id = "openapi-codegen-styles";
    style.textContent = `
      .reset-modal-box.app-notification-box.openapi-codegen-options-modal { width: min(920px, calc(100vw - 80px)); max-width: min(920px, calc(100vw - 80px)); max-height: calc(100vh - 80px); overflow: hidden; }
      .reset-modal-box.app-notification-box.openapi-codegen-options-modal .app-notification-body { width: 100%; min-width: 0; overflow: auto; }
      .openapi-codegen-options-dialog { display: grid; gap: 14px; width: 100%; min-width: 0; max-width: 100%; box-sizing: border-box; overflow: hidden; }
      .openapi-codegen-options-grid { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; width: 100%; min-width: 0; box-sizing: border-box; }
      .openapi-codegen-generator-field { grid-column: 1 / -1; }
      .openapi-codegen-technology-fields,
      .openapi-codegen-generator-property-fields { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; grid-column: 1 / -1; min-width: 0; }
      .openapi-codegen-field { display: grid; gap: 6px; min-width: 0; }
      .openapi-codegen-field label { color: var(--muted-text-color, #a5b4fc); font-size: 12px; font-weight: 600; }
      .openapi-codegen-field input,
      .openapi-codegen-field select,
      .openapi-codegen-field textarea { width: 100%; min-width: 0; box-sizing: border-box; border: 1px solid var(--border-color, #374151); border-radius: 6px; background: var(--input-bg, #111827); color: var(--text-color, #e5e7eb); padding: 8px 10px; font: inherit; }
      .openapi-codegen-field textarea { min-height: 90px; resize: vertical; font-family: var(--monospace-font, Consolas, monospace); font-size: 12px; }
      .openapi-codegen-output-row { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 8px; align-items: end; grid-column: 1 / -1; min-width: 0; }
      .openapi-codegen-output-row > .openapi-codegen-field { min-width: 0; }
      .openapi-codegen-browse-button { height: 36px; align-self: end; white-space: nowrap; }
      .openapi-codegen-package-fields { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; grid-column: 1 / -1; min-width: 0; }
      .openapi-codegen-advanced { grid-column: 1 / -1; }
      .reset-modal-box.app-notification-box.openapi-codegen-preview-modal { width: min(1180px, calc(100vw - 80px)); max-width: min(1180px, calc(100vw - 80px)); max-height: calc(100vh - 80px); overflow: hidden; }
      .reset-modal-box.app-notification-box.openapi-codegen-preview-modal .app-notification-body { width: 100%; min-width: 0; overflow: auto; }
      .openapi-codegen-preview-dialog { display: grid; grid-template-rows: auto minmax(260px, 52vh) minmax(90px, 16vh); gap: 12px; width: 100%; max-width: 100%; min-width: 0; min-height: 0; box-sizing: border-box; }
      .openapi-codegen-preview-summary { display: flex; flex-wrap: wrap; gap: 10px; min-width: 0; color: var(--muted-text-color, #9ca3af); font-size: 12px; }
      .openapi-codegen-preview-body { display: grid; grid-template-columns: minmax(240px, 34%) minmax(0, 1fr); gap: 12px; width: 100%; min-width: 0; min-height: 0; box-sizing: border-box; }
      .openapi-codegen-file-list,
      .openapi-codegen-file-preview { min-width: 0; max-width: 100%; min-height: 0; overflow: auto; border: 1px solid var(--border-color, #374151); border-radius: 6px; background: var(--input-bg, #111827); padding: 10px; box-sizing: border-box; }
      .openapi-codegen-file-item { appearance: none; border: 0; width: 100%; display: grid; grid-template-columns: auto minmax(0, 1fr); gap: 8px; align-items: center; padding: 4px 6px; border-radius: 6px; background: transparent; color: inherit; text-align: left; cursor: pointer; font: inherit; font-size: 12px; }
      .openapi-codegen-file-item:hover,
      .openapi-codegen-file-item:focus-visible,
      .openapi-codegen-file-item.is-selected { background: rgba(129, 140, 248, 0.16); outline: none; }
      .openapi-codegen-file-path { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .openapi-codegen-badge { border-radius: 999px; padding: 2px 7px; font-size: 10px; font-weight: 700; text-transform: uppercase; }
      .openapi-codegen-badge-new { background: rgba(34, 197, 94, 0.16); color: #86efac; }
      .openapi-codegen-badge-overwrite { background: rgba(251, 191, 36, 0.16); color: #fde68a; }
      .openapi-codegen-file-preview-pane { display: grid; grid-template-rows: auto minmax(0, 1fr); gap: 8px; min-width: 0; min-height: 0; }
      .openapi-codegen-file-preview-header { display: flex; align-items: center; justify-content: space-between; gap: 10px; min-width: 0; color: var(--muted-text-color, #9ca3af); font-size: 12px; }
      .openapi-codegen-file-preview-title { min-width: 0; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .openapi-codegen-log-button { height: 28px; padding: 0 10px; white-space: nowrap; }
      .openapi-codegen-file-preview { margin: 0; white-space: pre; font-family: var(--monospace-font, Consolas, monospace); font-size: 12px; }
      .openapi-codegen-file-preview.is-log { white-space: pre-wrap; word-break: break-word; }
      @media (max-width: 900px) {
        .openapi-codegen-options-grid,
        .openapi-codegen-technology-fields,
        .openapi-codegen-generator-property-fields,
        .openapi-codegen-package-fields,
        .openapi-codegen-preview-body { grid-template-columns: 1fr; }
        .reset-modal-box.app-notification-box.openapi-codegen-options-modal,
        .reset-modal-box.app-notification-box.openapi-codegen-preview-modal { width: min(94vw, 760px); max-width: min(94vw, 760px); }
        .openapi-codegen-output-row { grid-template-columns: 1fr; }
        .openapi-codegen-preview-dialog { width: 100%; min-width: 0; }
      }
    `;
    document.head?.appendChild(style);
  }

  function registerMarkdownViewerOpenApiCodegen(app, deps = {}) {
    injectCodegenStyles();

    function getWorkspaceRoot() {
      return normalizePath(deps.getWorkspaceRoot?.() || deps.getActiveFolderPath?.() || "");
    }

    function getDefaultOutputFolder(generatorName) {
      const workspaceRoot = getWorkspaceRoot();
      return workspaceRoot ? joinPath(joinPath(workspaceRoot, "generated-code"), generatorName || "openapi") : "";
    }

    async function showMessage(title, message) {
      if (deps.notify?.show) {
        await deps.notify.show({
          title,
          message,
          dismissValue: "ok",
          buttons: [{ id: "ok", label: "OK", value: "ok", variant: "primary", autoFocus: true }]
        });
      }
    }

    function renderField(labelText, control) {
      const field = createElement("div", "openapi-codegen-field");
      field.appendChild(createElement("label", "", labelText));
      field.appendChild(control);
      return field;
    }

    async function chooseCodegenOptions(source) {
      const notify = deps.notify;
      if (!notify?.show) throw new Error("OpenAPI code generation dialogs are unavailable.");
      const firstGenerator = DEFAULT_GENERATORS[0];
      const state = {
        technologyId: firstGenerator.groupId,
        generatorId: firstGenerator.id,
        outputFolder: getDefaultOutputFolder(firstGenerator.id),
        packageValues: Object.assign({}, DEFAULT_PACKAGE_VALUES),
        propertyValues: Object.assign({}, firstGenerator.presetProperties || {}),
        advanced: ""
      };
      const getGenerator = (generatorId) => DEFAULT_GENERATORS.find((item) => item.id === generatorId) || firstGenerator;
      const getTechnologyGenerator = (technologyId) => DEFAULT_GENERATORS.find((item) => item.groupId === technologyId) || firstGenerator;
      const setGenerator = (generator) => {
        state.generatorId = generator.id;
        state.outputFolder = getDefaultOutputFolder(generator.id);
        state.propertyValues = Object.assign({}, generator.presetProperties || {});
      };
      const createSnapshot = () => ({
        technologyId: state.technologyId,
        generatorId: state.generatorId,
        outputFolder: state.outputFolder,
        packageValues: Object.assign({}, state.packageValues),
        propertyValues: Object.assign({}, state.propertyValues),
        advanced: state.advanced
      });
      const result = await notify.show({
        title: "Generate Code From OpenAPI",
        message: `Generate source code from ${getFileName(source.filePath || source.specFileName)}.`,
        dialogClassName: "openapi-codegen-options-modal",
        dismissValue: null,
        buttons: [
          { id: "cancel", label: "Cancel", value: null, variant: "cancel" },
          { id: "preview", label: "Preview", variant: "primary", autoFocus: true, action: createSnapshot }
        ],
        renderBody(body) {
          body.classList.add("openapi-codegen-options-dialog");
          const grid = createElement("div", "openapi-codegen-options-grid");
          const technologySelect = document.createElement("select");
          DEFAULT_GENERATOR_GROUPS.forEach((group) => {
            const option = document.createElement("option");
            option.value = group.id;
            option.textContent = group.label;
            technologySelect.appendChild(option);
          });
          technologySelect.value = state.technologyId;
          const generatorSelect = document.createElement("select");
          const outputInput = document.createElement("input");
          outputInput.type = "text";
          outputInput.value = state.outputFolder;
          const browseButton = createElement("button", "reset-modal-btn reset-modal-cancel openapi-codegen-browse-button", "Browse");
          browseButton.type = "button";
          const packageFields = createElement("div", "openapi-codegen-package-fields");
          const propertyFields = createElement("div", "openapi-codegen-generator-property-fields");
          const advanced = document.createElement("textarea");
          advanced.placeholder = "hideGenerationTimestamp=true\nserializableModel=true";

          const renderGeneratorOptions = () => {
            generatorSelect.textContent = "";
            DEFAULT_GENERATORS
              .filter((generator) => generator.groupId === state.technologyId)
              .forEach((generator) => {
                const option = document.createElement("option");
                option.value = generator.id;
                option.textContent = generator.label;
                generatorSelect.appendChild(option);
              });
            generatorSelect.value = state.generatorId;
          };

          const renderPackageFields = () => {
            packageFields.textContent = "";
            const generator = getGenerator(state.generatorId);
            packageFields.hidden = !generator.packageFields.length;
            generator.packageFields.forEach((fieldName) => {
              const input = document.createElement("input");
              input.type = "text";
              input.value = state.packageValues[fieldName] || "";
              input.addEventListener("input", () => { state.packageValues[fieldName] = input.value; });
              packageFields.appendChild(renderField(fieldName, input));
            });
          };

          const renderPropertyFields = () => {
            propertyFields.textContent = "";
            const generator = getGenerator(state.generatorId);
            const fields = generator.propertyFields || [];
            propertyFields.hidden = !fields.length;
            fields.forEach((field) => {
              let control;
              if (field.type === "select") {
                control = document.createElement("select");
                (field.options || []).forEach((value) => {
                  const option = document.createElement("option");
                  option.value = value;
                  option.textContent = value;
                  control.appendChild(option);
                });
              } else if (field.type === "boolean") {
                control = document.createElement("select");
                [{ value: "true", label: "Yes" }, { value: "false", label: "No" }].forEach((item) => {
                  const option = document.createElement("option");
                  option.value = item.value;
                  option.textContent = item.label;
                  control.appendChild(option);
                });
              } else {
                control = document.createElement("input");
                control.type = "text";
              }
              control.value = state.propertyValues[field.name] ?? field.defaultValue ?? "";
              control.addEventListener("input", () => { state.propertyValues[field.name] = control.value; });
              control.addEventListener("change", () => { state.propertyValues[field.name] = control.value; });
              propertyFields.appendChild(renderField(field.label || field.name, control));
            });
          };

          const refreshGeneratorUi = () => {
            renderGeneratorOptions();
            outputInput.value = state.outputFolder;
            renderPackageFields();
            renderPropertyFields();
          };

          technologySelect.addEventListener("change", () => {
            state.technologyId = technologySelect.value;
            setGenerator(getTechnologyGenerator(state.technologyId));
            refreshGeneratorUi();
          });
          generatorSelect.addEventListener("change", () => {
            setGenerator(getGenerator(generatorSelect.value));
            refreshGeneratorUi();
          });
          outputInput.addEventListener("input", () => { state.outputFolder = outputInput.value; });
          browseButton.addEventListener("click", async () => {
            const picked = await deps.showFolderDialog?.("Select OpenAPI code output folder", state.outputFolder ? { defaultPath: state.outputFolder } : undefined);
            if (!picked) return;
            state.outputFolder = normalizePath(picked);
            outputInput.value = state.outputFolder;
          });
          advanced.addEventListener("input", () => { state.advanced = advanced.value; });
          const selectorRow = createElement("div", "openapi-codegen-technology-fields");
          selectorRow.append(renderField("Technology", technologySelect), renderField("Sub technology", generatorSelect));
          const outputRow = createElement("div", "openapi-codegen-output-row");
          outputRow.append(renderField("Output folder", outputInput), browseButton);
          const advancedField = renderField("Advanced properties", advanced);
          advancedField.classList.add("openapi-codegen-advanced");
          grid.append(selectorRow, outputRow, packageFields, propertyFields, advancedField);
          refreshGeneratorUi();
          body.appendChild(grid);
        }
      });
      if (!result) return null;
      const generator = getGenerator(result.generatorId);
      const properties = Object.assign({}, generator.presetProperties || {}, result.propertyValues || {});
      generator.packageFields.forEach((fieldName) => {
        const value = String(result.packageValues?.[fieldName] || "").trim();
        if (value) properties[fieldName] = value;
      });
      Object.assign(properties, parseAdditionalProperties(result.advanced));
      return {
        generatorName: generator.generatorName || generator.id,
        outputFolder: normalizePath(result.outputFolder),
        additionalProperties: properties
      };
    }
    function renderGeneratedFiles(files, onSelect) {
      const list = createElement("div", "openapi-codegen-file-list");
      (files || []).forEach((file) => {
        const item = createElement("button", "openapi-codegen-file-item");
        const status = String(file.status || "new");
        const label = file.relativePath || file.path || "";
        item.type = "button";
        item.title = label;
        item.addEventListener("click", () => onSelect?.(file, item));
        const badge = createElement("span", `openapi-codegen-badge openapi-codegen-badge-${status}`, status);
        item.append(badge, createElement("span", "openapi-codegen-file-path", label));
        list.appendChild(item);
      });
      if (!list.children.length) list.appendChild(createElement("div", "openapi-empty-state", "No generated files were reported."));
      return list;
    }

    async function readGeneratedFileContent(result, file) {
      const relativePath = file?.relativePath || "";
      if (!relativePath) return { ok: false, error: "Generated file path is missing." };
      if (typeof file.content === "string") return { ok: true, content: file.content };
      if (!deps.bridge?.read) return { ok: false, error: "Generated file preview is unavailable." };
      return deps.bridge.read({ stagingFolder: result.stagingFolder, relativePath });
    }

    async function confirmApplyCodegen(result, config) {
      const notify = deps.notify;
      if (!notify?.show) return false;
      const files = result.files || [];
      const overwriteCount = files.filter((file) => file.status === "overwrite").length;
      const logText = [result.stdout, result.stderr].filter(Boolean).join("\n\n") || "No generator output.";
      const choice = await notify.show({
        title: "Apply Generated Code?",
        message: `${files.length} file${files.length === 1 ? "" : "s"} generated into staging for ${config.generatorName}.`,
        dialogClassName: "openapi-codegen-preview-modal",
        dismissValue: "cancel",
        buttons: [
          { id: "cancel", label: "Cancel", value: "cancel", variant: "cancel" },
          { id: "apply", label: overwriteCount ? "Overwrite and Apply" : "Apply", value: "apply", variant: "primary", autoFocus: true }
        ],
        renderBody(body) {
          body.classList.add("openapi-codegen-preview-dialog");
          const summary = createElement("div", "openapi-codegen-preview-summary");
          summary.append(
            createElement("span", "", `Output: ${config.outputFolder}`),
            createElement("span", "", `New: ${files.filter((file) => file.status !== "overwrite").length}`),
            createElement("span", "", `Overwrite: ${overwriteCount}`)
          );
          const previewBody = createElement("div", "openapi-codegen-preview-body");
          const previewPane = createElement("section", "openapi-codegen-file-preview-pane");
          const previewHeader = createElement("div", "openapi-codegen-file-preview-header");
          const previewTitle = createElement("span", "openapi-codegen-file-preview-title", "Generator log");
          const logButton = createElement("button", "reset-modal-btn reset-modal-cancel openapi-codegen-log-button", "Log");
          const previewContent = createElement("pre", "openapi-codegen-file-preview is-log", logText);
          let selectionToken = 0;
          let fileList = null;

          function showLog() {
            selectionToken += 1;
            previewTitle.textContent = "Generator log";
            previewContent.textContent = logText;
            previewContent.classList.add("is-log");
            fileList?.querySelectorAll(".openapi-codegen-file-item.is-selected").forEach((item) => item.classList.remove("is-selected"));
          }

          async function showFile(file, item) {
            const token = selectionToken + 1;
            selectionToken = token;
            fileList?.querySelectorAll(".openapi-codegen-file-item.is-selected").forEach((row) => row.classList.remove("is-selected"));
            item?.classList.add("is-selected");
            previewTitle.textContent = file.relativePath || file.path || "Generated file";
            previewContent.classList.remove("is-log");
            previewContent.textContent = "Loading generated file...";
            const content = await readGeneratedFileContent(result, file);
            if (selectionToken !== token) return;
            previewContent.textContent = content?.ok ? String(content.content || "") : (content?.error || "Unable to load generated file content.");
          }

          logButton.type = "button";
          logButton.title = "Show generator output log";
          logButton.addEventListener("click", showLog);
          previewHeader.append(previewTitle, logButton);
          previewPane.append(previewHeader, previewContent);
          fileList = renderGeneratedFiles(files, showFile);
          previewBody.append(fileList, previewPane);
          body.append(summary, previewBody);
        }
      });
      return choice === "apply";
    }

    async function generateFromSource(source, options = {}) {
      const validation = options.validationResult || deps.detector?.validateOpenApiText?.(source.specText, source.filePath, { yamlLibrary: deps.yamlLibrary });
      const hasErrors = validation?.status === "parse-error" || (validation?.diagnostics || []).some((item) => item.severity === "error");
      if (hasErrors) {
        await showMessage("Generate Code From OpenAPI", "Fix OpenAPI validation errors before generating code.");
        return { status: "invalid", validation };
      }
      const config = await chooseCodegenOptions(source);
      if (!config) return { status: "cancelled" };
      if (!config.outputFolder) throw new Error("Choose an output folder before generating code.");
      const request = createCodegenRequest({
        specText: source.specText,
        specFileName: source.specFileName || source.filePath,
        workspaceRoot: getWorkspaceRoot(),
        outputFolder: config.outputFolder,
        generatorName: config.generatorName,
        additionalProperties: config.additionalProperties,
        templateDir: config.templateDir
      });
      const generated = await deps.bridge?.generate?.(request);
      if (!generated?.ok) {
        await showMessage("Generate Code From OpenAPI", generated?.error || generated?.stderr || "OpenAPI code generation failed.");
        return { status: "failed", result: generated };
      }
      const confirmed = await confirmApplyCodegen(generated, config);
      if (!confirmed) return { status: "cancelled", result: generated };
      const applied = await deps.bridge?.apply?.({ stagingFolder: generated.stagingFolder, outputFolder: config.outputFolder, overwrite: true });
      if (!applied?.ok) {
        await showMessage("Generate Code From OpenAPI", applied?.error || "Generated files could not be applied.");
        return { status: "failed", result: applied };
      }
      deps.refreshFolderTree?.();
      await showMessage("Generate Code From OpenAPI", `Generated code was written to ${config.outputFolder}.`);
      return { status: "applied", request, result: applied };
    }

    const api = {
      getGenerators: () => DEFAULT_GENERATORS.slice(),
      parseAdditionalProperties,
      createCodegenRequest,
      generateFromSource
    };
    app.registerModule?.("openApiCodegen", api);
    return api;
  }

  root.markdownViewerOpenApiCodegen = {
    getGenerators: () => DEFAULT_GENERATORS.slice(),
    getGeneratorGroups: () => DEFAULT_GENERATOR_GROUPS.slice(),
    parseAdditionalProperties,
    createCodegenRequest
  };
  root.registerMarkdownViewerOpenApiCodegen = registerMarkdownViewerOpenApiCodegen;

  if (typeof module !== "undefined" && module.exports) {
    module.exports = {
      getGenerators: () => DEFAULT_GENERATORS.slice(),
      getGeneratorGroups: () => DEFAULT_GENERATOR_GROUPS.slice(),
      parseAdditionalProperties,
      createCodegenRequest
    };
  }
})(typeof window !== "undefined" ? window : globalThis, typeof document !== "undefined" ? document : null);
