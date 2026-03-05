/**
 * sanitizeStreamingMarkdown — fix incomplete markdown syntax during streaming.
 *
 * When an LLM streams tokens, the partially-received content may contain
 * unclosed syntax that confuses react-markdown (e.g. an unclosed code fence
 * turns all subsequent text into a code block). This function closes any
 * dangling structures so the renderer always sees syntactically valid input.
 *
 * Only called on the active streaming tail — settled segments are left untouched.
 */
export function sanitizeStreamingMarkdown(content: string): string {
  let result = content;

  // Close unclosed fenced code blocks (``` or ~~~)
  const backtickFences = (result.match(/^```/gm) ?? []).length;
  const tildeFences = (result.match(/^~~~/gm) ?? []).length;

  if (backtickFences % 2 !== 0) {
    result += '\n```';
  }
  if (tildeFences % 2 !== 0) {
    result += '\n~~~';
  }

  return result;
}
