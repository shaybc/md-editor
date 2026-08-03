(function(window) {
  "use strict";

  /**
   * Classify the cursor's autocomplete context into one of three request scopes, each of
   * which gets its own prompt, token budget, reasoning effort, and trigger timing further
   * down the pipeline (see request-policy.js and the server-side autocomplete mode):
   *
   *   - "comment": the cursor sits inside an unfinished comment (line or block). The user
   *     is writing prose and wants that sentence/paragraph continued, not code.
   *   - "block": the cursor sits at the start of a function/method/block body that's
   *     currently empty, or on a fresh blank line right after a comment that describes
   *     intent but hasn't been implemented yet. This is the "write the whole thing" case.
   *   - "line": everything else — the default, cheap, small-span completion.
   *
   * This is deliberately shallow, regex-based detection, consistent with the rest of the
   * autocomplete pipeline ("shallow metadata only, no AST/grammar parsing" per
   * language-profiles.js). It will be wrong at the margins (e.g. a comment marker that
   * happens to appear inside an unusual string literal), but it only has to be right often
   * enough to pick a better request shape than treating every keystroke identically.
   * @returns {{classifyScope: function(object): string}} Scope classification helper.
   */
  function createAiCompanionAutocompleteScopeClassifier() {
    // Only "{" is treated as a block-scope opener, not the full [{(\[:] set postprocess.js
    // uses for its (much more permissive) "is any multiline continuation allowed" question.
    // "(" and "[" usually open argument lists or array literals, not function/method bodies
    // — treating those as "please write a full implementation" would fire the expensive
    // block-scope path on ordinary short expressions far too often.
    const BLOCK_OPENER = /[{:]\s*$/;
    const CLOSER_FOR_OPENER = { "{": "}" };

    function getCurrentLine(prefix) {
      return String(prefix || "").split(/\r?\n/).pop() || "";
    }

    function getIndentDepth(line) {
      const match = String(line || "").match(/^[ \t]*/);
      return match ? match[0].length : 0;
    }

    /**
     * Single-pass scan for an unmatched block-comment opener in `text`. Not a real
     * tokenizer — doesn't know about string literals — but block-comment tokens rarely
     * appear literally inside string content, so this is a reasonable approximation.
     */
    function isInsideUnclosedBlockComment(text, blockComment) {
      if (!Array.isArray(blockComment) || blockComment.length !== 2) return false;
      const [open, close] = blockComment;
      if (!open || !close) return false;
      let index = 0;
      let insideComment = false;
      while (index < text.length) {
        if (!insideComment && text.startsWith(open, index)) {
          insideComment = true;
          index += open.length;
          continue;
        }
        if (insideComment && text.startsWith(close, index)) {
          insideComment = false;
          index += close.length;
          continue;
        }
        index += 1;
      }
      return insideComment;
    }

    /**
     * Is the cursor past an (unquoted) line-comment marker on the current line? Tracks
     * quote state with backslash-escape awareness so `"a // not a comment"` doesn't false-
     * positive.
     */
    function isPastLineCommentMarker(currentLine, lineComment) {
      if (!lineComment) return false;
      let quote = null;
      for (let index = 0; index < currentLine.length; index += 1) {
        const char = currentLine[index];
        if (quote) {
          if (char === "\\") { index += 1; continue; }
          if (char === quote) quote = null;
          continue;
        }
        if (char === '"' || char === "'" || char === "`") { quote = char; continue; }
        if (currentLine.startsWith(lineComment, index)) return true;
      }
      return false;
    }

    function isInsideComment(prefix, languageProfile) {
      if (isInsideUnclosedBlockComment(prefix, languageProfile?.blockComment)) return true;
      return isPastLineCommentMarker(getCurrentLine(prefix), languageProfile?.lineComment);
    }

    /**
     * True when the block opened at the end of `currentLine` has nothing in it yet — the
     * suffix's next non-blank content is that block's own closer (brace languages), or, for
     * indentation-style blocks (e.g. Python's trailing ":"), the next real line doesn't
     * indent deeper than the line that opened the block.
     */
    function isEmptyBlockAhead(currentLine, suffix) {
      const opener = (currentLine.match(BLOCK_OPENER) || [])[0]?.trim();
      if (!opener) return false;
      const suffixLines = String(suffix || "").split(/\r?\n/);
      const nextNonBlank = suffixLines.find((line) => line.trim() !== "");
      if (nextNonBlank === undefined) return true;
      const closer = CLOSER_FOR_OPENER[opener];
      if (closer) return nextNonBlank.trim().startsWith(closer);
      return getIndentDepth(nextNonBlank) <= getIndentDepth(currentLine);
    }

    /**
     * True when the cursor is on a fresh blank line whose immediately preceding content is
     * a finished comment line, and the enclosing block is still empty — "// implement X"
     * followed by nothing, or a doc-comment closer followed by nothing.
     */
    function isBlankAfterIntentComment(prefix, suffix, languageProfile) {
      const lines = String(prefix || "").split(/\r?\n/);
      const currentLine = lines[lines.length - 1] || "";
      if (currentLine.trim() !== "") return false;
      const previousLine = (lines[lines.length - 2] || "").trim();
      if (!previousLine) return false;
      const { lineComment, blockComment } = languageProfile || {};
      const looksLikeComment =
        (lineComment && previousLine.startsWith(lineComment)) ||
        (Array.isArray(blockComment) && (previousLine.startsWith(blockComment[0]) || previousLine.endsWith(blockComment[1]) || previousLine.startsWith("*")));
      if (!looksLikeComment) return false;
      const suffixLines = String(suffix || "").split(/\r?\n/);
      const nextNonBlank = suffixLines.find((line) => line.trim() !== "");
      if (nextNonBlank === undefined) return true;
      return getIndentDepth(nextNonBlank) <= getIndentDepth(currentLine);
    }

    /**
     * True when the cursor is on a fresh blank line and the nearest preceding non-blank line
     * opened a block (ends in `{`/`:`) that's still empty. Broader than
     * isBlankAfterIntentComment above — this doesn't require a comment on that previous
     * line, just a bare opener. The common "type `{`, press Enter, land on an auto-indented
     * blank line" case has no comment at all; without this it fell through to "line" scope,
     * whose shaping only allows multiline when the cursor sits immediately next to the
     * opener on the same line — i.e. no automatic multiline suggestion once the user had
     * already pressed Enter, even though that's the normal way to start writing a body.
     */
    function isBlankInsideOpenBlock(prefix, suffix) {
      const lines = String(prefix || "").split(/\r?\n/);
      const currentLine = lines[lines.length - 1] || "";
      if (currentLine.trim() !== "") return false;
      let index = lines.length - 2;
      while (index >= 0 && lines[index].trim() === "") index -= 1;
      const previousLine = index >= 0 ? lines[index] : "";
      if (!BLOCK_OPENER.test(previousLine)) return false;
      return isEmptyBlockAhead(previousLine, suffix);
    }

    /**
     * Classify the autocomplete request scope for a built context.
     * @param {{prefix: string, suffix: string, languageProfile?: object}} context
     * @returns {"comment"|"block"|"line"} The detected scope.
     */
    function classifyScope(context) {
      const prefix = String(context?.prefix || "");
      const suffix = String(context?.suffix || "");
      const languageProfile = context?.languageProfile || {};

      if (isInsideComment(prefix, languageProfile)) return "comment";

      const currentLine = getCurrentLine(prefix);
      if (currentLine.trim() !== "" && isEmptyBlockAhead(currentLine, suffix)) return "block";
      if (isBlankAfterIntentComment(prefix, suffix, languageProfile)) return "block";
      if (isBlankInsideOpenBlock(prefix, suffix)) return "block";

      return "line";
    }

    return { classifyScope };
  }

  window.createAiCompanionAutocompleteScopeClassifier = createAiCompanionAutocompleteScopeClassifier;
})(window);
