<script setup lang="ts">
import BoostDialog from "./BoostDialog.vue";
import BoostIcon from "./BoostIcon.vue";
import type { Account } from "@/types";
defineProps<{ account: Account; busy: boolean; error?: string }>();
const emit = defineEmits<{ close: []; confirm: [] }>();
</script>
<template>
  <BoostDialog title="重置额度" confirmation :busy="busy" @close="!busy && emit('close')">
    <template #title-leading
      ><span class="reset-heading-mark"
        ><BoostIcon name="rotate-ccw" :size="20" /></span
    ></template>
    <div class="reset-account">
      <span class="reset-account-label">当前账号</span
      ><strong>{{ account.name }}</strong>
    </div>
    <div class="reset-credits">
      <span>可用重置次数</span
      ><strong
        >{{ account.quotaResetAvailableCount ?? "—"
        }}<small v-if="account.quotaResetAvailableCount != null"
          >次</small
        ></strong
      >
    </div>
    <p class="reset-question">重置此账号的上游额度？</p>
    <p v-if="account.quotaResetAvailableCount === 0" class="reset-unavailable">
      当前没有可用的重置次数。
    </p>
    <p v-if="error" class="reset-error" role="alert">{{ error }}</p>
    <template #footer
      ><div class="reset-actions">
        <button data-dialog-close
          type="button"
          class="reset-cancel"
          :disabled="busy"
          @click="emit('close')"
        >
          取消</button
        ><button
          type="button"
          class="reset-confirm"
          :disabled="busy || account.quotaResetAvailableCount === 0"
          :aria-busy="busy"
          @click="emit('confirm')"
        >
          <BoostIcon
            name="rotate-ccw"
            :size="15"
            :class="{ 'reset-spinning': busy }"
          />{{ busy ? "正在重置…" : "确认重置" }}
        </button>
      </div></template
    >
  </BoostDialog>
</template>
<style scoped>
.reset-heading-mark {
  width: 36px;
  height: 36px;
  display: grid;
  place-items: center;
  border: 1px solid var(--border);
  border-radius: 10px;
  color: var(--muted);
  background: var(--surface);
  flex-shrink: 0;
}
.reset-account {
  display: grid;
  gap: 6px;
  margin: 4px 0 16px;
  min-width: 0;
}
.reset-account-label {
  font-size: 11px;
  color: var(--muted);
}
.reset-account strong {
  font-size: 13px;
  line-height: 1.5;
  font-weight: 500;
  overflow-wrap: anywhere;
  user-select: text;
}
.reset-credits {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 9px;
  background: color-mix(in srgb, var(--text) 2%, transparent);
}
.reset-credits > span {
  font-size: 12px;
  color: var(--muted);
}
.reset-credits strong {
  font-size: 20px;
  line-height: 1;
  font-weight: 600;
  font-variant-numeric: tabular-nums;
}
.reset-credits small {
  font-size: 11px;
  font-weight: 400;
  color: var(--muted);
  margin-left: 5px;
}
.reset-question {
  font-size: 13px;
  line-height: 1.5;
  color: var(--text);
  margin: 16px 0 0;
}
.reset-error,
.reset-unavailable {
  font-size: 12px;
  line-height: 1.5;
  margin: 10px 0 0;
  overflow-wrap: anywhere;
}
.reset-error {
  color: var(--red);
}
.reset-unavailable {
  color: var(--muted);
}
.reset-actions {
  display: flex;
  width: 100%;
  gap: 10px;
}
.reset-actions button {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 7px;
  flex: 1;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  font-size: 13px;
  font-weight: 400;
}
.reset-cancel {
  color: var(--text);
  background: var(--surface);
}
.reset-cancel:hover {
  background: var(--hover);
}
.reset-confirm {
  color: var(--on-primary);
  background: var(--blue);
  border-color: var(--blue) !important;
}
.reset-confirm:not(:disabled):hover {
  background: var(--blue-hover);
}
.reset-actions button:disabled {
  opacity: 0.55;
  cursor: default;
}
.reset-spinning {
  animation: reset-spin 1s linear infinite;
}
@keyframes reset-spin {
  to {
    transform: rotate(-360deg);
  }
}
@media (prefers-reduced-motion: reduce) {
  .reset-spinning {
    animation: none;
  }
}
</style>
