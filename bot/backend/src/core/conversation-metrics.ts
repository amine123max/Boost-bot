import type { Store, Bot } from "../store/db.js";
import type { ActivityStep } from "../agent/activity.js";

/** Text-only estimate; tool schemas, images and hidden agent context are unknown. */
export function estimateTextTokens(text: string): number {
  const cjk =
    text.match(/[\u3400-\u9fff\u3040-\u30ff\uac00-\ud7af]/gu)?.length || 0;
  return Math.ceil(cjk * 1.5 + (Array.from(text).length - cjk) / 4);
}
const count = (value: unknown): value is number =>
  typeof value === "number" && Number.isFinite(value) && value >= 0;

export function conversationMetrics(
  store: Store,
  bot: Bot,
  conversationId: string,
  model: string,
  cut = Infinity,
) {
  const messages = store
    .listMessages(conversationId, 200)
    .filter((message) => message.id <= cut);
  let inputTokens = 0,
    outputTokens = 0,
    inputSamples = 0,
    outputSamples = 0,
    requests = 0;
  let lastInput: number | null = null,
    lastOutput: number | null = null,
    measuredAt: number | null = null;
  for (const message of messages) {
    if (message.role !== "assistant") continue;
    for (const raw of store.getActivity(conversationId, message.id)) {
      const step = raw as Partial<ActivityStep>;
      // Historical model aliases remain separate; never charge another model to this one.
      if (!step || step.kind !== "model" || step.title !== model) continue;
      const input = step.tokens?.input,
        output = step.tokens?.output;
      if (!count(input) && !count(output)) continue;
      requests++;
      if (count(input)) {
        inputTokens += input;
        inputSamples++;
      }
      if (count(output)) {
        outputTokens += output;
        outputSamples++;
      }
      lastInput = count(input) ? input : null;
      lastOutput = count(output) ? output : null;
      measuredAt = count(step.at) ? step.at : message.createdAt;
    }
  }
  return {
    usage: {
      inputTokens: inputSamples ? inputTokens : null,
      outputTokens: outputSamples ? outputTokens : null,
      requests,
      scope: "recent-200-messages" as const,
      inputComplete: requests > 0 && inputSamples === requests,
      outputComplete: requests > 0 && outputSamples === requests,
    },
    context: {
      usedTokens: lastInput === null ? null : lastInput + (lastOutput || 0),
      measuredAt,
      basis:
        lastInput === null ? ("unknown" as const) : ("last-request" as const),
      breakdown: {
        messages: estimateTextTokens(
          messages
            .filter((m) => m.role !== "system")
            .map((m) => m.content)
            .join("\n"),
        ),
        systemPrompt: estimateTextTokens(bot.systemPrompt),
        systemTools: null,
        skills: null,
        projectContext: null,
      },
    },
  };
}
