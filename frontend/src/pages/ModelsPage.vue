<script setup lang="ts">
import { computed } from "vue";
import { useRoute, useRouter } from "vue-router";
import ModelsPanel from "@/components/ModelsPanel.vue";
import PricesPanel from "@/components/PricesPanel.vue";
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
    <div
      v-spring-switch
      class="tabs model-workspace-tabs"
      role="tablist"
      aria-label="模型分类"
    >
      <button
        role="tab"
        :aria-selected="tab === 'catalog'"
        :class="{ selected: tab === 'catalog' }"
        @click="selectTab('catalog')"
      >
        模型目录
      </button>
      <button
        v-if="isAdmin"
        role="tab"
        :aria-selected="tab === 'prices'"
        :class="{ selected: tab === 'prices' }"
        @click="selectTab('prices')"
      >
        模型计费
      </button>
    </div>
    <KeepAlive>
      <PricesPanel v-if="tab === 'prices'" />
      <ModelsPanel v-else :read-only="!isAdmin" />
    </KeepAlive>
  </div>
</template>
