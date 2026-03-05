export function sanitizeStreamingMarkdown(text: string): string {
  // Close unclosed fenced code blocks
  const fences = (text.match(/```/g) || []).length;
  if (fences % 2 !== 0) return text + '\n```';

  // Close unclosed inline code
  const backticks = (text.match(/(?<!`)`(?!`)/g) || []).length;
  if (backticks % 2 !== 0) return text + '`';

  // Close unclosed bold
  const boldMarkers = (text.match(/\*\*/g) || []).length;
  if (boldMarkers % 2 !== 0) return text + '**';

  return text;
}
