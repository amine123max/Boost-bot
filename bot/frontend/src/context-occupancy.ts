import { DEFAULT_CONTEXT_TOKENS } from '../../shared/context-window';
export type ContextBreakdown = Partial<Record<'messages' | 'systemTools' | 'systemPrompt' | 'skills' | 'projectContext', number | null>>;
const definitions = [
  { key: 'messages', label: '消息', color: '#3b82f6' },
  { key: 'systemTools', label: '系统工具', color: '#06b6d4' },
  { key: 'systemPrompt', label: '系统提示词', color: '#8b5cf6' },
  { key: 'skills', label: '技能', color: '#10b981' },
  { key: 'projectContext', label: '项目上下文', color: '#f59e0b' },
] as const;
const valid = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;

/** Keep the rail and legend on one scale; never assign unmeasured usage to a category. */
export function contextOccupancy(breakdown: ContextBreakdown | undefined, measured: number | null | undefined, capacity: number) {
  const items: { key: string; label: string; color: string; value: number | null; derived?: boolean; width: number }[] = definitions.map(item => ({ ...item, value: valid(breakdown?.[item.key]) ? breakdown![item.key]! : null, width: 0 }));
  const classified = items.reduce((total, item) => total + (item.value || 0), 0);
  const reported = valid(measured) ? measured : null;
  const total = breakdown || reported !== null ? Math.max(classified, reported || 0) : null;
  const unclassified = reported !== null ? Math.max(0, reported - classified) : 0;
  if (unclassified > 0) items.push({ key: 'unclassified', label: '未分类用量', color: 'var(--muted)', value: unclassified, derived: true, width: 0 });
  const limit = valid(capacity) && capacity > 0 ? capacity : DEFAULT_CONTEXT_TOKENS;
  const denominator = Math.max(limit, total || 0);
  for (const item of items) item.width = (item.value || 0) / denominator * 100;
  return { items, total, reported, estimated: reported === null || classified > reported, percent: total === null ? null : Math.min(100, total / limit * 100) };
}
