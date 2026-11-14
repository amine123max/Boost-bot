<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from 'vue';
import type { Bot } from '../types';
import { api, enc } from '../api';
import Modal from './Modal.vue';
import HelpTip from './HelpTip.vue';
import Icon from './Icon.vue';
import SelectControl from './SelectControl.vue';
interface Entry { text:string; meta:string; topic?:string }
interface Scope { kind:'bot'|'team'|'group'; id:string; label:string; entries:Entry[]; topics:Array<{name:string;entries:Entry[]}> }
const props=defineProps<{bot:Bot}>();
const emit=defineEmits<{saved:[]}>();
const scopes=ref<Scope[]>([]), error=ref(''), busy=ref(false), managing=ref(false), loaded=ref(false), enabled=ref(props.bot.settings.memory.enabled);
const scopeKey=ref(''), query=ref(''), text=ref(''), topic=ref(''), feedback=ref(''), removing=ref<Entry>();
const scopeId=(scope:Scope)=>scope.kind+':'+scope.id;
const selected=computed(()=>scopes.value.find(scope=>scopeId(scope)===scopeKey.value));
const entriesOf=(scope?:Scope):Entry[]=>scope?[...scope.entries,...scope.topics.flatMap(topic=>topic.entries.map(entry=>({...entry,topic:topic.name})))]:[];
const own=computed(()=>entriesOf(scopes.value.find(scope=>scope.kind==='bot'&&scope.id===props.bot.id)));
const entries=computed(()=>entriesOf(selected.value).filter(entry=>(entry.text+' '+(entry.topic||'')).toLowerCase().includes(query.value.trim().toLowerCase())));
let generation=0, disposed=false, timer:ReturnType<typeof setTimeout>|undefined, controller:AbortController|undefined;
async function load(){
  clearTimeout(timer);controller?.abort();const ticket=++generation,abort=new AbortController();controller=abort;
  try{
    if(document.hidden)return;
    const result=await api<{scopes:Scope[]}>(`/bots/${enc(props.bot.id)}/memory`,{signal:abort.signal});
    if(ticket===generation&&!disposed){scopes.value=result.scopes;loaded.value=true;error.value='';if(!scopes.value.some(scope=>scopeId(scope)===scopeKey.value))scopeKey.value='bot:'+props.bot.id;}
  }catch(e){if(!abort.signal.aborted&&!disposed)error.value=(e as Error).message;}
  finally{if(ticket===generation&&!disposed)timer=setTimeout(load,5000);}
}
async function toggle(){
  if(busy.value)return;busy.value=true;error.value='';
  try{const result=await api<{settings:Bot['settings']}>(`/bots/${enc(props.bot.id)}/settings`,{method:'PUT',body:{memory:{enabled:!enabled.value}}});if(!disposed){enabled.value=result.settings.memory.enabled;emit('saved');}}
  catch(e){if(!disposed)error.value=(e as Error).message;}finally{busy.value=false;}
}
async function add(){
  if(busy.value)return;busy.value=true;error.value='';feedback.value='';
  try{const result=await api<{message:string}>(`/bots/${enc(props.bot.id)}/memory`,{method:'POST',body:{text:text.value,...(topic.value.trim()?{topic:topic.value.trim()}:{})}});if(!disposed){text.value='';topic.value='';feedback.value=result.message;scopeKey.value='bot:'+props.bot.id;await load();}}
  catch(e){if(!disposed)error.value=(e as Error).message;}finally{busy.value=false;}
}
async function remove(){
  if(busy.value||!removing.value)return;busy.value=true;error.value='';const entry=removing.value;
  try{await api(`/bots/${enc(props.bot.id)}/memory/forget`,{method:'POST',body:{kind:'bot',match:entry.text,...(entry.topic?{topic:entry.topic}:{mainOnly:true})}});if(!disposed){removing.value=undefined;await load();}}
  catch(e){if(!disposed)error.value=(e as Error).message;}finally{busy.value=false;}
}
function open(){query.value='';text.value='';topic.value='';feedback.value='';scopeKey.value='bot:'+props.bot.id;removing.value=undefined;managing.value=true;void load();}
watch(scopeKey,()=>{removing.value=undefined;});
watch(()=>props.bot.settings.memory.enabled,value=>enabled.value=value);
watch(()=>props.bot.id,()=>{scopes.value=[];loaded.value=false;managing.value=false;scopeKey.value='bot:'+props.bot.id;void load();},{immediate:true});
onBeforeUnmount(()=>{disposed=true;generation++;controller?.abort();clearTimeout(timer);});
</script>
<template>
  <section aria-label="长期记忆">
    <div class="list-head">长期记忆<HelpTip text="保存当前智能体的偏好、事实和工作约定，后续对话与后台任务会按现有记忆规则读取。支持主题分类，密钥和密码等敏感内容不会保存。" label="长期记忆说明" /><button class="memory-manage" @click="open">管理</button><button class="icon-btn" aria-label="刷新长期记忆" :disabled="busy" @click="load"><Icon name="refresh" :size="13" /></button></div>
    <div class="memory-controls"><button class="memory-toggle" :class="{enabled}" role="switch" :aria-checked="enabled" aria-label="启用长期记忆" :disabled="busy" @click="toggle">{{enabled?'已启用':'启用'}}</button><span v-if="own.length" class="memory-count">{{own.length}}条</span><span v-else-if="loaded&&!error" class="memory-empty-inline">还没有长期记忆<button @click="open">添加记忆</button></span></div>
    <p v-if="error&&!managing" class="notice" role="alert">{{error}}</p>
    <div class="memory-preview"><button v-for="(entry,index) in own.slice(0,3)" :key="index" class="memory-preview-entry" @click="open"><span v-if="entry.topic" class="memory-topic">{{entry.topic}}</span>{{entry.text}}</button><p v-if="!loaded&&!error" class="memory-empty" role="status">正在读取记忆…</p></div>
    <button v-if="own.length>3" class="memory-more" @click="open">查看全部{{own.length}}条</button>
  </section>
  <Modal v-if="managing" compact :busy="busy" title="长期记忆" @close="managing=false"><div class="editor-form">
    <p v-if="error" class="error-banner" role="alert">{{error}}</p><p v-if="!enabled" class="hint">记忆使用已关闭，已保存的内容会保留。</p><p v-if="feedback" class="hint" role="status">{{feedback}}</p>
    <SelectControl v-model="scopeKey" label="记忆范围" :options="scopes.map(scope=>({value:scopeId(scope),label:scope.kind==='bot'?'当前智能体':scope.kind==='team'?'团队共享':scope.label}))" />
    <input v-model="query" type="search" aria-label="搜索长期记忆" placeholder="搜索记忆内容…" />
    <div class="memory-entry-list"><article v-for="(entry,index) in entries" :key="(entry.topic||'')+entry.text" class="memory-entry"><div class="memory-entry-heading"><span>{{entry.topic||'常用记忆'}}</span><HelpTip v-if="entry.meta" :text="entry.meta" :label="'记忆'+(index+1)+'来源'" /><button v-if="selected?.kind==='bot'" class="icon-btn" :aria-label="'删除记忆'+(index+1)" :disabled="busy" @click="removing=entry"><Icon name="trash" :size="13" /></button></div><p>{{entry.text}}</p></article><p v-if="!entries.length" class="hint">{{query?'未找到匹配记忆':'暂无记忆'}}</p></div>
    <div v-if="removing" class="memory-remove" role="alert"><p>删除这条记忆？</p><p>{{removing.text}}</p><button class="quiet-button" :disabled="busy" @click="removing=undefined">取消</button><button class="danger-button" :disabled="busy" @click="remove">确认删除</button></div>
    <form v-if="selected?.kind==='bot'" class="memory-add" @submit.prevent="add"><label>新增记忆<textarea v-model="text" required maxlength="300" rows="3" /></label><label>主题（可选）<input v-model="topic" maxlength="40" placeholder="例如：工作约定" /></label><button class="quiet-button" :disabled="busy">{{busy?'保存中…':'保存记忆'}}</button></form>
    <footer class="dialog-actions"><button data-dialog-close type="button" class="quiet-button" :disabled="busy">完成</button></footer>
  </div></Modal>
