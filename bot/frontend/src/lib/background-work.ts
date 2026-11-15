import type { Task } from '../types';

export interface BackgroundRule {
  id: string;
  botId: string;
  title: string;
  when: string;
  trigger: { kind: string };
  mode: string;
  state: { key: string; label: string };
  nextRunAt: number;
  updatedAt: number;
  last?: { at: number; outcome: string; line: string };
  live?: { runId: string; state: string; since: number };
}

export interface BackgroundWork {
  key: string;
  kind: 'task' | 'rule';
  id: string;
  botId: string;
  title: string;
  state: 'pending' | 'working' | 'done' | 'failed';
  label: string;
  updatedAt: number;
  schedule?: string;
  nextRunAt?: number;
  latest?: string;
  runId?: string;
  task?: Task;
}

export function backgroundWork(tasks: Task[], rules: BackgroundRule[]): BackgroundWork[] {
  const entries: BackgroundWork[] = tasks.map(task => ({
    key: `task:${task.id}`, kind: 'task', id: task.id, botId: task.botId, title: task.title,
    state: task.stage?.key === 'ready' ? 'done' : task.stage?.key === 'failed' ? 'failed'
      : task.stage?.key === 'working' || task.stage?.key === 'working/asking' ? 'working' : 'pending',
    label: task.stage?.label || task.status || '等待执行',
    updatedAt: task.updatedAt || task.createdAt || 0,
    latest: task.latest || task.summary, runId: task.live?.runId, task,
  }));
  for (const rule of rules) {
    const running = rule.live && rule.live.state !== 'queued';
    entries.push({
      key: `rule:${rule.id}`, kind: 'rule', id: rule.id, botId: rule.botId, title: rule.title,
      state: rule.live ? running ? 'working' : 'pending'
        : rule.state.key === 'paused' || ['failed', 'interrupted', 'budget', 'timeout', 'stopped'].includes(rule.last?.outcome || '') ? 'failed'
          : rule.last?.outcome === 'done' ? 'done' : 'pending',
      label: rule.live ? running ? '执行中' : '排队中' : rule.state.label,
      updatedAt: Math.max(rule.updatedAt, rule.live?.since || rule.last?.at || 0),
      schedule: rule.when, nextRunAt: rule.nextRunAt,
      latest: rule.last?.line, runId: rule.live?.runId,
    });
  }
  const rank = (entry: BackgroundWork) => entry.state === 'working' ? 0 : entry.state === 'failed' ? 1 : 2;
  return entries.sort((a, b) => rank(a) - rank(b) || b.updatedAt - a.updatedAt);
}
