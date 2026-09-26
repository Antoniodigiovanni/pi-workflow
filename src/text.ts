export function chunkText(text: string, offset = 0, limit = 8000) {
  if (!Number.isInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 20000) throw new Error('Use a nonnegative offset and a limit from 1 to 20000');
  const end = Math.min(offset + limit, text.length);
  return { text: text.slice(offset, end), offset, nextOffset: end < text.length ? end : null, totalCharacters: text.length };
}
export function toolResult(value: unknown) {
  const text = JSON.stringify(value, null, 2);
  if (text.length > 60000) throw new Error('Result too large; request a smaller page or text chunk');
  return { content: [{ type: 'text' as const, text }], details: {} };
}
