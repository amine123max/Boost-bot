<script setup lang="ts">
import { computed, ref, watch } from "vue";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import BoostIcon from "./BoostIcon.vue";
import { boost, notify } from "@/composables/useBoost";
import { accountClient } from "@/lib/api/account-client";
import { getAppErrorMessage } from "@/lib/api/transport";
const emit = defineEmits<{ close: []; imported: [] }>();
const kind = ref("openai_account");
const selected = ref<string[]>([]);
const busy = ref(false);
const failures = ref<{ name: string; message: string }[]>([]);
function family(a: (typeof boost.connections)[number]) {
  if (a.providerType === "claude") return "claude";
  if (a.providerType === "gemini") return "gemini";
  if (/deepseek/i.test(a.url + " " + a.supplierName)) return "deepseek";
  if (/api\.openai\.com/i.test(a.url)) return "gpt";
  return "compatible";
}
const labels: Record<string, string> = {
  gpt: "GPT",
  claude: "Claude",
  gemini: "Gemini",
  deepseek: "DeepSeek",
  compatible: "OpenAI 兼容",
};
const sources = computed(() =>
  kind.value === "openai_account"
    ? boost.accounts
        .filter((a) => a.hasToken && a.status === "active")
        .map((a) => ({ id: a.id, name: a.name, provider: "OpenAI OAuth" }))
    : boost.connections
        .filter(
          (a) =>
            a.status === "active" &&
            (kind.value === "aggregate_api" || family(a) === kind.value),
        )
        .map((a) => ({
          id: a.id,
          name: a.supplierName || a.url,
          provider: labels[family(a)],
        })),
);
watch(
  sources,
  (rows) => {
    selected.value = rows.map((r) => r.id);
    failures.value = [];
  },
  { immediate: true },
);
async function sync() {
  busy.value = true;
  failures.value = [];
  let total = 0,
    success = 0;
  const sourceKind =
    kind.value === "openai_account" ? "openai_account" : "aggregate_api";
  try {
    for (const source of sources.value.filter((s) =>
      selected.value.includes(s.id),
    )) {
      try {
        const routing = await accountClient.syncManagedModelSourceModels({
          sourceKind,
          sourceId: source.id,
        });
        total += routing.sourceModels.filter(
          (m) =>
            m.sourceKind === sourceKind &&
            m.sourceId === source.id &&
            m.status === "available",
        ).length;
        success++;
      } catch (e) {
        failures.value.push({
          name: source.name,
          message: getAppErrorMessage(e),
        });
      }
    }
    if (success) {
      notify(`已从 ${success} 个连接并入 ${total} 个模型`);
      emit("imported");
    }
    if (failures.value.length)
      notify(`${failures.value.length} 个连接并入失败，可重试`, true);
    else emit("close");
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BoostDialog title="并入远端模型" :busy="busy" @close="!busy && emit('close')">
    <form class="form-stack" @submit.prevent="sync">
      <label class="form-field"
        >模型来源<select v-model="kind" aria-label="模型来源" :disabled="busy">
          <option value="openai_account">OpenAI 账号池</option>
          <option value="aggregate_api">全部聚合 API</option>
          <option value="gpt">GPT · OpenAI</option>
          <option value="deepseek">DeepSeek</option>
          <option value="gemini">Gemini · Google</option>
          <option value="claude">Claude · Anthropic</option>
          <option value="compatible">其他 OpenAI 兼容</option>
        </select></label
      >
      <div v-if="sources.length" class="source-selector">
        <label v-for="source in sources" :key="source.id" class="source-option"
          ><input
            v-model="selected"
            type="checkbox"
            :value="source.id"
            :disabled="busy"
          /><span>{{ source.name }}</span
          ><span class="badge">{{ source.provider }}</span></label
        >
      </div>
      <p v-else class="muted">
        请先在{{
          kind === "openai_account" ? "账号管理" : "聚合 API"
        }}中添加可用连接。
      </p>
      <div v-if="failures.length" class="import-failures" role="alert">
        <p v-for="failure in failures" :key="failure.name">
          <strong>{{ failure.name }}</strong
          ><span>{{ failure.message }}</span>
        </p>
      </div>
      <DialogActions
        ><button data-dialog-close
          type="button"
          class="secondary"
          :disabled="busy"
          @click="emit('close')"
        >
          取消</button
        ><button class="primary" :disabled="busy || !selected.length">
          <BoostIcon
            :name="busy ? 'loader-circle' : 'download'"
            :class="{ spinning: busy }"
            :size="16"
          />{{ busy ? "并入中…" : "并入模型" }}
        </button></DialogActions
      >
    </form>
  </BoostDialog>
</template>
