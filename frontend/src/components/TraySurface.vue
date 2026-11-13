<script setup lang="ts">
withDefaults(
  defineProps<{ edge?: string; theme?: "system" | "dark" | "light" }>(),
  { edge: "floating", theme: "system" },
);
</script>
<template>
  <div
    class="tray-surface"
    :class="[`edge-${edge}`, `theme-${theme}`]"
    :data-avatar-theme="theme"
  >
    <slot />
  </div>
</template>
<style scoped>
.tray-surface {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 4px 7px;
  border: 1px solid var(--border);
  border-radius: 10px;
  background: var(--sidebar);
  box-shadow: none;
}
.theme-dark {
  --bg: #0e0e0e;
  --sidebar: #0e0e0e;
  --card: #191919;
  --surface: #272727;
  --hover: #333333;
  --border: #353535;
  --text: #ececec;
  --muted: #a1a1aa;
  --blue: #2dd4bf;
  --tray-muted: #a1a1aa;
  --tray-bg: #0e0e0e;
  color-scheme: dark;
  color: var(--text);
}
.theme-light {
  --bg: #fff;
  --sidebar: #fff;
  --card: #fff;
  --surface: #f4f4f5;
  --hover: #e4e4e7;
  --border: #d4d4d8;
  --text: #3f3f46;
  --muted: #71717a;
  --blue: #0f766e;
  --tray-muted: #71717a;
  --tray-bg: #fff;
  color-scheme: light;
  color: var(--text);
}
.edge-top {
  border-top: 0;
  border-radius: 0 0 10px 10px;
}
.edge-left {
  border-left: 0;
  border-radius: 0 10px 10px 0;
}
.edge-right {
  border-right: 0;
  border-radius: 10px 0 0 10px;
}
</style>
