<script setup lang="ts">
import { computed, ref } from "vue";
import PanelCard from "./PanelCard.vue";
import HelpHint from "./HelpHint.vue";
import BoostDialog from "./BoostDialog.vue";
import DialogActions from "./DialogActions.vue";
import { boost, notify, perform } from "@/composables/useBoost";
import { appClient } from "@/lib/api/app-client";

const english = computed(() => boost.settings?.locale?.startsWith("en"));
const status = computed(() => boost.settings?.storageSecurity);
const confirm = ref(false);
const saving = ref(false);
async function enable() {
  saving.value = true;
  try {
    await perform(async () => {
      boost.settings = await appClient.setSettings({ storageEncryptionEnabled: true });
      confirm.value = false;
      notify(english.value ? "Encryption scheduled; restart Boost to migrate the main database" : "已设置加密，请重启 Boost 完成主库迁移");
    });
  } finally { saving.value = false; }
}
</script>

<template>
  <PanelCard v-if="status" :title="english ? 'Storage security' : '存储安全'" icon="settings">
    <template #actions><HelpHint icon="circle-alert" :label="english ? 'Encryption coverage' : '加密范围'" :text="english ? 'Bot databases use separate per-actor keys derived from the main key. Existing Bot data is encrypted when that host next starts; workspace files and logs are outside this coverage.' : 'Bot 数据库使用主密钥派生的独立身份密钥，既有 Bot 数据在对应宿主下次启动时转换；工作文件和日志不在加密范围。'" /></template>
    <div class="detail-line"><span>{{ english ? 'Main database' : '主业务数据库' }}</span>
      <strong>{{ status.encrypted ? 'SQLCipher' : (english ? 'Plain SQLite' : '明文 SQLite') }}</strong></div>
    <div class="detail-line"><span>{{ english ? 'Key provider' : '密钥来源' }}</span>
      <strong>{{ status.provider === 'keyring' ? (english ? 'System credential store' : '系统凭据库')
        : status.provider === 'key_file' ? (english ? 'Configured key file' : '显式密钥文件') : '—' }}</strong></div>
    <div class="detail-line"><span>{{ english ? 'Integrity check' : '完整性检查' }}</span><strong>{{ status.integrity === 'ok' ? (english ? 'Passed' : '通过') : status.integrity }}</strong></div>
    <p v-if="status.requiresRestart" class="storage-note" role="status">{{ english ? 'Restart required' : '等待重启生效' }}<HelpHint icon="circle-alert" :label="english ? 'Migration' : '迁移要求'" :text="english ? 'Close every Boost instance using this database before migration.' : '迁移前请关闭所有使用此数据库的 Boost 实例。'" /></p>
    <button v-if="!status.encryptionRequested" class="primary" :disabled="!status.sqlcipherAvailable || saving" @click="confirm = true">
      {{ english ? 'Enable main database encryption' : '启用主库加密' }}
    </button>
  </PanelCard>
  <BoostDialog v-if="confirm" :busy="saving" :title="english ? 'Enable database encryption' : '启用数据库加密'" @close="confirm = false">
    <p>{{ english ? 'The key will be stored in this operating system credential store. Restart applies a verified SQLCipher conversion; no automatic backup is created. Moving the database to another machine requires its original key.' : '密钥保存在当前系统凭据库。重启后执行校验过的 SQLCipher 转换，不会自动创建备份。跨设备迁移必须同时具备原密钥。' }}</p>
    <DialogActions>
      <button type="button" class="secondary" :disabled="saving" @click="confirm = false">{{ english ? 'Cancel' : '取消' }}</button>
      <button type="button" class="primary" :disabled="saving" @click="enable">{{ english ? 'Enable on restart' : '设置并在重启后启用' }}</button>
    </DialogActions>
  </BoostDialog>
</template>

<style scoped>
.storage-note { margin: 12px 0; line-height: 1.6; }
</style>
