import { createHash } from 'node:crypto';
import { normalizeSettings } from '../agent/settings.js';
import type { Bot, Store } from '../store/db.js';
import { modelSourceValue } from './model-sources.js';

export function validateBotInput(raw: unknown, creating = false): Record<string, unknown> {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('智能体配置必须是对象');
  const input = { ...raw } as Record<string, unknown>;
  if(input.modelSource!==undefined)input.modelSource=modelSourceValue(input.modelSource);
  for (const [key, max] of [['name', 60], ['systemPrompt', 32_000], ['defaultModel', 200]] as const) {
    if (input[key] === undefined && !(creating && key === 'name')) continue;
    const value = input[key];
    if (typeof value !== 'string' || value.length > max || key === 'name' && !value.trim()) throw new Error(`${key === 'name' ? '名称' : key === 'systemPrompt' ? '角色与职责' : '模型名称'}无效，最多 ${max} 字符`);
    if (key !== 'systemPrompt') input[key] = value.trim();
  }
  if (input.modelProtocol !== undefined && !['auto', 'chat', 'responses', 'messages'].includes(String(input.modelProtocol))) throw new Error('请求格式无效');
  if (input.modelStreaming !== undefined && typeof input.modelStreaming !== 'boolean') throw new Error('流式开关必须是布尔值');
  return input;
}

export class BotManagement {
  private pending = new Map<string, { hash: string; promise: Promise<Bot> }>();
  constructor(private store: Store, private start: (id: string) => Promise<void>) {}
  create(raw: unknown): Promise<Bot> {
    const input = validateBotInput(raw, true);
    const request = input.requestId;
    if (request !== undefined && (typeof request !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(request))) throw new Error('创建请求标识无效');
    const hash = createHash('sha256').update(JSON.stringify({ ...input, requestId: undefined })).digest('hex');
    const key = typeof request === 'string' ? `bot-create:${request}` : '';
    const previous = key ? this.store.getKV(key) : undefined;
    if (previous) {
      const saved = JSON.parse(previous) as { id: string; hash: string };
      if (saved.hash !== hash) throw new Error('同一创建请求不能用于不同配置');
      const bot = this.store.getBot(saved.id);
      if (!bot) throw new Error('该创建请求对应的智能体已删除，请重新创建');
      return Promise.resolve(bot);
    }
    const active = this.pending.get(key);
    if (key && active) {
      if (active.hash !== hash) throw new Error('同一创建请求不能用于不同配置');
      return active.promise;
    }
    const promise = this.createOnce(input, key, hash).finally(() => { if (key) this.pending.delete(key); });
    if (key) this.pending.set(key, { hash, promise });
    return promise;
  }
  private async createOnce(input: Record<string, unknown>, key: string, hash: string): Promise<Bot> {
    const bot = this.store.createBot({ name: String(input.name), systemPrompt: String(input.systemPrompt ?? ''), defaultModel: String(input.defaultModel ?? ''),
      settings: normalizeSettings({ avatar: input.avatar, appearance: input.appearance, modelProtocol: input.modelProtocol, modelStreaming: input.modelStreaming, modelSource: input.modelSource }) });
    try { await this.start(bot.id); }
    catch (error) { this.store.deleteBot(bot.id); throw error; }
    if (key) this.store.setKV(key, JSON.stringify({ id: bot.id, hash }));
    return bot;
  }
}
