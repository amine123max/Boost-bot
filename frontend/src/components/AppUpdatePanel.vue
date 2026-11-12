<script setup lang="ts">
import PanelCard from "./PanelCard.vue";
import AppUpdateActions from "./AppUpdateActions.vue";
import {
  appUpdates,
  updateBusy,
  checkAppUpdate,
} from "@/composables/useAppUpdates";
</script>
<template>
  <PanelCard title="应用更新" icon="rotate-ccw">
    <div class="detail-line">
      <span>当前版本</span
      ><strong>{{ appUpdates.currentVersion || "读取中…" }}</strong>
    </div>
    <div v-if="appUpdates.check?.hasUpdate" class="detail-line">
      <span>可用版本</span><strong>{{ appUpdates.check.latestVersion }}</strong>
    </div>
    <p v-if="appUpdates.check?.reason" class="update-status" role="status">
      {{ appUpdates.check.reason }}
    </p>
    <p v-if="appUpdates.error" role="alert">{{ appUpdates.error }}</p>
    <div class="update-actions">
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

<style scoped>
.update-status { margin: 12px 0 0; color: var(--muted); line-height: 1.6; }
.update-actions { display: flex; flex-wrap: wrap; align-items: center; gap: 10px; margin-top: 20px; }
.update-actions button { flex-shrink: 0; }
</style>
