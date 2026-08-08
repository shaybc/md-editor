/** Bounded reminder state for optional model-directed observation release. */

"use strict";

const MIN_OBSERVATIONS = 6;
const MIN_TOKENS = 8000;
const ROUND_COOLDOWN = 4;

class ContextReleaseReminder {
  constructor(emit = () => {}) {
    this.emit = emit;
    this.lastRound = 0;
    this.lastCount = 0;
    this.lastTokens = 0;
  }

  /** Return one short reminder only after material releasable-context growth. */
  consider(summary, options = {}) {
    const round = Math.max(0, Number(options.round) || 0);
    if (options.renewed || options.compacting) return "";
    if (summary.releasable < MIN_OBSERVATIONS && summary.releasableTokens < MIN_TOKENS) return "";
    if (this.lastRound && round - this.lastRound < ROUND_COOLDOWN) return "";
    if (this.lastRound && summary.releasable < this.lastCount + 2 && summary.releasableTokens < this.lastTokens + 2000) return "";
    this.lastRound = round;
    this.lastCount = summary.releasable;
    this.lastTokens = summary.releasableTokens;
    this.emit({ type: "observation-release-reminder", round, count: summary.releasable, estimatedTokens: summary.releasableTokens, summary: `${summary.releasable} older tool observations are eligible for optional release.` });
    return `Context note: ${summary.releasable} older tool observations (about ${summary.releasableTokens} tokens) can be released if they are no longer useful. If needed, activate context_observation_list and context_release with capability_search, then inspect candidates and release only observations you choose to discard.`;
  }

  snapshot() { return { lastRound: this.lastRound, lastCount: this.lastCount, lastTokens: this.lastTokens }; }
  restore(snapshot = {}) {
    this.lastRound = Math.max(0, Number(snapshot.lastRound) || 0);
    this.lastCount = Math.max(0, Number(snapshot.lastCount) || 0);
    this.lastTokens = Math.max(0, Number(snapshot.lastTokens) || 0);
  }
}

module.exports = { ContextReleaseReminder, MIN_OBSERVATIONS, MIN_TOKENS, ROUND_COOLDOWN };
