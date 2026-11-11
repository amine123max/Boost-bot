<script setup lang="ts">
import { computed } from "vue";
import type { Account } from "@/types";
import { formatTime } from "@/composables/useBoost";
import AccountTags from "./AccountTags.vue";
import AccountNodeControl from "./AccountNodeControl.vue";
import AccountQuotaDetails from "./AccountQuotaDetails.vue";
import AccountResetCredits from "./AccountResetCredits.vue";
import BoostIcon from "./BoostIcon.vue";
import BoostMenu, { type MenuItem } from "./BoostMenu.vue";

const props = defineProps<{
  accounts: Account[];
  selected: string[];
  busy: boolean;
  working: string;
  menuItems: (account: Account) => MenuItem[];
}>();
const emit = defineEmits<{
  select: [accountId: string];
  selectAll: [];
  action: [account: Account, value: string];
}>();
const allSelected = computed(
  () =>
    props.accounts.length > 0 &&
    props.accounts.every((a) => props.selected.includes(a.id)),
);
const partlySelected = computed(
  () =>
    !allSelected.value &&
    props.accounts.some((a) => props.selected.includes(a.id)),
);
</script>
<template>
  <div class="bounded-table account-table-wrap">
    <table
      v-resizable-columns="[4, 25, 45, 12, 14]"
      class="models-table accounts-table"
      aria-label="账号、额度与账号池操作"
    >
      <thead>
        <tr>
          <th class="account-check-cell">
            <input
              type="checkbox"
              :checked="allSelected"
              :indeterminate="partlySelected"
              :disabled="busy"
              aria-label="全选当前结果"
              @change="emit('selectAll')"
            />
          </th>
          <th>账号 / 订阅</th>
          <th>额度 / 使用量</th>
          <th class="account-status-heading">状态</th>
          <th class="account-actions-heading">操作</th>
        </tr>
      </thead>
      <tbody>
        <tr
          v-for="account in accounts"
          :key="account.id"
          :class="{ checked: selected.includes(account.id) }"
        >
          <td class="account-check-cell">
            <div class="account-table-selection">
              <input
                type="checkbox"
                :checked="selected.includes(account.id)"
                :disabled="busy"
                :aria-label="`选择 ${account.name}`"
                @change="emit('select', account.id)"
              /><span :title="'账号编号 / 排序'">#{{ account.sort }}</span>
            </div>
          </td>
          <td>
            <div class="account-table-identity">
              <h3 :title="account.name">{{ account.name }}</h3>
              <AccountTags :account="account" :show-status="false" />
              <AccountNodeControl :account-id="account.id" />
              <p class="account-table-id" :title="account.id">
                {{ account.id }}
              </p>
              <div class="account-table-dates">
                <p :title="formatTime(account.lastRefreshAt)">
                  最近刷新：<time>{{ formatTime(account.lastRefreshAt) }}</time>
                </p>
                <p
                  :title="
                    formatTime(
                      account.subscriptionExpiresAt ||
                        account.subscriptionRenewsAt,
                    )
                  "
                >
                  {{
                    account.subscriptionRenewsAt &&
                    !account.subscriptionExpiresAt
                      ? "下次续订"
                      : "订阅到期"
                  }}：<time>{{
                    formatTime(
                      account.subscriptionExpiresAt ||
                        account.subscriptionRenewsAt,
                    )
                  }}</time>
                </p>
              </div>
              <p
                v-if="account.note"
                class="account-table-note"
                :title="account.note"
              >
                {{ account.note }}
              </p>
            </div>
          </td>
          <td>
            <div class="account-table-quota">
              <AccountQuotaDetails :account="account" />
              <div class="account-quota-actions">
                <button
                  class="text-button blue-text"
                  :disabled="busy || account.status === 'disabled'"
                  @click="emit('action', account, 'refresh')"
                >
                  <BoostIcon
                    name="rotate-ccw"
                    :size="13"
                    :class="{ spinning: working === `${account.id}:refresh` }"
                  />{{
                    working === `${account.id}:refresh` ? "刷新中" : "刷新"
                  }}
                </button>
                <AccountResetCredits
                  :account="account"
                  :busy="busy"
                  :working="working === `${account.id}:credits`"
                  @refresh="emit('action', account, 'credits')"
                />
                <button
                  class="text-button account-reset-button"
                  :disabled="busy || account.quotaResetAvailableCount === 0"
                  @click="emit('action', account, 'reset')"
                >
                  <BoostIcon name="rotate-ccw" :size="13" />重置
                </button>
              </div>
            </div>
          </td>
          <td class="account-table-status-cell">
            <span
              class="account-table-status"
              :class="account.availabilityLevel"
              :title="account.statusReason || account.availabilityText"
              ><span class="account-status-dot" aria-hidden="true" />{{
                account.availabilityText
              }}</span
            >
          </td>
          <td>
            <div class="account-table-actions">
              <button
                class="icon-button"
                :disabled="busy"
                :aria-label="`向前移动 ${account.name}`"
                @click="emit('action', account, 'up')"
              >
                <BoostIcon name="arrow-up" :size="15" />
              </button>
              <button
                class="icon-button"
                :disabled="busy"
                :aria-label="`向后移动 ${account.name}`"
                @click="emit('action', account, 'down')"
              >
                <BoostIcon name="arrow-down" :size="15" />
              </button>
              <button
                class="icon-button"
                :disabled="busy"
                :aria-label="`编辑 ${account.name}`"
                @click="emit('action', account, 'edit')"
              >
                <BoostIcon name="pencil" :size="15" />
              </button>
              <BoostMenu
                :label="`${account.name} 的操作`"
                icon="ellipsis"
                icon-only
                :items="menuItems(account)"
                :disabled="busy"
                @select="emit('action', account, $event)"
              />
            </div>
          </td>
        </tr>
      </tbody>
    </table>
  </div>
</template>
