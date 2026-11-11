import { invoke, withAddr } from "./transport";
import { normalizeProxySnapshot } from "../proxy-state";

export interface ProxyMeasurement {
  state: "" | "pending" | "running" | "success" | "failed" | "cancelled";
  latencyMs: number | null;
  jitterMs: number | null;
  lossPercent: number | null;
  downloadMbps: number | null;
  testedAt: number | null;
  error: string;
}
export interface ProxyNode {
  id: string;
  name: string;
  protocol: string;
  countryCode: string;
  country: string;
  countrySource: "label" | "measured";
  latencyMs: number | null;
  selected: boolean;
  measurement: ProxyMeasurement;
}
export interface ProxySnapshot {
  nodes: ProxyNode[];
  strategy: "stable" | "latency" | "manual";
  selectedId: string;
  bindings: Record<string, string>;
  testRunning: boolean;
  error: string | null;
  kernel: {
    localPath: string;
    source: string;
    busy: boolean;
    phase: string;
    installedVersion: string;
    latestVersion: string;
    autoUpdate: boolean;
    checkedAt: number | null;
    error: string;
  };
}
export type ProxyAction =
  | "import"
  | "remove"
  | "strategy"
  | "bind"
  | "test"
  | "cancelTest"
  | "coreCheck"
  | "coreScan"
  | "coreInstall"
  | "coreUpdate"
  | "coreAuto";
export const proxyClient = {
  get: async () =>
    normalizeProxySnapshot(
      await invoke<unknown>("service_gateway_upstream_proxy_get", withAddr(), {
        timeoutMs: 15_000,
        retries: 0,
      }),
    ),
  action: async (action: ProxyAction, options: Record<string, unknown> = {}) =>
    normalizeProxySnapshot(
      await invoke<unknown>(
        "service_gateway_proxy_action",
        withAddr({ action, options }),
        { timeoutMs: 30_000, retries: 0 },
      ),
    ),
};
