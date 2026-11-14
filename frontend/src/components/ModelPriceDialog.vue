<script setup lang="ts">
import { reactive, ref } from "vue";
import type { ModelPriceRule } from "@/types";
import { quotaClient } from "@/lib/api/quota-client";
import { notify, perform } from "@/composables/useBoost";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import ModelSelect from "./ModelSelect.vue";
const props = defineProps<{ rule?: ModelPriceRule | null }>();
const emit = defineEmits<{ close: []; saved: [] }>();
const busy = ref(false);
const draft = reactive({
  provider: props.rule?.provider || "custom",
  modelPattern: props.rule?.modelPattern || "",
  matchType: props.rule?.source === "custom" ? props.rule.matchType : "exact",
  input: props.rule?.inputPricePer1m ?? null,
  cached: props.rule?.cachedInputPricePer1m ?? null,
  output: props.rule?.outputPricePer1m ?? null,
  reasoning: props.rule?.reasoningOutputPricePer1m ?? null,
  enabled: props.rule?.enabled ?? true,
  priority: props.rule?.source === "custom" ? props.rule.priority : 20000,
});
async function save() {
  busy.value = true;
  await perform(async () => {
    for (const [name, value] of Object.entries({
      输入: draft.input,
      输出: draft.output,
    })) {
      if (
        value == null ||
        value === ("" as unknown) ||
        !Number.isFinite(Number(value)) ||
        Number(value) < 0
      )
        throw new Error(`${name}价格必须为非负数字`);
    }
    const optional = (value: unknown) =>
      value == null || value === "" ? null : Number(value);
    await quotaClient.upsertModelPriceRule({
      id: props.rule?.source === "custom" ? props.rule.id : null,
      provider: draft.provider.trim(),
      modelPattern: draft.modelPattern.trim(),
      matchType: draft.matchType,
      inputPricePer1m: Number(draft.input),
      cachedInputPricePer1m: optional(draft.cached),
      outputPricePer1m: Number(draft.output),
      reasoningOutputPricePer1m: optional(draft.reasoning),
      enabled: draft.enabled,
      priority: Number(draft.priority),
    });
    notify("自定义价格已保存");
    emit("saved");
    emit("close");
  });
  busy.value = false;
}
</script>
<template>
  <BoostDialog
    :title="rule?.source === 'custom' ? '编辑价格' : '新增价格'"
    :busy="busy" @close="!busy && emit('close')"
    ><form class="form-stack" @submit.prevent="save">
      <label class="form-field"
        >模型匹配<ModelSelect label="模型匹配"
          v-model="draft.modelPattern"
          required
          placeholder="模型 ID 或匹配规则"
      /></label>
      <div class="form-two">
        <label class="form-field"
          >提供商<input v-model="draft.provider" required /></label
        ><label class="form-field"
          >匹配方式<select v-model="draft.matchType">
            <option value="exact">精确匹配</option>
            <option value="prefix">前缀匹配</option>
            <option value="wildcard">通配符 *</option>
          </select></label
        >
      </div>
      <div class="form-two">
        <label class="form-field"
          >输入（$/百万 tokens）<input
            v-model="draft.input"
            type="number"
            min="0"
            step="any"
            required /></label
        ><label class="form-field"
          >输出（$/百万 tokens）<input
            v-model="draft.output"
            type="number"
            min="0"
            step="any"
            required /></label
        ><label class="form-field"
          >缓存输入（$/百万 tokens）<input
            v-model="draft.cached"
            type="number"
            min="0"
            step="any" /></label
        ><label class="form-field"
          >推理输出（$/百万 tokens）<input
            v-model="draft.reasoning"
            type="number"
            min="0"
            step="any"
        /></label>
      </div>
      <div class="form-two">
        <label class="form-field"
          >优先级<input
            v-model="draft.priority"
            type="number"
            step="1"
            required /></label
        ><label class="checkbox-field"
          ><input v-model="draft.enabled" type="checkbox" />启用价格规则</label
        >
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
          保存价格
        </button></DialogActions
      >
    </form></BoostDialog
  >
</template>
