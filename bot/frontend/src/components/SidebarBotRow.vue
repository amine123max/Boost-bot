<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { Bot, ChannelConversation } from "../types";
import BotAvatar from "./BotAvatar.vue";
import Icon from "./Icon.vue";
const props = defineProps<{
  bot: Bot;
  conversations: ChannelConversation[];
  active: boolean;
  conversationId?: string;
  preview?: string;
  working?: boolean;
}>();
defineEmits<{ open: []; conversation: [value: ChannelConversation] }>();
const expanded = ref(false);
const channels: Record<string, string> = {
  web: "网页",
  weixin: "微信",
  feishu: "飞书",
  telegram: "Telegram",
  discord: "Discord",
  slack: "Slack",
};
const children = computed(() =>
  props.conversations
    .filter(
      (c) =>
        c.botId === props.bot.id &&
        !c.peerId?.startsWith("group:") &&
        c.messageCount > 0,
    )
    .sort((a, b) => b.updatedAt - a.updatedAt),
);
watch(
  () => props.conversationId,
  (id) => {
    if (children.value.some((c) => c.id === id)) expanded.value = true;
  },
  { immediate: true },
);
const date = (value: number) =>
  new Date(value).toLocaleDateString("zh-CN", {
    month: "2-digit",
    day: "2-digit",
  });
</script>
<template>
  <div class="bot-conversation-tree">
    <div class="thread-item">
      <button
        type="button"
        class="thread"
        :class="{ sel: active }"
        :aria-current="active ? 'page' : undefined"
        @click="$emit('open')"
      >
        <BotAvatar :bot="bot" :working="working" :size="38" /><span class="body"
          ><span class="line"
            ><span class="title">{{ bot.name }}</span
            ><Icon v-if="working" name="clock" :size="14" /></span
          ><span v-if="preview" class="snip">{{ preview }}</span></span
        >
      </button>
      <button
        v-if="children.length"
        type="button"
        class="icon-btn bot-tree-toggle"
        :aria-label="(expanded ? '收起' : '展开') + bot.name + '的渠道会话'"
        :aria-expanded="expanded"
        @click="expanded = !expanded"
      >
        <Icon
          name="chevron"
          :size="15"
          :style="{ transform: expanded ? 'rotate(90deg)' : undefined }"
        />
      </button>
    </div>
    <div
      v-if="expanded"
      class="bot-conversation-children"
      :aria-label="bot.name + '的渠道会话'"
    >
      <button
        v-for="item in children"
        :key="item.id"
        type="button"
        class="channel-conversation"
        :class="{ sel: item.id === conversationId }"
        :aria-current="item.id === conversationId ? 'page' : undefined"
        @click="$emit('conversation', item)"
      >
        <Icon name="chat" :size="14" /><span class="channel-copy"
          ><span class="channel-line"
            ><strong>{{ channels[item.channel] || "其他渠道" }}</strong
            ><time>{{ date(item.createdAt) }}</time></span
          ><span v-if="item.lastMessage" class="channel-preview">{{
            item.lastMessage.replace(/\s+/g, " ")
          }}</span></span
        >
      </button>
    </div>
  </div>
</template>
<style scoped>
.thread {
  height: auto;
  min-height: 60px;
  padding-top: var(--space-2);
  padding-bottom: var(--space-2);
  padding-right: var(--space-8);
}
.bot-tree-toggle {
  position: absolute;
  right: var(--space-1);
  top: 50%;
  transform: translateY(-50%);
}
.bot-tree-toggle svg {
  transition: transform var(--t-fast);
}
.bot-conversation-children {
  display: grid;
  gap: var(--space-0-5);
  margin: var(--space-1) var(--space-2) var(--space-2) var(--space-6);
  border-left: 1px solid var(--line-2);
  padding-left: var(--space-2);
}
.channel-conversation {
  display: flex;
  align-items: center;
  gap: var(--space-2);
  text-align: left;
  padding: var(--space-2);
  border-radius: var(--r-md);
  color: var(--muted);
  min-width: 0;
}
.channel-conversation:hover,
.channel-conversation.sel {
  background: var(--side-active);
  color: var(--fg);
}
.channel-copy {
  display: grid;
  gap: var(--space-0-5);
  min-width: 0;
  flex: 1;
}
.channel-line {
  display: flex;
  align-items: baseline;
  gap: var(--space-2);
  font-size: var(--fs-xs);
}
.channel-line strong {
  font-weight: var(--fw-medium);
  flex: 1;
}
.channel-line time {
  color: var(--muted);
  font-size: var(--fs-2xs);
}
.channel-preview {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: var(--fs-2xs);
}
</style>
