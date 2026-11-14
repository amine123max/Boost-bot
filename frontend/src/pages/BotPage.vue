<script setup lang="ts">
import { onMounted, onBeforeUnmount, nextTick, ref, watch } from 'vue';
import { useRouter } from 'vue-router';
import BoostBotAvatar from '@/components/BoostBotAvatar.vue';
import { botClient } from '@/lib/api/bot-client';
import { appClient } from '@/lib/api/app-client';
import { isTauriRuntime } from '@/lib/api/transport-runtime';
import { getAppErrorMessage } from '@/lib/api/transport';
import { botAppearance, setBotAppearance } from '@/composables/useBotAppearance';
import { consumeBotLaunch } from '@/composables/useBotLaunch';
import { markStartupContentReady } from '@/composables/useStartupReady';
import { boost, initialize, saveSettings } from '@/composables/useBoost';
import { uiPreferences } from '@/composables/useUiPreferences';
const router = useRouter();
const source = ref(''), error = ref(''), busy = ref(false), loaded = ref(false);
const frame = ref<HTMLIFrameElement>();
const surface = ref<HTMLElement>();
const launch = consumeBotLaunch();
const waitingForGesture = ref(false);
const pageContentReady = ref(false);
const opening = { '--bot-origin-x': launch.x, '--bot-origin-y': launch.y };
const revealing = ref(false), revealed = ref(false);
let revealAnimation: Animation | undefined;
let disposed = false;
let contentReadyPending = false;
let readyTimeout: ReturnType<typeof setTimeout> | undefined;
async function connect() {
  if (busy.value) return;
  busy.value = true; pageContentReady.value = false; error.value = ''; loaded.value = false; revealed.value = false;
  source.value = '';
  try {
    if (!boost.connected) {
      await initialize();
      if (!boost.connected) throw new Error(boost.error || 'Boost 服务尚未连接');
    }
    const launch = await botClient.open();
    if (disposed) return;
    const url = new URL(launch.url, location.href);
    if (url.origin !== location.origin && !(url.protocol === 'http:' && url.hostname === '127.0.0.1')) throw new Error('Boost Bot 返回了无效地址');
    url.searchParams.set('boostTheme', document.documentElement.dataset.theme || 'system');
    url.searchParams.set('boostAccent', uiPreferences.themeColor);
    source.value = url.href;
    clearTimeout(readyTimeout);
    readyTimeout = setTimeout(() => {
      if (pageContentReady.value || disposed) return;
      // A slow or missing ready handshake must not leave the workspace covered forever.
      loaded.value = true;
      void signalContentReady();
    }, 30_000);
  } catch (e) { if (!disposed) { error.value = getAppErrorMessage(e); markStartupContentReady(); } }
  finally { busy.value = false; }
}
function sync() {
  if (!source.value) return;
  const themeMode = boost.settings?.theme === 'business' ? 'light' : boost.settings?.theme === 'tech' ? 'system' : 'dark';
  frame.value?.contentWindow?.postMessage({ type: 'boost:appearance', preferences: { ...botAppearance }, theme: themeMode, accent: uiPreferences.themeColor, canShowDirectory: isTauriRuntime() }, new URL(source.value).origin);
}
function onFrameLoad() {
  loaded.value = true;
  void signalContentReady();
}
function message(event: MessageEvent) {
  if (!source.value || event.source !== frame.value?.contentWindow || event.origin !== new URL(source.value).origin) return;
  if (event.data?.type === 'boost:directory:show') {
    const id = event.data.id, directory = event.data.path;
    const result = (error?: string) => frame.value?.contentWindow?.postMessage({ type: 'boost:directory:result', id, error }, event.origin);
    if (!isTauriRuntime() || typeof id !== 'string' || typeof directory !== 'string' || !directory || directory.length > 4096 || directory.includes('\0')) { result('当前环境不支持显示本地目录'); return; }
    void appClient.openInFileManager(directory).then(() => result()).catch(e => result(getAppErrorMessage(e)));
    return;
  }
  if (event.data?.type === 'boost:bot:ready') { loaded.value = true; sync(); }
  if (event.data?.type === 'boost:workspace:content-ready') void signalContentReady();
  if (event.data?.type === 'boost:appearance:open') void router.push('/settings/?tab=bot');
  if (event.data?.type === 'boost:appearance:changed') setBotAppearance(event.data.preferences);
  if (event.data?.type === 'boost:bot:back') void back();
  if (event.data?.type === 'boost:theme' && ['light', 'dark', 'system'].includes(event.data.mode)) {
    const theme = event.data.mode === 'light' ? 'business' : event.data.mode === 'system' ? 'tech' : 'dark';
    const origin = event.data.origin, box = frame.value?.getBoundingClientRect();
    const point = origin && Number.isFinite(origin.x) && Number.isFinite(origin.y) ? { x: origin.x + (box?.left || 0), y: origin.y + (box?.top || 0) } : undefined;
    void saveSettings({ theme }, point).catch(e => { error.value = getAppErrorMessage(e); });
  }
}
async function signalContentReady() {
  if (disposed || pageContentReady.value || contentReadyPending) return;
  contentReadyPending = true;
  try {
    await reveal();
    if (disposed) return;
    await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
    if (!disposed) {
      pageContentReady.value = true;
      clearTimeout(readyTimeout);
      markStartupContentReady();
    }
  } finally {
    contentReadyPending = false;
  }
}
async function reveal() {
  if (revealing.value || revealed.value || disposed) return;
  await nextTick();
  await Promise.race([document.fonts.ready, new Promise(resolve => setTimeout(resolve, 1500))]);
  await new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve())));
  const panel = surface.value;
  if (!panel || disposed) return;
  if (launch.origin === 'center') {
    revealed.value = true;
    return;
  }
  revealing.value = true;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const x = Number.parseFloat(launch.x), y = Number.parseFloat(launch.y);
  const radius = Math.ceil(Math.hypot(Math.max(x, innerWidth - x), Math.max(y, innerHeight - y)));
  const frames = reduced ? [{ opacity: .4 }, { opacity: 1 }] : [
    { clipPath: `circle(22px at ${x}px ${y}px)`, opacity: .5 },
    { clipPath: `circle(${radius}px at ${x}px ${y}px)`, opacity: 1 },
  ];
  try {
    revealAnimation = panel.animate(frames, { duration: reduced ? 180 : 1050, easing: 'cubic-bezier(.4, 0, .2, 1)', fill: 'both' });
    await revealAnimation.finished;
  } catch { /* Content remains accessible if the Web Animations API is unavailable. */ }
  finally {
    revealed.value = true; revealing.value = false;
    revealAnimation?.cancel(); revealAnimation = undefined;
  }
}
function back() { return router.push('/'); }
watch(botAppearance, sync, { deep: true });
watch(() => boost.settings?.theme, sync);
watch(() => uiPreferences.themeColor, sync);
watch(() => boost.ready, ready => { if (ready && !source.value) void connect(); }, { immediate: true });
watch(() => boost.error, value => { if (!boost.connected && value) error.value = value; });
onMounted(() => { window.addEventListener('message', message); });
onBeforeUnmount(() => { disposed = true; revealAnimation?.cancel(); clearTimeout(readyTimeout); window.removeEventListener('message', message); });
watch(error, value => { if (value) markStartupContentReady(); });
</script>
<template>
  <section class="bot-workspace" :style="opening" aria-label="Boost 智能体工作台" data-bot-workspace :data-bot-origin="launch.origin" :data-bot-revealing="revealing">
    <div ref="surface" class="bot-workspace-surface" :class="{ 'is-visible': launch.origin === 'center' || revealing || revealed }" data-bot-surface>
    <iframe v-if="source" ref="frame" :src="source" title="Boost Bot" class="bot-runtime-frame" allow="clipboard-read; clipboard-write" referrerpolicy="no-referrer" @load="onFrameLoad" />
    </div>
    <div v-if="waitingForGesture" class="bot-connecting" role="status"><BoostBotAvatar :size="90" /><h2>双击 Boost 动态智能体进入 Bot</h2><p>进入后，双击 Bot 左上角的 Boost 动态智能体即可返回。</p><button class="primary" @click="back">返回 Boost</button></div>
    <div v-else-if="error" class="bot-connecting" role="alert"><BoostBotAvatar :size="90" /><h2>智能体暂时无法启动</h2><p>{{ error }}</p><button class="primary" @click="connect">重试连接</button></div>
  </section>
</template>
<style scoped>
.bot-workspace { position: fixed; inset: 0; z-index: 40; background: var(--bg); }
.bot-workspace-surface { position: absolute; inset: 0; display: flex; flex-direction: column; visibility: hidden; }
.bot-workspace-surface.is-visible { visibility: visible; }
.bot-runtime-frame { flex: 1; min-height: 0; width: 100%; border: 0; background: var(--bg); }
.bot-connecting { position: absolute; inset: 0; display: flex; align-items: center; justify-content: center; flex-direction: column; gap: 20px; background: var(--bg); padding: 32px; text-align: center; }
.bot-connecting p { max-width: 560px; color: var(--muted); overflow-wrap: anywhere; }
</style>
