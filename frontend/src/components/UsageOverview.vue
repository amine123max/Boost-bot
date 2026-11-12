<script setup lang="ts">
import HelpHint from "./HelpHint.vue";
import { computed, ref, watch, nextTick, onBeforeUnmount } from "vue";
import BoostIcon from "./BoostIcon.vue";
import { useUsageHistory } from "@/composables/useUsageHistory";
import {
  calendarTimeline,
  visibleUsageWindow,
  cacheHitRate,
  compactTokens,
  fullNumber,
  usd,
  type UsageMetric,
} from "@/lib/usage-heatmap";
import type { DashboardTokenUsage } from "@/types";
const props = defineProps<{ daily?: boolean }>();
const { history, loading, error, reload } = useUsageHistory(!props.daily);
defineExpose({ reload });
const selected = ref<UsageMetric>("tokens"),
  expanded = ref(true);
const usage = computed(() =>
  props.daily ? history.value?.todayUsage : history.value?.totals,
);
const metrics = computed(() => [
  {
    id: "cost" as const,
    label: props.daily ? "今日成本" : "总成本",
    value: usage.value ? usd(usage.value.estimatedCostUsd) : "—",
    hint: "按实际记录的模型计价估算，单位为美元（USD）；不等同于账单扣款。",
  },
  {
    id: "requests" as const,
    label: props.daily ? "今日请求数" : "总请求数",
    value: usage.value
      ? `${!props.daily && history.value?.hasUndatedHistory ? "≥ " : ""}${fullNumber(usage.value.requestCount)}`
      : "—",
    hint:
      !props.daily && history.value?.hasUndatedHistory
        ? "早期明细已归档，显示可确认的累计请求数下限。"
        : "包含已记录的成功与失败请求。",
  },
  {
    id: "tokens" as const,
    label: "真实消耗 Tokens",
    value: usage.value ? compactTokens(usage.value.totalTokens) : "—",
    hint: "上游实际返回的总 Token，包含缓存输入；推理 Token 已计入输出，不重复累加。",
  },
  {
    id: "cache" as const,
    label: "缓存命中率",
    value: usage.value ? cacheHitRate(usage.value) : "—",
    hint: "缓存命中的输入 Token ÷ 总输入 Token；没有输入用量时不计算命中率。",
  },
]);
const timeline = computed(() =>
  history.value
    ? calendarTimeline(history.value.today, history.value.days, selected.value)
    : null,
);
const calendarScroller = ref<HTMLDivElement>();
const viewportWidth = ref(742),
  scrollLeft = ref(0);
