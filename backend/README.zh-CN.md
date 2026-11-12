# Boost 后端

[English](README.md) · [项目首页](../README.zh-CN.md) · [架构说明](../ARCHITECTURE.md)

Rust 后端负责存储、账号与密钥授权、网关路由、带鉴权的 Web 运行时、进程生命周期和桌面原生能力。本地与部署后的 Web 界面统一使用 **12000** 端口。

| 包 | 职责 | 构建范围 |
| --- | --- | --- |
| `core/` — `boost-core` | SQLite 迁移、存储基础、认证基础与共享类型 | 根 Cargo workspace |
| `service/` — `boost-service` | HTTP/RPC、账号与密钥、用量、协议适配、代理管理及 Bot 托管 | 根 Cargo workspace |
| `web/` — `boost-web` | Web 会话、静态界面、`/api/runtime`、RPC 与带鉴权的 Bot 代理 | 根 Cargo workspace |
| `start/` — `boost-start` | 启动并管理 Service + Web | 根 Cargo workspace |
| `desktop/` — `Boost` | Tauri 窗口、托盘、IPC 与桌面更新 | 独立 Cargo 包 |

## 开发

在仓库根目录执行：

```bash
pnpm -C frontend run build:desktop
cargo build --locked -p boost-service -p boost-web -p boost-start
cargo run --locked -p boost-start
```

访问 `http://localhost:12000`。`web/build.rs` 在默认 `embedded-ui` 功能下嵌入 `frontend/out/`，更新静态前端后需重新构建 Web。

桌面开发与打包：

```bash
cd backend/desktop
cargo tauri dev
cargo tauri build
```

Tauri 包维护独立的 `Cargo.lock` 与 `target/`，构建钩子定位仓库根目录的 `frontend/`、`bot/`，并从根运行时目录打包 Bot。前端源码不复制到后端目录。

## 接口约定

- Rust 实现、Tauri 注册、Web RPC 映射和 `frontend/src/lib/api/` 必须同步。
- 数据库结构变更放在 `core/migrations/`，授权和服务策略在 `service/` 中执行。
- 协议适配变更须覆盖流式、非流式、工具以及两种 OpenAI 风格入口。
- Bot 按身份隔离数据并使用已授权平台密钥，详见[集成边界](../bot/INTEGRATION.md)。
- 存储与监听配置见[运行配置说明](../docs/zh-CN/report/环境变量与运行配置说明.md)。

## 验证

```bash
cargo test --workspace --locked
cargo check --manifest-path backend/desktop/Cargo.toml --locked
node scripts/check-repository.mjs
```

测试使用隔离存储。如果运行中的应用锁定构建产物，应记录受阻原因，勿终止用户正在使用的实例。详见[测试说明](../TESTING.md)和[后端规范](AGENTS.md)。
