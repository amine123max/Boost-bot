# 贡献约定

[English](CONTRIBUTING.md) · [系统架构](ARCHITECTURE.zh-CN.md) · [验证](TESTING.zh-CN.md)

## 分支与改动范围

从当前 `main` 创建聚焦的工作分支；代理创建的分支默认使用 `codex/<主题>`，用户另有指定时遵循用户要求。产品修复、无关格式化和发布修改分别组织，属于同一验收交付时可合并。不自动创建备份分支、提交或 stash。

| 变更 | 责任目录 |
| --- | --- |
| 管理界面与类型化客户端 | `frontend/src/` |
| schema 与持久化 | `backend/core/` |
| 网关与领域策略 | `backend/service/` |
| Web 会话与受权代理 | `backend/web/` |
| 原生生命周期与 IPC | `backend/desktop/` |
| 智能体、工具和 Bot UI | `bot/` |
| 打包与反向代理 | `scripts/`、`docker/`、`nginx/`、`.github/` |

先阅读[仓库规范](AGENTS.md)和对应的[前端](frontend/AGENTS.md)/[后端](backend/AGENTS.md)规则。保留服务端授权、归属、计费和模型访问边界。

## 本地验证

按[构建指南](docs/BUILDING.zh-CN.md)安装工具链与原生依赖。提交 PR 前按范围执行：

```sh
node scripts/check-repository.mjs
pnpm -C frontend run build
cargo test --workspace --locked
```

Bot 另运行 `npm --prefix bot run build`，原生变更另运行 `cargo check --manifest-path backend/desktop/Cargo.toml --locked`。传输/UI 使用真实 Boost Web 验收；Vite 预览不能验证会话与服务路由。

记录准确命令、结果、平台、数据和跳过项目。临时内容及子进程 TEMP/TMP/TMPDIR 放入任务专属 `tmp/`，进程结束后只清理该任务的产物。

## 提交与 PR

提交标题用动作描述最终行为，可使用 `fix:`、`feat:`、`docs:` 前缀。PR 写清触发条件、前后行为、影响边界和验证；重要界面变更附截图，调度变更附延迟和过载证据。不得包含真实凭据或用户数据。

新增命令同步 Rust、Tauri 注册、Web 映射与前端封装。新设置定义默认值、持久化及热更新/重启语义。schema 使用版本化迁移，并覆盖有价值的存储回归。

## 文档与审查

公开指南同步维护英文和简体中文。README 承载项目定位、技术范围、架构图、配图、启动和文档入口；协议清单与详细运维约定放入专题。实现入口、默认值和发布描述须能追溯到当前代码或验证记录。

仓库维护者负责审查和合并；本文不虚构其他治理角色或分支保护。当前[工作流](.github/workflows/release-all.yml)用于发布构建，不代表 PR CI。漏洞按[安全说明](SECURITY.zh-CN.md)报告。

## 发布门槛

核对版本、许可、第三方声明、双语发布说明、构建/运行检查与资产校验值。替换已发布标签和资产需要明确授权，不能作为例行清理。
