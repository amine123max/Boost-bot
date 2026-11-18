import { botIdentity, CHAT_RULES } from "../../core/conversation-policy.js";

/**
 * 代理的系统提示词：DSH 人设（写进补丁，替换 DSH 自带的 coding agent 人设）和每次模型请求现读的机器人段
 * （聊天规则、记忆说明、机器人名字与人设）。改这里的文字要过 test/prompts.unit.test.ts：每段必须有、不能有的句子，
 * 以及系统提示词加工具定义的总长度上限。
 *
 * 聊天规则改编自 dsh-superagent（MIT，DeepSeek）的注意力原则：少占用户的注意力，多给有用的结果。
 */

/** 机器人段在 DSH 系统提示词里的名字与位置：排在 DSH 所有段之后，人设改了也不动前面的部分（前缀缓存） */
export const BOT_SECTION = "amb:bot";
export const BOT_SECTION_ORDER = 20_000;

/**
 * 补丁里 system-prompt 的 personaPrefix，替换 DSH 的 "You are a coding agent powered by the {{model}} model."。
 * {{model}} 由 DSH 填成当前模型；同时关掉 includeHarnessIdentity（"You are an AI agent powered by DeepSeek Harness."）。
 * computerUse：本机器人开着电脑操作且可用（换设置会重启代理进程，补丁跟着重写）。
 */
export function agentPersona(o: { computerUse?: boolean } = {}): string {
  return [
    "你是 Boost 中由 {{model}} 驱动的助手。根据当前会话和用户目标选择直接回答、分析或执行。",
    `只使用当前会话实际提供且获授权的工具${o.computerUse ? "，包括可用的桌面操作" : ""}。需要执行时先了解现状，完成后用合适的方法验证。未执行或未验证的事项如实说明。`,
  ].join("\n");
}

/** 长期记忆的用法（只在本机器人开着长期记忆时放进系统提示词；快照在每段对话的第一条消息里） */
export const MEMORY_GUIDE = [
  "# 长期记忆",
  "你有跨对话的长期记忆，用 remember / forget / recall 三个工具管理：",
  "- 用户明确让你记住、或透露了以后用得上的稳定信息（偏好、身份、约定）时，用 remember 记下，一条一句；",
  "- 信息过时或用户要求忘记时，用 forget；",
  "- 在回答「不知道」「不记得」之前，先用 recall 查一下；",
  "- 不要把密码、密钥、令牌、证件号写进记忆。",
  "每段对话的第一条消息附有当时的记忆快照；之后记下或忘掉的内容用 recall 查最新的。",
].join("\n");

export interface BotPromptInput {
  /** 机器人名称 */
  name: string;
  /** 用户写的人设 / 系统提示词 */
  persona: string;
  /** 本机器人开着长期记忆 */
  memory: boolean;
  /** 用户的其他机器人：用户问起时它要答得上来，也能指路 */
  others?: Array<{ name: string; persona: string }>;
}

/** 其他机器人的名单和怎么切换。只有一个机器人时不写，免得系统提示词多一段没用的话 */
export function botTeam(others: Array<{ name: string; persona: string }>): string {
  if (!others.length) return "";
  const lines = others.map((o) => {
    const blurb = o.persona.trim().split("\n")[0].slice(0, 60);
    return `- ${o.name.trim()}${blurb ? `：${blurb}` : ""}`;
  });
  return [
    "# 其他机器人",
    "用户还有这些机器人，各有各的人设和记忆，和你共用用户授权的账号：",
    ...lines,
    "用户问有哪些机器人、某件事该找谁、怎么换时，照这里回答。在微信、飞书这些聊天软件里，发一次 /bot 名字 就换过去了，之后这个会话一直和它聊，不用每句都带；只发 /bot 能看到列表。在 Boost 的窗口里，在左侧选机器人。你不能替用户切换。",
  ].join("\n");
}

/**
 * 机器人段的全文（宿主写进文件，amb-prompt 插件每次模型请求现读）。只放每个机器人固定的内容，
 * 同一机器人的所有会话共用一份系统提示词；按会话变化的（渠道、记忆快照、交接便条）放在每段的第一条消息里。
 * 顺序按变化频率从低到高：聊天规则（随应用升级）→ 记忆说明（随开关）→ 其他机器人（增删或改名时）→ 名字与人设（用户随时改）。
 */
export function botPrompt(o: BotPromptInput): string {
  return [CHAT_RULES, o.memory ? MEMORY_GUIDE : "", botTeam(o.others ?? []), botIdentity(o.name, o.persona)].filter(Boolean).join("\n\n");
}
