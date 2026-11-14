import { createPrivateKey, createPublicKey, sign, verify } from 'node:crypto';
import { platformJson } from './gateway.js';
import { PlatformError, fetchFile, readForUpload, type MessengerMessage, type MessengerFile, type MessengerTransport, type StateFn } from './transport.js';

interface ReplyContext { id: string; at: number; sequences: Record<string, number>; }
interface ContextStore { get(chat: string): ReplyContext | undefined; set(chat: string, context: ReplyContext): void; }
export function qqMessage(event: string, data: any, download: (url: string) => Promise<Buffer>): MessengerMessage | undefined {
  if (!data?.id || data.author?.bot) return;
  const c2c = event === 'C2C_MESSAGE_CREATE';
  if (!c2c && event !== 'DIRECT_MESSAGE_CREATE') return;
  const sender = c2c ? data.author?.user_openid : data.author?.id;
  const peer = c2c ? sender : data.guild_id;
  if (!sender || !peer) return;
  const files: MessengerFile[] = [];
  for (const file of data.attachments || []) {
    if (!file.url) continue;
    const url = String(file.url).startsWith('//') ? 'https:' + file.url : String(file.url);
    const type = String(file.content_type || '').startsWith('image/') ? 'image' : 'file';
    files.push({ type, name: String(file.filename || 'attachment'), download: () => download(url) });
  }
  return { id: String(data.id), chatId: `${c2c ? 'c2c' : 'dm'}:${peer}`, senderId: String(sender), senderName: String(data.author?.username || ''), dm: true, text: String(data.content || ''), files };
}

