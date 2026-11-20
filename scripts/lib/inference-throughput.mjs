import { performance } from 'node:perf_hooks';
import { setTimeout as wait } from 'node:timers/promises';

function percentile(sorted, fraction) {
  return sorted.length ? Number(sorted[Math.ceil(sorted.length * fraction) - 1].toFixed(2)) : null;
}

/** Open-loop load; latency includes scheduler/client delay. No silent retries. */
export async function inferenceThroughput({ request, rate, durationMs, maxPending = 512 }) {
  const target = Math.floor(rate * durationMs / 1000);
  const startedAt = performance.now();
  const latency = [], wireLatency = [], statuses = {};
  const failureSamples = {};
  const pending = new Set();
  let index = 0, dropped = 0, peakPending = 0;
  while (index < target) {
    const now = performance.now();
    const due = Math.min(target, Math.floor((now - startedAt) * rate / 1000) + 1);
    for (; index < due; index++) {
      const scheduledAt = startedAt + index * 1000 / rate;
      if (pending.size >= maxPending) { dropped++; continue; }
      const call = Promise.resolve().then(request).then(result => {
        const status = result.status;
        statuses[status] = (statuses[status] || 0) + 1;
        if (status >= 200 && status < 300 && result.valid !== false) {
          latency.push(performance.now() - scheduledAt);
          wireLatency.push(result.ms);
        } else if (!(status in failureSamples)) {
          // The probe only sends fixture data and synthetic credentials.
          failureSamples[status] = result.text.slice(0, 240);
        }
      }).catch(() => { statuses.transport_error = (statuses.transport_error || 0) + 1; })
        .finally(() => pending.delete(call));
      pending.add(call);
      peakPending = Math.max(peakPending, pending.size);
    }
    if (index < target) await wait(2);
  }
  await Promise.all(pending);
  const wallMs = Math.max(durationMs, performance.now() - startedAt);
  latency.sort((a,b) => a-b); wireLatency.sort((a,b) => a-b);
  return {
    offeredQps: rate, requested: target, successful: latency.length, statuses, failureSamples, dropped, peakPending,
    successfulQps: Number((latency.length * 1000 / wallMs).toFixed(2)),
    successRatio: latency.length / target,
    p50Ms: percentile(latency, .5), p95Ms: percentile(latency, .95), p99Ms: percentile(latency, .99),
    wireP95Ms: percentile(wireLatency, .95),
  };
}
