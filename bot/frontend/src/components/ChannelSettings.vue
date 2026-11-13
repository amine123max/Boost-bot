<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref } from "vue";
import type { Bot } from "../types";
import { api, enc } from "../api";
import HelpTip from "./HelpTip.vue";
import Modal from "./Modal.vue";
defineProps<{ bots: Bot[] }>();
interface Account {
  key: string;
  channel: string;
  label?: string;
  defaultBot: string;
  enabled: boolean;
  status?: { state: string; detail?: string };
}
const accounts = ref<Account[]>([]),
  error = ref(""),
  busy = ref(false),
  adding = ref(false),
  channel = ref("feishu"),
  key = ref(""),
  verifyCode = ref("");
const credentials = reactive({
  appId: "",
  appSecret: "",
  token: "",
  botToken: "",
  appToken: "",
});
const login = ref<{
  state: string;
  qrContent?: string;
  qrDataUrl?: string;
  message?: string;
} | null>(null);
const names: Record<string, string> = {
  weixin: "微信",
  feishu: "飞书",
  telegram: "Telegram",
  slack: "Slack",
  discord: "Discord",
};
let disposed = false,
  timer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  try {
    const d = await api<{ accounts: Account[] }>("/channel-accounts");
    if (!disposed) accounts.value = d.accounts;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function begin() {
  error.value = "";
  login.value = null;
  for (const name of Object.keys(credentials) as Array<
    keyof typeof credentials
  >)
    credentials[name] = "";
  try {
    key.value = (
      await api<{ key: string }>("/channel-accounts/new-key", {
        method: "POST",
        body: {},
      })
    ).key;
    adding.value = true;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (channel.value === "weixin") {
      login.value = await api(
        `/channel-accounts/${enc(key.value)}/weixin/login`,
        { method: "POST", body: {} },
      );
      void pollLogin();
      return;
    }
    const body =
      channel.value === "feishu"
        ? { appId: credentials.appId, appSecret: credentials.appSecret }
        : channel.value === "slack"
          ? { botToken: credentials.botToken, appToken: credentials.appToken }
          : { token: credentials.token };
    await api(`/channel-accounts/${enc(key.value)}/${enc(channel.value)}`, {
      method: "PUT",
      body,
    });
    adding.value = false;
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function pollLogin() {
  clearTimeout(timer);
  if (!adding.value || disposed) return;
  try {
    login.value = await api(`/channel-accounts/${enc(key.value)}/weixin/login`);
    if (login.value?.state === "confirmed") {
      adding.value = false;
      await load();
      return;
    }
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  timer = setTimeout(pollLogin, 2000);
}
async function verify() {
  try {
    await api(`/channel-accounts/${enc(key.value)}/weixin/verify`, {
      method: "POST",
      body: { code: verifyCode.value },
    });
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function update(
  account: Account,
  patch: { enabled?: boolean; defaultBot?: string },
) {
  try {
    busy.value = true;
    await api(
      `/channel-accounts/${enc(account.key)}/${enc(account.channel)}/settings`,
      { method: "PUT", body: patch },
    );
    await load();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function close() {
  clearTimeout(timer);
  adding.value = false;
  if (channel.value === "weixin" && key.value)
    await api(`/channel-accounts/${enc(key.value)}/weixin/cancel`, {
      method: "POST",
      body: {},
    }).catch(() => {});
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  void close();
});
</script>
<template>
  <section class="settings-card">
    <h2>
      聊天渠道<HelpTip
        text="所有智能体共用渠道账号，每个账号可设置默认回复 Bot。消息上下文仍按 Bot 和渠道会话隔离，凭据仅存于服务端。"
      />
    </h2>
    <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
    <div
      v-for="account in accounts"
      :key="account.channel + account.key"
      class="channel-setting-row"
    >
      <span
        >{{ account.label || names[account.channel]
        }}<small>{{ account.status?.state || "未连接" }}</small></span
      ><select
        :value="account.defaultBot"
        :aria-label="(account.label || names[account.channel]) + '默认智能体'"
        :disabled="busy"
        @change="
          update(account, {
            defaultBot: ($event.target as HTMLSelectElement).value,
          })
        "
      >
        <option v-for="bot in bots" :key="bot.id" :value="bot.id">
          {{ bot.name }}
        </option></select
      ><button
        class="quiet-button"
        :disabled="busy"
        @click="update(account, { enabled: !account.enabled })"
      >
        {{ account.enabled ? "停用" : "启用" }}
      </button>
    </div>
    <button class="quiet-button" :disabled="busy" @click="begin">
      添加渠道
    </button>
  </section>
  <Modal v-if="adding" title="添加聊天渠道" @close="close"
    ><form class="editor-form" @submit.prevent="save">
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <label
        >渠道<select v-model="channel">
          <option v-for="(name, value) in names" :value="value">
            {{ name }}
          </option>
        </select></label
      ><template v-if="channel === 'feishu'"
        ><label
          >App ID<input
            v-model="credentials.appId"
            required
            autocomplete="off" /></label
        ><label
          >App Secret<input
            v-model="credentials.appSecret"
            required
            type="password"
            autocomplete="new-password" /></label></template
      ><template v-else-if="channel === 'slack'"
        ><label
          >Bot Token<input
            v-model="credentials.botToken"
            required
            type="password"
            autocomplete="new-password" /></label
        ><label
          >App Token<input
            v-model="credentials.appToken"
            required
            type="password"
            autocomplete="new-password" /></label></template
      ><label v-else-if="channel !== 'weixin'"
        >Token<input
          v-model="credentials.token"
          required
          type="password"
          autocomplete="new-password"
      /></label>
      <div v-if="login" role="status">
        <img
          v-if="login.qrDataUrl"
          :src="login.qrDataUrl"
          alt="微信登录二维码"
        />
        <p>{{ login.message || login.state }}</p>
        <label v-if="login.state === 'need_verifycode'"
          >验证码<input
            v-model="verifyCode"
            autocomplete="one-time-code"
          /><button type="button" class="quiet-button" @click="verify">
            提交验证码
          </button></label
        ><a
          v-if="login.qrContent"
          :href="login.qrContent"
          target="_blank"
          rel="noopener noreferrer"
          >打开微信登录</a
        >
      </div>
      <footer class="dialog-actions">
        <button type="button" class="quiet-button" @click="close">取消</button
        ><button type="submit" class="primary-button" :disabled="busy">
          {{ busy ? "连接中…" : channel === "weixin" ? "获取二维码" : "连接" }}
        </button>
      </footer>
    </form></Modal
  >
</template>
<style scoped>
.channel-setting-row {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: var(--space-2);
  padding: var(--space-2) 0;
}
.channel-setting-row > span {
  flex: 1;
}
.channel-setting-row small {
  display: block;
  color: var(--muted);
  font-size: var(--fs-xs);
}
img {
  width: 180px;
  height: 180px;
  object-fit: contain;
  background: var(--white);
}
</style>
