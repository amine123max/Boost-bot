<script setup lang="ts">
import HelpHint from "@/components/HelpHint.vue";
import { ref, computed, onMounted } from "vue";
import type { ModelPriceRule } from "@/types";
import BoostIcon from "./BoostIcon.vue";
import PanelCard from "./PanelCard.vue";
import EmptyState from "./EmptyState.vue";
import ModelPriceDialog from "./ModelPriceDialog.vue";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import { quotaClient } from "@/lib/api/quota-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { isAdmin, formatTime, notify, perform } from "@/composables/useBoost";
import { usePendingActions } from "@/composables/usePendingActions";
const { run } = usePendingActions();
const editing = ref<ModelPriceRule | null>(null),
  editor = ref(false),
  deleting = ref<ModelPriceRule | null>(null);
function edit(rule?: ModelPriceRule) {
  editing.value = rule || null;
  editor.value = true;
}
async function remove() {
  if (!deleting.value) return;
  const rule = deleting.value;
  deleting.value = null;
  await run(`delete:${rule.id}`, async () => {
  await perform(async () => {
    await quotaClient.deleteModelPriceRule(rule.id);
    await load();
    notify("自定义价格已删除");
  });
  });
}
const providers = [
  { id: "openai", name: "OpenAI" },
  { id: "google", name: "Gemini" },
  { id: "anthropic", name: "Claude" },
] as const;
type Provider = (typeof providers)[number]["id"];
const busy = ref(false),
  active = ref(""),
  provider = ref<Provider | "all">("all");
const rules = ref<ModelPriceRule[]>([]),
  query = ref("");
const visible = computed(() =>
  rules.value.filter(
    (r) =>
      (provider.value === "all" || r.provider === provider.value) &&
      r.modelPattern.toLowerCase().includes(query.value.toLowerCase()),
  ),
);
const label = (id: string) => providers.find((p) => p.id === id)?.name || id;
const money = (value?: number | null) => (value == null ? "—" : "$" + value);
const tier = (mode?: string) =>
  ({
    standard: "Standard",
    fast: "Fast",
    flex: "Flex",
    ultrafast: "Ultrafast",
  })[mode || "standard"] || mode;
