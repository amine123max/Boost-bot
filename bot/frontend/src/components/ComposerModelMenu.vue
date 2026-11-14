<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import { api, enc } from "../api";
import type { Bot } from "../types";
import type { Conversation } from "../conversation";
import type { ModelMetrics } from "../model-metrics";
import { DEFAULT_CONTEXT_TOKENS } from "../../../shared/context-window";
import ModelSelect from "./ModelSelect.vue";
import SelectControl from "./SelectControl.vue";
import ProviderIcon from "./ProviderIcon.vue";
import HelpTip from "./HelpTip.vue";
import Icon from "./Icon.vue";
import SpringDisclosure from "./SpringDisclosure.vue";
import SpringSurface from '../../../../frontend/src/components/SpringSurface.vue';
const props = defineProps<{
  bot: Bot;
  chat: Conversation;
  models: string[];
  configure: boolean;
}>();
const emit = defineEmits<{ saved: [] }>();
const trigger = ref<HTMLButtonElement>(),
  popup = ref<HTMLElement>(),
  open = ref(false),
  contextExpanded = ref(false),
  metrics = ref<ModelMetrics>(),
  loading = ref(false),
  error = ref(""),
  saving = ref(false),
  position = ref({});
let controller: AbortController | undefined,
  timer: ReturnType<typeof setTimeout> | undefined;
const model = computed(
  () =>
    props.chat.model ||
    props.bot.defaultModel ||
    metrics.value?.model ||
    "默认模型",
);
const effortOptions = [
  { value: "auto", label: "自动" },
  { value: "low", label: "低" },
  { value: "medium", label: "中" },
  { value: "high", label: "高" },
];
const effort = computed(
  () =>
    effortOptions.find(
      (option) =>
        option.value === (props.bot.settings.reasoningEffort || "auto"),
    )?.label || "自动",
);
const liveContext = computed(() => {
  let used: number | null = null;
  for (const step of props.chat.live?.steps || [])
    if (step.kind === "model" && step.title === model.value) {
      if (typeof step.tokens?.input === "number") {
        used = step.tokens.input + (step.tokens.output || 0);
      }
    }
  return used;
});
const estimatedContext = computed(() => {
  const breakdown = metrics.value?.context.breakdown;
  return breakdown ? breakdown.messages + breakdown.systemPrompt : undefined;
});
const usedContext = computed(() => liveContext.value ?? metrics.value?.context.usedTokens ?? estimatedContext.value);
const contextEstimated = computed(() => liveContext.value == null && metrics.value?.context.usedTokens == null && estimatedContext.value != null);
const contextCapacity = computed(() => metrics.value?.windowTokens || DEFAULT_CONTEXT_TOKENS);
const defaultCapacity = computed(() => !metrics.value?.windowTokens || metrics.value.windowBasis === 'default');
const format = (value: number | null | undefined) =>
  value == null ? "—" : value.toLocaleString("zh-CN");
