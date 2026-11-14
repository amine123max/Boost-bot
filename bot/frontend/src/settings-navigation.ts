export const settingsGroups = [
  { id: "workspace", label: "工作台" },
  { id: "integrations", label: "集成" },
  { id: "management", label: "管理" },
] as const;
export const settingsSections = [
  {
    id: "general",
    group: "workspace",
    label: "常规",
    icon: "settings",
    keywords: "默认 模型 推理",
    help: "工作台的默认模型与推理选项；单个智能体可以使用自己的模型。",
  },
  {
    id: "appearance",
    group: "workspace",
    label: "外观",
    icon: "grid",
    keywords: "主题 字体 大小 动画 对话 宽度",
    help: "外观偏好只保存在当前浏览器，不改变其他用户或主应用的设置。",
  },
  {
    id: "channels",
    group: "integrations",
    label: "聊天渠道",
    icon: "chat",
    keywords: "飞书 微信 Telegram Slack Discord",
    help: "连接工作台共用的消息渠道，并选择消息交给哪位智能体处理。",
  },
  {
    id: "connections",
    group: "integrations",
    label: "连接",
    icon: "link",
    keywords: "Notion 飞书 授权 账号",
    help: "管理已授权账号供工具访问；聊天机器人的渠道连接在聊天渠道中配置。",
  },
  {
    id: "network",
    group: "integrations",
    label: "网络与搜索",
    icon: "search",
    keywords: "联网 Tavily Exa SearXNG 密钥",
    help: "工作台共用的联网搜索服务；模型请求仍通过Boost统一网关。",
  },
  {
    id: "data",
    group: "management",
    label: "数据与智能体",
    icon: "database",
    keywords: "删除 人设 安装 数据",
    help: "管理当前工作台的智能体。删除前会再次确认，公共渠道账号会保留。",
  },
  {
    id: "troubleshoot",
    group: "management",
    label: "故障排查",
    icon: "activity",
    keywords: "测试 模型 代理 连接 错误",
    help: "检查模型和工作台连接。模型测试会发起真实请求。",
  },
  {
    id: "about",
    group: "management",
    label: "关于",
    icon: "info",
    keywords: "版本 Boost 运行环境",
    help: "显示实际连接的Boost版本、模型数量和当前角色。",
  },
] as const;
export function settingsSection(id?: string) {
  return (
    settingsSections.find((section) => section.id === id) || settingsSections[0]
  );
}
