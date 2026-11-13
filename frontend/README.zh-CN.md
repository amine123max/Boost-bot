# Boost 前端

[English](README.md) · [项目首页](../README.zh-CN.md) · [构建指南](../docs/BUILDING.md)

管理界面使用 Vue 3、TypeScript 与 Vite，为桌面和 Web 共享。正常 Web 入口为 **http://localhost:12000**。原生桌面包独立位于 `backend/desktop/`。

![Boost 管理界面](../docs/images/dashboard-dark.png)

## 目录职责

| 目录 | 职责 |
| --- | --- |
| `src/pages/` | 路由级管理页面 |
| `src/components/` | 控件、表格、对话框和设置组件 |
| `src/composables/` | 界面状态和运行时协调 |
| `src/lib/api/` | 类型化客户端及集中式 Tauri/Web 传输 |
| `src/styles.css` | 全局背景、强调色与文字样式 |

`boost-theme.js` 在首屏恢复外观，智能体头像与 `../bot/shared/appearance/` 共享渲染实现。界面偏好使用版本化设备存储，服务策略由后端管理。

## 构建与验证

从仓库根目录执行：

```bash
pnpm -C frontend install --frozen-lockfile
pnpm -C frontend run build
pnpm -C frontend run build:desktop
```

静态产物输出到 `frontend/out/`，保留各路由的 `index.html`，用于 Web 和 Tauri 直接导航。`build:desktop` 当前复用相同静态构建。单独 Vite 不提供会话、鉴权 RPC 和 Bot 代理。独立测试目录、Playwright 配置及测试命令已删除，请在已登录的运行实例中验证改动，详见[验证说明](../TESTING.md)。

热更新使用 `pnpm -C frontend run dev:full`。开发专用端口与环境配置见[构建指南](../docs/BUILDING.md)，传输或界面变更遵循[工程规范](AGENTS.md)。
