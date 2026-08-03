// State, validation, and signature projection for Introduce Parameter Object.
(function(global) {
  "use strict";

  const JAVA_KEYWORDS = new Set((
    "abstract assert boolean break byte case catch char class const continue default do double else enum " +
    "extends final finally float for goto if implements import instanceof int interface long native new " +
    "package private protected public record return sealed short static strictfp super switch synchronized " +
    "this throw throws transient try var void volatile while yield permits non-sealed true false null"
  ).split(/\s+/));

  function isValidJavaIdentifier(value) {
    const name = String(value || "").trim();
    return /^[A-Za-z_$][\w$]*$/.test(name) && !JAVA_KEYWORDS.has(name);
  }

  function clone(value) {
    if (typeof structuredClone === "function") return structuredClone(value);
    return JSON.parse(JSON.stringify(value));
  }

  /**
   * Create the editable wizard state for one resolved Java method.
   * @param {object} analysis Semantic method analysis.
   * @returns {object} Mutable dialog model with Eclipse-compatible defaults.
   */
  function createModel(analysis) {
    const ownerName = String(analysis?.owner?.name || analysis?.methodName || "Method");
    return {
      className: `${ownerName}Parameter`,
      destination: "top-level",
      createGetters: true,
      createSetters: true,
      parameterName: "parameterObject",
      keepDelegate: false,
      deprecateDelegate: false,
      fields: (analysis?.parameters || []).map((parameter, order) => ({
        originalIndex: parameter.originalIndex,
        type: parameter.type,
        originalName: parameter.name,
        fieldName: parameter.name,
        selected: true,
        order
      }))
    };
  }

  function selectedFields(model) {
    return (model?.fields || [])
      .filter((field) => field.selected)
      .slice()
      .sort((left, right) => Number(left.order) - Number(right.order));
  }

  function validate(model, analysis) {
    if (!isValidJavaIdentifier(model?.className)) return "Enter a valid Java class name.";
    if (!isValidJavaIdentifier(model?.parameterName)) return "Enter a valid Java parameter name.";
    if (!["top-level", "nested"].includes(model?.destination)) return "Select a valid class destination.";
    const fields = selectedFields(model);
    if (!fields.length) return "Select at least one parameter.";
    const fieldNames = new Set();
    for (const field of fields) {
      if (!isValidJavaIdentifier(field.fieldName)) return "Every selected field needs a valid Java name.";
      if (fieldNames.has(field.fieldName)) return `Field name '${field.fieldName}' is duplicated.`;
      fieldNames.add(field.fieldName);
    }
    const remainingNames = new Set((analysis?.parameters || [])
      .filter((parameter) => !fields.some((field) => field.originalIndex === parameter.originalIndex))
      .map((parameter) => parameter.name));
    if (remainingNames.has(model.parameterName)) {
      return `Parameter name '${model.parameterName}' conflicts with an unchanged parameter.`;
    }
    if (model.deprecateDelegate && !model.keepDelegate) {
      return "Keep the original method before marking it deprecated.";
    }
    return "";
  }

  function objectParameterType(model) {
    return model.className;
  }

  function changedParameters(model, analysis) {
    const fields = selectedFields(model);
    const selectedIndices = new Set(fields.map((field) => field.originalIndex));
    const insertionIndex = Math.min(...fields.map((field) => field.originalIndex));
    const result = [];
    (analysis?.parameters || []).forEach((parameter) => {
      if (parameter.originalIndex === insertionIndex) {
        result.push({ type: objectParameterType(model, analysis), name: model.parameterName, parameterObject: true });
      }
      if (!selectedIndices.has(parameter.originalIndex)) result.push(parameter);
    });
    return result;
  }

  function buildSignature(model, analysis) {
    const parameters = changedParameters(model, analysis).map((parameter) => `${parameter.type} ${parameter.name}`).join(", ");
    const prefix = analysis?.isConstructor
      ? `${analysis.visibility ? `${analysis.visibility} ` : ""}${analysis.methodName}`
      : [
          analysis?.visibility || "",
          analysis?.isStatic ? "static" : "",
          analysis?.returnType || "void",
          analysis?.methodName || ""
        ].filter(Boolean).join(" ");
    return `${prefix}(${parameters})`;
  }

  global.markdownViewerJavaParameterObjectModel = {
    buildSignature,
    changedParameters,
    clone,
    createModel,
    isValidJavaIdentifier,
    selectedFields,
    validate
  };
})(typeof window !== "undefined" ? window : globalThis);
