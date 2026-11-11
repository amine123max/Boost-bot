<script setup lang="ts">
import type { AggregateApi } from "@/types";
import { accountClient } from "@/lib/api/account-client";
import { copyText, perform } from "@/composables/useBoost";
import RecordCredential from "./RecordCredential.vue";
import BoostMenu from "./BoostMenu.vue";
const props = defineProps<{ api: AggregateApi; disabled: boolean }>();
async function read() {
  const value = await accountClient.readAggregateApiSecret(props.api.id);
  return value.authType === "userpass"
    ? `${value.username || ""} / ${value.password || ""}`
    : value.key;
}
async function copy(field: string) {
  await perform(async () => {
    const value = await accountClient.readAggregateApiSecret(props.api.id);
    await copyText(
      field === "username" ? value.username || "" : value.password || "",
    );
  });
}
</script>
<template>
  <RecordCredential
    :label="api.supplierName || api.id"
    :placeholder="api.id"
    :read="read"
    :disabled="disabled"
  >
    <template v-if="api.authType === 'userpass'" #copy
      ><BoostMenu
        :label="`复制 ${api.supplierName || api.id} 凭据`"
        icon="copy"
        icon-only
        :disabled="disabled"
        :items="[
          { value: 'username', label: '复制用户名', icon: 'copy' },
          { value: 'password', label: '复制密码', icon: 'key-round' },
        ]"
        @select="copy"
    /></template>
  </RecordCredential>
</template>
