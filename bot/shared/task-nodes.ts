/** AI groups real execution records; completion percentages are evidence-based. */
export interface TaskNode {
  id: string;
  title: string;
  state: 'pending' | 'working' | 'done' | 'failed';
  progress: number | null;
  stepIds: string[];
  completed: number;
  total: number;
  detail?: string;
  children?: TaskNode[];
}
export interface TaskNodeReference {
  conversationId?: string;
  messageId?: number;
  turnId?: string;
  runId?: string;
  taskId?: string;
  ruleId?: string;
}
export interface TaskNodeAnalysis {
  nodes: TaskNode[];
  analyzedAt: number;
  stale: boolean;
  refreshAfterMs?: number;
}
