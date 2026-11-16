# 后端工程规范

[English](AGENTS.md)

适用于本目录 core、service、web、start 和 desktop。

- SQLite 迁移与存储在 core，服务/网关在 service，受权 Web 代理和静态 UI 在 web，进程编排在 start，原生生命周期/IPC 在 desktop。
- 四个服务 crate 属于根 Cargo 工作区；desktop 使用独立 Cargo 包、lockfile 和 target。
- Rust 命令、桌面注册、Web RPC 映射和 frontend/src/lib/api 同步。
- 保留 actor 归属、角色、模型权限、计费与配额。Bot 集成位于 service/src/bot 和 web/src/bot_proxy.rs。
- 桌面 hook 从 desktop 构建 ../../frontend/out，并准备根 bot 资源，不复制前端源码。
- 结构变更运行 cargo test --workspace，原生运行 cargo check --manifest-path backend/desktop/Cargo.toml；传输/打包另执行根规则的前端、静态和浏览器验证。
- 临时文件使用项目 tmp 的任务子目录，遵守用户备份和子代理规则。
