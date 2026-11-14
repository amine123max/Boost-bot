<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import ModelLabel from "./ModelLabel.vue";
import ModelProviderIcon from "./ModelProviderIcon.vue";
import { modelProviderLabel } from "../../../bot/shared/appearance/modelProvider";
import SpringSurface from './SpringSurface.vue';
const props = withDefaults(
  defineProps<{
    modelValue?: string | null;
    options?: readonly string[];
    label: string;
    placeholder?: string;
    required?: boolean;
    disabled?: boolean;
    allowCustom?: boolean;
  }>(),
  { options: () => [], allowCustom: true },
);
const emit = defineEmits<{ "update:modelValue": [value: string] }>();
const root = ref<HTMLElement>(),
  input = ref<HTMLInputElement>(),
  popup = ref<HTMLElement>();
const target = ref<HTMLElement>(),
  open = ref(false),
  query = ref(props.modelValue || ""),
  active = ref(-1),
  position = ref({});
const search = ref("");
const id = useId();
const matches = computed(() =>
  [...new Set(props.options)].filter((model) =>
    (model + " " + modelProviderLabel(model))
      .toLowerCase()
      .includes(search.value.trim().toLowerCase()),
  ),
);
const visible = computed(() => matches.value.slice(0, 100));
watch(
  () => props.modelValue,
  (value) => {
    query.value = value || "";
  },
);
watch(query, () => {
  active.value = -1;
  nextTick(place);
});
function place() {
  if (!open.value || !input.value) return;
  const box = input.value.getBoundingClientRect(),
    width = Math.min(Math.max(box.width, 280), innerWidth - 16);
  const below = innerHeight - box.bottom - 8,
    above = box.top - 8,
    useAbove = below < 180 && above > below;
  const height = Math.max(0, Math.min(320, useAbove ? above : below));
  position.value = {
    position: "fixed",
    left: `${Math.max(8, Math.min(box.left, innerWidth - width - 8))}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
    ...(useAbove
      ? { bottom: `${innerHeight - box.top + 4}px` }
      : { top: `${box.bottom + 4}px` }),
  };
}
function show(reset = false) {
  if (props.disabled) return;
  // A parent Teleport/dialog may finish mounting after this component.
  target.value = root.value?.closest("dialog") || document.body;
  if (reset) search.value = "";
  open.value = props.options.length > 0;
  place();
  nextTick(place);
}
function close() {
  open.value = false;
  active.value = -1;
  if (!props.allowCustom) query.value = props.modelValue || "";
}
function change(event: Event) {
  query.value = (event.target as HTMLInputElement).value;
  search.value = query.value;
  if (props.allowCustom) emit("update:modelValue", query.value);
  show();
}
function select(value: string) {
  emit("update:modelValue", value);
  query.value = value;
  close();
  input.value?.focus();
}
function keydown(event: KeyboardEvent) {
  if (event.isComposing) return;
  if (event.key === "Escape" && open.value) {
    event.preventDefault();
    event.stopPropagation();
    close();
    return;
  }
  if (event.key === "ArrowDown" || event.key === "ArrowUp") {
    event.preventDefault();
    show();
    if (!visible.value.length) return;
    const delta = event.key === "ArrowDown" ? 1 : -1;
    active.value =
      active.value < 0
        ? delta > 0
          ? 0
          : visible.value.length - 1
        : (active.value + delta + visible.value.length) % visible.value.length;
    nextTick(() =>
      popup.value
        ?.querySelector(`[id="${id}-${active.value}"]`)
        ?.scrollIntoView({ block: "nearest" }),
    );
  } else if (event.key === "Enter" && open.value) {
    event.preventDefault();
    const option = visible.value[active.value];
    if (option) select(option);
    else close();
  } else if (event.key === "Tab") close();
}
function outside(event: PointerEvent) {
  const node = event.target as Node;
  if (!root.value?.contains(node) && !popup.value?.contains(node)) close();
}
onMounted(() => {
  target.value = root.value?.closest("dialog") || document.body;
  document.addEventListener("pointerdown", outside);
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", place);
  document.removeEventListener("scroll", place, true);
});
watch(
  () => props.disabled,
  (disabled) => {
    if (disabled) close();
  },
);
</script>
<template>
  <span ref="root" class="model-select">
    <ModelProviderIcon :model="query" />
    <input
      ref="input"
      :value="query"
      role="combobox"
      :aria-label="label"
      :aria-expanded="open"
      :aria-controls="open ? id : undefined"
      :aria-activedescendant="
        open && active >= 0 ? `${id}-${active}` : undefined
      "
      aria-autocomplete="list"
      :required="required"
      :disabled="disabled"
      :placeholder="placeholder"
      autocomplete="off"
      @focus="show(true)"
      @click="show(true)"
      @input="change"
      @keydown="keydown"
      @blur="close"
    />
    <Teleport v-if="target" :to="target"><SpringSurface>
      <div
        v-if="open"
        :id="id"
        ref="popup"
        class="model-select-popup"
        role="listbox"
        :aria-label="label"
        :style="position"
        @mousedown.prevent
      >
        <button
          v-for="(model, index) in visible"
          :id="`${id}-${index}`"
          :key="model"
          type="button"
          role="option"
          :aria-selected="model === modelValue"
          :class="{ active: index === active }"
          tabindex="-1"
          @click="select(model)"
        >
          <ModelLabel :model="model" />
        </button>
        <p v-if="!visible.length">
          {{ allowCustom ? "使用输入的模型 ID" : "没有匹配模型" }}
        </p>
        <p v-else-if="matches.length > visible.length">
          输入关键词定位其余 {{ matches.length - visible.length }} 个模型
        </p>
      </div>
    </SpringSurface></Teleport>
  </span>
</template>
<style scoped>
.model-select {
  position: relative;
  display: flex;
  align-items: center;
  min-width: 0;
  width: 100%;
}
.model-select > :deep(.boost-icon) {
  position: absolute;
  left: 10px;
  pointer-events: none;
}
.model-select input {
  width: 100%;
  min-width: 0;
  padding-left: 34px;
}
.model-select-popup {
  position: fixed;
  z-index: 100;
  overflow: auto;
  scrollbar-width: none;
  overscroll-behavior: contain;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--dialog);
  color: var(--text);
  padding: 4px;
  box-shadow: 0 8px 24px #0002;
}
.model-select-popup::-webkit-scrollbar {
  display: none;
}
.model-select-popup button {
  display: flex;
  align-items: center;
  width: 100%;
  padding: 8px;
  border: 0;
  border-radius: 5px;
  background: transparent;
  text-align: left;
  color: inherit;
  cursor: pointer;
  font: inherit;
  font-size: 12px;
}
.model-select-popup button:hover,
.model-select-popup button.active,
.model-select-popup button[aria-selected="true"] {
  background: var(--surface);
}
.model-select-popup p {
  font-size: 11px;
  color: var(--muted);
  padding: 8px;
  margin: 0;
}
</style>
