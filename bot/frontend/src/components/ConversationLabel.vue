<script setup lang="ts">
import { computed } from "vue";
const props = defineProps<{ channel: string; createdAt: number }>();
const channels: Record<string, string> = {
  weixin: "微信",
  feishu: "飞书",
  web: "网页",
  telegram: "Telegram",
  slack: "Slack",
  discord: "Discord",
};
const date = computed(() => {
  const value = new Date(props.createdAt);
  return props.createdAt && Number.isFinite(value.getTime())
    ? value.toLocaleDateString("zh-CN", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      })
    : "日期未知";
});
</script>
<template>
  <span class="conversation-labels"
    ><span class="conversation-label">{{ channels[channel] || "会话" }}</span
    ><span class="conversation-label"
      ><time
        :datetime="
          createdAt && Number.isFinite(new Date(createdAt).getTime())
            ? new Date(createdAt).toISOString()
            : undefined
        "
        >{{ date }}</time
      ></span
    ></span
  >
</template>
<style scoped>
.conversation-labels {
  display: inline-flex;
  align-items: center;
  flex-wrap: wrap;
  gap: var(--space-2);
  max-width: 100%;
  white-space: normal;
}
.conversation-label {
  display: inline-flex;
  align-items: center;
  gap: var(--space-1-5);
  max-width: 100%;
  padding: var(--space-0-5) var(--space-2);
  border: 1px solid var(--line);
  border-radius: var(--r-md);
  background: var(--pill);
  color: var(--fg-2);
  font-size: var(--fs-sm);
  font-weight: var(--fw-medium);
  line-height: var(--lh-normal);
  white-space: nowrap;
}
</style>
