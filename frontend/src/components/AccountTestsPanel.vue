<script setup lang="ts">
import { computed, ref } from "vue";
import BoostIcon from "@/components/BoostIcon.vue";
import EmptyState from "@/components/EmptyState.vue";
import AccountNodeControl from "@/components/AccountNodeControl.vue";
import PanelCard from "@/components/PanelCard.vue";
import BoostMenu, { type MenuItem } from "@/components/BoostMenu.vue";
import {
  boost,
  eligibleAccounts,
  isAdmin,
  perform,
  selectAccount,
  notify,
  formatTime,
} from "@/composables/useBoost";
import { useAccountTests } from "@/composables/useAccountTests";
import { serviceClient } from "@/lib/api/service-client";
const {
  results,
  running,
  pendingSelection,
  completed,
  succeeded,
  testAll,
  isPending,
} = useAccountTests();
const query = ref("");
const strategyItems: MenuItem[] = [
  { value: "ordered", label: "顺序优先", icon: "arrow-down" },
  { value: "balanced", label: "均衡分配", icon: "chevrons-up-down" },
  { value: "quota_priority", label: "剩余额度最高", icon: "gauge" },
];
const strategyLabel = computed(() =>
  boost.selectedId
    ? "手动指定"
    : `自动 · ${strategyItems.find((item) => item.value === boost.settings?.routeStrategy)?.label || "顺序优先"}`,
);
const visibleAccounts = computed(() => {
  return eligibleAccounts.value.filter((a) =>
    `${a.name} ${a.planType}`.toLowerCase().includes(query.value.toLowerCase()),
  );
});
const stateLabels = {
  pending: "待检测",
  running: "检测中",
  success: "可用",
  failed: "不可用",
};
async function choose(id: string) {
  if (
    pendingSelection.value ||
    results[id]?.state !== "success"
  )
    return;
  pendingSelection.value = true;
  await perform(() => selectAccount(id));
  pendingSelection.value = false;
}
async function automatic(
  strategy = boost.settings?.routeStrategy || "ordered",
) {
  pendingSelection.value = true;
  await perform(async () => {
    const applied = await serviceClient.setRouteStrategy(strategy);
    if (applied.strategy !== strategy) throw new Error("自动选择策略未生效");
    if (boost.settings) boost.settings.routeStrategy = applied.strategy;
    await serviceClient.clearManualPreferredAccount();
    boost.selectedId = await serviceClient.getManualPreferredAccountId();
    if (boost.selectedId) throw new Error("手动账号尚未取消，请重试");
    notify(
      strategy === "quota_priority" ? "已启用剩余额度优先" : "已恢复自动选择",
    );
  });
  pendingSelection.value = false;
}
</script>
<template>
  <div class="tests-page">
    <div class="page-toolbar page-primary-toolbar">
      <div class="toolbar-group">
        <slot name="heading" />
        <span class="eyebrow">ACCOUNT AVAILABILITY</span
        ><span class="badge">{{ eligibleAccounts.length }} 个可测试</span>
      </div>
      <div class="toolbar-group">
        <BoostMenu
          v-if="isAdmin"
          :label="strategyLabel"
          icon="route"
          :items="strategyItems"
          :selected="
            boost.selectedId
              ? 'manual'
              : boost.settings?.routeStrategy || 'ordered'
          "
          :disabled="pendingSelection"
          @select="automatic"
        />
        <button
          v-if="boost.selectedId && isAdmin"
          class="secondary"
          :disabled="pendingSelection"
          @click="automatic()"
        >
          恢复自动选择</button
        ><button
          class="primary"
          :disabled="running || !eligibleAccounts.length"
          @click="testAll()"
        >
          <BoostIcon
            :name="running ? 'loader-circle' : 'rotate-ccw'"
            :class="{ spinning: running }"
            :size="16"
          />{{
            running
              ? `检测中 ${completed}/${eligibleAccounts.length}`
              : "检测全部"
          }}
        </button>
      </div>
    </div>
    <div class="test-notice">
      <BoostIcon name="info" :size="14" /><span
        >检查账号凭据与额度接口，不发送模型请求或生成用量</span
      >
    </div>
    <div
      v-if="running"
      class="test-progress"
      role="progressbar"
      :aria-valuenow="completed"
      :aria-valuemax="eligibleAccounts.length"
      aria-label="账号测试进度"
    >
      <div class="section-caption">
        <span>正在检测账号可用性</span
        ><span>{{ completed }} / {{ eligibleAccounts.length }}</span>
      </div>
      <div class="progress-track">
        <span
          :style="{
            width: `${(completed / Math.max(1, eligibleAccounts.length)) * 100}%`,
          }"
        />
      </div>
    </div>
    <div v-if="eligibleAccounts.length" class="page-toolbar">
      <div class="search-field">
        <BoostIcon name="search" :size="16" /><input
          v-model="query"
          aria-label="搜索测试账号"
          placeholder="搜索账号…"
        />
      </div>
      <div class="toolbar-group">
        <span class="toolbar-note">{{ succeeded }} 个账号通过检测</span>
      </div>
    </div>
    <div v-if="visibleAccounts.length" class="account-test-grid">
      <article
        v-for="a in visibleAccounts"
        :key="a.id"
        class="test-card"
        :class="{ chosen: boost.selectedId === a.id }"
      >
        <div class="card-heading">
          <div style="min-width: 0; flex: 1">
            <h3 :title="a.name">{{ a.name }}</h3>
            <div class="card-subtitle">
              <span class="plan-title">{{ a.planType || "OPENAI" }}</span
              ><span v-if="boost.selectedId === a.id" class="blue-text">
                · 当前选用</span
              >
            </div>
          </div>
          <button
            class="round-button"
            :aria-label="`检测 ${a.name}`"
            :disabled="isPending(a.id)"
            @click="testAll(a.id)"
          >
            <BoostIcon
              name="rotate-ccw"
              :size="16"
              :class="{ spinning: results[a.id]?.state === 'running' }"
            />
          </button>
        </div>
        <div class="test-state">
          <span
            class="badge"
            :class="{
              success: results[a.id]?.state === 'success',
              error: results[a.id]?.state === 'failed',
              blue: results[a.id]?.state === 'running',
            }"
            ><BoostIcon
              :name="
                results[a.id]?.state === 'success'
                  ? 'circle-check'
                  : results[a.id]?.state === 'failed'
                    ? 'circle-x'
                    : results[a.id]?.state === 'running'
                      ? 'loader-circle'
                      : 'ellipsis'
              "
              :size="13"
              :class="{ spinning: results[a.id]?.state === 'running' }"
              />{{ stateLabels[results[a.id]?.state || "pending"] }}</span
          >
        </div>
        <AccountNodeControl :account-id="a.id" />
        <div
          v-if="results[a.id]?.state === 'failed'"
          class="test-detail"
          :title="results[a.id]?.message"
        >
          {{ results[a.id]?.message || "等待测试请求" }}
        </div>
        <div class="card-footer">
          <span class="test-time">{{
            results[a.id]?.testedAt
              ? formatTime(results[a.id].testedAt! / 1000)
              : "尚未测试"
          }}</span>
          <button
            v-if="isAdmin"
            :class="boost.selectedId === a.id ? 'primary' : 'secondary'"
            :disabled="
              pendingSelection ||
              results[a.id]?.state !== 'success' ||
              boost.selectedId === a.id
            "
            @click="choose(a.id)"
          >
            <BoostIcon
              v-if="boost.selectedId === a.id"
              name="check"
              :size="13"
            />{{ boost.selectedId === a.id ? "已选用" : "选用" }}
          </button>
        </div>
      </article>
    </div>
    <PanelCard v-else
      ><EmptyState
        icon="flask-conical"
        :title="query ? '没有匹配的账号' : '暂无可测试账号'"
        :description="query ? '试试其他关键词。' : '添加可用账号后开始测试'"
        ><RouterLink v-if="!query" class="primary" to="/accounts/"
          ><BoostIcon name="plus" :size="15" />账号管理</RouterLink
        ></EmptyState
      ></PanelCard
    >
  </div>
</template>
