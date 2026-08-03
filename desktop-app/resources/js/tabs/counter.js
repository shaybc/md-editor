(function(window) {
  window.registerMarkdownViewerTabCounter = function registerMarkdownViewerTabCounter(app, deps) {
    with (deps) {
  function loadUntitledCounter() {
    return parseInt(localStorage.getItem(UNTITLED_COUNTER_KEY) || '0', 10);
  }

  function saveUntitledCounter(val) {
    localStorage.setItem(UNTITLED_COUNTER_KEY, String(val));
  }

  return {
    loadUntitledCounter,
    saveUntitledCounter
  };
    }
  };
})(window);
