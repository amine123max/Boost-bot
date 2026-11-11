<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import PanelCard from "./PanelCard.vue";
import BoostIcon from "./BoostIcon.vue";
import CountryFlag from "./CountryFlag.vue";
import { useTelemetry, formatBytes } from "@/composables/useTelemetry";
import { boost, formatTime, notify } from "@/composables/useBoost";
import { telemetryClient, type NetworkInfo } from "@/lib/api/telemetry-client";
import { getAppErrorMessage, isTauriRuntime } from "@/lib/api/transport";
const { telemetry } = useTelemetry();
const ip = ref<NetworkInfo | null>(null);
const busy = ref(false);
const error = ref("");
const revealed = ref(false);
async function load(refresh = false) {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    ip.value = await telemetryClient.networkInfo(refresh);
  } catch (e) {
    ip.value = null;
    error.value = getAppErrorMessage(e);
    notify(error.value, true);
  } finally {
    busy.value = false;
  }
}
onMounted(() => load());
const uptime = computed(() => {
  const seconds = telemetry.value?.uptimeSeconds;
  return seconds == null
    ? "—"
    : `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
});
</script>
<template>
  <div class="two-columns">
    <PanelCard title="IP 信息" icon="map-pin"
      ><template #actions
        ><span class="badge" v-if="ip">{{
          ip.viaProxy ? "代理出口" : "直连出口"
        }}</span
        ><button
          class="icon-button"
          aria-label="刷新 IP 信息"
          :disabled="busy"
          @click="load(true)"
        >
          <BoostIcon
            name="rotate-ccw"
            :size="17"
            :class="{ spinning: busy }"
          /></button
      ></template>
      <p v-if="busy && !ip" class="muted" style="padding: 16px 0">查询中…</p>
      <p v-else-if="error" class="muted">暂不可用</p>
      <template v-else-if="ip"
        ><div class="country-heading">
          <CountryFlag :code="ip.countryCode" :country="ip.country" /><strong>{{
            ip.country || ip.countryCode
          }}</strong>
        </div>
        <div class="detail-line">
          <span>IP</span>
          <div class="row">
            <strong class="mono">{{ revealed ? ip.ip : "••••••••••••" }}</strong
            ><button
              class="icon-button"
              :aria-label="revealed ? '隐藏 IP' : '显示 IP'"
              @click="revealed = !revealed"
            >
              <BoostIcon :name="revealed ? 'eye-off' : 'eye'" :size="15" />
            </button>
          </div>
        </div>
        <div class="detail-line">
          <span>位置</span
          ><strong>{{
            [ip.country, ip.city].filter(Boolean).join(" · ") || "—"
          }}</strong>
        </div>
        <div class="detail-line">
          <span>服务商</span
          ><strong>{{ ip.isp || ip.organization || "—" }}</strong>
        </div>
        <div class="detail-line">
          <span>自治域</span><strong>{{ ip.asn ? "AS" + ip.asn : "—" }}</strong>
        </div>
        <div class="detail-line">
          <span>时区</span><strong>{{ ip.timezone || "—" }}</strong>
        </div></template
      ></PanelCard
    ><PanelCard title="系统信息" icon="monitor"
      ><div class="detail-line">
        <span>操作系统</span><strong>{{ telemetry?.os || "—" }}</strong>
      </div>
      <div class="detail-line">
        <span>架构</span><strong>{{ telemetry?.architecture || "—" }}</strong>
      </div>
      <div class="detail-line">
        <span>处理器</span
        ><strong
          class="truncate"
          :title="telemetry?.cpuModel"
          style="max-width: 65%"
          >{{ telemetry?.cpuModel || "—" }}</strong
        >
      </div>
      <div class="detail-line">
        <span>逻辑核心</span
        ><strong>{{ telemetry?.logicalCores ?? "—" }}</strong>
      </div>
      <div class="detail-line">
        <span>系统内存</span
        ><strong>{{ formatBytes(telemetry?.systemMemoryBytes) }}</strong>
      </div>
      <div class="detail-line">
        <span>内核 CPU</span
        ><strong>{{
          telemetry?.cpuPercent == null
            ? "—"
            : telemetry.cpuPercent.toFixed(1) + "%"
        }}</strong>
      </div></PanelCard
    ><PanelCard title="Boost 信息" icon="info"
      ><div class="detail-line">
        <span>版本</span
        ><strong>{{
          telemetry?.version ? "v" + telemetry.version : "—"
        }}</strong>
      </div>
      <div class="detail-line">
        <span>运行时间</span><strong>{{ uptime }}</strong>
      </div>
      <div class="detail-line">
        <span>进程</span><strong>{{ telemetry?.processId ?? "—" }}</strong>
      </div>
      <div class="detail-line">
        <span>运行模式</span
        ><strong>{{ isTauriRuntime() ? "桌面" : "Web" }}</strong>
      </div>
      <div class="detail-line">
        <span>接入规则</span><strong>{{ boost.keys.length }}</strong>
      </div></PanelCard
    ><PanelCard title="服务状态" icon="database"
      ><div class="detail-line">
        <span>订阅账号</span><strong>{{ boost.accounts.length }}</strong>
      </div>
      <div class="detail-line">
        <span>上游链接</span><strong>{{ boost.connections.length }}</strong>
      </div>
      <div class="detail-line">
        <span>额度保护</span
        ><strong>{{
          boost.settings?.quotaGuard.enabled ? "已开启" : "已关闭"
        }}</strong>
      </div>
      <div class="detail-line">
        <span>监听范围</span
        ><strong>{{
          boost.settings?.serviceListenMode === "all_interfaces"
            ? "局域网"
            : "仅本机"
        }}</strong>
      </div>
      <div class="detail-line">
        <span>IP 更新</span><strong>{{ formatTime(ip?.queriedAt) }}</strong>
      </div></PanelCard
    >
  </div>
</template>
