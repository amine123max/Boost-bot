# 验证说明

[English](TESTING.md) · [构建](docs/BUILDING.zh-CN.md) · [系统架构](ARCHITECTURE.zh-CN.md)

仓库保留产品源码内的 Rust 单元测试；独立测试目录与专属测试包命令已按用户要求移除。构建通过仅证明该环境下的类型检查/编译，不代表真实上游、操作系统和发布包全部通过。

## 按范围执行

| 范围 | 命令与要求 |
| --- | --- |
| 文档、目录、静态资源 | `node scripts/check-repository.mjs`、`node scripts/check-documentation.mjs` |
| 前端 | `pnpm -C frontend run build` |
| 桌面静态产物 | `pnpm -C frontend run build:desktop` |
| Bot | `npm --prefix bot run build` |
| Rust 工作区 | `cargo test --workspace --locked` |
| Web 传输 | `cargo test -p boost-web --locked` |
| 桌面 Rust | `cargo check --manifest-path backend/desktop/Cargo.toml --locked` |
| 发布版本 | `node scripts/check-release-version.mjs v0.5.1`，替换为待发布 tag |
| 目标部署 | Compose 配置、镜像构建、`nginx -t`、TLS、SSE/WebSocket |

SQLCipher 默认构建包含 vendored OpenSSL；Windows 使用原生 Strawberry Perl 和 C++ 工具链，不能用 MSYS Perl 替代。Bot 加密驱动是原生扩展，须按目标 OS、架构和 Node ABI 准备。

## 运行验收

使用隔离账号、数据库和端口，不能结束用户正在运行的实例。

1. 验证 Web 登录、角色、直接导航、Tauri/Web 两种传输。
2. 验证 Bot 创建、流式会话、停止、历史、渠道消息和审批。
3. 两种 OpenAI 风格端点覆盖 JSON/SSE、tools/tool_calls、上游错误、取消与重复结算。
4. 存储覆盖 WAL 混合读写、只读约束、错密钥、旧库转换、中断/损坏与并发扣费幂等。
5. RPC 覆盖同资源顺序、跨资源隔离、全局屏障、容量拒绝与取消释放。
6. 配图/UI 检查深浅色、键盘访问、窄屏和当前版本对应关系。

## 延迟与容量

先构建当前调试程序，再执行隔离 mock 探针：

```sh
cargo build --locked -p boost-service -p boost-web
node scripts/probe-resource-limits.mjs
```

探针仅管理自身进程和项目 tmp，覆盖 RPC 负载、推理饱和、含工具定义的 JSON/SSE、取消、熔断和加密重开，不使用真实提供商凭据。测量解释见[性能记录](docs/PERFORMANCE.zh-CN.md)。

记录硬件、版本、构建模式、输入体积、并发、持续时间和 mock/真实来源。输出吞吐、P50/P95/P99、成功/拒绝/超时、峰值内存、队列和资源释放状态。分别测管理与推理，验证饱和时有限等待或明确拒绝，而非无限积压。

不将本机 mock 延迟作为真实模型首字节承诺；多服务进程的预算分别计算。限速、累计配额、并发和内存约束须分开验收。

## 输出与清理

临时数据库、脚本、日志、截图和 subprocess TEMP/TMP/TMPDIR 统一放在任务专属 `tmp/`；正式截图保存到 `docs/images/`。任务结束前核实进程退出及路径归属，只删除本任务临时内容。结果明确区分通过、跳过和受阻，并给出未执行命令及原因。
