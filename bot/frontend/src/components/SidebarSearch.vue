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
import type { Bot, Group, Route } from "../types";
import Icon from "./Icon.vue";
import BotAvatar from "./BotAvatar.vue";
import Modal from "./Modal.vue";
const props = defineProps<{ bots: Bot[]; groups: Group[] }>();
const emit = defineEmits<{ navigate: [kind: Route["kind"], id: string] }>();
const open = ref(false),
  query = ref(""),
  active = ref(0),
  input = ref<HTMLInputElement>(),
  listId = useId();
const results = computed(() =>
  [
    ...props.bots.map((b) => ({
      kind: "chat" as const,
      id: b.id,
      title: b.name,
      group: "智能体",
      icon: "chat",
      bot: b,
    })),
    ...props.groups.map((g) => ({
      kind: "group" as const,
      id: g.id,
      title: g.name,
      group: "协作群",
      icon: "team",
      bot: undefined,
    })),
    {
      kind: "discover" as const,
      id: "",
      title: "发现",
      group: "页面",
      icon: "grid",
      bot: undefined,
    },
    {
      kind: "settings" as const,
      id: "",
      title: "设置",
      group: "页面",
      icon: "settings",
      bot: undefined,
    },
    {
      kind: "tasks" as const,
      id: "",
      title: "任务记录",
      group: "页面",
      icon: "tasks",
      bot: undefined,
    },
  ].filter((item) =>
    `${item.title} ${item.group}`
      .toLowerCase()
      .includes(query.value.trim().toLowerCase()),
  ),
);
watch(query, () => {
  active.value = 0;
});
watch(open, async (value) => {
  if (value) {
    query.value = "";
    active.value = 0;
    await nextTick();
    input.value?.focus();
  }
});
function shortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
    if (document.querySelector("dialog[open]") && !open.value) return;
    event.preventDefault();
    open.value = !open.value;
  }
}
function move(delta: number) {
  if (!results.value.length) return;
  active.value =
    (active.value + delta + results.value.length) % results.value.length;
  document
    .getElementById(`${listId}-${active.value}`)
    ?.scrollIntoView({ block: "nearest" });
}
function select(index = active.value) {
  const item = results.value[index];
  if (!item) return;
  open.value = false;
  emit("navigate", item.kind, item.id);
}
onMounted(() => document.addEventListener("keydown", shortcut));
onBeforeUnmount(() => document.removeEventListener("keydown", shortcut));
</script>
<template>
  <div class="boost-search-slot">
    <button
      class="sidebar-search"
      aria-label="搜索智能体、群聊与设置"
      title="搜索 · Ctrl+K"
      @click="open = true"
    >
      <Icon name="search" :size="16" /><span>搜索…</span><kbd>Ctrl K</kbd>
    </button>
  </div>
  <Modal v-if="open" title="搜索" @close="open = false"
    ><div class="navigation-search">
      <div class="navigation-search-field">
        <Icon name="search" :size="18" /><input
          ref="input"
          v-model="query"
          role="combobox"
          aria-label="搜索智能体、群聊与设置"
          placeholder="搜索智能体、群聊、设置…"
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
          :key="item.kind + item.id"
          type="button"
          role="option"
          :aria-selected="index === active"
          tabindex="-1"
          @pointermove="active = index"
          @mousedown.prevent
          @click="select(index)"
        >
          <BotAvatar v-if="item.bot" :bot="item.bot" :size="24" /><Icon
            v-else
            :name="item.icon"
            :size="18"
          /><span>{{ item.title }}</span
          ><small>{{ item.group }}</small>
        </button>
        <p v-if="!results.length" class="navigation-search-empty" role="status">
          未找到匹配结果
        </p>
      </div>
    </div></Modal
  >
</template>
<style scoped>
.boost-search-slot {
  padding: 0 var(--side-inset);
}
/* Same control dimensions and interaction as Boost's SidebarSearch.vue. */
.sidebar-search {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  min-height: 34px;
  padding: 7px 10px;
  margin: 0 0 14px;
  border: 1px solid var(--line);
  border-radius: 8px;
  background: var(--field-bg);
  color: var(--muted);
  font-size: 13px;
  text-align: left;
  flex-shrink: 0;
}
.sidebar-search > span {
  flex: 1;
}
.sidebar-search kbd {
  font: inherit;
  font-size: 9px;
  white-space: nowrap;
  opacity: 0.65;
}
.sidebar-search:hover {
  color: var(--fg);
  background: var(--pill-hover);
}
.navigation-search {
  padding: var(--sheet-pad);
}
.navigation-search-field {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border: 1px solid var(--line);
  border-radius: 9px;
  background: var(--field-bg);
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
  background: var(--pill-hover);
  color: var(--fg);
}
.navigation-search-results > button > span {
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
</style>
