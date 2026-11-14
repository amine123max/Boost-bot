<script setup lang="ts">
import DialogActions from "@/components/DialogActions.vue";
import {
  computed,
  ref,
  watch,
  onActivated,
  onDeactivated,
  onBeforeUnmount,
} from "vue";
import type { RequestLogListResult } from "@/types";
import BoostIcon from "@/components/BoostIcon.vue";
import EmptyState from "@/components/EmptyState.vue";
import BoostDialog from "@/components/BoostDialog.vue";
import GatewayLogsPanel from "@/components/GatewayLogsPanel.vue";
import RequestLogTable from "@/components/RequestLogTable.vue";
import ModelLabel from "@/components/ModelLabel.vue";
import {
  boost,
  formatNumber,
  formatTime,
  isAdmin,
  notify,
  perform,
} from "@/composables/useBoost";
import { serviceClient } from "@/lib/api/service-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import {
  formatRequestLatency,
  formatOutputTokensPerSecond,
} from "@/lib/utils/request-latency";
const query = ref("");
const mode = ref("requests");
const filter = ref("all");
const page = ref(1);
const pageSize = ref(20),
  startTime = ref(""),
  endTime = ref("");
const busy = ref(false);
const clearingBusy = ref(false);
const error = ref("");
const result = ref<RequestLogListResult>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
});
const paused = ref(false);
const ascending = ref(false);
const visibleLogs = computed(() =>
  [...result.value.items].sort((a, b) =>
    ascending.value
      ? (a.createdAt || 0) - (b.createdAt || 0)
      : (b.createdAt || 0) - (a.createdAt || 0),
  ),
);
let refreshTimer: ReturnType<typeof setInterval> | undefined;
const clearing = ref(false);
const detail = ref<RequestLogListResult["items"][number] | null>(null);
let request = 0;
let timer: ReturnType<typeof setTimeout> | undefined;
let active = false;
async function load() {
  const current = ++request;
  busy.value = true;
  error.value = "";
  try {
    if (
      startTime.value &&
      endTime.value &&
      new Date(startTime.value).getTime() > new Date(endTime.value).getTime()
    )
      throw new Error("开始时间不能晚于结束时间");
    const data = await serviceClient.listRequestLogs({
      query: query.value,
      statusFilter: filter.value,
      page: page.value,
      pageSize: pageSize.value,
      startTs: startTime.value
        ? Math.floor(new Date(startTime.value).getTime() / 1000)
        : null,
      endTs: endTime.value
        ? Math.floor(new Date(endTime.value).getTime() / 1000)
        : null,
    });
    if (current === request) result.value = data;
  } catch (e) {
    if (current === request) {
      error.value = getAppErrorMessage(e);
      notify(error.value, true);
    }
  } finally {
    if (current === request) busy.value = false;
  }
}
watch([query, filter, pageSize, startTime, endTime], () => {
  page.value = 1;
  clearTimeout(timer);
  if (active) timer = setTimeout(load, 300);
});
watch(page, () => {
  if (active) void load();
});
onActivated(() => {
  active = true;
  void load();
  refreshTimer = setInterval(() => {
    if (
      mode.value === "requests" &&
      !paused.value &&
      !busy.value &&
      page.value === 1 &&
      document.visibilityState === "visible"
    )
      void load();
  }, 5000);
});
onDeactivated(() => {
  active = false;
  clearInterval(refreshTimer);
  clearTimeout(timer);
  request++;
  busy.value = false;
});
onBeforeUnmount(() => {
  clearTimeout(timer);
  clearInterval(refreshTimer);
});
async function clear() {
  if (clearingBusy.value) return;
  clearingBusy.value = true;
  await perform(async () => {
    await serviceClient.clearRequestLogs();
    clearing.value = false;
    page.value = 1;
    await load();
    notify("请求日志已清空");
  });
  clearingBusy.value = false;
}
</script>
<template>
  <div>
    <div v-spring-switch class="tabs">
      <button
        :class="{ selected: mode === 'requests' }"
        @click="mode = 'requests'"
      >
        请求日志</button
      ><button
        v-if="isAdmin"
        :class="{ selected: mode === 'gateway' }"
        @click="mode = 'gateway'"
      >
        网关日志
      </button>
    </div>
    <GatewayLogsPanel v-if="mode === 'gateway' && isAdmin" /><template v-else>
      <div class="page-toolbar">
        <div class="toolbar-group">
          <span class="eyebrow">REQUEST LOGS</span
          ><span class="badge">{{ formatNumber(result.total) }} 条记录</span>
        </div>
        <div class="toolbar-group">
          <button
            class="icon-button"
            :aria-label="paused ? '继续刷新' : '暂停刷新'"
            :aria-pressed="paused"
            @click="paused = !paused"
          >
            <BoostIcon
              :name="paused ? 'rotate-ccw' : 'square'"
              :size="17"
            /></button
          ><button
            class="icon-button"
            aria-label="切换时间排序"
            :aria-pressed="ascending"
            @click="ascending = !ascending"
          >
            <BoostIcon name="chevrons-up-down" :size="18" /></button
          ><button
            v-if="isAdmin"
            class="secondary"
            :disabled="clearingBusy || !result.total"
            @click="clearing = true"
          >
            <BoostIcon name="trash-2" :size="14" />清空日志</button
          ><button class="primary" :disabled="busy" @click="load">
            <BoostIcon
              name="rotate-ccw"
              :size="15"
              :class="{ spinning: busy }"
            />刷新
          </button>
        </div>
      </div>
      <div class="filter-toolbar">
        <div class="search-field">
          <BoostIcon name="search" :size="16" /><input
            v-model="query"
            aria-label="搜索日志"
            placeholder="搜索模型、路径、账号…"
          />
        </div>
        <select v-model="filter" aria-label="筛选请求状态">
          <option value="all">全部请求</option>
          <option value="2xx">成功 2xx</option>
          <option value="4xx">错误 4xx</option>
          <option value="5xx">错误 5xx</option>
        </select>
        <label class="log-date-filter"
          >开始<input
            v-model="startTime"
            type="datetime-local"
            aria-label="日志开始时间" /></label
        ><label class="log-date-filter"
          >结束<input
            v-model="endTime"
            type="datetime-local"
            aria-label="日志结束时间"
        /></label>
      </div>
      <div v-if="result.items.length" class="log-list">
        <RequestLogTable :logs="visibleLogs" @detail="detail = $event" />
        <div class="pagination">
          <select v-model.number="pageSize" aria-label="每页日志条数">
            <option :value="10">10 条 / 页</option>
            <option :value="20">20 条 / 页</option>
            <option :value="50">50 条 / 页</option>
            <option :value="100">100 条 / 页</option></select
          ><span>{{ result.total }} 条</span
          ><button
            class="icon-button"
            aria-label="上一页"
            :disabled="page <= 1 || busy"
            @click="page--"
          >
            <BoostIcon name="chevron-left" :size="16" /></button
          ><span
            >{{ page }} /
            {{ Math.max(1, Math.ceil(result.total / pageSize)) }}</span
          ><button
            class="icon-button"
            aria-label="下一页"
            :disabled="page * pageSize >= result.total || busy"
            @click="page++"
          >
            <BoostIcon name="chevron-right" :size="16" />
          </button>
        </div>
      </div>
      <EmptyState
        v-else
        class="compact-empty"
        icon="menu"
        :title="
          busy
            ? '读取中…'
            : query || filter !== 'all'
              ? '没有匹配的请求'
              : '暂无日志'
        "
      />
      <BoostDialog
        v-if="clearing"
        title="清空请求日志"
        :busy="clearingBusy" @close="!clearingBusy && (clearing = false)"
        ><p style="line-height: 1.8; margin-bottom: 20px">
          确认清空请求日志？已保存的请求记录将被移除。
        </p>
        <DialogActions>
          <button data-dialog-close class="secondary" :disabled="clearingBusy" @click="clearing = false">
            取消</button
          ><button class="danger-button" :disabled="clearingBusy" @click="clear">
            清空日志
          </button>
        </DialogActions></BoostDialog
      >
      <BoostDialog v-if="detail" title="请求详情" wide @close="detail = null"
        ><div class="form-stack request-detail">
          <div
            v-for="(value, key) in {
              '追踪 ID': detail.traceId,
              时间: formatTime(detail.createdAt),
              状态: detail.statusCode,
              方法: detail.method,
              账号: detail.accountId,
              平台密钥: detail.keyId,
              模型: detail.model,
              推理等级: detail.reasoningEffort,
              服务档位: detail.effectiveServiceTier || detail.serviceTier,
              首字时间: formatRequestLatency(detail.firstResponseMs),
              总耗时: formatRequestLatency(detail.durationMs),
              输出速度: formatOutputTokensPerSecond(
                detail.outputTokens,
                detail.durationMs,
              ),
              输入Token: formatNumber(detail.inputTokens || 0),
              缓存Token: formatNumber(detail.cachedInputTokens || 0),
              输出Token: formatNumber(detail.outputTokens || 0),
              总Token: formatNumber(detail.totalTokens || 0),
              请求路径: detail.requestPath,
              上游模型: detail.upstreamModel,
              响应适配: detail.responseAdapter,
              上游地址: detail.upstreamUrl,
              预估费用:
                detail.estimatedCostUsd == null
                  ? '—'
                  : '$' + detail.estimatedCostUsd.toFixed(6),
              错误: detail.error,
            }"
            :key="key"
            class="form-field"
          >
            <span class="muted">{{ key }}</span
            ><ModelLabel v-if="key === '模型' || key === '上游模型'" :model="String(value || '')" /><code v-else>{{ value ?? "—" }}</code>
          </div>
        </div></BoostDialog
      >
    </template>
  </div>
</template>
