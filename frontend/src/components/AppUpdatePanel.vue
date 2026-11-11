<script setup lang="ts">
import { computed } from "vue";
import PanelCard from "./PanelCard.vue";
import AppUpdateActions from "./AppUpdateActions.vue";
import {
  appUpdates,
  updateBusy,
  checkAppUpdate,
} from "@/composables/useAppUpdates";
const checkedAt = computed(() =>
  appUpdates.check?.checkedAtUnixSecs
    ? new Date(appUpdates.check.checkedAtUnixSecs * 1000).toLocaleString()
    : "尚未检查",
);
</script>
<template>
  <PanelCard title="应用更新" icon="rotate-ccw">
    <div class="detail-line">
      <span>当前版本</span
      ><strong>{{ appUpdates.currentVersion || "读取中…" }}</strong>
    </div>
    <div class="detail-line">
      <span>更新仓库</span><strong>{{ appUpdates.repo || "尚未配置" }}</strong>
    </div>
    <div class="detail-line">
      <span>上次检查</span><strong>{{ checkedAt }}</strong>
    </div>
    <div v-if="appUpdates.check?.hasUpdate" class="detail-line">
      <span>可用版本</span><strong>{{ appUpdates.check.latestVersion }}</strong>
    </div>
    <p v-if="appUpdates.check?.reason" class="hint">
      {{ appUpdates.check.reason }}
    </p>
    <p v-if="appUpdates.error" role="alert">{{ appUpdates.error }}</p>
    <div class="row">
      <button
        class="secondary"
        :disabled="updateBusy"
        @click="checkAppUpdate()"
      >
        {{ appUpdates.checking ? "正在检查…" : "检查更新" }}
      </button>
      <AppUpdateActions />
    </div>
  </PanelCard>
</template>
