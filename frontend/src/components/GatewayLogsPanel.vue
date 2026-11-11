<script setup lang="ts">
import DialogActions from "@/components/DialogActions.vue";
import { onMounted, ref, watch } from "vue";
import type { GatewayErrorLogListResult, GatewayErrorLog } from "@/types";
import BoostIcon from "./BoostIcon.vue";
import EmptyState from "./EmptyState.vue";
import BoostDialog from "./BoostDialog.vue";
import { serviceClient } from "@/lib/api/service-client";
import {
  boost,
  formatTime,
  perform,
  notify,
  copyText,
} from "@/composables/useBoost";
const result = ref<GatewayErrorLogListResult>({
  items: [],
  total: 0,
  page: 1,
  pageSize: 20,
  stages: [],
});
const page = ref(1);
const stage = ref("all");
const busy = ref(false);
const confirming = ref(false);
const detail = ref<GatewayErrorLog | null>(null);
const query = ref("");
function accountName(id: string) {
  return boost.accounts.find((account) => account.id === id)?.name || id || "—";
}
function keyName(id: string) {
  return boost.keys.find((key) => key.id === id)?.name || id || "—";
}
let request = 0;
async function load() {
  const id = ++request;
  busy.value = true;
  await perform(async () => {
    const data = await serviceClient.listGatewayErrorLogs({
      page: page.value,
      pageSize: 20,
      stageFilter: stage.value,
    });
    if (id === request) result.value = data;
  });
  if (id === request) busy.value = false;
}
watch(stage, () => {
  page.value = 1;
  void load();
});
watch(page, () => void load());
onMounted(load);
async function clear() {
  busy.value = true;
  await perform(async () => {
    await serviceClient.clearGatewayErrorLogs();
    confirming.value = false;
    page.value = 1;
    await load();
    notify("网关日志已清空");
  });
  busy.value = false;
}
</script>
<template>
  <div>
    <div class="page-toolbar">
      <div class="toolbar-group">
        <span class="muted">{{ result.total }} 条</span
        ><select v-model="stage" aria-label="筛选网关日志阶段">
          <option value="all">全部阶段</option>
          <option v-for="s in result.stages" :key="s" :value="s">
            {{ s }}
          </option>
        </select>
      </div>
      <div class="toolbar-group">
        <button
          class="secondary"
          :disabled="busy || !result.total"
          @click="confirming = true"
        >
          清空日志</button
        ><button class="primary" :disabled="busy" @click="load">
          <BoostIcon name="rotate-ccw" :size="19" />刷新
        </button>
      </div>
    </div>
    <div class="search-field gateway-search">
      <BoostIcon name="search" :size="16" /><input
        v-model="query"
        aria-label="搜索当前页网关日志"
        placeholder="搜索当前页日志…"
      />
    </div>
    <div v-if="result.items.length" class="log-list gateway-log-list">
      <article
        v-for="(log, i) in result.items.filter(
          (log) =>
            !query ||
            [
              log.message,
              log.traceId,
              log.upstreamUrl,
              log.accountId,
              log.requestPath,
            ].some((value) =>
              value.toLowerCase().includes(query.toLowerCase()),
            ),
        )"
        :key="log.traceId + i"
        class="log-row gateway-log-row"
        tabindex="0"
        role="button"
        :aria-label="'查看网关日志 ' + log.traceId"
        @click="detail = log"
        @keydown.enter="detail = log"
      >
        <div class="log-row-header">
          <span class="muted">{{ formatTime(log.createdAt) }}</span
          ><span class="badge error">{{ log.statusCode || log.errorKind }}</span
          ><span class="muted">{{ log.stage }}</span>
        </div>
        <p class="log-row-message">{{ log.message }}</p>
        <div class="gateway-log-meta">
          <span
            ><code>{{ log.method }}</code> {{ log.requestPath }}</span
          ><span>账号 {{ accountName(log.accountId) }}</span
          ><span>密钥 {{ keyName(log.keyId) }}</span
          ><span v-if="log.errorKind">{{ log.errorKind }}</span>
        </div>
        <div class="gateway-log-upstream">
          <span
            v-if="log.upstreamUrl"
            class="truncate"
            :title="log.upstreamUrl"
            >{{ log.upstreamUrl }}</span
          ><code v-if="log.traceId">{{ log.traceId }}</code
          ><button
            class="icon-button"
            :aria-label="'复制追踪 ID ' + log.traceId"
            :disabled="!log.traceId"
            @click.stop="perform(() => copyText(log.traceId))"
          >
            <BoostIcon name="copy" :size="15" />
          </button>
        </div>
      </article>
    </div>
    <EmptyState
      v-else
      icon="scroll-text"
      :title="busy ? '读取中…' : '暂无网关日志'"
    />
    <div class="pagination">
      <span>{{ page }} / {{ Math.max(1, Math.ceil(result.total / 20)) }}</span
      ><button
        class="icon-button"
        aria-label="上一页"
        :disabled="page <= 1 || busy"
        @click="page--"
      >
        <BoostIcon name="chevron-left" /></button
      ><button
        class="icon-button"
        aria-label="下一页"
        :disabled="page * 20 >= result.total || busy"
        @click="page++"
      >
        <BoostIcon name="chevron-right" />
      </button>
    </div>
    <BoostDialog v-if="detail" title="网关日志详情" wide @close="detail = null"
      ><div class="gateway-detail">
        <div
          v-for="(value, label) in {
            时间: formatTime(detail.createdAt),
            请求: detail.method + ' ' + detail.requestPath,
            阶段: detail.stage,
            状态码: detail.statusCode ?? '—',
            错误类型: detail.errorKind || '—',
            账号: accountName(detail.accountId),
            平台密钥: keyName(detail.keyId),
            '追踪 ID': detail.traceId || '—',
            上游地址: detail.upstreamUrl || '—',
            'Cloudflare Ray': detail.cfRay || '—',
            请求压缩: detail.compressionEnabled ? '已开启' : '未开启',
            压缩重试: detail.compressionRetryAttempted ? '已尝试' : '未尝试',
          }"
          :key="label"
        >
          <span>{{ label }}</span
          ><code>{{ value }}</code>
        </div>
      </div>
      <div class="gateway-message">
        <h3>错误信息</h3>
        <p>{{ detail.message }}</p>
      </div>
      <template #footer
        ><button
          class="secondary"
          @click="perform(() => copyText(JSON.stringify(detail, null, 2)))"
        >
          <BoostIcon name="copy" :size="16" />复制详情</button
        ><button class="primary" @click="detail = null">关闭</button></template
      ></BoostDialog
    >
    <BoostDialog
      v-if="confirming"
      title="清空网关日志"
      @close="!busy && (confirming = false)"
      ><p>确认移除所有网关错误日志？</p>
      <DialogActions>
        <button class="secondary" :disabled="busy" @click="confirming = false">
          取消</button
        ><button class="danger-button" :disabled="busy" @click="clear">
          清空
        </button>
      </DialogActions></BoostDialog
    >
  </div>
</template>
