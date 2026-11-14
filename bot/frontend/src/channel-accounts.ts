export const chatChannels = [
  { id: 'weixin', name: '微信', connection: '扫码连接' },
  { id: 'feishu', name: '飞书', connection: '扫码或应用凭据' },
  { id: 'telegram', name: 'Telegram', connection: 'Bot Token' },
  { id: 'slack', name: 'Slack', connection: 'Bot Token 与 App Token' },
  { id: 'discord', name: 'Discord', connection: 'Bot Token' },
  { id: 'dingtalk', name: '钉钉', connection: '应用凭据 · Stream' },
  { id: 'qq', name: 'QQ', connection: '应用凭据 · HTTPS 回调' },
] as const;
export type ChatChannel = typeof chatChannels[number]['id'];
export interface ChannelAccount {
  key: string;
  channel: string;
  label?: string;
  defaultBot: string;
  enabled: boolean;
  status?: { state: string; detail?: string };
}
export const channelNames: Record<string, string> = Object.fromEntries(chatChannels.map(channel => [channel.id, channel.name]));
export const channelStateNames: Record<string, string> = {
  connected: '已连接', connecting: '连接中', disabled: '已停用', error: '连接失败',
  expired: '已过期', login_required: '待登录', paused: '已暂停', disconnected: '未连接',
};
