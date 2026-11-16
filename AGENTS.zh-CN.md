# 仓库工程规范

[English](AGENTS.md)

适用于 Boost 全仓库。前端遵循 frontend/AGENTS.md，服务与桌面遵循 backend/AGENTS.md。本文件为对应中文说明，不改变用户在会话中给出的备份、临时文件和子代理规则。

## 项目结构

| 目录 | 职责 |
| --- | --- |
| frontend/src | Vue 页面、组件、composable、类型化客户端、运行时与界面状态 |
| backend/desktop | Tauri v2 壳、生命周期、窗口/托盘、原生命令和桌面 RPC 客户端 |
| backend/core | SQLite 迁移、存储、认证基础、用量与账号结构 |
| backend/service | HTTP/RPC、网关、协议、账号/key/用量、插件、设置及运行同步 |
| backend/web | Web 会话、静态 UI、运行时/RPC 代理 |
| backend/start | 联合启动 Service 和 Web |
| scripts、docker、.github | 构建、发布、探针、容器与 CI 自动化 |
| bot | Node 智能体、Bot UI、渠道、工具与内置技能 |
| nginx | 反向代理配置和部署说明 |

## 所有权

界面在 frontend，原生壳在 desktop，领域/网关在 service，schema 与可复用存储在 core。大型入口作为遗留面，新逻辑放入聚焦模块。非任务所需不混入发布脚本和产品行为变更。

## 命令与传输同步

前端通过 frontend/src/lib/api 的类型化封装调用后端。桌面使用集中 invoke/invokeFirst，不能原始 fetch 桌面命令。需要服务地址的命令使用 withAddr；纯应用壳命令可省略。

Web fallback 仅沿现有 transport、Web 映射、rpc-http 和 fetchWithRetry。新增/重命名同步 Rust、Tauri 注册、服务 RPC/Web 映射及前端封装，保留 underscore 命令与 camelCase RPC 约定。

## 设置与持久化

新设置定义默认值、存储、运行同步与 UI/API 暴露，先明确桌面/服务/Web 的影响。新 BOOST 环境变量更新文档，除启动所需外不能绕过现有设置。schema 迁移放 core/migrations，非平凡行为有存储回归。

## 前端、桌面与网关

前端是静态输出，保持 Vite 路径和每路由 index.html；完整 Web 运行通过 boost-web，普通 Vite 不是服务模式。网关/协议变更局限 gateway/http，除非确有共享状态需求。

协议变更覆盖 Responses、Chat Completions、SSE、JSON、tools/tool_calls。优先类型化结构和存储助手。Web 访问、角色、计费模式与 key 归属属于安全边界，不能为 UI 便利削弱。

## 验证

| 范围 | 必须检查 |
| --- | --- |
| 前端 | pnpm -C frontend run build，并在运行应用验证行为 |
| 桌面/静态导出 | pnpm -C frontend run build:desktop |
| Rust/服务 | cargo test --workspace；明确隔离时可用最窄相关包 |
| Web/传输 | cargo test -p boost-web 及可用运行探针 |
| 网关/协议 | 两端点、流式/非流式、工具回归 |

独立测试目录和专用包命令已按用户要求移除。无法运行的检查记录准确命令及原因。

## 文档

README、语言目录和模块文档同步用户可见行为、部署模式、环境配置与构建命令。根治理文件说明仓库边界，前端专属规则保留在 frontend/AGENTS.md。
