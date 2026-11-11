<script setup lang="ts">
import type { ProxyNode } from "@/lib/api/proxy-client";
import { formatTime } from "@/composables/useBoost";
import BoostIcon from "./BoostIcon.vue";
import CountryFlag from "./CountryFlag.vue";
const props = defineProps<{
  node: ProxyNode;
  blocked: boolean;
  manual: boolean;
}>();
const emit = defineEmits<{ choose: []; test: []; remove: [] }>();
function choose(event: Event) {
  if (props.blocked || (props.manual && props.node.selected)) return;
  if (event.target instanceof Element && event.target.closest("button")) return;
  emit("choose");
}
function metric(value: number | null | undefined, suffix: string, digits = 0) {
  return value == null || !Number.isFinite(value)
    ? "—"
    : `${value.toFixed(digits)} ${suffix}`;
}
function state() {
  if (props.node.measurement.state === "running") return "测速中";
  if (props.node.measurement.state === "failed") return "不可用";
  if (props.node.measurement.state === "pending") return "等待测速";
  if (props.node.measurement.state === "cancelled") return "已取消";
  return props.node.latencyMs === null
    ? "未测速"
    : metric(props.node.latencyMs, "ms");
}
</script>
<template>
  <article
    class="node-test-card"
    :class="{
      selected: node.selected,
      unavailable: node.measurement.state === 'failed',
    }"
    :tabindex="blocked ? -1 : 0"
    :aria-disabled="blocked"
    :aria-label="`${node.name}，双击固定此节点`"
    aria-describedby="node-selection-help"
    @dblclick="choose"
    @keydown.enter.self.prevent="choose"
    @keydown.space.self.prevent="choose"
  >
    <div class="node-card-heading">
      <div class="node-heading-text">
        <CountryFlag :code="node.countryCode" :country="node.country" />
        <h3 :title="node.name">{{ node.name }}</h3>
      </div>
      <button
        type="button"
        class="node-refresh"
        :aria-label="`测速 ${node.name}`"
        :disabled="blocked"
        @click.stop="emit('test')"
        @dblclick.stop
      >
        <BoostIcon
          :name="
            node.measurement.state === 'running'
              ? 'loader-circle'
              : 'rotate-ccw'
          "
          :class="{ spinning: node.measurement.state === 'running' }"
          :size="22"
        />
      </button>
    </div>
    <div class="node-badge-row">
      <span
        class="node-latency"
        :class="{
          success:
            node.latencyMs !== null &&
            !['running', 'failed', 'pending', 'cancelled'].includes(
              node.measurement.state,
            ),
          error: node.measurement.state === 'failed',
        }"
        ><BoostIcon
          :name="
            node.measurement.state === 'failed'
              ? 'circle-x'
              : node.measurement.state === 'running'
                ? 'loader-circle'
                : node.latencyMs === null
                  ? 'ellipsis'
                  : 'circle-check'
          "
          :class="{ spinning: node.measurement.state === 'running' }"
          :size="17"
        />{{ state() }}</span
      ><span v-if="node.selected" class="node-active"
        ><BoostIcon name="check" :size="12" />{{
          manual ? "已固定" : "当前出口"
        }}</span
      >
    </div>
    <p v-if="node.measurement.error" class="node-error">
      {{ node.measurement.error }}
    </p>
    <details class="node-details" @dblclick.stop @keydown.stop>
      <summary :aria-label="`${node.name} 的测速详情`">测速详情</summary>
      <div>
        <span
          >{{ node.country }} · {{ node.protocol.toUpperCase()
          }}{{ node.countrySource === "label" ? " · 地区待验证" : "" }}</span
        ><span>下载 {{ metric(node.measurement.downloadMbps, "Mbps", 1) }}</span
        ><span
          >抖动 {{ metric(node.measurement.jitterMs, "ms", 1) }} · 丢包
          {{ metric(node.measurement.lossPercent, "%") }}</span
        ><button
          type="button"
          class="text-button"
          :aria-label="`删除 ${node.name}`"
          :disabled="blocked"
          @click.stop="emit('remove')"
          @dblclick.stop
        >
          <BoostIcon name="trash-2" :size="13" />删除节点
        </button>
      </div>
    </details>
    <footer class="node-card-footer">
      <time>{{
        node.measurement.testedAt
          ? formatTime(node.measurement.testedAt)
          : "尚未完成测速"
      }}</time>
    </footer>
  </article>