const step = computed(() => Math.max(20, viewportWidth.value / 53));
const visibleRange = computed(() =>
  timeline.value
    ? visibleUsageWindow(
        timeline.value,
        history.value!.days,
        scrollLeft.value,
        viewportWidth.value,
        step.value,
      )
    : null,
);
let followingLatest = true;
let resizeObserver: ResizeObserver | undefined;
async function measureCalendar() {
  const element = calendarScroller.value;
  if (!element) return;
  viewportWidth.value = element.clientWidth;
  await nextTick();
  if (followingLatest)
    element.scrollLeft = element.scrollWidth - element.clientWidth;
  scrollLeft.value = element.scrollLeft;
}
watch(
  calendarScroller,
  (element) => {
    resizeObserver?.disconnect();
    if (!element) return;
    resizeObserver = new ResizeObserver(() => void measureCalendar());
    resizeObserver.observe(element);
    void measureCalendar();
  },
  { flush: "post" },
);
watch(
  () => [timeline.value?.start, timeline.value?.weeks, timeline.value?.end],
  () => void nextTick(measureCalendar),
);
onBeforeUnmount(() => resizeObserver?.disconnect());
function calendarScrolled() {
  const element = calendarScroller.value;
  if (!element) return;
  scrollLeft.value = element.scrollLeft;
  followingLatest =
    element.scrollWidth - element.clientWidth - element.scrollLeft < 2;
  tooltip.value = null;
}
function calendarWheel(event: WheelEvent) {
  const element = calendarScroller.value;
  if (
    !element ||
    event.ctrlKey ||
    Math.abs(event.deltaX) >= Math.abs(event.deltaY)
  )
    return;
  const next = Math.max(
    0,
    Math.min(
      element.scrollWidth - element.clientWidth,
      element.scrollLeft +
        event.deltaY *
          (event.deltaMode === 1
            ? 16
            : event.deltaMode === 2
              ? element.clientWidth
              : 1),
    ),
  );
  if (next !== element.scrollLeft) {
    event.preventDefault();
    element.scrollLeft = next;
  }
}
let drag: { x: number; left: number } | null = null;
function startDrag(event: PointerEvent) {
  if (event.pointerType !== "mouse" || event.button !== 0) return;
  drag = { x: event.clientX, left: calendarScroller.value!.scrollLeft };
  calendarScroller.value!.setPointerCapture(event.pointerId);
}
function moveDrag(event: PointerEvent) {
  if (!drag) return;
  if (Math.abs(event.clientX - drag.x) > 3) {
    event.preventDefault();
    tooltip.value = null;
    calendarScroller.value!.scrollLeft = drag.left + drag.x - event.clientX;
  }
}
function endDrag() {
  drag = null;
}
const tooltip = ref<{
  day: string;
  usage: DashboardTokenUsage;
  left: number;
  top: number;
} | null>(null);
function showDay(
  event: MouseEvent | FocusEvent,
  cell: { day: string; usage: DashboardTokenUsage; future: boolean },
) {
  if (cell.future) return;
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  tooltip.value = {
    day: cell.day,
    usage: cell.usage,
    left: Math.max(
      12,
      Math.min(rect.left + rect.width / 2 - 124, window.innerWidth - 260),
    ),
    top:
      rect.bottom + 180 < window.innerHeight
        ? rect.bottom + 8
        : Math.max(12, rect.top - 180),
  };
}
function cellLabel(cell: { day: string; usage: DashboardTokenUsage }) {
  return `${cell.day}：${fullNumber(cell.usage.requestCount)} 次请求，${fullNumber(cell.usage.totalTokens)} Tokens，${usd(cell.usage.estimatedCostUsd)}`;
}
function moveCell(event: KeyboardEvent) {
  const offset = (
    { ArrowUp: -1, ArrowDown: 1, ArrowLeft: -7, ArrowRight: 7 } as Record<
      string,
      number
    >
  )[event.key];
  if (offset === undefined) return;
  const element = event.currentTarget as HTMLElement;
  const cells = Array.from(
    element.parentElement!.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    ),
  );
  const target = cells[cells.indexOf(element as HTMLButtonElement) + offset];
  if (target) {
    event.preventDefault();
    target.focus();
  }
}
</script>
<template>
  <section
    class="usage-overview"
    :class="{ 'daily-usage-overview': daily }"
    :aria-label="daily ? '今日用量汇总' : '密钥长期用量汇总'"
    :aria-busy="loading"
  >
    <div class="usage-summary-row">
      <button
        v-for="metric in metrics"
        :key="metric.id"
        type="button"
        class="usage-summary-metric"
        :class="{ selected: selected === metric.id }"
        :aria-pressed="selected === metric.id"
        @click="selected = metric.id"
      >
        <span class="usage-summary-label"
          >{{ metric.label
          }}<HelpHint :label="metric.label" :text="metric.hint" /></span>
        <strong>{{ metric.value }}</strong>
      </button>
    </div>
    <div v-if="error" class="usage-read-error" role="alert">
      {{ error }}<button class="text-button" @click="reload">重试</button>
    </div>
    <template v-if="!daily">
      <div class="usage-expand-line">
        <button
          class="usage-expand-button"
          :aria-label="expanded ? '收起用量热力图' : '展开用量热力图'"
          :aria-expanded="expanded"
          @click="
            expanded = !expanded;
            tooltip = null;
          "
        >
          <BoostIcon
            :name="expanded ? 'chevron-up' : 'chevron-down'"
            :size="16"
          />
        </button>
      </div>
      <div v-if="expanded && !error" class="usage-history-content">
        <h3 class="usage-heatmap-title">用量热力图</h3>
        <p v-if="loading && !history" class="muted" role="status">正在读取…</p>
        <template v-if="timeline && visibleRange">
          <div class="usage-range-summary" aria-live="polite">
            <strong>{{ visibleRange.start }} — {{ visibleRange.end }}</strong>
            <span
              >{{ compactTokens(visibleRange.usage.totalTokens) }} Tokens ·
              {{ fullNumber(visibleRange.usage.requestCount) }} 次请求 ·
              {{ usd(visibleRange.usage.estimatedCostUsd) }}</span
            >
          </div>
          <div class="usage-calendar" :style="{ '--usage-step': `${step}px` }">
            <div class="usage-weekdays" aria-hidden="true">
              <span>周一</span><span></span><span>周三</span><span></span
              ><span>周五</span><span></span><span>周日</span>
            </div>
            <div
              ref="calendarScroller"
              class="usage-calendar-scroll"
              role="region"
              aria-label="用量时间轴"
              tabindex="0"
              @scroll="calendarScrolled"
              @wheel="calendarWheel"
              @pointerdown="startDrag"
              @pointermove="moveDrag"
              @pointerup="endDrag"
              @pointercancel="endDrag"
              @lostpointercapture="endDrag"
            >
              <div
                class="usage-timeline"
                :style="{
                  width: `${timeline.weeks * step - 2}px`,
                  '--usage-weeks': timeline.weeks,
                }"
              >
                <div class="usage-months">
                  <span
                    v-for="month in timeline.months"
                    :key="month.column"
                    :style="{ gridColumn: month.column }"
                    >{{ month.label }}</span
                  >
                </div>
                <div
                  class="usage-cells"
                  role="group"
                  aria-label="每日用量，使用方向键浏览"
                >
                  <button
                    v-for="cell in timeline.cells"
                    :key="cell.day"
                    class="usage-cell"
                    :class="{ 'future-day': cell.future }"
                    :data-level="cell.level"
                    :data-day="cell.day"
                    :disabled="cell.future"
                    :aria-label="cellLabel(cell)"
                    :tabindex="cell.day === timeline.end ? 0 : -1"
                    @mouseenter="showDay($event, cell)"
                    @mouseleave="tooltip = null"
                    @focus="showDay($event, cell)"
                    @blur="tooltip = null"
                    @keydown="moveCell"
                    @click="showDay($event, cell)"
                  ></button>
                </div>
              </div>
            </div>
          </div>
          <div class="usage-heatmap-footer">
            <div class="usage-color-legend" aria-label="用量颜色从少到多">
              <span>少</span
              ><i
                v-for="level in [0, 1, 2, 3, 4]"
                :key="level"
                class="usage-cell"
                :data-level="level"
              ></i
              ><span>多</span>
            </div>
          </div>
        </template>
      </div>
    </template>
    <Teleport to="body"
      ><div
        v-if="tooltip && !daily && expanded"
        class="usage-day-tooltip"
        role="tooltip"
        :style="{ left: `${tooltip.left}px`, top: `${tooltip.top}px` }"
      >
        <strong>{{ tooltip.day }}</strong>
        <div>
          <span>请求数</span><b>{{ fullNumber(tooltip.usage.requestCount) }}</b>
        </div>
        <div>
          <span>消耗 Tokens</span
          ><b>{{ fullNumber(tooltip.usage.totalTokens) }}</b>
        </div>
        <div>
          <span>成本（USD）</span
          ><b>{{ usd(tooltip.usage.estimatedCostUsd) }}</b>
        </div>
        <div>
          <span>缓存命中率</span><b>{{ cacheHitRate(tooltip.usage) }}</b>
        </div>
      </div></Teleport
    >
  </section>
