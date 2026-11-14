import WebSocket from 'ws';
import { PlatformError, type StateFn } from './transport.js';

/** One cancellable connection/reconnect loop; obsolete sockets cannot dispatch. */
export class MessengerGateway {
  private socket?: WebSocket;
  private timer?: NodeJS.Timeout;
  private heartbeat?: NodeJS.Timeout;
  private epoch = 0;
  private failures = 0;
  private controller = new AbortController();
  constructor(private channel: string) {}
  async start(url: (signal: AbortSignal) => Promise<string>, packet: (data: any, socket: WebSocket) => void, state: StateFn) {
    this.stop();
    const epoch = ++this.epoch;
    this.controller = new AbortController();
    const connect = async () => {
      if (epoch !== this.epoch) return;
      state('connecting');
      try {
        const endpoint = await url(this.controller.signal);
        if (epoch !== this.epoch) return;
        const socket = this.socket = new WebSocket(endpoint, { handshakeTimeout: 20000, maxPayload: 8 * 1024 * 1024 });
        socket.on('message', raw => {
          if (epoch !== this.epoch || socket !== this.socket) return;
          let data: any;
          try { data = JSON.parse(raw.toString()); } catch { return; }
          try { packet(data, socket); } catch { socket.terminate(); }
        });
        socket.on('error', () => socket.terminate());
        socket.on('close', code => {
          if (epoch !== this.epoch || socket !== this.socket) return;
          clearInterval(this.heartbeat);
          if ([4004, 4014, 4914].includes(code)) { state('error', `${this.channel} 凭据或事件权限被拒绝`, true); return; }
          state('connecting', `${this.channel} 连接断开，正在重连`);
          this.timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5)));
        });
      } catch (error) {
        if (epoch !== this.epoch) return;
        const fatal = error instanceof PlatformError && error.fatal;
        state('error', `${this.channel} 连接失败，请检查凭据和网络`, fatal);
        if (!fatal) this.timer = setTimeout(connect, Math.min(30000, 1000 * 2 ** Math.min(this.failures++, 5)));
      }
    };
    await connect();
  }
  ready() { this.failures = 0; }
  pulse(callback: () => void, interval: number) { clearInterval(this.heartbeat); this.heartbeat = setInterval(callback, Math.max(1000, interval)); this.heartbeat.unref(); }
  stop() { ++this.epoch; this.controller.abort(); clearTimeout(this.timer); clearInterval(this.heartbeat); this.socket?.terminate(); this.socket = undefined; }
}

/** Bounded JSON requests; platform error bodies may contain secrets, never echo them. */
export async function platformJson(fetchImpl: typeof fetch, url: string, init: RequestInit, channel: string): Promise<any> {
  const response = await fetchImpl(url, { ...init, signal: init.signal ? AbortSignal.any([init.signal, AbortSignal.timeout(30000)]) : AbortSignal.timeout(30000) });
  const data = await response.json().catch(() => ({}));
  const applicationError = (typeof data.errcode === 'number' && data.errcode !== 0) || (data.code !== undefined && ![0, '0', 'OK', 'Success'].includes(data.code));
  if (!response.ok || applicationError) {
    const authError = [40001, 40014, 42001, 11241, 11244].includes(Number(data.errcode ?? data.code));
    throw new PlatformError(`${channel} 请求失败（HTTP ${response.status}）`, response.status < 500 && response.status !== 429, response.status === 401 || response.status === 403 || authError);
  }
  return data;
}
