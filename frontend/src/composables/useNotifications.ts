import { ref } from "vue";
export interface Notice {
  id: number;
  message: string;
  error: boolean;
}
export const notices = ref<Notice[]>([]);
const timers = new Map<number, ReturnType<typeof setTimeout>>();
let sequence = 0;
export function dismissNotice(id: number) {
  clearTimeout(timers.get(id));
  timers.delete(id);
  notices.value = notices.value.filter((n) => n.id !== id);
}
export function notify(message: string, error = false) {
  message = message.replace(/\s+/g, " ").trim();
  if (
    !message ||
    notices.value.some((n) => n.message === message && n.error === error)
  )
    return;
  const id = ++sequence;
  notices.value = [...notices.value, { id, message, error }].slice(-4);
  timers.set(
    id,
    setTimeout(() => dismissNotice(id), error ? 9000 : 4500),
  );
}
