import type { Activity } from "../types";

export interface ActivityGroup {
  step: Activity;
  events: Activity[];
}
/** Retries belong to the request they retry; do not invent a task for each attempt. */
export function activityGroups(entries: Activity[]): ActivityGroup[] {
  const groups: ActivityGroup[] = [];
  let model: ActivityGroup | undefined;
  for (const step of entries) {
    if ((step.kind === "retry" || step.kind === "error") && model) {
      model.events.push(step);
      if (
        step.kind === "error" &&
        step.status === "error" &&
        model.step.status !== "ok"
      )
        model.step = { ...model.step, status: "error" };
      continue;
    }
    const group = { step, events: [] as Activity[] };
    groups.push(group);
    if (step.kind === "model") model = group;
    else if (step.kind !== "steer") model = undefined;
  }
  return groups;
}
