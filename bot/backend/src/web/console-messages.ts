import { createHash } from 'node:crypto';
import type { App } from '../app.js';
import type { LiveTurn, LiveTurns } from './live.js';
import { logger } from '../log.js';
const log = logger('web.message-queue');

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
  run: (turn: LiveTurn, messageId?: number) => Promise<boolean>;
  intercept: (botId: string, text: string) => { handled: boolean; ack?: string };
}
export interface GroupQueueOptions {
  exists: (id: string) => boolean;
  changed: (id: string) => void;
  idle: (id: string) => Promise<void>;
  run: (id: string, text: string) => Promise<boolean>;
  guide: (id: string, text: string) => Promise<boolean>;
}
type State = 'queued' | 'running' | 'guiding' | 'failed' | 'done' | 'cancelled';
interface QueuedMessage {
  id: string;
  text: string;
  hash: string;
  at: number;
  state: State;
  error?: string;
}
const PREFIX = 'web-message-queue:';

/** Submission is acknowledged independently of the long-running reply subscription. */
export class ConsoleMessages {
  private receipts = new Map<string, { hash: string; at: number; result: Promise<Receipt> }>();
  private draining = new Set<string>();
  private followup = new Set<string>();
  private closed = false;
  constructor(private options: Options, private groups?: GroupQueueOptions) {}

  private get prefix() { return this.groups ? PREFIX + 'group:' : PREFIX + 'bot:'; }
  private exists(id: string) { return this.groups ? this.groups.exists(id) : !!this.options.app.store.getBot(id); }

  private entries(botId: string): QueuedMessage[] {
    const raw = this.options.app.store.getKV(this.prefix + botId);
    return raw ? JSON.parse(raw) as QueuedMessage[] : [];
  }
  private save(botId: string, entries: QueuedMessage[]) {
    this.options.app.store.setKV(this.prefix + botId, JSON.stringify(entries));
    if (this.groups) this.groups.changed(botId);
    else this.options.live.get(`${botId}:web:console`)?.emit('queue', {});
  }
  list(botId: string) {
    return this.entries(botId).filter(row => ['queued', 'guiding', 'failed'].includes(row.state))
      .map(({ id, text, state, error }) => ({ id, text, state, error }));
  }
  resume() {
    for (const [key] of this.options.app.store.listKV(this.prefix)) {
      const botId = key.slice(this.prefix.length);
      if (!this.exists(botId)) { this.options.app.store.deleteKV(key); continue; }
      const entries = this.entries(botId);
      for (const row of entries) {
        if (row.state === 'running' || row.state === 'guiding') {
          row.state = 'failed';
          row.error = '上次处理被中断。请先检查对话记录，再决定是否重发。';
        }
      }
      this.save(botId, entries);
      this.kick(botId);
    }
  }
  close() { this.closed = true; }
  clear(id: string) { this.options.app.store.deleteKV(this.prefix + id); }
  private kick(botId: string) {
    if (this.closed) return;
    if (this.draining.has(botId)) { this.followup.add(botId); return; }
    this.draining.add(botId);
    void this.drain(botId).catch(error => {
      log.warn('message queue could not advance', { message: (error as Error).message });
    }).finally(() => {
      this.draining.delete(botId);
      if (this.followup.delete(botId)) this.kick(botId);
    });
  }
  private async drain(botId: string) {
    const { app, live, editing } = this.options;
    const conv = `${botId}:web:console`;
    while (!this.closed && this.exists(botId) && (this.groups || !editing.has(conv))) {
      if (this.groups) await this.groups.idle(botId);
      if (this.closed || !this.exists(botId)) return;
      const rows = this.entries(botId);
      // Guiding is an explicit user action; don't concurrently take its row.
      const next = rows.find(row => row.state === 'queued' || row.state === 'guiding');
      if (!next || next.state === 'guiding') return;
      const current = live.get(conv);
      if (current) { await current.settled; continue; }
      next.state = 'running';
      this.save(botId, rows);
      let error = '';
      try {
        if (this.groups) {
          if (!(await this.groups.run(botId, next.text))) error = '本轮协作未完成，请检查对话后重试。';
        } else {
          const intercepted = this.options.intercept(botId, next.text);
          if (intercepted.handled) {
            if (intercepted.ack) {
              app.store.ensureConversation(botId, 'web', 'console', '控制台');
              app.store.addMessage(conv, 'user', next.text);
              app.store.addMessage(conv, 'assistant', intercepted.ack);
            }
          } else if (!(await this.options.run(this.options.start(botId, next.text)))) {
            error = '当前消息处理失败，请检查对话后重试。';
          }
        }
      } catch (e) { error = (e as Error).message; }
      if (this.closed) return;
      const latest = this.entries(botId);
      const row = latest.find(item => item.id === next.id);
      if (row?.state === 'running') {
        row.state = error ? 'failed' : 'done';
        row.error = error || undefined;
        if (!error) row.text = '';
        this.save(botId, latest);
      }
    }
  }

