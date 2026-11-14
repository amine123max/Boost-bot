<script setup lang="ts">
import {
  nextTick,
  onBeforeUnmount,
  onMounted,
  reactive,
  ref,
  watch,
} from "vue";
import type { Bot, Route } from "../types";
import { api, enc, stream, download } from "../api";
import { useConversation } from "../conversation";
import {
  attachBridge,
  currentEnv,
  watchEnv,
  safeExternalUrl,
  pickFiles,
} from "../../compat/lib/bot-bridge.js";
import Icon from "./Icon.vue";
import SettingsButton from './SettingsButton.vue';
import BotAvatar from "./BotAvatar.vue";
import ChatView from "./ChatView.vue";
import Modal from "./Modal.vue";

const props = defineProps<{ bot: Bot; configure: boolean; models?: string[] }>();
const emit = defineEmits<{ chat: []; settings: []; edit: []; delete: []; menu: []; refresh: [] }>();
const route = ref<Route>({ kind: "chat", id: props.bot.id }),
  chat = reactive(useConversation(route, () => {}));
const frame = ref<HTMLIFrameElement>(),
  source = ref(""),
  error = ref(""),
  loaded = ref(false),
  showChat = ref(false);
const externalUrl = ref("");
let confirmUrl: ((allowed: boolean) => void) | undefined;
const controller = new AbortController();
let disposed = false,
  timeout: ReturnType<typeof setTimeout> | undefined;
let bridge: ReturnType<typeof attachBridge> | undefined,
  stopEnv: (() => void) | undefined;
const appPath = `/bots/${enc(props.bot.id)}/app`;
function gesture() {
  if (navigator.userActivation && !navigator.userActivation.isActive)
    throw new Error("请点击后重试");
}
function resolveUrl(allowed: boolean) {
  confirmUrl?.(allowed);
  confirmUrl = undefined;
  if (allowed) window.open(externalUrl.value, "_blank", "noopener,noreferrer");
  externalUrl.value = "";
}
watch(
  () => chat.running,
  (busy) => bridge?.post("turn", { busy }),
);
watch(
  () => chat.pending.length,
  (count) => {
    if (count) showChat.value = true;
  },
);