</template>
<style scoped>
.usage-overview {
  --heat-0: var(--surface);
  --heat-1: #17472c;
  --heat-2: #216b3b;
  --heat-3: #2e974f;
  --heat-4: #4ade80;
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: 12px;
  min-width: 0;
  position: relative;
  margin-bottom: 22px;
}
:global(:root[data-theme="light"] .usage-overview) {
  --heat-0: #eeeff1;
  --heat-1: #c4eacb;
  --heat-2: #86ce98;
  --heat-3: #47aa65;
  --heat-4: #17803d;
}
.daily-usage-overview {
  margin-bottom: 0;
}
.usage-summary-row {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
}
.usage-summary-metric {
  border: 0;
  border-radius: 0;
  background: transparent;
  text-align: left;
  padding: 20px 22px 21px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 9px;
  min-width: 0;
  position: relative;
  color: var(--muted);
}
.usage-summary-metric:hover {
  background: color-mix(in srgb, var(--hover) 35%, transparent);
}
.usage-summary-metric.selected {
  color: var(--text);
}
.usage-summary-metric.selected:after {
  content: "";
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  height: 2px;
  background: var(--text);
}
.usage-summary-label {
  font-size: calc(14px * var(--font-scale));
  display: flex;
  align-items: center;
  gap: 7px;
  white-space: nowrap;
}
.usage-summary-metric strong {
  font-size: clamp(24px, 2.5vw, 34px);
  font-weight: 600;
  line-height: 1.2;
  letter-spacing: -0.6px;
  font-variant-numeric: tabular-nums;
  max-width: 100%;
  overflow-wrap: anywhere;
}
.usage-expand-line {
  border-top: 1px solid var(--border);
  height: 0;
  position: relative;
  z-index: 1;
}
.usage-expand-button {
  position: absolute;
  left: 50%;
  top: 0;
  transform: translate(-50%, -50%);
  width: 27px;
  height: 27px;
  border: 1px solid var(--border);
  border-radius: 50%;
  display: grid;
  place-items: center;
  padding: 0;
  background: var(--card);
  color: var(--muted);
}
.usage-history-content {
  padding: 25px 22px 17px;
  min-width: 0;
}
.usage-heatmap-title {
  font-size: calc(15px * var(--font-scale));
  font-weight: 600;
  margin: 0 0 15px;
}
.usage-range-summary {
  display: flex;
  gap: 14px;
  align-items: baseline;
  flex-wrap: wrap;
  font-size: calc(13px * var(--font-scale));
  margin-bottom: 12px;
}
.usage-range-summary strong {
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.usage-range-summary span {
  color: var(--muted);
}
.usage-calendar-scroll {
  overflow-x: auto;
  overflow-y: hidden;
  scrollbar-width: none;
  -ms-overflow-style: none;
  min-width: 0;
  cursor: grab;
  touch-action: pan-x pan-y;
  user-select: none;
}
.usage-calendar-scroll::-webkit-scrollbar {
  display: none;
}
.usage-calendar-scroll:active {
  cursor: grabbing;
}
.usage-calendar {
  display: grid;
  grid-template-columns: 30px minmax(0, 1fr);
  column-gap: 9px;
  min-width: 0;
}
.usage-timeline {
  display: grid;
  grid-template-rows: 24px auto;
}
.usage-months {
  display: grid;
  grid-template-columns: repeat(var(--usage-weeks), minmax(0, 1fr));
  gap: 2px;
  color: var(--muted);
  font-size: calc(12px * var(--font-scale));
  line-height: 16px;
}
.usage-months span {
  white-space: nowrap;
  width: max-content;
}
.usage-weekdays {
  padding-top: 24px;
  display: grid;
  grid-template-rows: repeat(7, calc(var(--usage-step) - 2px));
  gap: 2px;
  font-size: calc(11px * var(--font-scale));
  color: var(--muted);
  align-items: center;
}
.usage-cells {
  display: grid;
  grid-template-rows: repeat(7, calc(var(--usage-step) - 2px));
  grid-auto-flow: column;
  grid-template-columns: repeat(var(--usage-weeks), minmax(0, 1fr));
  gap: 2px;
}
.usage-cell {
  display: block;
  aspect-ratio: 1;
  border: 0;
  border-radius: 3px;
  min-width: 0;
  min-height: 0;
  padding: 0;
  background: var(--heat-0);
  transition: background-color 0.15s;
}
button.usage-cell:hover,
button.usage-cell:focus-visible {
  outline: 2px solid var(--text);
  outline-offset: 1px;
  z-index: 1;
}
.usage-cell[data-level="1"] {
  background: var(--heat-1);
}
.usage-cell[data-level="2"] {
  background: var(--heat-2);
}
.usage-cell[data-level="3"] {
  background: var(--heat-3);
}
.usage-cell[data-level="4"] {
  background: var(--heat-4);
}
.usage-cell.future-day {
  visibility: hidden;
}
.usage-heatmap-footer {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  margin-top: 11px;
  gap: 15px;
  font-size: calc(12px * var(--font-scale));
}
.usage-color-legend {
  display: flex;
  align-items: center;
  gap: 5px;
  color: var(--muted);
  white-space: nowrap;
}
.usage-color-legend .usage-cell {
  width: 12px;
  height: 12px;
  flex-shrink: 0;
  border-radius: 2px;
}
.usage-color-legend span:first-child {
  margin-right: 3px;
}
.usage-color-legend span:last-child {
  margin-left: 3px;
}
.usage-read-error {
  padding: 12px 20px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 12px;
  color: var(--red);
  font-size: 13px;
}
.usage-day-tooltip {
  position: fixed;
  z-index: 10000;
  width: 248px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--dialog);
  box-shadow: var(--shadow);
  color: var(--text);
  padding: 13px 15px;
  pointer-events: none;
  font-size: 12px;
  line-height: 1.5;
}
.usage-day-tooltip > strong {
  display: block;
  margin-bottom: 8px;
  font-weight: 600;
}
.usage-day-tooltip > div {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  margin-top: 4px;
}
.usage-day-tooltip span {
  color: var(--muted);
}
.usage-day-tooltip b {
  font-weight: 500;
  font-variant-numeric: tabular-nums;
}
@media (max-width: 700px) {
  .usage-summary-row {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .usage-summary-metric {
    padding: 17px 16px;
  }
  .usage-summary-metric strong {
    font-size: 26px;
  }
  .usage-history-content {
    padding: 25px 16px 16px;
  }
  .usage-summary-label {
    font-size: 12px;
  }
  .usage-range-summary {
    gap: 6px;
  }
  .usage-heatmap-footer {
    align-items: flex-start;
  }
  .usage-history-heading p {
    max-width: 32em;
  }
}
</style>
