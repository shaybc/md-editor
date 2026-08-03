(function(window) {
  "use strict";

  /**
   * Normalize raw model completions into ghost text suitable for CodeMirror.
   * @returns {{postprocessCompletion: function(object): string}} Completion cleanup helpers.
   */
  function createAiCompanionAutocompletePostprocessor() {
    const BLOCK_OPENERS = /[{(\[:]\s*$/;
    const MAX_MULTILINE_LINES = 20;
    // "block" scope completions are asked to write a whole function/method body, which is
    // routinely longer than the line-scope cap without being a runaway generation — but still
    // needs *some* ceiling so a confused/looping response can't paste an unbounded wall of text.
    const MAX_BLOCK_LINES = 60;
    // "comment" scope completions are prose, not code — a handful of lines covers "finish this
    // sentence" through "a short multi-line explanation" without letting the model wander into
    // an essay.
    const MAX_COMMENT_LINES = 8;

    function stripMarkdownFence(text) {
      const trimmed = text.trim();
      const match = trimmed.match(/^```[^\n]*\n([\s\S]*?)\n```$/);
      return match ? match[1] : text;
    }

    function removeDuplicatedLinePrefix(completion, prefix) {
      const currentLinePrefix = String(prefix || "").split(/\r?\n/).pop() || "";
      if (!currentLinePrefix) return completion;
      if (completion.startsWith(currentLinePrefix)) {
        return completion.slice(currentLinePrefix.length);
      }
      // The exact text before the cursor isn't literally repeated at the start of the
      // completion, but if the cursor sits on an editor-auto-indented blank line (pure
      // whitespace before the cursor) and the model's completion also opens with its own
      // leading whitespace, that's very likely the model re-deriving indentation the editor
      // already placed, not intentional extra indent — a mismatch here (different width, or
      // spaces vs. tabs) used to leave both stacked, landing the suggestion at the wrong
      // depth. Trust the editor's real indentation over the model's guess and drop the
      // model's leading whitespace instead.
      if (currentLinePrefix.trim() === "") {
        const leadingWhitespace = completion.match(/^[ \t]+/);
        if (leadingWhitespace) return completion.slice(leadingWhitespace[0].length);
      }
      return completion;
    }

    function applyStopSequences(completion, stopSequences) {
      if (!Array.isArray(stopSequences) || !stopSequences.length) return completion;
      let cutAt = completion.length;
      stopSequences.forEach((stopSequence) => {
        if (!stopSequence) return;
        const index = completion.indexOf(stopSequence);
        if (index !== -1 && index < cutAt) cutAt = index;
      });
      return completion.slice(0, cutAt);
    }

    function currentLineIsBlockOpener(prefix) {
      const lines = String(prefix || "").split(/\r?\n/);
      let index = lines.length - 1;
      // If the cursor's own line is blank (e.g. the user pressed Enter right after typing
      // the opener and is sitting on a fresh auto-indented line), the opener lives on the
      // nearest non-blank line above — walk back to it instead of only ever checking the
      // literal current line. Before this fix, multiline completions only worked when the
      // cursor sat immediately next to the opener on the same line; scope-classifier.js now
      // handles the general case via "block" scope, but this stays as a defensive fallback
      // for whatever still lands here as plain "line" scope.
      while (index >= 0 && lines[index].trim() === "") index -= 1;
      return index >= 0 ? BLOCK_OPENERS.test(lines[index]) : false;
    }

    function getIndentDepth(line) {
      const match = String(line || "").match(/^[ \t]*/);
      return match ? match[0].length : 0;
    }

    /**
     * Decide single-line vs multiline shape and stop generation once the completion
     * dedents back to (or below) its starting indentation, mirroring Continue's
     * early-stop-on-dedent behavior for multiline completions.
     *
     * Multiline is kept in two cases: the classic one (current line opens a block, e.g.
     * ends in `{`/`(`/`[`/`:`), and a second case added after seeing real completions get
     * mangled — the model's own output starts with a blank line. That blank first line is
     * the model saying "finish the current line as-is, then put my content on the next
     * line" (e.g. cursor sits inside a `//` comment and the model wants to close the
     * comment before adding code below it). Treating that case the same as a bare
     * same-line continuation was wrong: it either chopped a real multi-line completion
     * down to an empty first line (completion silently disappears — looked like "no
     * reaction"), or, when the model skipped the leading newline instead, let code get
     * appended directly onto the comment line. Recognizing the blank-first-line signal
     * lets that content survive intact instead of being discarded or misplaced.
     *
     * This is the "line" scope shape — kept exactly as before for backward compatibility.
     * "block" and "comment" scopes use their own shaping (see shapeBlockCompletion /
     * shapeCommentCompletion below), since a dedent-only heuristic is either too eager to
     * truncate (nested `if`/`for`/`try` bodies dedent partway through a real block) or
     * meaningless (prose has no indentation structure to dedent from).
     */
    function shapeCompletion(completion, context) {
      const lines = completion.split("\n");
      if (lines.length <= 1) return completion;

      const firstLineBlank = lines[0].trim() === "";
      const allowMultiline = currentLineIsBlockOpener(context?.prefix) || firstLineBlank;
      if (!allowMultiline) {
        return lines[0];
      }

      const anchorIndex = firstLineBlank ? 1 : 0;
      const anchorLine = lines[anchorIndex] || "";
      const startDepth = getIndentDepth(anchorLine);
      const shaped = lines.slice(0, anchorIndex + 1);
      for (let index = anchorIndex + 1; index < lines.length && shaped.length < MAX_MULTILINE_LINES; index += 1) {
        const line = lines[index];
        if (line.trim() !== "" && getIndentDepth(line) <= startDepth) break;
        shaped.push(line);
      }
      return shaped.join("\n").replace(/\n+$/, "");
    }

    /**
     * Truncate at the point where brace depth would go negative — i.e. a `}` that closes
     * something opened *before* the completion started. The cursor sits just inside a block
     * the user already opened, so that block's own closer typically already exists in the
     * suffix (that's what "block" scope classification means); if the model echoes it back
     * anyway, this cuts it (and anything after it) rather than duplicating it. Braces inside
     * quoted strings/template literals are ignored via a simple quote-tracking scan so a
     * `"}"` string literal or similar doesn't throw off the count.
     */
    function trimToBraceBalance(text) {
      let depth = 0;
      let quote = null;
      for (let index = 0; index < text.length; index += 1) {
        const char = text[index];
        if (quote) {
          if (char === "\\") { index += 1; continue; }
          if (char === quote) quote = null;
          continue;
        }
        if (char === "\"" || char === "'" || char === "`") { quote = char; continue; }
        if (char === "{") {
          depth += 1;
        } else if (char === "}") {
          depth -= 1;
          if (depth < 0) return text.slice(0, index);
        }
      }
      return text;
    }

    /**
     * Dedent-based cut, generalized from shapeCompletion for the block-scope case: the
     * completion's own first line establishes the body's indentation baseline (there's no
     * block-opener check here — block scope is already known from classification), and a
     * later line that dedents back to or below that baseline marks the end of the body.
     * This is what catches indentation-delimited blocks (Python, YAML, etc.) that
     * trimToBraceBalance can't see since they have no `{`/`}` to balance.
     */
    function trimToDedent(completion, maxLines) {
      const lines = completion.split("\n");
      if (lines.length <= 1) return completion;
      const startDepth = getIndentDepth(lines[0]);
      const shaped = [lines[0]];
      for (let index = 1; index < lines.length && shaped.length < maxLines; index += 1) {
        const line = lines[index];
        if (line.trim() !== "" && getIndentDepth(line) <= startDepth) break;
        shaped.push(line);
      }
      return shaped.join("\n");
    }

    /**
     * "block" scope shaping: the model was asked to write a complete function/method/block
     * body, so (unlike line scope) there's no single-vs-multiline gate — multiline is the
     * expected shape. Two independent boundary heuristics run over the (line-capped) text —
     * brace-balance for `{}`-delimited languages, dedent for indentation-delimited ones — and
     * whichever finds a boundary first (i.e. produces the shorter result) wins. Running both
     * and taking the shorter one is more conservative than trusting either alone: a stray
     * dedented comment inside a real block won't truncate it early (brace balance keeps
     * going), and a brace hiding inside a string won't run past the real end (dedent still
     * catches it in indentation-style code).
     */
    function shapeBlockCompletion(completion) {
      const capped = completion.split("\n").slice(0, MAX_BLOCK_LINES).join("\n");
      const braceTrimmed = trimToBraceBalance(capped);
      const dedentTrimmed = trimToDedent(capped, MAX_BLOCK_LINES);
      const shortest = braceTrimmed.length <= dedentTrimmed.length ? braceTrimmed : dedentTrimmed;
      return shortest.replace(/\n+$/, "");
    }

    /**
     * "comment" scope shaping: prose, not code, so neither brace-balance nor dedent boundary
     * detection applies. The model is already instructed to stop once its thought is
     * complete; this just caps the line count as a safety net against a runaway reply.
     */
    function shapeCommentCompletion(completion) {
      const lines = completion.split("\n").slice(0, MAX_COMMENT_LINES);
      return lines.join("\n").replace(/\n+$/, "");
    }

    function shapeCompletionForScope(completion, context) {
      const scope = context?.scope;
      if (scope === "block") return shapeBlockCompletion(completion);
      if (scope === "comment") return shapeCommentCompletion(completion);
      return shapeCompletion(completion, context);
    }

    function postprocessCompletion(context) {
      let completion = String(context?.completion || "").replace(/\r\n/g, "\n");
      completion = stripMarkdownFence(completion);
      // A single leading newline is a real signal, not noise: it means the model chose to
      // finish the current line as-is (e.g. a `//` comment) and place its content starting
      // on the next line. Blindly stripping every leading newline (the old behavior) erased
      // that signal and made the model's completion get glued onto the current line instead
      // — that's what produced code appended straight onto a comment line. Collapse a run of
      // several leading blank lines down to just one (models sometimes emit a few out of
      // habit) but keep a single leading newline intact for the shaping step to act on.
      completion = completion.replace(/^\n+/, (match) => (match.length > 0 ? "\n" : ""));
      completion = removeDuplicatedLinePrefix(completion, context?.prefix || "");
      completion = applyStopSequences(completion, context?.languageProfile?.stopSequences);
      completion = shapeCompletionForScope(completion, context);
      if (!completion.trim()) return "";

      const suffixLine = String(context?.suffix || "").split(/\r?\n/)[0] || "";
      if (suffixLine && suffixLine.startsWith(completion)) return "";
      return completion;
    }

    return { postprocessCompletion };
  }

  window.createAiCompanionAutocompletePostprocessor = createAiCompanionAutocompletePostprocessor;
})(window);
