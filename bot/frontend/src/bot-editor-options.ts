export const protocolOptions = [
  { value: "auto", label: "自动兼容" },
  { value: "chat", label: "Chat Completions" },
  { value: "responses", label: "Responses" },
  { value: "messages", label: "Messages" },
] as const;
export const permissionOptions = [
  { value: "readonly", label: "只读" },
  { value: "workspace", label: "工作区写入" },
  { value: "full", label: "完全权限" },
] as const;
export interface BotEditorSettings {
  permission: string;
  memory: boolean;
  teamWrite: boolean;
  paused: boolean;
  modelProtocol: string;
  modelStreaming: boolean;
  modelSource: string;
  utilityModel: string;
  taskSlots: number;
  quietHours: { enabled: boolean; from: string; to: string };
  nudge: boolean;
  review: boolean;
  steward: boolean;
  computerUse: {
    enabled: boolean;
    backend: "cua" | "codex";
    approval: "auto" | "ask-input";
  };
  collaboration: boolean;
}
export function editorSettings(bot?: import("./types").Bot): BotEditorSettings {
  const s = bot?.settings;
  return {
    permission: s?.permission || "workspace",
    memory: s?.memory.enabled ?? true,
    teamWrite: s?.memory.teamWrite ?? false,
    paused: s?.paused ?? false,
    modelProtocol: s?.modelProtocol || "auto",
    modelStreaming: s?.modelStreaming ?? true,
    modelSource: s?.modelSource || "default",
    utilityModel: s?.utilityModel || "",
    taskSlots: s?.taskSlots ?? 2,
    quietHours: {
      ...(s?.quietHours || { enabled: true, from: "22:00", to: "08:00" }),
    },
    nudge: s?.nudge ?? true,
    review: s?.memory.review ?? true,
    steward: s?.steward.enabled ?? true,
    computerUse: {
      ...(s?.computerUse || {
        enabled: true,
        backend: "cua",
        approval: "auto",
      }),
    },
    collaboration: s?.collaboration.enabled ?? true,
  };
}
export const approvalOptions = [
  { value: "auto", label: "遵循执行权限" },
  { value: "ask-input", label: "点击与输入前询问" },
] as const;
export const computerOptions = [
  { value: "cua", label: "Cua Driver" },
  { value: "codex", label: "Codex Computer Use" },
] as const;
