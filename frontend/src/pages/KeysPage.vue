<script setup lang="ts">
import DialogActions from "@/components/DialogActions.vue";
import { computed, ref, watch, onActivated, onDeactivated } from "vue";
import type { ApiKey, ApiKeyOwner, ApiKeyUsageStat, AppUser } from "@/types";
import BoostIcon from "@/components/BoostIcon.vue";
import PanelCard from "@/components/PanelCard.vue";
import EmptyState from "@/components/EmptyState.vue";
import BoostDialog from "@/components/BoostDialog.vue";
import BoostConfigGuide from "@/components/BoostConfigGuide.vue";
import PlatformKeysTable from "@/components/PlatformKeysTable.vue";
import ApiKeyEditorDialog from "@/components/ApiKeyEditorDialog.vue";
import BoostMenu from "@/components/BoostMenu.vue";
import UsageOverview from "@/components/UsageOverview.vue";
import { usePendingActions } from "@/composables/usePendingActions";
import {
  buildOpenAiGatewayEndpoint,
  buildClaudeCodeGatewayEndpoint,
  resolveGatewayOrigin,
} from "@/lib/gateway/endpoints";
import {
  getAppErrorMessage,
  getCachedRuntimeCapabilities,
} from "@/lib/api/transport";
import {
  boost,
  isAdmin,
  copyText,
  formatNumber,
  notify,
  perform,
} from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
import { appClient } from "@/lib/api/app-client";
const query = ref("");
const { isPending, run } = usePendingActions();
const usageOverview = ref<InstanceType<typeof UsageOverview>>();
const dialog = ref(false);
const editing = ref<ApiKey | null>(null);
const deleting = ref<ApiKey | null>(null);
const secret = ref("");
const guide = ref(false);
const guideKey = ref("");
const usage = ref<ApiKeyUsageStat[] | null>(null),
  usageLoading = ref(false);
