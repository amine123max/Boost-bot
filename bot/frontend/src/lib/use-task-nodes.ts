import { onBeforeUnmount, ref, watch, type Ref } from 'vue';
import { api } from '../api';
import type { TaskNode, TaskNodeAnalysis, TaskNodeReference } from '../../../shared/task-nodes';

/** Plan explicit tasks on demand, with one request per visible detail. */
export function useTaskNodes(reference: Ref<TaskNodeReference | null>, fingerprint: Ref<string>, enabled: Ref<boolean>) {
  const nodes = ref<TaskNode[]>([]), loading = ref(false), error = ref(''), stale = ref(false);
  let generation = 0, timer: ReturnType<typeof setTimeout> | undefined, controller: AbortController | undefined;
  let dirty = false;
  let nextAllowed = 0;
  async function refresh() {
    if (!enabled.value || !reference.value || document.hidden) return;
    if (controller) { dirty = true; return; }
    const ticket = generation, input = reference.value, ac = new AbortController();
    controller = ac; loading.value = true; error.value = ''; dirty = false;
    try {
      const result = await api<TaskNodeAnalysis>('/activity/nodes', { method: 'POST', body: input, signal: ac.signal });
      if (ticket !== generation) return;
      nodes.value = result.nodes; stale.value = result.stale;
      nextAllowed = result.refreshAfterMs ? Date.now() + result.refreshAfterMs : 0;
      if (result.refreshAfterMs) schedule(result.refreshAfterMs);
    } catch (e) {
      if (ticket === generation && !ac.signal.aborted) error.value = (e as Error).message;
    } finally {
      if (controller === ac) controller = undefined;
      if (ticket === generation) { loading.value = false; if (dirty && !error.value) schedule(1500); }
    }
  }
  function schedule(delay = 1500) { clearTimeout(timer); timer = setTimeout(() => void refresh(), Math.max(delay, nextAllowed - Date.now())); }
  watch(() => JSON.stringify(reference.value), () => {
    generation++; controller?.abort(); controller = undefined; clearTimeout(timer);
    nodes.value = []; error.value = ''; stale.value = false; loading.value = false; nextAllowed = 0;
    if (enabled.value) schedule(0);
  }, { immediate: true });
  watch([fingerprint, enabled], () => {
    if (!enabled.value) {
      generation++; controller?.abort(); controller = undefined; clearTimeout(timer);
      dirty = false; loading.value = false;
      return;
    }
    if (fingerprint.value.startsWith('false:')) nextAllowed = 0;
    if (!error.value) schedule(nodes.value.length ? 1500 : 0);
  });
  const visible = () => { if (!document.hidden && enabled.value && !error.value) schedule(0); };
  document.addEventListener('visibilitychange', visible);
  onBeforeUnmount(() => { generation++; controller?.abort(); clearTimeout(timer); document.removeEventListener('visibilitychange', visible); });
  return { nodes, loading, error, stale, refresh };
}
