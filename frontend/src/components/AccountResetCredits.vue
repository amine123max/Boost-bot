<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  ref,
  useId,
  watch,
} from "vue";
import type { Account } from "@/types";
import { readResetCreditExpiries } from "@/lib/account-reset-credits";
import BoostIcon from "./BoostIcon.vue";

const props = defineProps<{
  account: Account;
  busy: boolean;
  working: boolean;
}>();
const emit = defineEmits<{ refresh: [] }>();
const id = useId();
const trigger = ref<HTMLButtonElement>();
const panel = ref<HTMLDivElement>();
const open = ref(false);
const position = ref({ left: "0px", top: "0px" });
let closeTimer: ReturnType<typeof setTimeout> | undefined;
const expiries = computed(() => {
  const items = readResetCreditExpiries(props.account.usage?.creditsJson);
  return props.account.quotaResetAvailableCount == null
    ? items
    : items.slice(0, props.account.quotaResetAvailableCount);
});
const missingExpiries = computed(() =>
  Math.max(
    0,
    (props.account.quotaResetAvailableCount ?? 0) - expiries.value.length,
  ),
);
const dateFormat = new Intl.DateTimeFormat("zh-CN", {
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function cancelClose() {
  clearTimeout(closeTimer);
}
function close() {
  cancelClose();
  open.value = false;
  document.removeEventListener("keydown", escape);
  document.removeEventListener("focusin", onFocus);
  window.removeEventListener("resize", close);
  window.removeEventListener("scroll", onScroll, true);
}
function leave() {
  cancelClose();
  if (document.activeElement !== trigger.value)
    closeTimer = setTimeout(close, 100);
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape") close();
}
function onFocus(event: FocusEvent) {
  if (event.target !== trigger.value) close();
}
function onScroll(event: Event) {
  if (event.target instanceof Node && panel.value?.contains(event.target)) return;
  if (document.activeElement === trigger.value) void place();
  else close();
}
async function place() {
  await nextTick();
  if (!open.value || !trigger.value || !panel.value) return;
  const anchor = trigger.value.getBoundingClientRect();
  const box = panel.value.getBoundingClientRect();
  const width = document.documentElement.clientWidth;
  const height = document.documentElement.clientHeight;
  position.value = {
    left: `${Math.max(8, Math.min(anchor.left, width - box.width - 8))}px`,
    top: `${
      anchor.bottom + box.height + 6 <= height - 8
        ? anchor.bottom + 6
        : Math.max(8, anchor.top - box.height - 6)
    }px`,
  };
}
function show() {
  cancelClose();
  open.value = true;
  document.addEventListener("keydown", escape);
  document.addEventListener("focusin", onFocus);
  window.addEventListener("resize", close);
  window.addEventListener("scroll", onScroll, true);
  void place();
}
watch(
  () => [
    props.account.quotaResetAvailableCount,
    props.account.usage?.creditsJson,
  ],
  () => {
    if (open.value) void place();
  },
);
onBeforeUnmount(close);
onDeactivated(close);
</script>

<template>
  <span
    class="reset-credits-trigger"
    @pointerenter="show"
    @pointerleave="leave"
  >
    <button
      ref="trigger"
      type="button"
      class="text-button blue-text"
      :disabled="busy"
      :aria-label="`查询 ${account.name} 的重置次数`"
      :aria-describedby="open ? id : undefined"
      :aria-busy="working"
      @focus="show"
      @blur="leave"
      @click="emit('refresh')"
    >
      <BoostIcon
        name="rotate-ccw"
        :size="13"
        :class="{ spinning: working }"
      />次数
      {{ account.quotaResetAvailableCount ?? "—" }}
    </button>
  </span>
  <Teleport to="body">
    <div
      v-if="open"
      :id="id"
      ref="panel"
      role="tooltip"
      class="reset-credits-tooltip"
      :style="position"
      @pointerenter="cancelClose"
      @pointerleave="leave"
    >
      <strong
        >可用重置 · {{ account.quotaResetAvailableCount ?? "—" }} 次</strong
      >
      <template v-if="expiries.length">
        <span class="muted">到期时间</span>
        <ol>
          <li v-for="(expiry, index) in expiries" :key="index">
            <time
              v-if="expiry != null"
              :datetime="new Date(expiry).toISOString()"
              >{{ dateFormat.format(expiry) }}</time
            >
            <span v-else class="muted">时间未提供</span>
          </li>
        </ol>
        <span v-if="missingExpiries" class="muted"
          >另 {{ missingExpiries }} 次时间未提供</span
        >
      </template>
      <span v-else class="muted">{{
        account.quotaResetAvailableCount === 0
          ? "暂无可用重置"
          : account.quotaResetAvailableCount == null
            ? "点击次数查询"
            : "到期时间未提供，点击次数刷新"
      }}</span>
    </div>
  </Teleport>
</template>

<style scoped>
.reset-credits-trigger {
  display: inline-flex;
}
.reset-credits-tooltip {
  position: fixed;
  z-index: 1500;
  display: grid;
  gap: 6px;
  max-width: calc(100vw - 16px);
  max-height: calc(100vh - 16px);
  overflow: auto;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--card);
  color: var(--text);
  box-shadow: 0 4px 16px #0002;
  font-size: max(11px, calc(12px * var(--data-font-scale)));
  line-height: 1.5;
  font-variant-numeric: tabular-nums;
}
.reset-credits-tooltip strong {
  font-weight: 500;
}
.reset-credits-tooltip ol {
  margin: 0;
  padding-left: 20px;
}
.reset-credits-tooltip li::marker {
  color: var(--muted);
}
</style>
