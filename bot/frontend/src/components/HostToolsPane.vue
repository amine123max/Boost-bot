<script setup lang="ts">
import { onBeforeUnmount, ref, watch } from 'vue';
import { api, ApiError, enc } from '../api';
import Icon from './Icon.vue';

type Plugin = {id:string;url:string};
interface HostActivity {
  agents:{providers?: {provider:string;running:number;waiting:number;progress:number|null;sessions?: {state:string;progress:number|null;updatedAt:number}[]}[];updatedAt:number};
  processes:{name:string;pid:number;provider?:string}[];
  matchingProcesses:number;
}
interface Tools {voiceModel:boolean;computerEnabled:boolean;computer:{available:boolean;reason?:string};permission:string;localPlugins:Plugin[];trustedBot:boolean}
interface LocalAgents {providers:{provider:string;available:boolean}[];sessions:{peer:string;title:string;provider:string;updatedAt:number}[]}
const props = defineProps<{botId:string;localPeer?:string}>();
const emit = defineEmits<{saved:[];localChat:[peer:string]}>();
const tools=ref<Tools>(), host=ref<HostActivity>(), error=ref(''), hostError=ref(''), busy=ref(false);
const local=ref<LocalAgents>(), localError=ref(''), creating=ref(false);
const name=ref(''), endpoint=ref(''), confirming=ref(false);
const loading=ref(false), observing=ref(false), configError=ref('');
let controller:AbortController|undefined;
const providers = [{id:'codex',name:'Codex'},{id:'claude',name:'Claude Code'},{id:'deepseek',name:'DeepSeek Harness'}];
const activity = (id:string) => host.value?.agents.providers?.find(provider => provider.provider === id);
const processes = (id:string) => host.value?.processes.filter(row => row.provider === id) ?? [];
const states: Record<string, string> = { working:'运行中', waiting:'等待输入', done:'已完成', stopped:'已停止', failed:'失败' };
async function load() {
  if (loading.value) return;
  const id=props.botId;
  loading.value=true;
  try { const value=await api<Tools>(`/bots/${enc(id)}/workspace-tools`); if(id===props.botId){tools.value=value;configError.value='';} }
  catch(e){ if(id===props.botId)configError.value=e instanceof ApiError && e.status===404 ? '当前宿主尚未提供工具配置，请用最新 Bot 服务重新打开工作台。' : (e as Error).message; }
  finally{loading.value=false;}
}
async function observe(){
  controller?.abort();
  const request=new AbortController();controller=request;
  observing.value=true;
  const discovery=api<LocalAgents>(`/bots/${enc(props.botId)}/local-agents`,{signal:request.signal})
    .then(result=>{if(!request.signal.aborted){local.value=result;localError.value='';}})
    .catch(e=>{if(!request.signal.aborted)localError.value=(e as Error).message;});
  try{
    const result=await api<HostActivity>(`/bots/${enc(props.botId)}/host-activity?name=%40agents`,{signal:request.signal});
    if(!request.signal.aborted){host.value=result;hostError.value='';}
  }catch(e){if(!request.signal.aborted)hostError.value=e instanceof ApiError && e.status===404 ? '当前服务尚未提供本机监控。' : (e as Error).message;}
  finally{await discovery;if(controller===request)observing.value=false;}
}
async function createSession(provider:string){
  if(creating.value)return;
  creating.value=true;localError.value='';
  const id=props.botId;
  try{
    const result=await api<{peer:string}>(`/bots/${enc(id)}/local-agents`,{method:'POST',body:{provider}});
    if(id===props.botId){emit('localChat',result.peer);void observe();}
  }catch(e){if(id===props.botId)localError.value=(e as Error).message;}
  finally{creating.value=false;}
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
  controller?.abort();tools.value=host.value=local.value=undefined;error.value=hostError.value=localError.value='';confirming.value=false;void load();void observe();
},{immediate:true});
onBeforeUnmount(()=>controller?.abort());
</script>

