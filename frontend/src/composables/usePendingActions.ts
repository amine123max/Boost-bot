import { reactive } from "vue";

/** Independent controls stay usable while only duplicate submissions are blocked. */
export function usePendingActions() {
  const pending = reactive(new Set<string>());
  const isPending = (key: string) => pending.has(key);
  async function run<T>(key: string, task: () => Promise<T>) {
    if (pending.has(key)) return;
    pending.add(key);
    try {
      return await task();
    } finally {
      pending.delete(key);
    }
  }
  return { isPending, run };
}
