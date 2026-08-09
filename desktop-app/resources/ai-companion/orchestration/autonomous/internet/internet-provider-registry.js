/** Selects an available internet-search backend without exposing credentials to the model. */

"use strict";

const { pageToMarkdown } = require("./page-to-markdown");

class InternetProviderRegistry {
  constructor(request, retriever, options = {}) {
    this.request = request;
    this.retriever = retriever;
    this.provider = options.provider;
    this.preferred = "";
  }

  /** List backend identities without exposing endpoint credentials or schemas. */
  list() {
    return [
      ...(typeof this.provider?.searchWeb === "function" ? [{ id: "connector", label: "Active connector search" }] : []),
      ...(this.request.settings?.internetSearchEndpoint ? [{ id: "configured", label: "Configured search service" }] : []),
      { id: "keyless", label: "Keyless public search" }
    ];
  }

  /** Prefer one available backend while retaining fallback behavior. */
  select(id) {
    const selected = String(id || "");
    if (!this.list().some((entry) => entry.id === selected)) throw new Error(`Internet search backend is unavailable: ${selected || "empty"}.`);
    this.preferred = selected;
    return this.list().find((entry) => entry.id === selected);
  }

  /** Search through the active connector, configured endpoint, then the keyless fallback. */
  async search(input, options = {}) {
    const failures = [];
    const available = this.list().map((entry) => entry.id);
    const order = this.preferred ? [this.preferred, ...available.filter((id) => id !== this.preferred)] : available;
    for (const backend of order) {
      try {
        if (backend === "connector") return normalizeOutput(await this.provider.searchWeb(input, options), backend, input);
        if (backend === "configured") return await this.searchConfigured(this.request.settings.internetSearchEndpoint, input, options);
        if (backend === "keyless") return await this.searchKeyless(input, options);
      } catch (error) {
        failures.push({ backend, error: error?.message || String(error) });
      }
    }
    const failure = new Error(`Internet search failed across all available backends: ${failures.map((entry) => `${entry.backend}: ${entry.error}`).join("; ")}`);
    failure.code = "INTERNET_SEARCH_UNAVAILABLE";
    failure.retryable = true;
    failure.failures = failures;
    throw failure;
  }

  async searchConfigured(endpoint, input, options) {
    const url = new URL(String(endpoint));
    url.searchParams.set("q", input.query);
    const result = await this.retriever.retrieve(url.toString(), options);
    let parsed;
    try { parsed = JSON.parse(result.body); } catch (_error) { parsed = null; }
    const candidates = parsed?.results || parsed?.items || parsed?.data || [];
    return normalizeOutput(candidates, "configured", input);
  }

  async searchKeyless(input, options) {
    const query = addDomainFilters(input);
    const result = await this.retriever.retrieve(`https://html.duckduckgo.com/html/?q=${encodeURIComponent(query)}`, options);
    const hits = [];
    const expression = /<a[^>]+class=["'][^"']*result__a[^"']*["'][^>]+href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>[\s\S]*?(?:class=["'][^"']*result__snippet[^"']*["'][^>]*>([\s\S]*?)<\/)/gi;
    for (const match of result.body.matchAll(expression)) {
      const url = decodeSearchUrl(match[1]);
      if (!url || !domainAllowed(url, input)) continue;
      hits.push({ title: pageToMarkdown(match[2], "text/html", 300), url, description: pageToMarkdown(match[3], "text/html", 800) });
      if (hits.length >= (input.maxResults || 8)) break;
    }
    if (!hits.length) throw new Error("The keyless search backend returned no usable results; it may be rate-limited.");
    return { backend: "keyless", results: hits };
  }
}

function normalizeOutput(value, backend, input = {}) {
  const source = Array.isArray(value) ? value : (Array.isArray(value?.results) ? value.results : []);
  const results = source.map((entry) => ({
    title: String(entry?.title || entry?.name || "Untitled result").trim().slice(0, 500),
    url: String(entry?.url || entry?.link || "").trim(),
    description: String(entry?.description || entry?.snippet || entry?.content || "").trim().slice(0, 2000)
  })).filter((entry) => /^https?:\/\//i.test(entry.url) && domainAllowed(entry.url, input));
  if (!results.length) throw new Error(`${backend} search returned no usable results.`);
  return { backend, results };
}

function addDomainFilters(input) {
  const allowed = (input.allowedDomains || []).map((domain) => `site:${domain}`);
  const blocked = (input.blockedDomains || []).map((domain) => `-site:${domain}`);
  return [input.query, ...allowed, ...blocked].join(" ");
}

function decodeSearchUrl(value) {
  try {
    const url = new URL(String(value || ""), "https://html.duckduckgo.com");
    const target = url.searchParams.get("uddg");
    return target ? decodeURIComponent(target) : url.toString();
  } catch (_error) { return ""; }
}

function domainAllowed(value, input) {
  try {
    const host = new URL(value).hostname.toLowerCase();
    const matches = (domain) => host === domain || host.endsWith(`.${domain}`);
    const allowed = (input.allowedDomains || []).map(normalizeDomain).filter(Boolean);
    const blocked = (input.blockedDomains || []).map(normalizeDomain).filter(Boolean);
    return !blocked.some(matches) && (!allowed.length || allowed.some(matches));
  } catch (_error) { return false; }
}

function normalizeDomain(value) { return String(value || "").trim().toLowerCase().replace(/^https?:\/\//, "").split("/")[0].replace(/^\.+|\.+$/g, ""); }

module.exports = { InternetProviderRegistry, normalizeDomain };
