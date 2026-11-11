<script setup lang="ts">
import { computed, ref } from "vue";
import BoostIcon from "@/components/BoostIcon.vue";
import PanelCard from "@/components/PanelCard.vue";
import TrafficPanel from "@/components/TrafficPanel.vue";
import SystemPanels from "@/components/SystemPanels.vue";
import UsageProgress from "@/components/UsageProgress.vue";
import AccountQuotaDetails from "@/components/AccountQuotaDetails.vue";
import AccountTags from "@/components/AccountTags.vue";
import UsageOverview from "@/components/UsageOverview.vue";
import { uiPreferences } from "@/composables/useUiPreferences";
import {
  boost,
  currentAccount,
  eligibleAccounts,
  formatNumber,
  isAdmin,
  perform,
  notify,
  refreshAccounts,
} from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
const refreshing = ref(false);
const accountMode = computed(() =>
  boost.selectedId
    ? "手动选用"
    : boost.recentAccountId
      ? "最近使用"
      : currentAccount.value?.preferred
        ? "优先账号"
        : "自动选择",
);
async function refreshQuota() {
  refreshing.value = true;
  await perform(async () => {
    await accountClient.refreshUsage();
    await refreshAccounts();
    notify("额度刷新已提交");
  });
  refreshing.value = false;
}
</script>
<template>
  <div class="page-stack home-page">
    <UsageOverview daily />
    <div class="two-columns home-grid quota-home-grid">
      <PanelCard title="账号管理" icon="users-round"
        ><template #actions
          ><button
            class="icon-button"
            aria-label="刷新账号池额度"
            :disabled="refreshing || !boost.accounts.length"
            @click="refreshQuota"
          >
            <BoostIcon
              name="rotate-ccw"
              :size="20"
              :class="{ spinning: refreshing }"
            /></button
          ><RouterLink class="text-button" to="/accounts/"
            >管理<BoostIcon name="chevron-right" :size="18" /></RouterLink
        ></template>
        <div class="pool-quota-card">
          <div class="pool-quota-heading">
            <span>账号池剩余</span
            ><span class="muted"
              >{{ formatNumber(eligibleAccounts.length) }} /
              {{ formatNumber(boost.accounts.length) }}</span
            >
          </div>
          <UsageProgress
            :primary="boost.quotaSummary?.primaryRemainPercent"
            :secondary="boost.quotaSummary?.secondaryRemainPercent"
          />
        </div>
        <div class="home-card-bottom">
          <span class="muted"
            >{{ formatNumber(boost.accounts.length) }} 个账号 ·
            {{ formatNumber(eligibleAccounts.length) }} 个可用</span
          ><RouterLink
            v-if="!boost.accounts.length"
            class="text-button"
            to="/accounts/?import=1"
            >导入账号<BoostIcon name="plus" :size="18" /></RouterLink
          ><RouterLink v-else class="text-button" to="/accounts/"
            >查看账号<BoostIcon name="chevron-right" :size="18"
          /></RouterLink></div
      ></PanelCard>
      <PanelCard title="当前账号" icon="user-round"
        ><template #actions
          ><span class="badge" :class="currentAccount ? 'blue' : ''">{{
            accountMode
          }}</span></template
        ><template v-if="currentAccount"
          ><div class="home-current-account">
            <div>
              <h3 :title="currentAccount.name">{{ currentAccount.name }}</h3>
              <AccountTags :account="currentAccount" />
            </div>
          </div>
          <AccountQuotaDetails :account="currentAccount" compact
        /></template>
        <div v-else class="current-account-empty">
          <span>{{ boost.accounts.length ? "尚未选用账号" : "暂无账号" }}</span>
        </div>
        <div class="home-card-bottom">
          <span class="muted">{{
            currentAccount
              ? "账号剩余额度"
              : `${formatNumber(eligibleAccounts.length)} 个可用账号`
          }}</span
          ><RouterLink class="text-button" to="/tests/"
            >{{ currentAccount ? "切换账号" : "测试并选用"
            }}<BoostIcon name="chevron-right" :size="18"
          /></RouterLink></div
      ></PanelCard>
    </div>
    <TrafficPanel
      v-if="isAdmin && uiPreferences.showTrafficChart"
    /><SystemPanels v-if="isAdmin" />
  </div>
</template>
