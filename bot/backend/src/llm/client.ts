/**
 * 模型访问接口。默认实现指向受管 magpie 的 OpenAI 兼容 /v1（流式 SSE）。
 * 运行时只依赖 ModelClient，可替换为任意 OpenAI 兼容端点。
 */
import { WorkGate } from '../core/work-gate.js';
/** OpenAI 兼容的多模态内容；只有用户刚发来的图片会用到（data URL） */
export type ChatContentPart = { type: "text"; text: string } | { type: "image_url"; image_url: { url: string } };

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string | ChatContentPart[];
}

/**
 * 能看图的模型。OKINTO 的模型目录不带输入模态，只能按名字判断；不在其中的模型
 * （DeepSeek、GLM 文本版等）收到图片时只拿到它在工作区里的路径。
 */
const IMAGE_INPUT_MODELS = /claude|gpt-4o|gpt-4\.1|gpt-[5-9]|gemini|grok-4|kimi-k3|muse-spark|qvq|-vl\b|-omni\b|glm-[\d.]+v\b/i;
export function acceptsImages(model: string): boolean {
  return IMAGE_INPUT_MODELS.test(model);
}

export interface ChatRequest {
  model: string;
  messages: ChatMessage[];
  signal?: AbortSignal;
  /** 推理强度；没有就不发，用模型默认 */
  reasoningEffort?: string;
  protocol?: 'auto' | 'chat' | 'responses' | 'messages';
  stream?: boolean;
  onTrace?: (event: { summary?: string; inputTokens?: number; outputTokens?: number }) => void;
}

export interface ModelClient {
  listModels(): Promise<string[]>;
  /** 流式生成；onDelta 收到增量文本；返回完整文本 */
  streamChat(req: ChatRequest, onDelta: (delta: string) => void): Promise<string>;
}

export interface Endpoint {
  baseUrl: string; // 形如 http://127.0.0.1:1234/v1
  apiKey: string;
}

/** 端点不响应时别一直等：不设的话要等底层默认的 5 分钟，"测试模型"这类等它的操作会一直转圈 */
const LIST_MODELS_TIMEOUT_MS = 30_000;

export class OpenAICompatClient implements ModelClient {
  private gate = new WorkGate();
  constructor(private endpoint: () => Endpoint, private fetchImpl: typeof fetch = fetch) {}