  async change(botId: string, id: string, action: 'edit' | 'remove' | 'guide' | 'retry', input: Input) {
    const { app, live } = this.options;
    const conv = `${botId}:web:console`;
    const entries = this.entries(botId), row = entries.find(item => item.id === id);
    if (!row || !['queued', 'failed'].includes(row.state)) throw new ConsoleMessageError(409, '该消息已开始处理或不在队列中');
    if (action === 'guide') {
      if (row.state !== 'queued' || (!this.groups && !live.get(conv)) || row.text.startsWith('/')) throw new ConsoleMessageError(409, '当前消息不能用于引导');
      row.state = 'guiding';
      this.save(botId, entries);
      let guided = false, uncertain = false;
      try { guided = this.groups ? await this.groups.guide(botId, row.text) : await app.runtime.guideConversation(botId, conv, row.text); }
      catch { uncertain = true; }
      finally {
        const current = this.entries(botId), updated = current.find(item => item.id === id);
        if (updated?.state === 'guiding') {
          updated.state = guided ? 'done' : uncertain ? 'failed' : 'queued';
          if (guided) updated.text = '';
          if (uncertain) updated.error = '未能确认引导结果。请检查对话后再决定是否重发。';
          this.save(botId, current);
        }
        this.kick(botId);
      }
      if (uncertain) throw new ConsoleMessageError(409, '未能确认引导结果，请检查对话记录');
      if (!guided) throw new ConsoleMessageError(409, '当前回复暂不支持插话，消息仍在队列中');
      return;
    }
    if (action === 'edit') {
      const text = typeof input.text === 'string' ? input.text.trim() : '';
      if (row.state !== 'queued' || !text || text.length > 32_000) throw new ConsoleMessageError(400, '请填写有效的待发送消息');
      row.text = text;
    } else if (action === 'retry') {
      if (row.state !== 'failed') throw new ConsoleMessageError(409, '该消息无需重试');
      row.state = 'queued';
      row.error = undefined;
      entries.push(...entries.splice(entries.indexOf(row), 1));
    } else { row.state = 'cancelled'; row.text = ''; }
    this.save(botId, entries);
    this.kick(botId);
  }

  submit(botId: string, input: Input): Promise<Receipt> {
    const text = typeof input.text === 'string' ? input.text.trim() : '';
    if (!text || text.length > 32_000) throw new ConsoleMessageError(400, '消息为空或过长');
    if (typeof input.requestId !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(input.requestId)) throw new ConsoleMessageError(400, '请求编号无效');
    const edit = input.editMessageId;
    if (this.groups && edit !== undefined) throw new ConsoleMessageError(400, '群聊仅支持修改待发送的消息');
    if (edit !== undefined && (!Number.isSafeInteger(edit) || Number(edit) < 1 || typeof input.expectedContent !== 'string')) throw new ConsoleMessageError(400, '待修改的消息无效');
    const key = `${botId}:${input.requestId}`;
    const hash = createHash('sha256').update(JSON.stringify([text, edit, input.expectedContent])).digest('hex');
    if (edit === undefined && (this.groups || text.toLowerCase() !== '/stop')) {
      const conv = `${botId}:web:console`;
      if (!this.groups && this.options.editing.has(conv)) throw new ConsoleMessageError(409, '会话正在更新，请稍后重试');
      const now = Date.now();
      const rows = this.entries(botId).filter(row => !['done', 'cancelled'].includes(row.state) || now - row.at < 10 * 60_000);
      const prior = rows.find(row => row.id === input.requestId);
      if (prior && prior.hash !== hash) throw new ConsoleMessageError(409, '同一请求编号不能提交不同内容');
      if (!prior) {
        if (rows.filter(row => !['done', 'cancelled'].includes(row.state)).length >= 32 || rows.length >= 256) throw new ConsoleMessageError(429, '当前会话等待中的消息较多，请稍后重试');
        rows.push({ id: input.requestId, text, hash, at: now, state: 'queued' });
        this.save(botId, rows);
      }
      this.kick(botId);
      return Promise.resolve({ conversationId: conv });
    }
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
    void this.options.run(turn, edit).finally(() => this.kick(botId));
    return { conversationId, turnId: turn.id, messageId: edit };
  }
}
