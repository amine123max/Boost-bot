<script setup lang="ts">
import {
  computed,
  nextTick,
  onBeforeUnmount,
  onMounted,
  ref,
  watch,
} from "vue";
import type { Bot, Status } from "../types";
import { api } from "../api";
import { back } from "../host";
import { preferences, savePreferences } from "../preferences";
import { settingsSection, settingsSections } from "../settings-navigation";
import SettingsNavigation from "./SettingsNavigation.vue";
import SettingsButton from "./SettingsButton.vue";
import SettingRow from "./SettingRow.vue";
import ModelSelect from "./ModelSelect.vue";
import SelectControl from "./SelectControl.vue";
import HelpTip from "./HelpTip.vue";
import ThemePicker from "./ThemePicker.vue";
import ChannelSettings from "./ChannelSettings.vue";
import ConnectedAccounts from "./ConnectedAccounts.vue";
import BotAvatar from "./BotAvatar.vue";
import SettingsBanner from "./SettingsBanner.vue";
const props = defineProps<{
  bots: Bot[];
  models: string[];
  status?: Status;
  configure: boolean;
  busy: boolean;
  section?: string;
}>();
const emit = defineEmits<{
  edit: [bot: Bot];
  delete: [bot: Bot];
  reconnect: [];
  test: [];
  saved: [];
  section: [id: string];
  position: [id: string];
  navigate: [];
  exit: [];
}>();
interface RuntimeSettings {
  defaultModel: string;
  reasoningEffort: string;
  dataDir: string;
  desktop: boolean;
  webSearch: { provider: string; url?: string; hasKey?: boolean };
}
const settings = ref<RuntimeSettings>(),
  searchKey = ref(""),
  loading = ref(true),
  saving = ref(false),
  error = ref(""),
  saved = ref(""),
  loadError = ref(false),
  scrollRoot = ref<HTMLElement>();
const active = ref(settingsSection(props.section).id);
const activeSection = computed(() => settingsSection(active.value));
let frame = 0,
  navigating = false;
