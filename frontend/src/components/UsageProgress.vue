<script setup lang="ts">
defineProps<{
  primary: number | null | undefined;
  secondary: number | null | undefined;
}>();
const width = (value: number | null | undefined) =>
  `${Math.min(100, Math.max(0, value ?? 0))}%`;
</script>
<template>
  <div class="usage-progress">
    <div
      v-for="row in [
        { label: '5小时内', value: primary, tone: 'quota-five' },
        { label: '7天内', value: secondary, tone: 'quota-seven' },
      ]"
      :key="row.label"
      class="usage-progress-row"
    >
      <div class="usage-progress-caption">
        <span>{{ row.label }}</span
        ><span>{{
          row.value == null ? "—" : Math.round(row.value) + "%"
        }}</span>
      </div>
      <div
        class="usage-progress-track"
        :class="[row.tone, { unknown: row.value == null }]"
        role="progressbar"
        :aria-label="row.label + '剩余额度'"
        :aria-valuenow="row.value == null ? undefined : Math.round(row.value)"
        :aria-valuemin="0"
        :aria-valuemax="100"
        :aria-valuetext="
          row.value == null ? '暂无额度数据' : Math.round(row.value) + '%'
        "
      >
        <span :style="{ width: width(row.value) }" />
      </div>
    </div>
  </div>
</template>
