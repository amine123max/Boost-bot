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
    modelSource?: string;
    reasoningEffort?: "auto" | "low" | "medium" | "high";
    steward: { enabled: boolean };
    computerUse: { enabled: boolean; backend: "cua" | "codex"; approval: "auto" | "ask-input" };
    utilityModel: string;
    taskSlots: number;
    quietHours: { enabled: boolean; from: string; to: string };
    nudge: boolean;
    collaboration: { enabled: boolean };
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
  cut?: boolean;
  detail?: string;
  summary?: string;
  input?: string;
  output?: string;
  at?: number;
  ms?: number;
  section?: number;
  fileChange?: { key: string; name: string; operation: 'create' | 'update'; added?: number; removed?: number; diff?: { kind: 'context' | 'add' | 'remove'; text: string }[] };
  tokens?: { input?: number; output?: number };
  modelKey?: string;
  commandPreview?: string;
  shellOutput?: string;
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
  elapsedMs?: number;
  hasExecution?: boolean;
  backgroundNotice?: boolean;
  interim?: string[];
}
export interface LiveTurn {
  id?: string;
  botId?: string;
  conversationId?: string;
  userText?: string;
  userMessageId?: number;
  startedAt?: number;
  text: string;
  interim?: string[];
  steps?: Activity[];
  files?: FileItem[];
  stopping?: boolean;
}
export interface Approval {
  id: string;
  taskId?: string;
  taskTitle?: string;
  kind: string;
  prompt?: string;
  summary?: string;
  title?: string;
  detail?: string;
  reason?: string;
  tool?: string;
  questions?: Array<{ id: string; question: string; detail?: string; multiSelect?: boolean; options?: Array<{ label: string; description?: string }> }>;
}
export type QuestionAnswer = { id: string; selected: string[]; custom?: string };
export interface QueuedMessage {
  id: string;
  text: string;
  state: 'queued' | 'guiding' | 'failed';
  error?: string;
}
export interface History {
  messages: Message[];
  pending: Approval[];
  model?: string;
  conversationId?: string;
  live: LiveTurn | LiveTurn[] | null;
  group?: Group;
  queued?: QueuedMessage[];
  tasks?: Task[];
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
    | "catalog"
    | "app"
    | "conversation";
  id: string;
  openChat?: boolean;
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
