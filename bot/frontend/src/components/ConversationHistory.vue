<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import type { Activity, Message, FileItem } from "../types";
import { api, enc, downloadFile } from "../api";
import Modal from "./Modal.vue";
import ConversationLabel from "./ConversationLabel.vue";
import MessageBubble from "./MessageBubble.vue";
import TurnTranscript from "./TurnTranscript.vue";
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
        <TurnTranscript v-if="message.role === 'assistant'" :message="message" :conversation-id="conversation.id" :eager="message.id === messages.at(-1)?.id" :framed="conversation.channel !== 'web'">
        <button
          v-for="file in message.files"
          :key="file.path"
          class="file-button"
          :disabled="file.gone"
          @click="download(file)"
        >
          <Icon name="file" />{{ file.name }}
        </button>
        </TurnTranscript>
        <MessageBubble v-else :framed="conversation.channel !== 'web'" :text="message.content" :role="message.role" :created-at="message.createdAt" />
      </article>
      <section v-if="turn" class="activity-panel">
        <TurnTranscript :live="{botId: '', text: '', startedAt:turn.since, steps:turn.steps, interim:turn.interim}" :framed="conversation.channel !== 'web'" running :stopping="stopping" />
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
}
</style>
