<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { api, enc } from '../api';
import Icon from './Icon.vue';

type Plugin = {id:string;url:string};
interface HostActivity {
  agents:{providers?: {provider:string;running:number;waiting:number;progress:number|null;sessions?: {state:string;progress:number|null;updatedAt:number}[]}[];updatedAt:number};
  processes:{name:string;pid:number}[];
  matchingProcesses:number;
}
interface Tools {voiceModel:boolean;computerEnabled:boolean;computer:{available:boolean;reason?:string};permission:string;localPlugins:Plugin[];trustedBot:boolean}
const props = defineProps<{botId:string}>();
const emit = defineEmits<{saved:[]}>();
const tools=ref<Tools>(), host=ref<HostActivity>(), error=ref(''), hostError=ref(''), busy=ref(false);
const name=ref(''), endpoint=ref(''), search=ref(''), confirming=ref(false);
let controller:AbortController|undefined;
const states: Record<string, string> = { working:'运行中', waiting:'等待输入', done:'已完成', stopped:'已停止', failed:'失败' };
async function load() {
  const id=props.botId;
  try { const value=await api<Tools>(`/bots/${enc(id)}/workspace-tools`); if(id===props.botId)tools.value=value; }
  catch(e){ if(id===props.botId)error.value=(e as Error).message; }
}
async function observe(){
  controller?.abort();
  const request=new AbortController();controller=request;
  hostError.value='';
  try{
    const result=await api<HostActivity>(`/bots/${enc(props.botId)}/host-activity?name=${enc(search.value.trim())}`,{signal:request.signal});
    if(!request.signal.aborted)host.value=result;
  }catch(e){if(!request.signal.aborted)hostError.value=(e as Error).message;}
}
async function save(body:Record<string,unknown>){
  if(busy.value)return;
  busy.value=true;error.value='';
  const id=props.botId;
  try{
    await api(`/bots/${enc(id)}/settings`,{method:'PUT',body});
    if(id!==props.botId)return;
    confirming.value=false;await load();emit('saved');
    return true;
  }catch(e){if(id===props.botId)error.value=(e as Error).message;}
  finally{busy.value=false;}
}
async function add(){
  if(await save({localPlugins:[...(tools.value?.localPlugins??[]),{id:name.value.trim(),url:endpoint.value.trim()}]})){
    name.value='';endpoint.value='';
  }
}
watch(()=>props.botId,()=>{
  controller?.abort();tools.value=host.value=undefined;error.value=hostError.value='';confirming.value=false;void load();
},{immediate:true});
onBeforeUnmount(()=>controller?.abort());
</script>

