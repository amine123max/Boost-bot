<script setup lang="ts">
import { nextTick, ref } from 'vue';
import type { Conversation } from '../conversation';
import Icon from './Icon.vue';
const props = defineProps<{ chat: Conversation }>();
const editing = ref(''), text = ref('');
const more = ref('');
const menuStyle = ref<Record<string, string>>({});
const menu = ref<HTMLElement>();
let trigger: HTMLButtonElement | undefined;
function edit(id: string, value: string) { editing.value = id; text.value = value; }
function toggleMore(event: MouseEvent, id: string) {
  if (more.value === id) { more.value = ''; return; }
  trigger = event.currentTarget as HTMLButtonElement;
  const rect = trigger.getBoundingClientRect();
  const below = innerHeight - rect.bottom;
  menuStyle.value = {
    left: Math.max(8, Math.min(innerWidth - 188, rect.right - 180)) + 'px',
    ...(below >= 54 || below >= rect.top ? {top: rect.bottom + 4 + 'px'} : {bottom: innerHeight - rect.top + 4 + 'px'}),
  };
  more.value = id;
  void nextTick(() => menu.value?.querySelector('button')?.focus());
}
async function save() {
  if (await props.chat.changeQueue(editing.value, 'edit', text.value)) editing.value = '';
}
</script>
<template>
  <ol v-if="chat.queued.length" class="queued-messages" aria-label="待发送消息" @keydown.esc="more = ''">
    <li v-for="(item, index) in chat.queued" :key="item.id" :data-state="item.state">
      <form v-if="editing === item.id" @submit.prevent="save">
        <textarea v-model="text" aria-label="编辑待发送消息" rows="2" maxlength="32000" />
        <button type="button" class="quiet-button" @click="editing = ''">取消</button>
        <button class="primary-button" :disabled="!!chat.queueBusy || !text.trim()">保存</button>
      </form>
      <template v-else>
        <span class="queue-order" :title="'队列第 ' + (index + 1) + ' 项'" :aria-label="'队列第 ' + (index + 1) + ' 项'">
          <Icon name="queue-turn" :size="17" />
        </span>
        <div class="queue-text"><span :title="item.text">{{ item.text }}</span><small v-if="item.error">{{ item.error }}</small></div>
        <span v-if="item.state !== 'queued'" class="state">{{ item.state === 'failed' ? '未完成' : '引导中' }}</span>
        <template v-if="item.state === 'queued'">
          <button v-if="chat.running && !item.text.startsWith('/')" class="quiet-button queue-guide" :disabled="!!chat.queueBusy" type="button" @click="chat.changeQueue(item.id, 'guide')">引导</button>
        </template>
        <button v-if="item.state === 'failed'" class="quiet-button" type="button" :disabled="!!chat.queueBusy" @click="chat.changeQueue(item.id, 'retry')">重发</button>
        <button v-if="item.state !== 'guiding'" class="icon-btn" type="button" aria-label="移除待发送消息" :disabled="!!chat.queueBusy" @click="chat.changeQueue(item.id, 'remove')"><Icon name="trash" :size="15" /></button>
        <button v-if="item.state === 'queued'" class="icon-btn" type="button" aria-label="更多队列操作" :aria-expanded="more === item.id" :disabled="!!chat.queueBusy" @click="toggleMore($event,item.id)"><Icon name="more" :size="16" /></button>
      </template>
    </li>
  </ol>
  <Teleport to="body">
    <div v-if="more && chat.queued.some(row => row.id === more && row.state === 'queued')" ref="menu" class="queue-menu" :style="menuStyle"
      @focusout="more = ''" @keydown.esc.stop.prevent="more = ''; trigger?.focus()">
      <button type="button" @click="edit(more, chat.queued.find(row => row.id === more)?.text || ''); more = ''"><Icon name="edit" :size="15" /> 编辑待发送消息</button>
    </div>
  </Teleport>
</template>
<style scoped>
.queued-messages { display:grid; gap:0; list-style:none; padding:0 0 8px; margin:0 13px -14px; max-height:min(24dvh, 180px); overflow:auto; scrollbar-width:thin; border-radius:16px 16px 0 0; background:var(--pill); }
li { display:flex; flex-wrap:wrap; align-items:center; gap:7px; padding:5px 10px; min-height:39px; min-width:0; }
.queue-order { flex:none; display:grid; place-items:center; width:21px; height:21px; color:var(--muted); }
.queue-menu { position:fixed; z-index:100; width:180px; padding:4px; background:var(--surface-solid); border:1px solid var(--line); border-radius:9px; box-shadow:0 6px 16px #0004; }
.queue-menu button { display:flex; align-items:center; gap:6px; padding:5px 8px; width:100%; border-radius:6px; }
.queue-menu button:hover,.queue-menu button:focus-visible { background:var(--pill); }
.queue-text { min-width:0; flex:1; font-size:var(--chat-text-size,var(--fs-lg)); }
.queue-text span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
small, .state { color:var(--muted); font-size:11px; }
.state { flex:none; }
.queue-guide { display:inline-flex; align-items:center; gap:4px; flex:none; }
li[data-state="failed"] .state { color:var(--red); }
.queued-messages button { min-height:28px; }
@media (max-width:430px) {
  li { gap:4px; padding-inline:6px; }
  .queued-messages .icon-btn { width:28px; min-width:28px; }
}
form { display:flex; flex-wrap:wrap; justify-content:flex-end; gap:5px; width:100%; }
textarea { width:100%; min-width:0; resize:vertical; color:inherit; background:var(--pill); border:1px solid var(--line); border-radius:6px; padding:4px 8px; }
</style>
