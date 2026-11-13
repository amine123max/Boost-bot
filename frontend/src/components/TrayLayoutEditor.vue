<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import BoostIcon from "./BoostIcon.vue";
import TrayDashboard from "./TrayDashboard.vue";
import TrayMetricWidget from "./TrayMetricWidget.vue";
import TraySurface from "./TraySurface.vue";
import { trayLayoutSize } from "@/lib/tray-layout";
import { trayPreferences } from "@/composables/useTrayPreferences";
import { useTrayMetrics } from "@/composables/useTrayMetrics";
import { useSpringCarousel } from "@/composables/useSpringCarousel";
import {
  newTrayWidget,
  trayItems,
  type TrayItemKey,
  type TrayPanel,
} from "@/lib/tray-preferences";
defineProps<{ floating?: boolean }>();
const emit = defineEmits<{ done: [] }>();
const { metrics, activity } = useTrayMetrics();
const dragged = ref<TrayItemKey>(),
  message = ref("");
const index = ref(0),
  viewport = ref<HTMLElement>();
const count = computed(() => trayItems.length);
const { offset, pointerDown, pointerMove, pointerUp, cancel } =
  useSpringCarousel(viewport, index, count, select);
const appearanceIndex = ref(trayPreferences.appearance === "light" ? 1 : 0);
const appearanceViewport = ref<HTMLElement>();
const appearances = ["dark", "light"] as const;
const {
  offset: appearanceOffset,
  pointerDown: themeDown,
  pointerMove: themeMove,
  pointerUp: themeUp,
  cancel: themeCancel,
} = useSpringCarousel(
  appearanceViewport,
  appearanceIndex,
  computed(() => 2),
  selectAppearance,
);
function selectAppearance(value: number) {
  appearanceIndex.value = Math.max(0, Math.min(1, value));
  trayPreferences.appearance = appearances[appearanceIndex.value];
}
onMounted(() => {
  if (trayPreferences.appearance === "system")
    selectAppearance(
      document.documentElement.dataset.theme === "light" ? 1 : 0,
    );
});
watch(
  () => trayPreferences.appearance,
  (value) => {
    if (value !== "system") appearanceIndex.value = value === "light" ? 1 : 0;
  },
);
function select(value: number) {
  index.value = Math.max(0, Math.min(trayItems.length - 1, value));
}
const previewSize = computed(() => ({
  width: `${trayLayoutSize(trayPreferences).horizontalWidth}px`,
  height: "42px",
}));
function place(kind: TrayItemKey, at = trayPreferences.pages.length) {
  const pages = trayPreferences.pages;
  const from = pages.findIndex((page) => page.widgets[0].kind === kind);
  const entry: TrayPanel =
    from >= 0
      ? pages.splice(from, 1)[0]
      : {
          id: `widget-${kind}`,
          name: trayItems.find((item) => item.key === kind)!.label,
          widgets: [newTrayWidget(kind)],
        };
  pages.splice(Math.max(0, Math.min(at, pages.length)), 0, entry);
  trayPreferences.activePage = entry.id;
  trayPreferences.orientation = "horizontal";
  message.value = `已装配${entry.name}`;
}
function drag(event: DragEvent, kind: TrayItemKey) {
  dragged.value = kind;
  event.dataTransfer?.setData("text/plain", kind);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}
