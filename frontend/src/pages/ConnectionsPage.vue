<script setup lang="ts">
import DialogActions from "@/components/DialogActions.vue";
import { computed, ref, watch, onActivated, onDeactivated } from "vue";
import type { AggregateApi, AggregateApiSecretResult } from "@/types";
import type { QuotaModelPoolItem } from "@/types/quota";
import BoostIcon from "@/components/BoostIcon.vue";
import PanelCard from "@/components/PanelCard.vue";
import EmptyState from "@/components/EmptyState.vue";
import BoostDialog from "@/components/BoostDialog.vue";
import AggregateModelsDialog from "@/components/AggregateModelsDialog.vue";
import AggregateConnectionOptions from "@/components/AggregateConnectionOptions.vue";
import AggregateApiTable from "@/components/AggregateApiTable.vue";
import BoostMenu from "@/components/BoostMenu.vue";
import { quotaClient } from "@/lib/api/quota-client";
import { useAggregateOptions } from "@/composables/useAggregateOptions";
import { usePendingActions } from "@/composables/usePendingActions";
import { getAppErrorMessage } from "@/lib/api/transport";
import {
  boost,
  isAdmin,
  notify,
  perform,
  copyText,
} from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
const query = ref("");
const status = ref("all");
const busy = ref(false);
const { isPending, run } = usePendingActions();
let reloadVersion = 0;
let appliedReload = 0;
const pools = ref<QuotaModelPoolItem[]>([]);
let active = false;
onActivated(() => {
  active = true;
  if (boost.ready && isAdmin.value) void perform(reload);
});
onDeactivated(() => {
  active = false;
  secret.value = null;
  dialog.value = false;
  modelPool.value = null;
  deleting.value = null;
});
watch(
  () => boost.ready,
  (ready) => {
    if (ready && active && isAdmin.value) void perform(reload);
  },
);
const dialog = ref(false);
const editing = ref<AggregateApi | null>(null);
const deleting = ref<AggregateApi | null>(null);
const modelPool = ref<AggregateApi | null>(null);
const importedCounts = ref<Record<string, number>>({});
async function poolChanged(count: number) {
  if (modelPool.value) importedCounts.value[modelPool.value.id] = count;
  await reload();
}
const options = useAggregateOptions();
const providerFilter = ref("all"),
  secret = ref<AggregateApiSecretResult | null>(null);
const name = ref("");
const url = ref("");
const key = ref("");
const provider = ref("codex");
const preset = ref("custom");
const presets: Record<string, { name: string; provider: string; url: string }> =
  {
    gpt: {
      name: "OpenAI",
      provider: "codex",
      url: "https://api.openai.com/v1",
    },
    deepseek: {
      name: "DeepSeek",
      provider: "codex",
      url: "https://api.deepseek.com/v1",
    },
    gemini: {
      name: "Gemini",
      provider: "gemini",
      url: "https://generativelanguage.googleapis.com",
    },
    claude: {
      name: "Claude",
      provider: "claude",
      url: "https://api.anthropic.com/v1",
    },
  };