</template>
<style scoped>
.memory-manage { margin-left:auto; color:var(--muted); font-size:12px; }
.memory-controls { display:flex; align-items:center; gap:8px; padding:3px 8px 7px; }
.memory-toggle { padding:3px 7px; border-radius:5px; color:var(--muted); font-size:11px; }
.memory-toggle.enabled { color:var(--green); background:var(--green-soft); }
.memory-count,.memory-topic { font-size:10px; color:var(--muted); }
.memory-empty-inline { display:inline-flex; align-items:center; gap:6px; min-width:0; white-space:nowrap; color:var(--muted); font-size:11px; }
.memory-empty-inline button { color:var(--fg); }
.memory-add input,.memory-add textarea,.editor-form>input[type="search"] { width:100%; min-width:0; box-sizing:border-box; background:var(--well); color:var(--fg); border:1px solid var(--line); border-radius:7px; padding:7px 9px; font:inherit; font-size:12px; }
.memory-add textarea { resize:vertical; min-height:76px; }
.memory-add input:focus,.memory-add textarea:focus,.editor-form>input[type="search"]:focus { outline:2px solid var(--accent); outline-offset:1px; }
.memory-preview { display:grid; gap:5px; }
.memory-preview-entry { text-align:left; font-size:12px; line-height:1.5; padding:4px 8px; display:-webkit-box; -webkit-line-clamp:2; -webkit-box-orient:vertical; overflow:hidden; }
.memory-topic { margin-right:5px; }
.memory-empty { margin:0; padding:8px; font-size:12px; color:var(--muted); }
.memory-empty button { margin-left:8px; color:var(--fg); }
.memory-more { margin:5px 8px 0; font-size:11px; color:var(--muted); }
.memory-entry-list { display:grid; gap:12px; max-height:260px; overflow-y:auto; }
.memory-entry-heading { display:flex; align-items:center; gap:5px; color:var(--muted); font-size:11px; }
.memory-entry-heading>.icon-btn { margin-left:auto; }
.memory-entry p { margin:4px 0 0; line-height:1.6; font-size:12px; overflow-wrap:anywhere; white-space:pre-wrap; }
.memory-add { display:grid; gap:10px; padding-top:12px; border-top:1px solid var(--line); }
.memory-add label { display:grid; gap:7px; font-size:12px; font-weight:550; }
.memory-add>button { justify-self:end; }
.memory-remove p { margin:0 0 7px; overflow-wrap:anywhere; }
.memory-remove button+button { margin-left:6px; }
</style>
