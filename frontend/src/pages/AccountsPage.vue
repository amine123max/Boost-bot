<script setup lang="ts">
import HelpHint from "@/components/HelpHint.vue";
import DialogActions from "@/components/DialogActions.vue";
import { computed, ref, onActivated, watch } from "vue";
import { useRoute } from "vue-router";
import type { Account, LoginStartResult } from "@/types";
import BoostIcon from "@/components/BoostIcon.vue";
import PanelCard from "@/components/PanelCard.vue";
import AccountPoolTable from "@/components/AccountPoolTable.vue";
import EmptyState from "@/components/EmptyState.vue";
import BoostDialog from "@/components/BoostDialog.vue";
import QuotaResetDialog from "@/components/QuotaResetDialog.vue";
import AccountEditorDialog from "@/components/AccountEditorDialog.vue";
import BoostMenu, { type MenuItem } from "@/components/BoostMenu.vue";
import WarmupControls from "@/components/WarmupControls.vue";
import { useAccountPool } from "@/composables/useAccountPool";
import { importSummary, warmupSummary } from "@/lib/account-feedback";
import {
  boost,
  isTestableAccount,
  notify,
  refreshAccounts,
} from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
import { getAppErrorMessage, isTauriRuntime } from "@/lib/api/transport";
const query = ref("");
const status = ref("all");
const importBusy = ref(false);
const warming = ref(false);
const pool = useAccountPool();
const {
  selected,
  confirming,
  targets,
  numberingStart,
  exportMode,
  cleanupStatuses,
  resetAccount,
  resetError,
} = pool;
const statusItems: MenuItem[] = [
  { value: "all", label: "全部账号", icon: "users-round" },
  { value: "available", label: "可用账号", icon: "circle-check" },
  { value: "low", label: "低额度账号", icon: "gauge" },
  { value: "limited", label: "额度受限", icon: "minus" },
  { value: "banned", label: "已封禁", icon: "circle-x" },
  { value: "disabled", label: "已禁用", icon: "power" },
];
const operationItems = computed<MenuItem[]>(() => [
  { value: "list", label: "刷新账号列表", icon: "rotate-ccw", group: "刷新" },
  { value: "refresh", label: "刷新额度", icon: "activity", group: "刷新" },
  { value: "tokens", label: "刷新 AT/RT", icon: "key-round", group: "刷新" },
  {
    value: "number",
    label: "连续编号",
    icon: "pencil",
    group: selected.value.length
      ? `已选 ${selected.value.length} 个账号`
      : "全部账号",
  },
  { value: "large", label: "大号优先排序", icon: "arrow-up" },
  { value: "small", label: "小号优先排序", icon: "arrow-down" },
  { value: "enable", label: "启用账号", icon: "circle-check" },
  { value: "disable", label: "禁用账号", icon: "power" },
  { value: "export", label: "导出账号", icon: "download" },
  {
    value: "cleanup",
    label: "按状态清理",
    icon: "trash-2",
    group: "清理",
    danger: true,
  },
  {
    value: "delete",
    label: "删除选中账号",
    icon: "trash-2",
    danger: true,
    disabled: !selected.value.length,
  },
]);
function rowItems(a: Account): MenuItem[] {
  return [
    { value: "edit", label: "编辑账号信息", icon: "pencil" },
    { value: "tokens", label: "刷新 AT/RT", icon: "key-round" },
    {
      value: a.preferred ? "clear-prefer" : "prefer",
      label: a.preferred ? "取消优先账号" : "设为优先账号",
      icon: "zap",
    },
    { value: "up", label: "向前移动", icon: "arrow-up" },
    { value: "down", label: "向后移动", icon: "arrow-down" },
    {
      value: "toggle",
      label: a.status === "disabled" ? "启用账号" : "禁用账号",
      icon: "power",
    },
    { value: "delete", label: "删除账号", icon: "trash-2", danger: true },
  ];
}
function onRowAction(a: Account, value: string) {
  if (value === "edit") edit(a);
  else if (value === "toggle") void toggle(a);
  else if (value === "delete") deleting.value = a;
  else void pool.rowAction(a, value);
}
const importing = ref(false);
const importTab = ref("file");
const content = ref("");
const importError = ref("");
watch(importError, (message) => {
  if (message) notify(message, true);
});
const login = ref<LoginStartResult | null>(null);
const accessToken = ref("");
const refreshToken = ref("");
const editing = ref<Account | null>(null);
const deleting = ref<Account | null>(null);
const route = useRoute();
onActivated(() => {
  if (route.query.import) importing.value = true;
});
const visible = computed(() =>
  boost.accounts.filter(
    (a) =>
      `${a.name} ${a.sort} ${a.note || ""} ${a.tags.join(" ")}`
        .toLowerCase()
        .includes(query.value.toLowerCase()) &&
      (status.value === "all" ||
        (status.value === "available"
          ? isTestableAccount(a)
          : status.value === "low"
            ? a.isLowQuota
            : a.status === status.value)),
  ),
);
async function importContent() {
  if (!content.value.trim()) {
    importError.value = "请粘贴账号 JSON 或选择文件";
    return;
  }
  importBusy.value = true;
  importError.value = "";
  try {
    const result = await accountClient.import([content.value]);
    if (result.failed) {
      importError.value = `${importSummary(result)}；${result.errors?.[0]?.message || "请检查格式"}`;
      await refreshAccounts();
      return;
    }
    await refreshAccounts();
    importing.value = false;
    content.value = "";
    notify(importSummary(result));
  } catch (e) {
    importError.value = `导入失败: ${getAppErrorMessage(e)}`;
  } finally {
    importBusy.value = false;
  }
}
async function pickFiles(event: Event) {
  const files = Array.from((event.target as HTMLInputElement).files || []);
  if (!files.length) return;
  importBusy.value = true;
  importError.value = "";
  try {
    const result = await accountClient.import(
      await Promise.all(files.map((f) => f.text())),
    );
    await refreshAccounts();
    if (result.failed)
      importError.value = `${importSummary(result)}；${result.errors?.[0]?.message || "请检查格式"}`;
    else {
      importing.value = false;
      notify(importSummary(result));
    }
  } catch (e) {
    importError.value = `导入失败: ${getAppErrorMessage(e)}`;
  } finally {
    importBusy.value = false;
    (event.target as HTMLInputElement).value = "";
  }
}
async function pickDirectory() {
  importBusy.value = true;
  importError.value = "";
  try {
    const result = await accountClient.importByDirectory();
    if (result.canceled) {
      notify("已取消导入");
      return;
    }
    await refreshAccounts();
    if (result.failed)
      importError.value = `${importSummary(result)}；${result.errors?.[0]?.message || "请检查格式"}`;
    else {
      importing.value = false;
      notify(importSummary(result));
    }
  } catch (e) {
    importError.value = `导入失败: ${getAppErrorMessage(e)}`;
  } finally {
    importBusy.value = false;
  }
}
async function startLogin() {
  importBusy.value = true;
  importError.value = "";
  try {
    login.value = await accountClient.startLogin({
      loginType: "chatgpt",
      openBrowser: isTauriRuntime(),
    });
  } catch (e) {
    importError.value = getAppErrorMessage(e);
  } finally {
    importBusy.value = false;
  }
}
async function checkLogin() {
  if (!login.value) return;
  importBusy.value = true;
  importError.value = "";
  try {
    const result = await accountClient.getLoginStatus(login.value.loginId);
    if (["success", "completed"].includes(result.status)) {
      await refreshAccounts();
      login.value = null;
      importing.value = false;
      notify("账号已连接");
    } else
      importError.value =
        result.error || "尚未完成授权，请在浏览器中完成登录后再检查";
  } catch (e) {
    importError.value = getAppErrorMessage(e);
  } finally {
    importBusy.value = false;
  }
}
async function tokenLogin() {
  importBusy.value = true;
  importError.value = "";
  try {
    await accountClient.loginWithChatgptAuthTokens({
      accessToken: accessToken.value.trim(),
      refreshToken: refreshToken.value.trim() || null,
    });
    await refreshAccounts();
    importing.value = false;
    accessToken.value = "";
    refreshToken.value = "";
    notify("账号已添加");
  } catch (e) {
    importError.value = getAppErrorMessage(e);
  } finally {
    importBusy.value = false;
  }
}
async function handleWarmupAccounts() {
  const accountIds = selected.value.length
    ? [...selected.value]
    : boost.accounts.map((account) => account.id);
  if (!accountIds.length) {
    notify("当前没有可预热的账号", true);
    return;
  }
  if (warming.value || !boost.connected) return;
  warming.value = true;
  try {
    const result = await accountClient.warmup({ accountIds, message: "hi" });
    notify(warmupSummary(result), Boolean(result.failed));
    await refreshAccounts().catch((error) =>
      notify(`刷新账号数据失败：${getAppErrorMessage(error)}`, true),
    );
  } catch (error) {
    notify(`账号预热失败：${getAppErrorMessage(error)}`, true);
  } finally {
    warming.value = false;
  }
}
function edit(a: Account) {
  editing.value = a;
}
async function toggle(a: Account) {
  await pool.execute(`${a.id}:toggle`, async () => {
    if (a.status === "disabled") await accountClient.enableAccount(a.id);
    else await accountClient.disableAccount(a.id);
    notify(a.status === "disabled" ? "账号已启用" : "账号已禁用");
  }, undefined, "更新账号状态失败");
}
async function remove() {
  if (!deleting.value) return;
  const account = deleting.value;
  deleting.value = null;
  await pool.execute(`${account.id}:delete`, async () => {
    await accountClient.delete(account.id);
    notify("账号已删除");
  }, undefined, "删除失败");
}
async function refreshUsage() {
  await pool.chooseAction("refresh");
}
</script>
<template>
  <div class="accounts-page">
    <div class="page-toolbar">
      <div class="toolbar-group">
        <span class="eyebrow">OPENAI ACCOUNTS</span
        ><span class="badge">{{ boost.accounts.length }} 个账号</span>
      </div>
      <div class="toolbar-group">
        <button
          class="secondary"
          :disabled="pool.isPending('batch:refresh') || !boost.accounts.length"
          @click="refreshUsage"
        >
          <BoostIcon
            name="rotate-ccw"
            :size="15"
            :class="{ spinning: pool.isPending('batch:refresh') }"
          />{{
            pool.isPending('batch:refresh') ? "刷新中…" : "刷新额度"
          }}</button
        ><WarmupControls
          :accounts="boost.accounts"
          :selected-ids="selected"
          :ready="boost.connected"
          :warming="warming"
          @immediate="handleWarmupAccounts"
        />
        <button
          class="primary"
          @click="
            importing = true;
            importError = '';
          "
        >
          <BoostIcon name="plus" :size="15" />添加账号
        </button>
      </div>
    </div>
    <div v-if="boost.accounts.length" class="page-toolbar">
      <div class="search-field">
        <BoostIcon name="search" :size="16" /><input
          v-model="query"
          placeholder="搜索账号、编号或标签…"
          aria-label="搜索账号"
        />
      </div>
      <div class="toolbar-group">
        <BoostMenu
          :label="
            statusItems.find((item) => item.value === status)?.label ||
            '全部账号'
          "
          :items="statusItems"
          :selected="status"
          @select="status = $event"
        />
        <BoostMenu
          :label="
            selected.length ? `批量操作 · ${selected.length}` : '账号操作'
          "
          icon="ellipsis"
          :items="operationItems"
          @select="pool.chooseAction"
        />
      </div>
    </div>
    <div v-if="visible.length" class="account-selection-bar">
      <span
        >{{ visible.length }} 个账号<span v-if="selected.length">
          · 已选 {{ selected.length }}</span
        ></span
      >
      <button
        v-if="selected.length"
        class="text-button"
        @click="selected = []"
      >
        取消选择
      </button>
    </div>
    <AccountPoolTable
      v-if="visible.length"
      :accounts="visible"
      :selected="selected"
      :is-pending="pool.isPending"
      :menu-items="rowItems"
      @select="pool.toggle"
      @select-all="pool.selectVisible(visible)"
      @action="onRowAction"
    />
    <PanelCard v-else
      ><EmptyState
        icon="database"
        :title="
          query || status !== 'all'
            ? '没有符合条件的账号'
            : '你的订阅，从这里开始'
        "
        description="添加 OpenAI 账号，集中查看账号、额度和可用状态。"
        ><button class="primary" @click="importing = true">
          <BoostIcon name="plus" :size="15" />添加账号
        </button></EmptyState
      ></PanelCard
    >
    <BoostDialog
      v-if="importing"
      title="添加账号"
      @close="!importBusy && (importing = false)"
      ><div v-spring-switch class="tabs">
        <button
          v-for="(title, key) in {
            file: '文件导入',
            oauth: '浏览器登录',
            token: 'Token',
          }"
          :key="key"
          :class="{ selected: importTab === key }"
          @click="
            importTab = key;
            importError = '';
          "
        >
          {{ title }}
        </button>
      </div>
      <div class="form-stack">
        <template v-if="importTab === 'file'"
          ><label class="form-field"
            ><span>选择账号文件<HelpHint label="账号文件" text="支持 auth.json、JSON 数组或多个账号文件。" /></span><input aria-label="选择账号文件"
              type="file"
              accept=".json,.txt"
              multiple
              :disabled="importBusy"
              @change="pickFiles"
            /></label
          ><button class="secondary" :disabled="importBusy" @click="pickDirectory">
            <BoostIcon name="folder-open" :size="15" />从文件夹导入</button
          ><label class="form-field"
            >或粘贴 JSON<textarea
              v-model="content"
              placeholder="粘贴账号授权 JSON…"
              spellcheck="false"
            /></label
          ><DialogActions
            ><button
              class="primary"
              :disabled="importBusy || !content.trim()"
              @click="importContent"
            >
              {{ importBusy ? "导入中…" : "导入账号" }}
            </button></DialogActions
          ></template
        ><template v-else-if="importTab === 'oauth'"
          ><span>授权登录<HelpHint label="授权登录" text="通过 OpenAI 官方页面授权登录，授权完成后点击检查登录。" /></span>
          <template v-if="login"
            ><a
              class="secondary"
              :href="login.authUrl || login.verificationUrl || '#'"
              target="_blank"
              rel="noopener noreferrer"
              >打开授权页面<BoostIcon name="arrow-up-right" :size="15"
            /></a>
            <div v-if="login.userCode" class="credential-box">
              {{ login.userCode }}
            </div>
            <DialogActions
              ><button class="primary" :disabled="importBusy" @click="checkLogin">
                检查登录
              </button></DialogActions
            ></template
          ><DialogActions v-else
            ><button class="primary" :disabled="importBusy" @click="startLogin">
              {{ importBusy ? "创建授权…" : "使用 OpenAI 登录" }}
            </button></DialogActions
          ></template
        >
        <form v-else class="form-stack" @submit.prevent="tokenLogin">
          <label class="form-field"
            >Access Token<input
              v-model="accessToken"
              required
              type="password"
              autocomplete="off"
              spellcheck="false" /></label
          ><label class="form-field"
            >Refresh Token（可选）<input
              v-model="refreshToken"
              type="password"
              autocomplete="off"
              spellcheck="false" /></label
          ><DialogActions
            ><button class="primary" :disabled="importBusy">
              添加账号
            </button></DialogActions
          >
        </form>
      </div></BoostDialog
    >
    <AccountEditorDialog
      v-if="editing"
      :account="editing"
      @close="editing = null"
    />
    <QuotaResetDialog v-if="confirming === 'reset' && resetAccount" :account="resetAccount" :busy="pool.isPending(`${resetAccount.id}:reset`)" :error="resetError" @close="confirming = ''" @confirm="pool.confirmReset" />
    <BoostDialog
      v-if="confirming && confirming !== 'reset'"
      :title="
        (
          {
            delete: '删除选中账号',
            cleanup: '按状态清理',
            export: '导出账号',
            number: '连续编号',
          } as Record<string, string>
        )[confirming]
      "
      @close="confirming = ''"
    >
      <div class="form-stack">
        <template v-if="confirming === 'number'"
          ><p>为 {{ targets.length }} 个账号按当前顺序连续编号。</p>
          <label class="form-field"
            >起始编号<input
              v-model.number="numberingStart"
              type="number"
              min="0"
              step="1" /></label
        ></template>
        <template v-else-if="confirming === 'export'"
          ><p>导出 {{ targets.length }} 个账号。</p>
          <label class="form-field"
            >导出格式<select v-model="exportMode">
              <option value="single">一个 JSON 数组文件</option>
              <option value="multiple">每个账号独立文件</option>
            </select></label
          ></template
        >
        <template v-else-if="confirming === 'cleanup'"
          ><p>清理所有符合以下状态的账号及本地授权。</p>
          <label
            v-for="(title, value) in {
              banned: '已封禁',
              unavailable: '不可用',
              disabled: '已禁用',
              limited: '额度受限',
            }"
            :key="value"
            class="account-check-label"
            ><input
              v-model="cleanupStatuses"
              type="checkbox"
              :value="value"
            />{{ title }}</label
          ></template
        >
        <p v-else>确认删除选中的 {{ targets.length }} 个账号及本地授权？</p>
        <DialogActions
          ><button class="secondary" @click="confirming = ''">
            取消</button
          ><button
            :class="
              ['delete', 'cleanup'].includes(confirming)
                ? 'danger-button'
                : 'primary'
            "
            :disabled="
              confirming === 'cleanup' && !cleanupStatuses.length
            "
            @click="pool.confirm"
          >
            确认
          </button></DialogActions
        >
      </div>
    </BoostDialog>
    <BoostDialog
      v-if="deleting"
      title="删除账号"
      @close="deleting = null"
      ><p style="line-height: 1.8; margin-bottom: 20px">
        确认删除 {{ deleting.name }}？此操作会移除本地保存的账号授权。
      </p>
      <DialogActions>
        <button class="secondary" @click="deleting = null">
          取消</button
        ><button class="danger-button" @click="remove">
          删除账号
        </button>
      </DialogActions></BoostDialog
    >
  </div>
</template>
