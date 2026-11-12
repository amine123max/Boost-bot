<script setup lang="ts">
import BoostIcon from "./BoostIcon.vue";
import { appClient } from "@/lib/api/app-client";
import { isTauriRuntime } from "@/lib/api/transport";
import { perform } from "@/composables/useBoost";
const url = "https://github.com/amine123max/Boost-bot";
function open(event: MouseEvent) {
  if (!isTauriRuntime()) return;
  event.preventDefault();
  void perform(() => appClient.openExternalUrl(url));
}
</script>
<template>
  <a
    class="icon-button github-link"
    :href="url"
    target="_blank"
    rel="noopener noreferrer"
    aria-label="Boost GitHub"
    title="GitHub"
    @click="open"
    ><BoostIcon name="github" :size="22"
  /></a>
</template>
<style scoped>
.github-link {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  color: var(--text);
  flex-shrink: 0;
}
</style>
