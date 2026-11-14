<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import ModelsPanel from "@/components/ModelsPanel.vue";
import PricesPanel from "@/components/PricesPanel.vue";
import PageTabs from "@/components/PageTabs.vue";
import { isAdmin } from "@/composables/useBoost";
const route = useRoute();
const router = useRouter();
const tab = computed(() =>
  route.query.tab === "prices" && isAdmin.value ? "prices" : "catalog",
);
function selectTab(value: string) {
  router.replace({
    path: "/models/",
    query: value === "prices" ? { tab: "prices" } : {},
  });
}
</script>
<template>
  <div class="model-workspace">
    <KeepAlive>
      <component :is="tab === 'prices' ? PricesPanel : ModelsPanel" v-bind="tab === 'catalog' ? { readOnly: !isAdmin } : {}">
        <template #heading><PageTabs label="模型分类" :selected="tab" :items="[{ value: 'catalog', label: '模型目录' }, ...(isAdmin ? [{ value: 'prices', label: '模型计费' }] : [])]" @select="selectTab" /></template>
      </component>
    </KeepAlive>
  </div>
</template>