  private headers(): Record<string, string> {
    const { apiKey } = this.endpoint();
    return { "Content-Type": "application/json", ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}) };
  }

  async listModels(): Promise<string[]> {
    const res = await this.fetchImpl(`${this.endpoint().baseUrl}/models`, { headers: this.headers(), signal: AbortSignal.timeout(LIST_MODELS_TIMEOUT_MS) });
    if (!res.ok) throw new Error(`GET /models -> HTTP ${res.status}`);
    const body = (await res.json()) as { data?: Array<{ id: string }> };
    return (body.data ?? []).map((m) => m.id).sort();
  }

  streamChat(req: ChatRequest, onDelta: (delta: string) => void): Promise<string> {
    return this.gate.run(() => this.performChat(req, onDelta), req.signal);
  }
  private async performChat(req: ChatRequest, onDelta: (delta: string) => void): Promise<string> {
    const protocol = req.protocol === 'responses' || req.protocol === 'messages' ? req.protocol : 'chat';
    const streaming = req.stream !== false;
    const system = req.messages.filter(m => m.role === 'system').map(m => typeof m.content === 'string' ? m.content : m.content.filter(p => p.type === 'text').map(p => p.text).join('\n')).join('\n\n');
    const input = req.messages.map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(p => p.type === 'text' ? { type: 'input_text', text: p.text } : { type: 'input_image', image_url: p.image_url.url }) }));
    const anthropic = req.messages.filter(m => m.role !== 'system').map(m => ({ role: m.role, content: typeof m.content === 'string' ? m.content : m.content.map(p => {
      if (p.type === 'text') return { type: 'text', text: p.text };
      const data = /^data:([^;]+);base64,(.+)$/s.exec(p.image_url.url);
      return { type: 'image', source: data ? { type: 'base64', media_type: data[1], data: data[2] } : { type: 'url', url: p.image_url.url } };
    }) }));
    const body = protocol === 'responses'
      ? { model: req.model, input, stream: streaming, ...(req.reasoningEffort ? { reasoning: { effort: req.reasoningEffort, summary: 'auto' } } : {}) }
      : protocol === 'messages'
        ? { model: req.model, system, messages: anthropic, max_tokens: 8192, stream: streaming }
        : { model: req.model, messages: req.messages, stream: streaming, ...(req.reasoningEffort ? { reasoning_effort: req.reasoningEffort } : {}) };
    const res = await this.fetchImpl(`${this.endpoint().baseUrl}/${protocol === 'chat' ? 'chat/completions' : protocol}`, {
      method: "POST",
      headers: { ...this.headers(), Accept: streaming ? 'text/event-stream' : 'application/json', ...(protocol === 'messages' ? { 'x-api-key': this.endpoint().apiKey, 'anthropic-version': '2023-06-01' } : {}) },
      body: JSON.stringify(body),
      signal: req.signal,
    });
    if (!res.ok || !res.body) {
      const detail = await res.text().catch(() => "");
      throw new ModelError(`HTTP ${res.status}`, res.status, detail.slice(0, 500));
    }
    let full = '', summary = '';
    type WireContent = { type?: string; text?: string; summary?: Array<{ text?: string }>; content?: WireContent[] };
    type WireChunk = {
      type?: string; delta?: string | { type?: string; text?: string }; response?: WireChunk;
      choices?: Array<{ delta?: { content?: string | null; reasoning_summary?: string }; message?: { content?: string; reasoning_summary?: string } }>;
      content?: WireContent[]; output?: WireContent[];
      usage?: { input_tokens?: number; output_tokens?: number; prompt_tokens?: number; completion_tokens?: number };
      message?: { usage?: WireChunk['usage'] };
      error?: { message?: string };
    };
    const accept = (chunk: WireChunk, json = false) => {
      if (chunk.error || chunk.type === 'response.failed') throw new ModelError(chunk.error?.message || chunk.response?.error?.message || 'upstream error', 502, '');
      const usage = chunk.usage || chunk.response?.usage || chunk.message?.usage;
      if (usage) req.onTrace?.({ inputTokens: usage.input_tokens ?? usage.prompt_tokens, outputTokens: usage.output_tokens ?? usage.completion_tokens });
      // Only provider-designated public summaries are exposed, never raw thinking blocks.
      const summaryDelta = chunk.type === 'response.reasoning_summary_text.delta' && typeof chunk.delta === 'string' ? chunk.delta : chunk.choices?.[0]?.delta?.reasoning_summary;
      if (summaryDelta) { summary += summaryDelta; req.onTrace?.({ summary }); }
      if (json) {
        const finalSummary = protocol === 'responses' ? (chunk.output || []).flatMap(item => item.summary || []).map(item => item.text || '').join('\n') : chunk.choices?.[0]?.message?.reasoning_summary;
        if (finalSummary) req.onTrace?.({ summary: finalSummary });
      }
      let delta = protocol === 'chat' ? chunk.choices?.[0]?.delta?.content ?? chunk.choices?.[0]?.message?.content ?? ''
        : protocol === 'responses' ? chunk.type === 'response.output_text.delta' && typeof chunk.delta === 'string' ? chunk.delta : ''
          : typeof chunk.delta === 'object' && chunk.delta.type === 'text_delta' ? chunk.delta.text || '' : '';
      if (json) delta = protocol === 'responses' ? (chunk.output || []).flatMap(item => item.content || []).filter(item => item.type === 'output_text').map(item => item.text || '').join('') : protocol === 'messages' ? (chunk.content || []).filter(item => item.type === 'text').map(item => item.text || '').join('') : delta;
      if (delta) { full += delta; onDelta(delta); }
    };
    if (!streaming || res.headers.get('content-type')?.includes('application/json')) {
      accept(await res.json() as WireChunk, true); return full;
    }
    const parser = new SSEParser((data) => {
      if (data === "[DONE]") return;
      let chunk: WireChunk;
      try {
        chunk = JSON.parse(data);
      } catch {
        return;
      }
      accept(chunk);
    });
    const decoder = new TextDecoder();
    for await (const bytes of res.body as unknown as AsyncIterable<Uint8Array>) {
      parser.push(decoder.decode(bytes, { stream: true }));
    }
    parser.push(decoder.decode());
    parser.end();
    return full;
  }
}

export class ModelError extends Error {
  constructor(message: string, readonly status: number, readonly detail: string) {
    super(message);
  }
}

/** 最小 SSE 解析器：按空行切事件，拼接多行 data:。 */
export class SSEParser {
  private buf = "";
  private data: string[] = [];
  constructor(private onData: (data: string) => void) {}

  push(text: string): void {
    this.buf += text;
    let idx: number;
    while ((idx = this.buf.search(/\r?\n/)) >= 0) {
      const line = this.buf.slice(0, idx);
      this.buf = this.buf.slice(idx + (this.buf[idx] === "\r" ? 2 : 1));
      this.line(line);
    }
  }

  end(): void {
    if (this.buf) this.line(this.buf);
    this.buf = "";
    this.line("");
  }

  private line(line: string): void {
    if (line === "") {
      if (this.data.length) {
        const d = this.data.join("\n");
        this.data = [];
        this.onData(d);
      }
      return;
    }
    if (line.startsWith(":")) return;
    if (line.startsWith("data:")) this.data.push(line.slice(5).replace(/^ /, ""));
  }
}
