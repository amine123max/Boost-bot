<script setup lang="ts">
import { ref } from "vue";
import TrayDashboard from "@/components/TrayDashboard.vue";
import TrayLayoutEditor from "@/components/TrayLayoutEditor.vue";
import TraySurface from "@/components/TraySurface.vue";
import { useTrayMetrics } from "@/composables/useTrayMetrics";
import { useTrayDock } from "@/composables/useTrayDock";
import { trayPreferences } from "@/composables/useTrayPreferences";
import { isTauriRuntime } from "@/lib/api/transport-runtime";
const editing = ref(false);
const { metrics, activity } = useTrayMetrics();
const { actionError, edge, horizontal, openMain, startDragging } =
  useTrayDock(editing);
</script>
<template>
  <main class="tray-page" aria-label="Boost 悬浮窗">
    <aside
      class="tray-rail"
      :class="[
        {
          'is-draggable': isTauriRuntime(),
          'is-horizontal': horizontal,
          'is-editing': editing,
        },
        `is-${edge}`,
      ]"
      aria-label="实时指标"
      tabindex="0"
      @pointerdown="startDragging"
      @dblclick="!editing && openMain()"
      @keydown.enter.self="!editing && openMain()"
    >
      <TrayLayoutEditor v-if="editing" floating @done="editing = false" />
      <TraySurface v-else :edge="edge" :theme="trayPreferences.appearance"
        ><TrayDashboard
          :preferences="trayPreferences"
          :metrics="metrics"
          :activity="activity"
          :horizontal="horizontal"
          @page="trayPreferences.activePage = $event"
          @configure="editing = true"
      /></TraySurface>
      <p v-if="actionError" class="tray-rail-error" role="alert">
        {{ actionError }}
      </p>
    </aside>
  </main>
</template>
<style>
html.tray-preview-window,
.tray-preview-window body,
.tray-preview-window #app {
  min-width: 0;
  height: 100%;
  background: transparent;
}
.tray-preview-window body {
  padding: 0;
}
</style>
<style scoped>
.tray-page {
  --tray-bg: var(--sidebar);
  --tray-text: var(--text);
  --tray-muted: var(--muted);
  --tray-line: var(--border);
  height: 100%;
  min-width: 0;
  color: var(--text);
  font-size: 10px;
  line-height: 1.2;
}
.tray-rail {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 0;
  border-radius: 10px;
  outline: none;
  overflow: hidden;
}
.tray-rail.is-draggable {
  cursor: grab;
  user-select: none;
}
.tray-rail.is-draggable:active {
  cursor: grabbing;
}
.tray-rail.is-top {
  border-top: 0;
  border-radius: 0 0 11px 11px;
}
.tray-rail.is-left {
  border-left: 0;
  border-radius: 0 11px 11px 0;
}
.tray-rail.is-right {
  border-right: 0;
  border-radius: 11px 0 0 11px;
}
.tray-drag-handle {
  position: absolute;
  top: 3px;
  left: 50%;
  width: 14px;
  height: 2px;
  transform: translateX(-50%);
  border-radius: 2px;
  background: var(--border);
  pointer-events: none;
}
.is-editing {
  padding: 0;
  background: var(--sidebar);
  border: 1px solid var(--border);
  overflow: auto;
  cursor: default !important;
}
.tray-rail-error {
  position: absolute;
  inset: auto 3px 0;
  font-size: 9px;
  color: var(--red);
  background: var(--sidebar);
  margin: 0;
}
.tray-rail:focus-visible {
  box-shadow: inset 0 0 0 1px var(--blue);
}
</style>
