<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from "vue";
import type { Bot, Approval, Task } from "../types";
import { api, enc } from "../api";
import Icon from "./Icon.vue";
import SettingsButton from './SettingsButton.vue';
import HelpTip from "./HelpTip.vue";
import ConversationLabel from "./ConversationLabel.vue";
import ConversationHistory from "./ConversationHistory.vue";
import BackgroundTasks from "./BackgroundTasks.vue";
import BotMemory from "./BotMemory.vue";
import ChannelSettings from './ChannelSettings.vue';
import { type ChannelAccount as Account, type ChatChannel } from '../channel-accounts';
import BotChannels from './BotChannels.vue';
import PanelSection from './PanelSection.vue';
import BotApprovals from './BotApprovals.vue';
import HostToolsPane from './HostToolsPane.vue';
const props = defineProps<{
  bot: Bot;
  bots: Bot[];
  configure: boolean;
  pending: Approval[];
}>();
const emit = defineEmits<{
  close: [];
  edit: [];
  delete: [];
  settings: [];
  approvals: [];
  task: [task: Task];
  tasks: [];
  saved: [];
}>();
interface Conversation {
  id: string;
  channel: string;
  title: string;
  createdAt: number;
  lastMessage?: string;
  updatedAt?: number;
}
const conversations = ref<Conversation[]>([]),
  accounts = ref<Account[]>([]),
  error = ref("");
const viewing = ref<Conversation | null>(null);
const tab = ref<''|'tasks'|'channels'|'tools'|'history'>('');
function select(value: typeof tab.value) { tab.value = tab.value === value ? '' : value; }
const channelDialog = ref<InstanceType<typeof ChannelSettings>>();
const channelError = ref('');
const channelBusy = ref(false);
async function connect(channel: ChatChannel, account?: Account) {
  if (!props.configure || channelBusy.value) return;
  channelError.value = '';
  channelBusy.value = true;
  try {
    if (account && !account.enabled) {
      await api(`/channel-accounts/${enc(account.key)}/${enc(channel)}/settings`, { method: 'PUT', body: { enabled: true, expectedBot: props.bot.id } });
      await load();
    } else await channelDialog.value?.begin(channel, account, props.bot.id, true);
  } catch (e) { channelError.value = (e as Error).message; }
  finally { channelBusy.value = false; }
}
let generation = 0,
  request = 0,
  timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  clearTimeout(timer);
  if (document.hidden) {
    timer = setTimeout(load, 5000);
    return;
  }
  const ticket = generation, version = ++request,
    id = props.bot.id;
  error.value = "";
  try {
    const [conversationsResult, accountsResult] = await Promise.allSettled([
      api<{ conversations: Conversation[] }>(`/conversations?bot=${enc(id)}`),
      props.configure ? api<{ accounts: Account[] }>(`/channel-accounts?bot=${enc(id)}`) : Promise.resolve({ accounts: [] as Account[] }),
    ]);
    if (ticket !== generation || version !== request) return;
    if (conversationsResult.status === 'fulfilled') conversations.value = conversationsResult.value.conversations;
    else error.value = conversationsResult.reason instanceof Error ? conversationsResult.reason.message : '会话读取失败';
    if (accountsResult.status === 'fulfilled') accounts.value = accountsResult.value.accounts.filter(account => account.defaultBot === id);
    else channelError.value = accountsResult.reason instanceof Error ? accountsResult.reason.message : '渠道读取失败';

  } catch (e) {
    if (ticket === generation && version === request) error.value = (e as Error).message;
  } finally {
    if (ticket === generation && version === request) timer = setTimeout(load, 5000);
  }
}
watch(
  [() => props.bot.id, () => props.configure],
  () => {
    generation++;
    tab.value = '';
    clearTimeout(timer);
    conversations.value = [];
    accounts.value = [];
    channelError.value = '';
    void load();
  },
  { immediate: true },
);
onBeforeUnmount(() => {
  generation++;
  clearTimeout(timer);
});
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
    <nav class="panel-views" aria-label="面板内容">
      <button type="button" class="icon-btn" aria-label="任务与审批" title="任务与审批" :aria-pressed="tab==='tasks'" @click="select('tasks')"><Icon name="tasks" :size="17" /></button>
      <button v-if="configure" type="button" class="icon-btn" aria-label="渠道" title="渠道" :aria-pressed="tab==='channels'" @click="select('channels')"><Icon name="link" :size="17" /></button>
      <button v-if="configure" type="button" class="icon-btn" aria-label="宿主工具" title="宿主工具" :aria-pressed="tab==='tools'" @click="select('tools')"><Icon name="monitor" :size="17" /></button>
      <button type="button" class="icon-btn" aria-label="历史与记忆" title="历史与记忆" :aria-pressed="tab==='history'" @click="select('history')"><Icon name="clock" :size="17" /></button>
    </nav>
    <div class="panel-body">
      <p v-if="error" class="notice" role="alert">{{ error }}</p>
      <template v-if="tab==='tasks'">
      <BackgroundTasks :key="bot.id" :bot="bot" :configure="configure" @open="emit('task', $event)" @saved="emit('saved')" />
      <BotApprovals :key="bot.id" :bot-id="bot.id" :configure="configure" :pending="pending" @changed="emit('saved')" />
      </template>
      <template v-if="configure && tab==='channels'">
      <BotChannels :key="bot.id" :accounts="accounts" :busy="channelBusy" @connect="connect" @edit="channelDialog?.editAccount($event)" @more="channelDialog?.begin(undefined, undefined, bot.id)" />
      <p v-if="channelError" class="notice" role="alert">{{ channelError }}</p>
      <PanelSection title="管理聊天渠道" help="管理分配给当前智能体的渠道账号；工作台设置可查看所有账号。">
        <ChannelSettings :key="bot.id" :bots="bots" :scope-bot="bot.id" :account-list="accounts" embedded @changed="load" />
      </PanelSection>
      </template>
      <HostToolsPane v-if="configure && tab==='tools'" :key="bot.id" :bot-id="bot.id" @saved="emit('saved')" />
      <template v-if="tab==='history'">
      <BotMemory v-if="configure" :key="bot.id" :bot="bot" @saved="emit('saved')" />
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
      </template>
    </div>
  </aside>
  <ChannelSettings v-if="configure" :key="bot.id" ref="channelDialog" :bots="bots" :scope-bot="bot.id" dialog-only @changed="load" @error="channelError = $event" />
  <ConversationHistory
    v-if="viewing"
    :key="viewing.id"
    :conversation="viewing"
    @close="viewing = null"
  />
</template>

<style scoped>
.panel-body { scrollbar-width: none; -ms-overflow-style: none; }
.panel-views { display:flex; align-items:center; gap:5px; padding:5px 10px; }
.panel-views button[aria-pressed="true"] { background:var(--pill); color:var(--fg); }
.panel-body::-webkit-scrollbar { display: none; width: 0; height: 0; }
.panel-body > :deep(.background-tasks > .list-head) { margin-top: 4px; }
.channel-manage-label { display:inline-flex; align-items:center; gap:5px; }
.channel-manage {
  flex: 0 1 auto;
  text-align: left;
}
.conversation-row {
  width: 100%;
  text-align: left;
}
.task-empty {
  margin: 0;
  padding: 8px 0;
  color: var(--muted);
  font-size: 12px;
}
</style>