const percent = computed(() =>
  usedContext.value != null
    ? Math.min(100, (100 * usedContext.value) / contextCapacity.value)
    : null,
);
const breakdown = computed(() => [
  {
    label: "消息",
    value: metrics.value?.context.breakdown.messages,
    color: "#3b82f6",
  },
  {
    label: "系统工具",
    value: metrics.value?.context.breakdown.systemTools,
    color: "#06b6d4",
  },
  {
    label: "系统提示词",
    value: metrics.value?.context.breakdown.systemPrompt,
    color: "#8b5cf6",
  },
  {
    label: "技能",
    value: metrics.value?.context.breakdown.skills,
    color: "#10b981",
  },
  {
    label: "项目上下文",
    value: metrics.value?.context.breakdown.projectContext,
    color: "#f59e0b",
  },
]);
function place() {
  if (!trigger.value || !open.value) return;
  const r = trigger.value.getBoundingClientRect(),
    width = Math.min(330, innerWidth - 24),
    above = r.top - 12,
    below = innerHeight - r.bottom - 12;
  position.value = {
    left: `${Math.max(12, Math.min(r.right - width, innerWidth - width - 12))}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, Math.min(620, above > below ? above : below))}px`,
    ...(above > below
      ? { bottom: `${innerHeight - r.top + 6}px` }
      : { top: `${r.bottom + 6}px` }),
  };
}
async function load() {
  clearTimeout(timer);
  controller?.abort();
  const ac = new AbortController();
  controller = ac;
  loading.value = true;
  error.value = "";
  const id = props.bot.id;
  try {
    const value = await api<ModelMetrics>(`/bots/${enc(id)}/chat/metrics`, {
      signal: ac.signal,
    });
    if (!ac.signal.aborted && id === props.bot.id) metrics.value = value;
  } catch (e) {
    if (!ac.signal.aborted) error.value = (e as Error).message;
  } finally {
    if (controller === ac) {
      loading.value = false;
      controller = undefined;
      if (open.value)
        timer = setTimeout(() => {
          if (!document.hidden) void load();
        }, 5000);
    }
  }
}
function close(focus = false) {
  open.value = false;
  clearTimeout(timer);
  controller?.abort();
  controller = undefined;
  loading.value = false;
  if (focus) trigger.value?.focus();
}
async function toggle() {
  if (open.value) {
    close();
    return;
  }
  contextExpanded.value = false;
  open.value = true;
  place();
  void load();
  await nextTick();
  popup.value?.focus();
}
async function chooseModel(value: string) {
  await props.chat.changeModel(value);
}
async function chooseEffort(value: string) {
  if (
    !props.configure ||
    saving.value ||
    props.chat.running ||
    metrics.value?.reasoning.supported !== true
  )
    return;
  const id = props.bot.id;
  saving.value = true;
  try {
    await api(`/bots/${enc(id)}/settings`, {
      method: "PUT",
      body: { reasoningEffort: value },
    });
    emit("saved");
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
function outside(event: PointerEvent) {
  const node = event.target as Node;
  if (
    !trigger.value?.contains(node) &&
    !popup.value?.contains(node) &&
    !(node instanceof Element && node.closest(".select-popup"))
  )
    close();
}
function keyboard(event: KeyboardEvent) {
  if (!open.value) return;
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
  }
  if (event.key === "Tab") close();
}
watch(
  () => props.bot.id,
  () => {
    close();
    metrics.value = undefined;
  },
);
watch(
  () => model.value,
  () => {
    if (open.value) {
      metrics.value = undefined;
      void load();
    }
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", keyboard);
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
});
onBeforeUnmount(() => {
  close();
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", keyboard);
  window.removeEventListener("resize", place);
  document.removeEventListener("scroll", place, true);
});
</script>
<template>
  <button
    ref="trigger"
    type="button"
    class="composer-model-trigger"
    aria-label="对话模型与用量"
    aria-haspopup="dialog"
    :aria-expanded="open"
    @click="toggle"
  >
    <ProviderIcon :model="model" :size="16" /><span>{{ model }}</span
    ><small>{{ effort }}</small
    ><Icon name="chevron" :size="12" />
  </button>
  <Teleport to="body"><SpringSurface
    ><section
      v-if="open"
      ref="popup"
      class="composer-model-popover"
      role="dialog"
      aria-label="模型与消耗"
      tabindex="-1"
      :style="position"
    >
      <div class="model-menu-row model-choice-row">
        <strong>模型</strong
        ><ModelSelect
          :model-value="chat.model"
          :models="models"
          label="对话模型"
          :default-label="bot.defaultModel || '默认模型'"
          :disabled="chat.running || chat.modelChanging || chat.loading"
          @update:model-value="chooseModel"
        />
      </div>
      <div class="model-menu-row">
        <strong
          >推理能力<HelpTip
            text="仅对已确认支持调节推理强度的模型开放设置；未确认时由模型自动控制。" /></strong
        ><SelectControl
          v-if="metrics?.reasoning.supported === true"
          :model-value="bot.settings.reasoningEffort || 'auto'"
          :options="effortOptions"
          label="当前Bot推理强度"
          :disabled="!configure || chat.running || saving"
          @update:model-value="chooseEffort"
        /><span v-else class="model-menu-value">{{
          metrics?.reasoning.supported === false ? "不支持调节" : "模型自动"
        }}</span>
      </div>
      <div class="model-menu-section">
        <button
          type="button"
          class="model-menu-row model-menu-action"
          :aria-expanded="contextExpanded"
          @click="contextExpanded = !contextExpanded"
        >
          <strong>上下文窗口</strong
          ><span class="model-menu-value"
            ><span
              v-if="loading"
              class="loading-ring context-refresh-ring"
              aria-label="刷新上下文" /><span>{{ contextEstimated ? '≈ ' : '' }}{{ format(usedContext)
            }} / {{ format(contextCapacity) }}</span
            ><Icon
              name="chevron"
              :size="12"
              class="context-toggle-icon"
              :class="{ expanded: contextExpanded }"
          /></span>
        </button>
        <SpringDisclosure :open="contextExpanded"
          ><div
            class="context-meter"
            :class="{ 'context-meter-unknown': percent === null }"
            :role="percent === null ? undefined : 'progressbar'"
            aria-label="上下文占用"
            :aria-valuenow="percent === null ? undefined : Math.round(percent)"
            :aria-valuemin="0"
            :aria-valuemax="100"
          >
            <span v-if="percent !== null" :style="{ width: percent + '%' }" />
            <span v-else class="context-meter-unavailable" />
          </div>
          <p class="model-menu-note">
            {{
              contextEstimated ? "文本估算，不含未计量的工具、技能等上下文" : usedContext == null
                ? "尚无有效用量采样"
                : "上次模型请求的输入与输出用量"
            }}{{ defaultCapacity ? "；默认 128K 窗口" : metrics?.windowBasis === 'runtime' ? "；按当前执行窗口计算" : "" }}。
          </p>
          <div class="context-estimates"
            ><p class="model-menu-caption">
              文本估算<HelpTip
                text="消息与提示词按文本粗估；工具、技能、项目上下文未独立计量时显示横线，不编造零值，也不与真实用量相加。"
              />
            </p>
            <div
              v-for="item in breakdown"
              :key="item.label"
              class="context-breakdown-row"
            >
              <span
                class="context-key"
                :style="{ background: item.color }"
              /><span>{{ item.label }}</span
              ><span>{{ format(item.value) }}</span>
            </div></div
          ></SpringDisclosure
        >
      </div>
      <div v-if="error" class="model-menu-status" role="alert">
        <button type="button" class="model-menu-retry" @click="load">
          {{ error }} · 重试
        </button>
      </div>
    </section></SpringSurface></Teleport
  >
</template>
<style scoped>
.composer-model-trigger {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  padding: 5px 6px;
  border: 0;
  background: transparent;
  border-radius: 6px;
  color: var(--fg-2);
  font-size: 12px;
}
.composer-model-trigger:hover,
.composer-model-trigger[aria-expanded="true"] {
  background: var(--pill);
  color: var(--fg);
}
.composer-model-trigger > span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  min-width: 0;
}
.composer-model-trigger small {
  font-size: 11px;
  color: var(--muted);
  white-space: nowrap;
}
.composer-model-trigger > svg:last-child {
  transform: rotate(90deg);
  flex: none;
}
.composer-model-popover {
  position: fixed;
  z-index: 90;
  box-sizing: border-box;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  color: var(--fg);
  box-shadow: 0 12px 36px #0003;
  overflow: auto;
  overscroll-behavior: contain;
  scrollbar-width: none;
  font-size: 12px;
  outline: none;
}
.composer-model-popover::-webkit-scrollbar {
  display: none;
}
.model-menu-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-height: 34px;
  width: 100%;
  padding: 4px 2px;
}
.model-menu-row strong {
  display: inline-flex;
  align-items: center;
  flex: none;
  font-size: 12px;
  font-weight: 550;
}
.model-menu-value {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 7px;
  min-width: 0;
  text-align: right;
  color: var(--muted);
  overflow-wrap: anywhere;
  font-size: 11px;
}
.model-menu-action {
  border: 0;
  background: transparent;
  text-align: left;
  border-radius: 5px;
}
.model-menu-action:hover {
  background: var(--pill);
}
.model-menu-row > .select-control {
  max-width: 120px;
}
.model-choice-row > .select-control {
  max-width: none;
  flex: 1;
  min-width: 0;
}
.model-choice-row :deep(.select-trigger) {
  border: 0;
  background: transparent;
  box-shadow: none;
  justify-content: flex-end;
  padding: 4px;
}
.context-toggle-icon {
  transform: rotate(90deg);
  transition: transform 0.3s cubic-bezier(0.2, 0.9, 0.3, 1);
}
.context-toggle-icon.expanded {
  transform: rotate(-90deg);
}
.model-menu-section {
  border-top: 1px solid var(--line);
  margin-top: 8px;
  padding-top: 8px;
}
.model-menu-note {
  font-size: 10px;
  line-height: 1.5;
  color: var(--muted);
  margin: 7px 0;
}
.model-menu-caption {
  display: flex;
  align-items: center;
  color: var(--muted);
  font-size: 11px;
  margin: 4px 0 8px;
}
.context-meter {
  height: 5px;
  margin: 10px 2px;
  background: var(--pill);
  border-radius: 4px;
  overflow: hidden;
}
.context-meter-unknown { background: repeating-linear-gradient(110deg, var(--line) 0 6px, transparent 6px 11px); }
.context-meter > .context-meter-unavailable { width: 100%; background: transparent; }
.context-meter > span {
  display: block;
  height: 100%;
  background: var(--accent);
  border-radius: inherit;
  transition: width 0.2s ease;
}
.context-breakdown-row {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 5px 2px;
  font-size: 11px;
}
.context-breakdown-row > span:last-child {
  margin-left: auto;
  color: var(--muted);
  font-variant-numeric: tabular-nums;
}
.context-key {
  width: 8px;
  height: 8px;
  border-radius: 3px;
  flex: none;
}
.model-menu-status {
  display: flex;
  align-items: center;
  gap: 6px;
  min-height: 23px;
  font-size: 10px;
  color: var(--muted);
  margin-top: 5px;
}
.context-refresh-ring {
  width: 12px;
  height: 12px;
  border-width: 1.5px;
}
.model-menu-retry {
  color: var(--red);
  text-align: left;
}
:global(html[data-motion="reduce"]) .context-toggle-icon,
:global(html[data-motion="off"]) .context-toggle-icon,
:global(html[data-motion="reduce"]) .context-meter > span,
:global(html[data-motion="off"]) .context-meter > span { transition: none; }
@media (prefers-reduced-motion: reduce) {
  .context-meter > span,
  .context-toggle-icon {
    transition: none;
  }
}
</style>
