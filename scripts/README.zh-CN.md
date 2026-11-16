# 开发与发布工具

[English](README.md) · [构建](../docs/BUILDING.zh-CN.md) · [贡献](../CONTRIBUTING.zh-CN.md)

从仓库根目录运行，保持前端、Rust 工作区、独立桌面包和根 Bot 资源的边界。

| 工具 | 责任 |
| --- | --- |
| `dev-boost.mjs` | 联合开发服务、受权 Web 与 Vite |
| `prepare-boost-bot.mjs` | 准备锁定依赖、Node、原生 SQLite、UI 与工具；验证目标平台兼容 |
| `stage-boost-bot.mjs` | 将已准备 Bot 放入服务包，保留许可 |
| `package-portable.py` | 生成内嵌 Bot 的 Windows 便携 EXE |
| `rebuild.ps1`、`rebuild-linux.sh`、`rebuild-macos.sh` | 平台重建辅助 |
| `check-repository.mjs` | 目录、资源、文档链接与双语覆盖检查 |
| `check-documentation.mjs` | 公共中英配对、语言导航和 README 约定检查 |
| `probe-resource-limits.mjs` | 隔离 mock 负载、RPC 准入、推理故障与加密重开验证 |
| `generate-interface-docs.mjs` | 从当前 RPC 分发生成两种语言的内部接口目录 |
| `check-release-version.mjs` | 检查 tag 与源码版本一致 |
| `sign-release.mjs` | 使用 CI Secret 签署绑定源提交的发行资产清单 |
| `render-release-notes.mjs` | 合并双语说明，将仓库相对链接转换为 Release 正文中的提交链接 |
| `run-service-app.sh` | 构建静态 UI/服务并启动 |

普通 Web 入口为 12000，开发监听见构建指南。系统代理、网络或清理类脚本需先阅读，不属于默认启动动作。

签名私钥只通过发布工作流 Secret 注入，不写入文件或日志。正式构建在目标 OS/架构准备 Bot；不能把另一平台的原生扩展直接打包。临时产物使用任务专属项目 tmp，结束后清理，不能删除其他任务或用户数据。
