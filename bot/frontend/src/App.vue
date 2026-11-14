<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type {
  Bot,
  Group,
  Route,
  Status,
  AgentStatus,
  Task,
  CatalogEntry,
  ChannelConversation,
} from "./types";
import type { BotAppearance } from "../../shared/appearance/preferences";
import { api, enc } from "./api";
import { back, ready } from "./host";
import { identityFor } from "./identity";
import { userAvatarColor } from "./user-avatar";
import { useConversation } from "./conversation";
import Icon from "./components/Icon.vue";
import SettingsButton from './components/SettingsButton.vue';
import BotAvatar from "./components/BotAvatar.vue";
import HelpTip from "./components/HelpTip.vue";
import Modal from "./components/Modal.vue";
import BotEditor from "./components/BotEditor.vue";
import { editorSettings } from './bot-editor-options';
import ChatView from "./components/ChatView.vue";
import CatalogApp from "./components/CatalogApp.vue";
import SidebarSearch from "./components/SidebarSearch.vue";
import InfoPanel from "./components/InfoPanel.vue";
import SidebarBotRow from "./components/SidebarBotRow.vue";
import ChannelConversationView from "./components/ChannelConversation.vue";
import WorkspaceSettings from "./components/WorkspaceSettings.vue";
import TaskDetail from "./components/TaskDetail.vue";