/** QQ Open Platform: signed HTTPS callbacks + authenticated REST replies. */
export class QQTransport implements MessengerTransport {
  readonly id = 'qq' as const;
  readonly maxText = 3900;
  readonly supportsEdit = false;
  private listener?: (message: MessengerMessage) => void;
  private state?: StateFn;
  private token?: { value: string; until: number };
  private refreshing?: Promise<string>;
  private contexts = new Map<string, ReplyContext>();
  private seen = new Map<string, number>();
  constructor(private appId: string, private secret: string, private options: { fetchImpl?: typeof fetch; baseUrl?: string; tokenUrl?: string; sandbox?: boolean; context?: ContextStore } = {}) {}
  private get fetch() { return this.options.fetchImpl || fetch; }
  private get base() { return this.options.baseUrl || (this.options.sandbox ? 'https://sandbox.api.sgroup.qq.com' : 'https://api.sgroup.qq.com'); }
  private async accessToken(): Promise<string> {
    if (this.token && this.token.until > Date.now()) return this.token.value;
    if (!this.refreshing) this.refreshing = (async () => {
      const result = await platformJson(this.fetch, this.options.tokenUrl || 'https://bots.qq.com/app/getAppAccessToken', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ appId: this.appId, clientSecret: this.secret }) }, 'QQ');
      if (!result.access_token) throw new PlatformError('QQ 应用凭据被拒绝', true, true);
      this.token = { value: String(result.access_token), until: Date.now() + Math.max(1, Number(result.expires_in || 7200) - 60) * 1000 };
      return this.token.value;
    })().finally(() => { this.refreshing = undefined; });
    return this.refreshing;
  }
  private async call(method: string, route: string, body?: unknown, retry = true): Promise<any> {
    const token = await this.accessToken();
    try {
      return await platformJson(this.fetch, this.base + route, { method, headers: { authorization: 'QQBot ' + token, 'X-Union-Appid': this.appId, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) }, 'QQ');
    } catch (error) {
      if (!retry || !(error instanceof PlatformError) || !error.fatal) throw error;
      if (this.token?.value === token) this.token = undefined;
      return this.call(method, route, body, false);
    }
  }
  async verify() { await this.accessToken(); return { name: 'QQ 机器人' }; }
  async start(onMessage: (message: MessengerMessage) => void, onState: StateFn) {
    this.listener = onMessage; this.state = onState;
    onState('connecting', '等待 QQ 平台校验 HTTPS 回调地址');
  }
  async stop() { this.listener = undefined; this.state = undefined; this.contexts.clear(); this.seen.clear(); }
  webhook(headers: Record<string, string | string[] | undefined>, raw: Buffer) {
    if (!this.listener) return { status: 503, body: { error: 'channel_unavailable' } };
    const timestamp = headers['x-signature-timestamp'];
    const signature = headers['x-signature-ed25519'];
    if (typeof timestamp !== 'string' || !/^\d{10,13}$/.test(timestamp) || typeof signature !== 'string' || !/^[0-9a-f]{128}$/i.test(signature)) return { status: 403, body: { error: 'invalid_signature' } };
    const time = Number(timestamp) * (timestamp.length === 10 ? 1000 : 1);
    if (Math.abs(Date.now() - time) > 300000) return { status: 403, body: { error: 'expired_signature' } };
    if (headers['x-bot-appid'] && headers['x-bot-appid'] !== this.appId) return { status: 403, body: { error: 'invalid_app' } };
    const key = qqSigningKey(this.secret);
    if (!verify(null, Buffer.concat([Buffer.from(timestamp), raw]), createPublicKey(key), Buffer.from(signature, 'hex'))) return { status: 403, body: { error: 'invalid_signature' } };
    let packet: any; try { packet = JSON.parse(raw.toString('utf8')); } catch { return { status: 400, body: { error: 'invalid_json' } }; }
    if (packet.op === 13) {
      const token = packet.d?.plain_token, eventTime = packet.d?.event_ts;
      if (typeof token !== 'string' || typeof eventTime !== 'string' || token.length > 4096) return { status: 400, body: { error: 'invalid_challenge' } };
      this.state?.('connected');
      return { status: 200, body: { plain_token: token, signature: sign(null, Buffer.from(eventTime + token), key).toString('hex') } };
    }
    if (packet.op === 1) return { status: 200, body: { op: 11, d: packet.d } };
    if (packet.op === 0) {
      const message = qqMessage(packet.t, packet.d, url => this.download(url));
      if (message && !this.seen.has(message.id)) {
        for (const [id, at] of this.seen) if (at < Date.now() - 300000) this.seen.delete(id);
        if (this.seen.size >= 10000) this.seen.delete(this.seen.keys().next().value!);
        const previous = this.contexts.get(message.chatId) || this.options.context?.get(message.chatId);
        const context = previous?.id === message.id ? previous : { id: message.id, at: Date.now(), sequences: {} };
        this.contexts.set(message.chatId, context); this.options.context?.set(message.chatId, context);
        this.listener(message); this.seen.set(message.id, Date.now()); this.state?.('connected');
      }
    }
    return { status: 200, body: { op: 12, d: 0 } };
  }
  private peer(chat: string) {
    const split = chat.indexOf(':'); const kind = chat.slice(0, split), id = chat.slice(split + 1);
    if (!id || !['c2c', 'dm'].includes(kind)) throw new PlatformError('QQ 会话无效', true);
    return { kind, route: kind === 'c2c' ? `/v2/users/${encodeURIComponent(id)}` : `/dms/${encodeURIComponent(id)}` };
  }
  private reply(chat: string, key: string) {
    const context = this.contexts.get(chat) || this.options.context?.get(chat);
    if (!context || Date.now() - context.at > 5 * 60 * 1000) throw new PlatformError('QQ 回复窗口已过期，请发送一条新消息后重试', true);
    if (!context.sequences[key]) {
      const next = Math.max(0, ...Object.values(context.sequences)) + 1;
      if (next > 5) throw new PlatformError('QQ 已达到本条消息的回复次数上限', true);
      context.sequences[key] = next; this.options.context?.set(chat, context); this.contexts.set(chat, context);
    }
    return { msg_id: context.id, msg_seq: context.sequences[key] };
  }
  async sendText(chat: string, text: string, key = text): Promise<string> {
    const peer = this.peer(chat);
    const result = await this.call('POST', peer.route + '/messages', { content: text, msg_type: 0, ...this.reply(chat, key) });
    return String(result.id || '');
  }
  async editText(): Promise<void> { throw new PlatformError('QQ 消息不支持原位修改', true); }
  async sendFile(chat: string, file: string, name: string): Promise<void> {
    const peer = this.peer(chat);
    if (peer.kind !== 'c2c') throw new PlatformError('QQ 频道私信暂不支持文件推送，请使用机器人单聊', true);
    const bytes = await readForUpload(file, 10 * 1024 * 1024);
    const uploaded = await this.call('POST', peer.route + '/files', { file_type: 4, file_data: bytes.toString('base64'), srv_send_msg: false });
    if (!uploaded.file_info) throw new PlatformError('QQ 文件上传失败', true);
    await this.call('POST', peer.route + '/messages', { content: name, msg_type: 7, media: { file_info: uploaded.file_info }, ...this.reply(chat, `file:${file}`) });
  }
  private async download(value: string): Promise<Buffer> {
    const url = new URL(value);
    if (url.protocol !== 'https:' || !['qq.com', 'qq.com.cn', 'qpic.cn', 'gtimg.cn', 'myqcloud.com'].some(domain => url.hostname === domain || url.hostname.endsWith('.' + domain))) throw new PlatformError('QQ 文件地址无效', true);
    return (await fetchFile(this.fetch, url.href)).buffer;
  }
}

/** Tencent's documented Ed25519 seed derivation (repeat the application secret). */
export function qqSigningKey(secret: string) {
  if (!secret) throw new Error('QQ application secret is missing');
  const bytes = Buffer.from(secret); const seed = Buffer.alloc(32);
  for (let i = 0; i < seed.length; i++) seed[i] = bytes[i % bytes.length]!;
  return createPrivateKey({ key: Buffer.concat([Buffer.from('302e020100300506032b657004220420', 'hex'), seed]), format: 'der', type: 'pkcs8' });
}
