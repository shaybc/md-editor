/** Active provider route selection, provider construction, and bounded fallback. */

"use strict";

const { createProvider } = require("../../shared/provider-factory");
const { createProviderDebugEmitter } = require("../../../core/provider-debug");
const { resolveModelInfo } = require("../../../config/model-registry");

class ProviderRouteSession {
  constructor(request, catalog, emit = () => {}, options = {}) {
    this.request = request;
    this.catalog = catalog;
    this.emit = emit;
    this.providerOverride = options.provider || null;
    this.providers = new Map();
    this.history = [];
    this.active = null;
  }

  /** Select an enabled route and return its provider. */
  select(id = "", options = {}) {
    const resolved = this.catalog.resolve(id || this.request.routeId, options.purpose || "primary");
    if (!allowsContext(resolved.route, options.requiredDataScopes)) throw routeDenied(resolved.route.id);
    const previous = this.active?.route?.id || "";
    this.active = resolved;
    this.applyLimits(resolved);
    const provider = this.providerFor(resolved);
    const entry = { routeId: resolved.route.id, previousRouteId: previous, reason: String(options.reason || "configured route"), selectedAt: new Date().toISOString() };
    this.history.push(entry);
    this.history = this.history.slice(-50);
    this.emit({ type: "route-selected", ...entry, model: resolved.route.model || resolved.profile.model, summary: `Using provider route ${resolved.route.id}.` });
    return provider;
  }

  /** Return public route metadata. */
  list(options) { return this.catalog.list(options); }
  inspect(id) { return this.catalog.inspect(id); }

  /** Select the first configured fallback eligible for this transport failure. */
  fallback(error, options = {}) {
    if (!this.active || !isFallbackEligible(error)) return null;
    for (const fallbackId of this.active.route.fallbacks) {
      const candidate = this.catalog.resolve(fallbackId);
      const changesProvider = candidate.profile.providerMode !== this.active.profile.providerMode || candidate.profile.id !== this.active.profile.id;
      if (changesProvider && !this.active.route.allowProviderChange) continue;
      if (!allowsContext(candidate.route, options.requiredDataScopes)) continue;
      const previous = this.active.route.id;
      this.active = candidate;
      this.applyLimits(candidate);
      const entry = { routeId: candidate.route.id, previousRouteId: previous, reason: classifyProviderFailure(error), selectedAt: new Date().toISOString() };
      this.history.push(entry);
      this.emit({ type: "route-fallback", ...entry, summary: `Provider route ${previous} failed; continuing with ${candidate.route.id}.` });
      return { provider: this.providerFor(candidate), notice: `Provider route changed from ${previous} to ${candidate.route.id} after ${entry.reason}. Continue from the current state without repeating completed actions.` };
    }
    this.emit({ type: "route-unavailable", routeId: this.active.route.id, reason: classifyProviderFailure(error), summary: "No authorized provider fallback is available." });
    return null;
  }

  /** Resolve a provider for a named runtime purpose without changing the main route. */
  providerForPurpose(purpose) { return this.providerFor(this.catalog.resolve("", purpose)); }

  providerFor(resolved) {
    if (this.providerOverride && resolved.route.id === "primary") return this.providerOverride;
    const key = `${resolved.profile.id}:${resolved.route.model || resolved.profile.model || ""}`;
    if (!this.providers.has(key)) {
      const settings = { ...this.request.settings, ...resolved.profile, model: resolved.route.model || resolved.profile.model || this.request.settings.model };
      this.providers.set(key, createProvider(settings, { onDebug: createProviderDebugEmitter(this.emit) }));
    }
    return this.providers.get(key);
  }

  /** Return effective limits for context budgeting after a route change. */
  limits() { return { ...(this.request.modelLimits || {}) }; }

  /** Resolve limits for a worker or maintenance route without changing the main run. */
  limitsFor(id = "", purpose = "primary") { return resolveLimits(this.catalog.resolve(id, purpose), this.request.settings.model); }

  applyLimits(resolved) {
    this.request.modelLimits = resolveLimits(resolved, this.request.settings.model);
  }

  snapshot() { return { activeRouteId: this.active?.route?.id || "", history: this.history.map((entry) => ({ ...entry })) }; }
  restore(snapshot = {}) { this.history = (Array.isArray(snapshot.history) ? snapshot.history : []).slice(-50); if (snapshot.activeRouteId) { try { this.active = this.catalog.resolve(snapshot.activeRouteId); } catch (_error) { this.active = null; } } }
}

function allowsContext(route, required = []) { return (Array.isArray(required) ? required : []).every((scope) => route.dataScopes?.[scope] === true); }
function isFallbackEligible(error) { const status = Number(error?.status || error?.statusCode || error?.response?.status); return status === 429 || status >= 500 || ["ETIMEDOUT", "ECONNRESET", "ECONNREFUSED", "EAI_AGAIN"].includes(error?.code); }
function classifyProviderFailure(error) { const status = Number(error?.status || error?.statusCode || error?.response?.status); if (status === 429) return "rate limiting"; if (status >= 500) return "provider unavailability"; return "transport failure"; }
function routeDenied(id) { const error = new Error(`Provider route ${id} is not authorized for the active data scopes.`); error.code = "ROUTE_DATA_SCOPE_DENIED"; error.retryable = false; error.doNotRetry = true; return error; }
function resolveLimits(resolved, fallbackModel = "") { const registered = resolveModelInfo(resolved.route.model || resolved.profile.model || fallbackModel); return { contextWindow: resolved.route.contextWindow || registered?.contextWindow || 0, maxOutputTokens: resolved.route.maxOutputTokens || registered?.maxOutputTokens || 0 }; }

module.exports = { ProviderRouteSession, classifyProviderFailure, isFallbackEligible };
