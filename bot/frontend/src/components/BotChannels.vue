<script setup lang="ts">
import { computed, ref } from 'vue';
import { chatChannels, channelStateNames, type ChannelAccount, type ChatChannel } from '../channel-accounts';
import HelpTip from './HelpTip.vue';
import Icon from './Icon.vue';
import SpringSurface from '../../../../frontend/src/components/SpringSurface.vue';
import ChannelIcon from './ChannelIcon.vue';
const props = defineProps<{ accounts: ChannelAccount[]; busy: boolean }>();
const emit = defineEmits<{ connect: [channel: ChatChannel, account?: ChannelAccount]; edit: [account: ChannelAccount]; more: [] }>();
const expanded = ref<ChatChannel | null>(null);
const groups = computed(() => chatChannels.map(channel => ({ ...channel, accounts: props.accounts.filter(account => account.channel === channel.id) })).filter(channel => ['weixin', 'feishu', 'telegram'].includes(channel.id) || channel.accounts.some(account => account.enabled && account.status?.state === 'connected')));
const isConnected = (account: ChannelAccount) => account.enabled && account.status?.state === 'connected';
</script>
<template>
  <div class="list-head">渠道<HelpTip text="微信、飞书支持扫码；Telegram 使用机器人 Token。展开平台查看设备并自定义名称，更多平台通过右侧入口添加。" label="渠道说明" /><button class="icon-btn channel-more" aria-label="更多聊天渠道" :disabled="busy" @click="emit('more')"><Icon name="plus" :size="14" /></button></div>
  <div class="list bot-channels">
    <div v-for="channel in groups" :key="channel.id">
      <div class="row">
        <div class="who channel-label"><ChannelIcon :channel="channel.id" /><button v-if="channel.accounts.length" class="channel-name" :aria-label="channel.name + '设备'" :aria-expanded="expanded === channel.id" @click="expanded = expanded === channel.id ? null : channel.id">{{ channel.name }}<Icon name="chevron" :size="12" :class="{ expanded: expanded === channel.id }" /></button><span v-else class="name">{{ channel.name }}</span><HelpTip :text="channel.connection" :label="channel.name + '连接说明'" /></div>
        <span v-if="channel.accounts.some(isConnected)" class="channel-state is-connected">已连接</span>
        <button v-else class="channel-state" :disabled="busy" :aria-label="'连接' + channel.name" @click="emit('connect', channel.id)">连接</button>
      </div>
      <SpringSurface><div v-if="expanded === channel.id" class="channel-devices" :aria-label="channel.name + '设备列表'">
        <div v-for="account in channel.accounts" :key="account.key" class="row">
          <div class="who channel-label"><button class="channel-device-name" :aria-label="'编辑' + (account.label || channel.name) + '设备'" @click="emit('edit', account)">{{ account.label || channel.name }}</button><HelpTip :text="(!account.enabled ? '已停用' : account.status?.detail || channelStateNames[account.status?.state || ''] || '未连接') + '。点击名称自定义设备。'" :label="(account.label || channel.name) + '账号说明'" /></div>
          <span v-if="account.enabled && ['connected', 'connecting'].includes(account.status?.state || '')" class="channel-state" :class="{ 'is-connected': isConnected(account) }">{{ channelStateNames[account.status?.state || ''] }}</span>
          <button v-else class="channel-state" :disabled="busy" :aria-label="(account.label || channel.name) + (account.enabled ? '重新连接' : '启用')" @click="emit('connect', channel.id, account)">{{ account.enabled ? '连接' : '启用' }}</button>
        </div>
        <button class="row clickable channel-other" :disabled="busy" :aria-label="channel.name + '连接其他账号'" @click="emit('connect', channel.id)">连接其他账号</button>
      </div></SpringSurface>
    </div>
  </div>
</template>
<style scoped>
.channel-label, .channel-name { display: inline-flex; align-items: center; gap: 5px; min-width: 0; }
.channel-name { color: inherit; }
.channel-name svg { flex: none; transition: transform 180ms ease; }
.channel-name svg.expanded { transform: rotate(90deg); }
.channel-more { margin-left: auto; font-size: 12px; color: var(--muted); }
.bot-channels .row { --row-h: 32px; --row-py: 4px; --row-gap: 8px; }
.channel-state { flex: none; white-space: nowrap; padding: 3px 8px; border-radius: 5px; color: var(--muted); font-size: 12px; }
button.channel-state { background: var(--pill); transition: background-color 140ms ease, color 140ms ease, transform 100ms ease; }
button.channel-state:enabled:hover { background: var(--pill-hover); color: var(--fg); }
button.channel-state:enabled:active { background: var(--pill-hover); color: var(--fg); transform: translateY(1px); }
button.channel-state:focus-visible { outline: 2px solid var(--accent); outline-offset: 2px; }
.channel-state.is-connected { color: var(--green); background: var(--green-soft); }
.channel-devices { padding-left: 12px; }
.channel-device-name { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: left; }
.channel-other { width: 100%; color: var(--muted); text-align: left; font-size: 12px; }
@media (prefers-reduced-motion: reduce) { .channel-name svg, button.channel-state { transition: none; } }
</style>
