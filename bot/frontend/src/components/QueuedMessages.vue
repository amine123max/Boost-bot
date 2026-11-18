<script setup lang="ts">
import { ref } from 'vue';
import type { Conversation } from '../conversation';
import Icon from './Icon.vue';
const props = defineProps<{ chat: Conversation }>();
const editing = ref(''), text = ref('');
async function save() {
  if (await props.chat.changeQueue(editing.value, 'edit', text.value)) editing.value = '';
}
</script>
<template>
  <ol v-if="chat.queued.length" class="queued-messages" aria-label="待发送消息">
    <li v-for="item in chat.queued" :key="item.id">
      <form v-if="editing === item.id" @submit.prevent="save">
        <textarea v-model="text" aria-label="编辑待发送消息" rows="2" maxlength="32000" />
        <button type="button" class="quiet-button" @click="editing = ''">取消</button>
        <button class="primary-button" :disabled="!!chat.queueBusy || !text.trim()">保存</button>
      </form>
      <template v-else>
        <Icon name="chat" :size="15" />
        <div class="queue-text"><span :title="item.text">{{ item.text }}</span><small v-if="item.error">{{ item.error }}</small></div>
        <span class="state">{{ item.state === 'failed' ? '未完成' : item.state === 'guiding' ? '引导中' : '排队中' }}</span>
        <template v-if="item.state === 'queued'">
          <button v-if="chat.running && !item.text.startsWith('/')" class="quiet-button" :disabled="!!chat.queueBusy" type="button" @click="chat.changeQueue(item.id, 'guide')">引导</button>
          <button class="icon-btn" type="button" aria-label="编辑待发送消息" :disabled="!!chat.queueBusy" @click="editing = item.id; text = item.text"><Icon name="edit" :size="15" /></button>
        </template>
        <button v-if="item.state === 'failed'" class="quiet-button" type="button" :disabled="!!chat.queueBusy" @click="chat.changeQueue(item.id, 'retry')">重发</button>
        <button v-if="item.state !== 'guiding'" class="icon-btn" type="button" aria-label="移除待发送消息" :disabled="!!chat.queueBusy" @click="chat.changeQueue(item.id, 'remove')"><Icon name="trash" :size="15" /></button>
      </template>
    </li>
  </ol>
</template>
<style scoped>
.queued-messages { list-style:none; padding:0; margin:0; max-height:min(19dvh, 150px); overflow:auto; border:1px solid var(--line); border-radius:12px; background:var(--pill); }
li { display:flex; align-items:center; gap:7px; padding:4px 8px; min-width:0; }
li + li { border-top:1px solid var(--line); }
.queue-text { min-width:0; flex:1; font-size:13px; }
.queue-text span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
small, .state { color:var(--muted); font-size:11px; }
.state { flex:none; }
form { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px; width:100%; }
textarea { width:100%; min-width:0; resize:vertical; color:inherit; background:var(--pill); border:1px solid var(--line); border-radius:6px; padding:4px 8px; }
</style>
