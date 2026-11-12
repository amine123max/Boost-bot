<script setup lang="ts">
import HelpHint from "./HelpHint.vue";
import { computed, ref, onMounted, watch } from "vue";
import type { ApiKey, ApiKeyOwner, AppUser } from "@/types";
import { accountClient } from "@/lib/api/account-client";
import { appClient } from "@/lib/api/app-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { boost, isAdmin, notify } from "@/composables/useBoost";
import {
  formatQuotaLimitValue,
  parseQuotaLimitTokens,
  resolveQuotaLimitUnit,
  type QuotaLimitUnit,
} from "@/lib/utils/api-key-quota";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
const props = defineProps<{
  apiKey: ApiKey | null;
  users?: AppUser[];
  owner?: ApiKeyOwner | null;
  memberOwnershipEnabled?: boolean;
  distributionEnabled?: boolean;
}>();
const emit = defineEmits<{
  close: [];
  saved: [keyId: string, secret: string];
}>();
const name = ref(props.apiKey?.name || "");
const model = ref(props.apiKey?.modelSlug || "");
const protocol = ref(props.apiKey?.protocol || "openai_compat");
const rotation = ref(props.apiKey?.rotationStrategy || "account_rotation");
const aggregateId = ref(props.apiKey?.aggregateApiId || "");
const plan = ref(props.apiKey?.accountPlanFilter || "all");
const reasoning = ref(props.apiKey?.reasoningEffort || "");
const tier = ref(props.apiKey?.serviceTier || "");
const upstream = ref(props.apiKey?.upstreamBaseUrl || "");
const headers = ref(props.apiKey?.staticHeadersJson || "");
const customKey = ref(""),
  busy = ref(false),
  advanced = ref(false);
