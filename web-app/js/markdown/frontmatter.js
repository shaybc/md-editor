(function(global) {
  global.registerMarkdownViewerFrontmatter = function registerMarkdownViewerFrontmatter(app, deps) {
    const api = {};

    with (deps) {
  function parseFrontmatter(markdown) {
    const source = String(markdown || "");
    const match = source.match(/^---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
    if (match) {
      if (!jsyaml?.load) return { frontmatter: null, frontmatterPrefix: "", body: source };
      try {
        const data = jsyaml.load(match[1]) || {};
        return { frontmatter: data, frontmatterPrefix: "", body: source.slice(match[0].length) };
      } catch (e) {
        console.warn('Frontmatter YAML parse error:', e);
        return { frontmatter: null, frontmatterPrefix: "", body: source };
      }
    }

    const afterTitleMatch = source.match(/^(#{1,6}\s+[^\r\n]+(?:\r?\n[ \t]*)?\r?\n)---\r?\n([\s\S]*?)\r?\n---(\r?\n|$)/);
    if (!afterTitleMatch) return { frontmatter: null, frontmatterPrefix: "", body: source };
    if (!jsyaml?.load) return { frontmatter: null, frontmatterPrefix: "", body: source };
    try {
      const data = jsyaml.load(afterTitleMatch[2]) || {};
      return {
        frontmatter: data,
        frontmatterPrefix: afterTitleMatch[1],
        body: source.slice(afterTitleMatch[0].length)
      };
    } catch (e) {
      console.warn('Frontmatter YAML parse error:', e);
      return { frontmatter: null, frontmatterPrefix: "", body: source };
    }
  }

  function renderFrontmatterValue(value) {
    if (value === null || value === undefined) return '';
    if (value instanceof Date) {
      const y = value.getUTCFullYear();
      const m = String(value.getUTCMonth() + 1).padStart(2, '0');
      const d = String(value.getUTCDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
    if (Array.isArray(value)) {
      const allPrimitive = value.every(v => v === null || typeof v !== 'object');
      if (allPrimitive) {
        return value
          .map(v => `<span class="fm-tag">${escapeHtml(String(v ?? ''))}</span>`)
          .join('');
      }
      const dumped = jsyaml?.dump ? jsyaml.dump(value).trimEnd() : JSON.stringify(value, null, 2);
      return `<pre class="fm-complex">${escapeHtml(dumped)}</pre>`;
    }
    if (typeof value === 'object') {
      const dumped = jsyaml?.dump ? jsyaml.dump(value).trimEnd() : JSON.stringify(value, null, 2);
      return `<pre class="fm-complex">${escapeHtml(dumped)}</pre>`;
    }
    return escapeHtml(String(value));
  }

  function renderFrontmatterTable(data) {
    const rows = Object.entries(data).map(([key, value]) =>
      `<tr><th>${escapeHtml(key)}</th><td>${renderFrontmatterValue(value)}</td></tr>`
    );
    return `<table class="frontmatter-table"><tbody>${rows.join('')}</tbody></table>`;
  }

  function escapeHtml(str) {
    return str
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;');
  }




      Object.assign(api, {
        parseFrontmatter,
        renderFrontmatterValue,
        renderFrontmatterTable,
        escapeHtml
      });
    }

    return api;
  };
})(window);
