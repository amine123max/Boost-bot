<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { Bot, Approval, Task, LiveTurn, Message } from "../types";
import { api, enc } from "../api";
import Icon from "./Icon.vue";
import SettingsButton from './SettingsButton.vue';
import HelpTip from "./HelpTip.vue";
import ConversationLabel from "./ConversationLabel.vue";
import ConversationHistory from "./ConversationHistory.vue";
import TaskOverviewCard from "./TaskOverviewCard.vue";
import ConversationPlanCard from "./ConversationPlanCard.vue";
const props = defineProps<{
  bot: Bot;
  configure: boolean;
  pending: Approval[];
  conversationId: string;
  messages: Message[];
  live: LiveTurn | null;
}>();
const emit = defineEmits<{
  close: [];
  edit: [];
  delete: [];
  settings: [];
  approvals: [];
  task: [task: Task];
  tasks: [];
}>();
interface Conversation {
  id: string;
  channel: string;
  title: string;
  createdAt: number;
  lastMessage?: string;
  updatedAt?: number;
}
interface Account {
  key: string;
  channel: string;
  name?: string;
  defaultBot?: string;
  status?: { state?: string; detail?: string };
}
const conversations = ref<Conversation[]>([]),
  accounts = ref<Account[]>([]),
  memory = ref<string[]>([]),
  error = ref("");
const viewing = ref<Conversation | null>(null);
const tasks = ref<Task[]>([]),
  tasksError = ref("");
let generation = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  clearTimeout(timer);
  if (document.hidden) {
    timer = setTimeout(load, 5000);
    return;
  }
  const ticket = generation,
    id = props.bot.id;
  error.value = "";
  try {
    const [c, result] = await Promise.all([
      api<{ conversations: Conversation[] }>(`/conversations?bot=${enc(id)}`),
      api<{ tasks: Task[] }>(`/tasks?bot=${enc(id)}&limit=4`).then(
        (value) => ({ tasks: value.tasks, error: "" }),
        (e) => ({ tasks: [] as Task[], error: (e as Error).message }),
      ),
    ]);
    if (ticket !== generation) return;
    conversations.value = c.conversations;
    tasks.value = result.tasks;
    tasksError.value = result.error;
    if (props.configure) {
      const [a, m] = await Promise.all([
        api<{ accounts: Account[] }>("/channel-accounts"),
        api<{
          scopes: Array<{ kind: string; entries: Array<{ text: string }> }>;
        }>(`/bots/${enc(id)}/memory`),
      ]);
      if (ticket !== generation) return;
      accounts.value = a.accounts.filter((value) => value.defaultBot === id);
      memory.value = m.scopes
        .filter((s) => s.kind === "bot")
        .flatMap((s) => s.entries.map((e) => e.text));
    }
  } catch (e) {
    if (ticket === generation) error.value = (e as Error).message;
  } finally {
    if (ticket === generation) timer = setTimeout(load, 5000);
  }
}
watch(
  [() => props.bot.id, () => props.configure],
  () => {
    generation++;
    clearTimeout(timer);
    conversations.value = [];
    accounts.value = [];
    memory.value = [];
    tasks.value = [];
    tasksError.value = "";
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
const channelName = (channel: string) =>
  (
    ({
      weixin: "微信",
      feishu: "飞书",
      web: "网页",
      telegram: "Telegram",
      slack: "Slack",
      discord: "Discord",
    }) as Record<string, string>
  )[channel] || channel;
</script>
<template>
  <aside class="panel" aria-label="智能体信息">
    <div class="panel-head">
      <span class="title">{{ bot.name }}</span
      ><SettingsButton label="智能体设置" @click="emit('edit')" /><button v-if="configure" class="icon-btn" aria-label="删除智能体" @click="emit('delete')">
        <Icon name="trash" :size="16" /></button
      ><button
        class="icon-btn panel-close"
        aria-label="关闭信息面板"
        @click="emit('close')"
      >
        <Icon name="close" />
      </button>
    </div>
    <div class="panel-body">
      <p v-if="error" class="notice" role="alert">{{ error }}</p>
      <div class="list-head">
        任务<button
          class="icon-btn"
          aria-label="查看全部任务"
          @click="emit('tasks')"
        >
          <Icon name="chevron" :size="13" />
        </button>
      </div>
      <div class="panel-task-cards">
        <ConversationPlanCard
          :key="conversationId"
          :conversation-id="conversationId"
          :messages="messages"
          :live="live"
          :pending="pending"
        />
        <TaskOverviewCard
          v-for="task in tasks"
          :key="task.id"
          :task="task"
          :inspect="configure"
          @open="emit('task', $event)"
        />
        <p v-if="tasksError" class="notice" role="alert">{{ tasksError }}</p>
        <p v-else-if="!tasks.length" class="task-empty">暂无后台任务</p>
      </div>
      <div class="list-head">渠道</div>
      <div class="list">
        <div v-for="account in accounts" :key="account.key" class="row">
          <div class="who">
            <div class="name">
              {{ account.name || channelName(account.channel) }}
            </div>
            <div class="sub">
              {{ account.status?.detail || "默认由这个机器人回复" }}
            </div>
          </div>
          <span class="hint">{{
            account.status?.state === "connected"
              ? "已连接"
              : account.status?.state || "未连接"
          }}</span>
        </div>
        <div class="row">
          <span class="channel-manage-label"><button class="channel-manage" @click="emit('settings')">管理聊天渠道</button><HelpTip text="微信、飞书等账号由所有智能体共用，可在设置中管理。" label="管理聊天渠道说明" /></span>
        </div>
      </div>
      <div class="list-head">待审批</div>
      <div class="list">
        <button
          v-if="pending.length"
          class="row clickable"
          @click="emit('approvals')"
        >
          <span>{{ pending.length }} 项请求等待处理</span>
        </button>
        <div v-else class="row"><span class="hint">没有待处理的审批</span></div>
      </div>
      <template v-if="configure"
        ><div class="list-head">
          记忆<button class="icon-btn" aria-label="刷新记忆" @click="load">
            <Icon name="refresh" :size="14" />
          </button>
        </div>
        <div class="list">
          <div
            v-for="(entry, index) in memory.slice(0, 8)"
            :key="index"
            class="row"
          >
            <span class="selectable">{{ entry }}</span>
          </div>
          <div v-if="!memory.length" class="row">
            <span class="hint">还没有长期记忆</span>
          </div>
        </div></template
      >
      <div class="list-head">最近会话</div>
      <div class="list">
        <button
          v-for="conversation in conversations.slice(0, 6)"
          :key="conversation.id"
          class="row clickable conversation-row"
          @click="viewing = conversation"
        >
          <div class="who">
            <div class="name">
              <ConversationLabel
                :channel="conversation.channel"
                :created-at="conversation.createdAt"
              />
            </div>
            <div class="sub">
              {{ conversation.lastMessage || "暂无消息" }}
            </div>
          </div>
        </button>
        <div v-if="!conversations.length" class="row">
          <span class="hint">暂无会话记录</span>
        </div>
      </div>
    </div>
  </aside>
  <ConversationHistory
    v-if="viewing"
    :key="viewing.id"
    :conversation="viewing"
    @close="viewing = null"
  />
</template>

<style scoped>
.channel-manage-label { display:inline-flex; align-items:center; gap:5px; }
.channel-manage {
  flex: 0 1 auto;
  text-align: left;
}
.conversation-row {
  width: 100%;
  text-align: left;
}
.panel-task-cards {
  display: grid;
  gap: 14px;
  padding-block: 4px 10px;
  min-width: 0;
}
.task-empty {
  margin: 0;
  padding: 8px 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
