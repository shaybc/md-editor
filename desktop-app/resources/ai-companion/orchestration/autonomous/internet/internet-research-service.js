/** Model-facing internet research operations with policy, approval, and artifact boundaries. */

"use strict";

const { authorizeTool } = require("../approval-gateway");
const { SafePageRetriever } = require("./safe-page-retriever");
const { pageToMarkdown } = require("./page-to-markdown");
const { InternetProviderRegistry, normalizeDomain } = require("./internet-provider-registry");

class InternetResearchService {
  constructor(request, options = {}) {
    this.request = request;
    this.emit = typeof options.emit === "function" ? options.emit : () => {};
    this.artifacts = options.artifacts;
    this.taskGrants = options.taskGrants || [];
    this.authorizationControls = options.authorizationControls;
    this.retriever = new SafePageRetriever({ fetch: options.fetch });
    this.providers = new InternetProviderRegistry(request, this.retriever, { provider: options.provider });
  }

  /** Search public sources through the best currently available backend. */
  async search(input = {}) {
    this.assertNetworkAllowed();
    const normalized = normalizeSearchInput(input);
    const startedAt = Date.now();
    const output = await this.providers.search(normalized, { signal: this.request.signal, timeoutMs: input.timeoutMs, onRateLimit: (details) => this.emit({ type: "rate-limit-wait", ...details, summary: "Internet source rate limit; waiting before retry." }) });
    const result = { query: normalized.query, backend: output.backend, results: output.results.slice(0, normalized.maxResults), durationMs: Date.now() - startedAt, retrievedAt: new Date().toISOString() };
    this.emit({ type: "internet-search-completed", query: result.query, backend: result.backend, resultCount: result.results.length, results: result.results.slice(0, 10), durationMs: result.durationMs, summary: `Internet search returned ${result.results.length} sources.` });
    return result;
  }

  /** Retrieve and convert one approved public page, storing oversized text as an artifact. */
  async retrieve(input = {}) {
    this.assertNetworkAllowed();
    const url = String(input.url || "").trim();
    const domain = normalizeDomain(url);
    const approval = await authorizeTool(this.request, "page_retrieve", { url, domain, approvalReason: input.reason || "Retrieve a public source selected for this task." }, this.taskGrants, this.authorizationControls);
    if (!approval.approved) return { denied: true, doNotRetry: approval.doNotRetry === true, instructions: approval.instructions || "Page retrieval was denied." };
    const startedAt = Date.now();
    const page = await this.retriever.retrieve(url, { signal: this.request.signal, timeoutMs: input.timeoutMs, maxBytes: input.maxBytes, onRateLimit: (details) => this.emit({ type: "rate-limit-wait", ...details, summary: "Page source rate limit; waiting before retry." }) });
    const markdown = pageToMarkdown(page.body, page.contentType, 180000);
    let content = markdown;
    let artifact = null;
    if (markdown.length > 24000 && this.artifacts) {
      artifact = await this.artifacts.store(markdown, { tool: "page_retrieve" });
      content = `${markdown.slice(0, 12000)}\n\n${this.artifacts.reference(artifact)}`;
    }
    const result = { url: page.url, objective: String(input.objective || "").trim().slice(0, 1000), contentType: page.contentType, bytes: page.bytes, content, artifact: artifact ? { id: artifact.id, bytes: artifact.bytes, digest: artifact.digest } : null, retrievedAt: new Date().toISOString(), durationMs: Date.now() - startedAt };
    this.emit({ type: "page-retrieved", url: result.url, bytes: result.bytes, artifactId: artifact?.id, durationMs: result.durationMs, summary: `Retrieved ${new URL(result.url).hostname}.` });
    return result;
  }

  assertNetworkAllowed() {
    if (this.request.securityContext?.policy?.execution?.networkAccess === false) {
      const error = new Error("Internet access is disabled by the effective AI security policy.");
      error.code = "NETWORK_ACCESS_DENIED"; error.retryable = false; error.doNotRetry = true;
      throw error;
    }
  }
}

function normalizeSearchInput(input) {
  const query = String(input.query || "").trim();
  if (query.length < 2) throw new Error("Internet search requires a query of at least two characters.");
  return {
    query,
    allowedDomains: uniqueDomains(input.allowedDomains),
    blockedDomains: uniqueDomains(input.blockedDomains),
    maxResults: Math.max(1, Math.min(Number(input.maxResults) || 8, 20))
  };
}

function uniqueDomains(value) { return Array.from(new Set((Array.isArray(value) ? value : []).map(normalizeDomain).filter(Boolean))).slice(0, 30); }

module.exports = { InternetResearchService, normalizeSearchInput };
