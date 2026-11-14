import WebSocket from 'ws';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { MessengerGateway, platformJson } from './gateway.js';
import { PlatformError, fetchFile, readForUpload, type MessengerMessage, type MessengerFile, type MessengerTransport, type StateFn } from './transport.js';

export function dingtalkMessage(data: any, download: (code: string) => Promise<Buffer>): MessengerMessage | undefined {
  if (!data?.msgId || !(data.senderStaffId || data.senderId)) return;
  const files: MessengerFile[] = [];
  const content = data.content || {};
  if (content.downloadCode) files.push({ type: data.msgtype === 'picture' ? 'image' : 'file', name: content.fileName || 'attachment', download: () => download(String(content.downloadCode)) });
  let text = String(data.text?.content || '');
  for (const part of Array.isArray(content.richText) ? content.richText : []) {
    if (part.text) text += String(part.text);
    if (part.downloadCode) files.push({ type: 'image', download: () => download(String(part.downloadCode)) });
  }
  return { id: String(data.msgId), chatId: String(data.senderStaffId || data.senderId), senderId: String(data.senderStaffId || data.senderId), senderName: String(data.senderNick || ''), dm: String(data.conversationType) === '1', text, files, ...(!text && !files.length ? { unsupported: String(data.msgtype || 'unknown') } : {}) };
}

