<script setup lang="ts">
import { computed, onMounted } from "vue";
import { isAdmin, perform, notify } from "@/composables/useBoost";
import { useProxyNetwork } from "@/composables/useProxyNetwork";
import CountryFlag from "./CountryFlag.vue";
const props = defineProps<{ accountId: string }>();
const { snapshot, busy, refresh, action } = useProxyNetwork();
const binding = computed(() => snapshot.value?.bindings[props.accountId] || "");
const node = computed(() =>
  snapshot.value?.nodes.find((n) => n.id === binding.value),
);
onMounted(() => {
  if (isAdmin.value && !snapshot.value) void refresh();
});
async function change(event: Event) {
  const target = event.target as HTMLSelectElement;
  const id = target.value;
  await perform(async () => {
    await action("bind", { accountId: props.accountId, nodeId: id });
    notify(id ? "账号已固定使用所选节点" : "账号已跟随全局策略");
  });
  target.value = binding.value;
}
</script>
<template>
  <div v-if="isAdmin" class="account-node-control">
    <CountryFlag
      :code="node?.countryCode || ''"
      :country="node?.country || '跟随全局策略'"
      :icon-size="16"
    />
    <select
      :value="binding"
      :disabled="
        busy || snapshot?.testRunning || snapshot?.kernel.busy || !snapshot
      "
      :aria-label="`账号 ${accountId} 的代理节点`"
      @change="change"
    >
      <option value="">跟随全局策略</option>
      <option v-if="binding && !node" :value="binding">
        节点已移除（请求已阻断）
      </option>
      <option v-for="n in snapshot?.nodes || []" :key="n.id" :value="n.id">
        {{ n.countryCode ? `${n.countryCode} · ` : "" }}{{ n.name }}
      </option>
    </select>
    <span v-if="binding" class="badge" :class="{ error: !node }">{{
      node ? "固定节点" : "节点失效"
    }}</span>
  </div>
</template>
<style scoped>
.account-node-control {
  display: flex;
  align-items: center;
  gap: 7px;
  max-width: 100%;
  margin-top: 8px;
}
.account-node-control :deep(.country-flag) {
  width: 20px;
  height: 15px;
  border-radius: 2px;
}
.account-node-control select {
  min-width: 0;
  width: 180px;
  max-width: 100%;
  font-size: 11px;
  padding: 5px 24px 5px 7px;
}
.account-node-control .badge {
  flex-shrink: 0;
  font-size: 10px;
}
</style>
