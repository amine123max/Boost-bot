<script setup lang="ts">
import HelpHint from "@/components/HelpHint.vue";
import { computed, ref } from "vue";
import type { Account } from "@/types";
import BoostIcon from "./BoostIcon.vue";
import BoostDialog from "./BoostDialog.vue";
import BoostMenu, { type MenuItem } from "./BoostMenu.vue";
import DialogActions from "./DialogActions.vue";
import { boost, notify } from "@/composables/useBoost";
import { appClient } from "@/lib/api/app-client";
import { getAppErrorMessage } from "@/lib/api/transport";
import { formatTsFromSeconds } from "@/lib/utils/usage";

const props = defineProps<{
  accounts: Account[];
  selectedIds: string[];
  ready: boolean;
  warming: boolean;
}>();
const emit = defineEmits<{ immediate: [] }>();
const open = ref(false);
const loading = ref(false);
const saving = ref(false);
const hours = ref("1");
const repeat = ref(false);
const targets = ref<string[]>([]);
const background = computed(() => boost.settings?.backgroundTasks);
const scheduleActive = computed(() => background.value?.warmupCronEnabled ?? false);
const menuItems = computed<MenuItem[]>(() => [
  {
    value: "immediate",
    label: "即时预热",
    icon: "zap",
    disabled: props.warming || props.accounts.length === 0,
  },
  { value: "schedule", label: "定时预热", icon: "clock" },
]);

async function openSchedule() {
  open.value = true;
  loading.value = true;
  try {
    const latest = await appClient.getSettings();
    boost.settings = latest;
    const schedule = latest.backgroundTasks;
    hours.value = String(schedule.warmupIntervalSecs > 0 ? schedule.warmupIntervalSecs / 3600 : 1);
    repeat.value = schedule.warmupRepeat;
    targets.value = (props.selectedIds.length ? props.selectedIds : schedule.warmupCronAccountIds)
      .filter(id => props.accounts.some(account => account.id === id));
  } catch (error) {
    notify(`读取预热计划失败：${getAppErrorMessage(error)}`, true);
    open.value = false;
  } finally {
    loading.value = false;
  }
}

async function saveSchedule(cancel = false) {
  const delayHours = Number(hours.value);
  if (!cancel && (!Number.isFinite(delayHours) || delayHours < 0.01 || delayHours > 8760)) {
    notify("请输入 0.01 到 8760 之间的小时数", true);
    return;
  }
  if (!cancel && targets.value.length === 0) {
    notify("请至少选择一个预热账号", true);
    return;
  }
  saving.value = true;
  try {
    const result = await appClient.setSettings({
      backgroundTasks: {
        warmupCronEnabled: !cancel,
        ...(cancel
          ? { warmupIntervalSecs: 0, warmupRepeat: false, warmupNextRunAt: 0, warmupCronAccountIds: [] }
          : {
              warmupIntervalSecs: Math.round(delayHours * 3600),
              warmupRepeat: repeat.value,
              warmupNextRunAt: 0,
              warmupCronAccountIds: targets.value,
            }),
      },
    });
    boost.settings = result;
    notify(cancel ? "定时预热已取消" : "定时预热已保存");
    open.value = false;
  } catch (error) {
    notify(`保存预热计划失败：${getAppErrorMessage(error)}`, true);
  } finally {
    saving.value = false;
  }
}

function choose(value: string) {
  if (value === "immediate") emit("immediate");
  else void openSchedule();
}
</script>

<template>
  <div class="warmup-controls">
    <button
      class="secondary warmup-main"
      type="button"
      :disabled="!ready || warming || !accounts.length"
      title="向选中账号发送 hi；未选择时预热全部账号"
      @click="emit('immediate')"
    >
      <BoostIcon :name="warming ? 'loader-circle' : 'zap'" :size="15" :class="{ spinning: warming }" />
      {{ warming ? "预热中…" : "预热" }}
    </button>
    <BoostMenu
      label="预热选项"
      icon="chevron-down"
      icon-only
      :disabled="!ready"
      :items="menuItems"
      @select="choose"
    />
    <span
      v-if="scheduleActive"
      class="warmup-active-dot"
      title="定时预热已启用"
      aria-label="定时预热已启用"
    />
  </div>

  <BoostDialog
    v-if="open"
    title="定时预热"
    wide
    @close="!saving && (open = false)"
  >
    <div v-if="loading" class="warmup-loading" role="status">
      <BoostIcon name="loader-circle" :size="18" class="spinning" />正在读取预热计划…
    </div>
    <div v-else class="form-stack warmup-form">
      <div v-if="scheduleActive" class="hint">
        当前计划已启用<span v-if="background?.warmupIntervalSecs">
          · 下次预热：{{ formatTsFromSeconds(background.warmupNextRunAt) }}
        </span>
      </div>
      <label class="form-field">
        <span>多少小时后预热<HelpHint label="预热时间" text="支持小数，例如 0.5 小时为 30 分钟；保存后开始计时。" /></span>
        <input v-model="hours" type="number" min="0.01" max="8760" step="0.01" :disabled="saving" />

      </label>
      <label class="account-check-label warmup-repeat">
        <span>重复执行<HelpHint label="重复执行" :text="repeat ? `每隔 ${hours} 小时预热一次` : '只执行一次，完成后自动关闭计划。'" /></span>
        <input v-model="repeat" type="checkbox" :disabled="saving" />
      </label>

      <div class="warmup-targets">
        <div class="section-caption">预热账号（已选 {{ targets.length }} 个）<HelpHint label="预热账号" text="定时预热由服务执行，服务需保持运行；重启后保留计划，错过的执行会在服务启动后补一次。不可用账号会跳过。" /></div>
        <div class="warmup-account-list">
          <label v-for="account in accounts" :key="account.id" class="account-check-label">
            <input v-model="targets" type="checkbox" :value="account.id" :disabled="saving" />
            <span>{{ account.name }}</span>
          </label>
        </div>
      </div>

    </div>
    <template #footer>
      <DialogActions>
        <button
          v-if="scheduleActive || background?.warmupIntervalSecs"
          class="secondary"
          type="button"
          :disabled="saving || loading"
          @click="saveSchedule(true)"
        >取消定时预热</button>
        <button class="secondary" type="button" :disabled="saving" @click="open = false">关闭</button>
        <button class="primary" type="button" :disabled="saving || loading || !ready" @click="saveSchedule()">
          {{ saving ? "保存中…" : "保存计划" }}
        </button>
      </DialogActions>
    </template>
  </BoostDialog>
</template>

<style scoped>
.warmup-controls { display: inline-flex; align-items: center; gap: 3px; }
.warmup-main { min-height: 38px; padding: 7px 12px; }
.warmup-active-dot { width: 7px; height: 7px; margin-left: 3px; border-radius: 50%; background: var(--green); }
.warmup-loading { display: flex; align-items: center; justify-content: center; gap: 9px; min-height: 120px; color: var(--muted); }
.warmup-form { gap: 16px; }
.warmup-form .form-field { gap: 8px; }
.warmup-repeat { display: flex; justify-content: space-between; align-items: center; }
.warmup-repeat-copy, .warmup-note { font-size: calc(12px * var(--font-scale)); }
.warmup-targets { display: grid; gap: 8px; }
.warmup-account-list { max-height: 190px; overflow: auto; border: 1px solid var(--border); border-radius: 6px; padding: 7px; }
.warmup-account-list .account-check-label { border-radius: 4px; padding: 5px 7px; }
.warmup-account-list .account-check-label:hover { background: var(--hover); }
.warmup-account-list .account-check-label span { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.warmup-note { line-height: 1.6; }
</style>
