/** Validated user-configured model and provider route metadata. */

"use strict";

const ROUTE_PURPOSES = Object.freeze(["primary", "quick", "renewal", "memory", "worker", "review", "testing", "risk"]);

class ProviderRouteCatalog {
  constructor(settings = {}) {
    this.settings = settings;
    this.profiles = new Map(normalizeProfiles(settings).map((profile) => [profile.id, profile]));
    this.routes = new Map(normalizeRoutes(settings, this.profiles).map((route) => [route.id, route]));
  }

  /** Return compact route metadata without connector credentials. */
  list(options = {}) {
    return Array.from(this.routes.values())
      .filter((route) => !options.purpose || route.purposes.includes(options.purpose))
      .map(publicRoute);
  }

  /** Inspect one enabled route by identifier. */
  inspect(id) {
    const route = this.routes.get(String(id || ""));
    if (!route) throw routeError("ROUTE_NOT_FOUND", `Provider route not found: ${id}`);
    return publicRoute(route);
  }

  /** Resolve a route and its private connection profile for provider construction. */
  resolve(id = "", purpose = "primary") {
    const route = this.routes.get(String(id || "")) || Array.from(this.routes.values()).find((candidate) => candidate.purposes.includes(purpose)) || this.routes.get("primary");
    if (!route) throw routeError("ROUTE_UNAVAILABLE", `No provider route is configured for ${purpose}.`);
    const profile = this.profiles.get(route.profileId);
    if (!profile) throw routeError("ROUTE_PROFILE_MISSING", `Connection profile is unavailable for route ${route.id}.`);
    return { route, profile };
  }
}

function normalizeProfiles(settings) {
  const source = Array.isArray(settings.connectionProfiles) ? settings.connectionProfiles : [];
  const profiles = source.map((entry) => ({
    ...entry,
    id: String(entry?.id || "").trim(),
    providerMode: String(entry?.providerMode || settings.providerMode || "openai-compatible"),
    model: String(entry?.model || settings.model || "").trim()
  })).filter((entry) => entry.id);
  if (!profiles.some((entry) => entry.id === "default")) profiles.unshift({ ...settings, id: "default", providerMode: settings.providerMode, model: settings.model });
  return profiles.slice(0, 30);
}

function normalizeRoutes(settings, profiles) {
  const source = Array.isArray(settings.providerRoutes) ? settings.providerRoutes : [];
  const routes = source.map((entry) => ({
    id: String(entry?.id || "").trim(),
    profileId: String(entry?.profileId || "default").trim(),
    model: String(entry?.model || "").trim(),
    purposes: Array.from(new Set((Array.isArray(entry?.purposes) ? entry.purposes : ["primary"]).filter((purpose) => ROUTE_PURPOSES.includes(purpose)))),
    fallbacks: Array.from(new Set((Array.isArray(entry?.fallbacks) ? entry.fallbacks : []).map(String).filter(Boolean))).slice(0, 8),
    allowProviderChange: entry?.allowProviderChange === true,
    dataScopes: normalizeDataScopes(entry?.dataScopes),
    contextWindow: Math.max(0, Math.floor(Number(entry?.contextWindow) || 0)),
    maxOutputTokens: Math.max(0, Math.floor(Number(entry?.maxOutputTokens) || 0)),
    capabilities: {
      tools: entry?.capabilities?.tools !== false,
      vision: entry?.capabilities?.vision === true,
      reasoning: entry?.capabilities?.reasoning === true
    }
  })).filter((entry) => entry.id && profiles.has(entry.profileId));
  if (!routes.some((entry) => entry.id === "primary")) routes.unshift({ id: "primary", profileId: "default", model: String(settings.model || ""), purposes: ["primary", "quick", "renewal", "memory", "worker", "review", "testing", "risk"], fallbacks: [], allowProviderChange: false, dataScopes: normalizeDataScopes(), contextWindow: 0, maxOutputTokens: 0, capabilities: { tools: true, vision: false, reasoning: false } });
  return routes.slice(0, 50);
}

function normalizeDataScopes(value = {}) {
  return {
    workspace: value.workspace !== false,
    personalMemory: value.personalMemory !== false,
    teamMemory: value.teamMemory !== false,
    externalContent: value.externalContent === true
  };
}

function publicRoute(route) { return { id: route.id, profileId: route.profileId, model: route.model, purposes: route.purposes.slice(), fallbacks: route.fallbacks.slice(), allowProviderChange: route.allowProviderChange, dataScopes: { ...route.dataScopes }, contextWindow: route.contextWindow, maxOutputTokens: route.maxOutputTokens, capabilities: { ...route.capabilities } }; }
function routeError(code, message) { const error = new Error(message); error.code = code; error.retryable = false; error.doNotRetry = true; return error; }

module.exports = { ProviderRouteCatalog, ROUTE_PURPOSES, normalizeDataScopes };
