import { createHash } from 'node:crypto';
import type { App } from '../app.js';
import type { LiveTurn, LiveTurns } from './live.js';

export class ConsoleMessageError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
interface Receipt { conversationId: string; turnId?: string; messageId?: number; reply?: string }
interface Input { text?: unknown; requestId?: unknown; editMessageId?: unknown; expectedContent?: unknown }
interface Options {
  app: App;
  live: LiveTurns;
  editing: Set<string>;
  start: (botId: string, text: string) => LiveTurn;
  run: (turn: LiveTurn, messageId?: number) => Promise<void>;
  intercept: (botId: string, text: string) => { handled: boolean; ack?: string };
}

/** Submission is acknowledged independently of the long-running reply subscription. */
export class ConsoleMessages {
  private receipts = new Map<string, { hash: string; at: number; result: Promise<Receipt> }>();
  constructor(private options: Options) {}

  submit(botId: string, input: Input): Promise<Receipt> {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text) throw new ConsoleMessageError(400, '消息不能为空');
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId)) throw new ConsoleMessageError(400, '请求编号无效');
    const edit = input.editMessageId;
    if (edit !== undefined && (!Number.isSafeInteger(edit) || Number(edit) < 1 || typeof input.expectedContent !== 'string')) throw new ConsoleMessageError(400, '待修改的消息无效');
    const key = `${botId}:${input.requestId}`;
    const hash = createHash('sha256').update(JSON.stringify([text, edit, input.expectedContent])).digest('hex');
    const prior = this.receipts.get(key);
    if (prior) {
      if (prior.hash !== hash) throw new ConsoleMessageError(409, '同一请求编号不能提交不同内容');
      return prior.result;
    }
    const now = Date.now();
    for (const [id, receipt] of this.receipts) if (now - receipt.at > 10 * 60_000) this.receipts.delete(id);
    if (this.receipts.size >= 512) throw new ConsoleMessageError(429, '消息提交较多，请稍后重试');
    const result = this.accept(botId, text, edit as number | undefined, input.expectedContent as string).catch(error => { this.receipts.delete(key); throw error; });
    this.receipts.set(key, { hash, at: now, result });
    return result;
  }

  private async accept(botId: string, text: string, edit?: number, expected?: string): Promise<Receipt> {
    const { app, live, editing } = this.options;
    const conversationId = `${botId}:web:console`;
    if (editing.has(conversationId)) throw new ConsoleMessageError(409, '会话正在更新，请稍后重试');
    if (edit !== undefined) {
      const original = app.store.getMessage(edit);
      if (!original || original.conversationId !== conversationId || original.role !== 'user') throw new ConsoleMessageError(404, '原消息不存在或不属于当前会话');
      if (original.content !== expected) throw new ConsoleMessageError(409, '原消息已被修改，请刷新后重试');
      editing.add(conversationId);
      try {
        const pending = [...live.list(conversationId)];
        live.stop(conversationId);
        await app.runtime.editMessage(conversationId, edit, text, expected!, Promise.all(pending.map(turn => turn.settled)));
      } catch (error) {
        throw new ConsoleMessageError(409, (error as Error).message);
      } finally { editing.delete(conversationId); }
    } else {
      if (live.list(conversationId).length >= 32) throw new ConsoleMessageError(429, '当前会话等待中的消息较多，请稍后重试');
      const intercepted = this.options.intercept(botId, text);
      if (intercepted.handled) return { conversationId, reply: intercepted.ack ?? '' };
    }
    const turn = this.options.start(botId, text);
    turn.userMessageId = edit;
    void this.options.run(turn, edit);
    return { conversationId, turnId: turn.id, messageId: edit };
  }
}
