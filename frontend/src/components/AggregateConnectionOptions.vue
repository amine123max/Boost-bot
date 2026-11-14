<script setup lang="ts">
import ModelSelect from "./ModelSelect.vue";
import type { useAggregateOptions } from "@/composables/useAggregateOptions";
import { computed } from "vue";
const props = defineProps<{
  draft: ReturnType<typeof useAggregateOptions>["draft"];
  editing: boolean;
}>();
const paths = [
  "/responses",
  "/chat/completions",
  "/images/generations",
  "/images/edits",
  "/messages",
];
const endpointPreset = computed({
  get: () =>
    !props.draft.actionCustomEnabled
      ? "auto"
      : paths.includes(props.draft.action)
        ? props.draft.action
        : "custom",
  set: (value: string) => {
    props.draft.actionCustomEnabled = value !== "auto";
    if (paths.includes(value)) props.draft.action = value;
  },
});
</script>
<template>
  <details class="connection-advanced">
    <summary>高级配置</summary>
    <div class="form-stack">
      <div class="form-two">
        <label class="form-field"
          >排序优先级<input
            v-model.number="draft.sort"
            type="number"
            step="1" /></label
        ><label class="form-field"
          >强制上游模型<ModelSelect v-model="draft.modelOverride" label="强制上游模型" placeholder="可选"
        /></label>
      </div>
      <label class="form-field"
        >认证方式<select v-model="draft.authType">
          <option value="apikey">API Key</option>
          <option value="userpass">用户名 / 密码</option>
        </select></label
      >
      <div v-if="draft.authType === 'userpass'" class="form-two">
        <label class="form-field"
          >用户名<input
            v-model="draft.username"
            autocomplete="off"
            :required="!editing"
            :placeholder="editing ? '留空保留原值' : ''" /></label
        ><label class="form-field"
          >密码<input
            v-model="draft.password"
            type="password"
            autocomplete="new-password"
            :required="!editing"
            :placeholder="editing ? '留空保留原值' : ''"
        /></label>
      </div>
      <label class="checkbox-field"
        ><input
          v-model="draft.authCustomEnabled"
          type="checkbox"
        />自定义认证参数</label
      ><label v-if="draft.authCustomEnabled" class="form-field"
        >认证参数 JSON<textarea
          v-model="draft.authParams"
          required
          spellcheck="false"
          placeholder='{"location":"header","name":"x-api-key","headerValueFormat":"raw"}'
        />
      </label>
      <label class="form-field"
        >快捷请求路径<select v-model="endpointPreset">
          <option value="auto">自动跟随客户端请求</option>
          <option value="/responses">Responses</option>
          <option value="/chat/completions">Chat Completions</option>
          <option value="/images/generations">
            图片生成 · /images/generations
          </option>
          <option value="/images/edits">图片编辑 · /images/edits</option>
          <option value="/messages">Claude Messages</option>
          <option value="custom">自定义路径</option>
        </select></label
      >
      <label class="checkbox-field"
        ><input
          v-model="draft.actionCustomEnabled"
          type="checkbox"
        />自定义请求路径</label
      ><label v-if="draft.actionCustomEnabled" class="form-field"
        >请求路径<input
          v-model="draft.action"
          required
          placeholder="/chat/completions"
      /></label>
      <label class="checkbox-field"
        ><input
          v-model="draft.balanceQueryEnabled"
          type="checkbox"
        />启用余额查询</label
      >
      <template v-if="draft.balanceQueryEnabled"
        ><label class="form-field"
          >余额查询模板<select v-model="draft.balanceQueryTemplate">
            <option value="generic">通用余额接口</option>
            <option value="new_api">New API</option>
            <option value="custom">自定义查询</option>
          </select></label
        ><label class="form-field"
          >余额查询地址<input
            v-model="draft.balanceQueryBaseUrl"
            type="url"
            placeholder="留空使用上游地址"
        /></label>
        <div class="form-two">
          <label class="form-field"
            >查询凭据<input
              v-model="draft.balanceQueryAccessToken"
              type="password"
              autocomplete="off"
              placeholder="留空沿用已有凭据" /></label
          ><label class="form-field"
            >查询用户 ID<input v-model="draft.balanceQueryUserId"
          /></label>
        </div>
        <label v-if="draft.balanceQueryTemplate === 'custom'" class="form-field"
          >余额查询配置 JSON<textarea
            v-model="draft.balanceQueryConfigJson"
            required
            spellcheck="false"
          /></label
      ></template>
    </div>
  </details>
</template>
