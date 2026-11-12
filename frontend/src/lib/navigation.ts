export interface NavigationItem {
  path: string;
  title: string;
  icon: string;
  admin?: boolean;
  desktop?: boolean;
  keywords?: string;
  group?: string;
}
export const navigation: NavigationItem[] = [
  {
    path: "/home/",
    title: "首页",
    icon: "layout-dashboard",
    keywords: "home dashboard 总览",
  },
  {
    path: "/accounts/",
    title: "账号管理",
    icon: "users-round",
    keywords: "accounts 登录 额度",
  },
  {
    path: "/aggregate-api/",
    title: "聚合API",
    icon: "network",
    admin: true,
    keywords: "upstream 上游 连接",
  },
  {
    path: "/apikeys/",
    title: "密钥",
    icon: "key-round",
    keywords: "key token 接入",
  },
  {
    path: "/logs/",
    title: "日志",
    icon: "scroll-text",
    keywords: "logs 请求 错误",
  },
  {
    path: "/tests/",
    title: "测试",
    icon: "flask-conical",
    keywords: "test 网络 延迟",
  },
  { path: "/models/", title: "模型", icon: "boxes", keywords: "model 价格" },
  {
    path: "/settings/",
    title: "设置",
    icon: "settings",
    keywords: "settings 偏好",
  },
];
const settings: [string, string, boolean?, boolean?][] = [
  ["关闭主窗口时", "关闭 退出 最小化 记忆 close exit minimize", false, true],
  ["显示内容", "悬浮窗 余量 进度 TPS 内存 上传 下载 dock monitor"],
  ["主题模式", "主题 颜色 深色 浅色 theme color"],
  ["文字显示", "字体 字号 字重 font typography"],
  ["外观设置", "智能体 动画 bot avatar"],
  ["账号路由", "路由 策略 routing", true],
  ["单账号并发上限", "并发 concurrency", true],
  ["监听范围", "监听 局域网 listen network", true],
  ["本地服务地址", "端口 地址 port address 12580", true, true],
  ["模型映射规则", "模型 映射 转发 model mapping", true],
];
export const searchEntries: NavigationItem[] = [
  ...navigation.map((item) => ({ ...item, group: "导航" })),
  {
    path: "/bot/",
    title: "Boost 智能体",
    icon: "sparkles",
    keywords: "bot chat 对话",
    group: "导航",
  },
  ...settings.map(([title, keywords, admin, desktop]) => ({
    path: `/settings/?focus=${encodeURIComponent(title)}`,
    title,
    keywords,
    admin,
    desktop,
    icon: "settings",
    group: "设置",
  })),
];
export function searchNavigation(
  query: string,
  admin: boolean,
  desktop: boolean,
) {
  const terms = query.trim().toLocaleLowerCase().split(/\s+/).filter(Boolean);
  return searchEntries.filter(
    (item) =>
      (!item.admin || admin) &&
      (!item.desktop || desktop) &&
      terms.every((term) =>
        `${item.title} ${item.keywords || ""} ${item.group}`
          .toLocaleLowerCase()
          .includes(term),
      ),
  );
}