<template>
  <div class="host-tools">
    <section>
      <strong><Icon name="monitor" :size="15" />电脑控制</strong>
      <p>{{ !tools ? '正在读取宿主配置。' : !tools.trustedBot ? '目录 Bot 不可使用电脑控制。' : !tools.computer.available ? '此宿主暂未提供可用的电脑控制驱动。' : tools.computerEnabled ? '已启用，按此智能体的授权规则执行。' : '可启用本机应用观察和输入操作。' }}</p>
      <button v-if="tools?.computerEnabled" type="button" class="quiet-button" :disabled="busy" @click="save({computerUse:{enabled:false}})">停用</button>
      <button v-else-if="tools?.trustedBot && tools.computer.available" type="button" class="quiet-button" @click="confirming = true">启用电脑控制</button>
      <div v-if="confirming" class="host-confirm">
        <p>仅在宿主会话中使用，点击和输入需要由你批准。</p>
        <button type="button" class="primary-button" :disabled="busy" @click="save({computerUse:{enabled:true,approval:'ask-input'}})">确认启用</button>
        <button type="button" class="quiet-button" @click="confirming=false">取消</button>
      </div>
    </section>
    <section>
      <strong><Icon name="activity" :size="15" />本机任务与外部 Agent</strong>
      <form class="host-input" @submit.prevent="observe"><input v-model="search" maxlength="80" placeholder="可按进程名筛选" aria-label="进程名" /><button class="quiet-button" type="submit">读取</button></form>
      <p v-if="hostError" role="alert">{{ hostError }}</p>
      <template v-if="host && !hostError">
        <ul class="providers" v-if="host.agents.providers?.length">
          <li v-for="p in host.agents.providers" :key="p.provider">
            <details v-if="p.sessions?.length">
              <summary>{{ {codex:'Codex',claude:'Claude',deepseek:'DeepSeek'}[p.provider] || p.provider }} · {{ p.running }} 运行 · {{ p.waiting }} 等待</summary>
              <ul class="processes">
                <li v-for="(session, i) in p.sessions" :key="i">
                  <span>{{ states[session.state] ?? '状态未知' }}<span v-if="session.progress != null"> · {{ session.progress }}%</span></span>
                  <time :datetime="new Date(session.updatedAt).toISOString()">{{ new Date(session.updatedAt).toLocaleTimeString() }}</time>
                </li>
              </ul>
            </details>
            <span v-else>{{ {codex:'Codex',claude:'Claude',deepseek:'DeepSeek'}[p.provider] || p.provider }} · 无近期会话</span>
          </li>
        </ul>
        <p v-else>未发现可读取的外部 Agent 日志。</p>
        <details><summary>{{ host.matchingProcesses }} 个匹配进程</summary>
          <ul class="processes"><li v-for="p in host.processes" :key="p.pid"><span>{{ p.name }}</span><code>{{ p.pid }}</code></li></ul>
        </details>
      </template>
    </section>
    <section>
      <strong><Icon name="link" :size="15" />本机 MCP 插件</strong>
      <p v-if="tools && (!tools.trustedBot || tools.permission !== 'full')">可信且具备完全访问权限的 Bot 可添加本机插件。</p>
      <ul v-if="tools?.localPlugins.length" class="plugins"><li v-for="plugin in tools.localPlugins" :key="plugin.id">
        <span :title="plugin.url">{{ plugin.id }}</span><button type="button" :aria-label="'移除 '+plugin.id" :disabled="busy"
          @click="save({localPlugins:tools?.localPlugins.filter(row=>row.id!==plugin.id)})"><Icon name="trash" :size="15" /></button>
      </li></ul>
      <form v-if="tools?.trustedBot && tools.permission === 'full'" class="host-input plugin-form" @submit.prevent="add">
        <input v-model="name" required maxlength="24" placeholder="插件标识" aria-label="插件标识" />
        <input v-model="endpoint" required maxlength="240" placeholder="http://127.0.0.1:3001/mcp" aria-label="MCP 地址" />
        <button type="submit" class="quiet-button" :disabled="busy"><Icon name="plus" :size="14" />添加插件</button>
      </form>
    </section>
    <section><strong><Icon name="voice" :size="15" />本机语音</strong><p>{{ tools?.voiceModel ? '已安装语音模型。' : '未安装语音模型；仍可使用渠道已提供的转写。' }}</p></section>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.host-tools { display:grid; gap:10px; }
.host-tools section { display:grid; gap:6px; min-width:0; padding:10px; border:1px solid var(--line); border-radius:10px; }
.host-tools strong,.host-tools button { display:inline-flex; gap:6px; align-items:center; }
.host-tools p { margin:0; font-size:var(--fs-xs); color:var(--muted); overflow-wrap:anywhere; }
.host-input { display:flex; gap:5px; align-items:center; min-width:0; }
.host-input input { flex:1; min-width:0; padding:5px 6px; border:1px solid var(--line); border-radius:6px; }
.plugin-form { flex-wrap:wrap; }
.plugin-form input { flex:1 1 100%; }
ul { display:grid; gap:4px; padding:0; margin:0; list-style:none; }
li { display:flex; justify-content:space-between; gap:7px; font-size:var(--fs-xs); overflow-wrap:anywhere; }
.processes { max-height:180px; overflow:auto; padding-block:5px; }
summary { cursor:pointer; font-size:var(--fs-xs); }
</style>
