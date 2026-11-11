<script setup lang="ts">
import { computed, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isAdmin } from "@/composables/useBoost";
import BoostIcon from "@/components/BoostIcon.vue";
import AccountTestsPanel from "@/components/AccountTestsPanel.vue";
import NetworkTestsPanel from "@/components/NetworkTestsPanel.vue";
const route = useRoute();
const router = useRouter();
const network = computed(
  () =>
    isAdmin.value &&
    (route.path.startsWith("/tests/network") || route.query.tab === "network"),
);
async function switchTab(value: boolean, focus = false) {
  await router.push(value ? "/tests/network/" : "/tests/");
  if (focus) {
    await nextTick();
    document
      .getElementById(value ? "network-test-tab" : "account-test-tab")
      ?.focus();
  }
}
</script>
<template>
  <div class="test-center">
    <div
      v-spring-switch
      class="tabs"
      role="tablist"
      aria-label="测试页面切换"
      @keydown.right.prevent="isAdmin && switchTab(!network, true)"
      @keydown.left.prevent="isAdmin && switchTab(!network, true)"
    >
      <button
        id="account-test-tab"
        type="button"
        role="tab"
        :class="{ selected: !network }"
        :aria-selected="!network"
        :tabindex="network ? -1 : 0"
        aria-controls="test-center-panel"
        @click="switchTab(false)"
      >
        <BoostIcon name="users-round" :size="16" />账号测试
      </button>
      <button
        v-if="isAdmin"
        id="network-test-tab"
        type="button"
        role="tab"
        :class="{ selected: network }"
        :aria-selected="network"
        :tabindex="network ? 0 : -1"
        aria-controls="test-center-panel"
        @click="switchTab(true)"
      >
        <BoostIcon name="gauge" :size="16" />网速测试
      </button>
    </div>
    <div
      id="test-center-panel"
      role="tabpanel"
      :aria-labelledby="network ? 'network-test-tab' : 'account-test-tab'"
    >
      <NetworkTestsPanel v-if="network" />
      <AccountTestsPanel v-else />
    </div>
  </div>
</template>
<style scoped>
.test-center {
  min-width: 0;
}
</style>
