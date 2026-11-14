<script setup lang="ts">
import type { RequestLog } from "@/types";
import { boost, formatTime, formatNumber } from "@/composables/useBoost";
import {
  durationSeverity,
  firstResponseSeverity,
  formatRequestLatency,
  formatOutputTokensPerSecond,
} from "@/lib/utils/request-latency";
import BoostIcon from "./BoostIcon.vue";
import ModelProviderIcon from "./ModelProviderIcon.vue";
import ModelLabel from "./ModelLabel.vue";
import { modelProviderLabel } from "../../../bot/shared/appearance/modelProvider";
defineProps<{ logs: RequestLog[] }>();
const emit = defineEmits<{ detail: [log: RequestLog] }>();
function source(log: RequestLog) {
  return (
    log.aggregateApiSupplierName ||
    boost.accounts.find((a) => a.id === (log.actualSourceId || log.accountId))
      ?.name ||
    log.accountId ||
    log.actualSourceId ||
    "—"
  );
}
function key(log: RequestLog) {
  return boost.keys.find((k) => k.id === log.keyId)?.name || log.keyId || "—";
}
const tokens = (value: number | null) =>
  value == null ? "—" : formatNumber(value);
function normalizeServiceTier(value: string | null | undefined) {
  const tier = String(value || "").trim().toLowerCase();
  if (!tier || tier === "auto") return "auto";
  return tier === "priority" ? "fast" : tier;
}
function displayedServiceTier(log: RequestLog) {
  const clientTier = normalizeServiceTier(log.serviceTier);
  const effectiveTier = normalizeServiceTier(
    log.effectiveServiceTier || log.serviceTier,
  );
  return effectiveTier !== "auto" ? effectiveTier : clientTier;
}
</script>
<template>
  <div class="bounded-table request-table-wrap">
    <table
      v-resizable-columns="[12, 18, 17, 16, 7, 12, 10, 8]"
      class="models-table request-log-table"
    >
      <thead>
        <tr>
          <th>时间</th>
          <th>类型 / 方法 / 路径</th>
          <th>账号 / 密钥</th>
          <th>模型 / 推理 / 等级</th>
          <th>状态</th>
          <th>延迟</th>
          <th>Token</th>
          <th>错误</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="log in logs"
          :key="log.id"
          class="request-log-row"
          tabindex="0"
          @click="emit('detail', log)"
          @keydown.enter="emit('detail', log)"
        >
          <td>
            <time class="request-time">{{ formatTime(log.createdAt) }}</time>
          </td>
          <td>
            <div class="request-method">
              <span class="badge">{{
                /ws|websocket/i.test(log.requestType) ? "WS" : "HTTP"
              }}</span
              ><span class="blue-text">{{ log.method || "—" }}</span>
            </div>
            <div
              class="request-path"
              :title="log.originalPath || log.requestPath || log.path"
            >
              {{ log.originalPath || log.requestPath || log.path || "—" }}
            </div>
            <div
              v-if="log.upstreamUrl || log.aggregateApiUrl"
              class="request-upstream"
              :title="log.upstreamUrl || log.aggregateApiUrl || ''"
            >
              ↗ {{ log.upstreamUrl || log.aggregateApiUrl }}
            </div>
          </td>
          <td>
            <div class="request-identity" :title="source(log)">
              <BoostIcon
                :name="
                  log.actualSourceKind === 'aggregate_api' ? 'network' : 'zap'
                "
                :size="14"
              /><span>{{ source(log) }}</span>
            </div>
            <div class="request-key" :title="key(log)">
              <BoostIcon name="key-round" :size="13" /><span>{{
                key(log)
              }}</span>
            </div>
          </td>
          <td>
            <button
              class="request-model-button"
              :aria-label="'查看请求日志 ' + log.id"
              @click.stop="emit('detail', log)"
            >
              <ModelProviderIcon :model="log.model || log.upstreamModel || undefined" />
              <span>{{ log.model || "—"
              }}<span v-if="log.reasoningEffort">
                / {{ log.reasoningEffort }}</span
              ></span>
            </button>
            <div class="request-tier">
              <span v-if="log.model" class="badge">{{ modelProviderLabel(log.model) }}</span>
              <span
                class="badge"
                :class="{ 'tier-fast': displayedServiceTier(log) === 'fast' }"
                >{{ displayedServiceTier(log) }}</span
              ><span
                v-if="log.upstreamModel && log.upstreamModel !== log.model"
                :title="log.upstreamModel"
                ><ModelLabel :model="log.upstreamModel" :show-provider="false" /></span
              >
            </div>
          </td>
          <td>
            <span
              class="badge"
              :class="
                log.statusCode && log.statusCode < 400 ? 'success' : 'error'
              "
              >{{ log.statusCode ?? "—" }}</span
            >
          </td>
          <td>
            <div class="request-latency">
              <div>
                <span>首字</span
                ><span
                  :class="
                    'latency-' + firstResponseSeverity(log.firstResponseMs)
                  "
                  >{{ formatRequestLatency(log.firstResponseMs) }}</span
                >
              </div>
              <div>
                <span>总耗时</span
                ><span :class="'latency-' + durationSeverity(log.durationMs)">{{
                  formatRequestLatency(log.durationMs)
                }}</span>
              </div>
              <div>
                <span>输出</span
                ><span>{{
                  formatOutputTokensPerSecond(log.outputTokens, log.durationMs)
                }}</span>
              </div>
            </div>
          </td>
          <td>
            <div class="request-token-lines">
              <span>总 {{ tokens(log.totalTokens) }}</span
              ><span>输入 {{ tokens(log.inputTokens) }}</span
              ><span>缓存 {{ tokens(log.cachedInputTokens) }}</span
              ><span class="green-text">{{
                log.estimatedCostUsd == null
                  ? "—"
                  : "$" + log.estimatedCostUsd.toFixed(4)
              }}</span>
            </div>
          </td>
          <td>
            <span
              class="request-error"
              :class="{ 'red-text': !!log.error }"
              :title="log.error"
              >{{ log.error || "—" }}</span
            >
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
