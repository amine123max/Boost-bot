<script setup lang="ts">
import { computed } from "vue";
import type { Account } from "@/types";
import BoostIcon from "./BoostIcon.vue";
import { resolveAccountPlanKey } from "@/lib/utils/account-plan";
const props = defineProps<{ account: Account; showStatus?: boolean }>();
const plan = computed(() => resolveAccountPlanKey(props.account));
const auth = computed(() => {
  const mode = (props.account.authMode || "")
    .toLowerCase()
    .replace(/[ _-]/g, "");
  if (mode === "agentidentity") return "Agent Identity";
  if (["apikey", "api"].includes(mode)) return "API Key";
  if (!props.account.hasToken) return "未授权";
  return !mode ||
    ["oauth", "chatgpt", "token", "atrt", "chatgptauthtokens"].includes(mode)
    ? "OAuth"
    : props.account.authMode;
});
</script>
<template>
  <div class="account-tags">
    <span class="badge provider"
      ><BoostIcon name="openai" :size="13" />OpenAI</span
    ><span class="badge auth"
      ><BoostIcon name="key-round" :size="14" />{{ auth }}</span
    ><span class="badge" :class="`plan-${plan}`">{{
      plan === "unknown" ? "未知订阅" : plan.toUpperCase()
    }}</span
    ><span v-if="account.preferred" class="badge preferred">优先</span
    ><span
      v-if="showStatus !== false && account.availabilityLevel === 'bad'"
      class="badge error"
      >{{ account.availabilityText }}</span
    >
  </div>
</template>
