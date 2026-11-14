<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { Bot } from "../types";
import { api, enc } from "../api";
import Icon from "./Icon.vue";
import HelpTip from "./HelpTip.vue";
import SpringSurface from '../../../../frontend/src/components/SpringSurface.vue';
const props = defineProps<{ bot: Bot; configure: boolean; running: boolean }>();
const emit = defineEmits<{ saved: [] }>();
const trigger = ref<HTMLButtonElement>(),
  menu = ref<HTMLElement>(),
  open = ref(false),
  saving = ref(false),
  error = ref(""),
  active = ref(0),
  position = ref({});
const options = [
  {
    value: "readonly",
    label: "只读",
    icon: "hand",
    description: "读取与分析，不修改文件或已连接账号。",
  },
  {
    value: "workspace",
    label: "工作区内执行",
    icon: "permission-auto",
    description: "可写此Bot工作区，越界操作按宿主规则审批。",
  },
  {
    value: "full",
    label: "完全访问权限",
    icon: "shield-alert",
    description: "允许以宿主用户身份访问工作区外文件和执行命令。",
  },
];
const current = computed(
  () =>
    options.find((option) => option.value === props.bot.settings.permission) ||
    options[1],
);
function place() {
  if (!open.value || !trigger.value) return;
  const r = trigger.value.getBoundingClientRect(),
    width = Math.min(340, innerWidth - 24),
    above = r.top - 12,
    below = innerHeight - r.bottom - 12;
  position.value = {
    left: `${Math.max(12, Math.min(r.left, innerWidth - width - 12))}px`,
    width: `${width}px`,
    maxHeight: `${Math.max(0, Math.min(400, above > below ? above : below))}px`,
    ...(above > below
      ? { bottom: `${innerHeight - r.top + 5}px` }
      : { top: `${r.bottom + 5}px` }),
  };
}
function close(focus = false) {
  if (saving.value) return;
  open.value = false;
  if (focus) trigger.value?.focus();
}
async function toggle() {
  if (open.value) {
    close();
    return;
  }
  open.value = true;
  error.value = "";
  active.value = options.indexOf(current.value);
  place();
  await nextTick();
  menu.value
    ?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
    [active.value]?.focus();
}
async function save(value: string) {
  if (saving.value || props.running || !props.configure) return;
  if (value === props.bot.settings.permission) {
    close(true);
    return;
  }
  const id = props.bot.id;
  saving.value = true;
  error.value = "";
  try {
    await api(`/bots/${enc(id)}/settings`, {
      method: "PUT",
      body: { permission: value },
    });
    saving.value = false;
    open.value = false;
    emit("saved");
    if (id === props.bot.id) trigger.value?.focus();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
function outside(event: PointerEvent) {
  const node = event.target as Node;
  if (!trigger.value?.contains(node) && !menu.value?.contains(node)) close();
}
function keyboard(event: KeyboardEvent) {
  if (event.key === "Escape") {
    event.preventDefault();
    event.stopPropagation();
    close(true);
    return;
  }
  if (event.key === "Tab") {
    close();
    return;
  }
  if (["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key)) {
    event.preventDefault();
    active.value =
      event.key === "Home"
        ? 0
        : event.key === "End"
          ? 2
          : (active.value + (event.key === "ArrowDown" ? 1 : -1) + 3) % 3;
    menu.value
      ?.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')
      [active.value]?.focus();
  }
}
watch(
  () => props.bot.id,
  () => {
    open.value = false;
    error.value = "";
  },
);
onMounted(() => {
  document.addEventListener("pointerdown", outside);
  window.addEventListener("resize", place);
  document.addEventListener("scroll", place, true);
});
onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", outside);
  window.removeEventListener("resize", place);
  document.removeEventListener("scroll", place, true);
});
</script>
<template>
  <button
    ref="trigger"
    type="button"
    class="bot-permission-trigger"
    :class="{ full: current.value === 'full' }"
    :aria-label="`${bot.name}的执行权限：${current.label}`"
    aria-haspopup="menu"
    :aria-expanded="open"
    @click="toggle"
  >
    <Icon :name="current.icon" :size="14" /><span>{{ current.label }}</span>
  </button>
  <Teleport to="body"><SpringSurface
    ><div
      v-if="open"
      ref="menu"
      class="bot-permission-menu"
      role="menu"
      aria-label="当前Bot执行权限"
      :style="position"
      @keydown="keyboard"
    >
      <p>
        此Bot的执行权限<HelpTip
          :text="`选中立即应用于「${bot.name}」及其渠道会话；不会更改其他Bot。`"
        />
      </p>
      <button
        v-for="option in options"
        :key="option.value"
        type="button"
        role="menuitemradio"
        :aria-checked="current.value === option.value"
        :aria-disabled="!configure || running || saving"
        :class="{
          full: option.value === 'full',
          selected: current.value === option.value,
        }"
        @click="save(option.value)"
      >
        <Icon :name="option.icon" :size="17" /><span
          ><strong>{{ option.label }}</strong
          ><small>{{ option.description }}</small></span
        ><span
          v-if="saving && current.value === option.value"
          class="loading-ring"
        /><Icon
          v-else-if="current.value === option.value"
          name="check"
          :size="15"
        />
      </button>
      <p v-if="running">请先停止此Bot的对话和后台任务。</p>
      <p v-else-if="!configure">更改权限需要管理员。</p>
      <p v-if="error" role="alert" class="permission-error">{{ error }}</p>
    </div></SpringSurface></Teleport
  >