function jump(id: string) {
  const section = settingsSection(id);
  active.value = section.id;
  navigating = true;
  requestAnimationFrame(() => {
    navigating = false;
  });
  const root = scrollRoot.value,
    node = root?.querySelector<HTMLElement>(
      '[data-settings-section="' + section.id + '"]',
    );
  if (root && node)
    root.scrollTo({
      top:
        root.scrollTop +
        node.getBoundingClientRect().top -
        root.getBoundingClientRect().top,
      behavior:
        preferences.motion === "full" &&
        !matchMedia("(prefers-reduced-motion: reduce)").matches
          ? "smooth"
          : "auto",
    });
}
function navigate(id: string) {
  jump(id);
  emit("section", id);
  emit("navigate");
}
function sync() {
  if (frame || navigating) return;
  frame = requestAnimationFrame(() => {
    frame = 0;
    const root = scrollRoot.value;
    if (!root) return;
    const nodes = [
      ...root.querySelectorAll<HTMLElement>("[data-settings-section]"),
    ];
    let chosen = nodes[0];
    for (const node of nodes)
      if (
        node.getBoundingClientRect().top <=
        root.getBoundingClientRect().top + 4
      )
        chosen = node;
    if (root.scrollTop + root.clientHeight >= root.scrollHeight - 2)
      chosen = nodes.at(-1) || chosen;
    const id = chosen?.dataset.settingsSection;
    if (id && active.value !== id) {
      active.value = settingsSection(id).id;
      emit("position", id);
    }
  });
}
async function load() {
  loading.value = true;
  loadError.value = false;
  error.value = "";
  try {
    settings.value = await api<RuntimeSettings>("/settings");
  } catch (e) {
    loadError.value = true;
    error.value = (e as Error).message;
  } finally {
    loading.value = false;
  }
}
async function save() {
  if (saving.value || !settings.value || !props.configure) return;
  saving.value = true;
  error.value = "";
  saved.value = "";
  const snapshot = JSON.parse(
    JSON.stringify(settings.value),
  ) as RuntimeSettings;
  try {
    await api("/settings", {
      method: "PUT",
      body: {
        defaultModel: snapshot.defaultModel,
        reasoningEffort: snapshot.reasoningEffort,
        webSearch: {
          provider: snapshot.webSearch.provider,
          ...(snapshot.webSearch.provider === "searxng"
            ? { url: snapshot.webSearch.url || "" }
            : {}),
          ...(searchKey.value.trim() ? { key: searchKey.value.trim() } : {}),
        },
      },
    });
    searchKey.value = "";
    saved.value = "设置已保存";
    emit("saved");
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    saving.value = false;
  }
}
watch(
  () => props.section,
  async (id) => {
    await nextTick();
    jump(id || "general");
  },
);
onMounted(async () => {
  await load();
  await nextTick();
  jump(props.section || "general");
});
onBeforeUnmount(() => cancelAnimationFrame(frame));
</script>
<template>
  <div class="workspace-settings">
    <Teleport defer to="#bot-settings-nav"
      ><SettingsNavigation
        :selected="active"
        :busy="saving"
        @select="navigate"
        @exit="emit('exit')"
    /></Teleport>
    <SettingsBanner
      :title="activeSection.label"
      :help="activeSection.help"
      :section-id="activeSection.id"
      class="preferences-banner"
    />
    <section
      ref="scrollRoot"
      class="preferences-scroll"
      aria-label="工作台设置"
      @scroll.passive="sync"
    >
      <div class="preferences-page">
        <p v-if="loading" role="status" class="hint">正在读取设置…</p>
        <div v-if="loadError" class="error-banner" role="alert">
          {{ error
          }}<button class="quiet-button" @click="load">重新读取</button>
        </div>
        <fieldset class="preferences-fields" :disabled="loading || saving">
          <section
            v-for="section in settingsSections"
            :key="section.id"
            :data-settings-section="section.id"
            class="settings-section"
            :aria-label="section.label"
          >
            <header class="preferences-title">
              <h2>{{ section.label }}</h2>
              <HelpTip :text="section.help" :label="section.label + '说明'" />
            </header>
            <template v-if="settings && section.id === 'general'">
              <p class="settings-context">
                默认模型与搜索配置供当前工作台共用，单个智能体可单独设置模型。
              </p>
              <h3>模型</h3>
              <div class="preferences-group">
                <SettingRow
                  label="默认对话模型"
                  help="未指定独立模型的智能体使用此模型；请求仍经过 Boost 的账户、配额和鉴权。"
                  ><ModelSelect
                    v-model="settings.defaultModel"
                    :models="models"
                    label="默认对话模型"
                    default-label="跟随工作台默认模型"
                    :disabled="!configure"
                /></SettingRow>
                <SettingRow
                  label="推理强度"
                  help="只对提供者明确支持的模型生效；自动使用模型默认设置。"
                  ><SelectControl
                    v-model="settings.reasoningEffort"
                    label="推理强度"
                    :options="[
                      { value: 'auto', label: '自动' },
                      { value: 'low', label: '低' },
                      { value: 'medium', label: '中' },
                      { value: 'high', label: '高' },
                    ]"
                    :disabled="!configure"
                /></SettingRow>
              </div>
            </template>
            <template v-else-if="section.id === 'appearance'">
              <h3>主题</h3>
              <div class="preferences-theme"><ThemePicker /></div>
              <h3>阅读与动画</h3>
              <div class="preferences-group">
                <SettingRow
                  label="文字大小"
                  help="仅影响当前浏览器的 Bot 界面，不修改主应用字体。"
                  ><SelectControl
                    v-model="preferences.text"
                    label="文字大小"
                    :options="[
                      { value: 'sm', label: '小' },
                      { value: 'md', label: '标准' },
                      { value: 'lg', label: '大' },
                      { value: 'xl', label: '特大' },
                    ]"
                    :disabled="false"
                    @update:model-value="savePreferences"
                /></SettingRow>
                <SettingRow label="界面字体"
                  ><SelectControl
                    v-model="preferences.font"
                    label="界面字体"
                    :options="[
                      { value: 'system', label: '系统字体' },
                      { value: 'serif', label: '衬线字体' },
                    ]"
                    :disabled="false"
                    @update:model-value="savePreferences"
                /></SettingRow>
                <SettingRow label="对话宽度"
                  ><SelectControl
                    v-model="preferences.width"
                    label="对话宽度"
                    :options="[
                      { value: 'normal', label: '标准' },
                      { value: 'wide', label: '宽' },
                      { value: 'full', label: '铺满' },
                    ]"
                    :disabled="false"
                    @update:model-value="savePreferences"
                /></SettingRow>
                <SettingRow
                  label="动画"
                  help="关闭或减少动画时，头像与界面遵从该偏好。"
                  ><SelectControl
                    v-model="preferences.motion"
                    label="动画"
                    :options="[
                      { value: 'full', label: '完整' },
                      { value: 'reduce', label: '减少动画' },
                      { value: 'off', label: '关闭' },
                    ]"
                    :disabled="false"
                    @update:model-value="savePreferences"
                /></SettingRow>
                <SettingRow label="代码自动换行"
                  ><input
                    v-model="preferences.codeWrap"
                    type="checkbox"
                    true-value="on"
                    false-value="off"
                    aria-label="代码自动换行"
                    @change="savePreferences"
                /></SettingRow>
              </div>
            </template>
            <template v-else-if="section.id === 'channels'"
              ><p class="settings-context">
                渠道账号由工作台共用，可分别选择默认回复的智能体。
              </p>
              <ChannelSettings v-if="configure" :bots="bots" embedded />
              <p v-else class="hint">聊天渠道由管理员配置。</p></template
            >
            <template v-else-if="section.id === 'connections'"
              ><ConnectedAccounts v-if="configure" />
              <p v-else class="hint">账号连接由管理员配置。</p></template
            >
            <template v-else-if="settings && section.id === 'network'"
              ><h3>联网搜索</h3>
              <div class="preferences-group">
                <SettingRow
                  label="搜索服务"
                  help="自动使用现有免费搜索回退链；其他提供者需要自己的服务凭据。"
                  ><SelectControl
                    v-model="settings.webSearch.provider"
                    label="搜索服务"
                    :options="[
                      { value: 'auto', label: '自动' },
                      ...[
                        'tavily',
                        'exa',
                        'bocha',
                        'zhipu',
                        'keenable',
                        'searxng',
                      ].map((value) => ({ value, label: value })),
                    ]"
                    :disabled="!configure"
                /></SettingRow>
                <SettingRow
                  v-if="settings.webSearch.provider === 'searxng'"
                  label="SearXNG 地址"
                  ><input
                    v-model="settings.webSearch.url"
                    type="url"
                    aria-label="SearXNG 地址"
                    :disabled="!configure"
                /></SettingRow>
                <SettingRow
                  v-else-if="settings.webSearch.provider !== 'auto'"
                  label="搜索服务密钥"
                  help="已有密钥不会返回到浏览器。留空保留，填写后替换当前提供者的密钥。"
                  ><input
                    v-model="searchKey"
                    type="password"
                    autocomplete="new-password"
                    placeholder="留空保留已有密钥"
                    aria-label="搜索服务密钥"
                    :disabled="!configure"
                /></SettingRow>
                <SettingRow
                  label="模型网络与代理"
                  help="模型请求经过 Boost 的统一网关与代理配置，Bot 不另设绕过认证的直连地址。"
                  ><button class="quiet-button" @click="back">
                    在 Boost 中管理
                  </button></SettingRow
                >
              </div></template
            >
            <template v-else-if="section.id === 'data'"
              ><h3>已安装智能体</h3>
              <div class="preferences-group">
                <SettingRow v-for="bot in bots" :key="bot.id" :label="bot.name"
                  ><BotAvatar :bot="bot" :size="30" /><SettingsButton
                    :label="`设置${bot.name}`"
                    @click="emit('edit', bot)" /><button
                    v-if="configure"
                    class="icon-btn"
                    :aria-label="`删除${bot.name}`"
                    @click="emit('delete', bot)"
                  >
                    <Icon name="trash" :size="16" /></button
                ></SettingRow>
              </div>
              <h3>存储</h3>
              <div class="preferences-group">
                <SettingRow
                  label="数据位置"
                  :help="settings?.dataDir || '尚未读取数据目录'"
                  ><span>当前账号的本地数据目录</span></SettingRow
                ><SettingRow
                  label="模型与计费数据"
                  help="账户、请求日志和模型计费由 Boost 管理。"
                  ><button class="quiet-button" @click="back">
                    打开 Boost
                  </button></SettingRow
                >
              </div></template
            >
            <template v-else-if="section.id === 'troubleshoot'"
              ><h3>连接检查</h3>
              <div class="preferences-group">
                <SettingRow
                  label="模型连通性"
                  help="向当前模型发起小规模真实请求，验证网关与模型响应，可能产生少量费用。"
                  ><button
                    class="quiet-button"
                    :disabled="busy || !configure"
                    @click="emit('test')"
                  >
                    {{ busy ? "检查中…" : "测试连接" }}
                  </button></SettingRow
                ><SettingRow label="工作台连接"
                  ><button
                    class="quiet-button"
                    :disabled="busy"
                    @click="emit('reconnect')"
                  >
                    重新连接
                  </button></SettingRow
                >
              </div></template
            >
            <template v-else-if="section.id === 'about'"
              ><h3>Boost</h3>
              <div class="preferences-group">
                <SettingRow label="运行版本"
                  ><span>{{ status?.version || "尚未连接" }}</span></SettingRow
                ><SettingRow label="可用模型"
                  ><span>{{ models.length }}</span></SettingRow
                ><SettingRow label="当前角色"
                  ><span>{{ configure ? "管理员" : "成员" }}</span></SettingRow
                >
              </div></template
            >
          </section>
        </fieldset>
      </div>
    </section>
    <footer class="preferences-actions">
      <p v-if="saved" role="status" class="settings-saved">{{ saved }}</p>
      <p v-if="error && !loadError" role="alert" class="settings-save-error">
        {{ error }}
      </p>
      <button
        class="primary-button"
        :disabled="saving || loading || loadError || !configure || !settings"
        @click="save"
      >
        {{ saving ? "保存中…" : "保存设置" }}
      </button>
    </footer>
  </div>