function drop(event: DragEvent, at: number) {
  event.preventDefault();
  event.stopPropagation();
  const kind = dragged.value || event.dataTransfer?.getData("text/plain");
  if (trayItems.some((item) => item.key === kind))
    place(kind as TrayItemKey, at);
  dragged.value = undefined;
}
function toggle(kind: TrayItemKey) {
  const pages = trayPreferences.pages,
    at = pages.findIndex((page) => page.widgets[0].kind === kind);
  if (at < 0) {
    place(kind);
    return;
  }
  if (pages.length === 1) return;
  pages.splice(at, 1);
  trayPreferences.activePage = pages[Math.min(at, pages.length - 1)].id;
}
let lastWheel = 0;
function wheel(event: WheelEvent) {
  const delta =
    Math.abs(event.deltaX) > Math.abs(event.deltaY)
      ? event.deltaX
      : event.shiftKey
        ? event.deltaY
        : 0;
  if (Math.abs(delta) < 10) return;
  event.preventDefault();
  if (Date.now() - lastWheel > 350) {
    lastWheel = Date.now();
    select(index.value + (delta > 0 ? 1 : -1));
  }
}
</script>
<template>
  <div
    class="tray-editor"
    :class="{ floating }"
    @pointerdown.stop
    @dblclick.stop
  >
    <div
      class="component-picker"
      tabindex="0"
      aria-label="组件库，左右切换"
      @keydown.left.prevent="select(index - 1)"
      @keydown.right.prevent="select(index + 1)"
      @wheel="wheel"
    >
      <button
        class="picker-arrow previous"
        aria-label="上一个组件"
        :disabled="index === 0"
        @click="select(index - 1)"
      >
        <BoostIcon name="chevron-left" :size="15" />
      </button>
      <div
        ref="viewport"
        class="picker-viewport"
        @pointerdown="pointerDown"
        @pointermove="pointerMove"
        @pointerup="pointerUp"
        @pointercancel="cancel"
      >
        <div
          class="picker-track"
          :style="{ transform: `translate3d(${offset}px,0,0)` }"
        >
          <div
            v-for="(item, itemIndex) in trayItems"
            :key="item.key"
            class="picker-slide"
            :aria-hidden="itemIndex !== index"
            :inert="itemIndex !== index"
          >
            <button
              class="library-component"
              draggable="true"
              :aria-label="`添加${item.label}组件`"
              :aria-pressed="
                trayPreferences.pages.some(
                  (page) => page.widgets[0].kind === item.key,
                )
              "
              @dragstart="drag($event, item.key)"
              @dragend="dragged = undefined"
              @click="toggle(item.key)"
            >
              <TrayMetricWidget
                :widget="newTrayWidget(item.key)"
                :metric="metrics[item.key]"
                :activity="activity"
                :show-values="trayPreferences.showRingValues"
                avatar
              /></button
            ><span class="component-label">{{ item.label }}</span>
          </div>
        </div>
      </div>
      <button
        class="picker-arrow next"
        aria-label="下一个组件"
        :disabled="index === trayItems.length - 1"
        @click="select(index + 1)"
      >
        <BoostIcon name="chevron-right" :size="15" />
      </button>
      <div class="picker-dots" role="tablist" aria-label="选择组件">
        <button
          v-for="(item, itemIndex) in trayItems"
          :key="item.key"
          role="tab"
          :aria-label="`选择${item.label}`"
          :aria-selected="index === itemIndex"
          :tabindex="index === itemIndex ? 0 : -1"
          @click="select(itemIndex)"
        >
          <i />
        </button>
      </div>
    </div>
    <div
      class="assembly-area"
      aria-label="悬浮窗预览装配区"
      @dragover.prevent
      @drop="drop($event, trayPreferences.pages.length)"
    >
      <div
        class="appearance-carousel"
        tabindex="0"
        aria-label="黑白悬浮窗预览，左右切换"
        @keydown.left.prevent="selectAppearance(appearanceIndex - 1)"
        @keydown.right.prevent="selectAppearance(appearanceIndex + 1)"
      >
        <button
          class="picker-arrow previous"
          aria-label="上一个悬浮窗外观"
          :disabled="appearanceIndex === 0"
          @click="selectAppearance(appearanceIndex - 1)"
        >
          <BoostIcon name="chevron-left" :size="15" />
        </button>
        <div
          ref="appearanceViewport"
          class="appearance-viewport"
          @pointerdown="themeDown"
          @pointermove="themeMove"
          @pointerup="themeUp"
          @pointercancel="themeCancel"
        >
          <div
            class="appearance-track"
            :style="{ transform: `translate3d(${appearanceOffset}px,0,0)` }"
          >
            <div
              v-for="(appearance, pageIndex) in appearances"
              :key="appearance"
              class="appearance-slide"
              :aria-hidden="appearanceIndex !== pageIndex"
              :inert="appearanceIndex !== pageIndex"
            >
              <div class="preview-dock" :style="previewSize">
                <TraySurface :theme="appearance"
                  ><TrayDashboard
                    :preferences="trayPreferences"
                    :metrics="metrics"
                    :activity="activity"
                    horizontal
                    editable
                    :dragging="dragged"
                    @drag="drag"
                    @dragend="dragged = undefined"
                    @drop="drop"
                    @move="place"
                /></TraySurface>
              </div>
            </div>
          </div>
        </div>
        <button
          class="picker-arrow next"
          aria-label="下一个悬浮窗外观"
          :disabled="appearanceIndex === 1"
          @click="selectAppearance(appearanceIndex + 1)"
        >
          <BoostIcon name="chevron-right" :size="15" />
        </button>
        <div class="picker-dots" role="tablist" aria-label="悬浮窗外观">
          <button
            role="tab"
            aria-label="黑色悬浮窗"
            :aria-selected="appearanceIndex === 0"
            :tabindex="appearanceIndex === 0 ? 0 : -1"
            @click="selectAppearance(0)"
          >
            <i /></button
          ><button
            role="tab"
            aria-label="白色悬浮窗"
            :aria-selected="appearanceIndex === 1"
            :tabindex="appearanceIndex === 1 ? 0 : -1"
            @click="selectAppearance(1)"
          >
            <i />
          </button>
        </div>
      </div>
    </div>
    <p class="editor-feedback" role="status">{{ message }}</p>
    <button
      v-if="floating"
      class="editor-confirm primary"
      @click="emit('done')"
    >
      确认
    </button>
  </div>
