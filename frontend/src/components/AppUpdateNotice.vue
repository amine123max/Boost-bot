<script setup lang="ts">
import BoostDialog from "./BoostDialog.vue";
import AppUpdateActions from "./AppUpdateActions.vue";
import { appUpdates } from "@/composables/useAppUpdates";
</script>
<template>
  <BoostDialog
    v-if="appUpdates.dialogOpen && appUpdates.check?.hasUpdate"
    title="发现 Boost 新版本"
    @close="appUpdates.dialogOpen = false"
  >
    <div class="detail-line">
      <span>当前版本</span><strong>{{ appUpdates.currentVersion }}</strong>
    </div>
    <div class="detail-line">
      <span>新版本</span><strong>{{ appUpdates.check.latestVersion }}</strong>
    </div>
    <p v-if="appUpdates.error" role="alert">{{ appUpdates.error }}</p>
    <template #footer>
      <button class="secondary" @click="appUpdates.dialogOpen = false">
        稍后
      </button>
      <AppUpdateActions />
    </template>
  </BoostDialog>
</template>