</template>
<style scoped>
.workspace-settings {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  min-width: 0;
  position: relative;
}
.preferences-banner {
  position: absolute;
  top: 0;
  inset-inline: 0;
  z-index: 5;
}
.preferences-scroll {
  flex: 1;
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
}
.preferences-page {
  max-width: 920px;
  margin: 0 auto;
  padding: 0 24px 20px;
}
.preferences-fields {
  min-width: 0;
  border: 0;
  margin: 0;
  padding: 0;
}
.settings-section {
  padding: 0 0 12px;
  scroll-margin-top: 0;
}
.settings-section + .settings-section {
  border-top: 1px solid var(--line-2);
  padding-top: 8px;
}
.preferences-title {
  display: flex;
  align-items: center;
  gap: 5px;
  position: static;
  min-height: var(--boost-section-heading-height);
  box-sizing: border-box;
  margin: 0 0 8px;
  padding: 10px 0;
  background: var(--bg);
  border-bottom: 0;
}
.preferences-title h2 {
  font-size: 16px;
  line-height: 1.3;
  font-weight: 600;
  margin: 0;
}
.preferences-page h3 {
  margin: 10px 0 5px;
  font-size: 12px;
  font-weight: 600;
}
.settings-context {
  font-size: 11px;
  color: var(--muted);
  line-height: 1.5;
  margin: 0 0 8px;
}
.preferences-group {
  background: transparent;
  border: 0;
  border-radius: 0;
}
.preferences-theme {
  max-width: 480px;
}
.preferences-actions {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 12px;
  padding: 10px 28px;
  border-top: 1px solid var(--line-2);
  flex: none;
  background: var(--surface);
}
.preferences-actions > p {
  margin: 0 auto 0 0;
  font-size: 12px;
}
.settings-saved {
  color: var(--green);
}
.settings-save-error {
  color: var(--red);
}
@media (max-width: 650px) {
  .preferences-page {
    padding: 0 14px 16px;
  }
  .preferences-actions {
    padding: 10px 14px;
  }
  .preferences-title h2 {
    font-size: 16px;
  }
}
</style>
