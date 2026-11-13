<script setup lang="ts">
import { computed, ref } from "vue";
import BoostIcon from "./BoostIcon.vue";
import TrayMetricWidget from "./TrayMetricWidget.vue";
import {
  trayItems,
  type TrayPreferences,
  type TrayItemKey,
} from "@/lib/tray-preferences";
import { traySlots } from "@/lib/tray-slots";
import type { TrayMetric } from "@/composables/useTrayMetrics";
import type { BotActivity } from "@/lib/bot-activity";
const props = withDefaults(
  defineProps<{
    preferences: TrayPreferences;
    metrics: Record<TrayItemKey, TrayMetric>;
    activity: BotActivity;
    horizontal?: boolean;
    editable?: boolean;
    dragging?: TrayItemKey;
  }>(),
  { horizontal: true },
);
const emit = defineEmits<{
  page: [id: string];
  configure: [];
  drop: [event: DragEvent, index: number];
  drag: [event: DragEvent, kind: TrayItemKey];
  dragend: [];
  move: [kind: TrayItemKey, index: number];
}>();
const slots = computed(() => traySlots(props.preferences));
const hovering = ref<number>();
function drop(event: DragEvent, index = props.preferences.pages.length) {
  if (!props.editable) return;
  event.preventDefault();
  event.stopPropagation();
  hovering.value = undefined;
  emit("drop", event, index);
}
</script>
<template>
  <section
    class="tray-dashboard"
    :class="{ horizontal, editable, 'drop-ready': editable && dragging }"
    aria-label="悬浮窗装配横条"
    @dragover="editable && $event.preventDefault()"
    @drop="drop($event)"
  >
    <div
      v-for="(slot, slotIndex) in slots"
      :key="slot.widgets.map((item) => item.widget.kind).join('-')"
      class="strip-slot"
      :class="{
        metrics: slot.metric,
        'with-divider': slot.metric && slotIndex > 0,
      }"
    >
      <div
        v-for="item in slot.widgets"
        :key="item.widget.kind"
        class="strip-component"
        :class="{
          'drop-before': editable && dragging && hovering === item.index,
        }"
        :draggable="editable"
        :role="editable ? 'button' : undefined"
        :tabindex="editable ? 0 : undefined"
        :aria-label="`${trayItems.find((entry) => entry.key === item.widget.kind)!.label}，第${item.index + 1}个位置`"
        @dragstart="editable && emit('drag', $event, item.widget.kind)"
        @dragend="
          hovering = undefined;
          emit('dragend');
        "
        @dragover.prevent.stop="hovering = item.index"
        @drop="drop($event, item.index)"
        @keydown.left.prevent.stop="
          editable &&
          emit('move', item.widget.kind, Math.max(0, item.index - 1))
        "
        @keydown.right.prevent.stop="
          editable &&
          emit(
            'move',
            item.widget.kind,
            Math.min(preferences.pages.length - 1, item.index + 1),
          )
        "
      >
        <TrayMetricWidget
          :widget="item.widget"
          :metric="metrics[item.widget.kind]"
          :activity="activity"
          :show-values="preferences.showRingValues"
          avatar
        />
      </div>
    </div>
    <button
      v-if="!editable"
      class="strip-config"
      aria-label="配置悬浮窗"
      @click="emit('configure')"
    >
      <BoostIcon name="settings" :size="10" />
    </button>
  </section>
</template>
<style scoped>
.tray-dashboard {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 6px;
  height: 100%;
  min-width: 0;
}
.horizontal {
  flex-direction: row;
}
.strip-slot {
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}
.strip-slot.metrics {
  display: grid;
  gap: 1px;
  min-width: 47px;
}
.horizontal .with-divider {
  border-left: 1px solid color-mix(in srgb, var(--border) 70%, transparent);
  padding-left: 6px;
}
.strip-component {
  position: relative;
  min-width: 0;
  border-radius: 5px;
  outline: none;
}
.editable .strip-component {
  cursor: grab;
}
.editable .strip-component:hover {
  background: transparent;
}
.editable .strip-component:focus-visible {
  outline: 1px solid var(--blue);
  outline-offset: 2px;
}
.strip-config {
  position: absolute;
  right: -3px;
  top: -4px;
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
  padding: 0;
  background: var(--sidebar);
  border: 0;
  border-radius: 4px;
  color: var(--muted);
  opacity: 0;
  cursor: pointer;
}
.tray-dashboard:hover .strip-config,
.strip-config:focus-visible {
  opacity: 1;
}
.strip-slot.metrics :deep(.widget-value) {
  gap: 2px;
}
.strip-slot.metrics :deep(.widget-value strong) {
  font-size: 9px;
}
.strip-slot.metrics :deep(.widget-value small) {
  font-size: 6px;
}
.strip-component.drop-before::before {
  position: absolute;
  content: "";
  left: -4px;
  top: 0;
  bottom: 0;
  width: 2px;
  background: var(--blue);
  border-radius: 2px;
}
.drop-ready {
  outline: 1px dashed color-mix(in srgb, var(--blue) 55%, transparent);
  outline-offset: 4px;
  border-radius: 5px;
}
</style>
