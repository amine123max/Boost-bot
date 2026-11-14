export interface ModelMetrics {
  model: string;
  reasoning: {
    value: "auto" | "low" | "medium" | "high";
    supported: boolean | null;
  };
  windowTokens: number | null;
  windowBasis?: "catalog" | "runtime" | "default" | null;
  agentAvailable: boolean;
  usage: {
    inputTokens: number | null;
    outputTokens: number | null;
    requests: number;
    scope: string;
    inputComplete: boolean;
    outputComplete: boolean;
  };
  context: {
    usedTokens: number | null;
    measuredAt: number | null;
    basis: string;
    breakdown: {
      messages: number;
      systemPrompt: number;
      systemTools: number | null;
      skills: number | null;
      projectContext: number | null;
    };
  };
}
