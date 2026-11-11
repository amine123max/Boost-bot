<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type {
  AggregateApi,
  AggregateApiSupplierModel,
  ManagedModelRouting,
} from "@/types";
import { accountClient } from "@/lib/api/account-client";
import { notify, perform } from "@/composables/useBoost";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import BoostIcon from "./BoostIcon.vue";
const props = defineProps<{ api: AggregateApi }>();
const emit = defineEmits<{ close: []; changed: [count: number] }>();
const tab = ref("pool"),
  busy = ref(false),
  loading = ref(true),
  query = ref(""),
  upstream = ref(""),
  displayName = ref("");
const pendingDelete = ref<AggregateApiSupplierModel | null>(null);
const routing = ref<ManagedModelRouting>({ sourceModels: [], mappings: [] });
const templates = ref<AggregateApiSupplierModel[]>([]);
const supplierKey = computed(
  () => props.api.supplierName?.trim() || props.api.url.trim(),
);
const active = computed(() => props.api.status === "active");
const pool = computed(() =>
  routing.value.sourceModels.filter(
    (m) => m.sourceKind === "aggregate_api" && m.sourceId === props.api.id,
  ),
);
const filteredPool = computed(() =>
  pool.value.filter((m) =>
    (m.upstreamModel + " " + m.displayName)
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const filteredTemplates = computed(() =>
  templates.value.filter((m) =>
    (m.upstreamModel + " " + m.displayName)
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
async function load() {
  const [routes, rows] = await Promise.all([
    accountClient.listManagedModelRouting(),
    accountClient.listAggregateApiSupplierModels({
      supplierKey: supplierKey.value,
      providerType: props.api.providerType,
    }),
  ]);
  routing.value = routes;
  templates.value = rows;
}
onMounted(async () => {
  await perform(load);
  loading.value = false;
});
async function run(action: () => Promise<string>) {
  busy.value = true;
  await perform(async () => {
    const message = await action();
    await load();
    emit("changed", pool.value.length);
    notify(message);
  });
  busy.value = false;
}
async function sync() {
  await run(async () => {
    await accountClient.syncManagedModelSourceModels({
      sourceKind: "aggregate_api",
      sourceId: props.api.id,
    });
    return "远端模型已并入";
  });
}
async function importTemplates() {
  await run(async () => {
    const result = await accountClient.importAggregateApiSupplierModels({
      apiId: props.api.id,
      supplierKey: supplierKey.value,
      providerType: props.api.providerType,
    });
    return `已导入 ${result.imported} 个供应商模型`;
  });
}
async function add() {
  await run(async () => {
    const id = upstream.value.trim();
    if (tab.value === "pool") {
      await accountClient.saveManagedModelSourceModel({
        sourceKind: "aggregate_api",
        sourceId: props.api.id,
        upstreamModel: id,
        displayName: displayName.value.trim() || null,
      });
    } else {
      await accountClient.saveAggregateApiSupplierModel({
        supplierKey: supplierKey.value,
        providerType: props.api.providerType,
        upstreamModel: id,
        displayName: displayName.value.trim() || null,
        status: "available",
      });
    }
    upstream.value = "";
    displayName.value = "";
    return tab.value === "pool" ? "来源模型已添加" : "供应商模板已保存";
  });
}
async function toggle(row: AggregateApiSupplierModel) {
  await run(async () => {
    await accountClient.saveAggregateApiSupplierModel({
      ...row,
      status: row.status === "available" ? "disabled" : "available",
    });
    return "模板状态已更新";
  });
}
async function remove() {
  if (!pendingDelete.value) return;
  await run(async () => {
    await accountClient.deleteAggregateApiSupplierModel(pendingDelete.value!);
    pendingDelete.value = null;
    return "供应商模板已删除";
  });
}
async function importOne(row: AggregateApiSupplierModel) {
  await run(async () => {
    await accountClient.saveManagedModelSourceModel({
      sourceKind: "aggregate_api",
      sourceId: props.api.id,
      upstreamModel: row.upstreamModel,
      displayName: row.displayName,
    });
    return "供应商模型已导入";
  });
}
function bound(model: string) {
  return routing.value.mappings.filter(
    (m) =>
      m.sourceKind === "aggregate_api" &&
      m.sourceId === props.api.id &&
      m.upstreamModel === model &&
      m.enabled,
  ).length;
}
</script>
<template>
  <BoostDialog title="聚合 API 模型" wide @close="!busy && emit('close')">
    <div class="binding-model-heading">
      <h3>{{ api.supplierName || api.url }}</h3>
      <span class="badge">{{
        api.providerType === "codex" ? "OpenAI 兼容" : api.providerType
      }}</span
      ><span class="badge">模型池 {{ pool.length }}</span
      ><span class="badge">模板 {{ templates.length }}</span>
    </div>
    <div v-spring-switch class="tabs" role="tablist" aria-label="聚合模型分类">
      <button
        role="tab"
        :aria-selected="tab === 'pool'"
        :class="{ selected: tab === 'pool' }"
        @click="
          tab = 'pool';
          query = '';
        "
      >
        当前模型池</button
      ><button
        role="tab"
        :aria-selected="tab === 'templates'"
        :class="{ selected: tab === 'templates' }"
        @click="
          tab = 'templates';
          query = '';
        "
      >
        供应商模板
      </button>
    </div>
    <div v-if="tab === 'pool'" class="page-toolbar">
      <div class="toolbar-group">
        <button class="secondary" :disabled="busy || !active" @click="sync">
          <BoostIcon name="rotate-ccw" :size="16" />拉取远端模型</button
        ><button
          class="secondary"
          :disabled="
            busy || !active || !templates.some((t) => t.status === 'available')
          "
          @click="importTemplates"
        >
          <BoostIcon name="download" :size="16" />从供应商模板导入
        </button>
      </div>
    </div>
    <p v-if="!active" class="muted">
      连接已禁用，启用后可向当前模型池导入模型。
    </p>
    <form class="aggregate-model-form" @submit.prevent="add">
      <label class="form-field"
        >上游模型名<input
          v-model="upstream"
          required
          placeholder="模型 ID" /></label
      ><label class="form-field"
        >模型显示名称<input v-model="displayName" placeholder="可选" /></label
      ><button
        class="primary"
        :disabled="
          busy || loading || !upstream.trim() || (tab === 'pool' && !active)
        "
      >
        {{ tab === "pool" ? "添加到模型池" : "保存供应商模板" }}
      </button>
    </form>
    <div class="search-field model-pool-search">
      <BoostIcon name="search" :size="16" /><input
        v-model="query"
        aria-label="搜索连接模型"
        placeholder="搜索模型…"
      />
    </div>
    <p v-if="loading" class="muted">正在读取模型…</p>
    <div v-else class="table-wrap pool-table">
      <table>
        <thead>
          <tr>
            <th>模型</th>
            <th>状态</th>
            <th>{{ tab === "pool" ? "调用绑定" : "模型池" }}</th>
            <th class="model-actions-cell">操作</th>
          </tr>
        </thead>
        <tbody v-if="tab === 'pool'">
          <tr v-for="m in filteredPool" :key="m.upstreamModel">
            <td>
              <code>{{ m.upstreamModel }}</code>
              <div v-if="m.displayName" class="card-subtitle">
                {{ m.displayName }}
              </div>
            </td>
            <td>
              <span
                class="badge"
                :class="{ success: m.status === 'available' }"
                >{{ m.status === "available" ? "可用" : "不可用" }}</span
              >
            </td>
            <td>{{ bound(m.upstreamModel) }} 条启用</td>
            <td>
              <RouterLink
                class="text-button"
                :to="{
                  path: '/models/',
                  query: { model: m.upstreamModel, bind: '1' },
                }"
                @click="emit('close')"
                >管理绑定</RouterLink
              >
            </td>
          </tr>
          <tr v-if="!filteredPool.length">
            <td colspan="4" class="muted">
              {{
                query ? "没有匹配模型" : "暂无模型，可从远端或供应商模板导入。"
              }}
            </td>
          </tr>
        </tbody>
        <tbody v-else>
          <tr v-for="m in filteredTemplates" :key="m.upstreamModel">
            <td>
              <code>{{ m.upstreamModel }}</code>
              <div v-if="m.displayName" class="card-subtitle">
                {{ m.displayName }}
              </div>
            </td>
            <td>
              <span
                class="badge"
                :class="{ success: m.status === 'available' }"
                >{{ m.status === "available" ? "可用" : "已禁用" }}</span
              >
            </td>
            <td>
              {{
                pool.some((p) => p.upstreamModel === m.upstreamModel)
                  ? "已导入"
                  : "未导入"
              }}
            </td>
            <td>
              <div class="list-actions">
                <button
                  class="icon-button"
                  :aria-label="'导入 ' + m.upstreamModel"
                  :disabled="busy || !active || m.status !== 'available'"
                  @click="importOne(m)"
                >
                  <BoostIcon name="download" :size="16" /></button
                ><button
                  class="icon-button"
                  :aria-label="'切换模板 ' + m.upstreamModel"
                  :disabled="busy"
                  @click="toggle(m)"
                >
                  <BoostIcon name="power" :size="16" /></button
                ><button
                  class="icon-button"
                  :aria-label="'删除模板 ' + m.upstreamModel"
                  :disabled="busy"
                  @click="pendingDelete = m"
                >
                  <BoostIcon name="trash-2" :size="16" />
                </button>
              </div>
            </td>
          </tr>
          <tr v-if="!filteredTemplates.length">
            <td colspan="4" class="muted">暂无供应商模板</td>
          </tr>
        </tbody>
      </table>
    </div>
    <div v-if="pendingDelete" class="inline-confirm">
      <span>确认删除模板 {{ pendingDelete.upstreamModel }}？</span
      ><button
        class="text-button"
        :disabled="busy"
        @click="pendingDelete = null"
      >
        取消</button
      ><button class="danger-button" :disabled="busy" @click="remove">
        确认删除
      </button>
    </div>
    <DialogActions
      ><RouterLink class="text-button" to="/models/" @click="emit('close')"
        >打开模型目录</RouterLink
      ><button class="primary" :disabled="busy" @click="emit('close')">
        完成
      </button></DialogActions
    >
  </BoostDialog>
</template>
