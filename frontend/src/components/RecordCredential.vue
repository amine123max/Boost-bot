<script setup lang="ts">
import { ref, onDeactivated, onBeforeUnmount } from "vue";
import BoostIcon from "./BoostIcon.vue";
import { copyText, notify } from "@/composables/useBoost";
import { getAppErrorMessage } from "@/lib/api/transport";
const props = defineProps<{
  label: string;
  placeholder: string;
  read: () => Promise<string>;
  disabled?: boolean;
}>();
const value = ref(""),
  busy = ref(false);
let epoch = 0;
function clear() {
  epoch++;
  value.value = "";
}
async function toggle() {
  if (value.value) {
    clear();
    return;
  }
  busy.value = true;
  const current = epoch;
  try {
    const result = await props.read();
    if (!result) throw new Error("后端未返回密钥明文");
    if (current === epoch) value.value = result;
  } catch (e) {
    notify(`读取密钥失败: ${getAppErrorMessage(e)}`, true);
  } finally {
    busy.value = false;
  }
}
async function copy() {
  busy.value = true;
  try {
    const result = value.value || (await props.read());
    if (!result) throw new Error("后端未返回密钥明文");
    await copyText(result);
  } catch (e) {
    notify(`复制密钥失败: ${getAppErrorMessage(e)}`, true);
  } finally {
    busy.value = false;
  }
}
onDeactivated(clear);
onBeforeUnmount(clear);
</script>
<template>
  <div class="record-credential">
    <code
      :title="value || placeholder"
      :aria-label="`${label}${value ? '明文' : '标识'}`"
      >{{ busy && !value ? "读取中…" : value || placeholder }}</code
    >
    <button
      class="icon-button"
      :disabled="disabled || busy"
      :aria-label="`${value ? '隐藏' : '查看'} ${label}`"
      :aria-pressed="!!value"
      @click="toggle"
    >
      <BoostIcon :name="value ? 'eye-off' : 'eye'" :size="15" />
    </button>
    <slot name="copy"
      ><button
        class="icon-button"
        :disabled="disabled || busy"
        :aria-label="`复制 ${label}`"
        @click="copy"
      >
        <BoostIcon name="copy" :size="15" /></button
    ></slot>
  </div>
</template>
