import type { Store } from "../store/db.js";
import type { Endpoint } from "../llm/client.js";
import { registerSecret } from "../log.js";

export interface ModelSource {
  id: string;
  kind: "account_pool" | "aggregate_api";
  label: string;
  models: string[];
  requiresKey: boolean;
}
export interface SourceBroker {
  url: string;
  token: string;
}
export class ModelSources {
  private cached?: { at: number; sources: ModelSource[] };
  private reading?: Promise<ModelSource[]>;
  constructor(
    private store: Store,
    private fallback: () => Endpoint,
    private broker?: SourceBroker,
  ) {
    if (broker) registerSecret(broker.token);
  }
  private async request<T>(body?: Record<string, unknown>): Promise<T> {
    if (!this.broker) throw new Error("当前运行环境未连接Boost模型来源服务");
    const response = await fetch(this.broker.url, {
      method: body ? "POST" : "GET",
      headers: {
        "x-boost-bot-source-token": this.broker.token,
        ...(body ? { "content-type": "application/json" } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    const value = await response.json().catch(() => ({}));
    if (!response.ok)
      throw new Error(value.error || "无法读取当前账号的模型来源");
    return value as T;
  }
  async list(force = false): Promise<ModelSource[]> {
    if (!this.broker) return [];
    if (!force && this.cached && Date.now() - this.cached.at < 5000)
      return this.cached.sources;
    if (!this.reading)
      this.reading = this.request<{sources:ModelSource[]}>()
        .then((value) => {
          const sources = value.sources as ModelSource[];
          if (!Array.isArray(sources)) throw new Error("模型来源列表无效");
          this.cached = { at: Date.now(), sources };
          return sources;
        })
        .finally(() => {
          this.reading = undefined;
        });
    return this.reading;
  }
  async validate(source: string) {
    if (source === "default") return;
    if (!(await this.list()).some((item) => item.id === source))
      throw new Error("所选模型来源已停用或不属于当前账号");
  }
  async prepare(source: string, models: string[] = []) {
    if (source === "default") return;
    await this.validate(source);
    const available = await this.models(source);
    if (
      !models[0] ||
      models.some((model) => model && !available.includes(model))
    )
      throw new Error("请选择所选来源目录中的模型");
    await this.endpointForSource(source, true, models[0]);
  }
  async endpointForSource(
    source: string,
    prepare = false,
    model?: string,
  ): Promise<Endpoint> {
    if (source === "default") return this.fallback();
    const endpoint = (await this.request<Endpoint>({
      source,
      prepare,
      ...(model ? { model } : {}),
    })) as Endpoint;
    if (
      endpoint.baseUrl !== this.fallback().baseUrl ||
      typeof endpoint.apiKey !== "string" ||
      !endpoint.apiKey
    )
      throw new Error("模型来源必须经当前Boost网关");
    registerSecret(endpoint.apiKey);
    return endpoint;
  }
  async endpoint(botId?: string, model?: string): Promise<Endpoint> {
    return this.endpointForSource(
      botId
        ? this.store.getBot(botId)?.settings.modelSource || "default"
        : "default",
      false,
      model,
    );
  }
  async models(source: string): Promise<string[]> {
    if (source === "default") throw new Error("默认来源模型由现有目录提供");
    const item = (await this.list()).find((item) => item.id === source);
    if (!item) throw new Error("所选模型来源已停用或不属于当前账号");
    return item.models;
  }
}
export function modelSourceValue(raw: unknown): string {
  if (raw === undefined) return "default";
  if (
    typeof raw !== "string" ||
    !(
      raw === "default" ||
      raw === "account_pool" ||
      /^aggregate:[A-Za-z0-9_-]{1,128}$/.test(raw)
    )
  )
    throw new Error("模型来源无效");
  return raw;
}
