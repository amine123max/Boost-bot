<script setup lang="ts">
import { ref, watch, nextTick } from "vue";
import { useRoute, useRouter } from "vue-router";
import type { AppSettingsPatch } from "@/lib/api/app-client";
import BoostIcon from "@/components/BoostIcon.vue";
import PanelCard from "@/components/PanelCard.vue";
import SettingsToggle from "@/components/SettingsToggle.vue";
import AdvancedSettings from "@/components/AdvancedSettings.vue";
import TypographySettings from "@/components/TypographySettings.vue";
import ThemeColorSettings from "@/components/ThemeColorSettings.vue";
import BotAppearanceSettings from '@/components/BotAppearanceSettings.vue';
import BoostBotAvatar from '@/components/BoostBotAvatar.vue';
import AppUpdatePanel from '@/components/AppUpdatePanel.vue';
import { version as appVersion } from '../../package.json';
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
watch(() => route.query.tab, async tab => {
  if (tab === 'bot') { await nextTick(); document.getElementById('bot-appearance')?.scrollIntoView({ block: 'center' }); }
}, { immediate: true });
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
const address = ref(boost.settings?.serviceAddr || "localhost:48760");
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
  <div v-if="boost.settings">
    <div class="settings-grid">
      <div class="settings-column">
        <PanelCard title="系统设置" icon="monitor"
          ><SettingsToggle
            label="关闭后最小化到托盘"
            description="保留服务在后台运行"
            :model-value="boost.settings.closeToTrayOnClose"
            :disabled="busy || !isAdmin || !boost.settings.closeToTraySupported"
            @update:model-value="patch({ closeToTrayOnClose: $event })"
          /><SettingsToggle
            label="后台轻量模式"
            description="隐藏窗口后减少前端资源占用"
            :model-value="boost.settings.lightweightModeOnCloseToTray"
            :disabled="busy || !isAdmin || !isTauriRuntime()"
            @update:model-value="
              patch({ lightweightModeOnCloseToTray: $event })
            "
          /><SettingsToggle
            label="自动检查更新"
            description="桌面版启动时检查，此后每 24 小时检查一次"
            :model-value="boost.settings.updateAutoCheck"
            :disabled="busy || !isAdmin || !isTauriRuntime()"
            @update:model-value="patch({ updateAutoCheck: $event })"
          />
          <div class="setting-row">
            <span class="setting-label">运行环境</span
            ><span class="badge">{{
              isTauriRuntime() ? "桌面客户端" : "Web 服务"
            }}</span>
          </div></PanelCard
        >

        <AppUpdatePanel v-if="isTauriRuntime()" />
        <PanelCard v-if="isAdmin" title="服务设置" icon="database"
          ><div class="setting-row">
            <div class="setting-label">
              账号路由
              <p>自动选择时的调度策略</p>
            </div>
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
          </div>
          <SettingsToggle
            label="额度保护"
            description="跳过剩余额度过低的账号"
            :model-value="boost.settings.quotaGuard.enabled"
            :disabled="busy"
            @update:model-value="
              patch({
                quotaGuard: { ...boost.settings!.quotaGuard, enabled: $event },
              })
            "
          />
          <div class="setting-row">
            <div class="setting-label">
              单账号并发上限
              <p>0 表示不限制</p>
            </div>
            <div class="row">
              <input
                v-model="concurrency"
                type="number"
                min="0"
                max="10000"
                aria-label="单账号并发上限"
              /><button
                class="icon-button"
                :disabled="busy"
                aria-label="保存并发上限"
                @click="patch({ accountMaxInflight: Number(concurrency) })"
              >
                <BoostIcon name="check" :size="16" />
              </button>
            </div>
          </div>
          <div class="setting-row">
            <span class="setting-label">监听范围</span
            ><select
              :value="boost.settings.serviceListenMode"
              :disabled="busy"
              aria-label="监听范围"
              @change="changeListen"
            >
              <option value="loopback">仅本机</option>
              <option value="all_interfaces">局域网</option>
            </select>
          </div>
          <form
            v-if="isTauriRuntime()"
            class="form-stack"
            style="margin-top: 16px"
            @submit.prevent="saveAddress"
          >
            <label class="form-field"
              >本地服务地址<input
                v-model="address"
                required
                placeholder="localhost:48760" /></label
            ><button class="secondary" :disabled="busy">保存地址</button>
          </form></PanelCard
        >
        <PanelCard v-if="isAdmin" title="后台任务" icon="rotate-ccw"
          ><SettingsToggle
            label="自动刷新用量"
            description="定期同步账号额度"
            :model-value="boost.settings.backgroundTasks.usagePollingEnabled"
            :disabled="busy"
            @update:model-value="
              patch({ backgroundTasks: { usagePollingEnabled: $event } })
            " /><SettingsToggle
            label="自动刷新授权"
            description="保持账号登录状态"
            :model-value="
              boost.settings.backgroundTasks.tokenRefreshPollingEnabled
            "
            :disabled="busy"
            @update:model-value="
              patch({ backgroundTasks: { tokenRefreshPollingEnabled: $event } })
            " /><SettingsToggle
            label="网关保活"
            :model-value="
              boost.settings.backgroundTasks.gatewayKeepaliveEnabled
            "
            :disabled="busy"
            @update:model-value="
              patch({ backgroundTasks: { gatewayKeepaliveEnabled: $event } })
            "
        /></PanelCard>
      </div>
      <div class="settings-column">

        <PanelCard title="Boost 基础设置" icon="settings"
          ><div class="setting-row">
            <div class="setting-label">界面语言</div>
            <span class="badge">简体中文</span>
          </div>
          <div class="setting-row">
            <span class="setting-label">主题模式</span>
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
          </div>
          <ThemeColorSettings />
          <div class="setting-row">
            <span class="setting-label">当前权限</span
            ><span class="badge">{{ isAdmin ? "管理员" : "成员" }}</span>
          </div></PanelCard
        >
        <TypographySettings />
        <PanelCard id="bot-appearance" title="智能体外观" icon="sparkles"><BotAppearanceSettings /></PanelCard>
        <PanelCard v-if="isAdmin" title="模型转发" icon="arrow-up-right"
          ><form
            class="form-stack"
            @submit.prevent="patch({ modelForwardRules: forwardRules })"
          >
            <label class="form-field"
              >模型映射规则<textarea
                v-model="forwardRules"
                spellcheck="false"
                placeholder="模型转发规则"
              /><small
                >沿用服务端模型转发规则格式。修改后将影响请求路由。</small
              ></label
            >
            <div class="form-actions">
              <button class="primary" :disabled="busy">保存规则</button>
            </div>
          </form></PanelCard
        >
        <AdvancedSettings v-if="isAdmin" />
        <PanelCard title="关于 Boost" icon="info"
          ><div class="row" style="margin-bottom: 18px">
            <BoostBotAvatar :size="48" />
            <div>
              <h3 style="font-size: calc(13px * var(--font-scale))">
                Boost
                <small class="muted" style="font-weight: var(--ui-body-weight)"
                  >{{ appVersion }}</small
                >
              </h3>
              <p class="card-subtitle">轻巧、专注的 AI 服务管理工具</p>
            </div>
          </div>
          <div class="detail-line"><span>版本</span><strong>{{ appVersion }}</strong></div>
          <div class="detail-line">
            <span>服务状态</span
            ><strong>{{ boost.connected ? "已连接" : "未连接" }}</strong>
          </div></PanelCard
        >
      </div>
    </div>
  </div>
</template>
