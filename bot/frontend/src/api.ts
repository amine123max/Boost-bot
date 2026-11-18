// The hosted workspace uses the same authenticated HTTP/SSE transport as Bot apps.
// No credentials are placed in URLs, logs, or rendered diagnostics.
import type { FileItem } from "./types";
function authHeaders(): Record<string, string> {
  try {
    const token = sessionStorage.getItem("amb-token");
    return token ? { "x-amb-token": token } : {};
  } catch {
    return {};
  }
}
interface RequestOptions {
  method?: string;
  body?: unknown;
  signal?: AbortSignal;
}

const base = "/boost-bot/amb/api";
const headers = () => ({
  "x-amb-lang": document.documentElement.lang || "zh-CN",
  ...authHeaders(),
});
export const enc = encodeURIComponent;
export class ApiError extends Error {
  constructor(readonly status: number, message: string) { super(message); }
}
function requestError(status: number, message: string) {
  return new ApiError(status, status === 401 ? "连接已失效，请返回 Boost 重新打开工作台。" : message);
}
export async function api<T = Record<string, unknown>>(
  path: string,
  { method = "GET", body, signal }: RequestOptions = {},
): Promise<T> {
  const timeout = AbortSignal.timeout(30_000);
  const response = await fetch(base + path, {
    method,
    signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    headers: {
      ...headers(),
      ...(body !== undefined ? { "content-type": "application/json" } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok)
    throw requestError(response.status, data.error || `请求失败（${response.status}）`);
  return data;
}

export function eventParser(emit: (event: string, data: unknown, id?: string) => void) {
  let buffer = "",
    event = "message";
  let data: string[] = [], id: string | undefined;
  function line(value: string) {
    if (!value) {
      if (data.length) {
        const raw = data.join("\n");
        let parsed;
        try {
          parsed = JSON.parse(raw);
        } catch {
          parsed = raw;
        }
        emit(event, parsed, id);
      }
      event = "message";
      data = [];
      id = undefined;
    } else if (value.startsWith("event:")) event = value.slice(6).trim();
    else if (value.startsWith("id:")) id = value.slice(3).trim();
    else if (value.startsWith("data:"))
      data.push(value.slice(5).replace(/^ /, ""));
  }
  return {
    push(text: string) {
      buffer += text;
      let i;
      while ((i = buffer.indexOf("\n")) !== -1) {
        line(buffer.slice(0, i).replace(/\r$/, ""));
        buffer = buffer.slice(i + 1);
      }
    },
    end() {
      // An interrupted response can end halfway through an event. Never advance
      // the resume cursor for a frame that did not have a terminating blank line.
      buffer = "";
    },
  };
}

export async function stream(
  path: string,
  {
    body,
    signal,
    onEvent,
  }: {
    body?: unknown;
    signal?: AbortSignal;
    onEvent: (event: string, data: unknown, id?: string) => void;
  },
) {
  const timeout = new AbortController();
  const abort = signal ? AbortSignal.any([signal, timeout.signal]) : timeout.signal;
  let timer = setTimeout(() => timeout.abort(new Error('消息连接超时。')), 30_000);
  let response: Response;
  try { response = await fetch(base + path, {
    method: body ? "POST" : "GET",
    signal: abort,
    headers: {
      ...headers(),
      accept: "text/event-stream",
      ...(body ? { "content-type": "application/json" } : {}),
    },
    body: body ? JSON.stringify(body) : undefined,
  }); } finally { clearTimeout(timer); }
  if (!response.ok || !response.body) {
    const data = await response.json().catch(() => ({}));
    throw requestError(response.status, data.error || `无法连接消息流（${response.status}）`);
  }
  const parser = eventParser(onEvent),
    decoder = new TextDecoder(),
    reader = response.body.getReader();
  try {
    for (;;) {
      timer = setTimeout(() => timeout.abort(new Error('消息流长时间没有心跳。')), 60_000);
      const { done, value } = await reader.read();
      clearTimeout(timer);
      if (done) break;
      parser.push(decoder.decode(value, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
  } catch (error) {
    await reader.cancel().catch(() => {});
    throw error;
  } finally {
    clearTimeout(timer);
    reader.releaseLock();
  }
}

export async function downloadFile(conversation: string, file: FileItem) {
  return download(
    `/conversations/${enc(conversation)}/file?path=${enc(file.path)}`,
    file.name,
  );
}
export async function download(path: string, name: string) {
  const response = await fetch(base + path, { headers: headers() });
  if (!response.ok) throw new Error(`文件无法下载（${response.status}）`);
  const url = URL.createObjectURL(await response.blob());
  const link = document.createElement("a");
  link.href = url;
  link.download = name || "download";
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 30_000);
}
