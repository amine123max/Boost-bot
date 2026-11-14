<script setup lang="ts">
import { onBeforeUnmount, onMounted, reactive, ref, watch } from "vue";
import type { Bot } from "../types";
import { api, enc } from "../api";
import HelpTip from "./HelpTip.vue";
import SelectControl from "./SelectControl.vue";
import Modal from "./Modal.vue";
import { channelNames as names, channelStateNames as stateNames, type ChannelAccount as Account, type ChatChannel } from '../channel-accounts';
const props = defineProps<{ bots: Bot[]; embedded?: boolean; request?: number; dialogOnly?: boolean }>();
const emit = defineEmits<{ changed: []; error: [message: string] }>();
const accounts = ref<Account[]>([]),
  error = ref(""),
  busy = ref(false),
  adding = ref(false),
  channel = ref("feishu"),
  key = ref(""),
  verifyCode = ref("");
const feishuMode = ref('qr'), sandbox = ref('false'), defaultBot = ref(''), label = ref('');
interface FeishuFlow { id: string; state: string; qr: string; url: string; error: string }
interface Login { state: string; qrContent?: string; qrDataUrl?: string; message?: string }
const flow = ref<FeishuFlow>();
const reconnecting = ref(false);
let attempt = 0;
let accountLoad = 0;
const credentials = reactive({
  appId: "",
  appSecret: "",
  token: "",
  botToken: "",
  appToken: "",
  clientId: '',
  clientSecret: '',
});
const login = ref<Login | null>(null);
let disposed = false,
  timer: ReturnType<typeof setTimeout> | undefined,
  accountTimer: ReturnType<typeof setTimeout> | undefined;
