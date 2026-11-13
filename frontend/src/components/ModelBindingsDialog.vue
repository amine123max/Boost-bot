<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type {
  ManagedModelInfo,
  ManagedModelRouting,
  ManagedModelSourceMapping,
} from "@/types";
import { boost, notify, perform, isAdmin } from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import BoostIcon from "./BoostIcon.vue";
import { usePendingActions } from "@/composables/usePendingActions";
const actions = usePendingActions();
const { isPending } = actions;
const props = defineProps<{
  model: ManagedModelInfo;
  routing: ManagedModelRouting;
  readOnly?: boolean;
}>();
const emit = defineEmits<{ close: []; changed: [] }>();
const kind = ref("aggregate_api"),
  sourceId = ref(""),
  upstream = ref(""),
  priority = ref(0),
  weight = ref(1),
  billing = ref("");
const pendingDelete = ref("");
const draft = ref<ManagedModelSourceMapping[]>([]);
watch(
  () => props.routing,
  (route) => {
    draft.value = route.mappings
      .filter((m) => m.platformModelSlug === props.model.slug)
      .map((m) => ({ ...m }));
  },
  { immediate: true, deep: true },
);
const writable = computed(() => isAdmin.value && !props.readOnly);
const connections = computed(() =>
  kind.value === "openai_account"
    ? boost.accounts
        .filter((a) => a.hasToken && a.status === "active")
        .map((a) => ({ id: a.id, name: a.name }))
    : boost.connections
        .filter((a) => a.status === "active")
        .map((a) => ({ id: a.id, name: a.supplierName || a.url })),
);
const available = computed(() =>
  props.routing.sourceModels.filter(
    (m) =>
      m.sourceKind === kind.value &&
      m.sourceId === sourceId.value &&
      m.status === "available",
  ),
);
watch(
  connections,
  (rows) => {
    sourceId.value = rows[0]?.id || "";
  },
  { immediate: true },
);
watch(sourceId, () => {
  upstream.value = "";
});
function sourceName(row: ManagedModelSourceMapping) {
  return row.sourceKind === "openai_account"
    ? boost.accounts.find((a) => a.id === row.sourceId)?.name || row.sourceId
    : boost.connections.find((a) => a.id === row.sourceId)?.supplierName ||
        row.sourceId;
}
async function run(
  key: string,
  action: () => Promise<unknown>,
  message: string,
) {
  await actions.run(key, () =>
    perform(async () => {
      await action();
      emit("changed");
      notify(message);
    }),
  );
}
async function save(row: ManagedModelSourceMapping) {
  await run(
    `save:${row.id}`,
    () => {
      if (
        !Number.isSafeInteger(Number(row.priority)) ||
        !Number.isSafeInteger(Number(row.weight)) ||
        Number(row.weight) < 1
      )
        throw new Error("优先级必须为整数，权重必须为正整数");
      return accountClient.saveManagedModelSourceMapping({
        ...row,
        priority: Number(row.priority),
        weight: Number(row.weight),
        billingModelSlug: row.billingModelSlug?.trim() || null,
      });
    },
    "调用绑定已保存",
  );
}
async function remove(id: string) {
  await run(
    `delete:${id}`,
    async () => {
      await accountClient.deleteManagedModelSourceMapping(id);
      if (pendingDelete.value === id) pendingDelete.value = "";
    },
    "调用绑定已删除",
  );
}
async function add() {
  const source = { sourceKind: kind.value, sourceId: sourceId.value };
  const mapping = {
    ...source,
    platformModelSlug: props.model.slug,
    upstreamModel: upstream.value.trim(),
    enabled: true,
    priority: Number(priority.value),
    weight: Number(weight.value),
    billingModelSlug: billing.value.trim() || null,
  };
  await run(
    "add",
    async () => {
      const model = mapping.upstreamModel;
      if (!source.sourceId || !model)
        throw new Error("请选择来源并填写上游模型");
      if (!available.value.some((m) => m.upstreamModel === model))
        await accountClient.saveManagedModelSourceModel({
          ...source,
          upstreamModel: model,
        });
      await accountClient.saveManagedModelSourceMapping(mapping);
      if (upstream.value.trim() === model) upstream.value = "";
    },
    "模型已关联",
  );
}
</script>
<template>
  <BoostDialog title="调用绑定" wide @close="emit('close')">
    <div class="binding-model-heading">
      <h3>{{ model.displayName || model.slug }}</h3>
      <code>{{ model.slug }}</code
      ><span class="badge"
        >{{ draft.filter((m) => m.enabled).length }} 条启用</span
      >
    </div>
    <div class="binding-list">
      <article v-for="row in draft" :key="row.id" class="binding-editor">
        <div class="row between">
          <div>
            <span class="badge">{{
              row.sourceKind === "openai_account" ? "账号池" : "聚合 API"
            }}</span
            ><span class="binding-source-name">{{ sourceName(row) }}</span>
          </div>
          <span class="badge" :class="{ success: row.enabled }">{{
            row.enabled ? "已启用" : "已停用"
          }}</span>
        </div>
        <code>{{ row.upstreamModel }}</code>
        <div v-if="writable" class="binding-fields">
          <label class="form-field"
            >优先级<input
              v-model.number="row.priority"
              type="number"
              step="1"
              required /></label
          ><label class="form-field"
            >权重<input
              v-model.number="row.weight"
              type="number"
              min="1"
              step="1"
              required /></label
          ><label class="form-field"
            >计费模型<input
              v-model="row.billingModelSlug"
              placeholder="使用平台模型"
          /></label>
        </div>
        <div v-if="writable" class="row between">
          <label class="checkbox-field"
            ><input v-model="row.enabled" type="checkbox" />启用绑定</label
          >
          <div class="toolbar-group">
            <button
              class="text-button"
              :disabled="isPending(`save:${row.id}`)"
              @click="save(row)"
            >
              保存绑定</button
            ><button
              class="icon-button"
              :aria-label="'删除绑定 ' + row.id"
              :disabled="isPending(`delete:${row.id}`)"
              @click="pendingDelete = row.id"
            >
              <BoostIcon name="trash-2" :size="16" />
            </button>
          </div>
        </div>
        <div v-if="pendingDelete === row.id" class="inline-confirm">
          <span>确认删除此调用绑定？</span
          ><button class="text-button" @click="pendingDelete = ''">取消</button
          ><button
            class="danger-button"
            :disabled="isPending(`delete:${row.id}`)"
            @click="remove(row.id)"
          >
            确认删除
          </button>
        </div>
      </article>
      <p v-if="!draft.length" class="muted">暂无调用绑定</p>
    </div>
    <form
      v-if="writable"
      class="form-stack binding-add-form"
      @submit.prevent="add"
    >
      <h3 class="dialog-section-title">关联来源模型</h3>
      <div class="form-two">
        <label class="form-field"
          >来源类型<select v-model="kind">
            <option value="aggregate_api">聚合 API</option>
            <option value="openai_account">OpenAI 账号池</option>
          </select></label
        ><label class="form-field"
          >来源连接<select v-model="sourceId" required>
            <option v-if="!connections.length" value="">暂无可用连接</option>
            <option
              v-for="source in connections"
              :key="source.id"
              :value="source.id"
            >
              {{ source.name }}
            </option>
          </select></label
        >
      </div>
      <label class="form-field"
        >上游模型<input
          v-model="upstream"
          :list="'source-models-' + model.slug"
          required
          placeholder="选择已发现模型，或输入模型 ID" /><datalist
          :id="'source-models-' + model.slug"
        >
          <option
            v-for="m in available"
            :key="m.upstreamModel"
            :value="m.upstreamModel"
          /></datalist
      ></label>
      <div class="binding-fields">
        <label class="form-field"
          >绑定优先级<input
            v-model.number="priority"
            type="number"
            step="1"
            required /></label
        ><label class="form-field"
          >绑定权重<input
            v-model.number="weight"
            type="number"
            min="1"
            step="1"
            required /></label
        ><label class="form-field"
          >绑定计费模型<input v-model="billing" placeholder="使用平台模型"
        /></label>
      </div>
      <div class="form-actions">
        <button
          class="primary"
          :disabled="isPending('add') || !sourceId || !upstream.trim()"
        >
          <BoostIcon name="plug" :size="16" />保存并关联
        </button>
      </div>
    </form>
    <DialogActions
      ><button class="secondary" @click="emit('close')">
        关闭
      </button></DialogActions
    >
  </BoostDialog>
</template>
