<script setup lang="ts">
import { onMounted, onBeforeUnmount, shallowRef } from "vue";
import { notices, dismissNotice } from "@/composables/useNotifications";
import BoostIcon from "./BoostIcon.vue";
const target = shallowRef<HTMLElement>(document.body);
let observer: MutationObserver | undefined;
onMounted(() => {
  observer = new MutationObserver(() => {
    const dialogs =
      document.querySelectorAll<HTMLDialogElement>("dialog[open]");
    const next = dialogs.item(dialogs.length - 1) || document.body;
    if (target.value !== next) target.value = next;
  });
  observer.observe(document.body, {
    childList: true,
    subtree: true,
    attributes: true,
    attributeFilter: ["open"],
  });
});
onBeforeUnmount(() => observer?.disconnect());
</script>
<template>
  <Teleport :to="target"
    ><TransitionGroup class="notification-center" tag="div" name="notice"
      ><article
        v-for="notice in notices"
        :key="notice.id"
        class="notice-card"
        :class="{ error: notice.error }"
        :role="notice.error ? 'alert' : 'status'"
      >
        <span class="notice-icon"
          ><BoostIcon
            :name="notice.error ? 'circle-alert' : 'circle-check'"
            :size="16"
        /></span>
        <div class="notice-copy">
          <p :title="notice.message">{{ notice.message }}</p>
        </div>
        <button
          class="icon-button"
          aria-label="关闭提示"
          @click="dismissNotice(notice.id)"
        >
          <BoostIcon name="x" :size="14" />
        </button></article></TransitionGroup
  ></Teleport>
</template>
