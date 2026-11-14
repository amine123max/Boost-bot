import type { BotActivity } from './bot-activity';

/** Presentation fallback only. Reported progress and completion always win. */
export class TaskProgressClock {
  private startedAt: number | null = null;
  private pausedAt: number | null = null;
  private pausedMs = 0;
  private weights: number[] = [];
  private lastReported: number | null = null;
  private ended = true;
  private lastTimer = 0;
  constructor(private random: () => number = Math.random) {}

  project(value: BotActivity, now: number): BotActivity {
    const active = value.state === 'working' || value.state === 'waiting';
    if (!active) {
      if (value.state !== 'unavailable') this.ended = true;
      const percent = value.state === 'done' ? 100 : value.percent;
      return { ...value, percent, progressSource: percent === null ? undefined : 'reported' };
    }
    if (this.ended || this.startedAt === null) {
      this.startedAt = now;
      this.pausedAt = null;
      this.pausedMs = 0;
      this.lastReported = null;
      this.lastTimer = 0;
      this.weights = Array.from({ length: 20 }, () => .35 + Math.max(0, Math.min(1, this.random())) * 1.65);
      this.ended = false;
    }
    if (value.state === 'waiting' && this.pausedAt === null) this.pausedAt = now;
    if (value.state === 'working' && this.pausedAt !== null) {
      this.pausedMs += Math.max(0, now - this.pausedAt);
      this.pausedAt = null;
    }
    if (value.percent !== null) {
      this.lastReported = value.percent;
      return { ...value, progressSource: 'reported' };
    }
    if (this.lastReported !== null) return { ...value, percent: this.lastReported, progressSource: 'reported' };
    const elapsed = Math.max(0, (this.pausedAt ?? now) - this.startedAt - this.pausedMs);
    const position = Math.min(20, elapsed / 30_000), whole = Math.floor(position);
    const accumulated = this.weights.slice(0, whole).reduce((sum, weight) => sum + weight, 0) + (this.weights[whole] || 0) * (position - whole);
    const total = this.weights.reduce((sum, weight) => sum + weight, 0);
    const percent = this.lastTimer = Math.max(this.lastTimer, elapsed >= 600_000 ? 80 : Math.min(79, Math.floor(accumulated / total * 80)));
    return { ...value, percent, progressSource: 'timer' };
  }
}
