export const modelProviderLabels: Record<string, string> = {
  openai: "OpenAI",
  deepseek: "DeepSeek",
  zhipu: "智谱",
  claude: "Anthropic",
  gemini: "Google",
  qwen: "通义千问",
  moonshot: "Moonshot",
  grok: "xAI",
  minimax: "MiniMax", mistral: "Mistral AI", meta: "Meta", doubao: "字节跳动",
  baichuan: "百川智能", hunyuan: "腾讯混元", yi: "零一万物", cohere: "Cohere",
  perplexity: "Perplexity", microsoft: "Microsoft", stepfun: "阶跃星辰", internlm: "书生·浦语",
  nvidia: "NVIDIA", ibm: "IBM", baidu: "百度", ideogram: "Ideogram", stability: "Stability AI",
  ai21: "AI21 Labs", reka: "Reka AI", amazon: "Amazon", xunfei: "科大讯飞", blackforestlabs: "Black Forest Labs",
};

const aliases = new Map<string, string>([
  ...Object.keys(modelProviderLabels).map(key => [key, key] as const),
  ['anthropic', 'claude'], ['google', 'gemini'], ['xai', 'grok'], ['zai', 'zhipu'],
  ['z-ai', 'zhipu'], ['bytedance', 'doubao'], ['tencent', 'hunyuan'], ['01-ai', 'yi'], ['alibaba', 'qwen'],
  ['bfl', 'blackforestlabs'], ['aws', 'amazon'], ['iflytek', 'xunfei'],
]);
const families: ReadonlyArray<readonly [string, RegExp]> = [
  ['deepseek', /^deepseek(?:\b|v\d|r\d)/], ['zhipu', /^(?:glm|chatglm|codegeex)\d*(?:\b|_)/],
  ['claude', /^claude(?:\b|\d)/], ['gemini', /^(?:gemini|gemma|imagen|veo)\d*(?:\b|_)/],
  ['qwen', /^(?:qwen|qwq|wanx)\d*(?:\b|_)/], ['moonshot', /^(?:kimi|moonshot)\d*(?:\b|_)/],
  ['grok', /^grok\d*\b/], ['openai', /^(?:gpt(?:\b|\d)|codex\b|o[1-9](?:-|$)|dall-e\b|sora\b|whisper\b)/],
  ['minimax', /^(?:minimax|abab|hailuo)\b/], ['mistral', /^(?:mistral|mixtral|codestral|pixtral|devstral|ministral)\b/],
  ['meta', /^llama\d*(?:\b|_)/], ['doubao', /^(?:doubao|seedream|seedance|seed-oss)\b/],
  ['baichuan', /^baichuan\d*\b/], ['hunyuan', /^hunyuan\b/], ['yi', /^yi(?:-|\d|$)/],
  ['cohere', /^(?:command-[ar]|aya)(?:-|$)/], ['perplexity', /^sonar\b/], ['microsoft', /^phi-?\d/],
  ['stepfun', /^step-(?:\d|audio|video)/], ['internlm', /^intern(?:lm|vl)\d*\b/],
  ['nvidia', /^nemotron\b/], ['ibm', /^granite\b/], ['baidu', /^(?:ernie|wenxin)\b/],
  ['ideogram', /^ideogram\b/], ['stability', /^(?:stable-diffusion|stable-image|sdxl)\b/],
  ['ai21', /^jamba\b/], ['reka', /^reka\b/],
  ['amazon', /^(?:nova|titan)\b/], ['xunfei', /^spark(?:desk|[-_]|$)/], ['blackforestlabs', /^flux(?:[.\d-]|$)/],
];
const providerId = (id: string) => aliases.get(id.replace(/^official-/, '').replace(/-(cn|global)$/, ''));

/** The official namespace or explicit manufacturer wins over an inferred model family. */
export function modelProvider(model = "", manufacturer = ""): string {
  const id = model.trim().toLowerCase();
  if (id.startsWith('official-')) return providerId(id.split('/')[0]) || '';
  const tokens = id.split('/');
  const family = tokens.at(-1) || '';
  return providerId(manufacturer.trim().toLowerCase()) || providerId(family) ||
    families.find(([, pattern]) => pattern.test(family))?.[0] ||
    (tokens.length > 1 ? providerId(tokens.at(-2)!) : undefined) || '';
}
export function modelProviderLabel(model = ""): string {
  return modelProviderLabels[modelProvider(model)] || "通用";
}