const summary = computed(() =>
  providers.map((p) => {
    const rows = rules.value.filter(
      (r) => r.provider === p.id && r.source === "official_sync",
    );
    return {
      ...p,
      count: new Set(rows.map((r) => r.modelPattern)).size,
      updated: Math.max(0, ...rows.map((r) => r.updatedAt || 0)),
    };
  }),
);
async function load() {
  rules.value = await quotaClient.modelPriceRules();
}
async function sync() {
  if (busy.value) return;
  busy.value = true;
  let count = 0,
    successes = 0;
  try {
    for (const p of providers.filter(
      (p) => provider.value === "all" || p.id === provider.value,
    )) {
      active.value = p.name;
      try {
        const result = await quotaClient.syncOfficialPrices(p.id);
        count += result.modelCount;
        successes++;
      } catch (e) {
        notify(p.name + "：" + getAppErrorMessage(e), true);
      }
    }
    await perform(load);
    if (successes) notify(`已同步 ${successes} 家官方价格 · ${count} 个模型`);
  } finally {
    busy.value = false;
    active.value = "";
  }
}
onMounted(() => perform(load));
</script>
<template>
  <section class="model-pricing-section">
    <div class="page-toolbar">
      <div class="toolbar-group">
        <div class="search-field">
          <BoostIcon name="search" :size="16" /><input
            v-model="query"
            placeholder="搜索模型价格…"
            aria-label="搜索价格规则"
          />
        </div>
        <select v-model="provider" aria-label="价格提供商">
          <option value="all">全部提供商</option>
          <option v-for="p in providers" :key="p.id" :value="p.id">
            {{ p.name }}
          </option>
        </select>
      </div>
      <div class="toolbar-group">
        <button v-if="isAdmin" class="secondary" :disabled="busy" @click="sync">
          <BoostIcon
            name="rotate-ccw"
            :size="15"
            :class="{ spinning: busy }"
          />{{ busy ? "正在同步 " + active + "…" : "同步官方价格" }}
        </button>
        <button v-if="isAdmin" class="primary" @click="edit()">
          <BoostIcon name="plus" :size="16" />新增价格
        </button>
      </div>
    </div>
    <div class="price-providers">
      <div v-for="p in summary" :key="p.id" class="price-provider">
        <strong>{{ p.name }}</strong
        ><span>{{ p.count ? p.count + " 个模型" : "尚未同步" }}</span
        ><small>{{ p.updated ? formatTime(p.updated) : "等待首次同步" }}</small>
      </div>
    </div>
    <div class="price-details">
      <p class="price-unit">USD / 百万 tokens<HelpHint label="价格" text="Standard 文本价格；OpenAI 同时同步官网提供的服务档位。" /></p>
      <div v-if="visible.length" class="model-table-wrap price-table-wrap">
        <table
          v-resizable-columns="[27, 11, 12, 11, 15, 14, 10]"
          class="models-table prices-table"
        >
          <colgroup>
            <col class="price-model-col" />
            <col />
            <col />
            <col />
            <col />
            <col class="price-source-col" />
            <col v-if="isAdmin" class="price-actions-col" />
          </colgroup>
          <thead>
            <tr>
              <th>模型 / 档位</th>
              <th>输入</th>
              <th>缓存读取</th>
              <th>输出</th>
              <th>缓存写入</th>
              <th>来源</th>
              <th v-if="isAdmin" class="model-actions-cell">操作</th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="r in visible" :key="r.id">
              <td>
                <div class="model-name-line">
                  <h3 class="price-model-name">{{ r.modelPattern }}</h3>
                </div>
                <div class="price-model-meta">
                  <span>{{ label(r.provider) }}</span
                  ><span class="badge">{{ tier(r.billingMode) }}</span>
                </div>
              </td>
              <td>
                {{ money(r.inputPricePer1m) }}
                <div
                  v-if="r.longContextInputPricePer1m != null"
                  class="model-route-source"
                >
                  &gt;{{ r.longContextThresholdTokens?.toLocaleString() }}：{{
                    money(r.longContextInputPricePer1m)
                  }}
                </div>
              </td>
              <td>
                {{ money(r.cachedInputPricePer1m) }}
                <div
                  v-if="r.longContextCachedInputPricePer1m != null"
                  class="model-route-source"
                >
                  长上下文 {{ money(r.longContextCachedInputPricePer1m) }}
                </div>
              </td>
              <td>
                {{ money(r.outputPricePer1m) }}
                <div
                  v-if="r.longContextOutputPricePer1m != null"
                  class="model-route-source"
                >
                  长上下文 {{ money(r.longContextOutputPricePer1m) }}
                </div>
              </td>
              <td>
                <template v-if="r.cacheWrite5mPricePer1m != null"
                  ><span>5m {{ money(r.cacheWrite5mPricePer1m) }}</span>
                  <div class="model-route-source">
                    1h {{ money(r.cacheWrite1hPricePer1m) }}
                  </div></template
                ><template v-else>—</template>
              </td>
              <td>
                <a
                  v-if="r.source === 'official_sync' && r.sourceUrl"
                  class="badge blue"
                  :href="r.sourceUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  :title="formatTime(r.updatedAt || 0)"
                  >官方同步</a
                ><span v-else class="badge">自定义</span>
              </td>
              <td v-if="isAdmin" class="model-actions-cell">
                <div class="list-actions">
                  <button
                    class="icon-button"
                    :aria-label="'编辑 ' + r.modelPattern + ' 价格'"
                    :title="r.source === 'custom' ? '编辑价格' : '覆盖官方价格'"
                    @click="edit(r)"
                  >
                    <BoostIcon name="pencil" :size="16" /></button
                  ><button
                    v-if="r.source === 'custom'"
                    class="icon-button"
                    :aria-label="'删除 ' + r.modelPattern + ' 价格'"
                    @click="deleting = r"
                  >
                    <BoostIcon name="trash-2" :size="16" />
                  </button>
                </div>
              </td>
            </tr>
          </tbody>
        </table>
      </div>
      <PanelCard v-else
        ><EmptyState
          icon="box"
          title="暂无价格规则"
          description="同步官网价格后显示。未定价模型不使用内置价格估算。"
      /></PanelCard>
    </div>
    <ModelPriceDialog
      v-if="editor"
      :rule="editing"
      @close="editor = false"
      @saved="perform(load)"
    />
    <BoostDialog
      v-if="deleting"
      title="删除自定义价格"
      @close="deleting = null"
      ><p>确认删除 {{ deleting.modelPattern }} 的自定义价格？</p>
      <DialogActions
        ><button class="secondary" @click="deleting = null">
          取消</button
        ><button class="danger-button" @click="remove">
          确认删除
        </button></DialogActions
      ></BoostDialog
    >
  </section>
</template>
