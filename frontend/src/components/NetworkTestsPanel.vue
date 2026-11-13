<script setup lang="ts">
import HelpHint from "@/components/HelpHint.vue";
import { computed, onMounted, onBeforeUnmount, ref } from "vue";
import BoostIcon from "./BoostIcon.vue";
import BoostMenu, { type MenuItem } from "./BoostMenu.vue";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import EmptyState from "./EmptyState.vue";
import CountryFlag from "./CountryFlag.vue";
import ProxyNodeCard from "./ProxyNodeCard.vue";
import { useProxyNetwork } from "@/composables/useProxyNetwork";
import { perform, notify, formatTime } from "@/composables/useBoost";
import type { ProxyAction } from "@/lib/api/proxy-client";

const { snapshot, isPending, error, refresh, action } = useProxyNetwork();
const busy = computed(() => isPending("import:"));
const query = ref("");
const importing = ref(false),
  importText = ref(""),
  replace = ref(false);
const file = ref<HTMLInputElement>();
const showKernel = ref(false);
const addingLocal = ref(false),
  localHost = ref("127.0.0.1"),
  localPort = ref("7897"),
  localProtocol = ref("http");
let timer: ReturnType<typeof setInterval>;
const blocked = computed(
  () =>
    !snapshot.value,
);
const nodes = computed(() => snapshot.value?.nodes || []);
const visible = computed(() =>
  nodes.value.filter((n) =>
    `${n.name} ${n.country} ${n.protocol}`
      .toLowerCase()
      .includes(query.value.toLowerCase()),
  ),
);
const current = computed(() => nodes.value.find((n) => n.selected));
const completed = computed(
  () =>
    nodes.value.filter((n) =>
      ["success", "failed", "cancelled"].includes(n.measurement.state),
    ).length,
);
const available = computed(
  () => nodes.value.filter((n) => n.measurement.state === "success").length,
);
const strategies: MenuItem[] = [
  {
    value: "stable",
    label: "稳定优先",
    icon: "shield-check",
    group: "自动选择",
  },
  { value: "latency", label: "低延迟优先", icon: "gauge" },
  {
    value: "manual",
    label: "手动固定节点",
    icon: "mouse-pointer-2",
    group: "手动选择",
    disabled: !current.value,
  },
];
const strategyItems = computed(() =>
  strategies.map((s) => ({
    ...s,
    disabled: s.value === "manual" && !current.value,
  })),
);
const strategyLabel = computed(
  () =>
    ({ stable: "稳定优先", latency: "低延迟优先", manual: "手动固定" })[
      snapshot.value?.strategy || "stable"
    ],
);
const importItems: MenuItem[] = [
  { value: "local", label: "添加本地代理", icon: "plug" },
  { value: "paste", label: "粘贴节点链接", icon: "copy" },
  { value: "clipboard", label: "从剪贴板导入", icon: "clipboard-paste" },
  { value: "file", label: "从文本文件导入", icon: "file" },
];
const kernelItems = computed<MenuItem[]>(() => [
  { value: "coreScan", label: "重新扫描本地内核", icon: "search" },
  { value: "coreCheck", label: "检查内核更新", icon: "rotate-ccw" },
  {
    value: snapshot.value?.kernel.installedVersion
      ? "coreUpdate"
      : "coreInstall",
    label: snapshot.value?.kernel.installedVersion
      ? "更新 sing-box 内核"
      : "安装 sing-box 内核",
    icon: "cloud-download",
  },
  { value: "settings", label: "自动更新设置", icon: "settings" },
]);
const phase = computed(
  () =>
    ({
      scanning: "搜索本地内核中",
      checking: "检查版本中",
      downloading: "下载内核中",
      installing: "验证并安装中",
      ready: "内核就绪",
      failed: "内核任务失败",
    })[snapshot.value?.kernel.phase || ""] || "内核管理",
);
async function run(
  name: ProxyAction,
  options: Record<string, unknown> = {},
  message = "",
) {
  return perform(async () => {
    const value = await action(name, options);
    if (value && message) notify(message);
    return value;
  });
}
async function importMenu(value: string) {
  if (value === "local") {
    addingLocal.value = true;
    return;
  }
  if (value === "file") {
    file.value?.click();
    return;
  }
  importText.value = "";
  replace.value = false;
  importing.value = true;
  if (value === "clipboard") {
    try {
      importText.value = await navigator.clipboard.readText();
    } catch {
      notify("无法读取剪贴板，请手动粘贴节点链接", true);
    }
  }
}
async function saveLocal() {
  const port = Number(localPort.value);
  if (
    !/^\d+$/.test(localPort.value) ||
    !Number.isInteger(port) ||
    port < 1 ||
    port > 65535
  ) {
    notify("请输入 1–65535 范围内的端口", true);
    return;
  }
  const host = localHost.value.trim();
  if (!["127.0.0.1", "localhost", "[::1]", "::1"].includes(host)) {
    notify("本地地址请使用 127.0.0.1、localhost 或 ::1", true);
    return;
  }
  const address = host === "::1" ? "[::1]" : host;
  const result = await run(
    "import",
    {
      text: `${localProtocol.value}://${address}:${port}#${encodeURIComponent(`本地代理 · ${port}`)}`,
    },
    "本地代理已添加，正在查询出口国家",
  );
  if (result) addingLocal.value = false;
}
async function fileChanged(event: Event) {
  const target = event.target as HTMLInputElement;
  const value = target.files?.[0];
  if (!value) return;
  if (value.size > 262144) {
    notify("节点文件不能超过 256 KB", true);
    target.value = "";
    return;
  }
  try {
    importText.value = await value.text();
    replace.value = false;
    importing.value = true;
  } catch {
    notify("无法读取节点文件", true);
  }
  target.value = "";
}
async function saveImport() {
  const result = await run(
    "import",
    { text: importText.value, replace: replace.value },
    "节点已导入",
  );
  if (result) {
    importing.value = false;
    importText.value = "";
  }
}
async function setStrategy(strategy: string) {
  await run(
    "strategy",
    { strategy, nodeId: strategy === "manual" ? current.value?.id : "" },
    "节点选择策略已更新",
  );
}
async function kernelMenu(value: string) {
  if (value === "settings") {
    showKernel.value = true;
    return;
  }
  await run(value as ProxyAction);
}
onMounted(() => {
  void refresh();
  timer = setInterval(() => void refresh(), 3000);
});
onBeforeUnmount(() => clearInterval(timer));
</script>