<template>
  <div class="host-tools">
    <section>
      <strong><Icon name="monitor" :size="15" />电脑控制</strong>
      <p v-if="configError" role="alert">{{ configError }}</p>
      <p v-else>{{ !tools ? '正在读取宿主配置。' : !tools.trustedBot ? '目录 Bot 不可使用电脑控制。' : !tools.computer.available ? '此宿主暂未提供可用的电脑控制驱动。' : tools.computerEnabled ? '已启用，按此智能体的授权规则执行。' : '可启用本机应用观察和输入操作。' }}</p>
      <button v-if="!tools || !tools.computer.available" type="button" class="quiet-button" :disabled="loading || busy" @click="load">{{ loading ? '正在检测…' : '重新检测宿主' }}</button>
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
      <div class="scan-row"><span role="status">{{ hostError || (!host ? '正在扫描本机进程与会话…' : '本机进程与近期会话') }}</span><button class="quiet-button" type="button" :disabled="observing" :aria-busy="observing" @click="observe">重新扫描</button></div>
      <p v-if="localError" role="status">{{ localError }}</p>
      <button v-if="localPeer" class="quiet-button" type="button" @click="emit('localChat','')">返回 Boost 对话</button>
        <ul class="providers">
          <li v-for="p in providers" :key="p.id">
            <details>
              <summary>{{ p.name }}<small>{{ !host ? '—' : activity(p.id)?.running ? activity(p.id)?.running + ' 运行中' : activity(p.id)?.waiting ? activity(p.id)?.waiting + ' 等待' : processes(p.id).length ? processes(p.id).length + ' 个进程' : '无活跃进程' }}</small></summary>
              <ul class="processes">
                <li v-for="process in processes(p.id)" :key="process.pid"><span>{{ process.name }}</span><code>{{ process.pid }}</code></li>
                <li v-for="(session, i) in activity(p.id)?.sessions" :key="i">
                  <span>{{ states[session.state] ?? '状态未知' }}<span v-if="session.progress != null"> · {{ session.progress }}%</span></span>
                  <time :datetime="new Date(session.updatedAt).toISOString()">{{ new Date(session.updatedAt).toLocaleTimeString() }}</time>
                </li>
              </ul>
              <p v-if="!processes(p.id).length && !activity(p.id)?.sessions?.length">没有可读取的近期会话或进程。</p>
              <template v-if="local">
                <button v-if="local.providers.some(row=>row.provider===p.id&&row.available)" class="quiet-button" type="button" :disabled="creating" @click="createSession(p.id)"><Icon name="plus" :size="14" />新建对话</button>
                <p v-else>未检测到可启动的 CLI。</p>
                <ul class="processes" v-if="local.sessions.some(row=>row.provider===p.id)">
                  <li v-for="session in local.sessions.filter(row=>row.provider===p.id)" :key="session.peer">
                    <button class="quiet-button" type="button" :aria-current="localPeer===session.peer?'page':undefined" @click="emit('localChat',session.peer)">{{ session.title }} · {{ new Date(session.updatedAt).toLocaleString() }}</button>
                  </li>
                </ul>
              </template>
            </details>
          </li>
        </ul>
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
    <section><strong><Icon name="voice" :size="15" />本机语音</strong><p>{{ !tools ? '语音状态暂不可用。' : tools.voiceModel ? '已安装语音模型。' : '未安装语音模型；仍可使用渠道已提供的转写。' }}</p><button class="quiet-button" type="button" :disabled="loading" @click="load">刷新语音状态</button></section>
    <p v-if="error" role="alert">{{ error }}</p>
  </div>
</template>

<style scoped>
.host-tools { display:grid; gap:14px; padding:4px 0; }
.host-tools section { display:grid; gap:6px; min-width:0; }
.host-tools section > button { justify-self:start; }
.host-tools strong,.host-tools button { display:inline-flex; gap:6px; align-items:center; }
.host-tools p { margin:0; font-size:var(--fs-xs); color:var(--muted); overflow-wrap:anywhere; }
.scan-row { display:flex; align-items:center; justify-content:space-between; gap:6px; min-height:32px; color:var(--muted); font-size:var(--fs-xs); }
.scan-row button { flex:none; white-space:nowrap; }
.providers details { width:100%; }
.providers small { float:inline-end; color:var(--muted); }
.host-input { display:flex; gap:5px; align-items:center; min-width:0; }
.host-input input { flex:1; min-width:0; padding:5px 6px; border:1px solid var(--line); border-radius:6px; }
.plugin-form { flex-wrap:wrap; }
.plugin-form input { flex:1 1 100%; }
ul { display:grid; gap:4px; padding:0; margin:0; list-style:none; }
li { display:flex; justify-content:space-between; gap:7px; font-size:var(--fs-xs); overflow-wrap:anywhere; }
.processes { max-height:180px; overflow:auto; padding-block:5px; }
summary { cursor:pointer; font-size:var(--fs-xs); }
</style>
