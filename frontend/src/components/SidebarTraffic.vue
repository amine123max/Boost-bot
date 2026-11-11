<script setup lang="ts">
import { computed } from "vue";
import { useTelemetry } from "@/composables/useTelemetry";
const { history, telemetry } = useTelemetry();
const recent = computed(() => history.value.slice(-60));
const maximum = computed(() =>
  Math.max(1, ...recent.value.flatMap((p) => [p.upload, p.download])),
);
function points(direction: "upload" | "download") {
  return recent.value
    .map(
      (p, i) =>
        `${(i / Math.max(1, recent.value.length - 1)) * 200},${55 - (p[direction] / maximum.value) * 48}`,
    )
    .join(" ");
}
</script>
<template>
  <svg
    class="sidebar-sparkline"
    viewBox="0 0 200 60"
    preserveAspectRatio="none"
    role="img"
    aria-label="最近的上传与下载曲线"
  >
    <template v-if="telemetry">
      <polyline
        :points="points('upload')"
        fill="none"
        stroke="#f5a623"
        stroke-width="2.2"
        vector-effect="non-scaling-stroke"
      />
      <polyline
        :points="points('download')"
        fill="none"
        stroke="#198cff"
        stroke-width="2.2"
        vector-effect="non-scaling-stroke"
      />
    </template>
  </svg>
</template>
