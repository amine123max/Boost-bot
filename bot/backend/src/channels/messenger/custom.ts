import { createHash, createHmac, randomUUID, timingSafeEqual } from 'node:crypto';
import { PlatformError, readForUpload, type MessengerMessage, type MessengerTransport, type StateFn } from './transport.js';

export function customEndpoint(value: string): string {
  let url: URL;
  try { url = new URL(value); } catch { throw new PlatformError('请输入有效的自定义渠道接收地址', true); }
  if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password || url.hash || value.length > 2048)
    throw new PlatformError('接收地址必须是 HTTP／HTTPS，不能包含用户名、密码或片段', true);
  return url.href;
}
export function hookSignature(secret: string, timestamp: string, body: Buffer): string {
  return createHmac('sha256', secret).update(timestamp).update('.').update(body).digest('hex');
}

/** Signed HTTP bridge: explicit verification, incoming callbacks and queued outgoing messages. */
export class CustomTransport implements MessengerTransport {
  readonly id = 'custom' as const;
  readonly maxText = 12000;
  readonly supportsEdit = false;
  private listener?: (message: MessengerMessage) => void;
  private state?: StateFn;
  private seen = new Map<string, number>();
  private endpoint: string;
  constructor(private credentials: Record<string, string>, private fetchImpl: typeof fetch = fetch) {
    this.endpoint = customEndpoint(credentials.endpoint || '');
    if ((credentials.secret || '').length < 16 || credentials.secret.length > 256)
      throw new PlatformError('签名密钥需为16–256个字符', true);
    if ((credentials.token || '').length > 4096) throw new PlatformError('API Token过长', true);
  }
  private async request(packet: Record<string, unknown>): Promise<Record<string, unknown>> {
    const body = Buffer.from(JSON.stringify({ version: 1, ...packet }));
    const timestamp = String(Math.floor(Date.now() / 1000));
    const response = await this.fetchImpl(this.endpoint, {
      method: 'POST', redirect: 'error', signal: AbortSignal.timeout(15000),
      headers: { 'content-type': 'application/json', 'x-boost-hook-timestamp': timestamp,
        'x-boost-hook-signature': hookSignature(this.credentials.secret!, timestamp, body),
        ...(this.credentials.token ? { authorization: 'Bearer ' + this.credentials.token } : {}) },
      body,
    });
    if (!response.ok) { await response.body?.cancel(); throw new PlatformError(`自定义渠道请求失败（HTTP ${response.status}）`, response.status < 500 && response.status !== 429, [401,403].includes(response.status)); }
    let size = 0; const chunks: Buffer[] = [];
    if (response.body) for await (const chunk of response.body) { size += chunk.length; if (size > 65536) throw new PlatformError('自定义渠道响应过大', true); chunks.push(Buffer.from(chunk)); }
    let value: unknown; try { value = JSON.parse(Buffer.concat(chunks).toString('utf8')); } catch { throw new PlatformError('自定义渠道须返回JSON响应', true); }
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new PlatformError('自定义渠道响应格式无效', true);
    return value as Record<string, unknown>;
  }
  async verify() {
    const challenge = randomUUID();
    const response = await this.request({ type: 'verify', challenge });
    if (response.challenge !== challenge) throw new PlatformError('接收端未返回相同challenge，连接验证失败', true);
    return { name: typeof response.name === 'string' ? response.name.slice(0,80) : '自定义渠道' };
  }
  async start(listener: (message: MessengerMessage) => void, state: StateFn) {
    this.listener = listener; this.state = state;
    state('connecting', '等待自定义渠道验证');
    try { await this.verify(); if (this.listener === listener) state('connected'); }
    catch { if (this.listener === listener) state('error', '接收端验证失败，请检查地址与签名密钥'); }
  }
  async stop() { this.listener = undefined; this.state = undefined; this.seen.clear(); }
  webhook(headers: Record<string,string|string[]|undefined>, raw: Buffer) {
    if (!this.listener) return { status: 503, body: { error: 'channel_unavailable' } };
    const timestamp = headers['x-boost-hook-timestamp'], signature = headers['x-boost-hook-signature'];
    if (typeof timestamp !== 'string' || !/^\d{10}$/.test(timestamp) || typeof signature !== 'string' || !/^[a-f0-9]{64}$/i.test(signature)) return { status: 403, body: { error: 'invalid_signature' } };
    if (Math.abs(Date.now()-Number(timestamp)*1000)>300000) return { status: 403, body: { error: 'expired_signature' } };
    if (!timingSafeEqual(Buffer.from(signature,'hex'), Buffer.from(hookSignature(this.credentials.secret!,timestamp,raw),'hex'))) return { status: 403, body: { error: 'invalid_signature' } };
    let packet: any; try { packet = JSON.parse(raw.toString('utf8')); } catch { return { status:400,body:{error:'invalid_json'} }; }
    if (!packet || packet.version !== 1) return { status:400,body:{error:'unsupported_version'} };
    if (packet.type === 'verify' && typeof packet.challenge === 'string' && packet.challenge.length <= 200) {
      this.state?.('connected'); return { status:200,body:{challenge:packet.challenge} };
    }
    const valid = (s: unknown, limit: number) => typeof s === 'string' && !!s.trim() && s.length <= limit;
    if (packet.type !== 'message' || !valid(packet.id,160) || !valid(packet.chatId,160) || !valid(packet.senderId,160) || typeof packet.text !== 'string' || packet.text.length > 24000)
      return { status:400,body:{error:'invalid_message'} };
    const files: MessengerMessage['files'] = [];
    if (packet.files !== undefined) {
      if (!Array.isArray(packet.files) || packet.files.length > 4) return { status:400,body:{error:'invalid_files'} };
      for (const file of packet.files) {
        if (!file || typeof file.base64 !== 'string' || file.base64.length > 700000 || !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(file.base64)) return { status:400,body:{error:'invalid_file'} };
        const bytes = Buffer.from(file.base64,'base64');
        if (bytes.length > 512*1024) return { status:413,body:{error:'file_too_large'} };
        files.push({ type: file.type === 'image' ? 'image' : 'file', name: String(file.name || 'attachment').slice(0,120), download: async () => bytes });
      }
    }
    const key = packet.chatId + '\0' + packet.id;
    for (const [id,at] of this.seen) if (at < Date.now()-300000) this.seen.delete(id);
    if (this.seen.has(key)) return { status:200,body:{ok:true,duplicate:true} };
    if (this.seen.size >= 10000) return { status:429,body:{error:'callback_limit'} };
    this.seen.set(key,Date.now());
    const messageId = createHash('sha256').update(JSON.stringify([packet.chatId, packet.id])).digest('hex');
    this.listener({ id: messageId, chatId: packet.chatId, senderId: packet.senderId, senderName: typeof packet.senderName === 'string' ? packet.senderName.slice(0,80) : undefined, dm:true, text:packet.text, files });
    this.state?.('connected');
    return { status:200,body:{ok:true} };
  }
  async sendText(chatId: string, text: string, key?: string): Promise<string> {
    const response = await this.request({ type:'message',chatId,text,idempotencyKey:key || randomUUID() });
    if (response.ok !== true) throw new PlatformError('接收端未确认消息，请检查接入实现',true);
    return typeof response.id === 'string' ? response.id : key || '';
  }
  async editText() { throw new PlatformError('自定义渠道不支持编辑已发送消息',true); }
  async sendFile(chatId: string, filePath: string, name: string) {
    const bytes = await readForUpload(filePath, 8*1024*1024);
    const response = await this.request({ type:'file',chatId,name,base64:bytes.toString('base64') });
    if (response.ok !== true) throw new PlatformError('接收端未确认文件',true);
  }
}
