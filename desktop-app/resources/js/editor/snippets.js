(function(global) {
  "use strict";

  const SNIPPET_PREFERENCES_VERSION = 1;
  const SUPPORTED_SNIPPET_LANGUAGES = Object.freeze([
    Object.freeze({ id: "javascript", label: "JavaScript" }),
    Object.freeze({ id: "typescript", label: "TypeScript" }),
    Object.freeze({ id: "java", label: "Java" }),
    Object.freeze({ id: "yaml", label: "YAML" }),
    Object.freeze({ id: "python", label: "Python" }),
    Object.freeze({ id: "csharp", label: "C#" })
  ]);
  const SUPPORTED_LANGUAGE_IDS = new Set(SUPPORTED_SNIPPET_LANGUAGES.map((language) => language.id));
  const JAVASCRIPT_SNIPPETS = Object.freeze([
    Object.freeze({ id: "function-definition", label: "function", detail: "definition", type: "keyword", template: "function ${name}(${params}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for (let ${index} = 0; ${index} < ${bound}; ${index}++) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-of-loop", label: "for", detail: "of loop", type: "keyword", template: "for (let ${name} of ${collection}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "do-loop", label: "do", detail: "loop", type: "keyword", template: "do {\n\t${}\n} while (${})", enabled: true }),
    Object.freeze({ id: "while-loop", label: "while", detail: "loop", type: "keyword", template: "while (${}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "try-catch", label: "try", detail: "/ catch block", type: "keyword", template: "try {\n\t${}\n} catch (${error}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if (${}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-else-block", label: "if", detail: "/ else block", type: "keyword", template: "if (${}) {\n\t${}\n} else {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "class ${name} {\n\tconstructor(${params}) {\n\t\t${}\n\t}\n}", enabled: true }),
    Object.freeze({ id: "import-named", label: "import", detail: "named", type: "keyword", template: "import {${names}} from \"${module}\"\n${}", enabled: true }),
    Object.freeze({ id: "import-default", label: "import", detail: "default", type: "keyword", template: "import ${name} from \"${module}\"\n${}", enabled: true }),
    Object.freeze({ id: "node-require", label: "require", detail: "Node.js import", type: "function", template: "const ${name} = require(\"${module}\");\n${}", enabled: true }),
    Object.freeze({ id: "node-module-exports", label: "module.exports", detail: "Node.js export", type: "keyword", template: "module.exports = ${value};", enabled: true }),
    Object.freeze({ id: "node-async-function", label: "async function", detail: "Node.js", type: "function", template: "async function ${name}(${params}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "node-fs-read-file", label: "fs.readFile", detail: "Node.js", type: "function", template: "const fs = require(\"fs/promises\");\n\nconst ${name} = await fs.readFile(${path}, \"utf8\");\n${}", enabled: true }),
    Object.freeze({ id: "node-process-env", label: "process.env", detail: "Node.js", type: "variable", template: "process.env.${NAME}", enabled: true }),
    Object.freeze({ id: "node-express-route", label: "express route", detail: "Node.js", type: "function", template: "app.${method}(\"${route}\", async (req, res) => {\n\t${}\n});", enabled: true })
  ]);
  const TYPESCRIPT_SNIPPETS = Object.freeze(JAVASCRIPT_SNIPPETS.concat([
    Object.freeze({ id: "interface-definition", label: "interface", detail: "definition", type: "keyword", template: "interface ${name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "type-definition", label: "type", detail: "definition", type: "keyword", template: "type ${name} = ${type}", enabled: true }),
    Object.freeze({ id: "enum-definition", label: "enum", detail: "definition", type: "keyword", template: "enum ${name} {\n\t${}\n}", enabled: true })
  ]));
  const JAVA_SNIPPETS = Object.freeze([
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "public class ${Name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "main-method", label: "main", detail: "method", type: "function", template: "public static void main(String[] args) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "interface-definition", label: "interface", detail: "definition", type: "keyword", template: "public interface ${Name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "enum-definition", label: "enum", detail: "definition", type: "keyword", template: "public enum ${Name} {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for (int ${index} = 0; ${index} < ${bound}; ${index}++) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-each-loop", label: "for", detail: "each loop", type: "keyword", template: "for (${Type} ${item} : ${collection}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if (${condition}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "try-catch", label: "try", detail: "/ catch block", type: "keyword", template: "try {\n\t${}\n} catch (${Exception} ${error}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "public-method", label: "public method", detail: "method", type: "function", template: "public ${ReturnType} ${name}(${params}) {\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "private-method", label: "private method", detail: "method", type: "function", template: "private ${ReturnType} ${name}(${params}) {\n\t${}\n}", enabled: true })
  ]);
  const PYTHON_SNIPPETS = Object.freeze([
    Object.freeze({ id: "function-definition", label: "def", detail: "function", type: "function", template: "def ${name}(${params}):\n\t${}", enabled: true }),
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "class ${Name}:\n\tdef __init__(self, ${params}):\n\t\t${}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if ${condition}:\n\t${}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for ${item} in ${collection}:\n\t${}", enabled: true }),
    Object.freeze({ id: "while-loop", label: "while", detail: "loop", type: "keyword", template: "while ${condition}:\n\t${}", enabled: true }),
    Object.freeze({ id: "try-except", label: "try", detail: "/ except block", type: "keyword", template: "try:\n\t${}\nexcept ${Exception} as ${error}:\n\t${}", enabled: true }),
    Object.freeze({ id: "with-block", label: "with", detail: "block", type: "keyword", template: "with ${expression} as ${name}:\n\t${}", enabled: true }),
    Object.freeze({ id: "main-guard", label: "main guard", detail: "entry point", type: "keyword", template: "if __name__ == \"__main__\":\n\t${}", enabled: true })
  ]);
  const YAML_SNIPPETS = Object.freeze([
    Object.freeze({ id: "kubernetes-deployment", label: "k8s Deployment", detail: "Kubernetes", type: "class", template: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${appName}\n  labels:\n    app: ${appName}\nspec:\n  replicas: ${replicas}\n  selector:\n    matchLabels:\n      app: ${appName}\n  template:\n    metadata:\n      labels:\n        app: ${appName}\n    spec:\n      containers:\n        - name: ${appName}\n          image: ${image}\n          ports:\n            - containerPort: ${port}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-service", label: "k8s Service", detail: "Kubernetes", type: "class", template: "apiVersion: v1\nkind: Service\nmetadata:\n  name: ${appName}\nspec:\n  type: ClusterIP\n  selector:\n    app: ${appName}\n  ports:\n    - name: http\n      port: ${servicePort}\n      targetPort: ${containerPort}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-ingress", label: "k8s Ingress", detail: "Kubernetes", type: "class", template: "apiVersion: networking.k8s.io/v1\nkind: Ingress\nmetadata:\n  name: ${appName}\nspec:\n  rules:\n    - host: ${host}\n      http:\n        paths:\n          - path: /\n            pathType: Prefix\n            backend:\n              service:\n                name: ${appName}\n                port:\n                  number: ${servicePort}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-configmap", label: "k8s ConfigMap", detail: "Kubernetes", type: "class", template: "apiVersion: v1\nkind: ConfigMap\nmetadata:\n  name: ${configName}\ndata:\n  ${key}: ${value}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-secret", label: "k8s Secret", detail: "Kubernetes", type: "class", template: "apiVersion: v1\nkind: Secret\nmetadata:\n  name: ${secretName}\ntype: Opaque\nstringData:\n  ${key}: ${value}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-namespace", label: "k8s Namespace", detail: "Kubernetes", type: "class", template: "apiVersion: v1\nkind: Namespace\nmetadata:\n  name: ${namespace}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-serviceaccount", label: "k8s ServiceAccount", detail: "Kubernetes", type: "class", template: "apiVersion: v1\nkind: ServiceAccount\nmetadata:\n  name: ${serviceAccount}\n  namespace: ${namespace}\n", enabled: true }),
    Object.freeze({ id: "kubernetes-job", label: "k8s Job", detail: "Kubernetes", type: "class", template: "apiVersion: batch/v1\nkind: Job\nmetadata:\n  name: ${jobName}\nspec:\n  template:\n    spec:\n      restartPolicy: Never\n      containers:\n        - name: ${jobName}\n          image: ${image}\n          command: [\"${command}\"]\n  backoffLimit: 3\n", enabled: true }),
    Object.freeze({ id: "kubernetes-cronjob", label: "k8s CronJob", detail: "Kubernetes", type: "class", template: "apiVersion: batch/v1\nkind: CronJob\nmetadata:\n  name: ${jobName}\nspec:\n  schedule: \"${schedule}\"\n  jobTemplate:\n    spec:\n      template:\n        spec:\n          restartPolicy: OnFailure\n          containers:\n            - name: ${jobName}\n              image: ${image}\n              command: [\"${command}\"]\n", enabled: true }),
    Object.freeze({ id: "kubernetes-hpa", label: "k8s HorizontalPodAutoscaler", detail: "Kubernetes", type: "class", template: "apiVersion: autoscaling/v2\nkind: HorizontalPodAutoscaler\nmetadata:\n  name: ${appName}\nspec:\n  scaleTargetRef:\n    apiVersion: apps/v1\n    kind: Deployment\n    name: ${appName}\n  minReplicas: ${minReplicas}\n  maxReplicas: ${maxReplicas}\n  metrics:\n    - type: Resource\n      resource:\n        name: cpu\n        target:\n          type: Utilization\n          averageUtilization: ${cpuPercent}\n", enabled: true }),
    Object.freeze({ id: "spring-boot-kubernetes-deployment", label: "Spring Boot Deployment", detail: "Kubernetes", type: "class", template: "apiVersion: apps/v1\nkind: Deployment\nmetadata:\n  name: ${appName}\n  labels:\n    app: ${appName}\nspec:\n  replicas: ${replicas}\n  selector:\n    matchLabels:\n      app: ${appName}\n  template:\n    metadata:\n      labels:\n        app: ${appName}\n    spec:\n      containers:\n        - name: ${appName}\n          image: ${image}\n          ports:\n            - containerPort: 8080\n          readinessProbe:\n            httpGet:\n              path: /actuator/health/readiness\n              port: 8080\n          livenessProbe:\n            httpGet:\n              path: /actuator/health/liveness\n              port: 8080\n          resources:\n            requests:\n              cpu: 250m\n              memory: 512Mi\n            limits:\n              cpu: 500m\n              memory: 1Gi\n", enabled: true }),
    Object.freeze({ id: "docker-compose-spring-boot", label: "Compose Spring Boot", detail: "Docker Compose", type: "class", template: "services:\n  app:\n    image: ${image}\n    ports:\n      - \"8080:8080\"\n    environment:\n      SPRING_PROFILES_ACTIVE: ${profile}\n", enabled: true }),
    Object.freeze({ id: "docker-compose-spring-postgres", label: "Compose Spring + PostgreSQL", detail: "Docker Compose", type: "class", template: "services:\n  app:\n    image: ${image}\n    ports:\n      - \"8080:8080\"\n    environment:\n      SPRING_DATASOURCE_URL: jdbc:postgresql://db:5432/${database}\n      SPRING_DATASOURCE_USERNAME: ${username}\n      SPRING_DATASOURCE_PASSWORD: ${password}\n    depends_on:\n      - db\n  db:\n    image: postgres:16\n    environment:\n      POSTGRES_DB: ${database}\n      POSTGRES_USER: ${username}\n      POSTGRES_PASSWORD: ${password}\n    ports:\n      - \"5432:5432\"\n", enabled: true }),
    Object.freeze({ id: "docker-compose-spring-redis", label: "Compose Spring + Redis", detail: "Docker Compose", type: "class", template: "services:\n  app:\n    image: ${image}\n    ports:\n      - \"8080:8080\"\n    environment:\n      SPRING_DATA_REDIS_HOST: redis\n    depends_on:\n      - redis\n  redis:\n    image: redis:7\n    ports:\n      - \"6379:6379\"\n", enabled: true })
  ]);
  const CSHARP_SNIPPETS = Object.freeze([
    Object.freeze({ id: "class-definition", label: "class", detail: "definition", type: "keyword", template: "public class ${Name}\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "main-method", label: "main", detail: "method", type: "function", template: "public static void Main(string[] args)\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "interface-definition", label: "interface", detail: "definition", type: "keyword", template: "public interface ${Name}\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "enum-definition", label: "enum", detail: "definition", type: "keyword", template: "public enum ${Name}\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-loop", label: "for", detail: "loop", type: "keyword", template: "for (int ${index} = 0; ${index} < ${bound}; ${index}++)\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "for-each-loop", label: "foreach", detail: "loop", type: "keyword", template: "foreach (${Type} ${item} in ${collection})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "if-block", label: "if", detail: "block", type: "keyword", template: "if (${condition})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "try-catch", label: "try", detail: "/ catch block", type: "keyword", template: "try\n{\n\t${}\n}\ncatch (${Exception} ${error})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "public-method", label: "public method", detail: "method", type: "function", template: "public ${ReturnType} ${Name}(${params})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "private-method", label: "private method", detail: "method", type: "function", template: "private ${ReturnType} ${Name}(${params})\n{\n\t${}\n}", enabled: true }),
    Object.freeze({ id: "property", label: "property", detail: "definition", type: "property", template: "public ${Type} ${Name} { get; set; }", enabled: true })
  ]);
  const DEFAULT_SNIPPETS_BY_LANGUAGE = Object.freeze({
    javascript: JAVASCRIPT_SNIPPETS,
    typescript: TYPESCRIPT_SNIPPETS,
    java: JAVA_SNIPPETS,
    yaml: YAML_SNIPPETS,
    python: PYTHON_SNIPPETS,
    csharp: CSHARP_SNIPPETS
  });
  const YAML_COMPLETION_ALIASES_BY_SNIPPET_ID = Object.freeze({
    "kubernetes-deployment": Object.freeze(["deployment", "kubernetes deployment"]),
    "kubernetes-service": Object.freeze(["service", "kubernetes service"]),
    "kubernetes-ingress": Object.freeze(["ingress", "kubernetes ingress"]),
    "kubernetes-configmap": Object.freeze(["configmap", "config map"]),
    "kubernetes-secret": Object.freeze(["secret"]),
    "kubernetes-namespace": Object.freeze(["namespace"]),
    "kubernetes-serviceaccount": Object.freeze(["serviceaccount", "service account"]),
    "kubernetes-job": Object.freeze(["job"]),
    "kubernetes-cronjob": Object.freeze(["cronjob", "cron job"]),
    "kubernetes-hpa": Object.freeze(["hpa", "horizontal pod autoscaler"]),
    "spring-boot-kubernetes-deployment": Object.freeze(["spring deployment", "spring boot deployment"]),
    "docker-compose-spring-boot": Object.freeze(["compose", "docker compose", "spring compose"]),
    "docker-compose-spring-postgres": Object.freeze(["postgres", "postgresql", "spring postgres"]),
    "docker-compose-spring-redis": Object.freeze(["redis", "spring redis"])
  });
  function cloneJson(value) {
    return JSON.parse(JSON.stringify(value));
  }

  function isSupportedLanguage(languageId) {
    return SUPPORTED_LANGUAGE_IDS.has(String(languageId || ""));
  }

  function cloneSnippet(snippet, source) {
    return {
      id: String(snippet.id || "").trim(),
      label: String(snippet.label || "").trim(),
      detail: String(snippet.detail || "").trim(),
      type: String(snippet.type || "keyword").trim() || "keyword",
      template: String(snippet.template || ""),
      enabled: snippet.enabled !== false,
      source: source || snippet.source || "builtin"
    };
  }

  function normalizeSnippetDefinition(snippet, fallbackId) {
    const id = String(snippet?.id || fallbackId || "").trim();
    const label = String(snippet?.label || "").trim();
    const template = String(snippet?.template || "");
    if (!id) return null;
    return {
      id,
      label,
      detail: String(snippet?.detail || "").trim(),
      type: String(snippet?.type || "keyword").trim() || "keyword",
      template,
      enabled: snippet?.enabled !== false
    };
  }

  function normalizeSnippetPreferences(preferences) {
    const source = preferences && typeof preferences === "object" && !Array.isArray(preferences) ? preferences : {};
    const overrides = {};
    const custom = {};
    SUPPORTED_SNIPPET_LANGUAGES.forEach((language) => {
      const languageOverrides = source.overrides?.[language.id];
      overrides[language.id] = {};
      if (languageOverrides && typeof languageOverrides === "object" && !Array.isArray(languageOverrides)) {
        Object.entries(languageOverrides).forEach(([snippetId, snippet]) => {
          const normalized = normalizeSnippetDefinition(snippet, snippetId);
          if (normalized) overrides[language.id][normalized.id] = normalized;
        });
      }
      const languageCustom = Array.isArray(source.custom?.[language.id]) ? source.custom[language.id] : [];
      custom[language.id] = languageCustom
        .map((snippet) => normalizeSnippetDefinition(snippet))
        .filter(Boolean);
    });
    return { version: SNIPPET_PREFERENCES_VERSION, overrides, custom };
  }

  function cloneSnippetPreferences(preferences) {
    return normalizeSnippetPreferences(cloneJson(normalizeSnippetPreferences(preferences)));
  }

  function getDefaultSnippets(languageId) {
    return (DEFAULT_SNIPPETS_BY_LANGUAGE[languageId] || []).map((snippet) => cloneSnippet(snippet, "builtin"));
  }

  function getSnippetRows(languageId, preferences) {
    if (!isSupportedLanguage(languageId)) return [];
    const normalizedPreferences = normalizeSnippetPreferences(preferences);
    const overrides = normalizedPreferences.overrides[languageId] || {};
    const builtins = getDefaultSnippets(languageId).map((snippet) => {
      const override = overrides[snippet.id];
      return {
        ...snippet,
        ...(override ? cloneSnippet(override, "builtin") : {}),
        id: snippet.id,
        source: "builtin",
        hasOverride: !!override
      };
    });
    const customSnippets = (normalizedPreferences.custom[languageId] || []).map((snippet) => ({
      ...cloneSnippet(snippet, "custom"),
      source: "custom",
      hasOverride: false
    }));
    return builtins.concat(customSnippets);
  }

  function createCompletionSnippet(snippet, label, aliasIndex = -1) {
    return {
      id: aliasIndex >= 0 ? `${snippet.id}:alias:${aliasIndex}` : snippet.id,
      label,
      detail: snippet.detail,
      type: snippet.type || "keyword",
      template: snippet.template
    };
  }

  function getCompletionSnippets(languageId, preferences) {
    return getSnippetRows(languageId, preferences)
      .filter((snippet) => snippet.enabled !== false && snippet.label && snippet.template)
      .flatMap((snippet) => {
        const completions = [createCompletionSnippet(snippet, snippet.label)];
        if (languageId === "yaml") {
          const aliases = YAML_COMPLETION_ALIASES_BY_SNIPPET_ID[snippet.id] || [];
          aliases.forEach((alias, index) => {
            const label = String(alias || "").trim();
            if (label && label.toLowerCase() !== String(snippet.label || "").toLowerCase()) {
              completions.push(createCompletionSnippet(snippet, label, index));
            }
          });
        }
        return completions;
      });
  }

  function generateCustomSnippetId() {
    const randomSuffix = Math.random().toString(36).slice(2, 8);
    return `custom-${Date.now()}-${randomSuffix}`;
  }

  function createCustomSnippet() {
    return {
      id: generateCustomSnippetId(),
      label: "newSnippet",
      detail: "custom",
      type: "keyword",
      template: "${}",
      enabled: true
    };
  }

  function saveSnippet(preferences, languageId, snippet) {
    const nextPreferences = cloneSnippetPreferences(preferences);
    if (!isSupportedLanguage(languageId)) return nextPreferences;
    const normalized = normalizeSnippetDefinition(snippet);
    if (!normalized) return nextPreferences;
    const isBuiltin = getDefaultSnippets(languageId).some((defaultSnippet) => defaultSnippet.id === normalized.id);
    if (isBuiltin) {
      nextPreferences.overrides[languageId][normalized.id] = normalized;
      return nextPreferences;
    }
    const snippets = nextPreferences.custom[languageId] || [];
    const existingIndex = snippets.findIndex((customSnippet) => customSnippet.id === normalized.id);
    if (existingIndex >= 0) snippets[existingIndex] = normalized;
    else snippets.push(normalized);
    nextPreferences.custom[languageId] = snippets;
    return nextPreferences;
  }

  function resetBuiltinSnippet(preferences, languageId, snippetId) {
    const nextPreferences = cloneSnippetPreferences(preferences);
    if (isSupportedLanguage(languageId) && nextPreferences.overrides[languageId]) {
      delete nextPreferences.overrides[languageId][snippetId];
    }
    return nextPreferences;
  }

  function deleteCustomSnippet(preferences, languageId, snippetId) {
    const nextPreferences = cloneSnippetPreferences(preferences);
    if (isSupportedLanguage(languageId)) {
      nextPreferences.custom[languageId] = (nextPreferences.custom[languageId] || []).filter((snippet) => snippet.id !== snippetId);
    }
    return nextPreferences;
  }

  function registerMarkdownViewerSnippetRegistry(app) {
    const api = {
      version: SNIPPET_PREFERENCES_VERSION,
      getSupportedLanguages: function() { return cloneJson(SUPPORTED_SNIPPET_LANGUAGES); },
      getDefaultSnippets,
      getSnippetRows,
      getCompletionSnippets,
      normalizeSnippetPreferences,
      cloneSnippetPreferences,
      createCustomSnippet,
      saveSnippet,
      resetBuiltinSnippet,
      deleteCustomSnippet
    };
    if (app?.services) app.services.snippetRegistry = api;
    app?.registerModule?.("snippetRegistry", api);
    return api;
  }

  registerMarkdownViewerSnippetRegistry._test = {
    getSupportedLanguages: function() { return cloneJson(SUPPORTED_SNIPPET_LANGUAGES); },
    getCompletionSnippets,
    getDefaultSnippets,
    getSnippetRows,
    normalizeSnippetPreferences,
    createCustomSnippet,
    saveSnippet,
    resetBuiltinSnippet,
    deleteCustomSnippet
  };

  global.registerMarkdownViewerSnippetRegistry = registerMarkdownViewerSnippetRegistry;
})(typeof window !== "undefined" ? window : globalThis);
