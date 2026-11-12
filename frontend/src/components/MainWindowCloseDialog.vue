<script setup lang="ts">
import { onBeforeUnmount, onMounted, ref } from "vue";
import { listen, type UnlistenFn } from "@tauri-apps/api/event";
import BoostDialog from "./BoostDialog.vue";
import BoostIcon from "./BoostIcon.vue";
import { appClient } from "@/lib/api/app-client";
import { getAppErrorMessage, isTauriRuntime } from "@/lib/api/transport";
import { boost, applyAppearance } from "@/composables/useBoost";
const open = ref(true);
const remember = ref(false);
const busy = ref(false);
const error = ref("");
let disposed = false;
let unlisten: UnlistenFn | undefined;
onMounted(async () => {
  document.documentElement.classList.add("close-prompt-window");
  try {
    if (isTauriRuntime()) {
      const stop = await listen<string>("main-window-close-requested", () => {
        remember.value = false;
        error.value = "";
        open.value = true;
      });
      if (disposed) {
        stop();
        return;
      }
      unlisten = stop;
    }
    boost.settings = await appClient.getSettings();
    applyAppearance();
  } catch (e) {
    error.value = getAppErrorMessage(e);
  } finally {
    if (isTauriRuntime() && !disposed)
      await appClient.closePromptReady().catch((e) => {
        error.value = getAppErrorMessage(e);
      });
  }
});
onBeforeUnmount(() => {
  disposed = true;
  unlisten?.();
  document.documentElement.classList.remove("close-prompt-window");
});
async function cancel() {
  if (busy.value) return;
  try {
    await appClient.showMainWindow();
    open.value = false;
  } catch (e) {
    error.value = getAppErrorMessage(e);
  }
}
async function confirm(action: "exit" | "minimize") {
  if (busy.value) return;
  busy.value = true;
  error.value = "";
  try {
    if (await appClient.closeMainWindow(action, remember.value))
      open.value = false;
  } catch (e) {
    error.value = getAppErrorMessage(e);
  } finally {
    busy.value = false;
  }
}
</script>
<template>
  <BoostDialog v-if="open" title="关闭 Boost" @close="cancel">
    <template #title-leading
      ><span class="close-app-mark"
        ><img
          src="/boost-assets/images/favicon.png"
          alt=""
          width="26"
          height="26" /></span
    ></template>
    <label class="close-remember"
      ><input
        v-model="remember"
        type="checkbox"
        :disabled="busy"
      />记住我的选择</label
    >
    <p v-if="error" class="close-error" role="alert">{{ error }}</p>
    <template #footer>
      <div class="close-prompt-actions">
        <button
          class="close-minimize"
          :disabled="busy"
          @click="confirm('minimize')"
        >
          <BoostIcon name="minus" :size="17" />最小化
        </button>
        <button class="close-exit" :disabled="busy" @click="confirm('exit')">
          <BoostIcon name="power" :size="16" />退出
        </button>
      </div>
    </template>
  </BoostDialog>
</template>
<style>
html.close-prompt-window,
.close-prompt-window body,
.close-prompt-window #app {
  min-width: 0;
  width: 100%;
  height: 100%;
  background: transparent;
}
.close-prompt-window .modal {
  width: calc(100% - 16px);
  max-width: none;
  height: calc(100% - 16px);
  max-height: none;
  margin: 8px;
  border: 1px solid var(--border);
  border-radius: 16px;
  box-shadow: 0 2px 6px #0002;
}
.close-prompt-window .modal::backdrop {
  background: transparent;
}
.close-prompt-window .modal-heading {
  padding: 18px 20px 10px;
  gap: 12px;
  align-items: center;
}
.close-prompt-window .modal-heading h2 {
  flex: 1;
  font-size: 18px;
  font-weight: 700;
  letter-spacing: -0.2px;
}
.close-app-mark {
  display: grid;
  place-items: center;
  width: 40px;
  height: 40px;
  background: transparent;
  border: 0;
}
.close-app-mark img {
  object-fit: contain;
}
.close-prompt-window .modal-heading .icon-button {
  width: 26px;
  height: 26px;
  border-radius: 7px;
  color: var(--muted);
}
.close-prompt-window .modal-content {
  display: flex;
  flex-direction: column;
  justify-content: center;
  padding: 10px 22px 16px;
}
.close-remember {
  display: inline-flex;
  align-items: center;
  gap: 10px;
  font-size: 16px;
  font-weight: 400;
  color: var(--muted);
  cursor: pointer;
}
.close-remember input {
  appearance: none;
  display: grid;
  place-content: center;
  margin: 0;
  width: 17px;
  height: 17px;
  border: 1px solid var(--muted);
  border-radius: 5px;
  background: transparent;
}
.close-remember input:checked {
  border-color: var(--blue);
  background: var(--blue);
}
.close-remember input:checked::after {
  content: "";
  width: 8px;
  height: 4px;
  margin-top: -2px;
  border: solid var(--on-primary);
  border-width: 0 0 2px 2px;
  transform: rotate(-45deg);
}
.close-remember input:focus-visible {
  outline: 2px solid var(--blue);
  outline-offset: 3px;
}
.close-prompt-window .modal-footer {
  min-height: 0;
  padding: 14px 20px 18px;
  border-top: 1px solid color-mix(in srgb, var(--border) 65%, transparent);
  background: color-mix(in srgb, var(--text) 1.5%, var(--dialog));
}
.close-prompt-actions {
  display: flex;
  justify-content: space-between;
  width: 100%;
  gap: 12px;
}
.close-prompt-actions button {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  flex: 1;
  gap: 8px;
  min-height: 40px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 16px;
  font-weight: 400;
}
.close-minimize {
  background: var(--surface);
  color: var(--text);
}
.close-minimize:hover {
  background: var(--hover);
}
.close-prompt-actions .close-exit {
  color: var(--red);
  background: color-mix(in srgb, var(--red) 6%, var(--dialog));
  border-color: color-mix(in srgb, var(--red) 20%, var(--border));
}
.close-exit:hover {
  background: color-mix(in srgb, var(--red) 12%, var(--dialog));
}
.close-error {
  color: var(--red);
  font-size: 12px;
  margin-top: 12px;
}
</style>
