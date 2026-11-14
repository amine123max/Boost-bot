<script setup lang="ts">
import ModelTags from "./ModelTags.vue";
import HelpHint from "@/components/HelpHint.vue";
import { ref } from "vue";
import type { Account } from "@/types";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import AccountNodeControl from "./AccountNodeControl.vue";
import { accountClient } from "@/lib/api/account-client";
import { refreshAccounts, notify } from "@/composables/useBoost";
import { getAppErrorMessage } from "@/lib/api/transport";
import { parseAccountCapacity } from "@/lib/account-workflows";
const props = defineProps<{ account: Account }>();
const emit = defineEmits<{ close: [] }>();
const busy = ref(false),
  advanced = ref(false);
const label = ref(props.account.name),
  note = ref(props.account.note || "");
const tags = ref(props.account.tags.join(", "));
const sort = ref(props.account.sort);
const models = ref(props.account.modelSlugs.join("\n"));
const primary = ref(props.account.quotaCapacityPrimaryWindowTokens);
const secondary = ref(props.account.quotaCapacitySecondaryWindowTokens);
const weekly = ref(props.account.weeklyQuotaLimitTokens);
async function save() {
  busy.value = true;
  try {
    if (!label.value.trim()) throw new Error("请输入账号名称");
    if (!Number.isSafeInteger(sort.value) || sort.value < 0)
      throw new Error("编号必须为非负整数");
    const [primaryTokens, secondaryTokens, weeklyTokens] = [
      primary.value,
      secondary.value,
      weekly.value,
    ].map(parseAccountCapacity);
    await accountClient.updateProfile(props.account.id, {
      label: label.value.trim(),
      note: note.value,
      sort: sort.value,
      tags: tags.value
        .split(/[,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      modelSlugs: models.value
        .split(/[\n,，]/)
        .map((s) => s.trim())
        .filter(Boolean),
      quotaCapacityPrimaryWindowTokens: primaryTokens ?? 0,
      quotaCapacitySecondaryWindowTokens: secondaryTokens ?? 0,
      weeklyQuotaLimitTokens: weeklyTokens ?? 0,
    });
    await refreshAccounts();
    notify("账号信息已更新");
    emit("close");
  } catch (e) {
    notify(`更新账号信息失败: ${getAppErrorMessage(e)}`, true);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BoostDialog title="编辑账号" :busy="busy" @close="!busy && emit('close')">
    <form class="form-stack" @submit.prevent="save">
      <div class="account-editor-grid">
        <label class="form-field"
          >账号名称<input v-model="label" required
        /></label>
        <label class="form-field"
          >编号 / 排序<input
            v-model.number="sort"
            type="number"
            min="0"
            step="1"
            required
        /></label>
      </div>
      <label class="form-field"
        >标签<input v-model="tags" placeholder="多个标签以逗号分隔"
      /></label>
      <label class="form-field">备注<textarea v-model="note" rows="2" /></label>
      <div class="form-field"><span>账号代理节点<HelpHint label="账号代理节点" text="选择后即时生效；固定节点失效时阻断请求。" /></span><AccountNodeControl :account-id="account.id" /></div>
      <button
        type="button"
        class="text-button"
        :aria-expanded="advanced"
        @click="advanced = !advanced"
      >
        {{ advanced ? "收起高级设置" : "高级设置" }}
      </button>
      <div v-if="advanced" class="form-stack">
        <label class="form-field"
          >模型白名单<textarea
            v-model="models"
            rows="3"
            placeholder="每行一个模型，留空允许全部"
          />
          <ModelTags :value="models" />
        </label>
        <div class="account-editor-grid">
          <label class="form-field"
            >5h 容量（Token）<input
              v-model.number="primary"
              type="number"
              min="0"
              step="1"
          /></label>
          <label class="form-field"
            >7d 容量（Token）<input
              v-model.number="secondary"
              type="number"
              min="0"
              step="1"
          /></label>
        </div>
        <label class="form-field"
          >每周 Token 限额<input
            v-model.number="weekly"
            type="number"
            min="0"
            step="1"
            placeholder="0 表示不限制"
        /></label>
      </div>
      <DialogActions
        ><button data-dialog-close
          type="button"
          class="secondary"
          :disabled="busy"
          @click="emit('close')"
        >
          取消</button
        ><button class="primary" :disabled="busy">
          保存修改
        </button></DialogActions
      >
    </form>
  </BoostDialog>
</template>
