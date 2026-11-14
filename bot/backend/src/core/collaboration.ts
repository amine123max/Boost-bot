import { createHash } from "node:crypto";
import type { Store, BotGroup } from "../store/db.js";
import type { GroupChats } from "./groups.js";

/** Application-local collaboration. External channels and private histories are never copied. */
export class CollaborationService {
  private runner?: Pick<GroupChats, "send">;
  constructor(private store: Store) {}
  bind(runner: Pick<GroupChats, "send">) {
    this.runner = runner;
  }

  tool(
    botId: string,
    conversationId: string,
    op: string,
    input: unknown,
  ): Record<string, unknown> {
    const bot = this.store.getBot(botId);
    const conv = this.store.getConversation(conversationId);
    if (!bot || !conv || conv.botId !== botId)
      throw new Error("协作调用不属于当前智能体会话");
    if (!bot.settings.collaboration.enabled)
      throw new Error("此智能体的自动协作已关闭");
    const args =
      input && typeof input === "object"
        ? (input as Record<string, unknown>)
        : {};
    if (op === "bots")
      return {
        bots: this.store.listBots().map((b) => ({ id: b.id, name: b.name })),
      };
    if (op === "groups")
      return {
        groups: this.store
          .listGroups()
          .filter((g) => g.members.includes(botId))
          .map((g) => this.publicGroup(g)),
      };
    if (op === "history") {
      const group = this.ownedGroup(botId, args.group_id);
      return {
        group: this.publicGroup(group),
        messages: this.store
          .listGroupMessages(group.id, 30)
          .map((m) => ({
            id: m.id,
            botId: m.botId || null,
            role: m.role,
            text: m.content,
          })),
      };
    }
    if (bot.settings.permission === "readonly")
      throw new Error("只读权限不能建群或发送协作消息");
    if (op === "create") return this.create(botId, args);
    if (op === "send") {
      const group = this.ownedGroup(botId, args.group_id);
      const text = this.text(args.text, "消息", 32_000);
      const requestId = this.requestId(args.request_id);
      if (!this.runner) throw new Error("协作调度尚未就绪");
      const key = `collaboration-send:${botId}:${group.id}:${requestId}`;
      const fingerprint = createHash("sha256").update(text).digest("hex");
      const previous = this.store.getKV(key);
      if (previous && previous !== fingerprint)
        throw new Error("同一请求标识不能发送不同的协作消息");
      if (!previous) {
        this.runner.send(group.id, text, `bot:${botId}:${requestId}`, botId);
        this.store.setKV(key, fingerprint);
      }
      return { group: this.publicGroup(group), queued: true };
    }
    throw new Error("未知协作操作");
  }
  private text(value: unknown, label: string, max: number) {
    if (typeof value !== "string" || !value.trim() || value.length > max)
      throw new Error(`${label}不能为空且不能超过 ${max} 字符`);
    return value;
  }
  private requestId(value: unknown) {
    const id = this.text(value, "请求标识", 100).trim();
    if (!/^[A-Za-z0-9_-]+$/.test(id))
      throw new Error("请求标识仅支持字母、数字、短横线与下划线");
    return id;
  }
  private ownedGroup(botId: string, id: unknown) {
    const group = this.store.getGroup(this.text(id, "群编号", 100));
    if (!group || !group.members.includes(botId))
      throw new Error("智能体不是该协作群的成员");
    return group;
  }
  private publicGroup(group: BotGroup) {
    return {
      id: group.id,
      name: group.name,
      members: group.members,
      url: `#/group/${group.id}`,
    };
  }
  private create(botId: string, args: Record<string, unknown>) {
    const name = this.text(args.name, "群名称", 80).trim(),
      requestId = this.requestId(args.request_id);
    if (
      !Array.isArray(args.members) ||
      args.members.some((id) => typeof id !== "string")
    )
      throw new Error("成员必须是智能体编号数组");
    const members = [...new Set([botId, ...(args.members as string[])])];
    if (
      members.length < 2 ||
      members.length > 16 ||
      members.some((id) => !this.store.getBot(id))
    )
      throw new Error("协作群需要 2–16 位有效智能体");
    const task =
      args.task === undefined || args.task === ""
        ? ""
        : this.text(args.task, "协作任务", 32_000);
    const fingerprint = createHash("sha256")
      .update(JSON.stringify({ name, members, task }))
      .digest("hex");
    const key = `collaboration-create:${botId}:${requestId}`;
    const existing = this.store.getKV(key);
    if (existing) {
      const saved = JSON.parse(existing) as { id: string; fingerprint: string; queued?: boolean };
      if (saved.fingerprint !== fingerprint)
        throw new Error("同一请求标识不能创建不同的协作群");
      const group = this.ownedGroup(botId, saved.id);
      if (task && !saved.queued) {
        if (!this.runner) throw new Error('协作调度尚未就绪');
        this.runner.send(group.id, task, `create:${botId}:${requestId}`, botId);
        this.store.setKV(key, JSON.stringify({ ...saved, queued: true }));
      }
      return { group: this.publicGroup(group), created: false, queued: !!task };
    }
    if (task && !this.runner) throw new Error("协作调度尚未就绪");
    const rateKey = `collaboration-rate:${botId}`;
    const now = Date.now();
    const recent = (
      JSON.parse(this.store.getKV(rateKey) || "[]") as number[]
    ).filter((at) => at > now - 600_000);
    if (recent.length >= 10)
      throw new Error("十分钟内最多自动创建 10 个协作群");
    this.store.db.exec("BEGIN IMMEDIATE");
    let group: BotGroup;
    try {
      group = this.store.createGroup(name, members);
      this.store.setKV(key, JSON.stringify({ id: group.id, fingerprint, queued: false }));
      this.store.setKV(rateKey, JSON.stringify([...recent, now]));
      this.store.db.exec("COMMIT");
    } catch (error) {
      this.store.db.exec("ROLLBACK");
      throw error;
    }
    if (task) {
      this.runner!.send(group.id, task, `create:${botId}:${requestId}`, botId);
      this.store.setKV(key, JSON.stringify({ id: group.id, fingerprint, queued: true }));
    }
    return { group: this.publicGroup(group), created: true, queued: !!task };
  }
}
