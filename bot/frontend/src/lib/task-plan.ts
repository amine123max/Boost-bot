import type { Activity } from "../types";

export interface PlanItem {
  id: string;
  text: string;
  state: "pending" | "working" | "done" | "failed";
}
export interface TaskPlan {
  kind: "plan" | "execution";
  items: PlanItem[];
}

/** Read recorded structured plans only; tool activity is labelled separately. */
export function taskPlan(steps: Activity[]): TaskPlan {
  for (const step of [...steps].reverse()) {
    const name = step.title?.replace(/^functions\./, "");
    if (
      !name ||
      !["update_plan", "TodoWrite", "todo_write"].includes(name) ||
      step.status !== "ok" ||
      !step.input
    )
      continue;
    try {
      const value = JSON.parse(step.input) as {
        plan?: unknown;
        todos?: unknown;
      };
      const list = value.plan ?? value.todos;
      if (!Array.isArray(list) || !list.length || list.length > 256) continue;
      const items: PlanItem[] = [];
      for (const [index, entry] of list.entries()) {
        if (!entry || typeof entry !== "object") continue;
        const raw = entry as Record<string, unknown>;
        const text =
          typeof raw.step === "string"
            ? raw.step
            : typeof raw.content === "string"
              ? raw.content
              : "";
        if (!text.trim()) continue;
        items.push({
          id: `${step.id}:${index}`,
          text: text.trim(),
          state:
            raw.status === "completed"
              ? "done"
              : raw.status === "in_progress"
                ? "working"
                : "pending",
        });
      }
      if (items.length) return { kind: "plan", items };
    } catch {
      /* Long, truncated tool arguments cannot be treated as a plan. */
    }
  }
  return {
    kind: "execution",
    items: steps
      .filter((step) => step.kind !== "steer")
      .map((step) => ({
        id: step.id,
        text: step.summary || step.title || step.label || "执行步骤",
        state:
          step.status === "ok"
            ? "done"
            : step.status === "error"
              ? "failed"
              : step.status === "running"
                ? "working"
                : "pending",
      })),
  };
}
