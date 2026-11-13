import type { BotAppearance } from "../../shared/appearance/preferences";
export interface Bot {
  id: string;
  name: string;
  systemPrompt: string;
  defaultModel: string;
  origin?: string;
  settings: {
    appearance: BotAppearance | null;
    avatar: string;
    permission: string;
    memory: { enabled: boolean; review: boolean; teamWrite: boolean };
    paused: boolean;
    modelProtocol?: "auto" | "chat" | "responses" | "messages";
    modelStreaming?: boolean;
  };
  app?: { catalogId?: string; removed?: { security?: boolean } };
}
export interface Group {
  id: string;
  name: string;
  members: string[];
  running: boolean;
  current: string;
  last?: { id: number; text: string; botId: string; at: number };
}
export interface FileItem {
  path: string;
  name: string;
  gone?: boolean;
}
export interface Activity {
  id: string;
  title?: string;
  label?: string;
  name?: string;
  kind?: string;
  status?: string;
  detail?: string;
  summary?: string;
  input?: string;
  output?: string;
  at?: number;
  ms?: number;
  tokens?: { input?: number; output?: number };
}
export interface ChannelConversation {
  id: string;
  botId: string;
  channel: string;
  peerId: string;
  title: string;
  createdAt: number;
  updatedAt: number;
  lastMessage?: string;
  messageCount: number;
}
export interface Message {
  id: number | string;
  role: string;
  content: string;
  botId?: string;
  conversationId?: string;
  createdAt?: number;
  files?: FileItem[];
  steps?: number;
}
export interface LiveTurn {
  id?: string;
  botId?: string;
  conversationId?: string;
  userText?: string;
  text: string;
  interim?: string[];
  steps?: Activity[];
  files?: FileItem[];
  stopping?: boolean;
}
export interface Approval {
  id: string;
  kind: string;
  prompt?: string;
  summary?: string;
  title?: string;
  detail?: string;
  reason?: string;
  tool?: string;
  questions?: Array<{ question: string; options?: Array<{ label: string }> }>;
}
export interface History {
  messages: Message[];
  pending: Approval[];
  model?: string;
  conversationId?: string;
  live: LiveTurn | LiveTurn[] | null;
  group?: Group;
}
export interface Status {
  username?: string;
  version: string;
  capabilities?: { configure: boolean };
  gateway?: { state: string; lastError?: string };
}
export interface AgentStatus {
  busy?: string[];
  mode?: string;
  available?: boolean;
  error?: string;
}
export interface Task {
  id: string;
  botId: string;
  title: string;
  status: string;
  stage?: { key: string; label: string; group: string };
  summary?: string;
  latest?: string;
  progress?: number | null;
  createdAt?: number;
  updatedAt?: number;
  question?: { text: string; note?: string };
  live?: { runId: string; since?: number; steps?: number; current?: Activity };
}
export interface CatalogEntry {
  id: string;
  name: string | Record<string, string>;
  description?: string | Record<string, string>;
  summary?: string | Record<string, string>;
  instanceId?: string;
}
export interface Route {
  kind:
    | "chat"
    | "group"
    | "tasks"
    | "settings"
    | "discover"
    | "app"
    | "conversation";
  id: string;
}
export interface StreamEvents {
  snapshot: LiveTurn;
  turn: LiveTurn;
  text: { text: string };
  interim: { text: string };
  activity: Activity;
  file: FileItem;
  prompt: { requestId?: string };
  stopping: Record<string, never>;
  error: { message?: string; error?: string };
  turnEnd: { botId?: string };
  done: { conversationId?: string; idle?: boolean };
}
export type StreamHandler = <K extends keyof StreamEvents>(
  name: K,
  data: StreamEvents[K],
) => void;
