<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { api, enc } from "../api";
import SettingRow from "./SettingRow.vue";
import Modal from "./Modal.vue";
interface Account {
  id: string;
  label: string;
  service: string;
  identity?: string;
}
const accounts = ref<Account[]>([]),
  token = ref(""),
  busy = ref(false),
  error = ref(""),
  removing = ref<Account>();
interface Flow {
  id: string;
  state: "create-app" | "authorize" | "done" | "failed";
  qr: string;
  url: string;
  error: string;
}
const flow = ref<Flow>(),
  authorizationUrl = ref("");
let timer: ReturnType<typeof setTimeout> | undefined,
  disposed = false;
async function load() {
  try {
    accounts.value = (
      await api<{ accounts: Account[] }>("/connections")
    ).accounts;
  } catch (e) {
    error.value = (e as Error).message;
  }
}
async function connect() {
  if (busy.value || !token.value.trim()) return;
  busy.value = true;
  error.value = "";
  try {
    accounts.value = (
      await api<{ accounts: Account[] }>("/connections/notion/token", {
        method: "POST",
        body: { token: token.value.trim() },
      })
    ).accounts;
    token.value = "";
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function remove() {
  if (busy.value || !removing.value) return;
  busy.value = true;
  error.value = "";
  try {
    accounts.value = (
      await api<{ accounts: Account[] }>(
        `/connections/${enc(removing.value.id)}`,
        { method: "DELETE" },
      )
    ).accounts;
    removing.value = undefined;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function poll() {
  if (!flow.value || disposed) return;
  try {
    const data = await api<{ flow: Flow; accounts: Account[] }>(
      `/connections/flows/${enc(flow.value.id)}`,
    );
    if (disposed) return;
    flow.value = data.flow;
    if (data.flow.state === "done") accounts.value = data.accounts;
    else if (data.flow.state !== "failed") timer = setTimeout(poll, 1500);
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  }
}
async function feishu() {
  if (busy.value || flow.value) return;
  busy.value = true;
  error.value = "";
  try {
    flow.value = (
      await api<{ flow: Flow }>("/connections/feishu", {
        method: "POST",
        body: {},
      })
    ).flow;
    await poll();
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function notionOAuth() {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    const result = await api<{ url: string }>("/connections/notion/oauth", {
      method: "POST",
      body: {},
    });
    const url = new URL(result.url);
    if (url.protocol !== "https:") throw new Error("授权地址无效");
    authorizationUrl.value = url.href;
  } catch (e) {
    error.value = (e as Error).message;
  } finally {
    busy.value = false;
  }
}
async function closeFlow() {
  clearTimeout(timer);
  if (flow.value && !["done", "failed"].includes(flow.value.state)) {
    try {
      await api(`/connections/flows/${enc(flow.value.id)}`, {
        method: "DELETE",
      });
    } catch (e) {
      error.value = (e as Error).message;
      return;
    }
  }
  flow.value = undefined;
}
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
  const activeFlow = flow.value;
  if (activeFlow && !["done", "failed"].includes(activeFlow.state))
    void api(`/connections/flows/${enc(activeFlow.id)}`, {
      method: "DELETE",
    }).catch(() => {});
});
onMounted(load);
</script>
<template>
  <div class="connected-accounts">
    <p v-if="error" role="alert" class="error-banner">{{ error }}</p>
    <h3>已授权账号</h3>
    <div class="connection-group">
      <SettingRow
        v-for="account in accounts"
        :key="account.id"
        :label="account.label || account.service"
        help="授权账号供本工作台智能体使用；断开后相关工具无法继续访问。凭据不会返回界面。"
        ><button
          class="quiet-button"
          :disabled="busy"
          @click="removing = account"
        >
          断开连接
        </button></SettingRow
      >
      <p v-if="!accounts.length" class="hint">尚未添加已授权账号</p>
    </div>
    <h3>连接 Notion</h3>
    <p class="connection-requirement">
      请先将需要访问的页面共享给 Notion 集成。
    </p>
    <form class="connection-group notion-token-form" @submit.prevent="connect">
      <SettingRow
        label="集成令牌"
        help="创建 Notion 集成后，将需要访问的页面共享给该集成。令牌仅发送至本地服务验证保存。"
        ><input
          v-model="token"
          type="password"
          autocomplete="new-password"
          aria-label="Notion 集成令牌"
        />
        <div class="connection-actions">
          <button class="primary-button" :disabled="busy || !token.trim()">
            {{ busy ? "连接中…" : "验证并连接" }}
          </button>
        </div></SettingRow
      >
    </form>
    <div class="connection-group">
      <SettingRow
        label="Notion 授权登录"
        help="由既有后端发起授权。打开官方授权页后，返回此页刷新账号列表。"
        ><a
          v-if="authorizationUrl"
          class="quiet-button"
          :href="authorizationUrl"
          target="_blank"
          rel="noopener noreferrer"
          >打开授权页</a
        ><button
          v-else
          class="quiet-button"
          :disabled="busy"
          @click="notionOAuth"
        >
          开始授权
        </button></SettingRow
      >
    </div>
    <h3>连接飞书账号</h3>
    <div class="connection-group">
      <SettingRow
        label="飞书扫码授权"
        help="连接个人飞书账号用于已授权的数据与消息工具；聊天 Bot 渠道请在“聊天渠道”中配置。"
        ><button
          class="quiet-button"
          :disabled="busy || !!flow"
          @click="feishu"
        >
          连接飞书
        </button></SettingRow
      ><SettingRow label="授权状态"
        ><button class="quiet-button" :disabled="busy" @click="load">
          刷新账号
        </button></SettingRow
      >
    </div>
    <Modal v-if="flow" title="飞书账号授权" @close="closeFlow"
      ><div class="flow-content">
        <p v-if="flow.error" class="error-banner" role="alert">
          {{ flow.error }}
        </p>
        <p v-else role="status">
          {{
            flow.state === "done"
              ? "授权完成"
              : flow.state === "failed"
                ? "授权失败"
                : "使用飞书扫描二维码完成授权"
          }}
        </p>
        <img v-if="flow.qr" :src="flow.qr" alt="飞书授权二维码" /><a
          v-if="flow.url"
          :href="flow.url"
          target="_blank"
          rel="noopener noreferrer"
          class="quiet-button"
          >打开官方授权页</a
        >
      </div>
      <footer class="dialog-actions">
        <button class="quiet-button" @click="closeFlow">
          {{ flow.state === "done" ? "完成" : "取消授权" }}
        </button>
      </footer></Modal
    >
    <Modal
      v-if="removing"
      title="断开账号连接"
      :busy="busy" @close="!busy && (removing = undefined)"
      ><p>
        断开
        {{ removing.label || removing.service }}
        后，智能体将无法通过此授权访问该账号。
      </p>
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <footer class="dialog-actions">
        <button data-dialog-close
          class="quiet-button"
          :disabled="busy"
          @click="removing = undefined"
        >
          取消</button
        ><button class="danger-button" :disabled="busy" @click="remove">
          {{ busy ? "正在断开…" : "断开连接" }}
        </button>
      </footer></Modal
    >
  </div>
</template>
<style scoped>
.connected-accounts h3 {
  margin: 12px 0 6px;
  font-size: 12px;
}
.connection-requirement {
  font-size: 11px;
  color: var(--muted);
  margin: 0 0 6px;
}
.notion-token-form :deep(.preference-control input) {
  width: 0;
  min-width: 70px;
  flex: 1;
}
.connection-group {
  background: transparent;
  border: 0;
  border-radius: 0;
  overflow: hidden;
}
.connection-group > p {
  padding: 6px 0;
}
.connection-actions {
  display: flex;
  justify-content: flex-end;
  padding: 0;
  flex: none;
}
.connection-group + .connection-group {
  margin-top: 12px;
}
.flow-content {
  display: grid;
  justify-items: center;
  gap: 16px;
  padding: 20px;
}
.flow-content img {
  max-width: min(280px, 100%);
  border-radius: 10px;
}
</style>
