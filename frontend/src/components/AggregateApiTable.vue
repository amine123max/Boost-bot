<script setup lang="ts">
import ModelLabel from "./ModelLabel.vue";
import { computed } from "vue";
import type { AggregateApi } from "@/types";
import type { QuotaModelPoolItem } from "@/types/quota";
import { formatNumber, formatTime } from "@/composables/useBoost";
import {
  aggregateQuotaInfo,
  protocolLabel,
  readAggregateBalance,
} from "@/lib/management-records";
import BoostIcon from "./BoostIcon.vue";
import BoostMenu from "./BoostMenu.vue";
import RecordSwitch from "./RecordSwitch.vue";
import AggregateCredentialCell from "./AggregateCredentialCell.vue";
const props = defineProps<{
  apis: AggregateApi[];
  isPending: (key: string) => boolean;
  latency: Record<string, number>;
  pools: QuotaModelPoolItem[];
  importedCounts: Record<string, number>;
}>();
const emit = defineEmits<{ action: [api: AggregateApi, value: string] }>();
const records = computed(() => {
  const quotas = aggregateQuotaInfo(props.pools);
  return props.apis.map((api) => ({
    api,
    balance: readAggregateBalance(api),
    quota: quotas[api.id],
    models: api.modelSlugs.length
      ? api.modelSlugs
      : quotas[api.id]?.models || [],
  }));
});
</script>
<template>
  <div class="bounded-table management-table-wrap">
    <table
      class="models-table management-table aggregate-api-table"
      aria-label="聚合 API 连接与额度"
    >
      <colgroup>
        <col class="aggregate-supplier-column" />
        <col class="aggregate-provider-column" />
        <col class="aggregate-key-column" />
        <col class="aggregate-order-column" />
        <col class="aggregate-test-column" />
        <col class="aggregate-balance-column" />
        <col class="record-status-column" />
        <col class="record-action-column" />
      </colgroup>
      <thead>
        <tr>
          <th>供应商 / URL</th>
          <th>类型</th>
          <th>密钥</th>
          <th class="record-center-cell">顺序</th>
          <th>测试连通性</th>
          <th>余额</th>
          <th>状态</th>
          <th class="record-actions-heading">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr v-for="row in records" :key="row.api.id">
          <td data-label="供应商 / URL / 模型">
            <h3
              class="record-name"
              :title="row.api.supplierName || row.api.url"
            >
              {{ row.api.supplierName || "未命名聚合 API" }}
            </h3>
            <p class="record-subtext record-url" :title="row.api.url">
              {{ row.api.url }}
            </p>
            <p
              v-if="row.api.modelOverride"
              class="record-subtext"
              :title="row.api.modelOverride"
            >
              <ModelLabel :model="row.api.modelOverride" />
            </p>
            <p
              class="record-subtext record-all-models"
              :title="row.models.join(', ')"
            >
              <span v-if="!row.models.length">全部 API 模型</span>
              <span v-else class="record-model-labels"><ModelLabel v-for="model in row.models" :key="model" :model="model" /></span>
            </p>
            <p v-if="importedCounts[row.api.id] != null" class="record-subtext">
              {{ importedCounts[row.api.id] }} 个模型已导入
            </p>
          </td>
          <td data-label="类型">
            <span
              class="badge record-protocol"
              :title="protocolLabel(row.api.providerType)"
              >{{ protocolLabel(row.api.providerType) }}</span
            >
          </td>
          <td data-label="密钥">
            <AggregateCredentialCell :api="row.api" :disabled="false" />
          </td>
          <td data-label="顺序" class="record-center-cell record-sort">
            {{ row.api.sort }}
          </td>
          <td data-label="测试连通性">
            <div class="record-inline">
              <span
                class="badge"
                :class="
                  row.api.lastTestStatus === 'success'
                    ? 'success'
                    : row.api.lastTestStatus === 'failed'
                      ? 'error'
                      : ''
                "
                >{{
                  row.api.lastTestStatus === "success"
                    ? "已连通"
                    : row.api.lastTestStatus === "failed"
                      ? "失败"
                      : "未测试"
                }}</span
              ><button
                class="secondary record-small-button"
                :disabled="isPending(`${row.api.id}:test`)"
                @click="emit('action', row.api, 'test')"
              >
                <BoostIcon
                  name="rotate-ccw"
                  :size="13"
                  :class="{ spinning: isPending(`${row.api.id}:test`) }"
                />测试</button
              ><span v-if="latency[row.api.id] != null" class="record-subtext"
                >{{ latency[row.api.id] }} ms</span
              >
            </div>
            <p
              v-if="row.api.lastTestAt"
              class="record-subtext"
              :title="formatTime(row.api.lastTestAt)"
            >
              {{ formatTime(row.api.lastTestAt) }}
            </p>
            <p
              v-if="
                row.api.lastTestStatus === 'failed' && row.api.lastTestError
              "
              class="record-subtext record-error"
              :title="row.api.lastTestError"
            >
              {{ row.api.lastTestError }}
            </p>
          </td>
          <td data-label="余额 / 额度">
            <div class="record-inline">
              <span
                class="badge"
                :class="row.balance.tone"
                :title="row.balance.details"
                >{{ row.balance.label }}</span
              ><button
                class="icon-button"
                :disabled="
                  isPending(`${row.api.id}:balance`) ||
                  !row.api.balanceQueryEnabled
                "
                :aria-label="`刷新 ${row.api.supplierName || row.api.id} 余额`"
                @click="emit('action', row.api, 'balance')"
              >
                <BoostIcon
                  name="rotate-ccw"
                  :size="14"
                  :class="{ spinning: isPending(`${row.api.id}:balance`) }"
                />
              </button>
            </div>
            <p
              v-if="row.api.lastBalanceAt"
              class="record-subtext"
              :title="formatTime(row.api.lastBalanceAt)"
            >
              {{ formatTime(row.api.lastBalanceAt) }}
            </p>
            <p
              v-if="row.quota?.tokens != null"
              class="record-subtext"
              :title="row.quota.model || ''"
            >
              折算 {{ formatNumber(row.quota.tokens) }} Token{{
                row.quota.model ? ` · ${row.quota.model}` : ""
              }}
            </p>
            <p
              v-if="row.balance.error"
              class="record-subtext record-error"
              :title="row.balance.error"
            >
              {{ row.balance.error }}
            </p>
          </td>
          <td data-label="状态">
            <RecordSwitch
              :label="`${row.api.supplierName || row.api.id} 状态`"
              :enabled="row.api.status !== 'disabled'"
              :disabled="isPending(`${row.api.id}:toggle`)"
              @toggle="emit('action', row.api, 'toggle')"
            />
          </td>
          <td data-label="操作">
            <div class="record-actions">
              <button
                class="icon-button"
                :aria-label="`导入 ${row.api.supplierName || row.api.url} 模型`"
                title="模型池 / 导入模型"
                @click="emit('action', row.api, 'models')"
              >
                <BoostIcon name="database" :size="16" /></button
              ><button
                class="icon-button"
                :aria-label="`编辑 ${row.api.supplierName || row.api.url}`"
                @click="emit('action', row.api, 'edit')"
              >
                <BoostIcon name="settings" :size="16" /></button
              ><BoostMenu
                :label="`${row.api.supplierName || row.api.id} 的操作`"
                icon="ellipsis"
                icon-only
                :items="[
                  { value: 'edit', label: '编辑聚合 API', icon: 'settings' },
                  {
                    value: 'models',
                    label: '模型池 / 导入模型',
                    icon: 'database',
                  },
                  { value: 'prefer', label: '设为优先', icon: 'arrow-up' },
                  { value: 'secret', label: '查看连接凭据', icon: 'key-round' },
                  {
                    value: 'delete',
                    label: '删除聚合 API',
                    icon: 'trash-2',
                    danger: true,
                  },
                ]"
                @select="emit('action', row.api, $event)"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