</template>
<style scoped>
.bot-permission-trigger {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  max-width: 160px;
  font-size: 11px;
  color: var(--muted);
  padding: 5px 6px;
  border: 0;
  border-radius: 14px;
  background: transparent;
}
.bot-permission-trigger:hover,
.bot-permission-trigger[aria-expanded="true"] {
  background: var(--pill);
  color: var(--fg);
}
.bot-permission-trigger span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.bot-permission-trigger.full {
  color: var(--permission-full, #ea7c36);
  background: color-mix(
    in srgb,
    var(--permission-full, #ea7c36) 10%,
    transparent
  );
}
.bot-permission-menu {
  position: fixed;
  z-index: 90;
  box-sizing: border-box;
  overflow: auto;
  scrollbar-width: none;
  padding: 9px;
  border: 1px solid var(--line);
  border-radius: 12px;
  background: var(--surface);
  box-shadow: 0 10px 30px #0003;
  color: var(--fg);
}
.bot-permission-menu::-webkit-scrollbar {
  display: none;
}
.bot-permission-menu > p {
  display: flex;
  align-items: center;
  margin: 3px 6px 7px;
  color: var(--muted);
  font-size: 11px;
  line-height: 1.5;
}
.bot-permission-menu > button {
  display: flex;
  align-items: flex-start;
  gap: 9px;
  width: 100%;
  padding: 8px 6px;
  border-radius: 7px;
  text-align: left;
  border: 0;
  background: transparent;
  color: var(--fg-2);
}
.bot-permission-menu > button:hover,
.bot-permission-menu > button:focus-visible,
.bot-permission-menu > button.selected {
  background: var(--pill);
}
.bot-permission-menu > button > svg {
  flex: none;
  margin-top: 2px;
}
.bot-permission-menu > button > span:not(.loading-ring) {
  display: grid;
  gap: 3px;
  flex: 1;
}
.bot-permission-menu strong {
  font-size: 12px;
  font-weight: 550;
}
.bot-permission-menu small {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
}
.bot-permission-menu > button.full,
.bot-permission-menu > button.full small {
  color: var(--permission-full, #ea7c36);
}
.bot-permission-menu > button[aria-disabled="true"] {
  opacity: 0.55;
  cursor: not-allowed;
}
.bot-permission-menu > .permission-error {
  color: var(--red);
}
.bot-permission-menu .loading-ring {
  width: 13px;
  height: 13px;
  flex: none;
}
:global(html[data-theme="light"]) .bot-permission-menu,
:global(html[data-theme="light"]) .bot-permission-trigger {
  --permission-full: #b64b13;
}
</style>
