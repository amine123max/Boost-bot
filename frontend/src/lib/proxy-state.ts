import type {
  ProxySnapshot,
  ProxyNode,
  ProxyMeasurement,
} from "./api/proxy-client";
const record = (value: unknown): Record<string, unknown> =>
  value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
const text = (value: unknown) => (typeof value === "string" ? value : "");
const metric = (value: unknown) =>
  typeof value === "number" && Number.isFinite(value) && value >= 0
    ? value
    : null;
export function normalizeProxySnapshot(payload: unknown): ProxySnapshot {
  const source = record(payload),
    kernel = record(source.kernel);
  const nodes: ProxyNode[] = [];
  for (const entry of Array.isArray(source.nodes) ? source.nodes : []) {
    const n = record(entry),
      m = record(n.measurement);
    if (!text(n.id)) continue;
    const state = [
      "",
      "pending",
      "running",
      "success",
      "failed",
      "cancelled",
    ].includes(text(m.state))
      ? (text(m.state) as ProxyMeasurement["state"])
      : "";
    nodes.push({
      id: text(n.id),
      name: text(n.name),
      protocol: text(n.protocol) || "proxy",
      countryCode: /^[a-z]{2}$/i.test(text(n.countryCode))
        ? text(n.countryCode).toUpperCase()
        : "",
      country: text(n.country) || "地区待检测",
      countrySource: n.countrySource === "measured" ? "measured" : "label",
      latencyMs: metric(n.latencyMs),
      selected: n.selected === true,
      measurement: {
        state,
        latencyMs: metric(m.latencyMs),
        jitterMs: metric(m.jitterMs),
        lossPercent: metric(m.lossPercent),
        downloadMbps: metric(m.downloadMbps),
        testedAt: metric(m.testedAt),
        error: text(m.error),
      },
    });
  }
  return {
    nodes,
    strategy:
      source.strategy === "latency" || source.strategy === "manual"
        ? source.strategy
        : "stable",
    selectedId: text(source.selectedId),
    bindings: Object.fromEntries(
      Object.entries(record(source.bindings)).filter(
        (entry): entry is [string, string] => typeof entry[1] === "string",
      ),
    ),
    testRunning: source.testRunning === true,
    error: text(source.error) || null,
    kernel: {
      localPath: text(kernel.localPath),
      source: text(kernel.source) || "missing",
      busy: kernel.busy === true,
      phase: text(kernel.phase),
      installedVersion: text(kernel.installedVersion),
      latestVersion: text(kernel.latestVersion),
      autoUpdate: kernel.autoUpdate === true,
      checkedAt: metric(kernel.checkedAt),
      error: text(kernel.error),
    },
  };
}
