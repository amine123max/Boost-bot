<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Activity, Message, FileItem } from "../types";
import { api, enc, downloadFile } from "../api";
import Modal from "./Modal.vue";
import ConversationLabel from "./ConversationLabel.vue";
import Markdown from "./Markdown.vue";
import ActivityTrace from "./ActivityTrace.vue";
import Icon from "./Icon.vue";
const props = defineProps<{
  conversation: { id: string; channel: string; createdAt: number };
}>();
defineEmits<{ close: [] }>();
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
async function load() {
  try {
    const [history, live] = await Promise.all([
      api<{ messages: Message[] }>(
        `/conversations/${enc(props.conversation.id)}/messages`,
      ),
      api<{ turn: typeof turn.value }>(
        `/conversations/${enc(props.conversation.id)}/turn`,
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
      timer = setTimeout(load, 4000);
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
async function download(file: FileItem) {
  try {
    await downloadFile(props.conversation.id, file);
  } catch (e) {
    error.value = (e as Error).message;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timer);
});
</script>
<template>
  <Modal title="会话记录" @close="$emit('close')"
    ><template #heading
      ><ConversationLabel
        :channel="conversation.channel"
        :created-at="conversation.createdAt"
    /></template>
    <div class="editor-form history-content">
      <p v-if="error" class="error-banner" role="alert">{{ error }}</p>
      <p v-if="loading" class="hint" role="status">正在加载会话…</p>
      <p v-else-if="!messages.length && !turn" class="hint">暂无消息</p>
      <article
        v-for="message in messages"
        :key="message.id"
        class="history-message"
        :class="{ user: message.role === 'user' }"
      >
        <ActivityTrace
          v-if="message.steps"
          :count="message.steps"
          :conversation-id="conversation.id"
          :message-id="message.id"
        /><Markdown :text="message.content" />
        <div class="hint">
          {{
            message.createdAt
              ? new Date(message.createdAt).toLocaleString("zh-CN", {
                  hour12: false,
                })
              : ""
          }}
        </div>
        <button
          v-for="file in message.files"
          :key="file.path"
          class="file-button"
          :disabled="file.gone"
          @click="download(file)"
        >
          <Icon name="file" />{{ file.name }}
        </button>
      </article>
      <section v-if="turn" class="activity-panel">
        <span role="status">{{ stopping ? "正在停止" : "处理中" }}</span>
        <div v-for="step in turn.steps" :key="step.id" class="activity-step">
          {{ step.label || step.title || step.kind }}
        </div>
        <Markdown
          v-for="(text, index) in turn.interim"
          :key="index"
          :text="text"
        />
        <div class="button-row">
          <button class="danger-button" :disabled="stopping" @click="stop">
            停止
          </button>
        </div>
      </section>
    </div></Modal
  >
</template>
<style scoped>
.history-content {
  min-height: 120px;
}
.history-message {
  display: grid;
  gap: var(--space-2);
  min-width: 0;
}
.history-message.user {
  justify-self: end;
  max-width: 85%;
  border-radius: var(--r-bubble);
  padding: var(--space-2-5) var(--space-4);
  background: var(--bubble-user);
}
</style>
