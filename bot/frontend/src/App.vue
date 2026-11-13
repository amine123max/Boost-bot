<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, reactive, ref } from "vue";
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
import { useConversation } from "./conversation";
import Icon from "./components/Icon.vue";
import BotAvatar from "./components/BotAvatar.vue";
import HelpTip from "./components/HelpTip.vue";
import Modal from "./components/Modal.vue";
import AppearancePicker from "./components/AppearancePicker.vue";
import ChatView from "./components/ChatView.vue";
import CatalogApp from "./components/CatalogApp.vue";
import SidebarSearch from "./components/SidebarSearch.vue";
import InfoPanel from "./components/InfoPanel.vue";
import SidebarBotRow from "./components/SidebarBotRow.vue";
import ChannelConversationView from "./components/ChannelConversation.vue";
import ThemePicker from "./components/ThemePicker.vue";
import ChannelSettings from "./components/ChannelSettings.vue";
import TaskDetail from "./components/TaskDetail.vue";

function readRoute(): Route {
  try {
    const [kind, id = ""] = location.hash
      .replace(/^#\/?/, "")
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
const infoOpen = ref(true);
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
const botSettings = reactive({
  permission: "workspace",
  memory: true,
  teamWrite: false,
  paused: false,
  modelProtocol: "auto",
  modelStreaming: true,
});
const templates = [
  {
    name: "研究分析",
    prompt:
      "你是研究分析师。先明确问题、范围和证据要求，区分事实与推断，核对来源，输出可追溯的结论。需要其他成员协助时，明确交接任务和交付要求。",
  },
  {
    name: "开发工程",
    prompt:
      "你是软件工程师。先理解现有实现和约束，提出最小必要改动，完成实现与验证，报告结果与未解决的问题。协作时说明输入、输出与验收标准。",
  },
  {
    name: "内容策划",
    prompt:
      "你是内容策划师。根据目标读者与传播目的组织结构，校验事实，使用准确简练的表达。协作时将待核实的信息交给适合的成员。",
  },
];
function go(kind: Route["kind"], id = "") {
  location.hash = `/${kind}${id ? "/" + enc(id) : ""}`;
  mobileOpen.value = false;
}
function changedRoute() {
  route.value = readRoute();
  void loadPanel();
}
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
  editId.value = value?.id || "";
  name.value = value?.name || "";
  prompt.value = value?.systemPrompt || "";
  defaultModel.value = value?.defaultModel || "";
  appearance.value = identityFor(value);
  formError.value = "";
  modal.value = "bot";
  botSettings.permission = value?.settings.permission || "workspace";
  botSettings.memory = value?.settings.memory.enabled ?? true;
  botSettings.teamWrite = value?.settings.memory.teamWrite ?? false;
  botSettings.paused = value?.settings.paused ?? false;
  botSettings.modelProtocol = value?.settings.modelProtocol ?? "auto";
  botSettings.modelStreaming = value?.settings.modelStreaming ?? true;
}
function openGroup(value?: Group) {
  editId.value = value?.id || "";
  name.value = value?.name || "";
  members.value = value ? [...value.members] : bot.value ? [bot.value.id] : [];
  formError.value = "";
  modal.value = "group";
}
async function saveBot() {
  if (saving.value || !name.value.trim()) return;
  saving.value = true;
  formError.value = "";
  try {
    const d = await api<{ bot: Bot }>(
      editId.value ? `/bots/${enc(editId.value)}` : "/bots",
      {
        method: editId.value ? "PUT" : "POST",
        body: {
          name: name.value.trim(),
          systemPrompt: prompt.value,
          defaultModel: defaultModel.value,
          appearance: appearance.value,
          modelProtocol: botSettings.modelProtocol,
          modelStreaming: botSettings.modelStreaming,
        },
      },
    );
    // Identity changes are available to members. Execution permissions remain admin-only.
    editId.value = d.bot.id;
    if (configure.value)
      await api(`/bots/${enc(d.bot.id)}/settings`, {
        method: "PUT",
        body: {
          permission: botSettings.permission,
          memory: {
            enabled: botSettings.memory,
            teamWrite: botSettings.teamWrite,
          },
          paused: botSettings.paused,
        },
      });
    await refresh();
    modal.value = null;
    go("chat", d.bot.id);
    notice.value = "智能体已保存";
  } catch (e) {
    formError.value = (e as Error).message;
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
      body: { botId: bots.value[0]?.id },
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
  addEventListener("hashchange", changedRoute);
  void connect();
  poll();
});
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(refreshTimer);
  removeEventListener("hashchange", changedRoute);
});
</script>

