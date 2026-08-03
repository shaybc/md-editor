/**
 * Tracks the remaining time for a provider-directed rate-limit wait.
 */
(function(root, factory) {
  const api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  if (root) root.createMarkdownViewerAiRateLimitWaitCountdown = api.createRateLimitWaitCountdown;
})(typeof globalThis !== "undefined" ? globalThis : this, function() {
  "use strict";

  /**
   * Create a single rate-limit countdown that replaces any countdown already running.
   *
   * @param {object} [options]
   * @param {() => number} [options.now]
   * @param {(callback: Function, delayMs: number) => *} [options.setInterval]
   * @param {(timer: *) => void} [options.clearInterval]
   * @returns {{start: (delayMs: number, callbacks?: object) => void, cancel: () => void}}
   */
  function createRateLimitWaitCountdown(options = {}) {
    const now = options.now || (() => Date.now());
    const schedule = options.setInterval || ((callback, delayMs) => setInterval(callback, delayMs));
    const clear = options.clearInterval || ((timer) => clearInterval(timer));
    let timer = null;
    let deadline = 0;

    function cancel() {
      if (timer !== null) clear(timer);
      timer = null;
      deadline = 0;
    }

    function start(delayMs, callbacks = {}) {
      cancel();
      const normalizedDelayMs = Math.max(0, Number(delayMs) || 0);
      deadline = now() + normalizedDelayMs;

      function update() {
        const remainingSeconds = Math.max(0, Math.ceil((deadline - now()) / 1000));
        callbacks.onTick?.(remainingSeconds);
        if (remainingSeconds > 0) return;
        cancel();
        callbacks.onComplete?.();
      }

      update();
      if (deadline > now()) timer = schedule(update, 250);
    }

    return { start, cancel };
  }

  return { createRateLimitWaitCountdown };
});
