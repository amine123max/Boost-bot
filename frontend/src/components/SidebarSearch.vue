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
import { useRouter } from "vue-router";
import BoostDialog from "./BoostDialog.vue";
import BoostIcon from "./BoostIcon.vue";
import { isAdmin } from "@/composables/useBoost";
import { isTauriRuntime } from "@/lib/api/transport-runtime";
import { searchNavigation, type NavigationItem } from "@/lib/navigation";
const router = useRouter();
const open = ref(false);
const query = ref("");
const input = ref<HTMLInputElement>();
const active = ref(0);
const listId = useId();
const results = computed(() =>
  searchNavigation(query.value, isAdmin.value, isTauriRuntime()),
);
watch(query, () => {
  active.value = 0;
});
watch(open, async (value) => {
  if (!value) return;
  query.value = "";
  active.value = 0;
  await nextTick();
  input.value?.focus();
});
function shortcut(event: KeyboardEvent) {
  if (!(event.ctrlKey || event.metaKey) || event.key.toLowerCase() !== "k")
    return;
  if (document.querySelector("dialog[open]") && !open.value) return;
  event.preventDefault();
  open.value = !open.value;
}
function move(delta: number) {
  if (!results.value.length) return;
  active.value =
    (active.value + delta + results.value.length) % results.value.length;
  document
    .getElementById(`${listId}-${active.value}`)
    ?.scrollIntoView({ block: "nearest" });
}
async function select(item = results.value[active.value]) {
  if (!item) return;
  open.value = false;
  await nextTick();
  await router.push(item.path);
}
onMounted(() => document.addEventListener("keydown", shortcut));
onBeforeUnmount(() => document.removeEventListener("keydown", shortcut));
</script>
<template>
  <button
    class="sidebar-search"
    aria-label="搜索页面与设置"
    title="搜索 · Ctrl+K"
    @click="open = true"
  >
    <BoostIcon name="search" :size="16" /><span>搜索…</span><kbd>Ctrl K</kbd>
  </button>
  <BoostDialog v-if="open" title="搜索" @close="open = false">
    <div class="navigation-search">
      <div class="navigation-search-field">
        <BoostIcon name="search" :size="18" />
        <input
          ref="input"
          v-model="query"
          role="combobox"
          aria-label="搜索页面与设置"
          placeholder="搜索页面、设置…"
          autocomplete="off"
          aria-autocomplete="list"
          aria-expanded="true"
          :aria-controls="listId"
          :aria-activedescendant="
            results.length ? `${listId}-${active}` : undefined
          "
          @keydown.down.prevent="move(1)"
          @keydown.up.prevent="move(-1)"
          @keydown.enter.prevent="select()"
        />
      </div>
      <div
        :id="listId"
        class="navigation-search-results"
        role="listbox"
        aria-label="搜索结果"
      >
        <button
          v-for="(item, index) in results"
          :id="`${listId}-${index}`"
          :key="item.path"
          type="button"
          role="option"
          :aria-selected="index === active"
          tabindex="-1"
          @pointermove="active = index"
          @mousedown.prevent
          @click="select(item)"
        >
          <BoostIcon :name="item.icon" :size="18" /><span>{{ item.title }}</span
          ><small>{{ item.group }}</small
          ><BoostIcon name="arrow-up-right" :size="13" />
        </button>
        <p v-if="!results.length" class="navigation-search-empty" role="status">
          未找到匹配结果
        </p>
      </div>
    </div>
  </BoostDialog>
</template>
<style>
.sidebar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  height: var(--boost-search-height);
  padding: 7px 10px;
  margin: var(--boost-controls-gap) 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--input);
  color: var(--muted);
  font-size: 13px;
  text-align: left;
  flex-shrink: 0;
}
.sidebar-search span:not(.boost-icon) {
  flex: 1;
}
.sidebar-search kbd {
  font: inherit;
  font-size: 9px;
  white-space: nowrap;
  opacity: 0.65;
}
.sidebar-search:hover {
  color: var(--text);
  background: var(--hover);
}
.sidebar-collapsed .sidebar-search {
  width: 56px;
  justify-content: center;
  padding: 8px 0;
  border-color: transparent;
  background: transparent;
}
.sidebar-collapsed .sidebar-search > span:not(.boost-icon),
.sidebar-collapsed .sidebar-search kbd {
  display: none;
}
.sidebar-collapsed .sidebar-search:focus-visible { outline: none; color: var(--blue); background: var(--blue-soft); }
.navigation-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: var(--input);
}
.navigation-search-field input {
  width: 100%;
  padding: 0;
  border: 0;
  outline: none;
  background: transparent;
  font-size: 16px;
}
.navigation-search-results {
  display: grid;
  gap: 3px;
  max-height: min(370px, 55vh);
  overflow: auto;
  margin-top: 12px;
}
.navigation-search-results > button {
  display: flex;
  align-items: center;
  gap: 11px;
  padding: 10px 12px;
  min-height: 42px;
  border-radius: 8px;
  background: transparent;
  text-align: left;
}
.navigation-search-results > button[aria-selected="true"] {
  background: var(--blue-soft);
  color: var(--blue);
}
.navigation-search-results > button > span:not(.boost-icon) {
  flex: 1;
  font-size: 16px;
}
.navigation-search-results small {
  font-size: 11px;
  color: var(--muted);
}
.navigation-search-empty {
  padding: 22px 10px;
  text-align: center;
  color: var(--muted);
}
@media (max-width: 760px) {
  .sidebar-search:focus-visible { outline: none; color: var(--blue); background: var(--blue-soft); }
  .sidebar-search {
    justify-content: center;
    padding: 8px 0;
    border-color: transparent;
    background: transparent;
  }
  .sidebar-search > span:not(.boost-icon),
  .sidebar-search kbd {
    display: none;
  }
}
</style>
