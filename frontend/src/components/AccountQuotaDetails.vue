<script setup lang="ts">
import { computed } from "vue";
import type { Account } from "@/types";
import { formatNumber } from "@/composables/useBoost";
import { getUsageDisplayBuckets } from "@/lib/utils/usage";
import { formatQuotaCountdown } from "@/lib/account-workflows";
import { useSecondClock } from "@/composables/useSecondClock";
const props = defineProps<{ account: Account; compact?: boolean }>();
const now = useSecondClock();
const buckets = computed(() => getUsageDisplayBuckets(props.account.usage));
const rows = computed(() => [
  {
    key: "5h",
    tone: "quota-five",
    remain: props.account.primaryRemainPercent,
    reset: buckets.value.primaryResetsAt,
    requests:
      buckets.value.mode === "secondary-only"
        ? undefined
        : props.account.usagePrimaryWindowRequestCount,
    tokens:
      buckets.value.mode === "secondary-only"
        ? undefined
        : props.account.usagePrimaryWindowTotalTokens,
    cost:
      buckets.value.mode === "secondary-only"
        ? undefined
        : props.account.usagePrimaryWindowEstimatedCostUsd,
  },
  {
    key: "7d",
    tone: "quota-seven",
    remain: props.account.secondaryRemainPercent,
    reset: buckets.value.secondaryResetsAt,
    requests:
      buckets.value.mode === "secondary-only"
        ? props.account.usagePrimaryWindowRequestCount
        : buckets.value.mode === "primary-only"
          ? undefined
          : props.account.usageSecondaryWindowRequestCount,
    tokens:
      buckets.value.mode === "secondary-only"
        ? props.account.usagePrimaryWindowTotalTokens
        : buckets.value.mode === "primary-only"
          ? undefined
          : props.account.usageSecondaryWindowTotalTokens,
    cost:
      buckets.value.mode === "secondary-only"
        ? props.account.usagePrimaryWindowEstimatedCostUsd
        : buckets.value.mode === "primary-only"
          ? undefined
          : props.account.usageSecondaryWindowEstimatedCostUsd,
  },
]);
</script>
<template>
  <div class="account-quota-details" :class="{ compact }">
    <div v-for="row in rows" :key="row.key" class="account-quota-window">
      <div v-if="!compact" class="account-window-stats">
        <span>{{ formatNumber(row.requests) }} req</span
        ><span>{{ formatNumber(row.tokens) }}</span
        ><span>{{ row.cost == null ? "—" : "$" + row.cost.toFixed(2) }}</span>
      </div>
      <div class="account-window-meter">
        <span class="window-label" :class="row.tone">{{ row.key }}</span>
        <div
          class="usage-progress-track"
          :class="[row.tone, { unknown: row.remain == null }]"
          role="progressbar"
          :aria-label="`${account.name} ${row.key}剩余额度`"
          :aria-valuenow="
            row.remain == null ? undefined : Math.round(row.remain)
          "
          :aria-valuemin="0"
          :aria-valuemax="100"
        >
          <span
            :style="{
              width: `${Math.min(100, Math.max(0, row.remain ?? 0))}%`,
            }"
          />
        </div>
        <span class="account-window-percent">{{
          row.remain == null ? "—" : Math.round(row.remain) + "%"
        }}</span
        ><span class="account-window-reset" :title="'距离额度重置'">{{
          formatQuotaCountdown(row.reset, now)
        }}</span>
      </div>
    </div>
  </div>
</template>
