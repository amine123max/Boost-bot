import type http from "node:http";
import type { ActivityStep } from "../agent/activity.js";
import type { OutboundOp, ReplySession } from "../core/types.js";
import { describeFile } from "./files.js";

export function publicActivity({ id, kind, title, status, cut, at, ms }: ActivityStep): ActivityStep {
  return { id, kind, title, status, cut, at, ms };
}

/**
 * 运行时的 OutboundOp → 网页对话的 SSE 事件：text（到目前为止的完整回复，覆盖式）、interim（模型在回合中间说的一段话，追加）、
 * typing、prompt（审批/提问）、file（交付的文件，见 ShownFile；回合中 present 时就发）、activity（代理的一步，按 id 覆盖）。
 * stream.start 不发。
 */
export function opEvent(op: OutboundOp): [string, unknown] | undefined {
  switch (op.type) {
    case "typing":
      return ["typing", { on: op.on }];
    case "stream.start":
      return undefined;
    case "stream.update":
      return ["text", { text: op.text }];
    case "stream.finish":
    case "text":
      return ["text", { text: op.text, final: true }];
    case "interim":
      return ["interim", { text: op.text }];
    case "file":
    case "presented":
      return ["file", describeFile(op.path, op.name)];
    case "interactive":
      return ["prompt", { kind: op.kind, prompt: op.prompt, requestId: op.requestId, code: op.code }];
    case "activity":
      return ["activity", publicActivity(op.step)];
  }
}

/**
 * 网页对话渠道：把事件写成 text/event-stream。
 * 事件见 opEvent，另有 snapshot（接上进行中的回合时先发一次）、stopping、done、error。
 * 旧客户端接收累计正文；启用增量时按订阅独立计算偏移，首次及重连仍从快照开始。
 */
export class SseReply implements ReplySession {
  private closed = false;
  private sentText = '';
  text = "";

  constructor(private res: http.ServerResponse, private deltaText = false) {
    res.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
      connection: "keep-alive",
    });
    res.flushHeaders();
    res.on("close", () => (this.closed = true));
    // 代理回合可能长时间没有输出：定期发注释行，避免中间层断开空闲连接
    const beat = setInterval(() => this.raw(": keep-alive\n\n"), 15_000);
    res.on("close", () => clearInterval(beat));
  }

  get isClosed(): boolean {
    return this.closed;
  }

  send(event: string, data: unknown): void {
    if (this.deltaText) {
      const frame = data as { text?: string; final?: boolean } | null;
      if (event === 'snapshot' || event === 'turn' || event === 'turnEnd') this.sentText = frame?.text ?? '';
      if (event === 'text' && typeof frame?.text === 'string') {
        const next = frame.text;
        if (next.startsWith(this.sentText)) {
          const offset = this.sentText.length;
          const append = next.slice(offset);
          this.sentText = next;
          if (!append && !frame.final) return;
          event = 'textDelta';
          data = { offset, append, ...(frame.final ? { final: true } : {}) };
        } else this.sentText = next; // Reset or rewrite; send the authoritative replacement.
      }
    }
    this.raw(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  }

  private raw(chunk: string): void {
    if (this.closed || this.res.writableEnded) return;
    // A stalled client must not accumulate unbounded copies of cumulative text.
    // Disconnecting the subscriber leaves server work/history intact for reconnect.
    if (this.res.writableLength > 1_048_576) { this.closed = true; this.res.destroy(); return; }
    this.res.write(chunk);
  }

  async apply(op: OutboundOp): Promise<void> {
    if (op.type === "stream.update" || op.type === "stream.finish" || op.type === "text") this.text = op.text;
    const ev = opEvent(op);
    if (ev) this.send(ev[0], ev[1]);
  }

  end(event: "done" | "error", data: unknown): void {
    this.send(event, data);
    if (!this.closed && !this.res.writableEnded) this.res.end();
  }
}
