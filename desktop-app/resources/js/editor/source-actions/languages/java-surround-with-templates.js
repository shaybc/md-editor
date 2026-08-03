// Pure Java statement wrappers for the editor Surround With submenu.
(function(window) {
  'use strict';

  const PLACEHOLDER_MARKER = '__JAVA_SURROUND_PLACEHOLDER__';
  const BODY_MARKER = '__JAVA_SURROUND_BODY__';
  const INDENT = '    ';

  const TEMPLATES = Object.freeze([
    Object.freeze({ id: 'do', label: '1 do (do while statement)', icon: 'bi-arrow-repeat', placeholder: 'condition', bodyIndent: 1,
      pattern: `do {\n${BODY_MARKER}\n} while (${PLACEHOLDER_MARKER});` }),
    Object.freeze({ id: 'for-array', label: '2 for (use index on array)', icon: 'bi-arrow-repeat', placeholder: 'array', bodyIndent: 1,
      pattern: `for (int i = 0; i < ${PLACEHOLDER_MARKER}.length; i++) {\n${BODY_MARKER}\n}` }),
    Object.freeze({ id: 'if', label: '3 if (if statement)', icon: 'bi-signpost-split', placeholder: 'condition', bodyIndent: 1,
      pattern: `if (${PLACEHOLDER_MARKER}) {\n${BODY_MARKER}\n}` }),
    Object.freeze({ id: 'lock', label: '4 lock (explicit lock acquisition)', icon: 'bi-lock', placeholder: 'lock', bodyIndent: 1,
      pattern: `${PLACEHOLDER_MARKER}.lock();\ntry {\n${BODY_MARKER}\n} finally {\n    lock.unlock();\n}` }),
    Object.freeze({ id: 'runnable', label: '5 runnable (runnable)', icon: 'bi-play-circle', placeholder: 'runnable', bodyIndent: 2,
      pattern: `Runnable ${PLACEHOLDER_MARKER} = new Runnable() {\n    @Override\n    public void run() {\n${BODY_MARKER}\n    }\n};` }),
    Object.freeze({ id: 'synchronized', label: '6 synchronized (synchronized block)', icon: 'bi-lock-fill', placeholder: 'mutex', bodyIndent: 1,
      pattern: `synchronized (${PLACEHOLDER_MARKER}) {\n${BODY_MARKER}\n}` }),
    Object.freeze({ id: 'try-catch', label: '7 try_catch (try catch block)', icon: 'bi-shield-exclamation', placeholder: 'Exception', bodyIndent: 1,
      pattern: `try {\n${BODY_MARKER}\n} catch (${PLACEHOLDER_MARKER} e) {\n    // TODO: handle exception\n}` }),
    Object.freeze({ id: 'try-finally', label: '8 try_finally (try finally block)', icon: 'bi-shield-check', placeholder: 'TODO', bodyIndent: 1,
      pattern: `try {\n${BODY_MARKER}\n} finally {\n    // ${PLACEHOLDER_MARKER}\n}` }),
    Object.freeze({ id: 'while', label: '9 while (while loop with condition)', icon: 'bi-arrow-repeat', placeholder: 'condition', bodyIndent: 1,
      pattern: `while (${PLACEHOLDER_MARKER}) {\n${BODY_MARKER}\n}` })
  ]);

  function getLineBreak(source) {
    return String(source || '').includes('\r\n') ? '\r\n' : '\n';
  }

  function getLeadingWhitespace(value) {
    return /^\s*/.exec(value || '')?.[0] || '';
  }

  function getCommonIndent(lines) {
    const indents = lines
      .filter(function(line) { return line.trim(); })
      .map(getLeadingWhitespace);
    if (!indents.length) return '';
    return indents.reduce(function(common, indent) {
      let length = 0;
      while (length < common.length && length < indent.length && common[length] === indent[length]) length += 1;
      return common.slice(0, length);
    });
  }

  function stripIndent(line, indent) {
    return indent && line.startsWith(indent) ? line.slice(indent.length) : line;
  }

  function indentSelectedStatements(selectedText, selectionIndent, bodyIndent, lineBreak) {
    return selectedText
      .split(/\r\n?|\n/)
      .map(function(line) { return bodyIndent + stripIndent(line, selectionIndent); })
      .join(lineBreak);
  }

  function applyOuterIndent(pattern, outerIndent, firstLineIndent, lineBreak) {
    return pattern
      .split('\n')
      .map(function(line, index) {
        if (line === BODY_MARKER) return line;
        return (index === 0 ? firstLineIndent : outerIndent) + line;
      })
      .join(lineBreak);
  }

  /**
   * Return the immutable structural templates shown in the Java Surround With submenu.
   * @returns {object[]} Template metadata. This function has no side effects.
   */
  function getTemplates() {
    return TEMPLATES.slice();
  }

  /**
   * Build one indentation-preserving replacement for selected Java statements.
   * @param {string} templateId Stable template identifier.
   * @param {string} source Complete Java document text.
   * @param {{start:number,end:number}} selection Selected statement offsets.
   * @returns {{start:number,end:number,replacement:string,placeholderStart:number,placeholderEnd:number}|null} Replacement and first editable placeholder.
   */
  function buildSurroundEdit(templateId, source, selection) {
    const template = TEMPLATES.find(function(candidate) { return candidate.id === templateId; });
    const value = String(source || '');
    const start = Math.max(0, Math.min(value.length, Number(selection?.start) || 0));
    const end = Math.max(start, Math.min(value.length, Number(selection?.end) || start));
    if (!template || start === end || !value.slice(start, end).trim()) return null;

    const lineBreak = getLineBreak(value);
    const rawSelection = value.slice(start, end);
    const trailingLineBreak = rawSelection.endsWith(lineBreak) ? lineBreak : '';
    const selectedText = trailingLineBreak ? rawSelection.slice(0, -trailingLineBreak.length) : rawSelection;
    const lineStart = value.lastIndexOf('\n', Math.max(0, start - 1)) + 1;
    const prefix = value.slice(lineStart, start);
    const retainedOuterIndent = /^\s*$/.test(prefix) ? prefix : '';
    const selectedLines = selectedText.split(/\r\n?|\n/);
    const selectionIndent = retainedOuterIndent || getCommonIndent(selectedLines);
    const outerIndent = retainedOuterIndent || selectionIndent;
    const firstLineIndent = retainedOuterIndent ? '' : outerIndent;
    const bodyIndent = outerIndent + INDENT.repeat(template.bodyIndent);
    const body = indentSelectedStatements(selectedText, selectionIndent, bodyIndent, lineBreak);
    let replacement = applyOuterIndent(template.pattern, outerIndent, firstLineIndent, lineBreak)
      .replace(BODY_MARKER, body);
    const markerIndex = replacement.indexOf(PLACEHOLDER_MARKER);
    replacement = replacement.replace(PLACEHOLDER_MARKER, template.placeholder) + trailingLineBreak;
    const placeholderStart = start + Math.max(0, markerIndex);
    return {
      start,
      end,
      replacement,
      placeholderStart,
      placeholderEnd: placeholderStart + template.placeholder.length
    };
  }

  const api = { getTemplates, buildSurroundEdit };
  window.markdownViewerJavaSurroundWithTemplates = api;
})(window);