<template>
  <div
    class="app bot-studio"
    :class="{ 'with-panel': infoOpen && route.kind === 'chat' && bot }"
    data-bot-vue-workspace
  >
    <button
      v-if="mobileOpen"
      class="mobile-scrim"
      aria-label="关闭导航"
      @click="mobileOpen = false"
    />
    <aside class="side" :class="{ 'is-open': mobileOpen }">
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
            :disabled="!configure || panelBusy"
            @click="install(entry)"
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
          <span class="user-avatar">{{
            (status?.username || "Boost").slice(0, 1).toUpperCase()
          }}</span
          ><span>{{ status?.username || "Boost" }}</span></button
        ><button class="icon-btn" aria-label="设置" @click="go('settings')">
          <Icon name="settings" />
        </button>
      </footer>
    </aside>
    <main class="main workspace-main">
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
        :models="models"
        :configure="configure"
        :info-open="infoOpen"
        @info="infoOpen = !infoOpen"
        @edit="group ? openGroup(group) : openBot(bot)"
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
        @chat="go('chat', bot.id)"
        @settings="go('settings')"
        @menu="mobileOpen = true"
      />
      <section v-else class="workspace-panel">
        <header class="workspace-head">
          <button
            class="icon-button mobile-menu"
            aria-label="打开导航"
            @click="mobileOpen = true"
          >
            <Icon name="menu" />
          </button>
          <h1>
            {{
              route.kind === "settings"
                ? "工作台设置"
                : route.kind === "tasks"
                  ? "任务记录"
                  : route.kind === "discover"
                    ? "能力中心"
                    : "智能体工作台"
            }}
          </h1>
          <span class="head-spacer" /><button
            class="icon-button"
            aria-label="刷新"
            :disabled="panelBusy"
            @click="loadPanel"
          >
            <Icon name="refresh" />
          </button>
        </header>
        <div class="panel-content">
          <div v-if="panelError" class="error-banner" role="alert">
            {{ panelError }}
          </div>
          <div v-if="route.kind === 'settings'" class="settings-grid">
            <section class="settings-card">
              <h2>外观</h2>
              <ThemePicker />
            </section>
            <ChannelSettings v-if="configure" :bots="bots" />
            <section class="settings-card">
              <h2>
                模型与运行环境<HelpTip
                  text="模型、账户和计费由 Boost 管理。连接失败时先确认账户可用、模型已启用，再进行连接测试。"
                />
              </h2>
              <dl>
                <div>
                  <dt>运行版本</dt>
                  <dd>{{ status?.version || "尚未连接" }}</dd>
                </div>
                <div>
                  <dt>可用模型</dt>
                  <dd>{{ models.length }}</dd>
                </div>
                <div>
                  <dt>当前权限</dt>
                  <dd>{{ configure ? "管理员" : "成员" }}</dd>
                </div>
              </dl>
              <div class="button-row">
                <button class="quiet-button" @click="connect">重新连接</button
                ><button
                  v-if="configure"
                  class="primary-button"
                  :disabled="panelBusy"
                  @click="testModel"
                >
                  {{ panelBusy ? "测试中…" : "测试模型连接" }}</button
                ><button class="quiet-button" @click="back">
                  返回 Boost 配置
                </button>
              </div>
            </section>
            <section class="settings-card">
              <h2>
                协作规则<HelpTip
                  text="群聊中先点名成员或所有人。Bot 可点名其他成员接手；单条用户消息最多自动接力 6 次。工具执行始终遵循成员权限和审批要求。"
                />
              </h2>
              <div class="setting-row">
                <span>群聊成员</span><span>至少 2 位</span>
              </div>
              <div class="setting-row">
                <span>自动接力上限</span><span>6 次／消息</span>
              </div>
              <button class="quiet-button" @click="openGroup()">
                <Icon name="team" />创建协作群
              </button>
            </section>
          </div>
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
              <h2>为不同工作，找到合适的智能体</h2>
              <HelpTip
                text="内置应用安装后作为独立 Bot 运行。其工具操作需要管理员授权；成员可使用普通对话与群聊。"
              />
            </div>
            <div class="catalog-grid">
              <article
                v-for="entry in catalog"
                :key="entry.id"
                class="catalog-card"
              >
                <span class="catalog-icon"
                  ><Icon name="grid" :size="26"
                /></span>
                <h3>{{ localized(entry.name) }}</h3>
                <HelpTip
                  :text="localized(entry.description || entry.summary)"
                  label="查看能力说明"
                />
                <button
                  class="primary-button"
                  :disabled="!configure || panelBusy"
                  @click="install(entry)"
                >
                  {{ entry.instanceId ? "打开应用" : "添加智能体" }}
                </button>
              </article>
              <button class="catalog-card create-card" @click="openBot()">
                <Icon name="plus" :size="28" />
                <h3>自定义智能体</h3>
                <span>设置角色、外观与模型</span>
              </button>
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
      @close="infoOpen = false"
      @edit="openBot(bot)"
      @settings="go('settings')"
      @approvals="infoOpen = false"
    />
    <TaskDetail
      v-if="selectedTask"
      :task="selectedTask"
      :configure="configure"
      @close="selectedTask = null"
    />
    <Modal
      v-if="modal === 'bot'"
      :title="editId ? '智能体设置' : '创建智能体'"
      @close="closeModal"
      ><form class="editor-form" @submit.prevent="saveBot">
        <div v-if="formError" class="error-banner" role="alert">
          {{ formError }}
        </div>
        <AppearancePicker v-model="appearance" /><label
          >名称<input
            v-model="name"
            required
            maxlength="60"
            placeholder="为智能体命名" /></label
        ><label
          ><span
            >角色与职责<HelpTip
              text="描述专长、工作方式与交付要求。人设不会扩大工具权限。" /></span
          ><textarea
            v-model="prompt"
            rows="4"
            placeholder="你希望这位智能体负责什么？"
          />
        </label>
        <div v-if="!editId" class="template-chips">
          <button
            v-for="t in templates"
            type="button"
            class="member-chip"
            @click="
              name = t.name;
              prompt = t.prompt;
            "
          >
            {{ t.name }}
          </button>
        </div>
        <label
          >默认模型<select v-model="defaultModel">
            <option value="">跟随 Boost 默认模型</option>
            <option
              v-if="defaultModel && !models.includes(defaultModel)"
              :value="defaultModel"
            >
              {{ defaultModel }}
            </option>
            <option v-for="m in models" :value="m">{{ m }}</option>
          </select></label
        >
        <label
          ><span
            >请求格式<HelpTip
              text="纯对话与代理不可用时的回退请求可选择 Chat Completions、Responses 或 Messages。代理工具模式使用模型原生适配器。" /></span
          ><select v-model="botSettings.modelProtocol">
            <option value="auto">自动兼容</option>
            <option value="chat">Chat Completions</option>
            <option value="responses">Responses</option>
            <option value="messages">Messages</option>
          </select></label
        >
        <label class="checkbox-label"
          ><input
            v-model="botSettings.modelStreaming"
            type="checkbox" />流式模型响应<HelpTip
            text="关闭后使用上游 JSON 响应，工作台仍保留执行状态和错误反馈。"
        /></label>
        <details v-if="configure" class="advanced-settings">
          <summary>执行与记忆设置</summary>
          <label
            >执行权限<select v-model="botSettings.permission">
              <option value="readonly">只读</option>
              <option value="workspace">工作区内写入</option>
              <option value="full">完全权限</option>
            </select></label
          >
          <p v-if="botSettings.permission === 'full'" class="error-banner">
            完全权限允许以当前用户身份读写工作区外文件。仅为可信智能体启用。
          </p>
          <label class="checkbox-label"
            ><input
              v-model="botSettings.memory"
              type="checkbox"
            />启用长期记忆</label
          ><label class="checkbox-label"
            ><input
              v-model="botSettings.teamWrite"
              type="checkbox" />允许写入团队共享记忆<HelpTip
              text="共享记忆会被其他成员读取，不要写入凭据或不适合共享的信息。" /></label
          ><label class="checkbox-label"
            ><input
              v-model="botSettings.paused"
              type="checkbox"
            />暂停后台任务</label
          >
        </details>
        <footer class="dialog-actions">
          <button
            v-if="editId"
            type="button"
            class="danger-button"
            :disabled="saving"
            @click="requestDelete('bots')"
          >
            删除智能体</button
          ><span class="head-spacer" /><button
            type="button"
            class="quiet-button"
            :disabled="saving"
            @click="closeModal"
          >
            取消</button
          ><button
            type="submit"
            class="primary-button"
            :disabled="saving || !name.trim()"
          >
            {{ saving ? "保存中…" : "保存智能体" }}
          </button>
        </footer>
      </form></Modal
    >
    <Modal
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
        <div class="field-heading">
          邀请成员 <span>{{ members.length }} 位已选</span
          ><HelpTip
            text="至少选择两位智能体。群消息独立保存，不会自动转发成员的私聊历史。"
          />
        </div>
        <div class="member-picker">
          <label
            v-for="b in bots"
            :key="b.id"
            :class="{ selected: members.includes(b.id) }"
            ><input v-model="members" type="checkbox" :value="b.id" /><BotAvatar
              :bot="b"
              :size="36"
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
          ><span class="head-spacer" /><button
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
    <Modal v-if="modal === 'delete'" title="确认删除" @close="closeModal"
      ><div class="editor-form">
        <p>确定删除「{{ name }}」？相关会话和数据将被移除，此操作无法撤销。</p>
        <div v-if="formError" class="error-banner" role="alert">
          {{ formError }}
        </div>
        <footer class="dialog-actions">
          <button class="quiet-button" :disabled="saving" @click="closeModal">
            取消</button
          ><button class="danger-button" :disabled="saving" @click="remove">
            {{ saving ? "删除中…" : "确认删除" }}
          </button>
        </footer>
      </div></Modal
    >
  </div>
</template>
