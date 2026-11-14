<script setup lang="ts" generic="T extends string">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  useId,
  watch,
} from "vue";
import Icon from "./Icon.vue";
import ProviderIcon from "./ProviderIcon.vue";
import SpringSurface from '../../../../frontend/src/components/SpringSurface.vue';
const props = withDefaults(
  defineProps<{
    modelValue?: T;
    options: readonly {
      value: T;
      label: string;
      group?: string;
      model?: string;
    }[];
    label: string;
    searchable?: boolean;
    disabled?: boolean;
    placeholder?: string;
  }>(),
  { placeholder: "请选择" },
);
const emit = defineEmits<{ "update:modelValue": [value: T] }>();
const id = useId(),
  trigger = ref<HTMLButtonElement>(),
  popup = ref<HTMLElement>(),
  search = ref<HTMLInputElement>(),
  list = ref<HTMLElement>();
const open = ref(false),
  query = ref(""),
  active = ref(0),
  target = ref<HTMLElement | string>("body"),
  position = ref<Record<string, string>>({});
const chosen = computed(() =>
  props.options.find((option) => option.value === props.modelValue),
);
const visible = computed(() => {
  const terms = query.value.trim().toLowerCase().split(/\s+/).filter(Boolean);
  return props.options.filter((option) =>
    terms.every((term) => option.label.toLowerCase().includes(term)),
  );
});
function close(focus = false) {
  open.value = false;
  if (focus) trigger.value?.focus();
}
watch(
  () => props.disabled,
  (value) => {
    if (value) close();
  },
);
async function show() {
  if (props.disabled || trigger.value?.matches(":disabled")) return;
  target.value = trigger.value?.closest("dialog") || "body";
  query.value = "";
  open.value = true;
  active.value = Math.max(
    0,
    visible.value.findIndex((option) => option.value === props.modelValue),
  );
  await nextTick();
  const box = trigger.value?.getBoundingClientRect();
  if (!box) return;
  const width = Math.min(
      Math.max(box.width, props.searchable ? 260 : 180),
      innerWidth - 24,
    ),
    below = innerHeight - box.bottom - 12,
    above = box.top - 12;
  const height = Math.min(props.searchable ? 320 : 280, Math.max(below, above));
  const down = below >= Math.min(200, height) || below >= above;
  position.value = {
    left: `${Math.max(12, Math.min(box.left, innerWidth - width - 12))}px`,
    width: `${width}px`,
    maxHeight: `${height}px`,
    ...(down
      ? { top: `${box.bottom + 4}px` }
      : { bottom: `${innerHeight - box.top + 4}px` }),
  };
  await nextTick();
  if (props.searchable) search.value?.focus();
  else list.value?.focus();
  scrollActive();
}
function scrollActive() {
  void nextTick(() =>
    document
      .getElementById(`${id}-${active.value}`)
      ?.scrollIntoView({ block: "nearest" }),
  );
}
function choose(value: T) {
  emit("update:modelValue", value);
  close(true);
}
function keydown(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === "Tab") {
    close();
    trigger.value?.focus();
    return;
  }
  if (event.key === "Enter" || (!props.searchable && event.key === " ")) {
    event.preventDefault();
    const option = visible.value[active.value];
    if (option) choose(option.value);
    return;
  }
  if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) return;
  event.preventDefault();
  const count = visible.value.length;
  if (!count) return;
  active.value =
    event.key === "Home"
      ? 0
      : event.key === "End"
        ? count - 1
        : (active.value + (event.key === "ArrowDown" ? 1 : -1) + count) % count;
  scrollActive();
}
function outside(event: PointerEvent) {
  const node = event.target as Node;
  if (!trigger.value?.contains(node) && !popup.value?.contains(node)) close();
}
function scroll(event: Event) {
  if (!(event.target instanceof Node) || !popup.value?.contains(event.target))
    close();
}
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  addEventListener("resize", scroll);
  addEventListener("scroll", scroll, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  removeEventListener("resize", scroll);
  removeEventListener("scroll", scroll, true);
});
</script>
<template>
  <div class="select-control" :class="{ 'model-select': searchable }">
    <button
      ref="trigger"
      type="button"
      class="select-trigger"
      :aria-label="label"
      :title="chosen?.label || modelValue || placeholder"
      aria-haspopup="listbox"
      :aria-expanded="open"
      :aria-controls="open ? id : undefined"
      :disabled="disabled"
      @click="open ? close() : show()"
      @keydown.down.prevent="show()"
      @keydown.up.prevent="show()"
    >
      <ProviderIcon
        v-if="chosen?.model"
        :model="chosen.model"
        :size="16"
      /><span class="select-value">{{
        chosen?.label || modelValue || placeholder
      }}</span
      ><Icon name="chevron" :size="13" class="select-chevron" />
    </button>
    <Teleport :to="target"><SpringSurface
      ><div
        v-if="open"
        ref="popup"
        class="select-popup"
        :class="{ 'model-select-popup': searchable }"
        :style="position"
        @keydown="keydown"
      >
        <div v-if="searchable" class="select-search">
          <Icon name="search" :size="15" /><input
            ref="search"
            v-model="query"
            role="combobox"
            aria-autocomplete="list"
            aria-expanded="true"
            :aria-controls="id"
            :aria-activedescendant="
              visible[active] ? id + '-' + active : undefined
            "
            :aria-label="'搜索' + label"
            placeholder="搜索模型名称…"
            @input="active = 0"
          />
        </div>
        <div
          :id="id"
          ref="list"
          class="select-options"
          role="listbox"
          :aria-label="label"
          :tabindex="searchable ? undefined : -1"
          :aria-activedescendant="
            !searchable && visible[active] ? id + '-' + active : undefined
          "
        >
          <template v-for="(option, index) in visible" :key="option.value"
            ><div
              v-if="
                option.group &&
                (index === 0 || visible[index - 1].group !== option.group)
              "
              class="select-group"
              role="presentation"
            >
              {{ option.group }}
            </div>
            <button
              :id="id + '-' + index"
              type="button"
              role="option"
              :aria-selected="modelValue === option.value"
              :class="{ 'is-active': active === index }"
              tabindex="-1"
              @pointermove="active = index"
              @click="choose(option.value)"
            >
              <ProviderIcon
                v-if="option.model"
                :model="option.model"
                :size="16"
              /><span class="select-value">{{ option.label }}</span
              ><Icon
                v-if="modelValue === option.value"
                name="check"
                :size="14"
              /></button
          ></template>
        </div>
        <div v-if="!visible.length" class="select-empty" role="status">
          没有匹配的选项<button
            type="button"
            class="quiet-button"
            @click="
              query = '';
              active = 0;
              search?.focus();
            "
          >
            清除搜索
          </button>
        </div>
      </div></SpringSurface></Teleport
    >
  </div>