</template>
<style scoped>
.tray-editor {
  --tray-muted: var(--muted);
  --tray-accent: var(--blue);
  --tray-bg: var(--sidebar);
  display: flex;
  flex-direction: column;
  gap: 20px;
  min-width: 0;
  color: var(--text);
}
.floating {
  padding: 18px 20px 14px;
}
.component-picker {
  border: 0;
  box-shadow: none;
  background: transparent;
  position: relative;
  align-self: center;
  width: 190px;
  height: 104px;
  outline: none;
}
.picker-viewport {
  position: absolute;
  left: 25px;
  right: 25px;
  top: 0;
  height: 84px;
  overflow: hidden;
  touch-action: pan-y;
  cursor: ew-resize;
}
.picker-track {
  display: flex;
  height: 100%;
  will-change: transform;
}
.picker-slide {
  display: flex;
  flex: 0 0 100%;
  width: 100%;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  gap: 8px;
  user-select: none;
}
.library-component {
  position: relative;
  height: 38px;
  min-width: 40px;
  display: grid;
  place-items: center;
  padding: 2px 5px;
  background: transparent;
  border: 0;
  border-radius: 6px;
  cursor: grab;
}
.library-component:hover {
  background: var(--hover);
}
.component-label {
  font-size: 11px;
  line-height: 1.4;
  color: var(--muted);
}
.picker-arrow {
  position: absolute;
  top: 27px;
  display: grid;
  place-items: center;
  width: 22px;
  height: 24px;
  padding: 0;
  border: 0;
  border-radius: 5px;
  background: transparent;
  color: var(--muted);
}
.picker-arrow.previous {
  left: 0;
}
.picker-arrow.next {
  right: 0;
}
.picker-arrow:hover {
  color: var(--text);
  background: var(--hover);
}
.picker-arrow:disabled {
  opacity: 0.2;
}
.picker-dots {
  position: absolute;
  bottom: 0;
  left: 0;
  right: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  height: 14px;
}
.picker-dots button {
  display: grid;
  place-items: center;
  width: 13px;
  height: 13px;
  padding: 0;
  background: none;
  border: 0;
}
.picker-dots i {
  width: 3px;
  height: 3px;
  border-radius: 50%;
  background: var(--muted);
  opacity: 0.3;
}
.picker-dots [aria-selected="true"] i {
  opacity: 1;
  background: var(--text);
  transform: scale(1.25);
}
.assembly-area {
  display: flex;
  align-items: center;
  justify-content: center;
  min-height: 92px;
  padding: 10px 0;
  overflow-x: auto;
}
.preview-dock {
  flex-shrink: 0;
}
.appearance-carousel {
  position: relative;
  width: 100%;
  height: 72px;
  outline: none;
}
.appearance-viewport {
  position: absolute;
  left: 23px;
  right: 23px;
  top: 0;
  height: 48px;
  overflow: hidden;
  touch-action: pan-y;
  cursor: ew-resize;
}
.appearance-track {
  display: flex;
  height: 100%;
  will-change: transform;
}
.appearance-slide {
  display: flex;
  align-items: center;
  justify-content: center;
  flex: 0 0 100%;
  width: 100%;
  min-width: 0;
}
.appearance-carousel .picker-arrow {
  top: 13px;
}
.appearance-carousel .picker-dots {
  bottom: 0;
}
.editor-confirm {
  align-self: flex-end;
  min-width: 70px;
  height: 31px;
  padding: 4px 16px;
  font-size: 12px;
}
.editor-feedback {
  position: absolute;
  width: 1px;
  height: 1px;
  overflow: hidden;
  clip-path: inset(50%);
}
.picker-arrow:focus-visible,
.picker-dots button:focus-visible,
.library-component:focus-visible {
  outline: 1px solid var(--blue);
  outline-offset: 2px;
}
</style>
