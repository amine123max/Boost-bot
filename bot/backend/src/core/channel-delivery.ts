import { createHash } from 'node:crypto';
import type { Store } from '../store/db.js';
import type { BotRuntime } from './runtime.js';
import { isPushChannel } from './types.js';
import { botWorkspace, resolveFile, runnable } from '../web/files.js';
import path from 'node:path';

export class ChannelDelivery {
  private pending = new Map<string, { fingerprint: string; work: Promise<void> }>();
  constructor(private store: Store, private dataDir: string, private runtime: () => BotRuntime, private workspaceRoot?: () => string) {}
  async tool(botId: string, sourceId: string, op: string, raw: unknown): Promise<Record<string, unknown>> {
    const bot = this.store.getBot(botId), source = this.store.getConversation(sourceId);
    if (!bot || source?.botId !== botId) throw new Error('文件推送不属于当前智能体会话');
    if (bot.app && !bot.app.permissions.includes('network')) throw new Error('此目录智能体未声明网络权限，不能读取渠道或推送文件');
    const conversations = this.store.listConversations(botId).filter(conv => isPushChannel(conv.channel));
    if (op === 'list') return { conversations: conversations.map(conv => ({ id: conv.id, channel: conv.channel, title: conv.title })) };
    if (op !== 'file' || bot.settings.permission === 'readonly') throw new Error('当前权限不能推送文件');
    const input = raw && typeof raw === 'object' ? raw as Record<string, unknown> : {};
    const conv = conversations.find(conv => conv.id === input.conversation_id);
    if (!conv) throw new Error('只能推送到此智能体已经建立的渠道会话');
    const workspace = botWorkspace(this.dataDir, botId, this.workspaceRoot?.());
    const file = workspace && typeof input.path === 'string' ? resolveFile(input.path, { workspace, dataDir: this.dataDir, delivered: [] }) : undefined;
    if (!file || runnable(file) || file.size > 20 * 1048576) throw new Error('文件不存在、不是安全工作区文件，或超过20 MB');
    if (typeof input.request_id !== 'string' || !/^[A-Za-z0-9_-]{8,100}$/.test(input.request_id)) throw new Error('推送请求标识无效');
    const key = `channel-file:${botId}:${input.request_id}`;
    const fingerprint = createHash('sha256').update(JSON.stringify({ conversation: conv.id, path: file.path, size: file.size, modified: file.mtimeMs })).digest('hex');
    const previous = this.store.getKV(key);
    if (previous && previous !== fingerprint) throw new Error('同一推送请求标识不能用于不同文件或收件人');
    if (!previous) {
      const pending = this.pending.get(key);
      if (pending && pending.fingerprint !== fingerprint) throw new Error('同一推送请求标识不能用于不同文件或收件人');
      if (pending) await pending.work;
      else {
        const work = Promise.resolve().then(async () => {
          await this.runtime().sendFile(conv.id, file.path, path.basename(file.path), key);
          this.store.setKV(key, fingerprint);
        });
        this.pending.set(key, { fingerprint, work });
        try { await work; } finally { this.pending.delete(key); }
      }
    }
    return { queued: true, channel: conv.channel, conversationId: conv.id, name: path.basename(file.path) };
  }
}