async function load() {
  const ticket = ++accountLoad;
  try {
    const d = await api<{ accounts: Account[] }>("/channel-accounts");
    if (!disposed && ticket === accountLoad) accounts.value = d.accounts;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
let opening = false;
async function begin(kind?: ChatChannel, account?: Account, botId?: string, autoQr = false) {
  if (opening || busy.value || adding.value || disposed) return;
  opening = true;
  error.value = "";
  login.value = null;
  flow.value = undefined;
  reconnecting.value = !!account;
  if (kind) channel.value = kind;
  feishuMode.value = 'qr';
  sandbox.value = 'false';
  defaultBot.value = account?.defaultBot || botId || props.bots[0]?.id || '';
  label.value = account?.label || '';
  for (const name of Object.keys(credentials) as Array<
    keyof typeof credentials
  >)
    credentials[name] = "";
  try {
    key.value = account?.key || (
      await api<{ key: string }>("/channel-accounts/new-key", {
        method: "POST",
        body: {},
      })
    ).key;
    if (disposed) return;
    adding.value = true;
    if (autoQr && (channel.value === 'weixin' || channel.value === 'feishu')) await save();
  } catch (e) {
    error.value = (e as Error).message;
    if (props.dialogOnly) emit('error', error.value);
  } finally {
    opening = false;
  }
}
defineExpose({ begin });
async function save() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  const ticket = ++attempt;
  try {
    clearTimeout(timer);
    if (flow.value) { const previous = flow.value.id; flow.value = undefined; await api(`/connections/flows/${enc(previous)}`, { method: 'DELETE' }).catch(() => {}); }
    if (channel.value === 'feishu' && feishuMode.value === 'qr') {
      const response = await api<{ flow: FeishuFlow }>(`/channel-accounts/${enc(key.value)}/feishu/one-click`, { method: 'POST', body: {} });
      if (ticket !== attempt || disposed) {
        await api(`/connections/flows/${enc(response.flow.id)}`, { method: 'DELETE' }).catch(() => {});
        return;
      }
      flow.value = response.flow;
      login.value = { state: response.flow.state, qrDataUrl: response.flow.qr, qrContent: response.flow.url };
      void pollLogin(ticket);
      return;
    }
    if (channel.value === "weixin") {
      const response = await api<Login>(
        `/channel-accounts/${enc(key.value)}/weixin/login`,
        { method: "POST", body: {} },
      );
      if (ticket !== attempt || disposed) return;
      login.value = response;
      void pollLogin(ticket);
      return;
    }
    const body =
      channel.value === "feishu"
        ? { appId: credentials.appId, appSecret: credentials.appSecret }
        : channel.value === "slack"
          ? { botToken: credentials.botToken, appToken: credentials.appToken }
          : channel.value === 'dingtalk' ? { clientId: credentials.clientId, clientSecret: credentials.clientSecret }
          : channel.value === 'qq' ? { appId: credentials.appId, clientSecret: credentials.clientSecret, sandbox: sandbox.value === 'true' }
          : { token: credentials.token };
    await api(`/channel-accounts/${enc(key.value)}/${enc(channel.value)}`, {
      method: "PUT",
      body,
    });
    if (ticket === attempt && !disposed) await finish();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function finish() {
  const patch = { ...(defaultBot.value ? { defaultBot: defaultBot.value } : {}), ...(label.value.trim() ? { label: label.value.trim() } : {}) };
  if (Object.keys(patch).length) await api(`/channel-accounts/${enc(key.value)}/${enc(channel.value)}/settings`, { method: 'PUT', body: patch });
  adding.value = false;
  emit('changed');
  if (!props.dialogOnly) await load();
}
async function pollLogin(ticket: number) {
  clearTimeout(timer);
  if (!adding.value || disposed || ticket !== attempt) return;
  try {
    if (flow.value) {
      const response = await api<{ flow: FeishuFlow }>(`/connections/flows/${enc(flow.value.id)}`);
      if (ticket !== attempt || disposed) return;
      flow.value = response.flow;
      login.value = { state: response.flow.state, qrDataUrl: response.flow.qr, qrContent: response.flow.url, message: response.flow.error || (response.flow.state === 'create-app' ? '使用飞书扫码创建应用' : '请完成飞书授权') };
      if (response.flow.state === 'done') { await finish(); return; }
      if (response.flow.state === 'failed') return;
    } else {
      const response = await api<Login>(`/channel-accounts/${enc(key.value)}/weixin/login`);
      if (ticket !== attempt || disposed) return;
      login.value = response;
    }
    if (login.value?.state === "confirmed") {
      await finish();
      return;
    }
    if (['expired', 'error', 'failed', 'cancelled', 'canceled'].includes(login.value?.state || '')) return;
  } catch (e) {
    error.value = (e as Error).message;
    return;
  }
  timer = setTimeout(() => pollLogin(ticket), 2000);
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
  ++attempt;
  clearTimeout(timer);
  adding.value = false;
  const previousFlow = flow.value;
  flow.value = undefined;
  if (previousFlow) await api(`/connections/flows/${enc(previousFlow.id)}`, { method: 'DELETE' }).catch(() => {});
  if (channel.value === "weixin" && key.value)
    await api(`/channel-accounts/${enc(key.value)}/weixin/cancel`, {
      method: "POST",
      body: {},
    }).catch(() => {});
}
watch(channel, async (_value, previous) => {
  ++attempt; clearTimeout(timer);
  const previousKey = key.value;
  const previousFlow = flow.value;
  flow.value = undefined; login.value = null; verifyCode.value = '';
  if (previousFlow) await api(`/connections/flows/${enc(previousFlow.id)}`, { method: 'DELETE' }).catch(() => {});
  if (previous === 'weixin' && previousKey) await api(`/channel-accounts/${enc(previousKey)}/weixin/cancel`, { method: 'POST', body: {} }).catch(() => {});
}, { flush: 'sync' });
watch(() => props.request, value => { if (value) void begin(); });
watch(feishuMode, async () => {
  if (!adding.value || channel.value !== 'feishu') return;
  ++attempt; clearTimeout(timer);
  const previous = flow.value; flow.value = undefined; login.value = null;
  if (previous) await api(`/connections/flows/${enc(previous.id)}`, { method: 'DELETE' }).catch(() => {});
}, { flush: 'sync' });
async function refreshAccounts() {
  await load();
  if (!disposed) accountTimer = setTimeout(refreshAccounts, 5000);
}
onMounted(() => { if (!props.dialogOnly) void refreshAccounts(); });
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(accountTimer);
  void close();
});
</script>
<template>
  <section v-if="!dialogOnly" :class="embedded ? 'channel-settings-embedded' : 'settings-card'">
    <h2 v-if="!embedded">
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
        }}<small><span v-if="account.label && account.label !== names[account.channel]">{{ names[account.channel] }} · </span><span :class="{ 'connected-state': account.status?.state === 'connected' }">{{ stateNames[account.status?.state || ''] || '未连接' }}</span></small></span
      ><SelectControl
        :model-value="account.defaultBot"
        :options="bots.map((bot) => ({ value: bot.id, label: bot.name }))"
        :label="(account.label || names[account.channel]) + '默认智能体'"
        :disabled="busy"
        @update:model-value="(value) => update(account, { defaultBot: value })"
      />
      <button
        class="quiet-button"
        :disabled="busy"
        @click="update(account, { enabled: !account.enabled })"
      >
        {{ account.enabled ? "停用" : "启用" }}
      </button>
    </div>
    <button class="quiet-button" :disabled="busy" @click="begin()">
      添加渠道
    </button>
  </section>
  <Modal v-if="adding" :busy="busy" :title="reconnecting ? '重新连接聊天渠道' : '添加聊天渠道'" @close="close"
    ><form class="editor-form" @submit.prevent="save">
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <label
        >渠道<SelectControl
          v-model="channel"
          :disabled="busy || reconnecting"
          label="渠道"
          :options="
            Object.entries(names).map(([value, label]) => ({ value, label }))
          " /></label
      ><label>设备／账号名称<HelpTip text="同一渠道可添加多个独立设备或账号，分别命名、启停和选择默认智能体。平台对同一账号的同时在线限制仍然适用。" /><input v-model="label" placeholder="例如：工作手机、团队机器人" maxlength="40" autocomplete="off" /></label>
      <label v-if="channel === 'feishu'">连接方式<SelectControl v-model="feishuMode" label="飞书连接方式" :disabled="busy" :options="[{ value: 'qr', label: '扫码连接' }, { value: 'manual', label: '应用凭据' }]" /></label>
      <template v-if="channel === 'feishu' && feishuMode === 'manual'"
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
      ><template v-else-if="channel === 'dingtalk' || channel === 'qq'">
        <p>{{ channel === 'dingtalk' ? '使用钉钉企业内部应用，开启机器人 Stream 模式。' : '使用 QQ 开放平台的机器人应用凭据。' }}<HelpTip text="微信与飞书支持扫码连接；钉钉和 QQ 官方机器人使用应用凭据，不使用个人账号扫码令牌。" /></p>
        <label>{{ channel === 'dingtalk' ? 'Client ID' : 'App ID' }}<input v-if="channel === 'dingtalk'" v-model="credentials.clientId" required autocomplete="off" /><input v-else v-model="credentials.appId" required autocomplete="off" /></label>
        <label>Client Secret<input v-model="credentials.clientSecret" required type="password" autocomplete="new-password" /></label>
        <label v-if="channel === 'qq'">运行环境<SelectControl v-model="sandbox" label="QQ 运行环境" :options="[{ value: 'false', label: '正式环境' }, { value: 'true', label: '沙箱环境' }]" /></label>
        <label v-if="channel === 'qq'">回调路径<HelpTip text="在 QQ 开放平台填写经 Nginx 映射后的公网 HTTPS 地址。此入口校验平台 Ed25519 签名，服务代理仍需要服务器端 RPC 鉴权。" /><input :value="'/boost-bot/amb/hooks/qq/' + key" readonly /></label>
      </template><label v-else-if="channel !== 'weixin' && channel !== 'feishu'"
        >Token<input
          v-model="credentials.token"
          required
          type="password"
          autocomplete="new-password"
      /></label>
      <label v-if="bots.length">默认智能体<SelectControl v-model="defaultBot" label="默认智能体" :options="bots.map(bot => ({ value: bot.id, label: bot.name }))" /></label>
      <div v-if="login" role="status">
        <img
          v-if="login.qrDataUrl"
          :src="login.qrDataUrl"
          :alt="(names[channel] || '') + '登录二维码'"
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
          >打开{{ names[channel] }}登录</a
        >
      </div>
      <footer class="dialog-actions">
        <button data-dialog-close type="button" class="quiet-button" :disabled="busy" @click="close">取消</button
        ><button type="submit" class="primary-button" :disabled="busy">
          {{ busy ? "连接中…" : channel === "weixin" || (channel === 'feishu' && feishuMode === 'qr') ? "获取二维码" : "连接" }}
        </button>
      </footer>
    </form></Modal
  >
</template>
<style scoped>
.connected-state { color: var(--green, #22a06b); background: color-mix(in srgb, var(--green, #22a06b) 14%, transparent); border-radius: 4px; padding: 1px 6px; }
.channel-setting-row > .select-control {
  width: 280px;
  max-width: 60%;
}
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
