<script setup lang="ts">
import DialogActions from "@/components/DialogActions.vue";
import { computed, onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import type { ManagedModelInfo, ManagedModelRouting } from "@/types";
import BoostIcon from "./BoostIcon.vue";
import ModelLabel from "./ModelLabel.vue";
import ModelSelect from "./ModelSelect.vue";
import BoostDialog from "./BoostDialog.vue";
import PanelCard from "./PanelCard.vue";
import EmptyState from "./EmptyState.vue";
import ModelSourceImport from "./ModelSourceImport.vue";
import ModelBindingsDialog from "./ModelBindingsDialog.vue";
import { buildCodexModelsCachePayload } from "@/lib/api/model-catalog";
import { serviceClient } from "@/lib/api/service-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { accountClient } from "@/lib/api/account-client";
import { normalizeManagedModelInfo } from "@/lib/api/normalize";
import { formatNumber, isAdmin, notify, perform } from "@/composables/useBoost";
import { usePendingActions } from "@/composables/usePendingActions";
const { run, isPending } = usePendingActions();
const props = defineProps<{ readOnly?: boolean }>();
const route = useRoute();
const filter = ref("all"),
  binding = ref<ManagedModelInfo | null>(null),
  batchDelete = ref(false),
  exporting = ref(false);
const writable = computed(() => isAdmin.value && !props.readOnly);
const models = ref<ManagedModelInfo[]>([]);
const routing = ref<ManagedModelRouting>({ sourceModels: [], mappings: [] });
const selected = ref<string[]>([]);
const detail = ref<ManagedModelInfo | null>(null);
const visibility = ref("list");
const supported = ref(true);
const query = ref("");
const loading = ref(false);
const saving = ref(false);
let loadVersion = 0;
let appliedLoad = 0;
const dialog = ref(false);
const remoteImport = ref(false);
const editing = ref<ManagedModelInfo | null>(null);
const deleting = ref<ManagedModelInfo | null>(null);
const slug = ref("");
const name = ref("");
const description = ref("");
const context = ref<number | null>(null);
const advancedModel = ref("{}");
const visible = computed(() =>
  models.value.filter(
    (m) =>
      `${m.slug} ${m.displayName} ${m.description || ""}`
        .toLowerCase()
        .includes(query.value.toLowerCase()) &&
      (filter.value === "all" ||
        (filter.value === "api" && m.supportedInApi) ||
        (filter.value === "callable" && routeCount(m) > 0) ||
        (filter.value === "custom" && m.sourceKind === "custom") ||
        (filter.value === "remote" && m.sourceKind !== "custom") ||
        (filter.value === "overrides" &&
          m.userEdited &&
          m.sourceKind !== "custom")),
  ),
);
async function load(refresh = false) {
  const version = ++loadVersion;
  loading.value = true;
  await perform(async () => {
    const [catalog, routes] = await Promise.all([
      accountClient.listManagedModels(refresh),
      accountClient.listManagedModelRouting(),
    ]);
    if (version < appliedLoad) return;
    appliedLoad = version;
    models.value = catalog.items;
    routing.value = routes;
    selected.value = selected.value.filter((slug) =>
      models.value.some((model) => model.slug === slug),
    );
  });
  if (version === loadVersion) loading.value = false;
}
function open(m?: ManagedModelInfo) {
  editing.value = m || null;
  slug.value = m?.slug || "";
  name.value = m?.displayName || "";
  description.value = m?.description || "";
  context.value = m?.contextWindow || null;
  visibility.value = m?.visibility || "list";
  supported.value = m?.supportedInApi ?? true;
  const basic = new Set([
    "slug",
    "displayName",
    "description",
    "contextWindow",
    "visibility",
    "supportedInApi",
    "sourceKind",
    "userEdited",
    "sortIndex",
    "updatedAt",
  ]);
  advancedModel.value = JSON.stringify(
    Object.fromEntries(
      Object.entries(m || {}).filter(([key]) => !basic.has(key)),
    ),
    null,
    2,
  );
  dialog.value = true;
}
async function save() {
  if (saving.value) return;
  saving.value = true;
  await perform(async () => {
    let extra: Record<string, unknown>;
    try {
      extra = JSON.parse(advancedModel.value);
      if (!extra || typeof extra !== "object" || Array.isArray(extra))
        throw new Error();
    } catch {
      throw new Error("高级模型参数必须为有效 JSON 对象");
    }
    const model = normalizeManagedModelInfo({
      ...editing.value,
      ...extra,
      slug: slug.value.trim(),
      displayName: name.value.trim() || slug.value.trim(),
      description: description.value,
      contextWindow: context.value,
      supportedInApi: supported.value,
      visibility: visibility.value,
    });
    if (!model) throw new Error("请输入有效的模型标识");
    await accountClient.saveManagedModel({
      previousSlug: editing.value?.slug || null,
      model,
      userEdited: true,
      sourceKind: editing.value?.sourceKind || "custom",
    });
    await load();
    dialog.value = false;
    notify("模型已保存");
  });
  saving.value = false;
}
async function remove() {
  if (!deleting.value) return;
  const model = deleting.value;
  deleting.value = null;
  await run(`delete:${model.slug}`, async () => {
    await perform(async () => {
      await accountClient.deleteManagedModel(model.slug);
      await load();
      notify("模型已删除");
    });
  });
}
onMounted(async () => {
  await load();
  if (route.query.bind === "1" && typeof route.query.model === "string") {
    binding.value =
      models.value.find((m) => m.slug === route.query.model) || null;
  }
});
async function deleteSelected() {
  const targets = [...selected.value];
  batchDelete.value = false;
  await run("delete:selected", async () => {
    const failed: string[] = [];
    let count = 0;
    await Promise.all(
      targets.map(async (slug) => {
        try {
          await accountClient.deleteManagedModel(slug);
          selected.value = selected.value.filter((s) => s !== slug);
          count++;
        } catch (e) {
          failed.push(`${slug}：${getAppErrorMessage(e)}`);
        }
      }),
    );
    await load();
    if (count) notify(`已删除 ${count} 个模型`);
    if (failed.length) notify(failed.join("；"), true);
  });
}
async function exportCache() {
  if (exporting.value) return;
  exporting.value = true;
  await perform(async () => {
    if (!models.value.length) throw new Error("没有可导出的模型");
    const runtime = await serviceClient.initialize();
    const payload = buildCodexModelsCachePayload(
      models.value,
      runtime.userAgent,
    );
    const url = URL.createObjectURL(
      new Blob([JSON.stringify(payload, null, 2)], {
        type: "application/json;charset=utf-8",
      }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "models_cache.json";
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    notify("模型缓存已导出");
  });
  exporting.value = false;
}
const allSelected = computed(
  () =>
    visible.value.length > 0 &&
    visible.value.every((m) => selected.value.includes(m.slug)),
);
function toggleAll(checked: boolean) {
  selected.value = checked ? visible.value.map((m) => m.slug) : [];
}
function modelMappings(model: ManagedModelInfo) {
  return routing.value.mappings.filter(
    (mapping) => mapping.platformModelSlug === model.slug,
  );
}
function routeCount(model: ManagedModelInfo) {
  return modelMappings(model).filter((mapping) => mapping.enabled).length;
}
function sourceText(model: ManagedModelInfo) {
  const kinds = new Set(
    modelMappings(model)
      .filter((mapping) => mapping.enabled)
      .map((mapping) => mapping.sourceKind),
  );
  return (
    [...kinds]
      .map((kind) =>
        kind === "openai_account"
          ? "账号池"
          : kind === "aggregate_api"
            ? "聚合 API"
            : kind,
      )
      .join(" · ") || "暂无绑定"
  );
}
function reasoning(model: ManagedModelInfo) {
  return (
    model.supportedReasoningLevels.map((level) => level.effort).join(" / ") ||
    model.defaultReasoningLevel ||
    "—"
  );
}
</script>
<template>
  <div>
    <div class="page-toolbar">
      <h2 class="section-title">模型目录明细</h2>
      <div class="toolbar-group catalog-actions">
        <button v-if="writable" class="secondary" @click="remoteImport = true">
          <BoostIcon name="download" :size="16" />并入远端模型
        </button>
        <button
          class="secondary"
          :disabled="exporting || !models.length"
          @click="exportCache"
        >
          <BoostIcon name="file" :size="16" />导出模型缓存
        </button>
        <button
          v-if="writable"
          class="secondary"
          :disabled="isPending('delete:selected') || !selected.length"
          @click="batchDelete = true"
        >
          <BoostIcon name="trash-2" :size="16" />批量删除模型
        </button>
        <button v-if="writable" class="primary" @click="open()">
          <BoostIcon name="plus" :size="16" />添加模型
        </button>
      </div>
    </div>
    <div class="catalog-summary">
      <span
        >模型总数 <strong>{{ models.length }}</strong></span
      ><span
        >API 可用
        <strong>{{
          models.filter((m) => m.supportedInApi).length
        }}</strong></span
      ><span
        >可调用
        <strong>{{
          models.filter((m) => routeCount(m) > 0).length
        }}</strong></span
      ><span
        >自定义
        <strong>{{
          models.filter((m) => m.sourceKind === "custom").length
        }}</strong></span
      ><span
        >本地覆写
        <strong>{{
          models.filter((m) => m.userEdited && m.sourceKind !== "custom").length
        }}</strong></span
      >
    </div>
    <div class="page-toolbar">
      <div class="search-field">
        <BoostIcon name="search" :size="16" /><input
          v-model="query"
          aria-label="搜索模型"
          placeholder="搜索模型…"
        />
      </div>
      <div class="toolbar-group">
        <select v-model="filter" aria-label="模型筛选">
          <option value="all">全部模型</option>
          <option value="api">API 可用</option>
          <option value="callable">可调用模型</option>
          <option value="remote">远端模型</option>
          <option value="custom">自定义模型</option>
          <option value="overrides">本地覆写</option>
        </select>
        <button class="secondary" :disabled="loading" @click="load(false)">
          <BoostIcon name="rotate-ccw" :size="14" />刷新目录
        </button>
      </div>
    </div>
    <div v-if="visible.length" class="model-table-wrap">
      <table class="models-table">
        <colgroup>
          <col class="model-select-col" />
          <col class="model-name-col" />
          <col class="model-source-col" />
          <col class="model-api-col" />
          <col class="model-routing-col" />
          <col class="model-visibility-col" />
          <col class="model-reasoning-col" />
          <col class="model-action-col" />
        </colgroup>
        <thead>
          <tr>
            <th>
              <input
                type="checkbox"
                aria-label="选择全部模型"
                :checked="allSelected"
                @change="toggleAll(($event.target as HTMLInputElement).checked)"
              />
            </th>
            <th>模型</th>
            <th>来源</th>
            <th>API</th>
            <th>调用状态</th>
            <th class="model-visibility">可见性</th>
            <th class="model-reasoning">推理等级</th>
            <th class="model-actions-cell">操作</th>
          </tr>
        </thead>
        <tbody>
          <tr
            v-for="model in visible"
            :key="model.slug"
            :class="{ checked: selected.includes(model.slug) }"
          >
            <td>
              <input
                v-model="selected"
                type="checkbox"
                :value="model.slug"
                :aria-label="'选择 ' + model.slug"
              />
            </td>
            <td>
              <div class="model-name-line">
                <h3 :title="model.displayName || model.slug">
                  <ModelLabel :model="model.slug" :display-name="model.displayName" />
                </h3>
                <code>{{ model.slug }}</code>
              </div>
              <p class="model-description" :title="model.description || ''">
                {{ model.description || "—" }}
              </p>
            </td>
            <td>
              <span class="badge">{{
                model.sourceKind === "custom" ? "自定义" : "远端"
              }}</span>
            </td>
            <td>
              <span
                class="badge"
                :class="model.supportedInApi ? 'success' : ''"
                >{{ model.supportedInApi ? "可用" : "停用" }}</span
              >
            </td>
            <td>
              <span class="badge" :class="{ success: routeCount(model) > 0 }">{{
                routeCount(model) > 0
                  ? "已启用 " + routeCount(model) + " 条"
                  : "未绑定"
              }}</span>
              <p class="model-route-source">{{ sourceText(model) }}</p>
            </td>
            <td class="model-visibility">
              <span
                class="badge"
                :class="{ blue: model.visibility !== 'hide' }"
                >{{ model.visibility || "list" }}</span
              >
            </td>
            <td class="model-reasoning">
              <span :title="reasoning(model)">{{ reasoning(model) }}</span>
            </td>
            <td class="model-actions-cell">
              <div class="list-actions">
                <button
                  class="icon-button"
                  :aria-label="'查看 ' + model.slug + ' 绑定'"
                  @click="binding = model"
                >
                  <BoostIcon name="plug" :size="18" /></button
                ><button
                  class="icon-button"
                  :aria-label="'查看 ' + model.slug + ' 详情'"
                  @click="detail = model"
                >
                  <BoostIcon name="ellipsis" :size="18" />
                </button>
              </div>
            </td>
          </tr>
        </tbody>
      </table>
      <div v-if="selected.length" class="model-selection-count">
        已选择 {{ selected.length }} 个模型
      </div>
    </div>
    <PanelCard v-else
      ><EmptyState
        icon="box"
        :title="loading ? '正在读取模型…' : '暂无模型'"
        description="同步上游模型，或添加自定义模型。"
    /></PanelCard>
    <BoostDialog
      v-if="detail"
      :title="detail.displayName || detail.slug"
      wide
      @close="detail = null"
      ><div class="model-detail-grid">
        <div>
          <span>模型标识</span><ModelLabel :model="detail.slug" />
        </div>
        <div>
          <span>上下文窗口</span
          ><span>{{
            detail.contextWindow ? formatNumber(detail.contextWindow) : "—"
          }}</span>
        </div>
        <div>
          <span>推理等级</span><span>{{ reasoning(detail) }}</span>
        </div>
        <div>
          <span>最近更新</span
          ><span>{{
            detail.updatedAt
              ? new Date(detail.updatedAt * 1000).toLocaleString("zh-CN")
              : "—"
          }}</span>
        </div>
      </div>
      <p class="model-detail-description">{{ detail.description }}</p>
      <h3 class="dialog-section-title">调用绑定</h3>
      <div
        v-for="mapping in modelMappings(detail)"
        :key="mapping.id"
        class="model-binding-row"
      >
        <ModelLabel :model="mapping.upstreamModel" />
        <span class="badge">{{
          mapping.sourceKind === "openai_account" ? "账号池" : "聚合 API"
        }}</span
        ><span class="badge" :class="{ success: mapping.enabled }">{{
          mapping.enabled ? "已启用" : "已停用"
        }}</span>
      </div>
      <p v-if="!modelMappings(detail).length" class="muted">暂无调用绑定</p>
      <template #footer
        ><button
          v-if="writable"
          class="danger-button"
          @click="
            deleting = detail;
            detail = null;
          "
        >
          删除模型</button
        ><button
          v-if="isAdmin && !readOnly"
          class="secondary"
          @click="
            open(detail);
            detail = null;
          "
        >
          编辑模型</button
        ><button data-dialog-close class="primary" @click="detail = null">关闭</button></template
      ></BoostDialog
    >
    <ModelBindingsDialog
      v-if="binding"
      :model="binding"
      :routing="routing"
      :read-only="!writable"
      @close="binding = null"
      @changed="load(false)"
    />
    <BoostDialog
      v-if="batchDelete"
      title="批量删除模型"
      @close="batchDelete = false"
      ><p>确认删除选中的 {{ selected.length }} 个模型？关联路由将一并清理。</p>
      <div class="delete-model-list">
        <ModelLabel v-for="slug in selected" :key="slug" :model="slug" />
      </div>
      <DialogActions
        ><button data-dialog-close class="secondary" @click="batchDelete = false">取消</button
        ><button class="danger-button" @click="deleteSelected">
          确认删除
        </button></DialogActions
      ></BoostDialog
    >
    <ModelSourceImport
      v-if="remoteImport"
      @close="remoteImport = false"
      @imported="load(false)"
    />
    <BoostDialog
      v-if="dialog"
      :title="editing ? '编辑模型' : '添加模型'"
      :busy="saving" @close="!saving && (dialog = false)"
      ><form class="form-stack" @submit.prevent="save">
        <label class="form-field"
          >模型标识<ModelSelect v-model="slug" label="模型标识" required placeholder="gpt-…" /></label
        ><label class="form-field"
          >显示名称<input v-model="name" required /></label
        ><label class="form-field">描述<textarea v-model="description" /></label
        ><label class="form-field"
          >上下文窗口<input v-model="context" type="number" min="1" step="1"
        /></label>
        <div class="form-two">
          <label class="form-field"
            >可见性<select v-model="visibility">
              <option value="list">list</option>
              <option value="hide">hide</option>
            </select></label
          ><label class="form-field"
            >API 状态<select v-model="supported">
              <option :value="true">可用</option>
              <option :value="false">停用</option>
            </select></label
          >
        </div>
        <details class="connection-advanced">
          <summary>高级模型参数</summary>
          <label class="form-field"
            >模型参数 JSON<textarea
              v-model="advancedModel"
              spellcheck="false"
              class="code-editor"
            />
          </label>
        </details>
        <DialogActions>
          <button data-dialog-close
            type="button"
            class="secondary"
            :disabled="saving"
            @click="dialog = false"
          >
            取消</button
          ><button class="primary" :disabled="saving">保存模型</button>
        </DialogActions>
      </form></BoostDialog
    ><BoostDialog v-if="deleting" title="删除模型" @close="deleting = null"
      ><p style="margin-bottom: 20px">确认删除 {{ deleting.slug }}？</p>
      <DialogActions>
        <button data-dialog-close class="secondary" @click="deleting = null">取消</button
        ><button class="danger-button" @click="remove">删除模型</button>
      </DialogActions></BoostDialog
    >
  </div>
</template>