function readRoute(): Route {
  try {
    const [kind, id = ""] = location.hash
      .replace(/^#\/?/, "")
      .split('?')[0]
      .split("/")
      .map(decodeURIComponent);
    return {
      kind: [
        "chat",
        "group",
        "tasks",
        "settings",
        "discover",
        "app",
        "conversation",
      ].includes(kind)
        ? (kind as Route["kind"])
        : "chat",
      id,
    };
  } catch {
    return { kind: "chat", id: "" };
  }
}
const route = ref<Route>(readRoute()),
  bots = ref<Bot[]>([]),
  groups = ref<Group[]>([]),
  models = ref<string[]>([]);
const status = ref<Status>(),
  agent = ref<AgentStatus>({}),
  loading = ref(true),
  error = ref(""),
  modelError = ref("");
const avatarColor = computed(() => userAvatarColor(status.value?.username || "Boost"));
const infoOpen = ref(false);
const initialized = ref(false);
const mobileOpen = ref(false),
  tasks = ref<Task[]>([]),
  catalog = ref<CatalogEntry[]>([]),
  panelBusy = ref(false);
const conversations = ref<ChannelConversation[]>([]);
const selectedConversation = computed(() =>
  conversations.value.find((c) => c.id === route.value.id),
);
const selectedTask = ref<Task | null>(null);
const previews = ref<Record<string, { text: string; at: number }>>({});
const panelError = ref(""),
  notice = ref("");
let disposed = false,
  refreshTimer: ReturnType<typeof setTimeout> | undefined;
const configure = computed(
  () => status.value?.capabilities?.configure === true,
);
const bot = computed(() =>
  bots.value.find(
    (b) =>
      b.id ===
      (route.value.kind === "conversation"
        ? selectedConversation.value?.botId
        : route.value.id),
  ),
);
const group = computed(() => groups.value.find((g) => g.id === route.value.id));
const sourceModels = ref<string[]>([]);
const conversationModels = computed(() => !bot.value || (bot.value.settings.modelSource||'default')==='default' ? models.value : sourceModels.value);
watch(() => [bot.value?.id,bot.value?.settings.modelSource], async (_value,_old,onCleanup) => {
  sourceModels.value=[];
  const source=bot.value?.settings.modelSource;
  if(!source||source==='default')return;
  const controller=new AbortController();onCleanup(()=>controller.abort());
  try{const value=await api<{models:string[]}>('/models?source='+enc(source),{signal:controller.signal});if(!controller.signal.aborted)sourceModels.value=value.models;}catch(e){if(!controller.signal.aborted)modelError.value=(e as Error).message;}
},{immediate:true});
const chat = reactive(
  useConversation(route, () => {
    void refresh();
  }),
);
const modal = ref<"bot" | "group" | "delete" | null>(null),
  saving = ref(false),
  formError = ref("");
const editId = ref(""),
  name = ref(""),
  prompt = ref(""),
  defaultModel = ref(""),
  members = ref<string[]>([]);
const appearance = ref<BotAppearance>(identityFor()),
  deleteKind = ref<"bots" | "groups">("bots");
const botSettings = reactive(editorSettings());
const createRequestId = ref("");
const confirmBotFull = ref(false);
const botSourceValid = ref(true);
const settingsBotId = ref(new URLSearchParams(location.hash.split('?')[1] || '').get('bot') || '');
const settingsReturn = ref<Route>({ kind: 'chat', id: '' });
const settingsPanel = ref<HTMLElement>();
watch(mobileOpen, async open => {
  if (route.value.kind !== 'settings') return;
  await nextTick();
  if (open) settingsPanel.value?.querySelector<HTMLInputElement>('input[type="search"]')?.focus();
  else document.querySelector<HTMLButtonElement>('[aria-controls="bot-settings-nav"]')?.focus();
});
function settingsKeydown(event: KeyboardEvent) {
  if (!mobileOpen.value || innerWidth > 800) return;
  if (event.key === 'Escape') { event.preventDefault(); mobileOpen.value = false; return; }
  if (event.key !== 'Tab') return;
  const elements = [...(settingsPanel.value?.querySelectorAll<HTMLElement>('button:not(:disabled),input:not(:disabled)') || [])].filter(el => el.getClientRects().length);
  const first = elements[0], last = elements.at(-1);
  if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last?.focus(); }
  else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first?.focus(); }
}
function settingsShortcut(event: KeyboardEvent) {
  if ((event.ctrlKey || event.metaKey) && event.key === ',' && !event.altKey && !modal.value) {
    event.preventDefault();
    if (route.value.kind === 'settings') exitSettings();
    else go('settings', 'general');
  }
}
function go(kind: Route["kind"], id = "") {
  if (kind === 'settings' && route.value.kind !== 'settings') {
    settingsReturn.value = { ...route.value };
    settingsBotId.value = bot.value?.id || bots.value[0]?.id || '';
  }
  location.hash = `/${kind}${id ? "/" + enc(id) : ""}${kind === 'settings' && settingsBotId.value ? '?bot=' + enc(settingsBotId.value) : ''}`;
  mobileOpen.value = false;
}
function changedRoute() {
  route.value = readRoute();
  if (route.value.kind === 'settings') settingsBotId.value = new URLSearchParams(location.hash.split('?')[1] || '').get('bot') || settingsBotId.value;
  void loadPanel();
}
function openSettings(id?: string, section = 'agent') {
  if (section === 'channels') go('settings', 'channels');
  else openBot(bots.value.find(item => item.id === id));
}
function exitSettings() {
  const previous = settingsReturn.value;
  const fallback = bots.value.find(item => item.id === settingsBotId.value)?.id || bots.value[0]?.id || '';
  go(previous.kind, previous.id || (previous.kind === 'chat' ? fallback : ''));
}
function setSettingsPosition(id: string) { const url = new URL(location.href); url.hash = '/settings/' + enc(id); history.replaceState(null, '', url); }
let refreshing: Promise<void> | undefined;
function refresh() {
  if (!refreshing) refreshing = refreshState().finally(() => { refreshing = undefined; });
  return refreshing;
}
async function refreshState() {
  try {
    const [b, g, a, c] = await Promise.all([
      api<{ bots: Bot[] }>("/bots"),
      api<{ groups: Group[] }>("/groups"),
      api<AgentStatus>("/agent"),
      api<{ conversations: ChannelConversation[] }>("/conversations"),
    ]);
    if (disposed) return;
    bots.value = b.bots;
    groups.value = g.groups;
    agent.value = a;
    conversations.value = c.conversations;
    const latest: Record<string, { text: string; at: number }> = {};
    for (const conversation of c.conversations) {
      if (
        conversation.peerId?.startsWith("group:") ||
        !conversation.lastMessage?.trim()
      )
        continue;
      if (
        !latest[conversation.botId] ||
        conversation.updatedAt > latest[conversation.botId].at
      )
        latest[conversation.botId] = {
          text: conversation.lastMessage
            .replace(/^⚠️\s*/, "")
            .replace(/\s+/g, " "),
          at: conversation.updatedAt,
        };
    }
    previews.value = latest;
    if (route.value.kind === "chat" && !route.value.id && b.bots[0])
      go("chat", b.bots[0].id);
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  }
}
async function connect() {
  const firstLoad = !initialized.value, startedAt = performance.now();
  loading.value = true;
  error.value = "";
  modelError.value = "";
  try {
    status.value = await api<Status>("/status");
    await refresh();
    const directory = await api<{ bots: CatalogEntry[] }>("/catalog");
    catalog.value = directory.bots;
    const m = await api<{ models: string[]; error?: string }>("/models");
    models.value = m.models;
    modelError.value =
      m.error ||
      (!m.models.length
        ? "未获取到可用模型，请检查 Boost 中的账户和模型配置。"
        : "");
    await loadPanel();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
    if (firstLoad) await new Promise(resolve => setTimeout(resolve, Math.max(0, 220 - (performance.now() - startedAt))));
    if (disposed) return;
    initialized.value = true;
    void ready();
  }
}
function poll() {
  refreshTimer = setTimeout(async () => {
    if (!document.hidden) await refresh();
    if (!disposed) poll();
  }, 10_000);
}
async function loadPanel() {
  const kind = route.value.kind;
  if (!["tasks", "discover"].includes(kind)) return;
  panelBusy.value = true;
  panelError.value = "";
  try {
    if (kind === "tasks") {
      const d = await api<{ tasks: Task[] }>("/tasks");
      if (route.value.kind === kind) tasks.value = d.tasks;
    } else {
      const d = await api<{ bots: CatalogEntry[] }>("/catalog");
      if (route.value.kind === kind) catalog.value = d.bots;
    }
  } catch (e) {
    panelError.value = (e as Error).message;
  } finally {
    panelBusy.value = false;
  }
}
function openBot(value?: Bot) {
  botSourceValid.value = (value?.settings.modelSource || 'default')==='default';
  createRequestId.value = value ? "" : crypto.randomUUID();
  editId.value = value?.id || "";
  name.value = value?.name || "";
  prompt.value = value?.systemPrompt || "";
  defaultModel.value = value?.defaultModel || "";
  appearance.value = identityFor(value);
  formError.value = "";
  modal.value = "bot";
  Object.assign(botSettings, editorSettings(value));
}
function openGroup(value?: Group) {
  editId.value = value?.id || "";
  name.value = value?.name || "";
  members.value = value ? [...value.members] : bot.value ? [bot.value.id] : [];
  formError.value = "";
  modal.value = "group";
}
async function saveBot(confirmed = false) {
  if (saving.value || !name.value.trim() || !botSourceValid.value) return;
  if (configure.value && botSettings.permission === 'full' && bots.value.find(bot => bot.id === editId.value)?.settings.permission !== 'full' && !confirmed) { confirmBotFull.value = true; return; }
  confirmBotFull.value = false;
  saving.value = true;
  formError.value = "";
  let identitySaved = false;
  try {
    const d = await api<{ bot: Bot }>(
      editId.value ? `/bots/${enc(editId.value)}` : "/bots",
      {
        method: editId.value ? "PUT" : "POST",
        body: {
          name: name.value.trim(),
          ...(!editId.value ? { requestId: createRequestId.value } : {}),
          systemPrompt: prompt.value,
          defaultModel: defaultModel.value,
          appearance: appearance.value,
          modelProtocol: botSettings.modelProtocol,
          modelStreaming: botSettings.modelStreaming,
          modelSource: botSettings.modelSource,
        },
      },
    );
    // Identity changes are available to members. Execution permissions remain admin-only.
    identitySaved = true;
    editId.value = d.bot.id;
    if (configure.value)
      await api(`/bots/${enc(d.bot.id)}/settings`, {
        method: "PUT",
        body: {
          permission: botSettings.permission,
          memory: {
            enabled: botSettings.memory,
            teamWrite: botSettings.teamWrite,
            review: botSettings.review,
          },
          paused: botSettings.paused,
          utilityModel: botSettings.utilityModel,
          taskSlots: botSettings.taskSlots,
          quietHours: {...botSettings.quietHours},
          nudge: botSettings.nudge,
          steward: {enabled:botSettings.steward},
          computerUse: {...botSettings.computerUse},
          collaboration: {enabled:botSettings.collaboration},
        },
      });
    await refresh();
    modal.value = null;
    go("chat", d.bot.id);
    notice.value = "智能体已保存";
  } catch (e) {
    formError.value = (identitySaved ? '资料已保存，运行选项尚未保存。请重试：' : '') + (e as Error).message;
  } finally {
    saving.value = false;
  }
}
async function saveGroup() {
  if (saving.value || members.value.length < 2) return;
  saving.value = true;
  formError.value = "";
  try {
    const d = await api<{ group: Group }>(
      editId.value ? `/groups/${enc(editId.value)}` : "/groups",
      {
        method: editId.value ? "PUT" : "POST",
        body: { name: name.value.trim(), members: members.value },
      },
    );
    await refresh();
    modal.value = null;
    go("group", d.group.id);
    notice.value = "协作群已保存";
  } catch (e) {
    formError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
function requestDelete(kind: "bots" | "groups") {
  deleteKind.value = kind;
  formError.value = "";
  modal.value = "delete";
}
function deleteBot(value: Bot) {
  openBot(value);
  requestDelete("bots");
}
async function remove() {
  if (saving.value) return;
  saving.value = true;
  try {
    await api(`/${deleteKind.value}/${enc(editId.value)}`, {
      method: "DELETE",
    });
    modal.value = null;
    go("chat");
    await refresh();
  } catch (e) {
    formError.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
const localized = (value?: string | Record<string, string>) =>
  typeof value === "string" ? value : value?.["zh-CN"] || value?.en || "";
async function install(entry: CatalogEntry) {
  if (entry.instanceId) { go('app', entry.instanceId); return; }
  if (panelBusy.value || !configure.value) return;
  panelBusy.value = true;
  panelError.value = "";
  try {
    const d = await api<{ bot: Bot }>(`/catalog/${enc(entry.id)}/install`, {
      method: "POST",
      body: {},
    });
    await refresh();
    go("app", d.bot.id);
  } catch (e) {
    panelError.value = (e as Error).message;
  } finally {
    panelBusy.value = false;
  }
}
async function browseCatalog(entry: CatalogEntry) {
  go('discover', entry.id);
  await nextTick();
  document.getElementById('catalog-' + entry.id)?.focus({ preventScroll: true });
  document.getElementById('catalog-' + entry.id)?.scrollIntoView({ block: 'nearest' });
}
async function testModel() {
  panelBusy.value = true;
  panelError.value = "";
  notice.value = "";
  try {
    const d = await api<{
      gateway: { ok: boolean; skipped?: boolean };
      direct: { ok: boolean };
      verdict: string;
    }>("/diagnostics/test-model", {
      method: "POST",
      body: { botId: settingsBotId.value || bot.value?.id || bots.value[0]?.id },
    });
    if (!(d.gateway.skipped ? d.direct.ok : d.gateway.ok))
      throw new Error(d.verdict || "模型测试未通过，请检查 Boost 配置。");
    notice.value = d.verdict;
  } catch (e) {
    panelError.value = (e as Error).message;
  } finally {
    panelBusy.value = false;
  }
}
function closeModal() {
  if (!saving.value) modal.value = null;
}
onMounted(() => {
  addEventListener('keydown', settingsShortcut);
  addEventListener("hashchange", changedRoute);
  void connect();
  poll();
});
onBeforeUnmount(() => {
  removeEventListener('keydown', settingsShortcut);
  disposed = true;
  clearTimeout(refreshTimer);
  removeEventListener("hashchange", changedRoute);
});
</script>

<template>
  <Transition name="boot-mask"><div v-if="!initialized" class="bot-loading-screen" role="status" aria-label="正在载入Boost工作台"><span class="loading-ring" /></div></Transition>
  <div
    class="app bot-studio"
    :inert="!initialized"
    :class="{ 'with-panel': infoOpen && route.kind === 'chat' && bot, 'settings-layout': route.kind === 'settings' }"
    data-bot-vue-workspace
  >
    <button
      v-if="mobileOpen"
      class="mobile-scrim"
      aria-label="关闭导航"
      @click="mobileOpen = false"
    />
    <aside v-if="route.kind !== 'settings'" class="side" :class="{ 'is-open': mobileOpen }">
      <header class="side-top">
        <button
          class="side-brand boost-brand-return"
          aria-label="双击返回 Boost"
          @dblclick="back"
          @click="($event as MouseEvent).detail === 0 && back()"
        >
          <BotAvatar brand :size="38" /><span>Boost</span></button
        ><button class="icon-btn" aria-label="新建智能体" @click="openBot()">
          <Icon name="plus" />
        </button>
      </header>
      <SidebarSearch :bots="bots" :groups="groups" @navigate="go" />
      <nav class="side-list" aria-label="工作台导航">
        <button
          class="nav-item"
          :class="{ sel: route.kind === 'discover' }"
          @click="go('discover')"
        >
          <Icon name="grid" />发现
        </button>
        <div class="section-head">我的</div>
        <p v-if="!bots.length" class="hint">
          {{ loading ? "正在加载…" : "创建你的第一位智能体" }}
        </p>
        <SidebarBotRow
          v-for="b in bots"
          :key="b.id"
          :bot="b"
          :conversations="conversations"
          :active="
            ['chat', 'app', 'conversation'].includes(route.kind) &&
            bot?.id === b.id
          "
          :conversation-id="
            route.kind === 'conversation' ? route.id : undefined
          "
          :preview="previews[b.id]?.text"
          :working="agent.busy?.includes(b.id)"
          :manage="configure"
          @edit="openSettings(b.id)"
          @delete="deleteBot(b)"
          @open="
            go(
              b.origin === 'catalog' && b.app && configure ? 'app' : 'chat',
              b.id,
            )
          "
          @conversation="(value) => go('conversation', value.id)"
        />
        <template v-if="groups.length"
          ><div class="section-head">
            协作群聊<button
              class="icon-btn"
              aria-label="新建协作群"
              @click="openGroup()"
            >
              <Icon name="plus" :size="16" />
            </button>
          </div>
          <button
            v-for="g in groups"
            :key="g.id"
            class="thread"
            :class="{ sel: route.kind === 'group' && route.id === g.id }"
            @click="go('group', g.id)"
          >
            <span class="group-mark"><Icon name="team" /></span
            ><span class="body"
              ><span class="line"
                ><span class="title">{{ g.name }}</span
                ><Icon v-if="g.running" name="clock" :size="14" /></span
              ><span v-if="g.last?.text" class="snip">{{
                g.last.text
              }}</span></span
            >
          </button></template
        >
        <template v-if="catalog.length"
          ><div class="section-head">上新</div>
          <button
            v-for="entry in catalog.filter((e) => !e.instanceId)"
            :key="entry.id"
            class="thread"
            @click="browseCatalog(entry)"
          >
            <BotAvatar
              :bot="{ id: entry.id, name: localized(entry.name) } as Bot"
              :size="38"
            /><span class="body"
              ><span class="line"
                ><span class="title">{{ localized(entry.name) }}</span></span
              ></span
            >
          </button></template
        >
      </nav>
      <footer class="side-foot">
        <button class="side-user" @click="go('settings')">
          <span class="user-avatar" :style="{ '--user-avatar-color': avatarColor }">{{
            (status?.username || "Boost").slice(0, 1).toUpperCase()
          }}</span
          ><span>{{ status?.username || "Boost" }}</span></button
        ><SettingsButton @click="go('settings', 'general')" />
      </footer>
    </aside>
    <main class="main workspace-main" v-spring-page="route.kind + '/' + route.id" :inert="route.kind === 'settings' && mobileOpen">
      <div v-if="error" class="error-banner" role="alert">
        <Icon name="info" /><span>{{ error }}</span
        ><button class="quiet-button" :disabled="loading" @click="connect">
          重试
        </button>
      </div>
      <div v-if="modelError" class="error-banner" role="alert">
        <Icon name="info" /><span>{{ modelError }}</span
        ><button class="quiet-button" @click="go('settings')">检查配置</button>
      </div>
      <div v-if="notice" class="notice-banner" role="status">
        <Icon name="check" :size="16" /><span>{{ notice }}</span
        ><button class="icon-button" aria-label="关闭提示" @click="notice = ''">
          <Icon name="close" :size="14" />
        </button>
      </div>
      <ChatView
        v-if="
          (route.kind === 'chat' && bot) || (route.kind === 'group' && group)
        "
        :chat="chat"
        :bot="bot"
        :group="group"
        :bots="bots"
        :models="conversationModels"
        :configure="configure"
        :info-open="infoOpen"
        @info="infoOpen = !infoOpen"
        @refresh="refresh"
        @edit="group ? openGroup(group) : openSettings(bot?.id)"
        @collaborate="openGroup()"
        @menu="mobileOpen = true"
      />
      <ChannelConversationView
        v-else-if="route.kind === 'conversation' && selectedConversation"
        :key="selectedConversation.id"
        :conversation="selectedConversation"
        @menu="mobileOpen = true"
        @direct="go('chat', selectedConversation.botId)"
      />
      <CatalogApp
        v-else-if="route.kind === 'app' && bot"
        :key="bot.id"
        :bot="bot"
        :configure="configure"
        :models="conversationModels"
        @chat="go('chat', bot.id)"
        @settings="openSettings(bot.id, 'channels')"
        @refresh="refresh"
        @edit="openSettings(bot.id)"
        @delete="deleteBot(bot)"
        @menu="mobileOpen = true"
      />
      <section v-else class="workspace-panel">
        <header class="workspace-head" :class="{ 'settings-page-head': route.kind === 'settings' }">
          <button
            class="icon-button mobile-menu"
            :aria-label="route.kind === 'settings' ? '打开设置导航' : '打开导航'"
            :aria-controls="route.kind === 'settings' ? 'bot-settings-nav' : undefined"
            :aria-expanded="mobileOpen"
            @click="mobileOpen = true"
          >
            <Icon name="menu" />
          </button>
          <button v-if="route.kind === 'settings'" class="icon-btn" aria-label="返回智能体工作台" @click="exitSettings"><Icon name="back" /></button>
          <h1>
            {{
              route.kind === "settings"
                ? "设置"
                : route.kind === "tasks"
                  ? "任务记录"
                  : route.kind === "discover"
                    ? "能力中心"
                    : "智能体工作台"
            }}
          </h1>
          <span class="head-spacer" /><button v-if="route.kind !== 'settings'"
            class="icon-button"
            aria-label="刷新"
            :disabled="panelBusy"
            @click="loadPanel"
          >
            <Icon name="refresh" />
          </button>
        </header>
        <div class="panel-content" :class="{ 'settings-host': route.kind === 'settings' }">
          <div v-if="panelError" class="error-banner" role="alert">
            {{ panelError }}
          </div>
          <WorkspaceSettings v-if="route.kind === 'settings'" :bots="bots" :models="models" :status="status" :configure="configure" :busy="panelBusy" :section="route.id" @section="(id) => go('settings', id)" @position="setSettingsPosition" @edit="openBot" @delete="deleteBot" @group="openGroup()" @reconnect="connect" @test="testModel" @saved="refresh" @navigate="mobileOpen = false" @exit="exitSettings" />
          <template v-else-if="route.kind === 'tasks'"
            ><div v-if="panelBusy" class="empty-state" role="status">
              正在加载任务…
            </div>
            <div v-else-if="!tasks.length" class="empty-state">
              <Icon name="tasks" :size="36" />
              <h2>暂无后台任务</h2>
              <button class="quiet-button" @click="go('chat', bots[0]?.id)">
                与智能体开始工作
              </button>
            </div>
            <article v-for="task in tasks" :key="task.id" class="task-card">
              <BotAvatar :bot="bots.find((b) => b.id === task.botId)" />
              <div>
                <h3>{{ task.title }}</h3>
                <p>{{ task.summary }}</p>
              </div>
              <span class="state-chip">{{
                task.stage?.label || task.status
              }}</span
              ><button class="quiet-button" @click="selectedTask = task">
                查看记录
              </button>
            </article></template
          >
          <template v-else-if="route.kind === 'discover'"
            ><div class="panel-intro">
              <span class="eyebrow">CAPABILITIES</span>
              <h2>为不同工作，找到合适的智能体
              <HelpTip
                text="内置应用安装后作为独立 Bot 运行。其工具操作需要管理员授权；成员可使用普通对话与群聊。"
              /></h2>
            </div>
            <div class="catalog-grid">
              <article
                v-for="entry in catalog"
                :key="entry.id"
                :id="'catalog-' + entry.id"
                tabindex="-1"
                class="catalog-card"
              >
                <BotAvatar :bot="bots.find((item) => item.id === entry.instanceId) || { id: entry.id, name: localized(entry.name) } as Bot" :size="54" />
                <div class="catalog-card-body"><div class="catalog-card-title"><h3>{{ localized(entry.name) }}</h3>
                <HelpTip
                  :text="localized(entry.description || entry.summary)"
                  label="查看能力说明"
                /></div>
                <button
                  class="primary-button"
                  :disabled="!configure || panelBusy"
                  @click="install(entry)"
                >
                  {{ entry.instanceId ? "打开应用" : "添加智能体" }}
                </button>
                </div>
              </article>
              <div class="catalog-card create-card">
                <svg class="catalog-placeholder" width="54" height="54" viewBox="0 0 64 64" fill="none" aria-hidden="true"><path d="M20 9h24c6 0 9 4 11 11l4 17c1 5-1 9-6 12l-12 7c-6 3-12 3-18 0l-12-7c-5-3-7-7-6-12l4-17c2-7 5-11 11-11Z" stroke="currentColor" stroke-width="2" stroke-dasharray="3 4" stroke-linecap="round"/><path d="M25 26v10m14-10v10" stroke="currentColor" stroke-width="4" stroke-linecap="round"/></svg>
                <div class="catalog-card-body"><div class="catalog-card-title"><h3>自定义</h3><HelpTip text="设置角色、外观与模型" label="自定义说明" /></div><button class="quiet-button custom-create-button" :disabled="!configure" @click="openBot()"><Icon name="plus" :size="12" />自定义</button></div>
              </div>
            </div></template
          >
          <div v-else class="empty-state">
            <BotAvatar brand :size="88" />
            <h2>{{ loading ? "正在连接工作台" : "建立你的智能体团队" }}</h2>
            <button v-if="!loading" class="primary-button" @click="openBot()">
              新建智能体
            </button>
          </div>
        </div>
      </section>
    </main>
    <div
      v-if="infoOpen && route.kind === 'chat' && bot"
      class="panel-scrim"
      @click="infoOpen = false"
    />
    <InfoPanel
      v-if="infoOpen && route.kind === 'chat' && bot"
      :bot="bot"
      :configure="configure"
      :pending="chat.pending"
      :conversation-id="chat.conversationId"
      :messages="chat.messages"
      :live="chat.live"
      @close="infoOpen = false"
      @edit="openSettings(bot.id)"
      @delete="deleteBot(bot)"
      @settings="openSettings(bot.id, 'channels')"
      @approvals="infoOpen = false"
      @task="selectedTask = $event"
      @tasks="go('tasks')"
    />
    <aside v-if="route.kind === 'settings'" ref="settingsPanel" class="settings-side" :class="{ 'is-open': mobileOpen }" aria-label="设置导航面板" :role="mobileOpen ? 'dialog' : undefined" :aria-modal="mobileOpen || undefined" @keydown="settingsKeydown">
      <header class="settings-side-head"><Icon name="settings" :size="20" /><h2>设置</h2><button class="icon-btn settings-nav-close" aria-label="关闭设置导航" @click="mobileOpen = false"><Icon name="close" /></button></header>
      <div id="bot-settings-nav" class="settings-nav-host" />
    </aside>
    <TaskDetail
      v-if="selectedTask"
      :key="selectedTask.id"
      :task="selectedTask"
      :configure="configure"
      @close="selectedTask = null"
    />
    <Modal :busy="saving"
      v-if="modal === 'bot'"
      :title="editId ? '智能体设置' : '创建智能体'"
      wide
      @close="closeModal"
      ><form class="editor-form bot-editor-form" @submit.prevent="saveBot()">
        <BotEditor v-model:name="name" v-model:prompt="prompt" v-model:model="defaultModel" v-model:appearance="appearance" :settings="botSettings" @update:settings="Object.assign(botSettings, $event)" @valid="botSourceValid = $event" :models="models" :configure="configure" :editing="!!editId" :busy="saving" :target-name="bots.find(item=>item.id===editId)?.name" />
        <footer class="dialog-actions">
          <p v-if="formError" class="error-banner" role="alert">{{ formError }}</p>
          <button
            v-if="editId"
            type="button"
            class="danger-button"
            :disabled="saving"
            @click="requestDelete('bots')"
          >
            删除智能体</button
          ><span class="head-spacer" /><button data-dialog-close
            type="button"
            class="quiet-button"
            :disabled="saving"
            @click="closeModal"
          >
            取消</button
          ><button
            type="submit"
            class="primary-button"
            :disabled="saving || !name.trim() || !botSourceValid"
          >
            {{ saving ? "保存中…" : "保存智能体" }}
          </button>
        </footer>
      </form></Modal
    >
    <Modal v-if="confirmBotFull" title="启用完全权限" @close="confirmBotFull = false"><p class="permission-confirm-copy">此智能体将能够以当前用户身份访问工作区外文件并执行命令。请确认你信任它的职责和工具操作。</p><footer class="permission-confirm-actions"><button data-dialog-close class="quiet-button" @click="confirmBotFull = false">取消</button><button class="danger-button" @click="saveBot(true)">确认启用</button></footer></Modal>
    <Modal :busy="saving"
      v-if="modal === 'group'"
      :title="editId ? '协作群设置' : '创建协作群'"
      @close="closeModal"
      ><form class="editor-form" @submit.prevent="saveGroup">
        <div v-if="formError" class="error-banner" role="alert">
          {{ formError }}
        </div>
        <label
          >群名称<input
            v-model="name"
            maxlength="80"
            placeholder="例如：产品研究团队"
        /></label>
        <div class="field-heading member-heading">
          <strong>邀请成员<HelpTip
            text="至少选择两位智能体。群消息独立保存，不会自动转发成员的私聊历史。"
          /></strong><span>{{ members.length }} 位已选</span>
        </div>
        <div class="member-picker">
          <label
            v-for="b in bots"
            :key="b.id"
            :class="{ selected: members.includes(b.id) }"
            ><input v-model="members" type="checkbox" :value="b.id" /><BotAvatar
              :bot="b"
              :size="28"
            /><span>{{ b.name }}</span></label
          >
        </div>
        <p v-if="bots.length < 2" class="error-banner">
          需要至少两位智能体，请先创建更多智能体。
        </p>
        <footer class="dialog-actions">
          <button
            v-if="editId"
            type="button"
            class="danger-button"
            :disabled="saving"
            @click="requestDelete('groups')"
          >
            删除群聊</button
          ><span class="head-spacer" /><button data-dialog-close
            type="button"
            class="quiet-button"
            :disabled="saving"
            @click="closeModal"
          >
            取消</button
          ><button
            class="primary-button"
            type="submit"
            :disabled="saving || members.length < 2"
          >
            {{ saving ? "保存中…" : editId ? "保存群聊" : "创建群聊" }}
          </button>
        </footer>
      </form></Modal
    >
    <Modal :busy="saving" v-if="modal === 'delete'" title="确认删除" @close="closeModal"
      ><div class="editor-form">
        <p>确定删除「{{ name }}」？相关会话、任务和配置将被移除，此操作无法撤销。<template v-if="deleteKind === 'bots' && bots.find(item => item.id === editId)?.origin !== 'catalog'">自建智能体的工作区文件会保留。</template></p>
        <div v-if="formError" class="error-banner" role="alert">
          {{ formError }}
        </div>
        <footer class="dialog-actions">
          <button data-dialog-close class="quiet-button" :disabled="saving" @click="closeModal">
            取消</button
          ><button class="danger-button" :disabled="saving" @click="remove">
            {{ saving ? "删除中…" : "确认删除" }}
          </button>
        </footer>
      </div></Modal
    >
  </div>
</template>
