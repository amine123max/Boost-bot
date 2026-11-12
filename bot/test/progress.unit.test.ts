import { describe, expect, test } from "vitest";
import { ActivityLog } from "../src/agent/activity.js";
import { progressSnapshot, reportedProgress } from "../src/agent/progress.js";

describe("request completion estimates", () => {
  test("only valid explicit progress calls update the estimate, including lower revisions", () => {
    const log = new ActivityLog();
    expect(log.progress).toBeNull();
    log.apply("tool/call", { name: "bash", arguments: '{"percent":70}' });
    expect(log.progress).toBeNull();
    for (const [percent, expected] of [[60,60],[35,35],[100,99],[-1,99],[NaN,99]]) {
      log.apply("tool/call", { name: "report_progress", arguments: JSON.stringify({ percent }) });
      expect(log.progress).toBe(expected);
    }
    expect(reportedProgress("report_progress", '{"percent":"50"}')).toBeNull();
    expect(reportedProgress("report_progress", "invalid")).toBeNull();
    expect(reportedProgress("report_progress", '{"percent":101}')).toBeNull();
  });
  test("unknown work stays indeterminate and waiting outranks completion", () => {
    const now = Date.now();
    expect(progressSnapshot([], now)).toMatchObject({ state: "idle", percent: null, activeTasks: 0 });
    expect(progressSnapshot([{ id: "run", state: "working", percent: null, updatedAt: now }], now)).toMatchObject({ state: "working", percent: null });
    expect(progressSnapshot([
      { id: "ended", state: "done", percent: 100, updatedAt: now },
      { id: "wait", state: "waiting", percent: 40, updatedAt: now - 30000 },
    ], now)).toMatchObject({ state: "waiting", percent: 40, activeTasks: 1, waitingTasks: 1 });
  });
  test("parallel tasks never combine unrelated percentages and endings expire", () => {
    const now = Date.now();
    expect(progressSnapshot([
      { id: "a", state: "working", percent: 10, updatedAt: now },
      { id: "b", state: "working", percent: 80, updatedAt: now },
    ], now)).toMatchObject({ state: "working", percent: null, activeTasks: 2 });
    expect(progressSnapshot([{ id: "a", state: "done", percent: 100, updatedAt: now - 61000 }], now)).toMatchObject({ state: "idle", percent: null });
    expect(progressSnapshot([{ id: "a", state: "failed", percent: 35, updatedAt: now }], now)).toMatchObject({ state: "failed", percent: 35 });
  });
});

test("TPS uses reported model output and actual response duration", () => {
  const log = new ActivityLog();
  log.apply("step/start", { turn: 1, step: 1 }, 1000);
  log.apply("assistant/message", { turn: 1, step: 1, message: { content: [] }, usage: { outputTokens: 90 } }, 4000);
  expect(log.outputTps(4000)).toBe(30);
  expect(log.outputTps(35000)).toBeNull();
  expect(new ActivityLog().outputTps()).toBeNull();
});