</template>
<style scoped>
.node-test-card {
  min-width: 0;
  background: var(--surface);
  border: 1px solid transparent;
  border-radius: 10px;
  padding: 18px 16px 8px;
  display: flex;
  flex-direction: column;
  gap: 10px;
  cursor: default;
  transition:
    border-color 0.18s,
    background 0.18s;
}
.node-test-card:hover {
  border-color: color-mix(in srgb, var(--muted) 55%, var(--border));
}
.node-test-card:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 3px;
}
.node-test-card.selected {
  border-color: color-mix(in srgb, var(--blue) 65%, var(--border));
}
.node-card-heading {
  display: flex;
  align-items: center;
  gap: 10px;
}
.node-card-heading :deep(.country-flag) {
  width: 24px;
  height: 18px;
  border-radius: 2px;
}
.node-heading-text {
  flex: 1;
  min-width: 0;
  display: flex;
  align-items: center;
  gap: 9px;
}
.node-heading-text h3 {
  margin: 0;
  font-size: 16px;
  font-weight: 700;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.node-heading-text > span {
  display: flex;
  align-items: center;
  gap: 7px;
  color: var(--muted);
  font-size: 10px;
}
.node-protocol {
  font-size: 9px;
  letter-spacing: 0.5px;
  opacity: 0.75;
}
.node-refresh {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
  padding: 0;
  width: 40px;
  height: 40px;
  border-radius: 50%;
  border: 1px solid color-mix(in srgb, var(--blue) 55%, transparent);
  color: var(--blue);
  background: transparent;
  cursor: pointer;
}
.node-refresh:hover {
  background: var(--blue-soft);
}
.node-badge-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
}
.node-latency {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  border-radius: 20px;
  padding: 4px 9px;
  font-size: 14px;
  font-weight: 700;
  color: var(--muted);
  background: var(--hover);
  font-variant-numeric: tabular-nums;
}
.node-latency.success {
  background: var(--green);
  color: var(--on-primary);
}
.node-latency.error {
  background: var(--red);
  color: var(--on-primary);
}
.node-details {
  color: var(--muted);
  font-size: 10px;
}
.node-details summary {
  cursor: pointer;
  width: max-content;
}
.node-details > div {
  display: grid;
  gap: 8px;
  padding-top: 9px;
}
.node-details .text-button {
  justify-self: start;
  font-size: 10px;
  color: var(--red);
}
.node-metrics {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.node-metrics > div {
  display: grid;
  gap: 7px;
}
.node-metrics span {
  font-size: 10px;
  color: var(--muted);
}
.node-metrics strong {
  font-size: 19px;
  font-weight: 500;
  font-variant-numeric: tabular-nums;
  letter-spacing: -0.4px;
}
.node-quality {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 6px;
  flex-wrap: wrap;
  color: var(--muted);
  font-size: 10px;
}
.quality-divider {
  margin: 0 6px;
  opacity: 0.5;
}
.node-state {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.node-state i {
  width: 5px;
  height: 5px;
  border-radius: 50%;
  background: var(--muted);
}
.node-state.success i {
  background: var(--green);
}
.node-state.error,
.node-error {
  color: var(--red);
}
.node-state.error i {
  background: var(--red);
}
.node-error {
  margin: -6px 0 0;
  font-size: 10px;
}
.node-card-footer {
  display: flex;
  justify-content: flex-end;
  min-height: 23px;
  padding-top: 7px;
  margin-top: 3px;
  border-top: 1px dashed color-mix(in srgb, var(--muted) 25%, transparent);
}
.node-card-footer time {
  font-size: 11px;
  color: var(--muted);
  text-align: right;
}
.node-active {
  display: inline-flex;
  align-items: center;
  gap: 4px;
  color: var(--blue);
  font-size: 10px;
  white-space: nowrap;
}
.node-remove {
  opacity: 0;
  padding: 4px;
  color: var(--muted);
}
.node-test-card:hover .node-remove,
.node-test-card:focus-within .node-remove {
  opacity: 1;
}
@media (hover: none) {
  .node-remove {
    opacity: 1;
  }
}
</style>
