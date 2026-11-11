// official：zh 与 en 的键必须一一对应（en 的类型由 zh 推出，少一个多一个都过不了类型检查）。
import type { Catalog } from "../types.js";

export const zh = {
  invalid_key: "{name} 没有接受这个 Key，请检查后再试",
  rate_limited: "{name} 现在限流了，稍后再试",
  network: "连不上 {name}。如果这台设备访问它需要代理，请先设置代理",
  upstream: "{name} 没有返回模型列表：{detail}",
} satisfies Catalog;

export const en: Catalog<typeof zh> = {
  invalid_key: "{name} didn't accept this key. Check it and try again",
  rate_limited: "{name} is rate limiting right now. Try again shortly",
  network: "Can't reach {name}. If this device needs a proxy to reach it, set the proxy first",
  upstream: "{name} didn't return a model list: {detail}",
};
