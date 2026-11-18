export type ChatProtocol = 'chat' | 'responses' | 'messages';

export function chatProtocol(preference: ChatProtocol | 'auto' | undefined, endpoints?: string[]): ChatProtocol {
  if (preference && preference !== 'auto') return preference;
  if (endpoints?.includes('openai-response')) return 'responses';
  if (endpoints?.includes('anthropic')) return 'messages';
  return 'chat';
}

/** Claude 4.6 and newer use adaptive thinking rather than a fixed token budget. */
export function claudeAdaptive(model: string): boolean {
  const id = model.split('/').at(-1) ?? '';
  if (/^claude-(?:fable|mythos)(?:-|$)/i.test(id)) return true;
  const match = /^claude-(?:opus|sonnet|haiku)-(\d+)(?:[-.](\d{1,2})(?!\d))?/i.exec(id);
  return !!match && (Number(match[1]) > 4 || (Number(match[1]) === 4 && Number(match[2]) >= 6));
}

/** Managed catalogs may only provide IDs. Infer support for known, protocol-compatible families. */
export function supportsChatEffort(protocol: ChatProtocol, model: string, declared?: boolean): boolean | undefined {
  if (declared === false) return false;
  if (protocol === 'messages') return claudeAdaptive(model) ? true : undefined;
  if (declared === true) return true;
  const id = model.split('/').at(-1) ?? '';
  if (/^gpt-[5-9](?:[-.]|$)|^o[134](?:-|$)/i.test(id) && !/-(?:audio|realtime|transcribe|tts|image|pro)(?:-|$)/i.test(id)) return true;
  if (/^gpt-(?:4|3)(?:[.o-]|$)/i.test(id)) return false;
  return undefined;
}