async function load() {
  try {
    const d = await api<{
      base: string;
      ref?: { removed?: { security?: boolean } };
    }>(appPath);
    if (!d.base || d.ref?.removed?.security)
      throw new Error("此应用暂不可用，可继续使用智能体对话。");
    const base = new URL(d.base, location.origin);
    if (
      base.origin !== location.origin ||
      !base.pathname.startsWith("/boost-bot/amb/botapp/")
    )
      throw new Error("应用地址无效");
    const readLocale = async (
      lang: string,
    ): Promise<Record<string, string>> => {
      const r = await fetch(new URL(`locales/${lang}.json`, base), {
        signal: controller.signal,
      });
      return r.ok ? await r.json() : {};
    };
    const [english, chinese] = await Promise.all([
      readLocale("en"),
      readLocale("zh-CN"),
    ]);
    if (disposed) return;
    await nextTick();
    const env = () => ({
      ...currentEnv(),
      lang: "zh-CN",
      sample: false,
      desktop: false,
      messages: { ...english, ...chinese },
      bot: { id: props.bot.id, name: props.bot.name, avatar: "" },
    });
    bridge = attachBridge(frame.value!, {
      init: env,
      readFile: ({ path }: { path: string }) =>
        api(`${appPath}/file?path=${enc(path)}`),
      readImage: ({ path }: { path: string }) =>
        api(`${appPath}/image?path=${enc(path)}`),
      openFile: async ({ path }: { path: string }) => {
        gesture();
        await download(
          `${appPath}/download?path=${enc(path)}`,
          path.split(/[\\/]/).pop() || "download",
        );
        return { ok: true };
      },
      openUrl: async ({ url }: { url: string }) => {
        gesture();
        const safe = safeExternalUrl(url);
        if (!safe) throw new Error("链接无效");
        if (confirmUrl) return false;
        externalUrl.value = safe;
        return new Promise<boolean>((resolve) => {
          confirmUrl = resolve;
        });
      },
      send: ({ text, action }: { text?: string; action?: unknown }) => {
        if (chat.running)
          throw new Error("当前任务仍在执行，请等待完成或停止后重试。");
        chat.draft = action
          ? `[ui-action] ${JSON.stringify(action)}${text ? "\n" + text : ""}`
          : text || "";
        void chat.send();
        return true;
      },
      stop: chat.stop,
      subscribe: () => true,
      pickFile: async (options: { accept?: string; multiple?: boolean }) => {
        gesture();
        const files = (await pickFiles(options)) as Array<{
          name: string;
          size: number;
          base64: string;
        }>;
        return Promise.all(
          files.map(async (f) => ({
            name: f.name,
            size: f.size,
            ...(await api(`${appPath}/inbox`, {
              method: "POST",
              body: { name: f.name, base64: f.base64 },
            })),
          })),
        );
      },
      openChannels: () => emit("settings"),
      reportError: () => {
        clearTimeout(timeout);
        error.value = "应用界面加载失败，可打开对话继续工作。";
      },
      rendered: () => {
        clearTimeout(timeout);
        loaded.value = true;
        return true;
      },
    });
    stopEnv = watchEnv(() => bridge?.post("env", env()));
    source.value = new URL("index.html", base).href;
    timeout = setTimeout(() => {
      if (!loaded.value) error.value = "应用界面加载超时，可打开对话继续工作。";
    }, 15000);
    void stream(`${appPath}/watch`, {
      signal: controller.signal,
      onEvent: (name, data) => {
        if (name === "file") bridge?.post("file", data);
      },
    }).catch((e) => {
      if (!disposed)
        error.value = `应用更新连接已断开：${(e as Error).message}`;
    });
  } catch (e) {
    if (!disposed) error.value = (e as Error).message;
  }
}
onMounted(load);
onBeforeUnmount(() => {
  disposed = true;
  clearTimeout(timeout);
  controller.abort();
  bridge?.close();
  stopEnv?.();
  confirmUrl?.(false);
});
</script>
<template>
  <section class="catalog-app-view">
    <header class="workspace-head">
      <button
        class="icon-button mobile-menu"
        aria-label="打开导航"
        @click="emit('menu')"
      >
        <Icon name="menu" /></button
      ><BotAvatar :bot="bot" :size="32" />
      <h1>{{ bot.name }}</h1>
      <span class="head-spacer" /><button
        class="quiet-button"
        @click="showChat = !showChat"
      >
        <Icon name="chat" />{{ showChat ? "关闭对话" : "对话与审批" }}</button
      ><button class="quiet-button" @click="emit('chat')">独立会话</button>
      <SettingsButton label="智能体设置" @click="emit('edit')" />
      <button v-if="configure" class="icon-btn" aria-label="删除智能体" @click="emit('delete')"><Icon name="trash" :size="16" /></button>
    </header>
    <div v-if="error || chat.error" class="error-banner" role="alert">
      {{ error || chat.error }}
    </div>
    <div class="catalog-app-layout" :class="{ 'with-chat': showChat }">
      <iframe
        ref="frame"
        :src="source || undefined"
        :title="bot.name"
        sandbox="allow-scripts allow-forms"
        referrerpolicy="no-referrer"
      /><ChatView
        v-if="showChat"
        :chat="chat"
        :bot="bot"
        :bots="[bot]"
        :models="models || []"
        :configure="configure"
          @refresh="emit('refresh')"
        @edit="emit('edit')"
        @collaborate="emit('chat')"
      />
    </div>
    <Modal v-if="externalUrl" title="打开外部链接" @close="resolveUrl(false)"
      ><div class="editor-form">
        <p class="external-url">{{ externalUrl }}</p>
        <footer class="dialog-actions">
          <button data-dialog-close class="quiet-button" @click="resolveUrl(false)">取消</button
          ><button class="primary-button" @click="resolveUrl(true)">
            打开链接
          </button>
        </footer>
      </div></Modal
    >
  </section>
</template>
