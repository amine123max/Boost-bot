import { onBeforeUnmount, ref, watch } from 'vue';
import { api, enc } from '../api';
import type { BackgroundWork } from '../lib/background-work';

export function useTaskTitles(entries: () => BackgroundWork[], binding: () => string, enabled: () => boolean = () => true) {
  const titles = ref<Record<string, { source: string; title: string }>>({});
  const titleKey = (botId: string, key: string) => `${botId}:${key}`;
  let fingerprint = '', generation = 0, controller: AbortController | undefined, disposed = false;
  async function load() {
    if (!enabled() || disposed || !entries().length) return;
    const items = entries().map(work => ({ kind: work.kind, id: work.id, botId: work.botId, title: work.title }));
    const next = JSON.stringify([binding(), items]);
    if (next === fingerprint) return;
    fingerprint = next; controller?.abort();
    const ticket = ++generation, abort = new AbortController(); controller = abort;
    const batches = [...new Set(items.map(item => item.botId))].flatMap(botId => {
      const owned = items.filter(item => item.botId === botId);
      return Array.from({length:Math.ceil(owned.length / 8)}, (_, index) => ({botId, rows:owned.slice(index * 8, index * 8 + 8)}));
    });
    async function read(batch: typeof batches[number], cachedOnly: boolean) {
      const {botId, rows} = batch;
      const result = await api<{ entries: Array<{ kind: string; id: string; title?: string }> }>(`/bots/${enc(botId)}/task-titles`, {
        method:'POST', body:{cachedOnly, items:rows.map(({ kind, id }) => ({kind,id}))}, signal:abort.signal,
      });
      if (disposed || ticket !== generation || abort.signal.aborted) return [];
      for (const item of result.entries) {
        const original = rows.find(row => row.kind === item.kind && row.id === item.id);
        if (item.title && original) titles.value[titleKey(botId, `${item.kind}:${item.id}`)] = {source:original.title,title:item.title};
      }
      return rows.filter(row => !result.entries.some(item => item.kind === row.kind && item.id === row.id && item.title));
    }
    try {
      const missing: typeof batches = [];
      for (const batch of batches) {
        if (disposed || ticket !== generation || abort.signal.aborted) return;
        const rows = await read(batch, true).catch(() => []);
        if (rows.length) missing.push({ ...batch, rows });
      }
      for (const batch of missing) {
        if (disposed || ticket !== generation || abort.signal.aborted) return;
        if (batch.rows.length) await read(batch, false).catch(() => []);
      }
    } catch { /* Preserve previously generated titles and fall back to the original. */ }
  }
  watch(() => JSON.stringify([enabled(), binding(), entries().map(({ key, title, botId }) => [key, title, botId])]), () => { void load(); }, { immediate: true });
  onBeforeUnmount(() => { disposed = true; generation++; controller?.abort(); });
  return {
    title: (work: BackgroundWork) => {
      const cached = titles.value[titleKey(work.botId, work.key)];
      return cached?.source === work.title ? cached.title : Array.from(work.title).slice(0, 20).join('');
    },
  };
}
