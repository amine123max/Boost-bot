import { createHash } from 'node:crypto';
import type { App } from '../app.js';
import type { TaskView } from '../tasks/service.js';

export class PanelActionError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
interface RequestRecord { fingerprint: string; taskId: string; expires: number }
const requests = new WeakMap<App, Map<string, RequestRecord>>();

/** UI launches use the same persisted scheduler and isolated task sessions as agent launches. */
export function createPanelTask(app: App, botId: string, body: Record<string, unknown>): TaskView {
  if (!app.store.getBot(botId)) throw new PanelActionError(404, '智能体不存在');
  if (!app.agent.available) throw new PanelActionError(409, '当前代理不可用，请先在 Boost 中检查 Bot 运行环境');
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const brief = typeof body.brief === 'string' ? body.brief.trim() : '';
  const requestId = typeof body.requestId === 'string' ? body.requestId : '';
  const budgetUsd = body.budgetUsd === undefined ? 1 : Number(body.budgetUsd);
  if (!title || title.length > 40 || !brief || brief.length > 1500) throw new PanelActionError(400, '请填写任务名称（最多40字）和执行要求（最多1500字）');
  if (!/^[a-zA-Z0-9_-]{8,100}$/.test(requestId)) throw new PanelActionError(400, '任务请求标识无效，请重新打开创建窗口');
  if (!Number.isFinite(budgetUsd) || budgetUsd <= 0 || budgetUsd > 100) throw new PanelActionError(400, '任务预算必须大于0且不超过100美元');
  const fingerprint = createHash('sha256').update(JSON.stringify({ botId, title, brief, budgetUsd })).digest('hex');
  let entries = requests.get(app);
  if (!entries) { entries = new Map(); requests.set(app, entries); }
  const now = Date.now();
  for (const [key, record] of entries) if (record.expires < now) entries.delete(key);
  const prior = entries.get(requestId);
  if (prior) {
    if (prior.fingerprint !== fingerprint) throw new PanelActionError(409, '相同任务请求已使用，请重新打开创建窗口');
    const task = app.tasks.get(prior.taskId);
    if (!task) throw new PanelActionError(409, '该任务已被删除，请重新创建');
    return task;
  }
  if (entries.size >= 512) throw new PanelActionError(429, '任务创建请求过多，请稍后再试');
  const conversation = app.store.ensureConversation(botId, 'web', 'console', '控制台');
  const result = app.tasks.create({ botId, conversationId: conversation.id, title, brief, budgetUsd, source: 'panel' });
  if (!result.task) throw new PanelActionError(400, result.error || '任务创建失败');
  entries.set(requestId, { fingerprint, taskId: result.task.id, expires: now + 10 * 60_000 });
  return app.tasks.get(result.task.id)!;
}

/** Manual entries stay in the current Bot scope and pass the existing secret/size checks. */
export function rememberPanelEntry(app: App, botId: string, body: Record<string, unknown>): string {
  if (typeof body.text !== 'string') throw new PanelActionError(400, '请输入记忆内容');
  if (body.topic !== undefined && typeof body.topic !== 'string') throw new PanelActionError(400, '记忆主题无效');
  try { return app.agent.memory.remember({ kind: 'bot', id: botId }, body.text, { topic: body.topic as string | undefined, source: 'web', by: 'web' }); }
  catch (error) { throw new PanelActionError(400, (error as Error).message); }
}
