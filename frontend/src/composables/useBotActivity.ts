import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import { botClient } from "@/lib/api/bot-client";
import { appClient } from "@/lib/api/app-client";
import { isTauriRuntime } from "@/lib/api/transport-runtime";
import { readBotActivity, mergeActivities } from "@/lib/bot-activity";
import { TaskProgressClock } from "@/lib/task-progress-clock";
import { boost } from "./useBoost";

// One sampler per webview; mounting a preview does not duplicate disk scans/RPCs.
const local = ref(readBotActivity(null));
const hosted = ref(readBotActivity(null));
const receivedAt = ref({ local: 0, hosted: 0 });
const now = ref(Date.now());
let freshnessTimer: ReturnType<typeof setInterval> | undefined;
let subscribers = 0;
let generation = 0;
const timers: Partial<
  Record<"local" | "hosted", ReturnType<typeof setTimeout>>
> = {};
const observed = computed(() =>
  mergeActivities(
    (["local", "hosted"] as const).map((kind) => {
      const value = kind === "local" ? local.value : hosted.value;
      const age = now.value - receivedAt.value[kind];
      if (age >= 10000) return readBotActivity(null);
      return {
        ...value,
        tokensPerSecond: age < 5000 ? value.tokensPerSecond : null,
        stale: value.stale || age >= 5000,
      };
    }),
  ),
);
const progressClock = new TaskProgressClock();
const activity = computed(() => progressClock.project(observed.value, now.value));
async function sample(kind: "local" | "hosted", run: number) {
  if (!subscribers || generation !== run) return;
  timers[kind] = undefined;
  if (!document.hidden) {
    try {
      const value = readBotActivity(
        await (kind === "local"
          ? appClient.localAgentActivity()
          : boost.connected
            ? botClient.activity()
            : null),
      );
      if (kind === "hosted" && value.available && value.state !== "idle") {
        value.sources = ["boost-bot"];
        value.activeSources = ["boost-bot"];
      }
      if (generation === run) {
        (kind === "local" ? local : hosted).value = value;
        receivedAt.value[kind] = Date.now();
      }
    } catch {
      if (generation === run)
        (kind === "local" ? local : hosted).value = readBotActivity(null);
    }
  }
  if (subscribers && generation === run)
    timers[kind] = setTimeout(
      () => void sample(kind, run),
      kind === "local" ? 500 : 1000,
    );
}
function resume() {
  // Poll loops stay scheduled while hidden; waking does not spawn competing loops.
  if (document.hidden) return;
  for (const kind of ["local", "hosted"] as const) {
    if (timers[kind]) {
      clearTimeout(timers[kind]);
      timers[kind] = undefined;
      if (kind === "hosted" || isTauriRuntime()) void sample(kind, generation);
    }
  }
}
export function useBotActivity() {
  onMounted(() => {
    if (++subscribers !== 1) return;
    generation++;
    now.value = Date.now();
    freshnessTimer = setInterval(() => {
      now.value = Date.now();
    }, 500);
    document.addEventListener("visibilitychange", resume);
    if (isTauriRuntime()) void sample("local", generation);
    void sample("hosted", generation);
  });
  onBeforeUnmount(() => {
    if (--subscribers) return;
    generation++;
    clearInterval(freshnessTimer);
    Object.values(timers).forEach(clearTimeout);
    timers.local = timers.hosted = undefined;
    document.removeEventListener("visibilitychange", resume);
  });
  const label = computed(() => {
    const value = activity.value;
    if (value.state === "working")
      return value.percent == null
        ? `${value.activeTasks || 1} 项任务进行中 · 尚未上报百分比`
        : `任务进度 ${value.percent}%${value.stale ? " · 等待新估计" : ""}`;
    return {
      idle: "智能体待命",
      waiting: "等待你的回复",
      done: "任务已完成",
      failed: "任务失败",
      stopped: "任务已停止",
      unavailable: "进度暂不可用",
    }[value.state];
  });
  return { activity, label };
}
