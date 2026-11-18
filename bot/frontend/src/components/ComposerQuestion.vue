<script setup lang="ts">
import { computed, ref } from 'vue';
import type { Approval, QuestionAnswer } from '../types';
import Icon from './Icon.vue';
import Markdown from './Markdown.vue';
const props = defineProps<{ item: Approval; submit: (answers: QuestionAnswer[] | string) => Promise<boolean> }>();
const hidden = ref(false), busy = ref(false), error = ref('');
const selected = ref<Record<string, string[]>>({}), custom = ref<Record<string, string>>({});
const questions = computed(() => props.item.questions?.length ? props.item.questions : [{
  id: '', question: props.item.prompt || props.item.summary || props.item.title || '请提供所需信息',
  detail: undefined, options: [], multiSelect: false,
}]);
const hasAnswer = computed(() => questions.value.some(q => !!custom.value[q.id]?.trim() || selected.value[q.id]?.length));
function choose(id: string, option: string, multiple?: boolean) {
  const values = selected.value[id] ?? [];
  selected.value[id] = values.includes(option) ? values.filter(v => v !== option) : multiple ? [...values, option] : [option];
}
async function send(skip = false) {
  if (busy.value || (!skip && !hasAnswer.value)) return;
  busy.value = true;
  error.value = '';
  try {
    const result = skip ? [] : questions.value[0].id ? questions.value.map(q => ({
      id: q.id, selected: selected.value[q.id] ?? [],
      ...(custom.value[q.id]?.trim() ? { custom: custom.value[q.id].trim() } : {}),
    })) : custom.value[''].trim();
    if (!await props.submit(result)) error.value = '未能提交，请重试。';
  } finally { busy.value = false; }
}
</script>
<template>
  <button v-if="hidden" type="button" class="question-reopen" @click="hidden = false"><Icon name="info" :size="15" /> 查看待回答的问题</button>
  <form v-else class="composer-question" aria-label="问题" @submit.prevent="send()">
    <header><Icon name="info" :size="15" />问题
      <button type="button" class="icon-btn" aria-label="收起问题" :disabled="busy" @click="hidden = true"><Icon name="close" :size="15" /></button>
    </header>
    <div class="question-body">
      <fieldset v-for="q in questions" :key="q.id" :disabled="busy">
        <legend>{{ q.question }}</legend>
        <Markdown v-if="q.detail" :text="q.detail" />
        <div class="question-options">
          <button v-for="(option, index) in q.options" :key="option.label" type="button"
            :aria-pressed="selected[q.id]?.includes(option.label) ?? false" @click="choose(q.id, option.label, q.multiSelect)">
            <span>{{ index + 1 }}</span><span>{{ option.label }}<small v-if="option.description">{{ option.description }}</small></span>
          </button>
        </div>
        <input v-model="custom[q.id]" :aria-label="'自定义回答：' + q.question" placeholder="或自行撰写回复" maxlength="4000" />
      </fieldset>
    </div>
    <footer><p v-if="error" role="alert">{{ error }}</p><button class="quiet-button" type="button" :disabled="busy" @click="send(true)">跳过</button><button class="primary-button" type="submit" :disabled="busy || !hasAnswer">发送</button></footer>
  </form>
</template>
<style scoped>
.composer-question { border:1px solid var(--line); border-radius:16px; padding:10px 14px; background:var(--bg-2, var(--bg)); min-width:0; }
header, footer { display:flex; align-items:center; gap:8px; color:var(--muted); font-size:12px; }
header button { margin-inline-start:auto; }
.question-body { max-height:min(38dvh, 290px); overflow:auto; }
fieldset { border:0; min-width:0; padding:4px 0; margin:4px 0; }
legend { padding:0; color:var(--fg); font-size:14px; font-weight:650; overflow-wrap:anywhere; max-width:100%; }
.question-options { display:grid; gap:2px; margin-block:3px; }
.question-options button { display:flex; align-items:center; gap:8px; padding:6px; border-radius:7px; text-align:left; overflow-wrap:anywhere; }
.question-options button:hover, .question-options button[aria-pressed="true"] { background:var(--pill-hover); }
.question-options button > :first-child { border:1px solid var(--line); border-radius:5px; padding:1px 6px; color:var(--muted); }
small { display:block; color:var(--muted); }
input { width:100%; min-width:0; border:0; background:transparent; color:var(--fg); padding:7px 6px; }
footer { justify-content:flex-end; }
footer p { margin:0 auto 0 0; color:var(--red); }
.question-reopen { display:flex; align-items:center; gap:7px; padding:6px 10px; color:var(--fg-2); }
</style>
