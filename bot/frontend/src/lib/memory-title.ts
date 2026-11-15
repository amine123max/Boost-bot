/** Readable fallback while an AI title is pending or unavailable; saved text is unchanged. */
export function memoryTitle(text: string): string {
  const clean = text.replace(/[`*_#]/g, '').replace(/\s+/g, ' ').trim();
  const sentence = clean.split(/[。！？\n]/u)[0] || clean;
  const points = Array.from(sentence);
  return points.length > 20 ? points.slice(0, 19).join('') + '…' : sentence || '未命名记忆';
}
