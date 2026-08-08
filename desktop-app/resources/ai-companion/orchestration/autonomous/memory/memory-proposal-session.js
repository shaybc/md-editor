/** Run-scoped confirmation workflow for curated memory mutations. */

"use strict";

const crypto = require("node:crypto");
const { assertMemoryContentSafe, normalizeMemoryTopic } = require("./memory-topic-policy");

class MemoryProposalSession {
  constructor(request, repository, emit = () => {}) {
    this.request = request;
    this.repository = repository;
    this.emit = emit;
    this.proposals = [];
  }

  /** Propose and confirm a memory creation or update through the existing approval channel. */
  async propose(input, operation = "create") {
    const existing = operation === "forget" ? await this.repository.read(input.id, input.scope) : null;
    const normalized = operation === "forget" ? existing : normalizeMemoryTopic(input);
    if (operation !== "forget") assertMemoryContentSafe(normalized);
    const fingerprint = digest({ operation, id: input.id || "", scope: normalized.scope, type: normalized.type, title: normalized.title, content: normalized.content });
    const prior = this.proposals.find((proposal) => proposal.fingerprint === fingerprint);
    if (prior?.status === "rejected") return { proposed: false, denied: true, doNotRetry: true, instructions: prior.instructions || "The user rejected this memory proposal." };
    const proposal = { proposalId: crypto.randomUUID(), operation, fingerprint, status: "pending", ...normalized, ...(input.id ? { id: String(input.id) } : {}) };
    this.proposals.push(proposal);
    this.emit({ type: "memory-proposed", proposal: publicProposal(proposal), summary: `Confirm ${proposal.scope} memory: ${proposal.title}` });
    if (typeof this.request.requestApproval !== "function") throw Object.assign(new Error("Memory confirmation is unavailable."), { code: "MEMORY_CONFIRMATION_UNAVAILABLE", retryable: false, doNotRetry: true });
    const decision = await this.request.requestApproval({
      approvalKind: "memory",
      tool: operation === "forget" ? "memory_forget" : (operation === "update" ? "memory_update" : "memory_propose"),
      input: proposal.title,
      capability: `memory.${proposal.scope}.write`,
      resource: { type: "exact", value: proposal.id },
      maximumGrantLifetime: "action",
      grantOptions: [],
      summary: `${operation === "forget" ? "Forget" : operation === "update" ? "Update" : "Save"} ${proposal.scope} memory`,
      preview: `${proposal.title}\n\n${proposal.content}`,
      approvalReason: "Curated memory changes require explicit user confirmation."
    });
    if (!decision?.approved) {
      proposal.status = "rejected";
      proposal.instructions = String(decision?.instructions || "");
      this.emit({ type: "memory-rejected", proposal: publicProposal(proposal), instructions: proposal.instructions, summary: `Memory proposal rejected: ${proposal.title}` });
      return { proposed: true, confirmed: false, denied: true, doNotRetry: true, instructions: proposal.instructions || "The user rejected this memory proposal." };
    }
    proposal.status = "confirmed";
    const result = operation === "forget" ? await this.repository.forget(input.id, input.scope) : await this.repository.confirm({ ...input, ...normalized });
    return { proposed: true, confirmed: true, memory: result };
  }

  /** Return persistence-safe proposal state for restart recovery. */
  snapshot() { return this.proposals.map((proposal) => ({ ...proposal, content: proposal.status === "confirmed" ? "" : proposal.content })).slice(-50); }

  /** Restore proposal fingerprints so rejected requests remain suppressed. */
  restore(snapshot) { this.proposals = (Array.isArray(snapshot) ? snapshot : []).map((proposal) => ({ ...proposal })).slice(-50); }
}

function publicProposal(proposal) { const { content, ...metadata } = proposal; return { ...metadata, preview: String(content || "").slice(0, 1000) }; }
function digest(value) { return crypto.createHash("sha256").update(JSON.stringify(value)).digest("hex"); }

module.exports = { MemoryProposalSession };
