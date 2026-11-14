<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref, watch } from "vue";
import { api } from "../api";
import SelectControl from "./SelectControl.vue";
import ModelSelect from "./ModelSelect.vue";
import HelpTip from "./HelpTip.vue";
interface Source {
  id: string;
  kind: "account_pool" | "aggregate_api";
  label: string;
  models: string[];
  requiresKey: boolean;
}
const props = defineProps<{
  source: string;
  modelValue: string;
  models: string[];
  disabled?: boolean;
}>();
const emit = defineEmits<{
  "update:source": [value: string];
  "update:modelValue": [value: string];
  models: [value: string[]];
  valid: [value: boolean];
}>();
const sources = ref<Source[]>([]),
  loading = ref(true),
  error = ref(""),
  managed = ref(false);
let disposed = false;
const kind = computed(() =>
  props.source.startsWith("aggregate:") ? "aggregate_api" : props.source,
);
const selected = computed(() =>
  sources.value.find((source) => source.id === props.source),
);
const available = computed(() =>
  props.source === "default" ? props.models : selected.value?.models || [],
);
const aggregates = computed(() =>
  sources.value
    .filter((source) => source.kind === "aggregate_api")
    .map((source) => ({ value: source.id, label: source.label })),
);
const valid = computed(
  () =>
    props.source === "default" ||
    (!loading.value &&
      !error.value &&
      !!selected.value &&
      available.value.includes(props.modelValue)),
);
watch(
  [available, valid],
  () => {
    emit("models", available.value);
    emit("valid", valid.value);
  },
  { immediate: true },
);
async function load() {
  loading.value = true;
  error.value = "";
  try {
    const value = await api<{ sources: Source[]; managed: boolean }>(
      "/model-sources",
    );
    if (disposed) return;
    sources.value = value.sources;
    managed.value = value.managed;
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  } finally {
    if (!disposed) loading.value = false;
  }
}
function chooseKind(value: string) {
  const source =
    value === "aggregate_api"
      ? aggregates.value[0]?.value || "aggregate:"
      : value;
  if(source===props.source)return;
  emit("update:source", source);
  if (source !== props.source) emit("update:modelValue", "");
}
function chooseAggregate(value: string) {
  if(value===props.source)return;
  emit("update:source", value);
  if (value !== props.source) emit("update:modelValue", "");
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
});
</script>
<template>
  <div class="source-fields">
    <div class="source-row">
      <span
        >模型来源<HelpTip
          text="默认保留当前网关密钥的路由；号池和聚合API绑定独立来源。来源停用时不自动切换其他来源。"
          label="模型来源说明" /></span
      ><SelectControl
        :model-value="kind"
        :options="[
          { value: 'default', label: '当前默认来源' },
          { value: 'account_pool', label: '号池' },
          { value: 'aggregate_api', label: '聚合 API' },
        ]"
        label="模型来源"
        :disabled="disabled || loading || !managed"
        @update:model-value="chooseKind"
      />
    </div>
    <div v-if="kind === 'aggregate_api'" class="source-row">
      <span
        >聚合 API<HelpTip
          text="使用Boost中已配置且当前账号有权访问的OpenAI兼容来源，凭据仅由后端使用。"
          label="聚合 API说明" /></span
      ><SelectControl
        :model-value="selected ? source : ''"
        :options="aggregates"
        label="聚合 API来源"
        placeholder="请选择聚合 API"
        :disabled="disabled || loading || !aggregates.length"
        @update:model-value="chooseAggregate"
      />
    </div>
    <p v-if="loading" class="source-note" role="status">正在读取模型来源…</p>
    <p v-else-if="error" class="source-error" role="alert">
      {{ error
      }}<button type="button" class="quiet-button" @click="load">重试</button>
    </p>
    <p v-else-if="!managed" class="source-note">
      当前运行环境未连接 Boost 来源服务，继续使用现有模型连接。
    </p>
    <p
      v-else-if="kind === 'aggregate_api' && !aggregates.length"
      class="source-note"
    >
      没有可用聚合 API，请先在 Boost 中配置来源。
    </p>
    <p
      v-else-if="source !== 'default' && !selected"
      class="source-error"
      role="alert"
    >
      所选模型来源不可用，请重新选择。
    </p>
    <p v-else-if="source !== 'default'" class="source-note">
      {{
        kind === "account_pool"
          ? "从号池账号分配请求。"
          : "请求直接路由至所选聚合 API，不使用号池。"
      }}<template v-if="selected?.requiresKey"
        >保存时为此来源创建专用平台密钥。</template
      >
    </p>
    <div class="source-row">
      <span
        >默认模型<HelpTip
          text="模型列表随来源变化；切换来源后需要重新选择模型，避免误用同名模型。"
          label="默认模型说明" /></span
      ><ModelSelect
        :model-value="modelValue"
        :models="available"
        label="默认模型"
        :default-label="
          source === 'default' ? '跟随工作台默认模型' : '请选择此来源模型'
        "
        :allow-default="source === 'default'"
        :disabled="disabled || (source !== 'default' && (loading || !selected))"
        @update:model-value="emit('update:modelValue', $event)"
      />
    </div>
    <p
      v-if="!loading && source !== 'default' && selected && !available.length"
      class="source-note"
    >
      此来源尚未配置可用模型，请先在 Boost 的来源模型目录中配置。
    </p>
    <p
      v-else-if="!loading && source !== 'default' && modelValue && !valid"
      class="source-error"
    >
      当前模型不在所选来源目录中，请重新选择。
    </p>
  </div>
</template>
<style scoped>
.source-fields {
  display: grid;
  gap: 10px;
  margin-top: 10px;
  min-width: 0;
}
.source-row {
  display: grid;
  grid-template-columns: minmax(100px, 1fr) minmax(0, 280px);
  align-items: center;
  gap: 10px;
  min-width: 0;
  font-size: 12px;
  color: var(--fg-2);
}
.source-row > span {
  display: inline-flex;
  align-items: center;
  gap: 5px;
}
.source-note,
.source-error {
  font-size: 11px;
  line-height: 1.5;
  margin: 0;
  color: var(--muted);
}
.source-error {
  color: var(--red);
}
.source-error button {
  margin-left: 6px;
}
@media (max-width: 600px) {
  .source-row {
    grid-template-columns: minmax(85px, 1fr) minmax(0, 185px);
  }
}
</style>
