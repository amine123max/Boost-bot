<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue';
import type { Bot, CatalogEntry } from '../types';
import { api, enc } from '../api';
import { attachBridge, currentEnv, watchEnv } from '../../compat/lib/bot-bridge.js';
import BotAvatar from './BotAvatar.vue';
import Icon from './Icon.vue';
import HelpTip from './HelpTip.vue';

const props = defineProps<{ entry: CatalogEntry; configure: boolean; busy: boolean; activationError?: string }>();
const emit = defineEmits<{ activate: []; menu: []; refresh: [] }>();
const name = computed(() => typeof props.entry.name === 'string' ? props.entry.name : props.entry.name['zh-CN'] || props.entry.name.en || props.entry.id);
const avatar = computed(() => ({ id: props.entry.id, name: name.value }) as Bot);
const frame = ref<HTMLIFrameElement>(), source = ref(''), error = ref(''), notice = ref(''), loaded = ref(false);
const controller = new AbortController();
let bridge: ReturnType<typeof attachBridge> | undefined;
let stopEnv: (() => void) | undefined;
let timeout: ReturnType<typeof setTimeout> | undefined;
const appPath = `/catalog/${enc(props.entry.id)}`;
function requireBot() { notice.value = '请先点击“对话与审批”启用此智能体。'; return false; }
async function load() {
  try {
    const data = await api<{ base: string }>(`${appPath}/preview`, { method: 'POST', body: {}, signal: controller.signal });
    const base = new URL(data.base, location.origin);
    if (base.origin !== location.origin || !base.pathname.startsWith('/boost-bot/amb/botapp/')) throw new Error('应用地址无效');
    const locale = async (lang: string) => {
      const response = await fetch(new URL(`locales/${lang}.json`, base), { signal: controller.signal });
      return response.ok ? response.json() : {};
    };
    const [english, chinese] = await Promise.all([locale('en'), locale('zh-CN')]);
    if (controller.signal.aborted) return;
    await nextTick();
    const env = () => ({ ...currentEnv(), lang: 'zh-CN', sample: true, desktop: false, messages: { ...english, ...chinese }, bot: { id: null, name: name.value, avatar: '' } });
    bridge = attachBridge(frame.value!, {
      init: env,
      readFile: ({ path }: { path: string }) => api(`${appPath}/file?path=${enc(path)}`, { signal: controller.signal }),
      subscribe: () => true,
      send: requireBot, stop: requireBot, openFile: requireBot, openUrl: requireBot, openChannels: requireBot,
      pickFile: () => { requireBot(); return []; },
      readImage: () => { requireBot(); return null; },
      reportError: () => { clearTimeout(timeout); error.value = '功能页面加载失败，请重试。'; },
      rendered: () => { clearTimeout(timeout); loaded.value = true; return true; },
    });
    stopEnv = watchEnv(() => bridge?.post('env', env()));
    source.value = new URL('index.html', base).href;
    timeout = setTimeout(() => { if (!loaded.value) error.value = '功能页面加载超时，请重试。'; }, 15000);
  } catch (e) { if (!controller.signal.aborted) error.value = (e as Error).message; }
}
onMounted(load);
onBeforeUnmount(() => { controller.abort(); clearTimeout(timeout); bridge?.close(); stopEnv?.(); });
</script>
<template>
  <section class="catalog-app-view">
    <header class="workspace-head">
      <button class="icon-button mobile-menu" aria-label="打开导航" @click="emit('menu')"><Icon name="menu" /></button>
      <BotAvatar :bot="avatar" :size="32" /><h1>{{ name }}</h1>
      <HelpTip text="当前为功能预览，使用示例内容；点击对话与审批后才创建智能体。" label="功能预览说明" />
      <span class="head-spacer" />
      <button class="icon-button" aria-label="刷新功能" :disabled="busy" @click="emit('refresh')"><Icon name="refresh" /></button>
      <button class="quiet-button" :disabled="busy || !configure" @click="emit('activate')"><Icon name="chat" />{{ busy ? '正在启用…' : '对话与审批' }}</button>
    </header>
    <div v-if="error || activationError" class="error-banner" role="alert">{{ error || activationError }}</div>
    <div v-if="notice" class="notice-banner" role="status">{{ notice }}</div>
    <div class="catalog-app-layout preview-layout">
      <div v-if="!loaded && !error" class="empty-state preview-loading" role="status">正在加载功能…</div>
      <iframe ref="frame" :src="source || undefined" :title="name + '功能预览'" sandbox="allow-scripts allow-forms" referrerpolicy="no-referrer" />
    </div>
  </section>
</template>
<style scoped>
.preview-layout { position: relative; }
.preview-loading { position: absolute; inset: 0; pointer-events: none; }
</style>
