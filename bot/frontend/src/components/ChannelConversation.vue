<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Activity, ChannelConversation, Message } from "../types";
import { api, enc, downloadFile } from "../api";
import ConversationLabel from "./ConversationLabel.vue";
import ActivityTrace from "./ActivityTrace.vue";
import MessageBubble from "./MessageBubble.vue";
import HelpTip from "./HelpTip.vue";
import Icon from "./Icon.vue";
const props = defineProps<{ conversation: ChannelConversation }>();
defineEmits<{ menu: []; direct: [] }>();
const messages = ref<Message[]>([]),
  error = ref(""),
  loading = ref(true),
  stopping = ref(false);
const turn = ref<{
  since: number;
  steps: Activity[];
  interim: string[];
} | null>(null);
let disposed = false,
  timer: ReturnType<typeof setTimeout> | undefined;
const abort = new AbortController();
async function load() {
  try {
    const [history, live] = await Promise.all([
      api<{ messages: Message[] }>(
        `/conversations/${enc(props.conversation.id)}/messages`,
        { signal: abort.signal },
      ),
      api<{ turn: typeof turn.value }>(
        `/conversations/${enc(props.conversation.id)}/turn`,
        { signal: abort.signal },
      ),
    ]);
    if (disposed) return;
    messages.value = history.messages;
    turn.value = live.turn;
    error.value = "";
    if (!live.turn) stopping.value = false;
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  } finally {
    if (!disposed) {
      loading.value = false;
      timer = setTimeout(load, turn.value ? 1500 : 6000);
    }
  }
}
async function stop() {
  stopping.value = true;
  try {
    await api(`/conversations/${enc(props.conversation.id)}/stop`, {
      method: "POST",
      body: {},
    });
  } catch (e) {
    error.value = (e as Error).message;
    stopping.value = false;
  }
}
async function file(value: NonNullable<Message["files"]>[number]) {
  try {
    await downloadFile(props.conversation.id, value);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  abort.abort();
  clearTimeout(timer);
});
</script>
<template>
  <section class="chat channel-view">
    <header class="chat-head">
      <button
        class="icon-button mobile-menu"
        aria-label="打开导航"
        @click="$emit('menu')"
      >
        <Icon name="menu" /></button
      ><ConversationLabel
        :channel="conversation.channel"
        :created-at="conversation.createdAt"
      /><HelpTip
        text="这里显示所选渠道的真实会话和执行过程。网页直接对话拥有独立上下文，避免把不同渠道的内容或授权混用。"
      /><span class="grow" /><button
        class="quiet-button"
        @click="$emit('direct')"
      >
        网页对话
      </button>
    </header>
    <div class="chat-scroll">
      <div class="chat-col ready">
        <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
        <p v-if="loading" class="hint" role="status">正在加载会话…</p>
        <article
          v-for="message in messages"
          :key="message.id"
          class="message"
          :class="{ 'is-user': message.role === 'user' }"
        >
          <div class="message-body">
            <ActivityTrace
              v-if="message.steps"
              :count="message.steps"
              :conversation-id="conversation.id"
              :message-id="message.id"
            />
            <MessageBubble framed :text="message.content" :role="message.role" :created-at="message.createdAt">
            <button
              v-for="f in message.files"
              :key="f.path"
              class="file-button"
              :disabled="f.gone"
              @click="file(f)"
            >
              <Icon name="file" />{{ f.name }}
            </button>
            </MessageBubble>
          </div>
        </article>
        <section v-if="turn">
          <ActivityTrace :steps="turn.steps" running /><MessageBubble framed
            v-if="turn.interim.length" :text="turn.interim.join('\n\n')"
          /><button class="danger-button" :disabled="stopping" @click="stop">
            {{ stopping ? "正在停止" : "停止" }}
          </button>
        </section>
      </div>
    </div>
  </section>
</template>
