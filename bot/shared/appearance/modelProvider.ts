/** Resolve a model's manufacturer independently of its gateway or supplier. */
export function modelProvider(model = ""): string {
  const name = model.toLowerCase();
  if (/deepseek/.test(name)) return "deepseek";
  if (/\bglm|zhipu|智谱/.test(name)) return "zhipu";
  if (/claude|anthropic/.test(name)) return "claude";
  if (/gemini|gemma/.test(name)) return "gemini";
  if (/qwen|qwq/.test(name)) return "qwen";
  if (/moonshot|kimi/.test(name)) return "moonshot";
  if (/grok|xai/.test(name)) return "grok";
  if (/gpt|codex|\bo[1-9](?:-|$)|openai/.test(name)) return "openai";
  return "";
}

export const modelProviderLabels: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  zhipu: "智谱",
  claude: "Anthropic",
  gemini: "Google",
  qwen: "通义千问",
  moonshot: "Moonshot",
  grok: "xAI",
};
export function modelProviderLabel(model = ""): string {
  return modelProviderLabels[modelProvider(model)] || "通用";
}
