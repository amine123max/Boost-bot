<script setup lang="ts">
import HelpHint from "./HelpHint.vue";
import DialogActions from "@/components/DialogActions.vue";
import { computed, ref } from "vue";
import BoostIcon from "./BoostIcon.vue";
import BoostDialog from "./BoostDialog.vue";
import PanelCard from "./PanelCard.vue";
import SettingsToggle from "./SettingsToggle.vue";
import { boost, copyText, notify, perform } from "@/composables/useBoost";
import { uiPreferences } from "@/composables/useUiPreferences";
import { appClient } from "@/lib/api/app-client";
import { serviceClient } from "@/lib/api/service-client";
import { isTauriRuntime } from "@/lib/api/transport";
import { redactConfiguration } from "@/lib/config-view";
import {
  codexConfigClient,
  type CodexConfig,
} from "@/lib/api/codex-config-client";
import ConfigViewer from "./ConfigViewer.vue";
import BoostConfigGuide from "./BoostConfigGuide.vue";
const guide = ref(false);
const kind = ref("");
const busy = ref(false);
const configuration = ref("");
const codexConfig = ref<CodexConfig | null>(null);
const expanded = ref(false);
const transport = ref({
  upstreamStreamTimeoutMs: boost.settings?.upstreamStreamTimeoutMs ?? 300000,
  upstreamTotalTimeoutMs: boost.settings?.upstreamTotalTimeoutMs ?? 0,
  sseKeepaliveIntervalMs: boost.settings?.sseKeepaliveIntervalMs ?? 15000,
});
const title = computed(
  () =>
    ({
      interface: "界面设置",
      transport: "传输设置",
      config: "当前配置",
      serviceConfig: "服务配置",
      environment: "环境配置",
    })[kind.value] || "高级设置",
);
async function openConfig() {
  kind.value = "config";
  busy.value = true;
  codexConfig.value = null;
  await perform(async () => {
    codexConfig.value = await codexConfigClient.read();
  });
  busy.value = false;
}
async function openServiceConfig() {
  kind.value = "serviceConfig";
  configuration.value = "";
  busy.value = true;
  await perform(async () => {
    const [settings, transport] = await Promise.all([
      appClient.getSettings(),
      serviceClient.getGatewayTransport(),
    ]);
    boost.settings = settings;
    configuration.value = JSON.stringify(
      redactConfiguration({
        settings,
        transport,
      }),
      null,
      2,
    );
  });
  busy.value = false;
}
async function openTransport() {
  kind.value = "transport";
  busy.value = true;
  await perform(async () => {
    const r = await serviceClient.getGatewayTransport();
    transport.value = {
      upstreamStreamTimeoutMs: r.upstreamStreamTimeoutMs,
      upstreamTotalTimeoutMs: r.upstreamTotalTimeoutMs,
      sseKeepaliveIntervalMs: r.sseKeepaliveIntervalMs,
    };
  });
  busy.value = false;
}
async function saveTransport() {
  busy.value = true;
  await perform(async () => {
    const r = await serviceClient.setGatewayTransport({ ...transport.value });
    if (boost.settings) {
      boost.settings.upstreamStreamTimeoutMs = r.upstreamStreamTimeoutMs;
      boost.settings.upstreamTotalTimeoutMs = r.upstreamTotalTimeoutMs;
      boost.settings.sseKeepaliveIntervalMs = r.sseKeepaliveIntervalMs;
    }
    notify("传输设置已保存");
    kind.value = "";
  });
  busy.value = false;
}
</script>
<template>
  <PanelCard title="Boost 高级设置" icon="settings"
    ><button class="setting-link" @click="guide = true">
      <span>配置方法</span><BoostIcon name="settings" :size="16" /></button
    ><button class="setting-link" @click="kind = 'interface'">
      <span>界面设置</span><BoostIcon name="settings" :size="16" /></button
    ><button class="setting-link" @click="openTransport">
      <span>传输设置</span><BoostIcon name="settings" :size="16" /></button
    ><button class="setting-link" @click="openConfig">
      <span>当前配置</span><BoostIcon name="settings" :size="16" /></button
    ><button class="setting-link" @click="openServiceConfig">
      <span>服务配置</span><BoostIcon name="settings" :size="16" /></button
    ><button class="setting-link" @click="kind = 'environment'">
      <span>环境配置</span><BoostIcon name="settings" :size="16" /></button
    ><button
      v-if="isTauriRuntime()"
      class="setting-link"
      @click="perform(() => appClient.openUpdateLogsDir())"
    >
      <span>更新日志目录</span
      ><BoostIcon name="folder-open" :size="16" /></button
  ></PanelCard>
  <BoostConfigGuide v-if="guide" @close="guide = false" />
  <BoostDialog
    v-if="kind"
    :title="title"
    wide
    :editor="kind === 'config'"
    :expanded="expanded"
    :busy="busy" @close="!busy && (kind = '')"
  >
    <template v-if="kind === 'config'" #title-extra
      ><span class="badge">只读 · config.toml</span></template
    >
    <template v-if="kind === 'interface'"
      ><SettingsToggle
        label="流量图表"
        :model-value="uiPreferences.showTrafficChart"
        @update:model-value="uiPreferences.showTrafficChart = $event"
      /><SettingsToggle
        label="内核占用"
        :model-value="uiPreferences.showKernelUsage"
        @update:model-value="uiPreferences.showKernelUsage = $event"
      /><SettingsToggle
        label="隐藏窗口时暂停采集"
        :model-value="uiPreferences.pauseWhenHidden"
        @update:model-value="uiPreferences.pauseWhenHidden = $event"
      /><SettingsToggle
        label="收起导航栏"
        :model-value="uiPreferences.compactSidebar"
        @update:model-value="uiPreferences.compactSidebar = $event"
      />
      <div class="setting-row">
        <span>界面密度</span
        ><select v-model="uiPreferences.density" aria-label="界面密度">
          <option value="compact">紧凑</option>
          <option value="comfortable">舒适</option>
        </select>
      </div>
      <DialogActions>
        <button class="primary" @click="kind = ''">完成</button>
      </DialogActions></template
    >
    <form
      v-else-if="kind === 'transport'"
      class="form-stack"
      @submit.prevent="saveTransport"
    >
      <label class="form-field"
        >流式响应超时（毫秒）<input
          v-model="transport.upstreamStreamTimeoutMs"
          type="number"
          min="0"
          step="1000"
          required /></label
      ><label class="form-field"
        ><span>请求总超时（毫秒）<HelpHint label="请求总超时" text="0 表示不限制。" /></span><input aria-label="请求总超时（毫秒）"
          v-model="transport.upstreamTotalTimeoutMs"
          type="number"
          min="0"
          step="1000"
          required
        /></label
      ><label class="form-field"
        >SSE 保活间隔（毫秒）<input
          v-model="transport.sseKeepaliveIntervalMs"
          type="number"
          min="0"
          step="1000"
          required
      /></label>
      <DialogActions>
        <button data-dialog-close
          type="button"
          class="secondary"
          :disabled="busy"
          @click="kind = ''"
        >
          取消</button
        ><button class="primary" :disabled="busy">保存设置</button>
      </DialogActions>
    </form>
    <template v-else-if="kind === 'serviceConfig'"
      ><div v-if="busy" class="loading-line">
        <BoostIcon name="loader-circle" class="spinning" />读取中…
      </div>
      <template v-else>
        <textarea
          class="config-code"
          aria-label="服务配置 JSON"
          :value="configuration"
          readonly
          spellcheck="false"
        />
        <DialogActions>
          <button class="secondary" @click="openServiceConfig">
            <BoostIcon name="rotate-ccw" :size="14" />刷新</button
          ><button
            class="primary"
            :disabled="!configuration"
            @click="perform(() => copyText(configuration))"
          >
            <BoostIcon name="copy" :size="14" />复制配置
          </button>
        </DialogActions></template
      ></template
    >
    <template v-else-if="kind === 'config'"
      ><div v-if="busy" class="loading-line">
        <BoostIcon name="loader-circle" class="spinning" />读取 config.toml…
      </div>
      <template v-else-if="codexConfig"
        ><div class="config-filepath">{{ codexConfig.path }}</div>
        <ConfigViewer
          v-if="codexConfig.exists"
          :content="codexConfig.content"
          :path="codexConfig.path"
        />
        <div v-else class="hint">未找到 config.toml</div></template
      ></template
    >
    <template v-else-if="kind === 'environment'"
      ><p v-if="!boost.settings?.envOverrideCatalog.length" class="muted">
        暂无环境配置
      </p>
      <div
        v-for="item in boost.settings?.envOverrideCatalog"
        :key="item.key"
        class="environment-row"
      >
        <code>{{ item.key }}</code>
        <div class="detail-line">
          <span>{{ item.label }}</span
          ><span class="badge">{{ item.applyMode }}</span>
        </div>
        <div class="credential-box">
          {{
            redactConfiguration(
              boost.settings?.envOverrides[item.key] ?? item.defaultValue,
              item.key,
            ) || "未设置"
          }}
        </div>
      </div>
      <DialogActions>
        <button data-dialog-close class="primary" @click="kind = ''">关闭</button>
      </DialogActions></template
    >
    <template v-if="kind === 'config'" #footer
      ><button
        class="icon-button"
        aria-label="切换配置全屏"
        @click="expanded = !expanded"
      >
        <BoostIcon name="arrow-up-right" />
      </button>
      <DialogActions>
        <button class="secondary" :disabled="busy" @click="openConfig">
          刷新</button
        ><button
          class="secondary"
          :disabled="!codexConfig?.exists"
          @click="perform(() => copyText(codexConfig!.content))"
        >
          复制</button
        ><button data-dialog-close class="primary" :disabled="busy" @click="kind = ''">
          关闭
        </button>
      </DialogActions></template
    >
  </BoostDialog>
</template>
