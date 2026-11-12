<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { AppSettingsPatch } from "@/lib/api/app-client";
import TrayDisplaySettings from "@/components/TrayDisplaySettings.vue";
import SettingControl from "@/components/SettingControl.vue";
import HelpHint from "@/components/HelpHint.vue";
import GitHubLink from "@/components/GitHubLink.vue";
import PanelCard from "@/components/PanelCard.vue";
import SettingsToggle from "@/components/SettingsToggle.vue";
import AdvancedSettings from "@/components/AdvancedSettings.vue";
import TypographySettings from "@/components/TypographySettings.vue";
import ThemeColorSettings from "@/components/ThemeColorSettings.vue";
import BotAppearanceSettings from "@/components/BotAppearanceSettings.vue";
import BoostBotAvatar from "@/components/BoostBotAvatar.vue";
import AppUpdatePanel from "@/components/AppUpdatePanel.vue";
import { version as appVersion } from "../../package.json";
import {
  boost,
  isAdmin,
  notify,
  perform,
  saveSettings,
} from "@/composables/useBoost";
import { serviceClient } from "@/lib/api/service-client";
import { isTauriRuntime } from "@/lib/api/transport";
const route = useRoute();
const router = useRouter();
watch(
  () => route.query.tab,
  async (tab) => {
    if (tab === "bot") {
      await nextTick();
      document
        .getElementById("bot-appearance")
        ?.scrollIntoView({ block: "center" });
    }
  },
  { immediate: true },
);
watch(
  () => route.query.tab,
  (tab) => {
    if (tab === "models" || tab === "prices")
      router.replace({
        path: "/models/",
        query: tab === "prices" ? { tab: "prices" } : {},
      });
  },
  { immediate: true },
);
const busy = ref(false);
const address = ref(boost.settings?.serviceAddr || "localhost:12580");
const concurrency = ref(boost.settings?.accountMaxInflight ?? 1);
const forwardRules = ref(boost.settings?.modelForwardRules || "");
watch(
  () => boost.settings,
  (settings) => {
    if (settings) {
      address.value = settings.serviceAddr;
      concurrency.value = settings.accountMaxInflight;
      forwardRules.value = settings.modelForwardRules;
    }
  },
);
async function patch(value: AppSettingsPatch, event?: MouseEvent) {
  const bounds =
    event?.currentTarget instanceof HTMLElement
      ? event.currentTarget.getBoundingClientRect()
      : null;
  const origin = bounds
    ? { x: bounds.left + bounds.width / 2, y: bounds.top + bounds.height / 2 }
    : undefined;
  busy.value = true;
  await perform(() => saveSettings(value, origin));
  busy.value = false;
}
async function changeListen(event: Event) {
  busy.value = true;
  const target = event.target as HTMLSelectElement;
  const previous = boost.settings?.serviceListenMode || "loopback";
  const success = await perform(async () => {
    const r = await serviceClient.setListenConfig(target.value);
    if (boost.settings) boost.settings.serviceListenMode = r.mode;
    notify(
      r.requiresRestart ? "监听设置已保存，重启服务后生效" : "监听设置已保存",
    );
    return true;
  });
  if (!success) target.value = previous;
  busy.value = false;
}
async function saveAddress() {
  if (
    !/^(localhost|[\w.-]+|\[[0-9a-f:]+\]):\d{1,5}$/i.test(address.value.trim())
  ) {
    notify("请输入 host:port 格式的服务地址", true);
    return;
  }
  const port = Number(address.value.split(":").at(-1));
  if (port < 1 || port > 65535) {
    notify("端口范围为 1–65535", true);
    return;
  }
  await patch({ serviceAddr: address.value.trim() });
  notify("服务地址已保存，重新连接后生效");
}
</script>
<template>
  <div v-if="boost.settings" class="settings-grid">
    <div class="settings-column">
      <PanelCard title="系统设置" icon="monitor">
        <SettingControl
          v-if="isTauriRuntime()"
          label="关闭主窗口时"
          description="记住的选择可在此修改；选择每次询问可恢复关闭确认。"
          :value="
            boost.settings.mainWindowCloseAction === 'ask'
              ? '每次询问'
              : boost.settings.mainWindowCloseAction === 'exit'
                ? '退出'
                : '最小化'
          "
        >
          <select
            aria-label="关闭主窗口时"
            :value="
              boost.settings.mainWindowCloseAction === 'floating'
                ? 'minimize'
                : boost.settings.mainWindowCloseAction
            "
            :disabled="busy || !isAdmin"
            @change="
              patch({
                mainWindowCloseAction: ($event.target as HTMLSelectElement)
                  .value as AppSettingsPatch['mainWindowCloseAction'],
              })
            "
          >
            <option value="ask">每次询问</option>
            <option value="minimize">最小化</option>
            <option value="exit">退出</option>
          </select>
        </SettingControl>
        <SettingsToggle
          label="自动检查更新"
          description="桌面版启动时检查，此后每 24 小时检查一次。"
          :model-value="boost.settings.updateAutoCheck"
          :disabled="busy || !isAdmin || !isTauriRuntime()"
          @update:model-value="patch({ updateAutoCheck: $event })"
        />
        <div class="setting-row">
          <span>运行环境</span
          ><span class="badge">{{
            isTauriRuntime() ? "桌面客户端" : "Web 服务"
          }}</span>
        </div>
      </PanelCard>
      <PanelCard title="悬浮窗" icon="monitor"
        ><SettingControl label="显示内容"
          ><TrayDisplaySettings /></SettingControl
      ></PanelCard>
      <AppUpdatePanel v-if="isTauriRuntime()" />
      <PanelCard v-if="isAdmin" title="服务设置" icon="database">
        <SettingControl
          label="账号路由"
          description="自动选择账号时使用的调度策略。"
          :value="
            (
              {
                ordered: '顺序优先',
                balanced: '均衡分配',
                quota_priority: '剩余额度最高',
              } as Record<string, string>
            )[boost.settings.routeStrategy]
          "
        >
          <select
            :value="boost.settings.routeStrategy"
            :disabled="busy"
            aria-label="账号路由"
            @change="
              patch({
                routeStrategy: ($event.target as HTMLSelectElement).value,
              })
            "
          >
            <option value="ordered">顺序优先</option>
            <option value="balanced">均衡分配</option>
            <option value="quota_priority">剩余额度最高</option>
          </select>
        </SettingControl>
        <SettingsToggle
          label="额度保护"
          description="跳过剩余额度过低的账号。"
          :model-value="boost.settings.quotaGuard.enabled"
          :disabled="busy"
          @update:model-value="
            patch({
              quotaGuard: { ...boost.settings!.quotaGuard, enabled: $event },
            })
          "
        />
        <SettingControl
          label="单账号并发上限"
          description="0 表示不限制。"
          :value="String(boost.settings.accountMaxInflight)"
        >
          <form
            class="form-stack"
            @submit.prevent="patch({ accountMaxInflight: Number(concurrency) })"
          >
            <input
              v-model="concurrency"
              type="number"
              min="0"
              max="10000"
              aria-label="单账号并发上限"
            /><button class="secondary" :disabled="busy">保存并发上限</button>
          </form>
        </SettingControl>
        <SettingControl
          label="监听范围"
          :value="
            boost.settings.serviceListenMode === 'loopback'
              ? '仅本机'
              : '局域网'
          "
        >
          <select
            :value="boost.settings.serviceListenMode"
            :disabled="busy"
            aria-label="监听范围"
            @change="changeListen"
          >
            <option value="loopback">仅本机</option>
            <option value="all_interfaces">局域网</option>
          </select>
        </SettingControl>
        <SettingControl
          v-if="isTauriRuntime()"
          label="本地服务地址"
          :value="boost.settings.serviceAddr"
        >
          <form class="form-stack" @submit.prevent="saveAddress">
            <input
              v-model="address"
              required
              aria-label="本地服务地址"
              placeholder="localhost:12580"
            /><button class="secondary" :disabled="busy">保存地址</button>
          </form>
        </SettingControl>
      </PanelCard>
      <PanelCard v-if="isAdmin" title="后台任务" icon="rotate-ccw">
        <SettingsToggle
          label="自动刷新用量"
          description="定期同步账号额度。"
          :model-value="boost.settings.backgroundTasks.usagePollingEnabled"
          :disabled="busy"
          @update:model-value="
            patch({ backgroundTasks: { usagePollingEnabled: $event } })
          "
        />
        <SettingsToggle
          label="自动刷新授权"
          description="保持账号登录状态。"
          :model-value="
            boost.settings.backgroundTasks.tokenRefreshPollingEnabled
          "
          :disabled="busy"
          @update:model-value="
            patch({ backgroundTasks: { tokenRefreshPollingEnabled: $event } })
          "
        />
        <SettingsToggle
          label="网关保活"
          :model-value="boost.settings.backgroundTasks.gatewayKeepaliveEnabled"
          :disabled="busy"
          @update:model-value="
            patch({ backgroundTasks: { gatewayKeepaliveEnabled: $event } })
          "
        />
      </PanelCard>
    </div>
    <div class="settings-column">
      <PanelCard title="Boost 基础设置" icon="settings">
        <div class="setting-row">
          <span>界面语言</span><span class="badge">简体中文</span>
        </div>
        <SettingControl
          label="主题模式"
          :value="
            boost.settings.theme === 'business'
              ? '浅色'
              : boost.settings.theme === 'dark'
                ? '深色'
                : '系统'
          "
        >
          <div v-spring-switch class="segmented">
            <button
              v-for="item in [
                { value: 'business', label: '浅色' },
                { value: 'dark', label: '深色' },
                { value: 'tech', label: '系统' },
              ]"
              :key="item.value"
              :class="{ selected: boost.settings.theme === item.value }"
              :disabled="busy || !isAdmin"
              @click="patch({ theme: item.value }, $event)"
            >
              {{ item.label }}
            </button>
          </div>
          <ThemeColorSettings />
        </SettingControl>
        <SettingControl label="文字显示"><TypographySettings /></SettingControl>
        <div class="setting-row">
          <span>当前权限</span
          ><span class="badge">{{ isAdmin ? "管理员" : "成员" }}</span>
        </div>
      </PanelCard>
      <PanelCard v-if="isTauriRuntime()" title="任务监测" icon="activity"
        ><div class="setting-row">
          <span
            >本机任务<HelpHint
              label="本机任务"
              text="读取 Codex、Claude Code 和 DeepSeek Harness 的本地日志，不修改客户端配置。进度兼容 Pacer 已成功上报的估计；未上报时显示不定进度，完成后显示 100%。" /></span
          ><span class="badge">只读</span>
        </div>
        <div class="detail-line">
          <span>来源</span><span>Codex / Claude / DeepSeek</span>
        </div></PanelCard
      >
      <PanelCard id="bot-appearance" title="智能体外观" icon="sparkles"
        ><SettingControl label="外观设置"
          ><BotAppearanceSettings /></SettingControl
      ></PanelCard>
      <PanelCard v-if="isAdmin" title="模型转发" icon="arrow-up-right">
        <SettingControl
          label="模型映射规则"
          description="沿用服务端模型转发规则格式，修改后影响请求路由。"
        >
          <form
            class="form-stack"
            @submit.prevent="patch({ modelForwardRules: forwardRules })"
          >
            <textarea
              v-model="forwardRules"
              aria-label="模型映射规则"
              spellcheck="false"
              placeholder="模型转发规则"
            /><button class="secondary" :disabled="busy">保存规则</button>
          </form>
        </SettingControl>
      </PanelCard>
      <AdvancedSettings v-if="isAdmin" />
      <PanelCard title="关于 Boost" icon="info"
        ><template #actions><GitHubLink /></template>
        <div class="about-summary">
          <BoostBotAvatar :size="48" /><span
            >Boost <span class="muted">{{ appVersion }}</span></span
          ><HelpHint
            label="Boost"
            text="统一管理账号、聚合 API、平台密钥与模型。"
          />
        </div>
        <div class="detail-line">
          <span>服务状态</span
          ><strong>{{ boost.connected ? "已连接" : "未连接" }}</strong>
        </div>
      </PanelCard>
    </div>
  </div>
</template>
<style scoped>
.about-summary {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}
</style>
