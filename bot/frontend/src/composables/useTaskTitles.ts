import { onBeforeUnmount, ref, watch } from 'vue';
import { api, enc } from '../api';
import type { BackgroundWork } from '../lib/background-work';

export function useTaskTitles(entries: () => BackgroundWork[], binding: () => string, enabled: () => boolean = () => true) {
  const titles = ref<Record<string, string>>({}), error = ref('');
  let fingerprint = '', generation = 0, controller: AbortController | undefined, disposed = false;
  async function load() {
    if (!enabled() || disposed || !entries().length) return;
    const items = entries().map(work => ({ kind: work.kind, id: work.id, botId: work.botId, title: work.title }));
    const next = JSON.stringify([binding(), items]);
    if (next === fingerprint) return;
    fingerprint = next; titles.value = {}; error.value = ''; controller?.abort();
    const ticket = ++generation, abort = new AbortController(); controller = abort;
    try {
      for (const botId of new Set(items.map(item => item.botId))) {
        const owned = items.filter(item => item.botId === botId);
        for (let offset = 0; offset < owned.length; offset += 8) {
          const result = await api<{ entries: Array<{ kind: string; id: string; title?: string }> }>(`/bots/${enc(botId)}/task-titles`, {
            method: 'POST', body: { items: owned.slice(offset, offset + 8).map(({ kind, id }) => ({ kind, id })) }, signal: abort.signal,
          });
          if (disposed || ticket !== generation || abort.signal.aborted) return;
          for (const item of result.entries) if (item.title) titles.value[`${item.kind}:${item.id}`] = item.title;
        }
      }
    } catch (e) { if (!disposed && ticket === generation && !abort.signal.aborted) error.value = (e as Error).message; }
  }
  watch(() => JSON.stringify([enabled(), binding(), entries().map(({ key, title, botId }) => [key, title, botId])]), () => { void load(); }, { immediate: true });
  onBeforeUnmount(() => { disposed = true; generation++; controller?.abort(); });
  return {
    error,
    title: (work: BackgroundWork) => titles.value[work.key] || Array.from(work.title).slice(0, 20).join(''),
    retry: () => { fingerprint = ''; void load(); },
  };
}