function applyPreset() {
  const value = presets[preset.value];
  if (value) {
    name.value = value.name;
    provider.value = value.provider;
    url.value = value.url;
  }
}
const models = ref("");
const latency = ref<Record<string, number>>({});
const visible = computed(() =>
  boost.connections.filter(
    (a) =>
      `${a.supplierName} ${a.url}`
        .toLowerCase()
        .includes(query.value.toLowerCase()) &&
      (status.value === "all" || a.status === status.value) &&
      (providerFilter.value === "all" ||
        a.providerType === providerFilter.value),
  ),
);
async function reload() {
  const version = ++reloadVersion;
  const [items, result] = await Promise.all([
    accountClient.listAggregateApis(),
    quotaClient.modelPools().catch((e) => {
      notify(`读取模型额度失败: ${getAppErrorMessage(e)}`, true);
      return null;
    }),
  ]);
  if (version < appliedReload) return;
  appliedReload = version;
  boost.connections = items;
  if (result) pools.value = result.items;
}
function open(a?: AggregateApi) {
  options.reset(a);
  if (!a)
    options.draft.sort =
      Math.max(0, ...boost.connections.map((api) => api.sort)) + 5;
  preset.value = "custom";
  editing.value = a || null;
  name.value = a?.supplierName || "";
  url.value = a?.url || "";
  provider.value = a?.providerType || "codex";
  models.value = a?.modelSlugs.join(", ") || "";
  key.value = "";
  dialog.value = true;
}
async function save() {
  if (busy.value) return;
  busy.value = true;
  await perform(async () => {
    const payload = {
      ...options.payload(),
      supplierName: name.value.trim(),
      url: url.value.trim(),
      key: key.value.trim() || null,
      providerType: provider.value,
      modelSlugs: models.value
        .split(",")
        .map((m) => m.trim())
        .filter(Boolean),
    };
    const parsed = new URL(payload.url);
    if (!["http:", "https:"].includes(parsed.protocol))
      throw new Error("请输入有效的 HTTP 或 HTTPS 地址");
    if (!Number.isSafeInteger(payload.sort)) throw new Error("顺序必须为整数");
    if (
      payload.authType === "userpass" &&
      (!editing.value || editing.value.authType !== "userpass") &&
      (!payload.username || !payload.password)
    )
      throw new Error("请输入账号密码");
    if (
      payload.authType === "userpass" &&
      Boolean(payload.username) !== Boolean(payload.password)
    )
      throw new Error("账号和密码必须同时填写");
    if (
      payload.authType === "apikey" &&
      (!editing.value || editing.value.authType !== "apikey") &&
      !payload.key
    )
      throw new Error("请输入聚合 API 密钥");
    if (payload.actionCustomEnabled && !payload.action)
      throw new Error("请输入自定义请求路径");
    if (editing.value)
      await accountClient.updateAggregateApi(editing.value.id, payload);
    else await accountClient.createAggregateApi(payload);
    await reload();
    dialog.value = false;
    key.value = "";
    notify(editing.value ? "聚合 API 已更新" : "聚合 API 已创建");
  });
  busy.value = false;
}
async function runAction(
  operation: string,
  errorPrefix: string,
  task: () => Promise<void>,
  refresh = true,
) {
  return run(operation, async () => {
    try {
      await task();
    } catch (e) {
      notify(`${errorPrefix}: ${getAppErrorMessage(e)}`, true);
    } finally {
      if (refresh) await perform(reload);
    }
  });
}
async function test(a: AggregateApi) {
  await runAction(`${a.id}:test`, "测试失败", async () => {
    const result = await accountClient.testAggregateApiConnection(a.id);
    latency.value[a.id] = result.latencyMs;
    notify(
      result.ok
        ? "已连通"
        : `连通性测试失败: ${result.message || result.statusCode || "未返回具体错误信息"}`,
      !result.ok,
    );
  });
}
async function toggle(a: AggregateApi) {
  await runAction(`${a.id}:toggle`, "更新状态失败", async () => {
    await accountClient.updateAggregateApi(a.id, {
      status: a.status === "disabled" ? "active" : "disabled",
    });
    notify("状态已更新");
    await perform(async () => {
      boost.keys = await accountClient.listApiKeys();
    });
  });
}
async function remove() {
  if (!deleting.value) return;
  const id = deleting.value.id;
  deleting.value = null;
  await runAction(`${id}:delete`, "删除失败", async () => {
    await accountClient.deleteAggregateApi(id);
    notify("聚合 API 已删除");
    await perform(async () => {
      boost.keys = await accountClient.listApiKeys();
    });
  });
}
async function readSecret(a: AggregateApi) {
  await runAction(
    `${a.id}:secret`,
    "读取密钥失败",
    async () => {
      secret.value = await accountClient.readAggregateApiSecret(a.id);
    },
    false,
  );
}
async function prioritize(a: AggregateApi) {
  await runAction(`${a.id}:prefer`, "设为优先失败", async () => {
    const minimum = Math.min(...boost.connections.map((api) => api.sort));
    if (a.sort > minimum)
      await accountClient.updateAggregateApi(a.id, { sort: minimum - 5 });
    notify("设为优先");
  });
}
async function refreshBalance(a: AggregateApi) {
  await runAction(`${a.id}:balance`, "余额查询失败", async () => {
    const result = await accountClient.refreshAggregateApiBalance(a.id);
    notify(
      result.ok
        ? "余额已刷新"
        : `余额查询失败: ${result.message || "未返回具体错误信息"}`,
      !result.ok,
    );
  });
}
async function batch(mode: "test" | "balance") {
  const apis = visible.value.filter(
    (api) =>
      api.status === "active" && (mode === "test" || api.balanceQueryEnabled),
  );
  if (!apis.length) {
    notify(
      mode === "test" ? "暂无可测试的聚合 API" : "暂无已启用余额检测的聚合 API",
    );
    return;
  }
  await runAction(
    `batch:${mode}`,
    mode === "test" ? "批量测试失败" : "批量刷新余额失败",
    async () => {
      const results = await Promise.allSettled(
        apis.map(async (api) => {
          if (mode === "test") {
            const result = await accountClient.testAggregateApiConnection(
              api.id,
            );
            latency.value[api.id] = result.latencyMs;
            return result;
          }
          return accountClient.refreshAggregateApiBalance(api.id);
        }),
      );
      const success = results.filter(
        (result) => result.status === "fulfilled" && result.value.ok,
      ).length;
      const failed = results.length - success;
      notify(
        mode === "test"
          ? failed
            ? `测试完成：${success} 个连通，${failed} 个失败`
            : `全部测试完成，${success} 个连通`
          : failed
            ? `余额刷新完成：${success} 个成功，${failed} 个失败`
            : `余额刷新完成：${success} 个成功`,
        failed > 0,
      );
    },
  );
}
function rowAction(api: AggregateApi, action: string) {
  if (action === "edit") open(api);
  else if (action === "models") modelPool.value = api;
  else if (action === "delete") deleting.value = api;
  else if (action === "test") void test(api);
  else if (action === "balance") void refreshBalance(api);
  else if (action === "toggle") void toggle(api);
  else if (action === "prefer") void prioritize(api);
  else if (action === "secret") void readSecret(api);
}
</script>
<template>
  <div v-if="isAdmin" class="connections-page">
    <div class="page-toolbar">
      <div class="toolbar-group">
        <span class="eyebrow">UPSTREAM CONNECTIONS</span
        ><span class="badge">{{ boost.connections.length }} 个聚合 API</span>
      </div>
      <div class="toolbar-group">
        <button
          class="secondary"
          :disabled="isPending('batch:test') || !visible.length"
          @click="batch('test')"
        >
          <BoostIcon
            name="rotate-ccw"
            :size="15"
            :class="{ spinning: isPending('batch:test') }"
          />测试全部</button
        ><button
          class="secondary"
          :disabled="
            isPending('batch:balance') ||
            !visible.some((a) => a.balanceQueryEnabled)
          "
          @click="batch('balance')"
        >
          <BoostIcon
            name="rotate-ccw"
            :size="15"
            :class="{ spinning: isPending('batch:balance') }"
          />刷新余额</button
        ><button class="primary" @click="open()">
          <BoostIcon name="plus" :size="15" />添加聚合API
        </button>
      </div>
    </div>
    <div class="filter-toolbar">
      <div v-spring-switch class="segmented">
        <button :class="{ selected: status === 'all' }" @click="status = 'all'">
          全部 {{ boost.connections.length }}
        </button>
        <button
          :class="{ selected: status === 'active' }"
          @click="status = 'active'"
        >
          活跃
          {{
            boost.connections.filter((a) => a.status === "active").length
          }}</button
        ><button
          :class="{ selected: status === 'disabled' }"
          @click="status = 'disabled'"
        >
          已关闭
          {{ boost.connections.filter((a) => a.status !== "active").length }}
        </button>
      </div>
      <div class="search-field">
        <BoostIcon name="search" :size="16" /><input
          v-model="query"
          placeholder="过滤聚合 API…"
          aria-label="搜索聚合 API"
        />
      </div>
      <BoostMenu
        :label="
          (
            {
              all: '全部类型',
              codex: 'OpenAI 兼容',
              claude: 'Claude',
              gemini: 'Gemini',
            } as Record<string, string>
          )[providerFilter] || providerFilter
        "
        :selected="providerFilter"
        :items="[
          { value: 'all', label: '全部类型', icon: 'network' },
          { value: 'codex', label: 'OpenAI 兼容', icon: 'openai' },
          { value: 'claude', label: 'Claude', icon: 'message-circle' },
          { value: 'gemini', label: 'Gemini', icon: 'zap' },
        ]"
        @select="providerFilter = $event"
      />
    </div>
    <AggregateApiTable
      v-if="visible.length"
      :apis="visible"
      :is-pending="isPending"
      :latency="latency"
      :pools="pools"
      :imported-counts="importedCounts"
      @action="rowAction"
    />
    <EmptyState
      v-else
      class="compact-empty"
      icon="inbox"
      :title="query ? '没有匹配的聚合 API' : '暂无聚合 API'"
    />
    <BoostDialog
      v-if="dialog"
      :title="editing ? '编辑聚合API' : '添加聚合API'"
      @close="!busy && (dialog = false)"
      ><form class="form-stack" @submit.prevent="save">
        <label v-if="!editing" class="form-field"
          >快速配置<select
            v-model="preset"
            aria-label="快速配置"
            @change="applyPreset"
          >
            <option value="custom">自定义连接</option>
            <option value="gpt">GPT · OpenAI</option>
            <option value="deepseek">DeepSeek</option>
            <option value="gemini">Gemini · Google</option>
            <option value="claude">Claude · Anthropic</option>
          </select></label
        >
        <label class="form-field"
          >名称<input
            v-model="name"
            placeholder="例如：工作 API"
            required /></label
        ><label class="form-field"
          >服务类型<select v-model="provider">
            <option value="codex">OpenAI 兼容</option>
            <option value="claude">Claude</option>
            <option value="gemini">Gemini</option>
          </select></label
        ><label class="form-field"
          >上游地址<input
            v-model="url"
            type="url"
            placeholder="https://api.example.com/v1"
            required /></label
        ><label v-if="options.draft.authType === 'apikey'" class="form-field"
          >API Key<input
            v-model="key"
            type="password"
            autocomplete="off"
            :required="!editing"
            :placeholder="editing ? '留空保留已有密钥' : 'sk-…'" /></label
        ><label class="form-field"
          >模型（可选）<input
            v-model="models"
            placeholder="多个模型用英文逗号分隔"
        /></label>
        <AggregateConnectionOptions
          :draft="options.draft"
          :editing="!!editing"
        />
        <DialogActions>
          <button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="dialog = false"
          >
            取消</button
          ><button class="primary" :disabled="busy">保存聚合API</button>
        </DialogActions>
      </form></BoostDialog
    >
    <AggregateModelsDialog
      v-if="modelPool"
      :api="modelPool"
      @close="modelPool = null"
      @changed="poolChanged"
    />
    <BoostDialog v-if="secret" title="连接密钥" @close="secret = null"
      ><template v-if="secret.authType === 'userpass'"
        ><p>用户名</p>
        <div class="credential-box">{{ secret.username }}</div>
        <p>密码</p>
        <div class="credential-box">{{ secret.password }}</div></template
      >
      <div v-else class="credential-box">{{ secret.key }}</div>
      <DialogActions
        ><button class="secondary" @click="secret = null">关闭</button
        ><button
          class="primary"
          @click="
            perform(() =>
              copyText(
                secret!.authType === 'userpass'
                  ? JSON.stringify({
                      username: secret!.username,
                      password: secret!.password,
                    })
                  : secret!.key,
              ),
            )
          "
        >
          复制凭据
        </button></DialogActions
      ></BoostDialog
    >
    <BoostDialog v-if="deleting" title="删除聚合API" @close="deleting = null"
      ><p style="margin-bottom: 20px">
        确认删除 {{ deleting.supplierName || deleting.url }}？
      </p>
      <DialogActions>
        <button class="secondary" @click="deleting = null">取消</button
        ><button class="danger-button" @click="remove">删除聚合API</button>
      </DialogActions></BoostDialog
    >
  </div>
  <PanelCard v-else
    ><EmptyState
      icon="circle-alert"
      title="需要管理员权限"
      description="请使用管理员账号管理上游链接。"
  /></PanelCard>
</template>
