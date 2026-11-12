<script setup lang="ts">
import { computed } from "vue";
import PanelCard from "./PanelCard.vue";
import BoostIcon from "./BoostIcon.vue";
import { useTelemetry, formatRate } from "@/composables/useTelemetry";
const { telemetry, history, upload, download } = useTelemetry();
const end = computed(() => history.value.at(-1)?.at || Date.now());
const max = computed(() =>
  Math.max(1024, ...history.value.flatMap((p) => [p.upload, p.download])),
);
function path(direction: "upload" | "download") {
  return history.value
    .map(
      (point, i) =>
        `${i ? "L" : "M"}${Math.max(0, (point.at - (end.value - 600000)) / 600000) * 700},${130 - (point[direction] / max.value) * 110}`,
    )
    .join(" ");
}
const stats = computed(() => [
  {
    label: "上传速度",
    icon: "arrow-up",
    value: upload.value.value,
    unit: upload.value.unit,
    tone: "gold-text",
    kind: "upload",
  },
  {
    label: "下载速度",
    icon: "arrow-down",
    value: download.value.value,
    unit: download.value.unit,
    tone: "blue-text",
    kind: "download",
  },
  {
    label: "活跃连接",
    icon: "link",
    hint: "当前并发 API 请求数，不含空闲 TCP 连接",
    value: telemetry.value?.activeRequests ?? "—",
    unit: "",
    tone: "green-text",
    kind: "active",
  },
  {
    label: "上传量",
    icon: "cloud-upload",
    value: formatRate(telemetry.value?.uploadedBytes).value,
    unit: formatRate(telemetry.value?.uploadedBytes).unit.replace("/s", ""),
    tone: "gold-text",
    kind: "upload",
  },
  {
    label: "下载量",
    icon: "cloud-download",
    value: formatRate(telemetry.value?.downloadedBytes).value,
    unit: formatRate(telemetry.value?.downloadedBytes).unit.replace("/s", ""),
    tone: "blue-text",
    kind: "download",
  },
  {
    label: "内核占用",
    icon: "cpu",
    value:
      telemetry.value?.memoryBytes == null ||
      !Number.isFinite(telemetry.value.memoryBytes) ||
      telemetry.value.memoryBytes < 0
        ? "—"
        : (telemetry.value.memoryBytes / 1048576).toFixed(1),
    unit: "MB",
    tone: "red-text",
    kind: "kernel",
  },
]);
</script>
<template>
  <PanelCard title="流量统计" icon="gauge" tone="gold"
    ><template #actions
      ><span
        class="toolbar-note"
        >10 分钟</span
      ></template
    >
    <div class="traffic-chart">
      <div class="chart-axis">
        <span>{{ formatRate(max).value }} {{ formatRate(max).unit }}</span
        ><span>0</span>
      </div>
      <div style="flex: 1; min-width: 0">
        <svg
          class="chart"
          viewBox="0 0 700 145"
          preserveAspectRatio="none"
          role="img"
          aria-label="最近十分钟上传与下载速度"
        >
          <path
            v-for="y in [20, 60, 100, 130]"
            :key="y"
            :d="`M0,${y} L700,${y}`"
            stroke="currentColor"
            opacity=".08"
          />
          <path
            v-if="history.length"
            :d="path('download')"
            fill="none"
            stroke="#198cff"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
          <path
            v-if="history.length"
            :d="path('upload')"
            fill="none"
            stroke="#f5a623"
            stroke-width="2"
            vector-effect="non-scaling-stroke"
          />
        </svg>
        <div class="chart-labels">
          <span>{{
            new Date(end - 600000).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          }}</span
          ><span>{{
            new Date(end - 300000).toLocaleTimeString("zh-CN", {
              hour: "2-digit",
              minute: "2-digit",
              hour12: false,
            })
          }}</span
          ><span>现在</span>
        </div>
      </div>
      <div class="traffic-legend">
        <span class="gold-text">上传</span><span class="blue-text">下载</span>
      </div>
    </div>
    <div class="traffic-stats">
      <div
        v-for="stat in stats"
        :key="stat.label"
        class="traffic-stat"
        :class="'traffic-' + stat.kind"
        :title="stat.hint"
      >
        <div class="icon-tile">
          <BoostIcon :name="stat.icon" :size="19" />
        </div>
        <div>
          <p>{{ stat.label }}</p>
          <strong
            >{{ stat.value
            }}<small v-if="stat.unit">{{ stat.unit }}</small></strong
          >
        </div>
      </div>
    </div></PanelCard
  >
</template>
