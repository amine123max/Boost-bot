/** Per-process model admission: bounded FIFO waiting, cancellation and no retries. */
export class WorkGate {
  private active = 0;
  private waiting: Array<{ start: () => void; reject: (error: Error) => void }> = [];
  constructor(private limit = 32, private maxWaiting = 256) {}

  async run<T>(work: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    signal?.throwIfAborted();
    let reserved = false;
    if (this.active >= this.limit) {
      if (this.waiting.length >= this.maxWaiting) throw new Error('模型请求队列已满，请稍后重试');
      await new Promise<void>((resolve, reject) => {
        const item = { start: () => { cleanup(); resolve(); }, reject };
        const cleanup = () => { clearTimeout(timer); signal?.removeEventListener('abort', abort); };
        const remove = () => { const index = this.waiting.indexOf(item); if (index >= 0) this.waiting.splice(index, 1); };
        const abort = () => { remove(); cleanup(); reject(signal?.reason || new Error('请求已停止')); };
        const timer = setTimeout(() => { remove(); cleanup(); reject(new Error('模型排队超时，请稍后重试')); }, 30_000);
        this.waiting.push(item); signal?.addEventListener('abort', abort, { once: true });
      });
      reserved = true;
    }
    if (!reserved) this.active++;
    try { signal?.throwIfAborted(); return await work(); }
    finally {
      this.active--;
      // Reserve synchronously so a newly arriving caller cannot steal the slot.
      const next = this.waiting.shift();
      if (next) { this.active++; next.start(); }
    }
  }
}
