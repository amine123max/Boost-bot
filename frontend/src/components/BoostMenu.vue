<script setup lang="ts">
import {
  ref,
  computed,
  nextTick,
  onBeforeUnmount,
  onDeactivated,
  useId,
} from "vue";
import BoostIcon from "./BoostIcon.vue";
export interface MenuItem {
  value: string;
  label: string;
  icon?: string;
  group?: string;
  danger?: boolean;
  disabled?: boolean;
}
const props = defineProps<{
  label: string;
  items: MenuItem[];
  icon?: string;
  iconOnly?: boolean;
  disabled?: boolean;
  selected?: string;
}>();
const emit = defineEmits<{ select: [value: string] }>();
const open = ref(false),
  trigger = ref<HTMLButtonElement>(),
  panel = ref<HTMLDivElement>();
const position = ref({ left: "0px", top: "0px" });
const id = useId();
const groups = computed(() =>
  props.items.map((item, index) => ({
    ...item,
    heading:
      item.group && item.group !== props.items[index - 1]?.group
        ? item.group
        : "",
  })),
);
function close(restore = true) {
  open.value = false;
  document.removeEventListener("pointerdown", outside);
  document.removeEventListener("keydown", escape);
  window.removeEventListener("resize", onResize);
  window.removeEventListener("scroll", onScroll, true);
  if (restore) trigger.value?.focus({ preventScroll: true });
}
function outside(event: PointerEvent) {
  if (
    !trigger.value?.contains(event.target as Node) &&
    !panel.value?.contains(event.target as Node)
  )
    close(false);
}
function escape(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close();
  }
}
function onResize() {
  close(false);
}
function onScroll(event: Event) {
  if (event.target !== panel.value) close(false);
}
async function toggle() {
  if (open.value) {
    close();
    return;
  }
  if (props.disabled) return;
  open.value = true;
  await nextTick();
  if (!open.value || !trigger.value || !panel.value) return;
  const viewportWidth =
    document.documentElement.clientWidth || window.innerWidth;
  const viewportHeight =
    document.documentElement.clientHeight || window.innerHeight;
  panel.value.style.maxWidth = `${Math.max(0, viewportWidth - 16)}px`;
  panel.value.style.maxHeight = `${Math.max(0, viewportHeight - 16)}px`;
  const anchor = trigger.value.getBoundingClientRect(),
    menu = panel.value.getBoundingClientRect();
  const left = Math.max(
    8,
    Math.min(anchor.right - menu.width, viewportWidth - menu.width - 8),
  );
  const top =
    anchor.bottom + menu.height + 6 < viewportHeight
      ? anchor.bottom + 6
      : Math.max(8, anchor.top - menu.height - 6);
  position.value = { left: `${left}px`, top: `${top}px` };
  document.addEventListener("pointerdown", outside);
  document.addEventListener("keydown", escape);
  window.addEventListener("resize", onResize);
  window.addEventListener("scroll", onScroll, true);
  await nextTick();
  panel.value
    ?.querySelector<HTMLButtonElement>("button:not(:disabled)")
    ?.focus({ preventScroll: true });
}
function navigate(event: KeyboardEvent) {
  if (event.key === "Tab") {
    close();
    return;
  }
  const buttons = Array.from(
    panel.value?.querySelectorAll<HTMLButtonElement>("button:not(:disabled)") ||
      [],
  );
  const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
  let next: number;
  if (event.key === "ArrowDown") next = (index + 1) % buttons.length;
  else if (event.key === "ArrowUp")
    next = (index - 1 + buttons.length) % buttons.length;
  else if (event.key === "Home") next = 0;
  else if (event.key === "End") next = buttons.length - 1;
  else return;
  event.preventDefault();
  buttons[next]?.focus();
}
function choose(value: string) {
  close();
  emit("select", value);
}
onBeforeUnmount(() => close(false));
onDeactivated(() => close(false));
</script>
<template>
  <button
    ref="trigger"
    type="button"
    :class="[
      'boost-menu-trigger',
      iconOnly ? 'icon-button' : 'secondary',
      { 'is-open': open },
    ]"
    :disabled="disabled"
    :aria-label="label"
    aria-haspopup="menu"
    :aria-expanded="open"
    :aria-controls="open ? id : undefined"
    @click="toggle"
    @keydown.down.prevent="!open && toggle()"
  >
    <BoostIcon v-if="icon" :name="icon" :size="15" /><span v-if="!iconOnly">{{
      label
    }}</span
    ><BoostIcon v-if="!iconOnly" name="chevron-down" :size="13" />
  </button>
  <Teleport to="body"
    ><div
      v-if="open"
      :id="id"
      ref="panel"
      class="boost-menu-panel"
      role="menu"
      :aria-label="label"
      :style="position"
      @keydown="navigate"
    >
      <template v-for="item in groups" :key="item.value">
        <div v-if="item.heading" class="boost-menu-group">
          {{ item.heading }}
        </div>
        <button
          type="button"
          :role="selected == null ? 'menuitem' : 'menuitemradio'"
          :aria-checked="selected == null ? undefined : selected === item.value"
          :disabled="item.disabled"
          :class="[
            'boost-menu-item',
            { danger: item.danger, active: selected === item.value },
          ]"
          @click="choose(item.value)"
        >
          <BoostIcon :name="item.icon || 'arrow-right'" :size="15" /><span>{{
            item.label
          }}</span
          ><BoostIcon v-if="selected === item.value" name="check" :size="14" />
        </button>
      </template></div
  ></Teleport>
</template>
