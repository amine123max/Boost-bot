<script setup lang="ts">
import HelpTip from "./HelpTip.vue";
import SpringSurface from "../../../../frontend/src/components/SpringSurface.vue";
defineProps<{ title: string; help?: string; sectionId: string }>();
</script>
<template>
  <header class="settings-banner" aria-label="当前设置分区">
    <div class="settings-banner-inner">
      <SpringSurface kind="page"
        ><div :key="sectionId" class="settings-banner-title">
          <h2>{{ title }}</h2>
          <HelpTip v-if="help" :text="help" :label="title + '说明'" /></div
      ></SpringSurface>
    </div>
  </header>
</template>
<style scoped>
.settings-banner {
  box-sizing: border-box;
  min-height: var(--boost-section-heading-height);
  height: var(--boost-section-heading-height);
  border-bottom: 1px solid var(--line);
  background: var(--bg);
}
.settings-banner-inner {
  display: flex;
  align-items: center;
  height: 100%;
  max-width: 920px;
  padding: 0 24px;
  margin: 0 auto;
  box-sizing: border-box;
  position: relative;
}
.settings-banner-title {
  display: flex;
  align-items: center;
  gap: 5px;
}
.settings-banner-title h2 {
  margin: 0;
  font-size: 16px;
  line-height: 1.4;
  font-weight: 600;
}
.settings-banner-title[aria-hidden="true"] {
  position: absolute;
}
@media (max-width: 650px) {
  .settings-banner-inner {
    padding-inline: 14px;
  }
}
</style>