const quotaUnit = ref<QuotaLimitUnit>(
  resolveQuotaLimitUnit(props.apiKey?.quotaLimitTokens),
);
const quotaValue = ref(
  formatQuotaLimitValue(props.apiKey?.quotaLimitTokens, quotaUnit.value),
);
const models = ref<string[]>([]);
const ownerUserId = ref(
  props.owner?.ownerKind === "user" ? props.owner.ownerUserId || "" : "",
);
const eligibleUsers = computed(() =>
  (props.users || []).filter((user) => user.role !== "admin"),
);
const quotaTokens = computed(() =>
  parseQuotaLimitTokens(quotaValue.value, quotaUnit.value),
);
function changeUnit(event: Event) {
  const oldTokens = quotaTokens.value;
  quotaUnit.value = (event.target as HTMLSelectElement).value as QuotaLimitUnit;
  if (oldTokens != null)
    quotaValue.value = formatQuotaLimitValue(oldTokens, quotaUnit.value);
}
onMounted(async () => {
  try {
    models.value = (await accountClient.listModels(false)).models.map(
      (m) => m.slug,
    );
  } catch {
    /* Manual model identifiers remain available if discovery is unavailable. */
  }
});
watch(
  () => [
    props.owner?.ownerKind,
    props.owner?.ownerUserId,
    eligibleUsers.value.length,
    props.distributionEnabled,
    props.apiKey?.id,
  ],
  () => {
    ownerUserId.value =
      props.owner?.ownerKind === "user"
        ? props.owner.ownerUserId || ""
        : props.distributionEnabled && !props.apiKey
          ? eligibleUsers.value[0]?.id || ""
          : "";
  },
  { immediate: true },
);
async function save() {
  if (busy.value) return;
  busy.value = true;
  try {
    if (!name.value.trim()) throw new Error("请输入密钥名称");
    if (
      props.memberOwnershipEnabled &&
      props.distributionEnabled &&
      !ownerUserId.value
    )
      throw new Error("请选择平台密钥归属成员");
    if (
      quotaValue.value.trim() &&
      (quotaTokens.value == null || !Number.isSafeInteger(quotaTokens.value))
    )
      throw new Error("额度必须为有效的正数");
    if (upstream.value.trim()) {
      const url = new URL(upstream.value.trim());
      if (!["http:", "https:"].includes(url.protocol))
        throw new Error("请输入有效的 HTTP 或 HTTPS 地址");
    }
    if (headers.value.trim()) {
      const value = JSON.parse(headers.value);
      if (!value || typeof value !== "object" || Array.isArray(value))
        throw new Error("自定义请求头必须为 JSON 对象");
    }
    const payload = {
      name: name.value.trim(),
      modelSlug: model.value.trim() || null,
      protocolType: protocol.value,
      rotationStrategy: isAdmin.value
        ? rotation.value
        : props.apiKey?.rotationStrategy || "account_rotation",
      aggregateApiId:
        isAdmin.value &&
        ["aggregate_api_rotation", "hybrid_rotation"].includes(rotation.value)
          ? aggregateId.value || null
          : null,
      accountPlanFilter:
        isAdmin.value &&
        rotation.value !== "aggregate_api_rotation" &&
        plan.value !== "all"
          ? plan.value
          : null,
      quotaLimitTokens: quotaTokens.value,
      reasoningEffort: reasoning.value || null,
      serviceTier: tier.value || null,
      upstreamBaseUrl: upstream.value.trim() || null,
      staticHeadersJson: headers.value.trim() || null,
      customKey:
        !props.apiKey && customKey.value.trim() ? customKey.value.trim() : null,
    };
    let secret = "";
    let keyId = props.apiKey?.id || "";
    if (props.apiKey)
      await accountClient.updateApiKey(props.apiKey.id, payload);
    else {
      const created = await accountClient.createApiKey(payload);
      keyId = created.id;
      secret = created.key;
    }
    if (props.memberOwnershipEnabled && ownerUserId.value) {
      try {
        await appClient.setApiKeyOwner({
          keyId,
          ownerKind: "user",
          ownerUserId: ownerUserId.value,
          projectId: null,
        });
      } catch (error) {
        notify(
          `密钥已保存，成员归属更新失败: ${getAppErrorMessage(error)}`,
          true,
        );
        emit("saved", keyId, secret);
        return;
      }
    }
    notify(props.apiKey ? "密钥配置已更新" : "密钥已创建");
    customKey.value = "";
    emit("saved", keyId, secret);
  } catch (e) {
    notify(
      `${props.apiKey ? "更新" : "创建"}失败: ${getAppErrorMessage(e)}`,
      true,
    );
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BoostDialog
    :title="apiKey ? '编辑密钥' : '新建密钥'"
    @close="!busy && emit('close')"
  >
    <form class="form-stack" @submit.prevent="save">
      <label class="form-field"
        >名称<input v-model="name" required placeholder="例如：桌面客户端"
      /></label>
      <label v-if="memberOwnershipEnabled" class="form-field"
        ><span>归属成员<HelpHint label="归属成员" :text="distributionEnabled ? '额度分发开启时，密钥必须归属到一个成员。' : '可先不分配；开启额度分发后再补齐归属。'" /></span><select aria-label="归属成员"
          v-model="ownerUserId"
          :disabled="!eligibleUsers.length"
        >
          <option v-if="!distributionEnabled && !ownerUserId" value="">
            未分配
          </option>
          <option v-for="user in eligibleUsers" :key="user.id" :value="user.id">
            {{
              user.displayName
                ? `${user.displayName} (${user.username})`
                : user.username
            }}
          </option></select
        ></label
      >
      <div class="form-two">
        <label class="form-field"
          >协议<select v-model="protocol">
            <option value="openai_compat">OpenAI Compat</option>
            <option value="anthropic_native">Anthropic Native</option>
            <option value="gemini_native">Gemini Native</option>
          </select></label
        ><label v-if="isAdmin" class="form-field"
          >轮转策略<select v-model="rotation">
            <option value="account_rotation">账号轮转</option>
            <option value="aggregate_api_rotation">聚合 API 轮转</option>
            <option value="hybrid_rotation">混合轮转（账号优先）</option>
          </select></label
        >
      </div>
      <label
        v-if="isAdmin && rotation !== 'account_rotation'"
        class="form-field"
        >聚合 API<select v-model="aggregateId">
          <option value="">全部聚合 API</option>
          <option
            v-for="api in boost.connections"
            :key="api.id"
            :value="api.id"
          >
            {{ api.supplierName || api.url
            }}{{ api.status === "disabled" ? " · 已禁用" : "" }}
          </option>
        </select></label
      >
      <label
        v-if="isAdmin && rotation !== 'aggregate_api_rotation'"
        class="form-field"
        >账号组筛选<select v-model="plan">
          <option value="all">全部账号</option>
          <option
            v-for="value in [
              'free',
              'go',
              'plus',
              'pro',
              'team',
              'business',
              'enterprise',
              'edu',
              'k12',
            ]"
            :key="value"
            :value="value"
          >
            {{ value.toUpperCase() }}
          </option>
        </select></label
      >
      <label class="form-field"
        >绑定模型<input
          v-model="model"
          list="platform-key-models"
          placeholder="留空跟随请求" /><datalist id="platform-key-models">
          <option
            v-for="value in models"
            :key="value"
            :value="value"
          /></datalist
      ></label>
      <label class="form-field"
        >总额度限制
        <div class="quota-input">
          <input
            v-model="quotaValue"
            inputmode="decimal"
            placeholder="留空不限制"
          /><select
            :value="quotaUnit"
            aria-label="额度单位"
            @change="changeUnit"
          >
            <option value="k">K Token</option>
            <option value="m">M Token</option>
          </select>
        </div>
        <small v-if="quotaTokens != null"
          >{{ quotaTokens.toLocaleString() }} Token</small
        ></label
      >
      <div class="form-two">
        <label class="form-field"
          >推理等级<select v-model="reasoning">
            <option value="">跟随请求</option>
            <option
              v-for="value in [
                'none',
                'minimal',
                'low',
                'medium',
                'high',
                'xhigh',
              ]"
              :key="value"
              :value="value"
            >
              {{ value }}
            </option>
          </select></label
        ><label class="form-field"
          >服务等级<select v-model="tier">
            <option value="">跟随请求</option>
            <option value="fast">Fast</option>
            <option v-if="tier && tier !== 'fast'" :value="tier">
              {{ tier }}
            </option>
          </select></label
        >
      </div>
      <button
        type="button"
        class="text-button"
        :aria-expanded="advanced"
        @click="advanced = !advanced"
      >
        {{ advanced ? "收起高级设置" : "高级设置" }}
      </button>
      <div v-if="advanced" class="form-stack">
        <label v-if="!apiKey" class="form-field"
          >自定义 API Key<input
            v-model="customKey"
            type="password"
            autocomplete="off"
            placeholder="留空自动生成" /></label
        ><label class="form-field"
          >上游地址<input
            v-model="upstream"
            type="url"
            placeholder="留空使用默认上游" /></label
        ><label class="form-field"
          >自定义请求头 JSON<textarea
            v-model="headers"
            spellcheck="false"
            placeholder='{"header-name":"value"}'
          />
        </label>
      </div>
      <DialogActions
        ><button
          class="secondary"
          type="button"
          :disabled="busy"
          @click="emit('close')"
        >
          取消</button
        ><button class="primary" :disabled="busy">
          {{ busy ? "保存中…" : "保存密钥" }}
        </button></DialogActions
      >
    </form>
  </BoostDialog>
</template>
