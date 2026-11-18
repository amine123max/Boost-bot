import { EventEmitter } from 'node:events';
import type { ChatMessage } from '../llm/client.js';
import type { Store } from '../store/db.js';
import type { TurnImage } from '../agent/host.js';
import { takeTaskNotes } from '../tasks/service.js';
import { directChatPrompt } from './conversation-policy.js';
import { placeLine, type ChatPlace } from '../agent/prompts/segment.js';

/** Bot-owned conversation state: only the tool turn goes to the isolated agent host. */
export class ConversationHarness {
  private readonly updates = new EventEmitter();
  constructor(private readonly store: Store) { this.updates.setMaxListeners(0); }

  directInput(o: { conversationId: string; userMessageId?: number; name: string; persona: string;
    place: ChatPlace; contextMessages: number; contextChars: number; images: TurnImage[] }): ChatMessage[] {
    const messages: ChatMessage[] = [{ role: 'system', content: directChatPrompt(o.name, o.persona, placeLine(o.place)) }];
    const history = this.store.contextWindow(o.conversationId, o.contextMessages, o.contextChars, o.userMessageId);
    for (const row of history) if (row.role !== 'system') messages.push({ role: row.role, content: row.content });
    const last = messages.at(-1);
    if (o.images.length && last?.role === 'user' && typeof last.content === 'string') {
      last.content = [{ type: 'text', text: last.content }, ...o.images.map(image => ({
        type: 'image_url' as const, image_url: { url: `data:${image.mimeType};base64,${image.data}` },
      }))];
    }
    return messages;
  }

  private key(id: string) { return `direct-context:${id}`; }
  noteDirectReply(id: string, userMessageId?: number) {
    if (userMessageId && !this.store.getKV(this.key(id))) this.store.setKV(this.key(id), String(userMessageId));
  }
  clearDirectContext(id: string) { this.store.deleteKV(this.key(id)); }
  resetContext(id: string) {
    this.clearDirectContext(id);
    takeTaskNotes(this.store, id);
  }

  agentContext(id: string, userMessageId?: number) {
    const existing = !!this.store.getAgentSession(id);
    const fromDirect = Number(this.store.getKV(this.key(id))) || undefined;
    const before = userMessageId === undefined ? undefined : userMessageId - 1;
    let budget = 16_000;
    const recent = (!existing || fromDirect) ? this.store.listMessages(id, 16, before).reverse()
      .filter(row => row.role !== 'system' && (!fromDirect || row.id >= fromDirect))
      .flatMap(row => {
        if (budget <= 0) return [];
        const content = row.content.slice(0, budget).replace(/[\uD800-\uDBFF]$/, '');
        budget -= content.length;
        return [{ role: row.role, content }];
      }).reverse() : undefined;
    return { existing, fromDirect, recent, notes: takeTaskNotes(this.store, id) };
  }

  /** Task reports and reminders are already durable; SSE only tells this chat to refresh. */
  announce(id: string) { this.updates.emit(id); }
  subscribe(id: string, changed: () => void) {
    this.updates.on(id, changed);
    return () => this.updates.off(id, changed);
  }
}
