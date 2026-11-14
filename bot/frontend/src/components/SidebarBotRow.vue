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
  manage?: boolean;
}>();
defineEmits<{ open: []; edit: []; delete: []; conversation: [value: ChannelConversation] }>();
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
        c.channel !== "web" &&
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
        <BotAvatar :bot="bot" :working="working" :size="32" /><span class="body"
          ><span class="line"
            ><span class="title">{{ bot.name }}</span
            ><Icon v-if="working" name="clock" :size="14" /></span
          ><span v-if="preview" class="snip">{{ preview }}</span></span
        >
      </button>
      <details v-if="manage" class="bot-row-actions" @click.stop @keydown.esc.stop.prevent="($event.currentTarget as HTMLDetailsElement).open=false">
        <summary :aria-label="`管理${bot.name}`"><Icon name="more" :size="16" /></summary>
        <div class="bot-actions-menu">
          <button type="button" @click="$emit('edit'); ($event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')"><Icon name="settings" :size="14" />编辑智能体</button>
          <button type="button" class="delete-action" @click="$emit('delete'); ($event.currentTarget as HTMLElement).closest('details')?.removeAttribute('open')"><Icon name="trash" :size="14" />删除智能体</button>
        </div>
      </details>
      <button
        v-if="children.length"
        type="button"
        class="icon-btn bot-tree-toggle"
        :class="{ 'with-actions': manage }"
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
  min-height: 44px;
  padding-top: 5px;
  padding-bottom: 5px;
  padding-right: 62px;
}
.thread .body { gap: 1px; }
.thread .line { line-height: 18px; }
.thread .snip { font-size: 11px; line-height: 14px; }
.bot-row-actions { position:absolute; right:5px; top:50%; transform:translateY(-50%); z-index:3; }
.bot-row-actions > summary { display:grid; place-items:center; width:26px; height:26px; border-radius:7px; cursor:pointer; color:var(--muted); list-style:none; }
.bot-row-actions > summary::-webkit-details-marker { display:none; }
.bot-row-actions > summary:hover,.bot-row-actions[open] > summary { background:var(--pill); color:var(--fg); }
.bot-actions-menu { position:absolute; right:0; top:30px; display:grid; min-width:145px; padding:5px; border:1px solid var(--line); border-radius:10px; background:var(--glass-pop); box-shadow:0 8px 24px #0002; }
.bot-actions-menu button { display:flex; align-items:center; gap:8px; text-align:left; padding:9px; border-radius:6px; font-size:12px; }
.bot-actions-menu button:hover { background:var(--pill); }
.bot-actions-menu .delete-action { color:var(--red); }
.bot-tree-toggle.with-actions { right:32px; }
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