<template>
  <section class="network-workbench" aria-label="网速测试面板">
    <div class="page-toolbar network-toolbar">
      <div class="toolbar-group">
        <span class="eyebrow">NETWORK BENCHMARK</span
        ><span class="badge">{{ nodes.length }} 个节点</span>
      </div>
      <div class="toolbar-group network-actions">
        <BoostMenu
          label="内核管理"
          icon="cpu"
          :items="kernelItems"
          :disabled="blocked"
          @select="kernelMenu"
        />
        <BoostMenu
          :label="strategyLabel"
          icon="route"
          :items="strategyItems"
          :selected="snapshot?.strategy"
          :disabled="blocked || isPending('strategy:') || !nodes.length"
          @select="setStrategy"
        />
        <BoostMenu
          label="导入节点"
          icon="cloud-upload"
          :items="importItems"
          :disabled="blocked"
          @select="importMenu"
        />
        <input
          ref="file"
          hidden
          type="file"
          accept=".txt,text/plain"
          aria-label="节点文本文件"
          @change="fileChanged"
        />
      </div>
    </div>

    <div class="network-overview">
      <div>
        <span>当前出口</span
        ><strong class="network-current"
          ><CountryFlag
            :code="current?.countryCode || ''"
            :country="current?.country"
          />{{
            current?.name || (nodes.length ? "等待内核就绪" : "直连")
          }}</strong
        >
      </div>
      <div>
        <span>测速通过</span
        ><strong
          >{{ available }} <small>/ {{ nodes.length }}</small></strong
        >
      </div>
      <div>
        <span>选择策略</span><strong>{{ strategyLabel }}</strong>
      </div>
      <button class="network-core" type="button" @click="showKernel = true">
        <span>sing-box 内核</span
        ><strong
          ><BoostIcon name="cpu" :size="16" />{{
            snapshot?.kernel.installedVersion
              ? `v${snapshot.kernel.installedVersion}`
              : "未安装"
          }}<BoostIcon name="chevron-right" :size="14"
        /></strong>
      </button>
    </div>
    <div v-if="snapshot?.kernel.busy" class="network-message">
      <BoostIcon name="loader-circle" class="spinning" :size="15" />{{
        phase
      }}，现有出口继续使用当前内核。
    </div>
    <p
      v-if="error || snapshot?.error || snapshot?.kernel.error"
      class="network-error"
      role="alert"
    >
      <BoostIcon name="circle-alert" :size="16" />{{
        error || snapshot?.error || snapshot?.kernel.error
      }}
    </p>
    <div class="network-test-bar">
      <div class="search-field">
        <BoostIcon name="search" :size="16" /><input
          v-model="query"
          aria-label="搜索代理节点"
          placeholder="搜索节点、国家或协议…"
        />
      </div>
      <div class="toolbar-group">
        <span v-if="snapshot?.testRunning" class="toolbar-note"
          >{{ completed }} / {{ nodes.length }} 已完成</span
        ><button
          v-if="snapshot?.testRunning"
          class="secondary"
          :disabled="isPending('cancelTest:')"
          @click="run('cancelTest')"
        >
          <BoostIcon name="square" :size="14" />停止测速</button
        ><button
          v-else
          class="primary"
          :disabled="blocked || isPending('test:') || !nodes.length"
          @click="run('test')"
        >
          <BoostIcon name="gauge" :size="16" />测速全部
        </button>
      </div>
    </div>
    <div
      v-if="snapshot?.testRunning"
      class="progress-track"
      role="progressbar"
      aria-label="节点测速进度"
      :aria-valuemax="nodes.length"
      :aria-valuenow="completed"
    >
      <span
        :style="{ width: `${(completed / Math.max(nodes.length, 1)) * 100}%` }"
      />
    </div>
    <div v-if="visible.length" class="node-test-grid">
      <ProxyNodeCard
        v-for="node in visible"
        :key="node.id"
        :node="node"
        :blocked="blocked"
        :testing="!!snapshot?.testRunning || isPending(`test:${node.id}`)"
        :removing="isPending(`remove:${node.id}`)"
        :choosing="isPending('strategy:')"
        :manual="snapshot?.strategy === 'manual'"
        @test="run('test', { nodeId: node.id })"
        @choose="
          run(
            'strategy',
            { strategy: 'manual', nodeId: node.id },
            '已固定使用该节点',
          )
        "
        @remove="
          run(
            'remove',
            { nodeId: node.id },
            '节点已移除；绑定此节点的账号将阻断请求',
          )
        "
      />
    </div>
    <EmptyState
      v-else
      icon="network"
      :title="query ? '没有匹配的节点' : '导入节点，开始网络测试'"
      :description="query ? '试试其他关键词' : undefined"
    />
    <div v-if="nodes.length" id="node-selection-help" class="network-footnote">
      <BoostIcon name="info" :size="14" /><span
        >双击卡片或按 Enter 固定节点；故障不回退直连。</span
      >
    </div>

    <BoostDialog
      v-if="importing"
      title="导入代理节点"
      @close="!busy && (importing = false)"
    >
      <form class="form-stack" @submit.prevent="saveImport">
        <label class="form-field"
          >节点链接<textarea
            v-model="importText"
            aria-label="待导入节点链接"
            rows="8"
            spellcheck="false"
            autocomplete="off"
            placeholder="每行一个节点链接或本地端口，例如 7897、127.0.0.1:7897、socks5://127.0.0.1:1080"
            :disabled="busy"
          /></label
        ><label class="node-replace"
          ><input
            v-model="replace"
            type="checkbox"
            :disabled="busy"
          />替换现有节点列表<HelpHint label="替换节点" text="默认追加并去重。被移除节点的账号绑定会保留并阻断请求，请重新指定节点。" /></label
        ><DialogActions
          ><button
            type="button"
            class="secondary"
            :disabled="busy"
            @click="importing = false"
          >
            取消</button
          ><button class="primary" :disabled="busy || !importText.trim()">
            <BoostIcon name="cloud-upload" :size="15" />{{
              busy ? "导入中…" : "导入节点"
            }}
          </button></DialogActions
        >
      </form>
    </BoostDialog>
    <BoostDialog
      v-if="showKernel"
      title="sing-box 内核管理"
      @close="showKernel = false"
    >
      <div class="form-stack">
        <div class="setting-row">
          <span>当前版本</span
          ><strong>{{ snapshot?.kernel.installedVersion || "未安装" }}</strong>
        </div>
        <div class="form-field" v-if="snapshot?.kernel.localPath">
          <span>本地内核<HelpHint label="本地内核" :text="snapshot.kernel.source === 'managed' ? 'Boost 托管内核' : '优先复用已安装的本地内核'" /></span
          ><code class="kernel-path">{{ snapshot.kernel.localPath }}</code
          >
        </div>
        <div class="setting-row">
          <span>最新版本</span
          ><strong>{{ snapshot?.kernel.latestVersion || "尚未检查" }}</strong>
        </div>
        <div class="setting-row">
          <span
            >自动更新<HelpHint label="内核自动更新" text="每日检查并更新官方稳定版本。" /></span
          ><input
            type="checkbox"
            role="switch"
            aria-label="自动更新 sing-box 内核"
            :checked="snapshot?.kernel.autoUpdate"
            :disabled="isPending('coreAuto:')"
            @change="
              run('coreAuto', {
                enabled: ($event.target as HTMLInputElement).checked,
              })
            "
          />
        </div>
        <span>内核管理<HelpHint label="内核管理" text="优先复用本地 sing-box；手动或自动更新下载新版后，校验 SHA-256 和节点配置再启用。" /></span>
        <p v-if="snapshot?.kernel.error" class="network-error" role="alert">
          {{ snapshot.kernel.error }}
        </p>
        <p v-if="snapshot?.kernel.busy" class="muted">{{ phase }}…</p>
        <DialogActions
          ><button
            class="secondary"
            :disabled="blocked || isPending('coreScan:')"
            @click="run('coreScan')"
          >
            <BoostIcon name="search" :size="15" />扫描本地</button
          ><button
            class="secondary"
            :disabled="blocked || isPending('coreCheck:')"
            @click="run('coreCheck')"
          >
            <BoostIcon name="rotate-ccw" :size="15" />检查更新</button
          ><button
            class="primary"
            :disabled="blocked || !!snapshot?.kernel.busy || isPending('coreUpdate:') || isPending('coreInstall:')"
            @click="
              run(
                snapshot?.kernel.installedVersion
                  ? 'coreUpdate'
                  : 'coreInstall',
              )
            "
          >
            <BoostIcon name="cloud-download" :size="15" />{{
              snapshot?.kernel.installedVersion ? "更新内核" : "安装内核"
            }}
          </button></DialogActions
        >
      </div>
    </BoostDialog>
    <BoostDialog
      v-if="addingLocal"
      title="添加本地代理"
      @close="!busy && (addingLocal = false)"
    >
      <form class="form-stack" @submit.prevent="saveLocal">
        <label class="form-field"
          >代理协议<select
            v-model="localProtocol"
            aria-label="本地代理协议"
            :disabled="busy"
          >
            <option value="http">HTTP / 混合端口</option>
            <option value="socks5h">SOCKS5</option>
          </select></label
        >
        <div class="local-proxy-fields">
          <label class="form-field"
            >本地地址<input
              v-model="localHost"
              aria-label="本地代理地址"
              :disabled="busy" /></label
          ><label class="form-field"
            >端口<input
              v-model="localPort"
              aria-label="本地代理端口"
              inputmode="numeric"
              :disabled="busy"
          /></label>
        </div>
        <span>本地代理<HelpHint label="本地代理" text="本地指 Boost 服务端所在机器。添加后查询真实出口国家，成功后显示国旗；失败时显示待检测。" /></span>
        <DialogActions
          ><button
            class="secondary"
            type="button"
            :disabled="busy"
            @click="addingLocal = false"
          >
            取消</button
          ><button class="primary" :disabled="busy">
            <BoostIcon name="plug" :size="15" />添加代理
          </button></DialogActions
        >
      </form>
    </BoostDialog>
  </section>
