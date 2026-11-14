<script setup lang="ts">
import { computed, ref } from "vue";
import Icon from "./Icon.vue";
import { settingsGroups, settingsSections } from "../settings-navigation";
defineProps<{ selected: string; busy: boolean }>();
defineEmits<{ select: [id: string]; exit: [] }>();
const query = ref("");
const groups = computed(() =>
  settingsGroups
    .map((group) => ({
      ...group,
      sections: settingsSections.filter(
        (section) =>
          section.group === group.id &&
          `${section.label} ${section.keywords}`
            .toLowerCase()
            .includes(query.value.trim().toLowerCase()),
      ),
    }))
    .filter((group) => group.sections.length),
);
</script>
<template>
  <div class="settings-navigation">
    <label class="settings-search"
      ><Icon name="search" :size="16" /><input
        v-model="query"
        type="search"
        aria-label="搜索设置"
        placeholder="搜索设置"
    /></label>
    <nav class="preferences-nav" aria-label="设置分类">
      <section
        v-for="group in groups"
        :key="group.id"
        class="settings-nav-group"
        :aria-label="group.label"
      >
        <h3>{{ group.label }}</h3>
        <button
          v-for="section in group.sections"
          :key="section.id"
          type="button"
          :disabled="busy"
          :aria-current="selected === section.id ? 'page' : undefined"
          @click="$emit('select', section.id)"
        >
          <Icon :name="section.icon" :size="18" /><span>{{
            section.label
          }}</span>
        </button>
      </section>
      <div v-if="!groups.length" class="settings-search-empty" role="status">
        没有匹配的设置<button class="quiet-button" @click="query = ''">
          清除搜索
        </button>
      </div>
    </nav>
    <button
      class="settings-return"
      type="button"
      :disabled="busy"
      @click="$emit('exit')"
    >
      <Icon name="back" :size="17" />返回工作台
    </button>
  </div>
</template>
<style scoped>
.settings-navigation {
  display: flex;
  flex: 1;
  flex-direction: column;
  min-height: 0;
  padding: 8px 12px 16px;
}
.settings-search {
  display: flex;
  align-items: center;
  gap: 8px;
  flex: none;
  margin-bottom: 14px;
  padding: 10px 12px;
  border-radius: 12px;
  background: var(--well);
  color: var(--muted);
}
.settings-search:focus-within {
  outline: 2px solid var(--accent);
  outline-offset: 2px;
}
.settings-search input {
  min-width: 0;
  width: 100%;
  border: 0;
  outline: none;
  background: transparent;
  color: var(--fg);
  font-size: 13px;
}
.preferences-nav {
  min-height: 0;
  overflow-y: auto;
  overscroll-behavior: contain;
  flex: 1;
  padding: 0 2px 12px;
  scrollbar-width: thin;
}
.settings-nav-group + .settings-nav-group {
  margin-top: 14px;
}
.settings-nav-group h3 {
  margin: 8px 10px;
  font-size: 11px;
  font-weight: 550;
  color: var(--muted);
}
.settings-nav-group button,
.settings-return {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding: 8px 10px;
  border-radius: 9px;
  color: var(--fg-2);
  font-size: 13px;
  text-align: left;
}
.settings-nav-group button {
  min-height: 34px;
  margin-top: 2px;
}
.settings-nav-group button:hover,
.settings-return:hover {
  background: var(--well);
  color: var(--fg);
}
.settings-nav-group button[aria-current="page"] {
  background: var(--side-active);
  color: var(--fg);
  font-weight: 600;
}
.settings-nav-group button:focus-visible,
.settings-return:focus-visible {
  outline: 2px solid var(--accent);
  outline-offset: -2px;
}
.settings-nav-group svg {
  flex: none;
}
.settings-return {
  margin-top: 10px;
  flex: none;
}
.settings-search-empty {
  display: grid;
  justify-items: start;
  gap: 12px;
  padding: 12px;
  color: var(--muted);
  font-size: 12px;
}
</style>
