// group · zh-CN：群聊（screens/group.js）
export default {
  /** @ 列表里代表所有成员的那一项，写进输入框的也是它（服务端 core/groups.ts 认得） */
  everyone: "所有人",
  placeholder: "发消息，@ 指定谁回答",
  mentionLabel: "选择要 @ 的成员",
  editTitle: "群聊名称和成员",
  empty: "@ 谁，谁回答；没有 @ 时，由上一个回答的机器人接着答。每个机器人用自己的模型、工作区和记忆。",
  /** 机器人被删除后，它留下的回复显示的名字 */
  removedBot: "已删除的机器人",
  working: "{name} 正在回答…",
  noMessages: "还没有消息",
  sheet: {
    newTitle: "新建群聊",
    editTitle: "群聊名称和成员",
    name: "名称",
    namePlaceholder: "不填就用成员的名字",
    members: "成员",
    membersHint: "至少选两个机器人",
    create: "创建",
    save: "保存",
  },
  delete: {
    title: "删除「{name}」？",
    body: "会永久删除这个群聊和里面的消息，无法恢复。机器人和它们的单聊不受影响。",
    confirm: "永久删除",
  },
};