</template>

<style scoped>
.network-workbench {
  display: grid;
  gap: 18px;
}
.local-proxy-fields {
  display: grid;
  grid-template-columns: 2fr 1fr;
  gap: 12px;
}
.kernel-path {
  overflow-wrap: anywhere;
  white-space: normal;
  font-size: 11px;
  color: var(--muted);
}
.network-toolbar {
  margin-bottom: 0;
}
.network-actions {
  margin-left: auto;
}
.network-overview {
  display: grid;
  grid-template-columns: 2fr 1fr 1fr 1.3fr;
  background: var(--surface);
  border: 1px solid var(--border);
  border-radius: 12px;
  padding: 18px 20px;
  gap: 20px;
}
.network-overview > div,
.network-core {
  min-width: 0;
  display: grid;
  gap: 10px;
  text-align: left;
}
.network-overview span,
.node-metrics span {
  color: var(--muted);
  font-size: 11px;
}
.network-overview strong {
  font-size: 14px;
  min-width: 0;
}
.network-overview strong small {
  font-weight: 400;
  color: var(--muted);
}
.network-current,
.network-core strong {
  display: flex;
  gap: 8px;
  align-items: center;
  overflow-wrap: anywhere;
}
.network-current :deep(.country-flag) {
  width: 22px;
  height: 16px;
}
.network-core {
  border: 0;
  background: none;
  color: inherit;
  padding: 0;
  cursor: pointer;
}
.network-test-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
}
.node-test-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 14px;
}
.network-message,
.network-error,
.network-footnote {
  display: flex;
  align-items: flex-start;
  gap: 8px;
  font-size: 12px;
  margin: 0;
  line-height: 1.7;
}
.network-error,
.node-error {
  color: var(--red);
}
.node-error {
  font-size: 11px;
  margin: 0;
}
.network-footnote {
  color: var(--muted);
}
.network-footnote .boost-icon {
  flex-shrink: 0;
  margin-top: 3px;
}
.node-replace {
  display: flex;
  align-items: center;
  gap: 8px;
}
.setting-row small {
  display: block;
  margin-top: 5px;
}
@media (max-width: 1200px) {
  .node-test-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
  .network-overview {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
@media (max-width: 680px) {
  .node-test-grid {
    grid-template-columns: minmax(0, 1fr);
  }
  .network-test-bar {
    flex-wrap: wrap;
  }
  .network-actions {
    flex-wrap: wrap;
  }
  .network-overview {
    gap: 18px 12px;
    padding: 16px;
  }
}
</style>
