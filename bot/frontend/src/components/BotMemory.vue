<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, ref, watch } from 'vue';
import type { Bot } from '../types';
import { api, enc } from '../api';
import Modal from './Modal.vue';
import HelpTip from './HelpTip.vue';
import Icon from './Icon.vue';
import SelectControl from './SelectControl.vue';
import PanelSection from './PanelSection.vue';
import { memoryTitle } from '../lib/memory-title';
interface Entry { text:string; meta:string; topic?:string; title?:string }
interface Scope { kind:'bot'|'team'|'group'; id:string; label:string; entries:Entry[]; topics:Array<{name:string;entries:Entry[]}> }
const props=defineProps<{bot:Bot}>();
const emit=defineEmits<{saved:[]}>();
const scopes=ref<Scope[]>([]), error=ref(''), busy=ref(false), managing=ref(false), loaded=ref(false), enabled=ref(props.bot.settings.memory.enabled);
const scopeKey=ref(''), query=ref(''), text=ref(''), topic=ref(''), feedback=ref(''), removing=ref<Entry>();
const addingMemory=ref(false), addError=ref('');
const memoryDialog=ref<HTMLElement>();
const scopeId=(scope:Scope)=>scope.kind+':'+scope.id;
const selected=computed(()=>scopes.value.find(scope=>scopeId(scope)===scopeKey.value));
const entriesOf=(scope?:Scope):Entry[]=>scope?[...scope.entries,...scope.topics.flatMap(topic=>topic.entries.map(entry=>({...entry,topic:topic.name})))]:[];
const own=computed(()=>entriesOf(scopes.value.find(scope=>scope.kind==='bot'&&scope.id===props.bot.id)));
const entries=computed(()=>entriesOf(selected.value).filter(entry=>(entry.text+' '+(entry.topic||'')).toLowerCase().includes(query.value.trim().toLowerCase())));
const isRemoving=(entry:Entry)=>!!removing.value&&removing.value.text===entry.text&&removing.value.topic===entry.topic;
let summaryKey='', summarizing=false, summaryController:AbortController|undefined;
async function summarize(){
  const botId=props.bot.id, visible=own.value.slice(0,3);
  if(summarizing||!visible.length||visible.every(entry=>entry.title))return;
  const fingerprint=JSON.stringify([botId,props.bot.settings.modelSource,props.bot.defaultModel,props.bot.settings.utilityModel,visible.map(entry=>[entry.topic,entry.text])]);
  if(summaryKey===fingerprint)return;
  summaryKey=fingerprint;summarizing=true;
  const abort=new AbortController();summaryController=abort;
  try{
    const result=await api<{entries:Array<{text:string;topic:string;title?:string}>}>(`/bots/${enc(botId)}/memory/titles`,{method:'POST',body:{},signal:abort.signal});
    if(disposed||botId!==props.bot.id||abort.signal.aborted)return;
    const scope=scopes.value.find(scope=>scope.kind==='bot'&&scope.id===botId);
    const apply=(entry:Entry,topic='')=>{const match=result.entries.find(item=>item.text===entry.text&&item.topic===topic);if(match?.title)entry.title=match.title;};
    scope?.entries.forEach(entry=>apply(entry));scope?.topics.forEach(topic=>topic.entries.forEach(entry=>apply(entry,topic.name)));
  }catch{ /* Keep the existing title or original text when the provider is unavailable. */ }
  finally{if(summaryController===abort)summarizing=false;}
}
let generation=0, disposed=false, timer:ReturnType<typeof setTimeout>|undefined, controller:AbortController|undefined;
async function load(){
  clearTimeout(timer);controller?.abort();const ticket=++generation,abort=new AbortController();controller=abort;
  try{
    if(document.hidden)return;
    const result=await api<{scopes:Scope[]}>(`/bots/${enc(props.bot.id)}/memory`,{signal:abort.signal});
    if(ticket===generation&&!disposed){scopes.value=result.scopes;loaded.value=true;error.value='';if(!scopes.value.some(scope=>scopeId(scope)===scopeKey.value))scopeKey.value='bot:'+props.bot.id;void summarize();}
  }catch(e){if(!abort.signal.aborted&&!disposed)error.value=(e as Error).message;}
  finally{if(ticket===generation&&!disposed)timer=setTimeout(load,5000);}
}
async function toggle(){
  if(busy.value)return;busy.value=true;error.value='';
  try{const result=await api<{settings:Bot['settings']}>(`/bots/${enc(props.bot.id)}/settings`,{method:'PUT',body:{memory:{enabled:!enabled.value}}});if(!disposed){enabled.value=result.settings.memory.enabled;emit('saved');}}
  catch(e){if(!disposed)error.value=(e as Error).message;}finally{busy.value=false;}
}
async function add(){
  if(busy.value)return;busy.value=true;addError.value='';feedback.value='';
  try{const result=await api<{message:string}>(`/bots/${enc(props.bot.id)}/memory`,{method:'POST',body:{text:text.value,...(topic.value.trim()?{topic:topic.value.trim()}:{})}});if(!disposed){text.value='';topic.value='';feedback.value=result.message;addingMemory.value=false;scopeKey.value='bot:'+props.bot.id;await load();}}
  catch(e){if(!disposed)addError.value=(e as Error).message;}finally{busy.value=false;}
}
async function remove(){
  if(busy.value||!removing.value)return;busy.value=true;error.value='';const entry=removing.value;
  try{await api(`/bots/${enc(props.bot.id)}/memory/forget`,{method:'POST',body:{kind:'bot',match:entry.text,...(entry.topic?{topic:entry.topic}:{mainOnly:true})}});if(!disposed){removing.value=undefined;await load();}}
  catch(e){if(!disposed)error.value=(e as Error).message;}finally{busy.value=false;}
}
function open(){query.value='';text.value='';topic.value='';feedback.value='';scopeKey.value='bot:'+props.bot.id;removing.value=undefined;managing.value=true;void load();}
function openAdd(){text.value='';topic.value='';addError.value='';addingMemory.value=true;}
async function armRemoval(entry:Entry){removing.value=entry;await nextTick();memoryDialog.value?.querySelector<HTMLButtonElement>('.memory-delete-confirm')?.focus({preventScroll:true});}
watch([scopeKey,query],()=>{removing.value=undefined;});
watch(()=>props.bot.settings.memory.enabled,value=>enabled.value=value);
watch(()=>props.bot.id,()=>{summaryController?.abort();summarizing=false;summaryKey='';scopes.value=[];loaded.value=false;managing.value=false;addingMemory.value=false;scopeKey.value='bot:'+props.bot.id;void load();},{immediate:true});
onBeforeUnmount(()=>{disposed=true;generation++;controller?.abort();summaryController?.abort();clearTimeout(timer);});
</script>
<template>
  <PanelSection title="长期记忆" help="保存当前智能体的偏好、事实和工作约定，后续对话与后台任务会按现有记忆规则读取。支持主题分类，密钥和密码等敏感内容不会保存。">
    <template #actions><button class="icon-btn" aria-label="添加和管理长期记忆" :disabled="busy" @click="open"><Icon name="plus" :size="14" /></button></template>
    <div class="memory-controls"><button class="memory-toggle" :class="{enabled}" role="switch" :aria-checked="enabled" aria-label="启用长期记忆" :disabled="busy" @click="toggle">{{enabled?'已启用':'启用'}}</button><span v-if="own.length" class="memory-count">{{own.length}}条</span><span v-else-if="loaded&&!error" class="memory-empty-inline">还没有长期记忆<button @click="open">添加记忆</button></span></div>
    <p v-if="error&&!managing" class="notice" role="alert">{{error}}</p>
    <div class="memory-preview"><button v-for="(entry,index) in own.slice(0,3)" :key="index" class="memory-preview-entry" :title="entry.text" @click="open"><span v-if="entry.topic" class="memory-preview-topic"><span class="memory-topic">{{entry.topic}}</span><span aria-hidden="true">：</span></span><span class="memory-preview-title">{{entry.title||memoryTitle(entry.text)}}</span></button><p v-if="!loaded&&!error" class="memory-empty" role="status">正在读取记忆…</p></div>
    <button v-if="own.length>3" class="memory-more" @click="open">查看全部{{own.length}}条</button>
  </PanelSection>
  <Modal v-if="managing" compact stable :busy="busy" title="长期记忆" @close="managing=false"><div ref="memoryDialog" class="memory-dialog-layout"><div class="editor-form memory-dialog-body">
    <p v-if="error" class="error-banner" role="alert">{{error}}</p><p v-if="!enabled" class="hint">记忆使用已关闭，已保存的内容会保留。</p><p v-if="feedback" class="hint" role="status">{{feedback}}</p>
    <SelectControl v-model="scopeKey" label="记忆范围" :options="scopes.map(scope=>({value:scopeId(scope),label:scope.kind==='bot'?'当前智能体':scope.kind==='team'?'团队共享':scope.label}))" />
    <input v-model="query" type="search" aria-label="搜索长期记忆" placeholder="搜索记忆内容…" />
    <div v-if="selected?.kind==='bot'" class="memory-add-row"><span>新增记忆</span><button type="button" class="icon-btn" aria-label="新增记忆" :disabled="busy" @click="openAdd"><Icon name="plus" :size="16" /></button></div>
    <div class="memory-entry-list"><article v-for="(entry,index) in entries" :key="(entry.topic||'')+entry.text" class="memory-entry"><div class="memory-entry-heading"><span class="memory-topic">{{entry.topic||'常用记忆'}}</span><HelpTip v-if="entry.meta" :text="entry.meta" :label="'记忆'+(index+1)+'来源'" /><span v-if="selected?.kind==='bot'" class="memory-entry-actions" @keydown.esc.stop="removing=undefined"><template v-if="isRemoving(entry)"><button class="memory-delete-confirm" :aria-label="'确认删除记忆'+(index+1)" :disabled="busy" @click="remove">{{busy?'删除中…':'确认'}}</button><button class="icon-btn" aria-label="取消删除" :disabled="busy" @click="removing=undefined"><Icon name="close" :size="13" /></button></template><button v-else class="icon-btn" :aria-label="'删除记忆'+(index+1)" :disabled="busy" @click="armRemoval(entry)"><Icon name="trash" :size="13" /></button></span></div><p>{{entry.text}}</p></article><p v-if="!entries.length" class="hint">{{query?'未找到匹配记忆':'暂无记忆'}}</p></div>
    </div><footer class="dialog-actions"><button data-dialog-close type="button" class="primary-button" :disabled="busy">完成</button></footer>
  </div></Modal>
  <Modal v-if="addingMemory" compact :busy="busy" title="新增记忆" @close="addingMemory=false"><form class="editor-form memory-add" @submit.prevent="add"><p v-if="addError" class="error-banner" role="alert">{{addError}}</p><label>记忆内容<textarea v-model="text" required maxlength="300" rows="3" placeholder="记录需要长期保留的事实或工作约定" /></label><label>主题（可选）<input v-model="topic" maxlength="40" placeholder="例如：工作约定" /></label><footer class="dialog-actions"><button data-dialog-close type="button" class="quiet-button" :disabled="busy">取消</button><button type="submit" class="primary-button" :disabled="busy||!text.trim()">{{busy?'保存中…':'保存记忆'}}</button></footer></form></Modal>
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
.memory-add textarea { resize:vertical; min-height:76px; max-height:180px; }
.memory-add input:focus,.memory-add textarea:focus,.editor-form>input[type="search"]:focus { outline:2px solid var(--accent); outline-offset:1px; }
.memory-preview { display:grid; gap:8px; grid-auto-rows:auto; }
.memory-preview-entry { display:flex; align-items:center; gap:3px; min-width:0; text-align:left; font-size:12px; line-height:1.6; padding:7px 8px; border-radius:6px; }
.memory-preview-entry:hover { background:var(--pill); }
.memory-preview-topic { display:inline-flex; align-items:center; flex:0 1 auto; min-width:0; max-width:45%; color:var(--muted); }
.memory-preview-topic>.memory-topic { display:block; min-width:0; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.memory-preview-title { display:block; flex:1; min-width:0; max-width:100%; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.memory-topic { display:inline-flex; align-items:center; max-width:100%; padding:2px 6px; border:1px solid var(--line); border-radius:6px; background:var(--pill); color:var(--fg-2); font-size:10px; line-height:1.4; overflow-wrap:anywhere; }
.memory-empty { margin:0; padding:8px; font-size:12px; color:var(--muted); }
.memory-empty button { margin-left:8px; color:var(--fg); }
.memory-more { margin:5px 8px 0; font-size:11px; color:var(--muted); }
.memory-summary-status { margin:5px 0; font-size:11px; color:var(--muted); }
.memory-summary-status button { margin-left:6px; color:var(--fg); }
.memory-entry-list { display:grid; gap:10px; min-width:0; }
.memory-entry-list>.hint { margin:0; }
.memory-entry { min-width:0; }
.memory-entry-heading { display:flex; flex-wrap:wrap; align-items:center; gap:5px; color:var(--muted); font-size:11px; }
.memory-entry-actions { display:inline-flex; flex:none; align-items:center; gap:4px; margin-left:auto; }
.memory-delete-confirm { padding:3px 6px; border-radius:5px; color:var(--red); background:var(--red-wash); font-size:11px; line-height:18px; white-space:nowrap; }
.memory-entry p { margin:4px 0 0; line-height:1.6; font-size:12px; overflow-wrap:anywhere; white-space:pre-wrap; }
.memory-add label { display:grid; gap:5px; font-size:12px; font-weight:550; }
.memory-add-row { display:flex; align-items:center; justify-content:space-between; gap:8px; padding:0; min-height:28px; font-size:12px; font-weight:550; }
.memory-add-row>.icon-btn { flex:none; }
</style>

<style scoped>
.memory-dialog-layout { display:flex; flex-direction:column; flex:1; min-height:0; }
.memory-dialog-layout>.editor-form.memory-dialog-body { flex:1; min-height:0; align-content:start; align-items:start; gap:10px; padding:12px 16px; overflow-y:auto; overscroll-behavior:contain; overflow-anchor:none; }
.memory-dialog-body>input[type="search"] { height:32px; padding-block:5px; line-height:20px; }
.memory-dialog-layout>.dialog-actions { margin:0; padding:10px 16px; position:static; flex:none; }
</style>