const users = ref<AppUser[]>([]);
const keyOwners = ref<ApiKeyOwner[]>([]);
const distributionEnabled = ref(false);
const memberOwnershipEnabled = computed(
  () => isAdmin.value && boost.session?.mode === "accounts",
);
const ownerLabels = computed(
  () =>
    Object.fromEntries(
      keyOwners.value.map((owner) => {
        if (owner.ownerKind === "user") {
          const user = users.value.find(
            (item) => item.id === owner.ownerUserId,
          );
          return [
            owner.keyId,
            user
              ? user.displayName
                ? `${user.displayName} (${user.username})`
                : user.username
              : "成员",
          ];
        }
        return [
          owner.keyId,
          owner.ownerKind === "project"
            ? `项目 ${owner.projectId || ""}`
            : "未分配",
        ];
      }),
    ) as Record<string, string>,
);
const gatewayOrigin = computed(() =>
  resolveGatewayOrigin({
    browserOrigin: window.location.origin,
    runtimeMode: getCachedRuntimeCapabilities()?.mode,
    serviceAddr: boost.settings?.serviceAddr,
  }),
);
let active = false;
async function loadUsage() {
  if (!boost.ready || usageLoading.value) return;
  usageLoading.value = true;
  try {
    usage.value = await accountClient.listApiKeyUsageStats();
  } catch (e) {
    usage.value = null;
    notify(`读取密钥用量失败: ${getAppErrorMessage(e)}`, true);
  } finally {
    usageLoading.value = false;
  }
}
onActivated(() => {
  active = true;
  if (boost.ready) void perform(reload);
});
onDeactivated(() => {
  active = false;
  secret.value = "";
  guideKey.value = "";
  guide.value = false;
  dialog.value = false;
  deleting.value = null;
});
watch(
  () => boost.ready,
  (ready) => {
    if (ready && active) void perform(reload);
  },
);
watch(
  () => boost.updatedAt,
  () => {
    if (active) void loadUsage();
  },
);
async function copyEndpoint(kind: string) {
  await perform(() =>
    copyText(
      kind === "openai"
        ? buildOpenAiGatewayEndpoint(gatewayOrigin.value)
        : buildClaudeCodeGatewayEndpoint(gatewayOrigin.value),
    ),
  );
}
async function keyGuide(k: ApiKey) {
  await perform(async () =>
    openGuide(await accountClient.readApiKeySecret(k.id)),
  );
}
function openGuide(key = "") {
  guideKey.value = key;
  secret.value = "";
  guide.value = true;
}
const visible = computed(() =>
  boost.keys.filter((k) =>
    `${k.id} ${k.name} ${k.model} ${k.modelSlug}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
async function reload() {
  const jobs: Promise<unknown>[] = [
    accountClient.listApiKeys().then((items) => {
      boost.keys = items;
    }),
    loadUsage(),
    usageOverview.value?.reload() ?? Promise.resolve(),
  ];
  if (memberOwnershipEnabled.value)
    jobs.push(
      Promise.all([
        appClient.getAccountManagerStatus(),
        appClient.listAppUsers(),
        appClient.listApiKeyOwners(),
      ]).then(([status, nextUsers, owners]) => {
        distributionEnabled.value = status.distributionEnabled;
        users.value = nextUsers;
        keyOwners.value = owners;
      }),
    );
  await Promise.all(jobs);
}
function open(k?: ApiKey) {
  editing.value = k || null;
  dialog.value = true;
}
async function saved(_keyId: string, value: string) {
  dialog.value = false;
  if (value) secret.value = value;
  await perform(reload);
}
async function toggle(k: ApiKey) {
  await run(`${k.id}:toggle`, async () => {
    try {
      if (k.status !== "disabled") await accountClient.disableApiKey(k.id);
      else await accountClient.enableApiKey(k.id);
      await reload();
      notify("状态已更新");
    } catch (e) {
      notify(`更新状态失败: ${getAppErrorMessage(e)}`, true);
    }
  });
}
async function remove() {
  if (!deleting.value) return;
  const key = deleting.value;
  deleting.value = null;
  await run(`${key.id}:delete`, async () => {
    try {
      await accountClient.deleteApiKey(key.id);
      await reload();
      notify("密钥已删除");
    } catch (e) {
      notify(`删除失败: ${getAppErrorMessage(e)}`, true);
    }
  });
}
</script>
<template>
  <div class="keys-page">
    <div class="page-toolbar">
      <div class="toolbar-group">
        <div class="key-page-heading">
          <h2>平台密钥</h2>
        </div>
        <span class="badge">{{ boost.keys.length }} 个平台密钥</span>
      </div>
      <div class="toolbar-group">
        <BoostMenu
          label="网关端点"
          icon="link"
          :items="[
            {
              value: 'openai',
              label: '复制 OpenAI / Codex 端点',
              icon: 'copy',
            },
            {
              value: 'native',
              label: '复制 Claude / Gemini 端点',
              icon: 'copy',
            },
          ]"
          @select="copyEndpoint"
        />
        <button class="primary" @click="open()">
          <BoostIcon name="plus" :size="15" />新建密钥
        </button>
      </div>
    </div>
    <UsageOverview ref="usageOverview" />
    <div v-if="boost.keys.length" class="page-toolbar">
      <div class="search-field">
        <BoostIcon name="search" :size="16" /><input
          v-model="query"
          placeholder="搜索密钥或模型…"
          aria-label="搜索密钥"
        />
      </div>
      <div class="toolbar-group">
        <button
          class="secondary"
          :disabled="usageLoading"
          @click="perform(reload)"
        >
          <BoostIcon
            name="rotate-ccw"
            :size="14"
            :class="{ spinning: usageLoading }"
          />刷新用量</button
        ><RouterLink class="text-button" to="/models/"
          >模型管理<BoostIcon name="chevron-right" :size="14"
        /></RouterLink>
      </div>
    </div>
    <PlatformKeysTable
      v-if="visible.length"
      :keys="visible"
      :usage="usage"
      :is-pending="isPending"
      :show-owners="memberOwnershipEnabled"
      :owners="ownerLabels"
      :distribution-enabled="distributionEnabled"
      @edit="open"
      @toggle="toggle"
      @remove="deleting = $event"
      @guide="keyGuide"
    />
    <PanelCard v-else
      ><EmptyState
        icon="arrow-up-right"
        :title="query ? '没有匹配的密钥' : '创建第一个平台密钥'"
        description="为客户端生成平台密钥，按需指定模型和调用策略。"
        ><button class="primary" @click="open()">
          <BoostIcon name="plus" :size="15" />新建密钥
        </button></EmptyState
      ></PanelCard
    >
    <ApiKeyEditorDialog
      v-if="dialog"
      :api-key="editing"
      :users="users"
      :owner="
        editing
          ? keyOwners.find((owner) => owner.keyId === editing?.id) || null
          : null
      "
      :member-ownership-enabled="memberOwnershipEnabled"
      :distribution-enabled="distributionEnabled"
      @close="dialog = false"
      @saved="saved"
    />
    <BoostDialog v-if="secret" title="平台密钥" @close="secret = ''"
      ><div class="hint" style="margin-bottom: 16px">
        请妥善保存密钥，持有此密钥的客户端可以通过对应规则调用服务。
      </div>
      <div class="credential-box">{{ secret }}</div>
      <DialogActions>
        <button class="secondary" @click="openGuide(secret)">配置方法</button>
        <button data-dialog-close class="secondary" @click="secret = ''">关闭</button
        ><button class="primary" @click="perform(() => copyText(secret))">
          <BoostIcon name="copy" :size="15" />复制密钥
        </button>
      </DialogActions></BoostDialog
    >
    <BoostDialog v-if="deleting" title="删除密钥" @close="deleting = null"
      ><p style="line-height: 1.8; margin-bottom: 20px">
        确认删除 {{ deleting.name }}？使用此密钥的客户端将无法继续调用服务。
      </p>
      <DialogActions>
        <button data-dialog-close class="secondary" @click="deleting = null">取消</button
        ><button class="danger-button" @click="remove">删除密钥</button>
      </DialogActions></BoostDialog
    >
    <BoostConfigGuide
      v-if="guide"
      :api-key="guideKey"
      @close="
        guide = false;
        guideKey = '';
      "
    />
  </div>
</template>