/** Official DingTalk Stream: outbound WebSocket, no public callback server required. */
export class DingTalkTransport implements MessengerTransport {
  readonly id = 'dingtalk' as const;
  readonly maxText = 3900;
  readonly supportsEdit = false;
  private gateway = new MessengerGateway('钉钉');
  private token?: { value: string; until: number };
  private refreshing?: Promise<string>;
  private webhooks = new Map<string, { url: string; until: number }>();
  constructor(private clientId: string, private clientSecret: string, private options: { fetchImpl?: typeof fetch; baseUrl?: string; oapiUrl?: string } = {}) {}
  private get fetch() { return this.options.fetchImpl || fetch; }
  private get base() { return this.options.baseUrl || 'https://api.dingtalk.com'; }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    if (!this.refreshing) this.refreshing = (async () => {
      const data = await platformJson(this.fetch, this.base + '/v1.0/oauth2/accessToken', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appKey: this.clientId, appSecret: this.clientSecret }) }, '钉钉');
      if (!data.accessToken) throw new PlatformError('钉钉应用凭据被拒绝', true, true);
      this.token = { value: String(data.accessToken), until: Date.now() + Math.max(1, Number(data.expireIn || 7200) - 60) * 1000 };
      return this.token.value;
    })().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async call(route: string, body: unknown, retry = true): Promise<any> {
    const token = await this.accessToken();
    try {
      return await platformJson(this.fetch, this.base + route, { method: 'POST', headers: { 'content-type': 'application/json', 'x-acs-dingtalk-access-token': token }, body: JSON.stringify(body) }, '钉钉');
    } catch (error) {
      if (!retry || !(error instanceof PlatformError) || !error.fatal) throw error;
      if (this.token?.value === token) this.token = undefined;
      return this.call(route, body, false);
    }
  }
  async verify() { await this.accessToken(); return { name: '钉钉机器人' }; }
  async start(onMessage: (message: MessengerMessage) => void, onState: StateFn) {
    await this.gateway.start(async signal => {
      const data = await platformJson(this.fetch, this.base + '/v1.0/gateway/connections/open', { method: 'POST', signal, headers: { 'content-type': 'application/json', accept: 'application/json' }, body: JSON.stringify({ clientId: this.clientId, clientSecret: this.clientSecret, ua: 'Boost/0.5.1', subscriptions: [{ type: 'CALLBACK', topic: '/v1.0/im/bot/messages/get' }] }) }, '钉钉');
      const endpoint = new URL(data.endpoint);
      if (!['wss:', ...(this.options.baseUrl ? ['ws:'] : [])].includes(endpoint.protocol) || !data.ticket) throw new Error('Invalid DingTalk gateway');
      endpoint.searchParams.set('ticket', String(data.ticket)); return endpoint.href;
    }, (packet, socket) => {
      const ack = (data: string) => socket.readyState === WebSocket.OPEN && socket.send(JSON.stringify({ code: 200, headers: packet.headers, message: 'OK', data }));
      if (packet.type === 'SYSTEM') {
        if (packet.headers?.topic === 'REGISTERED') {
          this.gateway.ready(); onState('connected');
          let alive = true;
          socket.on('pong', () => { alive = true; });
          this.gateway.pulse(() => { if (!alive) { socket.terminate(); return; } alive = false; socket.ping(); }, 20000);
        }
        if (packet.headers?.topic === 'ping') ack(packet.data);
        if (packet.headers?.topic === 'disconnect') { ack(packet.data); socket.close(); }
        return;
      }
      if (packet.type !== 'CALLBACK' || packet.headers?.topic !== '/v1.0/im/bot/messages/get') return;
      let data: any; try { data = JSON.parse(packet.data); } catch { return; }
      const message = dingtalkMessage(data, code => this.download(code));
      if (message) {
        if (message.dm && data.sessionWebhook) {
          try {
            const url = new URL(data.sessionWebhook);
            if (url.protocol === 'https:' && url.hostname === 'oapi.dingtalk.com') {
              if (this.webhooks.size >= 10000) this.webhooks.delete(this.webhooks.keys().next().value!);
              this.webhooks.set(message.chatId, { url: url.href, until: Number(data.sessionWebhookExpiredTime || 0) });
            }
          } catch { /* A malformed optional reply URL must not disconnect the stream. */ }
        }
        onMessage(message);
      }
      ack(JSON.stringify({ response: { status: 'SUCCESS' } }));
    }, onState);
  }
  async stop() { this.gateway.stop(); this.webhooks.clear(); }
  async sendText(chatId: string, text: string): Promise<string> {
    const webhook = this.webhooks.get(chatId);
    if (webhook && webhook.until > Date.now()) {
      await platformJson(this.fetch, webhook.url, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ msgtype: 'text', text: { content: text } }) }, '钉钉');
      return randomUUID();
    }
    const result = await this.call('/v1.0/robot/oToMessages/batchSend', { robotCode: this.clientId, userIds: [chatId], msgKey: 'sampleText', msgParam: JSON.stringify({ content: text }) });
    return String(result.processQueryKey || randomUUID());
  }
  async editText(): Promise<void> { throw new PlatformError('钉钉消息不支持原位修改', true); }
  async sendFile(chatId: string, filePath: string, name: string): Promise<void> {
    const bytes = await readForUpload(filePath, 20 * 1024 * 1024);
    const form = new FormData(); form.append('media', new Blob([new Uint8Array(bytes)]), name);
    const endpoint = new URL((this.options.oapiUrl || 'https://oapi.dingtalk.com') + '/media/upload');
    endpoint.searchParams.set('access_token', await this.accessToken()); endpoint.searchParams.set('type', 'file');
    const uploaded = await platformJson(this.fetch, endpoint.href, { method: 'POST', body: form }, '钉钉');
    if (!uploaded.media_id) throw new PlatformError('钉钉文件上传失败', true);
    await this.call('/v1.0/robot/oToMessages/batchSend', { robotCode: this.clientId, userIds: [chatId], msgKey: 'sampleFile', msgParam: JSON.stringify({ mediaId: uploaded.media_id, fileName: name, fileType: path.extname(name).slice(1) || 'file' }) });
  }
  private async download(code: string): Promise<Buffer> {
    const data = await this.call('/v1.0/robot/messageFiles/download', { downloadCode: code, robotCode: this.clientId });
    const url = new URL(data.downloadUrl);
    if (url.protocol !== 'https:' || !['dingtalk.com', 'alicdn.com', 'aliyuncs.com'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) throw new PlatformError('钉钉文件地址无效', true);
    return (await fetchFile(this.fetch, url.href)).buffer;
  }
}
