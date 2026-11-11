<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useRoute } from "vue-router";
import BoostIcon from "./components/BoostIcon.vue";
import BoostBotAvatar from './components/BoostBotAvatar.vue';
import BoostStartup from './components/BoostStartup.vue';
import { prepareBotLaunch } from './composables/useBotLaunch';
import BoostDialog from "./components/BoostDialog.vue";
import NotificationCenter from "./components/NotificationCenter.vue";
import AppUpdateNotice from "./components/AppUpdateNotice.vue";
import { version as appVersion } from "../package.json";
import { useAutomaticAppUpdates } from "./composables/useAppUpdates";
import {
  boost,
  initialize,
  isAdmin,
  refreshData,
} from "./composables/useBoost";
import { useTelemetry } from "./composables/useTelemetry";
import { uiPreferences } from "./composables/useUiPreferences";
import SidebarTraffic from "./components/SidebarTraffic.vue";
import { useLiveUsage } from "./composables/useLiveUsage";
import { useStartupReady, startupContentReady } from "./composables/useStartupReady";
useLiveUsage();
const { telemetry, error: telemetryError, upload, download } = useTelemetry();
const route = useRoute();
if (!route.path.startsWith("/tray-preview")) useAutomaticAppUpdates();
const startupReady = useStartupReady(() =>
  route.path.startsWith("/bot/") || route.path === "/bot"
    ? startupContentReady.value
    : boost.ready,
);
const about = ref(false);
const navigation = [
  { path: "/home/", title: "首页", icon: "layout-dashboard" },
  { path: "/accounts/", title: "账号管理", icon: "users-round" },
  { path: "/aggregate-api/", title: "聚合API", icon: "network", admin: true },
  { path: "/apikeys/", title: "密钥", icon: "key-round" },
  { path: "/logs/", title: "日志", icon: "scroll-text" },
  { path: "/tests/", title: "测试", icon: "flask-conical" },
  { path: "/models/", title: "模型", icon: "boxes" },
  { path: "/settings/", title: "设置", icon: "settings" },
];
const refreshing = ref(false);
async function refresh() {
  refreshing.value = true;
  try {
    if (!boost.connected) await initialize();
    else await refreshData();
  } finally {
    refreshing.value = false;
  }
}
onMounted(initialize);
</script>
<template>
  <RouterView v-if="route.path.startsWith('/tray-preview')" />
  <RouterView v-else-if="route.path.startsWith('/bot/') || route.path === '/bot'" />
  <div
    v-else
    class="app-shell"
    :class="{ 'sidebar-collapsed': uiPreferences.compactSidebar, 'app-booting': !startupReady }"
  >
    <aside class="sidebar">
      <RouterLink class="brand" to="/bot/" aria-label="Boost 智能体" @click="prepareBotLaunch($event, route.fullPath)"
        ><BoostBotAvatar ambient /><span
          class="brand-word"
          >Boost</span
        ></RouterLink
      >
      <nav aria-label="主导航">
        <RouterLink
          v-for="item in navigation.filter((n) => !n.admin || isAdmin)"
          :key="item.path"
          :to="item.path"
          :aria-label="item.title"
          class="nav-item"
          :class="{
            active:
              item.path === '/home/'
                ? route.path === '/' || route.path.replace(/\/$/, '') === '/home'
                : route.path.startsWith(item.path.replace(/\/$/, '')),
          }"
          ><BoostIcon :name="item.icon" /><span>{{
            item.title
          }}</span></RouterLink
        >
      </nav>
      <div class="sidebar-bottom">
        <SidebarTraffic />
        <div
          class="port-metrics"
          :title="
            telemetryError ||
            '当前服务端口的 API 数据流量，不含管理轮询和协议开销'
          "
        >
          <div class="port-metric" aria-label="上行速度">
            <BoostIcon name="arrow-up" :size="16" /><strong
              class="upload-rate"
              >{{ upload.value }}</strong
            ><span>{{ upload.unit }}</span>
          </div>
          <div class="port-metric" aria-label="下行速度">
            <BoostIcon name="arrow-down" :size="16" /><strong
              class="download-rate"
              >{{ download.value }}</strong
            ><span>{{ download.unit }}</span>
          </div>
          <div
            v-if="uiPreferences.showKernelUsage"
            class="port-metric"
            aria-label="内核内存占用"
            :title="
              telemetry
                ? `服务进程 ${telemetry.processId} · CPU ${telemetry.cpuPercent?.toFixed(1) ?? '—'}%`
                : telemetryError || '等待内核数据'
            "
          >
            <BoostIcon name="cpu" :size="17" /><strong>{{
              telemetry?.memoryBytes == null
                ? "—"
                : (telemetry.memoryBytes / 1048576).toFixed(1)
            }}</strong
            ><span>MB</span>
          </div>
        </div>
      </div>
    </aside>
    <div class="workspace">
      <header class="topbar" data-tauri-drag-region>
        <div class="page-heading">
          <h1>{{ route.meta.title }}</h1>
        </div>
        <div class="topbar-actions">
          <button
            class="icon-button"
            aria-label="刷新数据"
            :disabled="refreshing || boost.loading"
            @click="refresh"
          >
            <span v-if="refreshing && boost.ready" class="boost-loading-ring refresh-ring" aria-hidden="true" />
            <BoostIcon v-else name="rotate-ccw" /></button
          ><button
            class="icon-button"
            aria-label="帮助与关于"
            @click="about = true"
          >
            <BoostIcon name="circle-help" /></button
          ><RouterLink class="icon-button" to="/settings/" aria-label="系统设置"
            ><BoostIcon name="settings"
          /></RouterLink>
        </div>
      </header>
      <main id="main-content" class="page-content">
        <RouterView v-if="boost.ready" v-slot="{ Component }"
          ><KeepAlive><component :is="Component" /></KeepAlive
        ></RouterView>
        <div v-else-if="!boost.loading" class="disconnected">
          <BoostIcon name="plug" :size="42" />
          <h2>连接你的 Boost 服务</h2>
          <p>桌面版会自动启动本地服务。Web 版请通过 Boost Web 地址访问。</p>
          <button class="primary" @click="initialize">
            <BoostIcon name="rotate-ccw" :size="16" />重新连接
          </button>
        </div>
      </main>
    </div>
    <NotificationCenter />
    <BoostDialog v-if="about" title="关于 Boost" @close="about = false"
      ><div class="about-brand">
        <BoostBotAvatar :size="80" />
        <h2>Boost <small>{{ appVersion }}</small></h2>
        <p>轻巧、专注的 AI 服务管理工具</p>
      </div>
      <div class="hint">统一管理账号、聚合 API、平台密钥与模型。</div>
      <button class="primary full-width" @click="about = false">
        开始使用
      </button></BoostDialog
    >
  </div>
  <BoostStartup v-if="!startupReady && !route.path.startsWith('/bot') && !route.path.startsWith('/tray-preview')" :error="!boost.loading ? boost.error : ''" @retry="initialize" />
  <AppUpdateNotice v-if="!route.path.startsWith('/tray-preview')" />
</template>
<style>
.app-booting { visibility: hidden; }
.refresh-ring { width: 18px; height: 18px; border-width: 2px; }
</style>
