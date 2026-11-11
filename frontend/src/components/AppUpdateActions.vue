<script setup lang="ts">
import {
  appUpdates,
  updateBusy,
  prepareAppUpdate,
  applyAppUpdate,
} from "@/composables/useAppUpdates";
</script>
<template>
  <button
    v-if="appUpdates.pending"
    class="primary"
    :disabled="updateBusy"
    @click="applyAppUpdate"
  >
    {{
      appUpdates.applying
        ? "正在启动更新…"
        : appUpdates.pending.isPortable
          ? "重启并更新"
          : "安装更新"
    }}
  </button>
  <button
    v-else-if="appUpdates.check?.hasUpdate"
    class="primary"
    :disabled="updateBusy || !appUpdates.check.canPrepare"
    @click="prepareAppUpdate"
  >
    {{ appUpdates.preparing ? "正在下载…" : "下载更新" }}
  </button>
</template>
