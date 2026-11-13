# 构建与运行验收

整个仓库的独立测试目录、测试运行器和失效命令已删除；源码内的 Rust 单元测试保留。请从仓库根目录执行 `pnpm -C frontend run build:desktop`、`npm --prefix bot run build` 与 `cargo test --workspace --locked`。完整检查、环境要求和运行验收见[仓库验证指南](../../TESTING.md)。在隔离且已登录的实例中检查实际行为，构建通过不能代替真实模型、渠道、nginx 或安装包验收。
