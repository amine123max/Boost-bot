<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import HelpHint from "./HelpHint.vue";
import { boost, notify, perform } from "@/composables/useBoost";
import { appClient } from "@/lib/api/app-client";
import { telemetryClient, type ServiceTelemetry } from "@/lib/api/telemetry-client";
import type { GatewayResourceLimits } from "@/types/settings";

const english = computed(() => boost.settings?.locale?.startsWith("en"));
const saving = ref(false);
const emit = defineEmits<{ busy: [value: boolean] }>();
const refreshing = ref(false);
const telemetry = ref<ServiceTelemetry | null>(null);
const form = reactive<GatewayResourceLimits>({ globalQps: 20, burst: 20, keyRpm: 0,
  maxInflight: 24, modelMaxInflight: 8, maxRequestBodyBytes: 33554432,
  bufferedBodyBudgetBytes: 67108864 });
const fields = computed(() => [
  { key: "globalQps", label: english.value ? "Global QPS" : "全局 QPS", hint: english.value ? "Requests per second for this process. 0 disables this rate limit." : "当前进程每秒请求数；0 关闭此速率限制。", min: 0, max: 100000 },
  { key: "burst", label: english.value ? "Burst requests" : "突发请求数", hint: english.value ? "Maximum token-bucket burst capacity." : "令牌桶允许的最大突发请求数。", min: 1, max: 100000 },
  { key: "keyRpm", label: english.value ? "Per-key RPM" : "每密钥 RPM", hint: english.value ? "Requests per minute per API key. 0 disables this rate limit." : "每个 API 密钥每分钟请求数；0 关闭此速率限制。", min: 0, max: 1000000 },
  { key: "maxInflight", label: english.value ? "Global concurrency" : "全局并发", hint: english.value ? "Includes active streams; effective capacity also reserves storage connections for management." : "包含尚未结束的流式请求；实际名额同时受存储连接预留约束。", min: 1, max: 512 },
  { key: "modelMaxInflight", label: english.value ? "Per-model concurrency" : "每模型并发", hint: english.value ? "Concurrent requests per model, subject to the global cap." : "每个模型同时处理的请求数，同时受全局并发上限约束。", min: 1, max: 512 },
  { key: "maxRequestBodyBytes", label: english.value ? "Request body limit" : "请求体上限", hint: english.value ? "Bytes per request; 1 MiB = 1,048,576 bytes." : "单请求字节数；1 MiB = 1,048,576 字节。", min: 1024, max: 268435456 },
  { key: "bufferedBodyBudgetBytes", label: english.value ? "Body buffer budget" : "缓冲预算", hint: english.value ? "Total reserved request-body bytes for this process." : "当前进程请求体缓冲预留的总字节数。", min: 1024, max: 1073741824 },
] as const);
watch(() => boost.settings?.resourceLimits, value => {
  if (value) Object.assign(form, value);
}, { immediate: true });

async function save() {
  saving.value = true;
  emit("busy", true);
  try {
    await perform(async () => {
      boost.settings = await appClient.setSettings({ resourceLimits: { ...form } });
      notify(english.value ? "Resource limits saved" : "资源限制已保存");
    });
  } finally { saving.value = false; emit("busy", false); }
}
async function refresh() {
  refreshing.value = true;
  try { await perform(async () => { telemetry.value = await telemetryClient.read(); }); }
  finally { refreshing.value = false; }
}
</script>

<template>
  <div v-if="boost.settings?.resourceLimits" class="gateway-settings">
    <form class="form-stack" @submit.prevent="save">
      <div v-for="field in fields" :key="field.key" class="setting-row">
        <span><label :for="`gateway-${field.key}`">{{ field.label }}</label><HelpHint icon="circle-alert" :label="field.label" :text="field.hint" /></span>
        <input :id="`gateway-${field.key}`" v-model.number="form[field.key]" type="number" :min="field.min" :max="field.max" step="1" required :disabled="saving" />
      </div>
      <div class="resource-actions">
        <HelpHint icon="circle-alert" :label="english ? 'Gateway limits' : '网关限制'" :text="english ? 'Limits apply to this service process. Temporary overload returns 429; streams hold capacity until completion.' : '限制作用于当前服务进程。临时过载返回 429；流式请求在结束后释放名额。'" />
        <button type="button" class="secondary" :disabled="refreshing" @click="refresh">{{ english ? 'Refresh queue status' : '刷新队列状态' }}</button>
        <button type="submit" class="primary" :disabled="saving">{{ english ? 'Save limits' : '保存限制' }}</button>
      </div>
    </form>
    <dl v-if="telemetry?.managementQueue" class="resource-status" aria-live="polite">
      <dt>{{ english ? 'Executing writes / reads' : '执行中的写 / 读' }}</dt>
      <dd>{{ telemetry.managementQueue.activeWrites }} / {{ telemetry.managementQueue.activeReads }}</dd>
      <dt>{{ english ? 'Waiting writes' : '等待中的写请求' }}</dt><dd>{{ telemetry.managementQueue.waitingWrites }}</dd>
      <dt>{{ english ? 'Rejected / timed out' : '容量拒绝 / 排队超时' }}</dt>
      <dd>{{ telemetry.managementQueue.rejectedTotal }} / {{ telemetry.managementQueue.timedOutTotal }}</dd>
    </dl>
  </div>
</template>

<style scoped>
.gateway-settings { font-size: 16px; font-weight: var(--ui-body-weight); }
.gateway-settings .form-stack { gap: 6px; }
.gateway-settings .setting-row { min-height: var(--boost-controls-height); font-size: inherit; gap: 12px; }
.setting-row > span { display: inline-flex; align-items: center; min-width: 0; }
.setting-row input[type="number"] {
  width: 152px;
  min-width: 120px;
  max-width: 48%;
  flex: 0 0 152px;
  height: var(--boost-controls-height);
  padding: 8px 12px;
  font: inherit;
}
.resource-actions { display: flex; align-items: center; justify-content: flex-end; gap: 10px; flex-wrap: wrap; margin-top: 6px; }
.resource-actions button { font: inherit; }
.resource-status { display: grid; grid-template-columns: 1fr auto; gap: 6px 16px; margin-top: var(--boost-section-gap); }
.resource-status dd { margin: 0; font-variant-numeric: tabular-nums; }
</style>
