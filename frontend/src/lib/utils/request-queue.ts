type QueuedRequest = { start: () => void };

/** One FIFO queue for management RPCs across every page in this client. */
export function createRequestQueue(concurrency = 6) {
  if (!Number.isSafeInteger(concurrency) || concurrency < 1)
    throw new Error("请求并发数必须为正整数");
  const waiting: QueuedRequest[] = [];
  let active = 0;

  function drain() {
    while (active < concurrency && waiting.length) waiting.shift()!.start();
  }

  function run<T>(task: () => Promise<T>, signal?: AbortSignal): Promise<T> {
    return new Promise<T>((resolve, reject) => {
      const aborted = () =>
        signal?.reason ?? new DOMException("请求已取消", "AbortError");
      if (signal?.aborted) {
        reject(aborted());
        return;
      }
      const cancel = () => {
        const index = waiting.indexOf(entry);
        if (index >= 0) {
          waiting.splice(index, 1);
          reject(aborted());
        }
      };
      const entry: QueuedRequest = {
        start() {
          signal?.removeEventListener("abort", cancel);
          ++active;
          void (async () => {
            try {
              resolve(await task());
            } catch (error) {
              reject(error);
            } finally {
              --active;
              drain();
            }
          })();
        },
      };
      signal?.addEventListener("abort", cancel, { once: true });
      waiting.push(entry);
      drain();
    });
  }
  return { run };
}

export const managementRequestQueue = createRequestQueue();
