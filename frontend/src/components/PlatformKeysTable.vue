<script setup lang="ts">
import { computed } from "vue";
import type { ApiKey, ApiKeyUsageStat } from "@/types";
import { accountClient } from "@/lib/api/account-client";
import {
  keyQuotaState,
  protocolLabel,
  rotationLabel,
  summarizeKeyUsage,
} from "@/lib/management-records";
import { formatNumber } from "@/composables/useBoost";
import { formatQuotaLimitUsd } from "@/lib/utils/api-key-quota";
import BoostMenu from "./BoostMenu.vue";
import BoostIcon from "./BoostIcon.vue";
import RecordCredential from "./RecordCredential.vue";
import RecordSwitch from "./RecordSwitch.vue";
const props = defineProps<{
  keys: ApiKey[];
  usage: ApiKeyUsageStat[] | null;
  busy: boolean;
  showOwners?: boolean;
  owners?: Record<string, string>;
  distributionEnabled?: boolean;
}>();
const emit = defineEmits<{
  edit: [key: ApiKey];
  toggle: [key: ApiKey];
  remove: [key: ApiKey];
  guide: [key: ApiKey];
}>();
const records = computed(() => {
  const usage =
    props.usage == null ? null : summarizeKeyUsage(props.usage).byKey;
  return props.keys.map((key) => {
    const stat = usage
      ? usage[key.id] || { totalTokens: 0, estimatedCostUsd: 0 }
      : null;
    return {
      key,
      cost: stat?.estimatedCostUsd ?? null,
      quota: keyQuotaState(stat?.totalTokens ?? null, key.quotaLimitTokens),
    };
  });
});
function menu(key: ApiKey, action: string) {
  if (action === "delete") emit("remove", key);
  else if (action === "guide") emit("guide", key);
  else emit("edit", key);
}
</script>
<template>
  <div class="bounded-table management-table-wrap">
    <table
      :class="[
        'models-table',
        'management-table',
        'platform-keys-table',
        { 'member-ownership': showOwners },
      ]"
      aria-label="平台密钥及额度用量"
    >
      <colgroup>
        <col class="key-id-column" />
        <col class="key-name-column" />
        <col v-if="showOwners" class="key-owner-column" />
        <col class="key-protocol-column" />
        <col class="key-rotation-column" />
        <col class="key-model-column" />
        <col class="key-usage-column" />
        <col class="record-status-column" />
        <col class="record-action-column" />
      </colgroup>
      <thead>
        <tr>
          <th>密钥 / ID</th>
          <th>名称</th>
          <th v-if="showOwners">归属成员</th>
          <th>协议</th>
          <th>轮转策略</th>
          <th>绑定模型</th>
          <th>Token / 金额</th>
          <th>状态</th>
          <th class="record-actions-heading">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in records" :key="row.key.id">
          <td data-label="密钥 / ID">
            <RecordCredential
              :label="row.key.name || row.key.id"
              :placeholder="row.key.id"
              :read="() => accountClient.readApiKeySecret(row.key.id)"
              :disabled="busy"
            />
          </td>
          <td data-label="名称">
            <h3 class="record-name" :title="row.key.name">
              {{ row.key.name || "未命名" }}
            </h3>
          </td>
          <td v-if="showOwners" data-label="归属成员">
            <span
              class="badge"
              :class="
                owners?.[row.key.id]
                  ? 'success'
                  : distributionEnabled
                    ? 'error'
                    : ''
              "
              >{{ owners?.[row.key.id] || "未分配" }}</span
            >
          </td>
          <td data-label="协议">
            <span
              class="badge record-protocol"
              :title="protocolLabel(row.key.protocol)"
              >{{ protocolLabel(row.key.protocol) }}</span
            >
          </td>
          <td data-label="轮转策略">
            <span
              class="badge"
              :title="rotationLabel(row.key.rotationStrategy)"
              >{{ rotationLabel(row.key.rotationStrategy) }}</span
            >
            <p
              v-if="row.key.aggregateApiUrl"
              class="record-subtext"
              :title="row.key.aggregateApiUrl"
            >
              {{ row.key.aggregateApiUrl }}
            </p>
            <p v-if="row.key.accountPlanFilter" class="record-subtext">
              {{ row.key.accountPlanFilter.toUpperCase() }}
            </p>
          </td>
          <td data-label="绑定模型">
            <span
              class="record-model"
              :title="row.key.modelSlug || row.key.model"
              >{{ row.key.modelSlug || row.key.model || "跟随请求" }}</span
            >
            <p
              v-if="row.key.reasoningEffort || row.key.serviceTier"
              class="record-subtext"
            >
              {{
                [row.key.reasoningEffort, row.key.serviceTier]
                  .filter(Boolean)
                  .join(" · ")
              }}
            </p>
          </td>
          <td data-label="Token / 金额">
            <div
              class="record-usage"
              :class="{ exhausted: row.quota.exhausted }"
            >
              <span>{{ formatNumber(row.quota.used) }}</span
              ><span v-if="row.quota.limit != null" class="muted">
                / {{ formatNumber(row.quota.limit) }}</span
              >
            </div>
            <div
              v-if="row.quota.percent != null"
              class="record-quota-track"
              role="progressbar"
              :aria-label="`${row.key.name || row.key.id} 额度用量`"
              :aria-valuenow="Math.round(row.quota.percent)"
              :aria-valuemin="0"
              :aria-valuemax="100"
              :class="{ exhausted: row.quota.exhausted }"
            >
              <span :style="{ width: `${row.quota.percent}%` }" />
            </div>
            <p class="record-subtext">
              <span>{{
                row.cost == null
                  ? "费用 —"
                  : `已花费 ${formatQuotaLimitUsd(row.cost)}`
              }}</span
              ><span>
                ·
                {{
                  row.quota.limit == null
                    ? "不限额"
                    : row.quota.exhausted
                      ? "已达上限"
                      : row.quota.remaining == null
                        ? "剩余 —"
                        : `剩余 ${formatNumber(row.quota.remaining)}`
                }}</span
              >
            </p>
          </td>
          <td data-label="状态">
            <RecordSwitch
              :label="`${row.key.name || row.key.id} 状态`"
              :enabled="row.key.status !== 'disabled'"
              :disabled="busy"
              @toggle="emit('toggle', row.key)"
            />
          </td>
          <td data-label="操作">
            <div class="record-actions">
              <button
                class="icon-button"
                :disabled="busy"
                :aria-label="`编辑 ${row.key.name || row.key.id}`"
                @click="emit('edit', row.key)"
              >
                <BoostIcon name="settings" :size="16" /></button
              ><BoostMenu
                :label="`${row.key.name || row.key.id} 的操作`"
                icon="ellipsis"
                icon-only
                :disabled="busy"
                :items="[
                  { value: 'edit', label: '设置模型与推理', icon: 'settings' },
                  { value: 'guide', label: '配置方法', icon: 'file' },
                  {
                    value: 'delete',
                    label: '删除密钥',
                    icon: 'trash-2',
                    danger: true,
                  },
                ]"
                @select="menu(row.key, $event)"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
