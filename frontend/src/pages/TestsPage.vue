<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import { isAdmin } from "@/composables/useBoost";
import PageTabs from "@/components/PageTabs.vue";
import AccountTestsPanel from "@/components/AccountTestsPanel.vue";
import NetworkTestsPanel from "@/components/NetworkTestsPanel.vue";
const route = useRoute();
const router = useRouter();
const network = computed(
  () =>
    isAdmin.value &&
    (route.path.startsWith("/tests/network") || route.query.tab === "network"),
);
async function switchTab(value: boolean) {
  await router.push(value ? "/tests/network/" : "/tests/");
}
</script>
<template>
  <div class="test-center">
    <div
      id="test-center-panel"
      role="tabpanel"
      :aria-label="network ? '网速测试' : '账号测试'"
    >
      <component :is="network ? NetworkTestsPanel : AccountTestsPanel">
        <template #heading><PageTabs label="测试页面切换" :selected="network ? 'network' : 'accounts'" :items="[{ value: 'accounts', label: '账号测试', icon: 'users-round' }, ...(isAdmin ? [{ value: 'network', label: '网速测试', icon: 'gauge' }] : [])]" @select="switchTab($event === 'network')" /></template>
      </component>
    </div>
  </div>
</template>
<style scoped>
.test-center {
  min-width: 0;
}
</style>