</template>
<style scoped>
.select-control {
  width: 100%;
  min-width: 0;
}
.select-trigger {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 6px 9px;
  border: 1px solid var(--line);
  border-radius: 7px;
  background: var(--well);
  color: var(--fg);
  text-align: left;
  font-size: 12px;
  line-height: 1.5;
}
.select-trigger > .select-value {
  flex: 1;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.select-chevron {
  transform: rotate(90deg);
  flex: none;
  color: var(--muted);
}
.select-trigger:hover {
  border-color: var(--muted);
}
.select-trigger:focus-visible {
  outline: 1.5px solid var(--accent);
  outline-offset: 1px;
}
.select-trigger[aria-expanded="true"] {
  border-color: var(--accent);
}
.select-trigger:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
.select-popup {
  position: fixed;
  z-index: 1100;
  display: flex;
  flex-direction: column;
  overflow: hidden;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--surface);
  color: var(--fg);
  box-shadow: 0 8px 28px #0003;
  padding: 4px;
}
.select-search {
  display: flex;
  align-items: center;
  gap: 7px;
  margin: 2px 2px 4px;
  padding: 6px 8px;
  border-radius: 5px;
  background: var(--well);
  color: var(--muted);
  flex: none;
}
.select-search input {
  width: 100%;
  min-width: 0;
  padding: 0;
  font: inherit;
  font-size: 12px;
  border: 0;
  outline: none;
  color: var(--fg);
  background: transparent;
}
.select-options {
  overflow-y: auto;
  overscroll-behavior: contain;
  min-height: 0;
  outline: none;
  scrollbar-width: thin;
}
.select-options button {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 32px;
  padding: 7px 8px;
  border-radius: 5px;
  text-align: left;
  font-size: 12px;
  color: var(--fg-2);
}
.select-options button > .select-value {
  flex: 1;
  min-width: 0;
  overflow-wrap: anywhere;
}
.select-options button > svg {
  flex: none;
  color: var(--accent);
}
.select-options button.is-active {
  background: var(--pill);
  color: var(--fg);
}
.select-options button[aria-selected="true"] {
  color: var(--fg);
}
.select-group {
  padding: 6px 8px 3px;
  font-size: 10px;
  color: var(--muted);
}
.select-empty {
  display: grid;
  justify-items: start;
  gap: 8px;
  padding: 12px;
  color: var(--muted);
  font-size: 12px;
}
</style>
