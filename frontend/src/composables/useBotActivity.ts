import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { botClient } from "@/lib/api/bot-client";
import { readBotActivity } from "@/lib/bot-activity";
import { boost } from "./useBoost";

export function useBotActivity() {
  const activity = ref(readBotActivity(null));
  let timer: ReturnType<typeof setTimeout> | undefined;
  let disposed = false;
  let polling = false;
  async function poll() {
    clearTimeout(timer);
    if (disposed || polling || document.hidden) return;
    polling = true;
    try {
      const next = boost.connected
        ? await botClient.activity()
        : readBotActivity(null);
      if (!disposed) activity.value = next;
    } catch {
      if (!disposed) activity.value = readBotActivity(null);
    } finally {
      polling = false;
      if (!disposed) timer = setTimeout(poll, 1500);
    }
  }
  const label = computed(() => {
    const value = activity.value;
    if (value.state === "working")
      return value.percent == null
        ? `${value.activeTasks || 1} 项任务进行中`
        : `任务进度 ${value.percent}%`;
    return {
      idle: "智能体待命",
      waiting: "等待你的回复",
      done: "任务已完成",
      failed: "任务失败",
      stopped: "任务已停止",
      unavailable: "进度暂不可用",
    }[value.state];
  });
  onMounted(() => {
    document.addEventListener("visibilitychange", poll);
    void poll();
  });
  onBeforeUnmount(() => {
    disposed = true;
    clearTimeout(timer);
    document.removeEventListener("visibilitychange", poll);
  });
  return { activity, label };
}
